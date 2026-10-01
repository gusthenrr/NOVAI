"""Aplica o esquema mínimo antes de iniciar o backend no Railway."""

import os
from pathlib import Path

import psycopg2


def database_url() -> str:
    value = os.environ.get("DATABASE_URL", "").strip()
    if not value:
        raise RuntimeError("DATABASE_URL não definido")
    if value.startswith("postgres://"):
        value = "postgresql://" + value[len("postgres://"):]
    return value


def main() -> None:
    schema_path = Path(__file__).resolve().parent.parent / "database" / "init_token_only.sql"
    schema = schema_path.read_text(encoding="utf-8")
    with psycopg2.connect(database_url(), connect_timeout=15) as connection:
        with connection.cursor() as cursor:
            cursor.execute(schema)
    print("Esquema token-only verificado com sucesso.")


if __name__ == "__main__":
    main()
