"""
database.py - Módulo de conexión y consultas a SQLite para CoopTech Tulcán.
"""

import sqlite3
import os
from contextlib import contextmanager

DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DB_PATH = os.path.join(DB_DIR, "cooptech.db")

os.makedirs(DB_DIR, exist_ok=True)


def get_db_path() -> str:
    """Retorna la ruta absoluta de la base de datos."""
    return DB_PATH


# Configurar WAL de forma persistente y segura en un solo paso
def init_db_journal_mode():
    """Configura el modo WAL en la base de datos una sola vez para evitar bloqueos."""
    try:
        os.makedirs(DB_DIR, exist_ok=True)
        # Usamos timeout largo para evitar bloqueos
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.close()
    except Exception as e:
        print(f"Advertencia: No se pudo configurar PRAGMA journal_mode=WAL: {e}")

# Inicializamos el modo de base de datos una única vez al importar el módulo
init_db_journal_mode()


@contextmanager
def get_connection():
    """Context manager para obtener una conexión a SQLite con row_factory."""
    # Añadimos un timeout de 30 segundos para evitar colisiones en escrituras/lecturas
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
    finally:
        conn.close()


def execute_query(query: str, params: tuple = ()) -> list[dict]:
    """Ejecuta un SELECT y retorna lista de diccionarios."""
    with get_connection() as conn:
        cursor = conn.execute(query, params)
        columns = [desc[0] for desc in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def execute_query_one(query: str, params: tuple = ()) -> dict | None:
    """Ejecuta un SELECT y retorna un solo resultado como diccionario."""
    with get_connection() as conn:
        cursor = conn.execute(query, params)
        row = cursor.fetchone()
        if row is None:
            return None
        columns = [desc[0] for desc in cursor.description]
        return dict(zip(columns, row))


def execute_write(query: str, params: tuple = ()) -> int:
    """Ejecuta INSERT/UPDATE/DELETE y retorna lastrowid."""
    with get_connection() as conn:
        cursor = conn.execute(query, params)
        conn.commit()
        return cursor.lastrowid


def execute_many(query: str, params_list: list[tuple]) -> None:
    """Ejecuta múltiples INSERT/UPDATE/DELETE."""
    with get_connection() as conn:
        conn.executemany(query, params_list)
        conn.commit()


def db_exists() -> bool:
    """Verifica si la base de datos ya existe y tiene datos."""
    if not os.path.exists(DB_PATH):
        return False
    try:
        result = execute_query_one("SELECT COUNT(*) as cnt FROM socios")
        return result is not None and result["cnt"] > 0
    except Exception:
        return False


def get_table_count(table: str) -> int:
    """Retorna el conteo de registros de una tabla."""
    result = execute_query_one(f"SELECT COUNT(*) as cnt FROM {table}")
    return result["cnt"] if result else 0
