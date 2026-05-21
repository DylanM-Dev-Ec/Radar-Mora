"""
dashboard.py - Endpoints del dashboard para CoopTech Tulcán.
"""

from fastapi import APIRouter
from database import execute_query, execute_query_one
from models.risk_model import predict_all, model_exists

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


def _get_all_risks() -> list[dict]:
    """Obtiene los riesgos de todos los socios (con caché simple)."""
    if not model_exists():
        return []
    return predict_all()


@router.get("/overview")
def get_overview():
    """Retorna resumen general del dashboard."""
    total_socios = execute_query_one(
        "SELECT COUNT(*) as cnt FROM socios WHERE estado = 'Activo'"
    )["cnt"]

    creditos_vigentes = execute_query_one(
        "SELECT COUNT(*) as cnt FROM creditos WHERE estado IN ('Vigente', 'Mora', 'Reestructurado')"
    )["cnt"]

    cartera = execute_query_one(
        "SELECT COALESCE(SUM(monto), 0) as total FROM creditos WHERE estado IN ('Vigente', 'Mora', 'Reestructurado')"
    )["total"]

    total_creditos_activos = execute_query_one(
        "SELECT COUNT(*) as cnt FROM creditos WHERE estado IN ('Vigente', 'Mora', 'Reestructurado')"
    )["cnt"]

    creditos_mora = execute_query_one(
        "SELECT COUNT(*) as cnt FROM creditos WHERE estado = 'Mora'"
    )["cnt"]

    tasa_morosidad = round(creditos_mora / max(1, total_creditos_activos) * 100, 2)

    # Obtener riesgos
    risks = _get_all_risks()
    socios_alto = sum(1 for r in risks if r["risk_level"] == "Alto")
    socios_critico = sum(1 for r in risks if r["risk_level"] == "Crítico")

    # Monto en riesgo (créditos de socios con riesgo alto o crítico)
    socios_en_riesgo_ids = [r["socio_id"] for r in risks if r["risk_level"] in ("Alto", "Crítico")]
    monto_en_riesgo = 0
    if socios_en_riesgo_ids:
        placeholders = ",".join(["?" for _ in socios_en_riesgo_ids])
        result = execute_query_one(
            f"SELECT COALESCE(SUM(monto), 0) as total FROM creditos "
            f"WHERE socio_id IN ({placeholders}) AND estado IN ('Vigente', 'Mora', 'Reestructurado')",
            tuple(socios_en_riesgo_ids)
        )
        monto_en_riesgo = result["total"]

    return {
        "total_socios": total_socios,
        "creditos_vigentes": creditos_vigentes,
        "cartera_total": round(cartera, 2),
        "tasa_morosidad": tasa_morosidad,
        "socios_riesgo_alto": socios_alto,
        "socios_riesgo_critico": socios_critico,
        "monto_en_riesgo": round(monto_en_riesgo, 2),
    }


@router.get("/risk-distribution")
def get_risk_distribution():
    """Retorna distribución de niveles de riesgo."""
    risks = _get_all_risks()
    total = len(risks) if risks else 1

    niveles = {
        "Bajo": {"color": "#10b981", "cantidad": 0},
        "Medio": {"color": "#f59e0b", "cantidad": 0},
        "Alto": {"color": "#f97316", "cantidad": 0},
        "Crítico": {"color": "#ef4444", "cantidad": 0},
    }

    for r in risks:
        level = r["risk_level"]
        if level in niveles:
            niveles[level]["cantidad"] += 1

    return [
        {
            "nivel": nivel,
            "cantidad": data["cantidad"],
            "porcentaje": round(data["cantidad"] / total * 100, 1),
            "color": data["color"],
        }
        for nivel, data in niveles.items()
    ]


@router.get("/trend")
def get_trend():
    """Retorna tendencia de morosidad por mes (últimos 12 meses)."""
    results = execute_query("""
        WITH meses AS (
            SELECT DISTINCT strftime('%Y-%m', fecha_esperada) as mes
            FROM pagos
            WHERE fecha_esperada >= date('2025-06-01')
              AND fecha_esperada <= date('2026-05-21')
            ORDER BY mes
        )
        SELECT
            m.mes,
            COALESCE(SUM(CASE WHEN p.estado = 'Atrasado' THEN 1 ELSE 0 END), 0) as atrasados,
            COALESCE(COUNT(p.id), 1) as total
        FROM meses m
        LEFT JOIN pagos p ON strftime('%Y-%m', p.fecha_esperada) = m.mes
        GROUP BY m.mes
        ORDER BY m.mes
    """)

    trend = []
    for row in results:
        tasa = round(row["atrasados"] / max(1, row["total"]) * 100, 2)
        trend.append({
            "mes": row["mes"],
            "tasa_morosidad": tasa,
            "nuevos_morosos": row["atrasados"],
        })

    return trend


@router.get("/risk-by-agency")
def get_risk_by_agency():
    """Retorna distribución de riesgo por agencia."""
    risks = _get_all_risks()
    risk_map = {r["socio_id"]: r["risk_level"] for r in risks}

    # Obtener socios con su agencia
    socios = execute_query("""
        SELECT DISTINCT s.id, s.agencia
        FROM socios s
        JOIN creditos c ON c.socio_id = s.id
        WHERE c.estado IN ('Vigente', 'Mora', 'Reestructurado')
    """)

    agencias = {}
    for s in socios:
        ag = s["agencia"]
        if ag not in agencias:
            agencias[ag] = {"total": 0, "Bajo": 0, "Medio": 0, "Alto": 0, "Crítico": 0}

        agencias[ag]["total"] += 1
        level = risk_map.get(s["id"], "Bajo")
        if level in agencias[ag]:
            agencias[ag][level] += 1

    return [
        {
            "agencia": ag,
            "total": data["total"],
            "bajo": data["Bajo"],
            "medio": data["Medio"],
            "alto": data["Alto"],
            "critico": data["Crítico"],
        }
        for ag, data in sorted(agencias.items())
    ]
