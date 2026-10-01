import duckdb
import pytest
from fastapi.testclient import TestClient

from cantera.api import app
from cantera.store import SCHEMA


@pytest.fixture
def client(tmp_path, monkeypatch):
    database_path = tmp_path / "api.duckdb"
    with duckdb.connect(str(database_path)) as database:
        database.execute(SCHEMA.read_text())
    monkeypatch.setenv("CANTERA_DB", str(database_path))
    with TestClient(app) as test_client:
        yield test_client


def test_api_returns_database_values_and_empty_dataset(client):
    response = client.get("/api/players")
    assert response.status_code == 200
    assert response.json()["players"] == []
    assert response.json()["dataset"]["players"] == 0


def test_api_validates_limits_and_language(client):
    assert client.get("/api/players?limit=0").status_code == 422
    assert client.get("/api/players?max_age=23;DROP%20TABLE%20players").status_code == 422
    assert client.get("/api/methodology?lang=fr").status_code == 422


def test_bilingual_metric_definitions(client):
    english = client.get("/api/methodology?lang=en").json()
    spanish = client.get("/api/methodology?lang=es").json()
    assert english["metrics"].keys() == spanish["metrics"].keys()
    assert english["metrics"]["npxg"] != spanish["metrics"]["npxg"]
    assert english["settings"]["min_minutes"] == 180


def test_missing_database_returns_503(tmp_path, monkeypatch):
    monkeypatch.setenv("CANTERA_DB", str(tmp_path / "missing.duckdb"))
    with TestClient(app) as client:
        assert client.get("/api/players").status_code == 503


def test_search_returns_empty_database_result_and_explicit_defaults(client):
    response = client.post("/api/search", json={"query": "Find wingers under 23"})
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "ok"
    assert result["players"] == []
    assert result["interpretation"]["max_age"] == 22
    assert result["effective_min_minutes"] == 180
    assert result["default_minutes_applied"] is True


def test_search_asks_for_clarification_in_requested_language(client):
    result = client.post("/api/search", json={"query": "Busca los mejores jugadores", "lang": "es"}).json()
    assert result["status"] == "needs_clarification"
    assert result["players"] == []
    assert result["message"].startswith("No pude")


@pytest.mark.parametrize("payload", [
    {"query": ""}, {"query": "x" * 501}, {"query": "Find players", "lang": "he"},
    {"query": "Find players", "sql": "SELECT * FROM players"},
])
def test_search_rejects_invalid_payloads(client, payload):
    assert client.post("/api/search", json=payload).status_code == 422