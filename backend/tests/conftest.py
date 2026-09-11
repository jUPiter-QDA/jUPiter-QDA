"""Shared fixtures for the jUPiter-QDA backend test suite.

CRITICAL ORDERING RULE
----------------------
`app.database` reads JUPITER_DATA_DIR *at import time* (creating the data
directory and a file-backed engine), and `app.main` runs
`Base.metadata.create_all(bind=engine)` *at import time*. Nothing under
`app.*` may be imported before the env var is set below. pytest imports this
conftest before importing any test module, so module-top assignment is
sufficient and safe.

STALE-SESSION RULE
-----------------
Repositories commit on the *request's* session, not the test's. After a
client mutation, the test's `db` session holds stale identity-map objects:
call `db.expire_all()`, assert through a fresh `session_factory()` session,
or assert through follow-up GETs.
"""
import atexit
import os
import shutil
import tempfile

_TMP_DATA_DIR = tempfile.mkdtemp(prefix="jupiter-tests-data-")
os.environ["JUPITER_DATA_DIR"] = _TMP_DATA_DIR
atexit.register(lambda: shutil.rmtree(_TMP_DATA_DIR, ignore_errors=True))

import pytest                                          # noqa: E402
from fastapi.testclient import TestClient              # noqa: E402
from sqlalchemy import create_engine                   # noqa: E402
from sqlalchemy.orm import sessionmaker                # noqa: E402
from sqlalchemy.pool import StaticPool                 # noqa: E402

import app.models as models                            # noqa: E402
from app.database import Base, get_db                  # noqa: E402
from app.main import app as jupiter_app                # noqa: E402

from tests.helpers import (                            # noqa: E402
    make_code,
    make_document,
    make_folder,
    make_memo,
    make_project,
    make_segment,
)


@pytest.fixture()
def db_engine():
    """Fresh in-memory SQLite per test.

    StaticPool pins ONE connection so all sessions (test seed session + one
    session per request) share the same :memory: database — without it every
    new connection sees an empty db. check_same_thread=False because
    TestClient serves sync endpoints from a worker thread. The module-level
    WAL pragma listener does not apply here (it is bound to the production
    engine only).
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    engine.dispose()  # :memory: db dies with the engine — no drop_all needed


@pytest.fixture()
def session_factory(db_engine):
    return sessionmaker(bind=db_engine, autocommit=False, autoflush=False)


@pytest.fixture()
def db(session_factory):
    """Session the *test* uses for seeding and assertions."""
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_engine, session_factory):
    """TestClient with get_db overridden.

    FastAPI matches dependency overrides by the original callable, so this
    ONE override of app.database.get_db propagates everywhere: to every
    get_*_repo dependency (they all wrap Depends(get_db)) and to every
    endpoint using Depends(get_db) directly (search, exports, memos list,
    audio transcribe, REFI import/export). Each request gets its own session
    from the same factory, mirroring production.
    """
    def override_get_db():
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    jupiter_app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(jupiter_app)
    finally:
        jupiter_app.dependency_overrides.clear()


# --- entity fixtures: thin wrappers over tests.helpers ---------------------
# Tests needing extra entities call the make_* helpers directly with `db`.

@pytest.fixture()
def project(db):
    return make_project(db)


@pytest.fixture()
def document(project, db):
    return make_document(db, project, content="alpha beta gamma alpha")


@pytest.fixture()
def code(project, db):
    return make_code(db, project, name="Theme")


@pytest.fixture()
def segment(document, code, db):
    return make_segment(db, document, code, start_char=0, end_char=5,
                        content="alpha")