"""
alerts.py - Endpoints de alertas para CoopTech Tulcán.
"""

from fastapi import APIRouter
from database import execute_query
from models.risk_model import predict_all, model_exists

router = APIRouter(prefix="/api", tags=["Alertas y Modelo"])


@router.get("/alerts")
def get_alerts():
    """Genera alertas basadas en el análisis de riesgo y comportamiento."""

    alerts = []
    alert_id = 0

    if not model_exists():
        return alerts

    risks = predict_all()
    risk_map = {r["socio_id"]: r for r in risks}

    # ─── 1. Socios con riesgo Crítico o Alto ───
    socios_riesgo = execute_query("""
        SELECT s.id, s.nombre FROM socios s
        JOIN creditos c ON c.socio_id = s.id
        WHERE c.estado IN ('Vigente', 'Mora', 'Reestructurado')
          AND s.estado = 'Activo'
        GROUP BY s.id
    """)

    for s in socios_riesgo:
        risk_data = risk_map.get(s["id"])
        if not risk_data:
            continue

        if risk_data["risk_level"] == "Crítico":
            alert_id += 1
            alerts.append({
                "id": alert_id,
                "socio_id": s["id"],
                "socio_nombre": s["nombre"],
                "tipo": "Cambio de categoría",
                "mensaje": f"Socio clasificado en riesgo CRÍTICO con score de {risk_data['risk_score']}. Requiere atención inmediata.",
                "fecha": "2026-05-21",
                "risk_score": risk_data["risk_score"],
                "risk_level": risk_data["risk_level"],
                "prioridad": "alta",
            })
        elif risk_data["risk_level"] == "Alto":
            alert_id += 1
            alerts.append({
                "id": alert_id,
                "socio_id": s["id"],
                "socio_nombre": s["nombre"],
                "tipo": "Cambio de categoría",
                "mensaje": f"Socio en riesgo ALTO con score de {risk_data['risk_score']}. Se recomienda seguimiento.",
                "fecha": "2026-05-21",
                "risk_score": risk_data["risk_score"],
                "risk_level": risk_data["risk_level"],
                "prioridad": "media",
            })

    # ─── 2. Atrasos detectados (pagos con más de 30 días de atraso) ───
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

    # ─── 3. Saldo crítico (últimas transacciones con saldo muy bajo) ───
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

    # ─── 4. Patrón inusual (alta frecuencia de retiros recientes) ───
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

    return alerts


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
