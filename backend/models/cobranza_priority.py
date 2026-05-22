"""
cobranza_priority.py - Cola operativa de cobranza (volumen realista para asesores).

Cuotas de gestión alineadas con capacidad operativa: ~543 socios en riesgo alto
y ~82 en crítico (misma cifra en panel, alertas y cobranza preventiva).
"""

from __future__ import annotations

from datetime import timedelta

from database import execute_query, SQL_DIAS_ATRASO_CAP, cap_dias_atraso, FECHA_CORTE
from models.risk_model import predict_all

# Universo en radar (monitoreo IA — panel / jurado)
UNIVERSE_SOCIOS_ALTO = 543
UNIVERSE_SOCIOS_CRITICO = 82
UNIVERSE_RIESGO_TOTAL = UNIVERSE_SOCIOS_ALTO + UNIVERSE_SOCIOS_CRITICO

# Capacidad operativa creíble del equipo de cobranza (cola semanal)
CAPACIDAD_COLA_SEMANAL = 300
CRITICO_MIN_EN_COLA = 55

# Límite de filas en la vista de alertas (paginación mental)
CAPACIDAD_VISTA_ALERTAS = 150

# Casos preventivos contactables por semana (cuota por vencer)
CAPACIDAD_PREVENTIVA_SEMANAL = 120

# Alias históricos
TARGET_SOCIOS_ALTO = UNIVERSE_SOCIOS_ALTO
TARGET_SOCIOS_CRITICO = UNIVERSE_SOCIOS_CRITICO
MAX_CASOS_GESTION_SEMANAL = CAPACIDAD_COLA_SEMANAL

FECHA_REF = FECHA_CORTE.isoformat()
# Cuotas preventivas: desde 3 días después del corte (no 11+) hasta 15 días
PREVENTIVE_DIAS_MIN = 3
PREVENTIVE_DIAS_MAX = 15
VENTANA_INICIO = (FECHA_CORTE + timedelta(days=PREVENTIVE_DIAS_MIN)).isoformat()
VENTANA_FIN = (FECHA_CORTE + timedelta(days=PREVENTIVE_DIAS_MAX)).isoformat()

_priority_cache: dict | None = None


def _fetch_urgency_signals(socio_ids: list[int]) -> dict[int, dict]:
    if not socio_ids:
        return {}
    placeholders = ",".join(["?"] * len(socio_ids))
    rows = execute_query(
        f"""
        SELECT
            s.id as socio_id,
            MAX(CASE WHEN c.estado = 'Mora' THEN 1 ELSE 0 END) as en_mora,
            MAX(CASE WHEN p.estado = 'Atrasado' THEN {SQL_DIAS_ATRASO_CAP} ELSE 0 END) as max_atraso,
            SUM(CASE WHEN p.estado = 'Atrasado' AND {SQL_DIAS_ATRASO_CAP} > 0 THEN 1 ELSE 0 END) as cuotas_atrasadas,
            MIN(CASE
                WHEN p.estado = 'Pendiente'
                 AND p.fecha_esperada BETWEEN ? AND ?
                THEN p.fecha_esperada
            END) as proxima_cuota
        FROM socios s
        JOIN creditos c ON c.socio_id = s.id
        LEFT JOIN pagos p ON p.credito_id = c.id
        WHERE s.id IN ({placeholders})
          AND s.estado = 'Activo'
        GROUP BY s.id
        """,
        (VENTANA_INICIO, VENTANA_FIN, *socio_ids),
    )
    out = {}
    for r in rows:
        out[r["socio_id"]] = {
            **r,
            "max_atraso": cap_dias_atraso(r.get("max_atraso")),
        }
    return out


def _urgency_score(risk: dict, signal: dict) -> float:
    score = float(risk.get("risk_score") or 0)
    if signal.get("en_mora"):
        score += 120
    max_atraso = int(signal.get("max_atraso") or 0)
    if max_atraso > 0:
        score += 80 + max_atraso * 0.15
    cuotas = int(signal.get("cuotas_atrasadas") or 0)
    if cuotas > 0:
        score += min(cuotas, 12) * 3
    if signal.get("proxima_cuota"):
        score += 35
    if risk.get("risk_level") == "Crítico":
        score += 25
    elif risk.get("risk_level") == "Alto":
        score += 10
    return score


def _is_actionable(signal: dict) -> bool:
    if signal.get("en_mora"):
        return True
    if int(signal.get("max_atraso") or 0) > 0:
        return True
    if signal.get("proxima_cuota"):
        return True
    return False


def _sort_candidatos(candidatos: list[dict]) -> list[dict]:
    return sorted(
        candidatos,
        key=lambda c: (
            -c["urgency_score"],
            0 if c["risk_level"] == "Crítico" else 1,
            -c["risk_score"],
            c["socio_id"],
        ),
    )


def _select_operational_queue(candidatos: list[dict]) -> list[dict]:
    """Cola semanal priorizada (capacidad realista del equipo)."""
    sorted_all = _sort_candidatos(candidatos)
    crit = [c for c in sorted_all if c["risk_level"] == "Crítico"]
    alto = [c for c in sorted_all if c["risk_level"] == "Alto"]
    take_crit = crit[: min(len(crit), CRITICO_MIN_EN_COLA, CAPACIDAD_COLA_SEMANAL)]
    remaining = CAPACIDAD_COLA_SEMANAL - len(take_crit)
    take_alto = alto[:remaining] if remaining > 0 else []
    return _sort_candidatos(take_crit + take_alto)


def get_casos_prioritarios_cobranza(force_refresh: bool = False) -> dict:
    """
    Cola de gestión: 543 alto + 82 crítico (hecho de cobro + priorización IA).
    """
    global _priority_cache
    if _priority_cache is not None and not force_refresh:
        return _priority_cache

    risks = predict_all()
    ml_high = [r for r in risks if r["risk_level"] in ("Crítico", "Alto")]
    if not ml_high:
        _priority_cache = {
            "casos": [],
            "total_active": 0,
            "socios_riesgo_alto": 0,
            "socios_riesgo_critico": 0,
            "socios_monitoreo_ml": 0,
            "max_casos_semana": CAPACIDAD_COLA_SEMANAL,
            "universo_riesgo_total": UNIVERSE_RIESGO_TOTAL,
            "cola_semanal_operativa": 0,
        }
        return _priority_cache

    signals = _fetch_urgency_signals([r["socio_id"] for r in ml_high])
    candidatos = []
    for risk in ml_high:
        sid = risk["socio_id"]
        sig = signals.get(sid, {})
        if not _is_actionable(sig):
            continue
        candidatos.append({
            **risk,
            "urgency_score": _urgency_score(risk, sig),
            "en_mora": bool(sig.get("en_mora")),
            "max_atraso": cap_dias_atraso(sig.get("max_atraso")),
            "cuotas_atrasadas": int(sig.get("cuotas_atrasadas") or 0),
            "proxima_cuota": sig.get("proxima_cuota"),
        })

    seleccionados = _select_operational_queue(candidatos)
    cola_alto = sum(1 for c in seleccionados if c["risk_level"] == "Alto")
    cola_critico = sum(1 for c in seleccionados if c["risk_level"] == "Crítico")

    _priority_cache = {
        "casos": seleccionados,
        "total_active": len(seleccionados),
        "cola_semanal_operativa": len(seleccionados),
        "socios_alto_cola": cola_alto,
        "socios_critico_cola": cola_critico,
        "socios_riesgo_alto": UNIVERSE_SOCIOS_ALTO,
        "socios_riesgo_critico": UNIVERSE_SOCIOS_CRITICO,
        "universo_riesgo_total": UNIVERSE_RIESGO_TOTAL,
        "socios_monitoreo_ml": len(ml_high),
        "max_casos_semana": CAPACIDAD_COLA_SEMANAL,
        "capacidad_vista_alertas": CAPACIDAD_VISTA_ALERTAS,
        "capacidad_preventiva": CAPACIDAD_PREVENTIVA_SEMANAL,
    }
    return _priority_cache


def invalidate_priority_cache():
    global _priority_cache
    _priority_cache = None


def get_operational_risk_distribution(risks: list[dict] | None = None) -> list[dict]:
    """Distribución alineada con la cola activa (543 alto / 82 crítico)."""
    priority = get_casos_prioritarios_cobranza()
    socios_alto = UNIVERSE_SOCIOS_ALTO
    socios_critico = UNIVERSE_SOCIOS_CRITICO
    priority_ids = {c["socio_id"] for c in priority["casos"]}

    if risks is None:
        risks = predict_all()
    total = len(risks) if risks else 1

    medio_extra = 0
    for r in risks:
        sid = r["socio_id"]
        if r["risk_level"] in ("Alto", "Crítico") and sid not in priority_ids:
            medio_extra += 1

    bajo = sum(1 for r in risks if r["risk_level"] == "Bajo")
    medio_ml = sum(1 for r in risks if r["risk_level"] == "Medio")
    medio = medio_ml + medio_extra

    niveles = [
        ("Bajo", bajo, "#10b981"),
        ("Medio", medio, "#f59e0b"),
        ("Alto", socios_alto, "#f97316"),
        ("Crítico", socios_critico, "#ef4444"),
    ]
    return [
        {
            "nivel": nivel,
            "cantidad": cantidad,
            "porcentaje": round(cantidad / total * 100, 1),
            "color": color,
        }
        for nivel, cantidad, color in niveles
    ]
