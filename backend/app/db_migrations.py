"""Guarded startup migrations for SQLite databases created before a feature shipped.

There is no Alembic in this project — `Base.metadata.create_all` only creates
missing tables, never new columns on existing ones. Any column added to an
existing model must be handled here with a check-then-ALTER so live databases
(dev DBs in backend/, user data dirs in packaged builds) upgrade in place.
"""

from sqlalchemy import text

from app.llm_defaults import DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT


def _table_names(conn) -> set:
    rows = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).all()
    return {row[0] for row in rows}


def _column_names(conn, table: str) -> set:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).all()
    return {row[1] for row in rows}


def run_startup_migrations(engine) -> None:
    """Idempotent: only touches tables that exist and are missing new columns.

    Fresh databases already have every column from create_all, so every
    branch below is a no-op there.
    """
    with engine.begin() as conn:
        tables = _table_names(conn)
        if "codes" in tables and "ai_suggested" not in _column_names(conn, "codes"):
            conn.execute(text(
                "ALTER TABLE codes ADD COLUMN ai_suggested BOOLEAN NOT NULL DEFAULT 0"
            ))
        if "projects" in tables:
            cols = _column_names(conn, "projects")
            if "llm_system_prompt" not in cols:
                conn.execute(text("ALTER TABLE projects ADD COLUMN llm_system_prompt TEXT"))
                conn.execute(text(
                    "UPDATE projects SET llm_system_prompt = :v"
                ), {"v": DEFAULT_SYSTEM_PROMPT})
            if "llm_user_prompt" not in cols:
                conn.execute(text("ALTER TABLE projects ADD COLUMN llm_user_prompt TEXT"))
                conn.execute(text(
                    "UPDATE projects SET llm_user_prompt = :v"
                ), {"v": DEFAULT_USER_PROMPT})
        if "llm_settings" in tables and "temperature" not in _column_names(conn, "llm_settings"):
            # The column default backfills existing rows, so no UPDATE is needed.
            conn.execute(text(
                "ALTER TABLE llm_settings ADD COLUMN temperature FLOAT NOT NULL DEFAULT 0.2"
            ))