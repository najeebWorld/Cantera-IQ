import argparse
import json
from pathlib import Path

import duckdb

from cantera.store import DEFAULT_DB, ROOT, build_database, dataset_summary, player_table
from cantera.providers import Fifa2022BirthDates, SourceCache, StatsBombOpenData
from cantera.report import export_sample


def main() -> None:
    parser = argparse.ArgumentParser(description="Cantera IQ stage-one data prototype")
    parser.add_argument("command", choices=["ingest", "sample", "coverage", "export"])
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--output", type=Path, default=ROOT / "reports")
    arguments = parser.parse_args()
    if arguments.command == "ingest":
        cache = SourceCache(ROOT / "data" / "cache")
        result = build_database(arguments.db, StatsBombOpenData(cache), Fifa2022BirthDates(cache), cache,
                                expected_matches=64)
    else:
        with duckdb.connect(str(arguments.db), read_only=True) as connection:
            if arguments.command == "export":
                result = export_sample(connection, arguments.output)
            else:
                result = player_table(connection) if arguments.command == "sample" else dataset_summary(connection)
    print(json.dumps(result, default=str, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()