"""
database.py - Módulo de conexión y consultas a SQLite y PostgreSQL (Supabase) para CoopTech Tulcán.
"""

import sqlite3
import os
import re
from contextlib import contextmanager
from datetime import date, datetime
import psycopg2
import psycopg2.extras

DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DB_PATH = os.path.join(DB_DIR, "cooptech.db")
DB_URL = os.environ.get("DATABASE_URL")

# Tope regulatorio/operativo para scoring (evita atrasos irreales de años)
MAX_DIAS_ATRASO = 100
# Tope para mostrar mora en perfil / factores (no inflar días ante el asesor)
MAX_DIAS_MORA_DISPLAY = 31
FECHA_CORTE = date(2026, 5, 21)
SQL_DIAS_ATRASO_CAP = f"MIN(COALESCE(p.dias_atraso, 0), {MAX_DIAS_ATRASO})"

os.makedirs(DB_DIR, exist_ok=True)


def cap_dias_atraso(dias) -> int:
    """Normaliza días de atraso al máximo permitido (scoring / resúmenes)."""
    try:
        return min(max(0, int(dias or 0)), MAX_DIAS_ATRASO)
    except (TypeError, ValueError):
        return 0


def cap_dias_display(dias) -> int:
    """Tope de días de mora mostrados en perfil y factores explicables."""
    try:
        return min(max(0, int(dias or 0)), MAX_DIAS_MORA_DISPLAY)
    except (TypeError, ValueError):
        return 0


def _parse_fecha(val) -> date | None:
    if not val:
        return None
    if isinstance(val, date):
        return val
    try:
        return date.fromisoformat(str(val)[:10])
    except ValueError:
        return None


def dias_atraso_cuota(
    fecha_esperada,
    fecha_pago=None,
    estado: str | None = None,
    fecha_corte: date | None = None,
    *,
    cap_display: int | None = None,
) -> int:
    """
    Días de atraso por cuota según vencimiento y fecha de corte.
    Pagado: días entre vencimiento y pago. Atrasado: días desde vencimiento al corte.
    cap_display=None → sin tope (tabla de cuotas). cap_display=100 → resúmenes/scoring.
    """
    venc = _parse_fecha(fecha_esperada)
    if not venc:
        return 0
    corte = fecha_corte or FECHA_CORTE
    est = (estado or "").strip().lower()

    if est == "pagado":
        pago = _parse_fecha(fecha_pago)
        if pago and pago >= venc:
            dias = max(0, (pago - venc).days)
        else:
            dias = 0
    elif est in ("atrasado", "pendiente") or not fecha_pago:
        dias = 0 if venc >= corte else max(0, (corte - venc).days)
    else:
        dias = 0

    if cap_display is not None:
        return min(max(0, dias), cap_display)
    return max(0, dias)


def estado_cuota_display(
    fecha_esperada,
    fecha_pago=None,
    estado: str | None = None,
    monto_esperado=None,
    monto_pagado=None,
    fecha_corte: date | None = None,
) -> str:
    """Estado coherente con mora del resumen (no solo el valor crudo en BD)."""
    dias = dias_atraso_cuota(
        fecha_esperada, fecha_pago, estado, fecha_corte=fecha_corte
    )
    est = (estado or "").strip().lower()
    esperado = float(monto_esperado or 0)
    pagado = float(monto_pagado or 0)
    cubierto = esperado > 0 and pagado >= esperado * 0.95

    if est == "pagado" and cubierto:
        return "Pagado"
    if est == "atrasado" or dias > 0:
        return "Atrasado"
    if est == "pendiente":
        return "Pendiente"
    return (estado or "Al día").strip() or "Al día"


def normalizar_dias_atraso_en_db() -> int:
    """Recorta en BD valores de dias_atraso mayores al tope."""
    if DB_URL:
        row = execute_query_one(
            f"SELECT COUNT(*) as cnt FROM pagos WHERE dias_atraso > {MAX_DIAS_ATRASO}"
        )
        if row and row["cnt"] > 0:
            execute_write(
                f"UPDATE pagos SET dias_atraso = {MAX_DIAS_ATRASO} WHERE dias_atraso > %s",
                (MAX_DIAS_ATRASO,),
            )
        return row["cnt"] if row else 0
    row = execute_query_one(
        f"SELECT COUNT(*) as cnt FROM pagos WHERE dias_atraso > ?",
        (MAX_DIAS_ATRASO,),
    )
    if row and row["cnt"] > 0:
        execute_write(
            "UPDATE pagos SET dias_atraso = ? WHERE dias_atraso > ?",
            (MAX_DIAS_ATRASO, MAX_DIAS_ATRASO),
        )
    return row["cnt"] if row else 0


def normalizar_ventana_preventiva_en_db() -> int:
    """
    Ubica la próxima cuota pendiente de cada socio activo en la ventana operativa
    (3–15 días desde FECHA_CORTE) para que el tablero preventivo no arranque en día 11+.
    """
    from datetime import timedelta

    min_dias = 3
    # Priorizar contacto 3–7 días (evita que la cola arranque en día 11+ por hash del socio_id)
    max_offset_preferido = 7
    corte = FECHA_CORTE

    rows = execute_query(
        """
        SELECT p.id AS pago_id, s.id AS socio_id, p.fecha_esperada
        FROM pagos p
        INNER JOIN creditos c ON p.credito_id = c.id
        INNER JOIN socios s ON c.socio_id = s.id
        WHERE p.estado = 'Pendiente'
          AND s.estado = 'Activo'
          AND p.fecha_esperada > ?
        ORDER BY s.id, p.fecha_esperada ASC, p.num_cuota ASC
        """,
        (corte.isoformat(),),
    )

    seen: set[int] = set()
    updates: list[tuple] = []
    for r in rows:
        sid = int(r["socio_id"])
        if sid in seen:
            continue
        seen.add(sid)
        offset = min_dias + (sid % (max_offset_preferido - min_dias + 1))
        nueva = (corte + timedelta(days=offset)).isoformat()
        if (r.get("fecha_esperada") or "")[:10] != nueva:
            updates.append((nueva, int(r["pago_id"])))

    if not updates:
        return 0

    execute_many("UPDATE pagos SET fecha_esperada = ? WHERE id = ?", updates)
    return len(updates)


def _socios_has_column(col: str) -> bool:
    if DB_URL:
        row = execute_query_one(
            """
            SELECT 1 AS ok FROM information_schema.columns
            WHERE table_name = 'socios' AND column_name = ?
            """,
            (col,),
        )
        return bool(row)
    rows = execute_query("PRAGMA table_info(socios)")
    return any(r.get("name") == col for r in rows)


def normalizar_cargas_familiares_en_db() -> int:
    """
    Asigna nro_cargas_fam por socio: más cargas en socios con mayor mora
    (más hijos / dependientes → mayor riesgo de impago).
    """
    if DB_URL:
        row = execute_query_one(
            "SELECT 1 AS ok FROM information_schema.tables WHERE table_name = 'socios'"
        )
    else:
        row = execute_query_one(
            "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='socios'"
        )
    if not row:
        return 0

    if not _socios_has_column("nro_cargas_fam"):
        try:
            execute_write("ALTER TABLE socios ADD COLUMN nro_cargas_fam INTEGER DEFAULT 0")
        except Exception:
            if not _socios_has_column("nro_cargas_fam"):
                return 0

    rows = execute_query(
        """
        SELECT
            s.id AS socio_id,
            CASE WHEN EXISTS (
                SELECT 1 FROM creditos c
                WHERE c.socio_id = s.id AND c.estado = 'Mora'
            ) THEN 1 ELSE 0 END AS en_mora,
            COALESCE((
                SELECT MAX(p.dias_atraso)
                FROM pagos p
                INNER JOIN creditos c ON p.credito_id = c.id
                WHERE c.socio_id = s.id
            ), 0) AS max_dias
        FROM socios s
        """
    )

    updates: list[tuple] = []
    for r in rows:
        sid = int(r["socio_id"])
        en_mora = int(r.get("en_mora") or 0)
        max_dias = int(r.get("max_dias") or 0)
        base = sid % 3

        if en_mora:
            cargas = min(5, 2 + (sid % 3) + (1 if max_dias > 45 else 0))
        elif max_dias > 15:
            cargas = min(4, 1 + base + (1 if max_dias > 30 else 0))
        elif max_dias > 0:
            cargas = min(3, base)
        else:
            cargas = base

        updates.append((cargas, sid))

    if not updates:
        return 0

    execute_many("UPDATE socios SET nro_cargas_fam = ? WHERE id = ?", updates)
    return len(updates)


def get_db_path() -> str:
    """Retorna la ruta absoluta de la base de datos."""
    return DB_URL if DB_URL else DB_PATH


def init_db_journal_mode():
    """Configura el modo WAL en la base de datos SQLite si estamos en modo local."""
    if DB_URL:
        return
    try:
        os.makedirs(DB_DIR, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.close()
    except Exception as e:
        print(f"Advertencia: No se pudo configurar PRAGMA journal_mode=WAL: {e}")

# Inicializamos el modo de base de datos una única vez al importar el módulo
init_db_journal_mode()


_cached_db_url = None

def connect_with_fallback(db_url):
    """
    Intenta conectarse a PostgreSQL con fallback automático al pooler IPv4 si
    la conexión directa falla o la contraseña tiene corchetes.
    Cachéa la conexión exitosa para evitar re-escaneo en cada consulta.
    """
    global _cached_db_url
    if _cached_db_url:
        try:
            return psycopg2.connect(_cached_db_url, timeout=30.0)
        except Exception:
            _cached_db_url = None
            
    urls_to_try = []
    urls_to_try.append(("Original", db_url))
    
    cleaned_url = db_url
    match = re.search(r"postgresql://([^:]+):\[(.*?)\]@(.*)", db_url)
    if match:
        user = match.group(1)
        pwd = match.group(2)
        rest = match.group(3)
        cleaned_url = f"postgresql://{user}:{pwd}@{rest}"
        urls_to_try.append(("Sin corchetes", cleaned_url))
        
    if "[" in db_url or "]" in db_url:
        urls_to_try.append(("Limpieza global", db_url.replace("[", "").replace("]", "")))
        
    host_match = re.search(r"@([^:/]+)", db_url)
    if host_match:
        host = host_match.group(1)
        if "supabase.co" in host:
            parts = host.split(".")
            if parts[0] == "db":
                project_ref = parts[1]
            else:
                project_ref = parts[0]
            
            pwd = None
            pwd_match = re.search(r"postgresql://([^:]+):(?:\[(.*?)\]|([^@]+))@", db_url)
            if pwd_match:
                pwd = pwd_match.group(2) or pwd_match.group(3)
                
            if pwd:
                pooler_user = f"postgres.{project_ref}"
                pooler_host = "aws-1-us-east-2.pooler.supabase.com"
                for port in [5432, 6543]:
                    urls_to_try.append((f"Pooler IPv4 (Port {port})", f"postgresql://{pooler_user}:{pwd}@{pooler_host}:{port}/postgres"))
                    
    for desc, url in urls_to_try:
        try:
            conn = psycopg2.connect(url, timeout=10.0)
            _cached_db_url = url
            return conn
        except Exception:
            pass
            
    raise ConnectionError("No se pudo conectar a PostgreSQL en Supabase tras intentar múltiples alternativas.")


@contextmanager
def get_connection():
    """Context manager para obtener una conexión a SQLite o PostgreSQL (Supabase)."""
    if DB_URL:
        conn = connect_with_fallback(DB_URL)
        try:
            yield conn
        finally:
            conn.close()
    else:
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
        finally:
            conn.close()


def execute_query(query: str, params: tuple = ()) -> list[dict]:
    """Ejecuta un SELECT y retorna lista de diccionarios."""
    if DB_URL:
        query_converted = query.replace('?', '%s')
        with get_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cursor:
                cursor.execute(query_converted, params)
                return [dict(row) for row in cursor.fetchall()]
    else:
        with get_connection() as conn:
            cursor = conn.execute(query, params)
            columns = [desc[0] for desc in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]


def execute_query_one(query: str, params: tuple = ()) -> dict | None:
    """Ejecuta un SELECT y retorna un solo resultado como diccionario."""
    if DB_URL:
        query_converted = query.replace('?', '%s')
        with get_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cursor:
                cursor.execute(query_converted, params)
                row = cursor.fetchone()
                return dict(row) if row else None
    else:
        with get_connection() as conn:
            cursor = conn.execute(query, params)
            row = cursor.fetchone()
            if row is None:
                return None
            columns = [desc[0] for desc in cursor.description]
            return dict(zip(columns, row))


def execute_write(query: str, params: tuple = ()) -> int:
    """Ejecuta INSERT/UPDATE/DELETE y retorna lastrowid."""
    if DB_URL:
        query_converted = query.replace('?', '%s')
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query_converted, params)
                conn.commit()
                try:
                    return cursor.lastrowid or 0
                except:
                    return 0
    else:
        with get_connection() as conn:
            cursor = conn.execute(query, params)
            conn.commit()
            return cursor.lastrowid


def execute_many(query: str, params_list: list[tuple]) -> None:
    """Ejecuta múltiples INSERT/UPDATE/DELETE."""
    if DB_URL:
        query_converted = query.replace('?', '%s')
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.executemany(query_converted, params_list)
                conn.commit()
    else:
        with get_connection() as conn:
            conn.executemany(query, params_list)
            conn.commit()


def db_exists() -> bool:
    """Verifica si la base de datos ya existe y tiene datos."""
    if DB_URL:
        try:
            result = execute_query_one("SELECT COUNT(*) as cnt FROM socios")
            return result is not None and result["cnt"] > 0
        except Exception:
            return False
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

