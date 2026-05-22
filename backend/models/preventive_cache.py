"""
Índice en memoria de cobranza preventiva (una construcción por proceso; se invalida al guardar acciones).
"""
from __future__ import annotations

from datetime import date

from database import execute_query, FECHA_CORTE
from models.risk_model import model_exists, predict_all
from models.cobranza_priority import VENTANA_INICIO, VENTANA_FIN

LEVEL_ORDER = {"Crítico": 0, "Alto": 1}

_preventive_cache: list[dict] | None = None


def invalidate_preventive_cache() -> None:
    global _preventive_cache
    _preventive_cache = None


def get_preventive_index() -> list[dict]:
    """Lista ordenada de casos preventivos (alto/crítico, una cuota por socio en ventana)."""
    global _preventive_cache
    if _preventive_cache is not None:
        return _preventive_cache

    if not model_exists():
        _preventive_cache = []
        return _preventive_cache

    risks = predict_all()
    high_risk = {r["socio_id"]: r for r in risks if r["risk_level"] in ("Crítico", "Alto")}
    if not high_risk:
        _preventive_cache = []
        return _preventive_cache

    rows = execute_query(
        """
        SELECT
            p.id as pago_id,
            p.num_cuota,
            p.fecha_esperada,
            p.monto_esperado,
            p.accion_preventiva,
            s.id as socio_id,
            s.nombre as socio_nombre,
            s.cedula as socio_cedula,
            s.telefono as socio_telefono,
            s.email as socio_email,
            s.agencia as socio_agencia,
            c.monto as credito_monto,
            c.tipo as credito_tipo
        FROM pagos p
        JOIN creditos c ON p.credito_id = c.id
        JOIN socios s ON c.socio_id = s.id
        WHERE p.estado = 'Pendiente'
          AND p.fecha_esperada BETWEEN ? AND ?
          AND s.estado = 'Activo'
        ORDER BY p.fecha_esperada ASC
        """,
        (VENTANA_INICIO, VENTANA_FIN),
    )

    items: list[dict] = []
    seen_socio: set[int] = set()

    for r in rows:
        sid = r["socio_id"]
        if sid not in high_risk or sid in seen_socio:
            continue
        seen_socio.add(sid)
        risk_info = high_risk[sid]
        fecha_esp = (r.get("fecha_esperada") or "")[:10]
        try:
            dias_para_vencer = (date.fromisoformat(fecha_esp) - FECHA_CORTE).days
        except ValueError:
            dias_para_vencer = None

        items.append({
            "pago_id": r["pago_id"],
            "num_cuota": r["num_cuota"],
            "fecha_esperada": fecha_esp,
            "dias_para_vencer": dias_para_vencer,
            "monto_esperado": r["monto_esperado"],
            "accion_preventiva": r["accion_preventiva"],
            "pago_estado": "Pendiente",
            "dias_atraso": 0,
            "socio_id": sid,
            "socio_nombre": r["socio_nombre"],
            "socio_cedula": r["socio_cedula"],
            "socio_telefono": r["socio_telefono"],
            "socio_email": r["socio_email"],
            "socio_agencia": r["socio_agencia"],
            "credito_monto": r["credito_monto"],
            "credito_tipo": r["credito_tipo"],
            "risk_score": risk_info["risk_score"],
            "risk_level": risk_info["risk_level"],
            "tipo_gestion": "Cuota por vencer (preventiva)",
        })

    items.sort(
        key=lambda x: (
            x.get("dias_para_vencer") if x.get("dias_para_vencer") is not None else 999,
            LEVEL_ORDER.get(x["risk_level"], 9),
            -float(x.get("risk_score") or 0),
        )
    )
    _preventive_cache = items
    return _preventive_cache
