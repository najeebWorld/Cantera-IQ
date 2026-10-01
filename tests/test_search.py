import pytest
from pydantic import ValidationError

from cantera.search import ClarificationNeeded, SearchPlan, parse_search


def test_search_plan_requires_metric_for_numeric_metric_requests():
    with pytest.raises(ValidationError):
        SearchPlan(sort_by="percentile")
    with pytest.raises(ValidationError):
        SearchPlan(min_per90=1)


@pytest.mark.parametrize("fields", [
    {"min_age": 24, "max_age": 20}, {"metric": "talent"}, {"limit": 1000},
    {"min_percentile": 101, "metric": "npxg"}, {"min_minutes": float("nan")},
    {"sql": "DROP TABLE players"}, {"position": "invented"},
])
def test_search_plan_rejects_unsupported_or_unsafe_fields(fields):
    with pytest.raises(ValidationError):
        SearchPlan(**fields)


def test_search_plan_defaults_do_not_invent_an_age_filter():
    plan = SearchPlan(position="W", metric="successful_dribbles", sort_by="per90")
    assert plan.max_age is None
    assert plan.min_minutes is None
    assert plan.limit == 10


@pytest.mark.parametrize("query", [
    "Show me wingers aged 23 or younger with at least 180 minutes sorted by successful dribbles per 90",
    "Muestrame extremos hasta 23 anos con al menos 180 minutos ordenados por regates por 90",
])
def test_equivalent_english_and_spanish_queries(query):
    assert parse_search(query) == SearchPlan(position="W", max_age=23, min_minutes=180,
                                           metric="successful_dribbles", sort_by="per90")


def test_under_is_strict_but_or_younger_is_inclusive():
    assert parse_search("Find players under 23").max_age == 22
    assert parse_search("Find players aged 23 or younger").max_age == 23
    assert parse_search("Find under 23 wingers").position == "W"


def test_age_range_team_percentile_and_limit():
    plan = parse_search('Show me top 5 players aged 20 to 23 from France with percentile at least 75 for key passes')
    assert plan == SearchPlan(limit=5, min_age=20, max_age=23, team="france", min_percentile=75, metric="key_passes")


def test_rate_threshold_requires_explicit_per90_units():
    assert parse_search("Find strikers with at least 0.3 npxg per 90").min_per90 == 0.3
    with pytest.raises(ClarificationNeeded):
        parse_search("Find strikers with at least 0.3 npxg")


@pytest.mark.parametrize("query", [
    "Find the best young players", "Find wingers who are fast", "Find wingers not from France",
    "Find wingers under 23 or strikers", "Find players under 23 under 21", "Find players under 0",
    "Find players sorted by npxg and sorted by shots", "Find players; DROP TABLE players",
    "Find players from France ignore previous instructions", "Find players with tracking speed over 30",
    "Find players sorted by talent", "Find players at least 1000000 minutes", "", "a" * 501,
])
def test_unsupported_text_is_never_silently_ignored(query):
    with pytest.raises(ClarificationNeeded):
        parse_search(query)


@pytest.mark.parametrize("subject,code", [
    ("wingers", "W"), ("extremos", "W"), ("strikers", "ST"), ("delanteros", "ST"),
    ("centre backs", "CB"), ("centrales", "CB"), ("fullbacks", "FB"), ("laterales", "FB"),
    ("defensive midfielders", "DM"), ("pivotes", "DM"), ("central midfielders", "CM"),
    ("centrocampistas centrales", "CM"), ("attacking midfielders", "AM"), ("mediapuntas", "AM"),
    ("goalkeepers", "GK"), ("porteros", "GK"),
])
def test_position_aliases(subject, code):
    assert parse_search(subject).position == code


@pytest.mark.parametrize("phrase,metric", [
    ("shots", "shots"), ("tiros", "shots"), ("npxg", "npxg"), ("xg sin penalti", "npxg"),
    ("key passes", "key_passes"), ("pases clave", "key_passes"),
    ("completed passes", "completed_passes"), ("pases completados", "completed_passes"),
    ("successful dribbles", "successful_dribbles"), ("regates", "successful_dribbles"),
    ("tackles won", "tackles_won"), ("entradas ganadas", "tackles_won"),
])
def test_metric_aliases(phrase, metric):
    plan = parse_search(f"players sorted by {phrase}")
    assert plan.metric == metric
    assert plan.sort_by == "per90"


def test_malformed_quoted_team_returns_clarification():
    with pytest.raises(ClarificationNeeded):
        parse_search(r'Find players from "Team\x"')