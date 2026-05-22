"""
alerts.py - Endpoints de alertas para CoopTech Tulcán.
"""

from fastapi import APIRouter, HTTPException, Body, Path, Query
from database import execute_query, execute_query_one, SQL_DIAS_ATRASO_CAP, cap_dias_atraso
from models.risk_model import model_exists, predict_all
from models.cobranza_priority import (
    FECHA_REF,
    VENTANA_INICIO,
    VENTANA_FIN,
    CAPACIDAD_VISTA_ALERTAS,
    CAPACIDAD_PREVENTIVA_SEMANAL,
    UNIVERSE_RIESGO_TOTAL,
    get_casos_prioritarios_cobranza,
)
from models.preventive_cache import get_preventive_index, invalidate_preventive_cache

PREVENTIVE_PAGE_DEFAULT = 50
PREVENTIVE_PAGE_MAX = 50

router = APIRouter(prefix="/api", tags=["Alertas y Modelo"])

LEVEL_ORDER = {"Crítico": 0, "Alto": 1, "Medio": 2, "Bajo": 3}


def _build_alert_message(socio_id: int, risk_level: str, risk_score: float, context: dict) -> str:
    """Mensaje descriptivo alineado con el nivel del modelo Radar-Mora."""
    parts = [f"Clasificación {risk_level} por Radar-Mora (score {risk_score:.1f})."]
    max_atraso = context.get("max_atraso") or 0
    cuotas = context.get("cuotas_atrasadas") or 0
    if cuotas > 0:
        parts.append(f"{cuotas} cuota(s) atrasada(s), máximo {max_atraso} días.")
    saldo = context.get("saldo_resultante")
    if saldo is not None and saldo < 20:
        parts.append(f"Saldo crítico en cuenta: ${saldo:.2f}.")
    if context.get("alerta_critica_ia"):
        parts.append("Alerta crítica de comportamiento financiero.")
    elif context.get("alerta_retiro_ahorros"):
        parts.append("Retiro inusual de ahorros detectado.")
    elif context.get("alerta_caida_actividad"):
        parts.append("Caída de actividad transaccional.")
    return " ".join(parts)


def _fetch_mora_context(socio_ids: list[int]) -> dict[int, dict]:
    """Contexto de mora por socio (solo para IDs solicitados)."""
    if not socio_ids:
        return {}
    placeholders = ",".join(["?" for _ in socio_ids])
    rows = execute_query(f"""
        SELECT
            s.id as socio_id,
            MAX({SQL_DIAS_ATRASO_CAP}) as max_atraso,
            COUNT(*) as cuotas_atrasadas
        FROM pagos p
        JOIN creditos c ON p.credito_id = c.id
        JOIN socios s ON c.socio_id = s.id
        WHERE p.estado = 'Atrasado' AND {SQL_DIAS_ATRASO_CAP} > 0
          AND s.id IN ({placeholders})
        GROUP BY s.id
    """, tuple(socio_ids))
    return {
        r["socio_id"]: {**r, "max_atraso": cap_dias_atraso(r.get("max_atraso"))}
        for r in rows
    }


def _fetch_socio_names(socio_ids: list[int]) -> dict[int, str]:
    if not socio_ids:
        return {}
    placeholders = ",".join(["?" for _ in socio_ids])
    rows = execute_query(
        f"SELECT id, nombre FROM socios WHERE id IN ({placeholders})",
        tuple(socio_ids),
    )
    return {r["id"]: r["nombre"] for r in rows}


@router.get("/alerts")
def get_alerts(limit: int = CAPACIDAD_VISTA_ALERTAS):
    """
    Vista de alertas: hasta `limit` filas de la cola semanal operativa.
    total_active = cola semanal; universo_riesgo_total = socios alto+crítico en radar.
    """
    empty = {
        "alerts": [],
        "total_counts": {"alta": 0, "critica": 0, "media": 0, "baja": 0},
        "total_active": 0,
        "cola_semanal_operativa": 0,
        "universo_riesgo_total": UNIVERSE_RIESGO_TOTAL,
        "displayed_count": 0,
        "display_limit": limit,
        "socios_riesgo_alto": 0,
        "socios_riesgo_critico": 0,
        "socios_monitoreo_ml": 0,
        "max_casos_semana": 300,
    }

    if not model_exists():
        return empty

    priority = get_casos_prioritarios_cobranza()
    casos = priority["casos"]
    cola_total = priority["cola_semanal_operativa"]
    universo_total = priority.get("universo_riesgo_total", UNIVERSE_RIESGO_TOTAL)
    socios_alto_univ = priority["socios_riesgo_alto"]
    socios_critico_univ = priority["socios_riesgo_critico"]
    cola_alto = priority.get("socios_alto_cola", 0)
    cola_critico = priority.get("socios_critico_cola", 0)

    total_counts = {
        "critica": cola_critico,
        "alta": cola_alto,
        "media": 0,
        "baja": 0,
    }

    if not casos:
        return {
            **empty,
            "total_counts": total_counts,
            "socios_monitoreo_ml": priority.get("socios_monitoreo_ml", 0),
        }

    display_limit = min(max(1, limit), CAPACIDAD_VISTA_ALERTAS)
    display_casos = casos[:display_limit]
    display_ids = [r["socio_id"] for r in display_casos]
    names = _fetch_socio_names(display_ids)
    mora_ctx = _fetch_mora_context(display_ids)

    # Saldos bajos solo para la página visible
    saldo_rows = {}
    if display_ids:
        ph = ",".join(["?" for _ in display_ids])
        for row in execute_query(f"""
            SELECT t.socio_id, t.saldo_resultante
            FROM transacciones t
            WHERE t.id IN (SELECT MAX(id) FROM transacciones GROUP BY socio_id)
              AND t.socio_id IN ({ph})
        """, tuple(display_ids)):
            saldo_rows[row["socio_id"]] = row["saldo_resultante"]

    alerts = []
    for idx, r in enumerate(display_casos, start=1):
        sid = r["socio_id"]
        ctx = dict(mora_ctx.get(sid, {}))
        ctx.setdefault("max_atraso", r.get("max_atraso"))
        ctx.setdefault("cuotas_atrasadas", r.get("cuotas_atrasadas"))
        if sid in saldo_rows:
            ctx["saldo_resultante"] = saldo_rows[sid]
        prioridad = "critica" if r["risk_level"] == "Crítico" else "alta"
        tipo = "Cobranza urgente" if r.get("en_mora") or r.get("max_atraso") else "Alerta Radar-Mora"
        alerts.append({
            "id": idx,
            "socio_id": sid,
            "socio_nombre": names.get(sid, f"Socio {sid}"),
            "tipo": tipo,
            "mensaje": _build_alert_message(sid, r["risk_level"], r["risk_score"], ctx),
            "fecha": FECHA_REF,
            "risk_score": r["risk_score"],
            "risk_level": r["risk_level"],
            "prioridad": prioridad,
        })

    return {
        "alerts": alerts,
        "total_counts": total_counts,
        "total_active": cola_total,
        "cola_semanal_operativa": cola_total,
        "universo_riesgo_total": universo_total,
        "displayed_count": len(alerts),
        "display_limit": display_limit,
        "socios_riesgo_alto": socios_alto_univ,
        "socios_riesgo_critico": socios_critico_univ,
        "socios_alto_cola": cola_alto,
        "socios_critico_cola": cola_critico,
        "socios_monitoreo_ml": priority.get("socios_monitoreo_ml", 0),
        "max_casos_semana": priority.get("max_casos_semana", 300),
    }


@router.get("/model/feature-importance")
def get_feature_importance():
    """Retorna importancia de features del modelo."""
    from models.risk_model import get_feature_importance
    return get_feature_importance()


@router.get("/model/info")
def get_model_info():
    """Retorna información y métricas del modelo."""
    from models.risk_model import get_model_info
    return get_model_info()


def _empty_preventive_response(limit: int = PREVENTIVE_PAGE_DEFAULT, offset: int = 0):
    return _preventive_payload([], [], limit, offset)


def _is_sin_gestion(accion) -> bool:
    return not accion or accion in ("Ninguna", "sin_gestionar", "")


def _matches_gestion_filter(item: dict, gestion: str | None) -> bool:
    if not gestion:
        return True
    accion = item.get("accion_preventiva")
    if gestion == "sin_gestionar":
        return _is_sin_gestion(accion)
    if gestion == "gestionados":
        return not _is_sin_gestion(accion)
    return accion == gestion


def _filter_preventive_items(
    items: list[dict],
    search: str | None,
    risk_level: str | None,
    gestion: str | None,
    agencia: str | None,
) -> list[dict]:
    q = (search or "").strip().lower()
    risk = (risk_level or "").strip()
    ag = (agencia or "").strip()

    filtered = []
    for item in items:
        if risk and item.get("risk_level") != risk:
            continue
        if ag and (item.get("socio_agencia") or "") != ag:
            continue
        if not _matches_gestion_filter(item, gestion):
            continue
        if q:
            blob = " ".join([
                str(item.get("socio_nombre") or ""),
                str(item.get("socio_cedula") or ""),
                str(item.get("socio_agencia") or ""),
            ]).lower()
            if q not in blob:
                continue
        filtered.append(item)
    return filtered


def _preventive_payload(
    page_items: list[dict],
    filtered: list[dict],
    limit: int,
    offset: int,
    all_items: list[dict] | None = None,
):
    all_items = all_items if all_items is not None else filtered
    total_all = len(all_items)
    total_filtered = len(filtered)
    total_pages = max(1, (total_filtered + limit - 1) // limit) if total_filtered else 1
    page = (offset // limit) + 1 if limit else 1
    pending = sum(1 for x in filtered if _is_sin_gestion(x.get("accion_preventiva")))
    managed = total_filtered - pending
    volume = sum(float(x.get("monto_esperado") or 0) for x in filtered)
    priority = get_casos_prioritarios_cobranza()
    agencies = sorted({x["socio_agencia"] for x in all_items if x.get("socio_agencia")})

    return {
        "items": page_items,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total": total_filtered,
            "page": page,
            "total_pages": total_pages,
            "has_next": offset + limit < total_filtered,
            "has_prev": offset > 0,
        },
        "total_active": total_all,
        "filtered_total": total_filtered,
        "displayed_count": len(page_items),
        "total_pending_gestion": pending,
        "total_managed": managed,
        "total_volume": round(volume, 2),
        "socios_riesgo_alto": sum(1 for x in filtered if x.get("risk_level") == "Alto"),
        "socios_riesgo_critico": sum(1 for x in filtered if x.get("risk_level") == "Crítico"),
        "universo_riesgo_total": priority.get("universo_riesgo_total", UNIVERSE_RIESGO_TOTAL),
        "cola_semanal_operativa": priority.get("cola_semanal_operativa", 0),
        "capacidad_preventiva": CAPACIDAD_PREVENTIVA_SEMANAL,
        "ventana_inicio": VENTANA_INICIO,
        "ventana_fin": VENTANA_FIN,
        "fecha_corte": FECHA_REF,
        "agencies": agencies,
    }


def _preventive_summary_from_items(items: list[dict]) -> dict:
    pending = sum(1 for x in items if _is_sin_gestion(x.get("accion_preventiva")))
    priority = get_casos_prioritarios_cobranza()
    return {
        "total_active": len(items),
        "total_pending_gestion": pending,
        "total_managed": len(items) - pending,
        "socios_riesgo_alto": sum(1 for x in items if x.get("risk_level") == "Alto"),
        "socios_riesgo_critico": sum(1 for x in items if x.get("risk_level") == "Crítico"),
        "universo_riesgo_total": priority.get("universo_riesgo_total", UNIVERSE_RIESGO_TOTAL),
        "cola_semanal_operativa": priority.get("cola_semanal_operativa", 0),
    }


@router.get("/alerts/preventive/summary")
def get_preventive_summary():
    """Totales ligeros para badges y KPIs (sin lista de casos)."""
    if not model_exists():
        return _preventive_summary_from_items([])
    items = get_preventive_index()
    return _preventive_summary_from_items(items)


@router.get("/alerts/preventive")
def get_preventive_alerts(
    limit: int = Query(PREVENTIVE_PAGE_DEFAULT, ge=1, le=PREVENTIVE_PAGE_MAX),
    offset: int = Query(0, ge=0),
    search: str | None = Query(None, max_length=120),
    risk_level: str | None = Query(None, max_length=20),
    gestion: str | None = Query(None, max_length=80),
    agencia: str | None = Query(None, max_length=120),
):
    """
    Cobranza preventiva paginada: cuota pendiente por vencer (15 días) y riesgo Alto/Crítico.
    """
    if not model_exists():
        return _empty_preventive_response(limit, offset)

    all_items = get_preventive_index()
    if not all_items:
        return _empty_preventive_response(limit, offset)

    filtered = _filter_preventive_items(all_items, search, risk_level, gestion, agencia)
    page_items = filtered[offset : offset + limit]
    return _preventive_payload(page_items, filtered, limit, offset, all_items)


@router.post("/alerts/preventive/{pago_id}/action")
def save_preventive_action(
    pago_id: int = Path(..., description="ID del pago"),
    payload: dict = Body(..., description="Cuerpo con la acción preventiva")
):
    """Registra una acción preventiva tomada para una cuota próxima a vencer."""
    action = payload.get("action")
    if not action:
        raise HTTPException(status_code=400, detail="El campo 'action' es obligatorio.")
        
    from database import execute_write, execute_query_one
    
    # Comprobar que el pago existe
    pago = execute_query_one("SELECT 1 FROM pagos WHERE id = ?", (pago_id,))
    if not pago:
        raise HTTPException(status_code=404, detail=f"No se encontró el pago con ID {pago_id}.")
        
    execute_write("UPDATE pagos SET accion_preventiva = ? WHERE id = ?", (action, pago_id))
    invalidate_preventive_cache()
    return {"status": "ok", "message": "Acción preventiva guardada con éxito."}
