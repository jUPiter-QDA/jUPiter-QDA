"""Tests for the guarded startup migrations: legacy SQLite databases created
before the LLM columns existed must be upgraded in place (create_all never
adds columns to existing tables)."""
from sqlalchemy import create_engine, text

from app.database import Base
from app.db_migrations import run_startup_migrations
from app.llm_defaults import (DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT,
                              DEFAULT_TEMPERATURE)


def _legacy_engine():
    """An engine with hand-built 'legacy' tables lacking the new columns."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE projects (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL,"
            " description TEXT, local_path VARCHAR, created_at DATETIME,"
            " last_accessed DATETIME)"))
        conn.execute(text("INSERT INTO projects (id, name) VALUES (1, 'Old')"))
        conn.execute(text(
            "CREATE TABLE codes (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL,"
            " color VARCHAR NOT NULL, project_id INTEGER NOT NULL,"
            " parent_id INTEGER, created_at DATETIME, order_index INTEGER)"))
        conn.execute(text(
            "INSERT INTO codes (id, name, color, project_id) VALUES (1, 'Old', '#FFF', 1)"))
        conn.execute(text(
            "CREATE TABLE llm_settings (id INTEGER PRIMARY KEY, api_url TEXT NOT NULL,"
            " api_key TEXT NOT NULL, model_name VARCHAR NOT NULL)"))
        conn.execute(text(
            "INSERT INTO llm_settings (id, api_url, api_key, model_name)"
            " VALUES (1, 'https://old/v1', 'sk-old', 'old-model')"))
    return engine


def _columns(conn, table):
    return {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).all()}


def test_migration_adds_and_backfills_legacy_tables():
    engine = _legacy_engine()
    run_startup_migrations(engine)

    with engine.connect() as conn:
        code_cols = _columns(conn, "codes")
        assert "ai_suggested" in code_cols
        assert conn.execute(text("SELECT ai_suggested FROM codes")).scalar() == 0

        project_cols = _columns(conn, "projects")
        assert "llm_system_prompt" in project_cols
        assert "llm_user_prompt" in project_cols
        system, user = conn.execute(text(
            "SELECT llm_system_prompt, llm_user_prompt FROM projects")).one()
        assert system == DEFAULT_SYSTEM_PROMPT
        assert user == DEFAULT_USER_PROMPT

        assert "temperature" in _columns(conn, "llm_settings")
        # the ALTER's column default backfills pre-existing rows
        assert conn.execute(text(
            "SELECT temperature FROM llm_settings")).scalar() == DEFAULT_TEMPERATURE


def test_migration_is_idempotent():
    engine = _legacy_engine()
    run_startup_migrations(engine)
    run_startup_migrations(engine)  # second run must be a no-op, not an error

    with engine.connect() as conn:
        assert "ai_suggested" in _columns(conn, "codes")
        assert "llm_user_prompt" in _columns(conn, "projects")
        assert "temperature" in _columns(conn, "llm_settings")


def test_migration_is_noop_on_fresh_schema():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    run_startup_migrations(engine)  # must not error or alter anything

    # Insert through the ORM so the model-level column defaults fire — raw SQL
    # would bypass them and land NULL (the endpoints fall back to defaults then).
    from sqlalchemy.orm import sessionmaker
    import app.models as models
    session = sessionmaker(bind=engine)()
    session.add(models.Project(name="Fresh"))
    session.commit()

    system, user = session.execute(text(
        "SELECT llm_system_prompt, llm_user_prompt FROM projects")).one()
    assert system == DEFAULT_SYSTEM_PROMPT
    assert user == DEFAULT_USER_PROMPT


def test_migration_tolerates_empty_database():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    run_startup_migrations(engine)  # no tables at all — must not error