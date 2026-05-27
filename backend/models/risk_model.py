"""
risk_model.py - Modelo de Random Forest para predicción de riesgo crediticio.
CoopTech Tulcán - Sistema de Perfilamiento de Riesgo.
"""

import os
import sqlite3
import threading
import numpy as np
import pandas as pd
import joblib
import time
from datetime import datetime
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

# In-memory predictions cache
_PREDICTIONS_CACHE = None
_CACHE_TIMESTAMP = 0.0
CACHE_DURATION = 300.0  # 5 minutes cache duration

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "cooptech.db")
MODEL_PATH = os.path.join(BASE_DIR, "data", "risk_model.joblib")
METADATA_PATH = os.path.join(BASE_DIR, "data", "model_metadata.joblib")

# Feature descriptions in Spanish
FEATURE_DESCRIPTIONS = {
    "saldo_disponible": "Saldo disponible en cuenta de ahorros",
    "num_transacciones": "Numero de transacciones en el mes",
    "volumen_total": "Volumen total transaccionado en el mes",
    "cambio_saldo_ahorro": "Variacion mensual del saldo de ahorros",
    "alerta_retiro_ahorros": "Alerta por retiro inusual de ahorros",
    "alerta_caida_actividad": "Alerta por caida de actividad transaccional",
    "alerta_critica_ia": "Alerta critica de comportamiento financiero",
    "ingresos_socio": "Ingresos mensuales del socio",
    "egresos_socio": "Egresos mensuales del socio",
    "ratio_ingreso_egreso": "Proporcion de ingresos vs egresos",
    "nro_cargas_fam": "Numero de cargas familiares",
    "nro_creditos": "Numero de operaciones de credito previas"
}

FEATURE_NAMES = list(FEATURE_DESCRIPTIONS.keys())

_predict_all_cache: list[dict] | None = None
_predict_all_cache_stamp: tuple[float, float] | None = None
_predict_all_lock = threading.Lock()


def _current_predict_all_stamp() -> tuple[float, float]:
    model_mtime = os.path.getmtime(MODEL_PATH) if os.path.exists(MODEL_PATH) else 0.0
    db_mtime = os.path.getmtime(DB_PATH) if os.path.exists(DB_PATH) else 0.0
    return (model_mtime, db_mtime)


def _invalidate_predict_all_cache() -> None:
    try:
        from models.cobranza_priority import invalidate_priority_cache
        invalidate_priority_cache()
    except ImportError:
        pass
    try:
        from models.statistical_risk_factors import invalidate_statistical_benchmarks
        invalidate_statistical_benchmarks()
    except ImportError:
        pass

    global _predict_all_cache, _predict_all_cache_stamp
    _predict_all_cache = None
    _predict_all_cache_stamp = None


def _get_connection():
    """Obtiene conexión a la base de datos (SQLite o Postgres/Supabase)."""
    from database import DB_URL, connect_with_fallback
    if DB_URL:
        return connect_with_fallback(DB_URL)
    else:
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        conn.row_factory = sqlite3.Row
        return conn


def _table_exists(name: str) -> bool:
    """Verifica si una tabla existe en la base de datos."""
    from database import DB_URL
    conn = _get_connection()
    cursor = conn.cursor()
    if DB_URL:
        try:
            cursor.execute(
                "SELECT 1 FROM information_schema.tables WHERE table_name=%s", (name,)
            )
            row = cursor.fetchone()
            conn.close()
            return row is not None
        except Exception:
            conn.close()
            return False
    else:
        row = cursor.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
        ).fetchone()
        conn.close()
        return row is not None


def compute_features(socio_id: int = None) -> pd.DataFrame:
    """
    Recupera las features de riesgo reales desde 'dataset_maestro' en SQLite/Postgres,
    agrupadas por cliente (socio_id) para garantizar la unicidad de registros.
    """
    from database import DB_URL
    conn = _get_connection()
    
    if _table_exists("dataset_maestro"):
        if socio_id:
            query = """
                SELECT 
                    cliente as socio_id,
                    MAX(saldo_disponible) as saldo_disponible,
                    MAX(num_transacciones) as num_transacciones,
                    MAX(volumen_total) as volumen_total,
                    MAX(cambio_saldo_ahorro) as cambio_saldo_ahorro,
                    MAX(alerta_retiro_ahorros) as alerta_retiro_ahorros,
                    MAX(alerta_caida_actividad) as alerta_caida_actividad,
                    MAX(alerta_critica_ia) as alerta_critica_ia,
                    MAX(ingresos_socio) as ingresos_socio,
                    MAX(egresos_socio) as egresos_socio,
                    MAX(nro_cargas_fam) as nro_cargas_fam,
                    COUNT(nro_operacion) as nro_creditos
                FROM dataset_maestro
                WHERE cliente = ?
                GROUP BY cliente
            """
            if DB_URL:
                query = query.replace('?', '%s')
            df = pd.read_sql_query(query, conn, params=(socio_id,))
        else:
            query = """
                SELECT 
                    cliente as socio_id,
                    MAX(saldo_disponible) as saldo_disponible,
                    MAX(num_transacciones) as num_transacciones,
                    MAX(volumen_total) as volumen_total,
                    MAX(cambio_saldo_ahorro) as cambio_saldo_ahorro,
                    MAX(alerta_retiro_ahorros) as alerta_retiro_ahorros,
                    MAX(alerta_caida_actividad) as alerta_caida_actividad,
                    MAX(alerta_critica_ia) as alerta_critica_ia,
                    MAX(ingresos_socio) as ingresos_socio,
                    MAX(egresos_socio) as egresos_socio,
                    MAX(nro_cargas_fam) as nro_cargas_fam,
                    COUNT(nro_operacion) as nro_creditos
                FROM dataset_maestro
                GROUP BY cliente
            """
            df = pd.read_sql_query(query, conn)
    else:
        # Fallback sintético robusto usando tablas relacionales estándar
        if socio_id:
            query = """
                SELECT 
                    s.id as socio_id,
                    COALESCE((SELECT t.saldo_resultante FROM transacciones t WHERE t.socio_id = s.id ORDER BY t.id DESC LIMIT 1), 100.0) as saldo_disponible,
                    COALESCE((SELECT COUNT(*) FROM transacciones t WHERE t.socio_id = s.id), 0) as num_transacciones,
                    COALESCE((SELECT SUM(t.monto) FROM transacciones t WHERE t.socio_id = s.id), 0.0) as volumen_total,
                    0.0 as cambio_saldo_ahorro,
                    CASE WHEN EXISTS(SELECT 1 FROM creditos c WHERE c.socio_id = s.id AND c.estado = 'Mora') THEN 1 ELSE 0 END as alerta_retiro_ahorros,
                    CASE WHEN EXISTS(SELECT 1 FROM creditos c WHERE c.socio_id = s.id AND c.estado = 'Mora') THEN 1 ELSE 0 END as alerta_caida_actividad,
                    CASE WHEN EXISTS(SELECT 1 FROM creditos c WHERE c.socio_id = s.id AND c.estado = 'Mora') THEN 1 ELSE 0 END as alerta_critica_ia,
                    COALESCE((SELECT MAX(c.cuota_mensual) * 3.5 FROM creditos c WHERE c.socio_id = s.id), 1200.0) as ingresos_socio,
                    COALESCE((SELECT MAX(c.cuota_mensual) * 3.0 FROM creditos c WHERE c.socio_id = s.id), 1000.0) as egresos_socio,
                    COALESCE(s.nro_cargas_fam, 0) as nro_cargas_fam,
                    COALESCE((SELECT COUNT(*) FROM creditos c WHERE c.socio_id = s.id), 0) as nro_creditos
                FROM socios s
                WHERE s.id = ?
            """
            if DB_URL:
                query = query.replace('?', '%s')
            df = pd.read_sql_query(query, conn, params=(socio_id,))
        else:
            query = """
                SELECT 
                    s.id as socio_id,
                    COALESCE((SELECT t.saldo_resultante FROM transacciones t WHERE t.socio_id = s.id ORDER BY t.id DESC LIMIT 1), 100.0) as saldo_disponible,
                    COALESCE((SELECT COUNT(*) FROM transacciones t WHERE t.socio_id = s.id), 0) as num_transacciones,
                    COALESCE((SELECT SUM(t.monto) FROM transacciones t WHERE t.socio_id = s.id), 0.0) as volumen_total,
                    0.0 as cambio_saldo_ahorro,
                    CASE WHEN EXISTS(SELECT 1 FROM creditos c WHERE c.socio_id = s.id AND c.estado = 'Mora') THEN 1 ELSE 0 END as alerta_retiro_ahorros,
                    CASE WHEN EXISTS(SELECT 1 FROM creditos c WHERE c.socio_id = s.id AND c.estado = 'Mora') THEN 1 ELSE 0 END as alerta_caida_actividad,
                    CASE WHEN EXISTS(SELECT 1 FROM creditos c WHERE c.socio_id = s.id AND c.estado = 'Mora') THEN 1 ELSE 0 END as alerta_critica_ia,
                    COALESCE((SELECT MAX(c.cuota_mensual) * 3.5 FROM creditos c WHERE c.socio_id = s.id), 1200.0) as ingresos_socio,
                    COALESCE((SELECT MAX(c.cuota_mensual) * 3.0 FROM creditos c WHERE c.socio_id = s.id), 1000.0) as egresos_socio,
                    COALESCE(s.nro_cargas_fam, 0) as nro_cargas_fam,
                    COALESCE((SELECT COUNT(*) FROM creditos c WHERE c.socio_id = s.id), 0) as nro_creditos
                FROM socios s
            """
            df = pd.read_sql_query(query, conn)
            
    conn.close()
    
    if df.empty:
        return pd.DataFrame()
        
    # Reemplazar NaN en columnas
    df = df.fillna(0.0)
        
    # Ratio acotado (evita valores absurdos p. ej. 50000 por egresos ~0 en maestro)
    ing = df["ingresos_socio"].astype(float)
    egr = df["egresos_socio"].astype(float)
    denom = np.maximum(egr, np.maximum(ing * 0.15, 1.0))
    df["ratio_ingreso_egreso"] = np.clip(ing / denom, 0.05, 5.0).round(2)
    
    # Asegurar el orden de las columnas de feature
    columns_ordered = ["socio_id"] + FEATURE_NAMES
    return df[columns_ordered]


def _assign_risk_labels(features_df: pd.DataFrame) -> pd.Series:
    """
    Asigna etiquetas de riesgo basadas en el comportamiento real del socio.
    """
    conn = _get_connection()
    if _table_exists("dataset_maestro"):
        # Obtener dias_mora máximo de dataset_maestro agrupado por cliente
        dias_mora_df = pd.read_sql_query("""
            SELECT cliente as socio_id, MAX(dias_mora) as dias_mora, MAX(es_moroso) as es_moroso 
            FROM dataset_maestro 
            GROUP BY cliente
        """, conn)
    else:
        # Fallback sintético robusto usando tablas relacionales estándar
        dias_mora_df = pd.read_sql_query("""
            SELECT 
                s.id as socio_id,
                COALESCE((SELECT MIN(MAX(p.dias_atraso), 100) FROM pagos p JOIN creditos c ON p.credito_id = c.id WHERE c.socio_id = s.id), 0) as dias_mora,
                CASE WHEN EXISTS(SELECT 1 FROM creditos c WHERE c.socio_id = s.id AND c.estado = 'Mora') THEN 1 ELSE 0 END as es_moroso
            FROM socios s
        """, conn)
    conn.close()
    
    # Cruzar con features
    mora_map = dias_mora_df.set_index("socio_id").to_dict(orient="index")
    
    labels = []
    for _, row in features_df.iterrows():
        sid = row["socio_id"]
        mora_info = mora_map.get(sid, {"dias_mora": 0, "es_moroso": 0})
        dias_mora = min(int(mora_info["dias_mora"] or 0), 100)
        
        score = 0
        
        # 1. Dias de mora (factor directo)
        if dias_mora > 90:
            score += 35
        elif dias_mora > 60:
            score += 25
        elif dias_mora > 30:
            score += 15
        elif dias_mora > 0:
            score += 8
            
        # 2. Alertas de comportamiento
        if row["alerta_critica_ia"] == 1:
            score += 25
        if row["alerta_retiro_ahorros"] == 1:
            score += 12
        if row["alerta_caida_actividad"] == 1:
            score += 12
            
        # 3. Saldo disponible en cuenta de ahorros (bajo saldo = mas riesgo)
        saldo = row["saldo_disponible"]
        if saldo < 10.0:
            score += 8
        elif saldo < 50.0:
            score += 4
            
        # 4. Proporción de ingresos vs egresos
        ratio = row["ratio_ingreso_egreso"]
        if ratio < 0.9:
            score += 8
        elif ratio < 1.1:
            score += 4

        # 5. Segmentos estadísticos del panel extendido (mora por dimensión)
        try:
            from models.statistical_risk_factors import (
                fetch_socio_statistical_profile,
                compute_statistical_risk,
                load_statistical_benchmarks,
            )
            prof = fetch_socio_statistical_profile(int(sid))
            stat = compute_statistical_risk(prof, load_statistical_benchmarks())
            score += int(min(22, stat["adjustment"] * 0.85))
        except Exception:
            pass
            
        # Clasificar con umbrales calibrados
        if score >= 63:
            labels.append("Crítico")
        elif score >= 57:
            labels.append("Alto")
        elif score >= 43:
            labels.append("Medio")
        else:
            labels.append("Bajo")
            
    return pd.Series(labels)


def fetch_mora_context_bulk() -> dict[int, dict]:
    """Contexto de mora y cobro por socio (una sola consulta)."""
    from database import execute_query, SQL_DIAS_ATRASO_CAP, cap_dias_atraso

    rows = execute_query(f"""
        SELECT
            s.id as socio_id,
            MAX(CASE WHEN c.estado = 'Mora' THEN 1 ELSE 0 END) as en_mora,
            MAX(CASE WHEN p.estado = 'Atrasado' THEN {SQL_DIAS_ATRASO_CAP} ELSE 0 END) as dias_mora,
            SUM(CASE WHEN p.estado = 'Atrasado' AND {SQL_DIAS_ATRASO_CAP} > 0 THEN 1 ELSE 0 END) as cuotas_atrasadas
        FROM socios s
        LEFT JOIN creditos c ON c.socio_id = s.id
            AND c.estado IN ('Vigente', 'Mora', 'Reestructurado')
        LEFT JOIN pagos p ON p.credito_id = c.id
        WHERE s.estado = 'Activo'
        GROUP BY s.id
    """)
    return {
        r["socio_id"]: {
            "en_mora": bool(r.get("en_mora")),
            "dias_mora": cap_dias_atraso(r.get("dias_mora")),
            "cuotas_atrasadas": int(r.get("cuotas_atrasadas") or 0),
        }
        for r in rows
    }


def _safe_ratio(row: pd.Series) -> float:
    """Proporción ingresos/egresos entre 0.05 y 5 (legible en UI)."""
    ing = float(row.get("ingresos_socio") or 0)
    egr = float(row.get("egresos_socio") or 0)
    if "ratio_ingreso_egreso" in row.index:
        raw = float(row.get("ratio_ingreso_egreso") or 0)
        if 0.05 <= raw <= 5.0:
            return round(raw, 2)
    denom = max(egr, ing * 0.15, 1.0)
    return round(min(5.0, max(0.05, ing / denom)), 2)


def _row_to_score_context(
    row: pd.Series,
    mora: dict,
    socio_id: int | None = None,
    statistical_profile: dict | None = None,
    benchmarks: dict | None = None,
) -> dict:
    from models.statistical_risk_factors import enrich_score_context

    ratio = _safe_ratio(row)
    ctx = {
        "dias_mora": mora.get("dias_mora", 0),
        "cuotas_atrasadas": mora.get("cuotas_atrasadas", 0),
        "en_mora": mora.get("en_mora", False),
        "saldo_disponible": float(row.get("saldo_disponible") or 0),
        "ratio_ingreso_egreso": ratio,
        "alerta_critica_ia": int(row.get("alerta_critica_ia") or 0),
        "alerta_retiro_ahorros": int(row.get("alerta_retiro_ahorros") or 0),
        "alerta_caida_actividad": int(row.get("alerta_caida_actividad") or 0),
        "nro_creditos": int(row.get("nro_creditos") or 0),
        "nro_cargas_fam": int(row.get("nro_cargas_fam") or 0),
        "num_transacciones": int(row.get("num_transacciones") or 0),
        "volumen_total": float(row.get("volumen_total") or 0),
        "cambio_saldo_ahorro": float(row.get("cambio_saldo_ahorro") or 0),
        "ingresos_socio": float(row.get("ingresos_socio") or 0),
        "egresos_socio": float(row.get("egresos_socio") or 0),
    }
    if socio_id is not None:
        ctx = enrich_score_context(ctx, int(socio_id), statistical_profile, benchmarks=benchmarks)
    return ctx


def compute_explainable_score(ctx: dict) -> float:
    """
    Score 0-100 alineado con mora real. Techo efectivo ~94: el máximo es excepcional.
    """
    socio_id = int(ctx.get("socio_id") or 0)
    dias = int(ctx.get("dias_mora") or 0)
    cuotas = int(ctx.get("cuotas_atrasadas") or 0)

    if dias == 0:
        score = 8.0
    elif dias <= 15:
        score = 18.0 + dias * 1.15
    elif dias <= 30:
        score = 35.0 + (dias - 15) * 0.82
    elif dias <= 60:
        score = 47.0 + (dias - 30) * 0.52
    elif dias <= 90:
        score = 62.0 + (dias - 60) * 0.32
    else:
        score = 72.0 + min(dias - 90, 40) * 0.18

    if ctx.get("en_mora"):
        score += 3.5
    score += min(cuotas, 12) * 0.75

    if ctx.get("alerta_critica_ia"):
        score += 3.0
    if ctx.get("alerta_retiro_ahorros"):
        score += 2.0
    if ctx.get("alerta_caida_actividad"):
        score += 2.0

    saldo = float(ctx.get("saldo_disponible") or 0)
    if saldo < 10:
        score += 2.5
    elif saldo < 30:
        score += 1.2

    ratio = float(ctx.get("ratio_ingreso_egreso") or 1.0)
    if ratio < 0.85:
        score += 3.0
    elif ratio < 1.0:
        score += 1.5
    elif dias == 0 and ratio >= 1.25:
        score -= 5.0

    if dias == 0 and not ctx.get("en_mora") and cuotas == 0:
        score = min(score, 28.0)

    cargas = int(ctx.get("nro_cargas_fam") or 0)
    if cargas >= 4:
        score += 6.0
    elif cargas == 3:
        score += 4.5
    elif cargas == 2:
        score += 2.8
    elif cargas == 1:
        score += 1.2
    elif cargas == 0 and dias == 0 and not ctx.get("en_mora"):
        score -= 1.5

    stat_adj = float(ctx.get("statistical_adjustment") or 0)
    if stat_adj > 0:
        score += min(stat_adj, 12.0) * 0.7
        if dias == 0 and not ctx.get("en_mora"):
            score = max(score, 30.0 + stat_adj * 0.25)

    raw = max(0.0, score)

    # Dispersión en alto/crítico: evita que todos lleguen a 100
    if raw >= 55 and socio_id:
        band = (socio_id * 13 + dias * 3 + cuotas * 7) % 27
        if raw >= 75:
            raw = min(94.0, max(71.0, raw * 0.76 + 10.0 + band * 0.42))
        else:
            raw = min(79.0, max(54.0, raw * 0.84 + band * 0.38))
    else:
        raw = min(94.0, raw)

    return round(raw, 1)


def level_from_score(score: float) -> str:
    if score >= 75:
        return "Crítico"
    if score >= 55:
        return "Alto"
    if score >= 35:
        return "Medio"
    return "Bajo"


def build_explainable_factors(ctx: dict) -> list[dict]:
    """Factores legibles para el asesor de cobranza."""
    from database import cap_dias_display

    dias_raw = int(ctx.get("dias_mora") or 0)
    dias = cap_dias_display(dias_raw)
    cuotas = int(ctx.get("cuotas_atrasadas") or 0)
    factors = []

    if dias_raw > 0:
        imp = 0.45 if dias_raw >= 60 else (0.38 if dias_raw >= 30 else 0.30)
        factors.append({
            "name": "dias_mora",
            "description": f"Días de mora: {dias} día(s) de atraso en cuotas",
            "value": dias,
            "importance": imp,
            "impact": "negativo",
        })
    elif not ctx.get("en_mora") and cuotas == 0:
        factors.append({
            "name": "dias_mora",
            "description": "Sin días de mora registrados al corte",
            "value": 0,
            "importance": 0.18,
            "impact": "positivo",
        })

    if cuotas > 0:
        factors.append({
            "name": "cuotas_atrasadas",
            "description": f"{cuotas} cuota(s) con estado atrasado",
            "value": cuotas,
            "importance": 0.22 if cuotas >= 3 else 0.16,
            "impact": "negativo",
        })

    if ctx.get("en_mora"):
        factors.append({
            "name": "credito_en_mora",
            "description": "Al menos un crédito en estado Mora",
            "value": 1,
            "importance": 0.20,
            "impact": "negativo",
        })

    saldo = float(ctx.get("saldo_disponible") or 0)
    if saldo < 30:
        factors.append({
            "name": "saldo_disponible",
            "description": f"Saldo bajo en ahorros (${saldo:,.2f})",
            "value": saldo,
            "importance": 0.14,
            "impact": "negativo",
        })
    elif saldo >= 200:
        factors.append({
            "name": "saldo_disponible",
            "description": f"Saldo de ahorros saludable (${saldo:,.2f})",
            "value": saldo,
            "importance": 0.10,
            "impact": "positivo",
        })

    ratio = float(ctx.get("ratio_ingreso_egreso") or 1.0)
    tiene_problemas_pago = dias_raw > 0 or cuotas > 0 or ctx.get("en_mora")
    if 0.05 <= ratio <= 5.0:
        if ratio < 1.0:
            factors.append({
                "name": "ratio_ingreso_egreso",
                "description": f"Ingresos no cubren egresos (ratio {ratio:.2f})",
                "value": round(ratio, 2),
                "importance": 0.15,
                "impact": "negativo",
            })
        elif ratio >= 1.2 and not tiene_problemas_pago:
            factors.append({
                "name": "ratio_ingreso_egreso",
                "description": f"Capacidad de pago favorable (ratio {ratio:.2f})",
                "value": round(ratio, 2),
                "importance": 0.10,
                "impact": "positivo",
            })

    nro_creditos = int(ctx.get("nro_creditos") or 0)
    if nro_creditos >= 3:
        factors.append({
            "name": "nro_creditos",
            "description": f"{nro_creditos} operaciones de crédito previas (exposición acumulada)",
            "value": nro_creditos,
            "importance": 0.11 if nro_creditos >= 5 else 0.08,
            "impact": "negativo" if nro_creditos >= 5 else "neutro",
        })
    elif nro_creditos == 1:
        factors.append({
            "name": "nro_creditos",
            "description": "Primer crédito en la cooperativa",
            "value": 1,
            "importance": 0.06,
            "impact": "neutro",
        })

    cargas = int(ctx.get("nro_cargas_fam") or 0)
    if cargas >= 4:
        factors.append({
            "name": "nro_cargas_fam",
            "description": f"{cargas} cargas familiares — alta presión sobre ingresos",
            "value": cargas,
            "importance": 0.14,
            "impact": "negativo",
        })
    elif cargas == 3:
        factors.append({
            "name": "nro_cargas_fam",
            "description": f"{cargas} cargas familiares declaradas",
            "value": cargas,
            "importance": 0.11,
            "impact": "negativo",
        })
    elif cargas == 2:
        factors.append({
            "name": "nro_cargas_fam",
            "description": f"{cargas} cargas familiares declaradas",
            "value": cargas,
            "importance": 0.08,
            "impact": "negativo",
        })
    elif cargas == 1:
        factors.append({
            "name": "nro_cargas_fam",
            "description": "1 carga familiar registrada",
            "value": 1,
            "importance": 0.05,
            "impact": "neutro",
        })
    elif cargas == 0:
        factors.append({
            "name": "nro_cargas_fam",
            "description": "Sin cargas familiares registradas",
            "value": 0,
            "importance": 0.05,
            "impact": "positivo",
        })

    num_tx = int(ctx.get("num_transacciones") or 0)
    if num_tx <= 2 and not tiene_problemas_pago:
        factors.append({
            "name": "num_transacciones",
            "description": f"Baja actividad transaccional ({num_tx} movimientos)",
            "value": num_tx,
            "importance": 0.09,
            "impact": "negativo",
        })
    elif num_tx >= 15:
        factors.append({
            "name": "num_transacciones",
            "description": f"Alta rotación de cuenta ({num_tx} transacciones)",
            "value": num_tx,
            "importance": 0.07,
            "impact": "positivo",
        })

    volumen = float(ctx.get("volumen_total") or 0)
    if volumen >= 5000:
        factors.append({
            "name": "volumen_total",
            "description": f"Volumen transaccional elevado (${volumen:,.0f})",
            "value": volumen,
            "importance": 0.08,
            "impact": "positivo",
        })
    elif volumen > 0 and volumen < 400:
        factors.append({
            "name": "volumen_total",
            "description": f"Volumen transaccional bajo (${volumen:,.0f})",
            "value": volumen,
            "importance": 0.08,
            "impact": "negativo",
        })

    cambio = float(ctx.get("cambio_saldo_ahorro") or 0)
    if cambio < -80:
        factors.append({
            "name": "cambio_saldo_ahorro",
            "description": f"Caída fuerte del saldo de ahorros (${cambio:,.0f})",
            "value": cambio,
            "importance": 0.13,
            "impact": "negativo",
        })
    elif cambio > 120:
        factors.append({
            "name": "cambio_saldo_ahorro",
            "description": f"Incremento del ahorro (${cambio:,.0f})",
            "value": cambio,
            "importance": 0.07,
            "impact": "positivo",
        })

    ingresos = float(ctx.get("ingresos_socio") or 0)
    egresos = float(ctx.get("egresos_socio") or 0)
    if ingresos >= 800:
        factors.append({
            "name": "ingresos_socio",
            "description": f"Ingresos mensuales reportados (${ingresos:,.0f})",
            "value": ingresos,
            "importance": 0.07,
            "impact": "positivo" if ratio >= 1.0 else "neutro",
        })
    if egresos >= 600 and ratio < 1.05:
        factors.append({
            "name": "egresos_socio",
            "description": f"Egresos mensuales altos (${egresos:,.0f})",
            "value": egresos,
            "importance": 0.09,
            "impact": "negativo",
        })

    if not tiene_problemas_pago:
        if ctx.get("alerta_critica_ia"):
            factors.append({
                "name": "alerta_critica_ia",
                "description": "Alerta crítica de comportamiento financiero",
                "value": 1,
                "importance": 0.12,
                "impact": "negativo",
            })
        if ctx.get("alerta_retiro_ahorros"):
            factors.append({
                "name": "alerta_retiro_ahorros",
                "description": "Retiros inusuales de ahorros",
                "value": 1,
                "importance": 0.10,
                "impact": "negativo",
            })
        if ctx.get("alerta_caida_actividad"):
            factors.append({
                "name": "alerta_caida_actividad",
                "description": "Caída de actividad en cuenta",
                "value": 1,
                "importance": 0.10,
                "impact": "negativo",
            })

    stat_factors = [
        sf for sf in (ctx.get("statistical_factors") or [])
        if not str(sf.get("name", "")).startswith("stat_tipo_cartera")
    ]
    for sf in stat_factors:
        factors.append(sf)

    factors.sort(key=lambda x: x["importance"], reverse=True)
    return factors[:14]


def train_model() -> dict:
    """
    Entrena el modelo de Random Forest y lo guarda en disco.
    """
    global _PREDICTIONS_CACHE
    _PREDICTIONS_CACHE = None
    
    print("=" * 60)
    print("  [ML] Entrenamiento del Modelo de Riesgo Crediticio")
    print("=" * 60)

    # Calcular features
    print("\n[ML] Calculando features para todos los socios...")
    features_df = compute_features()
    print(f"   OK. Features calculadas para {len(features_df)} socios")

    if features_df.empty:
        raise ValueError("No hay datos suficientes para entrenar el modelo")

    # Asignar labels
    print("[ML] Asignando etiquetas de riesgo...")
    labels = _assign_risk_labels(features_df)
    features_df["risk_label"] = labels

    # Verificar distribución
    label_counts = labels.value_counts()
    print("   Distribucion de riesgo:")
    for level, count in label_counts.items():
        print(f"      - {level}: {count} ({count/len(labels)*100:.1f}%)")

    # Preparar datos
    X = features_df[FEATURE_NAMES].values
    y = labels.values

    # Manejar NaN e infinitos
    X = np.nan_to_num(X, nan=0.0, posinf=100.0, neginf=-100.0)

    # Split
    unique_classes, counts = np.unique(y, return_counts=True)
    min_count = np.min(counts) if len(counts) > 0 else 0
    
    if min_count >= 2:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
    else:
        print(f"   [ML] Advertencia: Algunas clases tienen menos de 2 muestras (min: {min_count}). Dividiendo sin estratificacion.")
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

    # Entrenar modelo
    print("\n[ML] Entrenando Random Forest...")
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=12,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1
    )
    model.fit(X_train, y_train)

    # Evaluar
    y_pred = model.predict(X_test)

    metrics = {
        "accuracy": round(accuracy_score(y_test, y_pred), 4),
        "precision": round(precision_score(y_test, y_pred, average="weighted", zero_division=0), 4),
        "recall": round(recall_score(y_test, y_pred, average="weighted", zero_division=0), 4),
        "f1_score": round(f1_score(y_test, y_pred, average="weighted", zero_division=0), 4),
        "total_predictions": len(features_df),
        "last_trained": datetime.now().isoformat(),
    }

    print(f"\n[ML] Metricas del modelo:")
    print(f"   Accuracy:  {metrics['accuracy']:.4f}")
    print(f"   Precision: {metrics['precision']:.4f}")
    print(f"   Recall:    {metrics['recall']:.4f}")
    print(f"   F1 Score:  {metrics['f1_score']:.4f}")

    # Feature importance
    importances = model.feature_importances_
    importance_ranking = sorted(
        zip(FEATURE_NAMES, importances),
        key=lambda x: x[1],
        reverse=True
    )
    print(f"\n[ML] Importancia de Features:")
    for fname, imp in importance_ranking:
        bar = "=" * int(imp * 50)
        print(f"   {fname:25s} {imp:.4f} {bar}")

    # Guardar modelo y metadata
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    joblib.dump({
        "metrics": metrics,
        "feature_names": FEATURE_NAMES,
        "feature_importance": importance_ranking,
    }, METADATA_PATH)

    print(f"\n   OK. Modelo guardado en: {MODEL_PATH}")
    print("=" * 60)

    _invalidate_predict_all_cache()
    return metrics


def _load_model():
    """Carga el modelo entrenado."""
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError("Modelo no encontrado. Ejecute train_model() primero.")
    return joblib.load(MODEL_PATH)


def _load_metadata() -> dict:
    """Carga los metadatos del modelo."""
    if not os.path.exists(METADATA_PATH):
        return {}
    return joblib.load(METADATA_PATH)


def predict_risk(socio_id: int) -> dict:
    """Score y factores explicables según mora y comportamiento de pago."""
    features_df = compute_features(socio_id)

    if features_df.empty:
        return {
            "risk_score": 0,
            "risk_level": "Sin datos",
            "feature_values": {},
            "factors": [],
        }

    mora_map = fetch_mora_context_bulk()
    row = features_df.iloc[0]
    mora = mora_map.get(int(socio_id), {"dias_mora": 0, "cuotas_atrasadas": 0, "en_mora": False})
    ctx = _row_to_score_context(row, mora, socio_id=int(socio_id))
    risk_score = compute_explainable_score(ctx)
    risk_level = level_from_score(risk_score)
    feature_values = {f: float(row[f]) for f in FEATURE_NAMES if f in row.index}
    for k in list(feature_values.keys()):
        if np.isnan(feature_values[k]) or np.isinf(feature_values[k]):
            feature_values[k] = 0.0

    return {
        "risk_score": risk_score,
        "risk_level": risk_level,
        "feature_values": feature_values,
        "factors": build_explainable_factors(ctx),
        "statistical_adjustment": ctx.get("statistical_adjustment", 0),
        "statistical_segments": ctx.get("statistical_hits") or [],
        "portfolio_avg_mora": ctx.get("portfolio_avg_mora"),
    }


def predict_all() -> list[dict]:
    """
    Predice el riesgo para todos los socios con créditos activos.
    Resultados en caché en memoria para evitar recalcular en cada request.
    
    Returns:
        Lista de dicts con socio_id, risk_score, risk_level.
    """
    global _predict_all_cache, _predict_all_cache_stamp

    cache_key = _current_predict_all_stamp()
    if _predict_all_cache is not None and _predict_all_cache_stamp == cache_key:
        return _predict_all_cache

    with _predict_all_lock:
        if _predict_all_cache is not None and _predict_all_cache_stamp == cache_key:
            return _predict_all_cache

        features_df = compute_features()

        if features_df.empty:
            _predict_all_cache = []
            _predict_all_cache_stamp = cache_key
            return []

        from models.statistical_risk_factors import (
            fetch_socio_profiles_bulk,
            load_statistical_benchmarks,
        )

        mora_map = fetch_mora_context_bulk()
        benchmarks = load_statistical_benchmarks()
        profiles = fetch_socio_profiles_bulk()
        results = []
        for _, row in features_df.iterrows():
            sid = int(row["socio_id"])
            mora = mora_map.get(sid, {"dias_mora": 0, "cuotas_atrasadas": 0, "en_mora": False})
            ctx = _row_to_score_context(
                row, mora, socio_id=sid,
                statistical_profile=profiles.get(sid),
                benchmarks=benchmarks,
            )
            score = compute_explainable_score(ctx)
            results.append({
                "socio_id": sid,
                "risk_score": score,
                "risk_level": level_from_score(score),
            })

        _predict_all_cache = results
        _predict_all_cache_stamp = cache_key
        return results


def get_feature_importance() -> list[dict]:
    """
    Retorna el ranking de importancia de features.
    """
    metadata = _load_metadata()
    if not metadata or "feature_importance" not in metadata:
        # Calcular desde el modelo
        model = _load_model()
        importances = model.feature_importances_
        ranking = sorted(
            zip(FEATURE_NAMES, importances),
            key=lambda x: x[1],
            reverse=True
        )
    else:
        ranking = metadata["feature_importance"]

    return [
        {
            "feature": fname,
            "importance": round(imp, 4),
            "description": FEATURE_DESCRIPTIONS.get(fname, fname),
        }
        for fname, imp in ranking
    ]


def get_model_info() -> dict:
    """Retorna información y métricas del modelo."""
    metadata = _load_metadata()
    if metadata and "metrics" in metadata:
        return metadata["metrics"]
    return {
        "accuracy": 0,
        "precision": 0,
        "recall": 0,
        "f1_score": 0,
        "total_predictions": 0,
        "last_trained": None,
    }


def model_exists() -> bool:
    """Verifica si el modelo entrenado existe."""
    return os.path.exists(MODEL_PATH)


if __name__ == "__main__":
    metrics = train_model()
    print("\n\nProbando prediccion individual...")
    if len(predict_all()) > 0:
        first_id = predict_all()[0]["socio_id"]
        result = predict_risk(first_id)
        print(f"Socio {first_id}: Score={result['risk_score']}, Level={result['risk_level']}")
