"""
alerts.py - Endpoints de alertas para CoopTech Tulcán.
"""

from fastapi import APIRouter, HTTPException, Body, Path
from database import execute_query
from models.risk_model import predict_all, model_exists

router = APIRouter(prefix="/api", tags=["Alertas y Modelo"])


@router.get("/alerts")
def get_alerts(limit: int = 150):
    """Genera alertas basadas en el comportamiento conductual y desvíos financieros."""

    alerts = []
    alert_id = 0

    if not model_exists():
        return {
            "alerts": [],
            "total_counts": {"alta": 0, "media": 0, "baja": 0}
        }

    risks = predict_all()
    risk_map = {r["socio_id"]: r for r in risks}

    # ─── 1. Atrasos detectados (pagos con más de 30 días de atraso) ───
    atrasos = execute_query("""
        SELECT
            s.id as socio_id, s.nombre,
            MAX(p.dias_atraso) as max_atraso,
            COUNT(*) as cuotas_atrasadas
        FROM pagos p
        JOIN creditos c ON p.credito_id = c.id
        JOIN socios s ON c.socio_id = s.id
        WHERE p.estado = 'Atrasado' AND p.dias_atraso > 30
        GROUP BY s.id
        ORDER BY max_atraso DESC
        LIMIT 30
    """)

    for a in atrasos:
        risk_data = risk_map.get(a["socio_id"], {"risk_score": 0, "risk_level": "Sin datos"})
        alert_id += 1
        alerts.append({
            "id": alert_id,
            "socio_id": a["socio_id"],
            "socio_nombre": a["nombre"],
            "tipo": "Atraso detectado",
            "mensaje": f"{a['cuotas_atrasadas']} cuota(s) atrasada(s). Máximo atraso: {a['max_atraso']} días.",
            "fecha": "2026-05-21",
            "risk_score": risk_data["risk_score"],
            "risk_level": risk_data["risk_level"],
            "prioridad": "alta" if a["max_atraso"] > 60 else "media",
        })

    # ─── 2. Saldo crítico (últimas transacciones con saldo muy bajo) ───
    saldos_criticos = execute_query("""
        SELECT
            t.socio_id, s.nombre, t.saldo_resultante
        FROM transacciones t
        JOIN socios s ON t.socio_id = s.id
        WHERE t.id IN (
            SELECT MAX(id) FROM transacciones GROUP BY socio_id
        )
        AND t.saldo_resultante < 20
        AND s.estado = 'Activo'
        ORDER BY t.saldo_resultante ASC
        LIMIT 20
    """)

    for sc in saldos_criticos:
        risk_data = risk_map.get(sc["socio_id"], {"risk_score": 0, "risk_level": "Sin datos"})
        alert_id += 1
        alerts.append({
            "id": alert_id,
            "socio_id": sc["socio_id"],
            "socio_nombre": sc["nombre"],
            "tipo": "Saldo crítico",
            "mensaje": f"Saldo de cuenta en nivel crítico: ${sc['saldo_resultante']:.2f}. Posible riesgo de impago.",
            "fecha": "2026-05-21",
            "risk_score": risk_data["risk_score"],
            "risk_level": risk_data["risk_level"],
            "prioridad": "media",
        })

    # ─── 3. Patrón inusual (alta frecuencia de retiros recientes) ───
    patrones = execute_query("""
        SELECT
            t.socio_id, s.nombre,
            COUNT(CASE WHEN t.tipo IN ('Retiro', 'Transferencia Enviada') THEN 1 END) as retiros,
            COUNT(CASE WHEN t.tipo = 'Depósito' THEN 1 END) as depositos
        FROM transacciones t
        JOIN socios s ON t.socio_id = s.id
        WHERE t.fecha >= date('2026-03-01')
          AND s.estado = 'Activo'
        GROUP BY t.socio_id
        HAVING retiros > depositos * 2 AND depositos > 0
        ORDER BY retiros DESC
        LIMIT 15
    """)

    for p in patrones:
        risk_data = risk_map.get(p["socio_id"], {"risk_score": 0, "risk_level": "Sin datos"})
        alert_id += 1
        alerts.append({
            "id": alert_id,
            "socio_id": p["socio_id"],
            "socio_nombre": p["nombre"],
            "tipo": "Patrón inusual",
            "mensaje": f"Patrón de retiros inusual detectado: {p['retiros']} retiros vs {p['depositos']} depósitos en los últimos 3 meses.",
            "fecha": "2026-05-21",
            "risk_score": risk_data["risk_score"],
            "risk_level": risk_data["risk_level"],
            "prioridad": "baja",
        })

    # Ordenar por prioridad
    prioridad_order = {"alta": 0, "media": 1, "baja": 2}
    alerts.sort(key=lambda x: (prioridad_order.get(x["prioridad"], 3), -x["risk_score"]))

    # Computar contadores globales antes del límite
    total_counts = {
        "alta": len([a for a in alerts if a["prioridad"] in ("alta", "critica")]),
        "media": len([a for a in alerts if a["prioridad"] == "media"]),
        "baja": len([a for a in alerts if a["prioridad"] == "baja"])
    }

    return {
        "alerts": alerts[:limit],
        "total_counts": total_counts
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


@router.get("/alerts/preventive")
def get_preventive_alerts():
    """Retorna los pagos futuros a vencer en los próximos 15 días de socios de alto riesgo."""
    alerts = []
    
    if not model_exists():
        return alerts

    # 1. Obtener predicciones de riesgo
    risks = predict_all()
    high_risk_socios = {r["socio_id"]: r for r in risks if r["risk_level"] in ("Crítico", "Alto")}
    
    if not high_risk_socios:
        return alerts

    # 2. Consultar cuotas pendientes en el rango de fechas (2026-05-22 al 2026-06-06)
    query = """
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
          AND p.fecha_esperada BETWEEN '2026-05-22' AND '2026-06-06'
          AND s.estado = 'Activo'
    """
    rows = execute_query(query)
    
    for r in rows:
        soc_id = r["socio_id"]
        if soc_id in high_risk_socios:
            risk_info = high_risk_socios[soc_id]
            alerts.append({
                "pago_id": r["pago_id"],
                "num_cuota": r["num_cuota"],
                "fecha_esperada": r["fecha_esperada"],
                "monto_esperado": r["monto_esperado"],
                "accion_preventiva": r["accion_preventiva"],
                "socio_id": soc_id,
                "socio_nombre": r["socio_nombre"],
                "socio_cedula": r["socio_cedula"],
                "socio_telefono": r["socio_telefono"],
                "socio_email": r["socio_email"],
                "socio_agencia": r["socio_agencia"],
                "credito_monto": r["credito_monto"],
                "credito_tipo": r["credito_tipo"],
                "risk_score": risk_info["risk_score"],
                "risk_level": risk_info["risk_level"]
            })
            
    # Ordenar por nivel de riesgo (Crítico > Alto) y luego por fecha esperada más cercana
    level_order = {"Crítico": 0, "Alto": 1}
    alerts.sort(key=lambda x: (level_order.get(x["risk_level"], 2), x["fecha_esperada"]))
    
    return alerts


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
    return {"status": "ok", "message": "Acción preventiva guardada con éxito."}
