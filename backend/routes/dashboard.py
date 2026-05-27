"""
dashboard.py - Endpoints del dashboard para CoopTech Tulcán.
"""

from fastapi import APIRouter
from database import execute_query, execute_query_one
from models.risk_model import predict_all, model_exists
from models.cobranza_priority import get_casos_prioritarios_cobranza, get_operational_risk_distribution
from chart_series import enrich_trend_series, enrich_mora_rango_series, enrich_cargas_mora_series
import time

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

# In-memory caches for dashboard endpoints
_TREND_CACHE = None
_TREND_CACHE_TIMESTAMP = 0.0

_EXTENDED_STATS_CACHE = None
_EXTENDED_STATS_CACHE_TIMESTAMP = 0.0

CACHE_DURATION = 300.0  # 5 minutes cache duration


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

    total_socios_registrados = execute_query_one(
        "SELECT COUNT(*) as cnt FROM socios"
    )["cnt"]

    pct_socios_activos = round(
        total_socios / max(1, total_socios_registrados) * 100, 1
    )

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

    # Cola operativa de cobranza (volumen realista, no todo el universo ML)
    priority = get_casos_prioritarios_cobranza()
    socios_alto = priority["socios_riesgo_alto"]
    socios_critico = priority["socios_riesgo_critico"]
    socios_en_riesgo_ids = [c["socio_id"] for c in priority["casos"]]
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
        "socios_activos": total_socios,
        "total_socios_registrados": total_socios_registrados,
        "pct_socios_activos": pct_socios_activos,
        "creditos_vigentes": creditos_vigentes,
        "total_creditos": creditos_vigentes,
        "cartera_total": round(cartera, 2),
        "tasa_morosidad": tasa_morosidad,
        "socios_riesgo_alto": socios_alto,
        "socios_riesgo_critico": socios_critico,
        "universo_riesgo_total": priority.get("universo_riesgo_total", 625),
        "monto_en_riesgo": round(monto_en_riesgo, 2),
        "casos_gestion_semana": priority.get("cola_semanal_operativa", priority["total_active"]),
        "cola_semanal_operativa": priority.get("cola_semanal_operativa", priority["total_active"]),
        "socios_monitoreo_ml": priority.get("socios_monitoreo_ml", 0),
        "max_casos_semana": priority.get("max_casos_semana", 300),
    }


@router.get("/risk-distribution")
def get_risk_distribution():
    """Distribución operativa: Alto/Crítico = cola activa de cobranza semanal."""
    risks = _get_all_risks()
    return get_operational_risk_distribution(risks)


@router.get("/trend")
def get_trend():
    """Retorna tendencia de morosidad por mes (últimos 12 meses) con caché."""
    global _TREND_CACHE, _TREND_CACHE_TIMESTAMP
    now = time.time()
    if _TREND_CACHE is not None and (now - _TREND_CACHE_TIMESTAMP) < CACHE_DURATION:
        return _TREND_CACHE

    results = execute_query("""
        SELECT
            substr(p.fecha_esperada, 1, 7) as mes,
            SUM(CASE WHEN p.estado = 'Atrasado' THEN 1 ELSE 0 END) as atrasados,
            COUNT(p.id) as total
        FROM pagos p
        WHERE p.fecha_esperada >= '2025-06-01' AND p.fecha_esperada <= '2026-05-21'
        GROUP BY mes
        ORDER BY mes
    """)

    trend = []
    for row in results:
        tasa = round(row["atrasados"] / max(1, row["total"]) * 100, 2)
        trend.append({
            "mes": row["mes"],
            "tasa_morosidad": tasa,
            "nuevos_morosos": row["atrasados"],
        })

    trend = enrich_trend_series(trend)
    _TREND_CACHE = trend
    _TREND_CACHE_TIMESTAMP = now
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
        if ag.startswith("Agencia "):
            ag = ag[len("Agencia "):]
        
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


def distribute_others_proportionally(data_list: list[dict], key_name: str, others_label: str = 'Otros') -> list[dict]:
    """
    Distribuye proporcionalmente los valores de la categoría 'Otros' (o inespecificados)
    entre las demás categorías válidas de la lista de diccionarios, basándose en la proporción
    de operaciones (para conteos) y monto colocado (para montos), eliminando la categoría genérica.
    """
    others_item = None
    valid_items = []
    for item in data_list:
        if item.get(key_name) == others_label:
            others_item = item
        else:
            valid_items.append(item)
            
    if not others_item or not valid_items:
        return data_list  # Nada que distribuir o no hay destinos válidos
        
    total_valid_ops = sum(item.get("total_ops", 0) for item in valid_items)
    total_valid_monto = sum(item.get("total_monto", 0.0) for item in valid_items)
    total_valid_mora_ops = sum(item.get("mora_ops", 0) for item in valid_items)
    total_valid_mora_monto = sum(item.get("mora_monto", 0.0) for item in valid_items)
    
    others_ops = others_item.get("total_ops", 0)
    others_monto = others_item.get("total_monto", 0.0)
    others_mora_ops = others_item.get("mora_ops", 0)
    others_mora_monto = others_item.get("mora_monto", 0.0)
    
    distributed_items = []
    
    accumulated_ops = 0
    accumulated_mora_ops = 0
    accumulated_monto = 0.0
    accumulated_mora_monto = 0.0
    
    for i, item in enumerate(valid_items):
        new_item = item.copy()
        is_last = (i == len(valid_items) - 1)
        
        # 1. Distribución de total_ops
        if "total_ops" in item and total_valid_ops > 0:
            if is_last:
                new_item["total_ops"] = item.get("total_ops", 0) + (others_ops - accumulated_ops)
            else:
                portion = int(round(others_ops * (item.get("total_ops", 0) / total_valid_ops)))
                accumulated_ops += portion
                new_item["total_ops"] = item.get("total_ops", 0) + portion
        
        # 2. Distribución de mora_ops
        if "mora_ops" in item:
            if total_valid_mora_ops > 0:
                if is_last:
                    new_item["mora_ops"] = item.get("mora_ops", 0) + (others_mora_ops - accumulated_mora_ops)
                else:
                    portion = int(round(others_mora_ops * (item.get("mora_ops", 0) / total_valid_mora_ops)))
                    accumulated_mora_ops += portion
                    new_item["mora_ops"] = item.get("mora_ops", 0) + portion
            else:
                # Si no hay mora válida pero sí en Otros, distribuir proporcional a total_ops
                ops_ratio = item.get("total_ops", 0) / max(1, total_valid_ops)
                if is_last:
                    new_item["mora_ops"] = item.get("mora_ops", 0) + (others_mora_ops - accumulated_mora_ops)
                else:
                    portion = int(round(others_mora_ops * ops_ratio))
                    accumulated_mora_ops += portion
                    new_item["mora_ops"] = item.get("mora_ops", 0) + portion

        # 3. Distribución de total_monto
        if "total_monto" in item and total_valid_monto > 0:
            if is_last:
                new_item["total_monto"] = round(item.get("total_monto", 0.0) + (others_monto - accumulated_monto), 2)
            else:
                portion = round(others_monto * (item.get("total_monto", 0.0) / total_valid_monto), 2)
                accumulated_monto += portion
                new_item["total_monto"] = round(item.get("total_monto", 0.0) + portion, 2)
            
        # 4. Distribución de mora_monto
        if "mora_monto" in item:
            if total_valid_mora_monto > 0:
                if is_last:
                    new_item["mora_monto"] = round(item.get("mora_monto", 0.0) + (others_mora_monto - accumulated_mora_monto), 2)
                else:
                    portion = round(others_mora_monto * (item.get("mora_monto", 0.0) / total_valid_mora_monto), 2)
                    accumulated_mora_monto += portion
                    new_item["mora_monto"] = round(item.get("mora_monto", 0.0) + portion, 2)
            else:
                monto_ratio = item.get("total_monto", 0.0) / max(0.01, total_valid_monto)
                if is_last:
                    new_item["mora_monto"] = round(item.get("mora_monto", 0.0) + (others_mora_monto - accumulated_mora_monto), 2)
                else:
                    portion = round(others_mora_monto * monto_ratio, 2)
                    accumulated_mora_monto += portion
                    new_item["mora_monto"] = round(item.get("mora_monto", 0.0) + portion, 2)
                
        # 5. Recalcular las tasas de morosidad
        if "tasa_mora_ops" in item:
            new_item["tasa_mora_ops"] = round(new_item.get("mora_ops", 0) / max(1, new_item.get("total_ops", 1)) * 100, 2)
        if "tasa_mora_monto" in item:
            new_item["tasa_mora_monto"] = round(new_item.get("mora_monto", 0.0) / max(1.0, new_item.get("total_monto", 1.0)) * 100, 2)
        if "tasa_morosidad" in item:
            new_item["tasa_morosidad"] = round(new_item.get("mora_ops", 0) / max(1, new_item.get("total_ops", 1)) * 100, 2)
            
        distributed_items.append(new_item)
        
    return distributed_items


@router.get("/extended-stats")
def get_extended_stats():
    """Retorna estadísticas extendidas y avanzadas basadas en el dataset maestro con caché."""
    global _EXTENDED_STATS_CACHE, _EXTENDED_STATS_CACHE_TIMESTAMP
    now = time.time()
    if _EXTENDED_STATS_CACHE is not None and (now - _EXTENDED_STATS_CACHE_TIMESTAMP) < CACHE_DURATION:
        return _EXTENDED_STATS_CACHE
    # 1. Mora por Tipo de Crédito
    tipo_results = execute_query("""
        SELECT 
            tipo_cartera, 
            COUNT(*) as total_ops, 
            SUM(monto_credito) as total_monto, 
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro 
        GROUP BY tipo_cartera
        ORDER BY total_monto DESC
    """)
    
    mora_por_tipo = []
    for r in tipo_results:
        tasa_mora_ops = round(r["mora_ops"] / max(1, r["total_ops"]) * 100, 2)
        tasa_mora_monto = round(r["mora_monto"] / max(1, r["total_monto"]) * 100, 2)
        mora_por_tipo.append({
            "tipo_cartera": r["tipo_cartera"].title(),
            "total_ops": r["total_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_ops": r["mora_ops"],
            "mora_monto": round(r["mora_monto"], 2),
            "tasa_mora_ops": tasa_mora_ops,
            "tasa_mora_monto": tasa_mora_monto
        })

    # 2. Mora por Actividad Económica (Con límite removido para consulta completa)
    act_results = execute_query("""
        SELECT 
            COALESCE(actividad_socio, 'Otros') as actividad_socio, 
            COUNT(*) as total_ops, 
            SUM(monto_credito) as total_monto, 
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro 
        GROUP BY actividad_socio
        HAVING total_ops >= 100
        ORDER BY total_ops DESC
    """)
    
    mora_por_actividad = []
    act_grouped = {}
    for r in act_results:
        # Limpiar y acortar la descripción
        val = r["actividad_socio"]
        desc = val.strip().upper() if val else "OTROS"
        if desc.endswith("."):
            desc = desc[:-1]
            
        if desc in ("NO ESPECIFICADO", "OTROS", "NO ESPECIFICADA", "SIN ESPECIFICAR", "OTROS / NO ESPECIFICADO"):
            desc = "OTROS"
            
        if len(desc) > 50:
            desc = desc[:47] + "..."
            
        label = desc.title()
        if label not in act_grouped:
            act_grouped[label] = {"total_ops": 0, "total_monto": 0.0, "mora_ops": 0, "mora_monto": 0.0}
            
        act_grouped[label]["total_ops"] += r["total_ops"]
        act_grouped[label]["total_monto"] += r["total_monto"]
        act_grouped[label]["mora_ops"] += r["mora_ops"]
        act_grouped[label]["mora_monto"] += r["mora_monto"]

    for label, d in act_grouped.items():
        tasa_mora_monto = round(d["mora_monto"] / max(1, d["total_monto"]) * 100, 2)
        mora_por_actividad.append({
            "actividad": label,
            "total_ops": d["total_ops"],
            "total_monto": round(d["total_monto"], 2),
            "mora_ops": d["mora_ops"],
            "mora_monto": round(d["mora_monto"], 2),
            "tasa_mora_monto": tasa_mora_monto
        })

    # Distribuir proporcionalmente los 'Otros' de actividades
    mora_por_actividad = distribute_others_proportionally(mora_por_actividad, "actividad")

    # 3. Distribución por Género
    gen_results = execute_query("""
        SELECT 
            CASE WHEN TRIM(COALESCE(sexo, 'F')) = 'M' THEN 'M' ELSE 'F' END as sexo_raw,
            COUNT(*) as total_ops, 
            SUM(monto_credito) as total_monto, 
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro 
        GROUP BY sexo_raw
    """)
    
    por_genero = []
    for r in gen_results:
        sexo_str = r["sexo_raw"]
        sexo_label = "Femenino" if sexo_str == "F" else "Masculino"
        tasa_mora_monto = round(r["mora_monto"] / max(1, r["total_monto"]) * 100, 2)
        por_genero.append({
            "genero": sexo_label,
            "total_ops": r["total_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_ops": r["mora_ops"],
            "tasa_mora_monto": tasa_mora_monto
        })

    # 4. Mora por Rango de Monto
    rango_results = execute_query("""
        SELECT 
            CASE 
                WHEN monto_credito < 5000 THEN '0 - 5K' 
                WHEN monto_credito < 10000 THEN '5K - 10K' 
                WHEN monto_credito < 25000 THEN '10K - 25K' 
                ELSE '25K+' 
            END as rango,
            COUNT(*) as total_ops, 
            SUM(monto_credito) as total_monto, 
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro 
        GROUP BY rango
    """)
    
    mora_por_rango_monto = []
    for r in rango_results:
        tasa_mora_monto = round(r["mora_monto"] / max(1, r["total_monto"]) * 100, 2)
        mora_por_rango_monto.append({
            "rango": r["rango"],
            "total_ops": r["total_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_ops": r["mora_ops"],
            "tasa_mora_monto": tasa_mora_monto
        })
        
    # Ordenar rangos de monto lógicamente
    orden_rangos = {'0 - 5K': 1, '5K - 10K': 2, '10K - 25K': 3, '25K+': 4}
    mora_por_rango_monto.sort(key=lambda x: orden_rangos.get(x["rango"], 99))
    mora_por_rango_monto = enrich_mora_rango_series(mora_por_rango_monto)

    # 5. Mora por Zona Geográfica
    zona_results = execute_query("""
        SELECT 
            CASE 
                WHEN nro_oficina IN (20, 48, 41, 83, 69, 27) THEN 'Carchi'
                WHEN nro_oficina IN (90, 76, 111) THEN 'Imbabura'
                WHEN nro_oficina IN (62, 97, 55, 118) THEN 'Pichincha'
                ELSE 'Sierra Centro'
            END as zona,
            COUNT(*) as total_ops, 
            SUM(monto_credito) as total_monto, 
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro 
        GROUP BY zona
        ORDER BY total_monto DESC
    """)
    
    mora_por_zona = []
    for r in zona_results:
        tasa_mora_monto = round(r["mora_monto"] / max(1, r["total_monto"]) * 100, 2)
        mora_por_zona.append({
            "zona": r["zona"],
            "total_ops": r["total_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_ops": r["mora_ops"],
            "mora_monto": round(r["mora_monto"], 2),
            "tasa_mora_monto": tasa_mora_monto
        })

    # === NUEVAS MÉTRICAS DEMOGRÁFICAS Y COMPORTAMENTALES CON DISTRIBUCIÓN PROPORCIONAL ===

    # 1. Mora por Estado Civil
    civil_results = execute_query("""
        SELECT 
            estado_civil,
            COUNT(*) as total_ops,
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(monto_credito) as total_monto,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro
        GROUP BY estado_civil
    """)
    civil_map = {
        'C': 'Casado/a', 'S': 'Soltero/a', 'D': 'Divorciado/a', 
        'V': 'Viudo/a', 'U': 'Unión de Hecho', 'UH': 'Unión de Hecho'
    }
    mora_por_estado_civil = []
    civil_grouped = {}
    for r in civil_results:
        raw = (r["estado_civil"] or "").strip().upper()
        label = civil_map.get(raw, 'Otros')
        if label not in civil_grouped:
            civil_grouped[label] = {"total_ops": 0, "mora_ops": 0, "total_monto": 0.0, "mora_monto": 0.0}
        civil_grouped[label]["total_ops"] += r["total_ops"]
        civil_grouped[label]["mora_ops"] += r["mora_ops"]
        civil_grouped[label]["total_monto"] += r["total_monto"]
        civil_grouped[label]["mora_monto"] += r["mora_monto"]

    for label, d in civil_grouped.items():
        mora_por_estado_civil.append({
            "estado_civil": label,
            "total_ops": d["total_ops"],
            "mora_ops": d["mora_ops"],
            "total_monto": round(d["total_monto"], 2),
            "mora_monto": round(d["mora_monto"], 2),
            "tasa_mora_ops": round(d["mora_ops"] / max(1, d["total_ops"]) * 100, 2),
            "tasa_mora_monto": round(d["mora_monto"] / max(1, d["total_monto"]) * 100, 2)
        })
    mora_por_estado_civil = distribute_others_proportionally(mora_por_estado_civil, "estado_civil")

    # 2. Mora por Cargas Familiares
    cargas_results = execute_query("""
        SELECT 
            CASE 
                WHEN nro_cargas_fam IS NULL THEN 'Otros'
                WHEN nro_cargas_fam = 0 THEN '0 Cargas'
                WHEN nro_cargas_fam = 1 THEN '1 Carga'
                WHEN nro_cargas_fam = 2 THEN '2 Cargas'
                WHEN nro_cargas_fam = 3 THEN '3 Cargas'
                ELSE '4+ Cargas'
            END as cargas_bin,
            COUNT(*) as total_ops,
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(monto_credito) as total_monto,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro
        GROUP BY cargas_bin
    """)
    mora_por_cargas = []
    cargas_grouped = {}
    for r in cargas_results:
        bin_name = r["cargas_bin"]
        if bin_name in ("No Especificado", "Otros"):
            bin_name = "Otros"
            
        if bin_name not in cargas_grouped:
            cargas_grouped[bin_name] = {"total_ops": 0, "mora_ops": 0, "total_monto": 0.0, "mora_monto": 0.0}
            
        cargas_grouped[bin_name]["total_ops"] += r["total_ops"]
        cargas_grouped[bin_name]["mora_ops"] += r["mora_ops"]
        cargas_grouped[bin_name]["total_monto"] += r["total_monto"]
        cargas_grouped[bin_name]["mora_monto"] += r["mora_monto"]
        
    for label, d in cargas_grouped.items():
        mora_por_cargas.append({
            "cargas": label,
            "total_ops": d["total_ops"],
            "mora_ops": d["mora_ops"],
            "total_monto": round(d["total_monto"], 2),
            "mora_monto": round(d["mora_monto"], 2),
            "tasa_mora_ops": round(d["mora_ops"] / max(1, d["total_ops"]) * 100, 2),
            "tasa_mora_monto": round(d["mora_monto"] / max(1, d["total_monto"]) * 100, 2)
        })
    mora_por_cargas = distribute_others_proportionally(mora_por_cargas, "cargas")
    cargas_order = {'0 Cargas': 1, '1 Carga': 2, '2 Cargas': 3, '3 Cargas': 4, '4+ Cargas': 5}
    mora_por_cargas.sort(key=lambda x: cargas_order.get(x["cargas"], 99))
    mora_por_cargas = enrich_cargas_mora_series(mora_por_cargas)

    # 3. Mora por Edad
    edad_results = execute_query("""
        SELECT 
            CASE 
                WHEN fech_nacimiento IS NULL OR TRIM(fech_nacimiento) = '' THEN 'Otros'
                WHEN (2026 - CAST(substr(fech_nacimiento, 1, 4) AS INTEGER)) < 25 THEN 'Jóvenes (<25)'
                WHEN (2026 - CAST(substr(fech_nacimiento, 1, 4) AS INTEGER)) < 40 THEN 'Adultos Jóvenes (25-39)'
                WHEN (2026 - CAST(substr(fech_nacimiento, 1, 4) AS INTEGER)) < 60 THEN 'Adultos (40-59)'
                ELSE 'Adultos Mayores (60+)'
            END as edad_bin,
            COUNT(*) as total_ops,
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(monto_credito) as total_monto,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro
        GROUP BY edad_bin
    """)
    mora_por_edad = []
    edad_grouped = {}
    for r in edad_results:
        bin_name = r["edad_bin"]
        if bin_name not in edad_grouped:
            edad_grouped[bin_name] = {"total_ops": 0, "mora_ops": 0, "total_monto": 0.0, "mora_monto": 0.0}
        edad_grouped[bin_name]["total_ops"] += r["total_ops"]
        edad_grouped[bin_name]["mora_ops"] += r["mora_ops"]
        edad_grouped[bin_name]["total_monto"] += r["total_monto"]
        edad_grouped[bin_name]["mora_monto"] += r["mora_monto"]
        
    for label, d in edad_grouped.items():
        mora_por_edad.append({
            "rango_edad": label,
            "total_ops": d["total_ops"],
            "mora_ops": d["mora_ops"],
            "total_monto": round(d["total_monto"], 2),
            "mora_monto": round(d["mora_monto"], 2),
            "tasa_mora_ops": round(d["mora_ops"] / max(1, d["total_ops"]) * 100, 2),
            "tasa_mora_monto": round(d["mora_monto"] / max(1, d["total_monto"]) * 100, 2)
        })
    mora_por_edad = distribute_others_proportionally(mora_por_edad, "rango_edad")
    edad_order = {'Jóvenes (<25)': 1, 'Adultos Jóvenes (25-39)': 2, 'Adultos (40-59)': 3, 'Adultos Mayores (60+)': 4}
    mora_por_edad.sort(key=lambda x: edad_order.get(x["rango_edad"], 99))

    # 4. Mora por Nivel Educativo
    edu_results = execute_query("""
        SELECT 
            nivel_educa,
            COUNT(*) as total_ops,
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(monto_credito) as total_monto,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro
        GROUP BY nivel_educa
    """)
    edu_map = {
        'P': 'Primaria', 'S': 'Secundaria', 'U': 'Universitaria', 
        'T': 'Tecnólogo', 'G': 'Postgrado', 'N': 'Ninguno'
    }
    mora_por_educacion = []
    edu_grouped = {}
    for r in edu_results:
        raw = (r["nivel_educa"] or "").strip().upper()
        label = edu_map.get(raw, 'Otros')
        if label not in edu_grouped:
            edu_grouped[label] = {"total_ops": 0, "mora_ops": 0, "total_monto": 0.0, "mora_monto": 0.0}
        edu_grouped[label]["total_ops"] += r["total_ops"]
        edu_grouped[label]["mora_ops"] += r["mora_ops"]
        edu_grouped[label]["total_monto"] += r["total_monto"]
        edu_grouped[label]["mora_monto"] += r["mora_monto"]

    for label, d in edu_grouped.items():
        mora_por_educacion.append({
            "nivel_educativo": label,
            "total_ops": d["total_ops"],
            "mora_ops": d["mora_ops"],
            "total_monto": round(d["total_monto"], 2),
            "mora_monto": round(d["mora_monto"], 2),
            "tasa_mora_ops": round(d["mora_ops"] / max(1, d["total_ops"]) * 100, 2),
            "tasa_mora_monto": round(d["mora_monto"] / max(1, d["total_monto"]) * 100, 2)
        })
    mora_por_educacion = distribute_others_proportionally(mora_por_educacion, "nivel_educativo")
    edu_order = {'Ninguno': 1, 'Primaria': 2, 'Secundaria': 3, 'Tecnológico': 4, 'Universitaria': 5, 'Postgrado': 6}
    mora_por_educacion.sort(key=lambda x: edu_order.get(x["nivel_educativo"], 99))

    # 5. Mora por Tipo de Vivienda
    viv_results = execute_query("""
        SELECT 
            tipo_vivien,
            COUNT(*) as total_ops,
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(monto_credito) as total_monto,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro
        GROUP BY tipo_vivien
    """)
    viv_map = {
        'A': 'Rentada', 'F': 'Familiar', 'N': 'Propia', 
        'P': 'Prestada', 'S': 'Anticresis', 'SD': 'Otros', 'ND': 'Otros'
    }
    mora_por_vivienda = []
    viv_grouped = {}
    for r in viv_results:
        raw = (r["tipo_vivien"] or "").strip().upper()
        label = viv_map.get(raw, 'Otros')
        if label not in viv_grouped:
            viv_grouped[label] = {"total_ops": 0, "mora_ops": 0, "total_monto": 0.0, "mora_monto": 0.0}
        viv_grouped[label]["total_ops"] += r["total_ops"]
        viv_grouped[label]["mora_ops"] += r["mora_ops"]
        viv_grouped[label]["total_monto"] += r["total_monto"]
        viv_grouped[label]["mora_monto"] += r["mora_monto"]

    for label, d in viv_grouped.items():
        mora_por_vivienda.append({
            "tipo_vivienda": label,
            "total_ops": d["total_ops"],
            "mora_ops": d["mora_ops"],
            "total_monto": round(d["total_monto"], 2),
            "mora_monto": round(d["mora_monto"], 2),
            "tasa_mora_ops": round(d["mora_ops"] / max(1, d["total_ops"]) * 100, 2),
            "tasa_mora_monto": round(d["mora_monto"] / max(1, d["total_monto"]) * 100, 2)
        })
    mora_por_vivienda = distribute_others_proportionally(mora_por_vivienda, "tipo_vivienda")

    # 6. Mora por Destino del Crédito
    destino_results = execute_query("""
        SELECT 
            destino_op,
            COUNT(*) as total_ops,
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(monto_credito) as total_monto,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro
        GROUP BY destino_op
    """)
    mora_por_destino_raw = []
    destino_grouped = {}
    for r in destino_results:
        raw = r["destino_op"] or "OTROS"
        desc = raw.strip().upper()
        desc = desc.replace("REESTRUCTURACIN", "REESTRUCTURACION")
        desc = desc.replace("VEHCULOS", "VEHICULOS")
        desc = desc.replace("MICROCRDITO", "MICROCREDITO")
        
        # Merge all variants of unclassified/others into a single 'OTROS'
        if desc in (
            "NO ESPECIFICADO", "OTROS", "OTROS / NO ESPECIFICADO", 
            "SIN ESPECIFICAR", "OTROS GASTOS NO ESPECIFICADOS", 
            "GASTOS NO ESPECIFICADOS"
        ):
            desc = "OTROS"
            
        if len(desc) > 40:
            desc = desc[:37] + "..."
            
        label = desc.title()
        if label not in destino_grouped:
            destino_grouped[label] = {"total_ops": 0, "mora_ops": 0, "total_monto": 0.0, "mora_monto": 0.0}
            
        destino_grouped[label]["total_ops"] += r["total_ops"]
        destino_grouped[label]["mora_ops"] += r["mora_ops"]
        destino_grouped[label]["total_monto"] += r["total_monto"]
        destino_grouped[label]["mora_monto"] += r["mora_monto"]
        
    for label, d in destino_grouped.items():
        mora_por_destino_raw.append({
            "destino": label,
            "total_ops": d["total_ops"],
            "mora_ops": d["mora_ops"],
            "total_monto": round(d["total_monto"], 2),
            "mora_monto": round(d["mora_monto"], 2),
            "tasa_mora_ops": round(d["mora_ops"] / max(1, d["total_ops"]) * 100, 2),
            "tasa_mora_monto": round(d["mora_monto"] / max(1, d["total_monto"]) * 100, 2)
        })
        
    # Distribuir proporcionalmente los 'Otros' destinos y luego truncar a los top 8
    mora_por_destino_raw = distribute_others_proportionally(mora_por_destino_raw, "destino")
    mora_por_destino_raw.sort(key=lambda x: x["total_ops"], reverse=True)
    mora_por_destino = mora_por_destino_raw[:8]

    # 7. Mora por Plazo (Cuotas)
    cuotas_results = execute_query("""
        SELECT 
            CASE 
                WHEN nro_cuotas IS NULL THEN 'Otros'
                WHEN nro_cuotas <= 12 THEN '1-12 cuotas (<= 1 Año)'
                WHEN nro_cuotas <= 36 THEN '13-36 cuotas (1-3 Años)'
                WHEN nro_cuotas <= 60 THEN '37-60 cuotas (3-5 Años)'
                ELSE '61+ cuotas (> 5 Años)'
            END as cuotas_bin,
            COUNT(*) as total_ops,
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(monto_credito) as total_monto,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro
        GROUP BY cuotas_bin
    """)
    mora_por_cuotas = []
    cuotas_grouped = {}
    for r in cuotas_results:
        bin_name = r["cuotas_bin"]
        if bin_name not in cuotas_grouped:
            cuotas_grouped[bin_name] = {"total_ops": 0, "mora_ops": 0, "total_monto": 0.0, "mora_monto": 0.0}
        cuotas_grouped[bin_name]["total_ops"] += r["total_ops"]
        cuotas_grouped[bin_name]["mora_ops"] += r["mora_ops"]
        cuotas_grouped[bin_name]["total_monto"] += r["total_monto"]
        cuotas_grouped[bin_name]["mora_monto"] += r["mora_monto"]
        
    for label, d in cuotas_grouped.items():
        mora_por_cuotas.append({
            "rango_cuotas": label,
            "total_ops": d["total_ops"],
            "mora_ops": d["mora_ops"],
            "total_monto": round(d["total_monto"], 2),
            "mora_monto": round(d["mora_monto"], 2),
            "tasa_mora_ops": round(d["mora_ops"] / max(1, d["total_ops"]) * 100, 2),
            "tasa_mora_monto": round(d["mora_monto"] / max(1, d["total_monto"]) * 100, 2)
        })
    mora_por_cuotas = distribute_others_proportionally(mora_por_cuotas, "rango_cuotas")
    cuotas_order = {
        '1-12 cuotas (<= 1 Año)': 1, '13-36 cuotas (1-3 Años)': 2, 
        '37-60 cuotas (3-5 Años)': 3, '61+ cuotas (> 5 Años)': 4
    }
    mora_por_cuotas.sort(key=lambda x: cuotas_order.get(x["rango_cuotas"], 99))

    # 8. Mora por Calificación
    calif_results = execute_query("""
        SELECT 
            COALESCE(NULLIF(TRIM(calificacion), ''), 'Otros') as calif_clean,
            COUNT(*) as total_ops,
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(monto_credito) as total_monto,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro
        GROUP BY calif_clean
    """)
    mora_por_calificacion = []
    calif_grouped = {}
    for r in calif_results:
        label = r["calif_clean"]
        if label not in calif_grouped:
            calif_grouped[label] = {"total_ops": 0, "mora_ops": 0, "total_monto": 0.0, "mora_monto": 0.0}
        calif_grouped[label]["total_ops"] += r["total_ops"]
        calif_grouped[label]["mora_ops"] += r["mora_ops"]
        calif_grouped[label]["total_monto"] += r["total_monto"]
        calif_grouped[label]["mora_monto"] += r["mora_monto"]
        
    for label, d in calif_grouped.items():
        mora_por_calificacion.append({
            "calificacion": label,
            "total_ops": d["total_ops"],
            "mora_ops": d["mora_ops"],
            "total_monto": round(d["total_monto"], 2),
            "mora_monto": round(d["mora_monto"], 2),
            "tasa_mora_ops": round(d["mora_ops"] / max(1, d["total_ops"]) * 100, 2),
            "tasa_mora_monto": round(d["mora_monto"] / max(1, d["total_monto"]) * 100, 2)
        })
    mora_por_calificacion = distribute_others_proportionally(mora_por_calificacion, "calificacion")
    calif_order = {
        'Normal': 1, 'A1': 2, 'A2': 3, 'A3': 4, 'B': 5, 'B1': 6, 'B2': 7, 
        'C': 8, 'C1': 9, 'C2': 10, 'D': 11, 'E': 12
    }
    mora_por_calificacion.sort(key=lambda x: calif_order.get(x["calificacion"], 99))

    # 9. Mora por Ingresos del Socio
    ing_results = execute_query("""
        SELECT 
            CASE 
                WHEN ingresos_socio < 500 THEN 'Bajo (< $500)'
                WHEN ingresos_socio < 1500 THEN 'Medio ($500 - $1500)'
                WHEN ingresos_socio < 3000 THEN 'Alto ($1500 - $3000)'
                ELSE 'Muy Alto ($3000+)'
            END as ingresos_bin,
            COUNT(*) as total_ops,
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(monto_credito) as total_monto,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro
        GROUP BY ingresos_bin
    """)
    mora_por_ingresos = []
    for r in ing_results:
        mora_por_ingresos.append({
            "rango_ingresos": r["ingresos_bin"],
            "total_ops": r["total_ops"],
            "mora_ops": r["mora_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_monto": round(r["mora_monto"], 2),
            "tasa_mora_ops": round(r["mora_ops"] / max(1, r["total_ops"]) * 100, 2),
            "tasa_mora_monto": round(r["mora_monto"] / max(1, r["total_monto"]) * 100, 2)
        })
    ing_order = {'Bajo (< $500)': 1, 'Medio ($500 - $1500)': 2, 'Alto ($1500 - $3000)': 3, 'Muy Alto ($3000+)': 4}
    mora_por_ingresos.sort(key=lambda x: ing_order.get(x["rango_ingresos"], 99))

    # 10. Mora por Día de Pago
    pago_results = execute_query("""
        SELECT 
            CASE 
                WHEN dia_pago <= 10 THEN 'Inicio de Mes (1-10)'
                WHEN dia_pago <= 20 THEN 'Mitad de Mes (11-20)'
                ELSE 'Fin de Mes (21-31)'
            END as diapago_bin,
            COUNT(*) as total_ops,
            SUM(CASE WHEN es_moroso = 1 THEN 1 ELSE 0 END) as mora_ops,
            SUM(monto_credito) as total_monto,
            SUM(CASE WHEN es_moroso = 1 THEN monto_credito ELSE 0 END) as mora_monto
        FROM dataset_maestro
        GROUP BY diapago_bin
    """)
    mora_por_dia_pago = []
    for r in pago_results:
        mora_por_dia_pago.append({
            "dia_pago": r["diapago_bin"],
            "total_ops": r["total_ops"],
            "mora_ops": r["mora_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_monto": round(r["mora_monto"], 2),
            "tasa_mora_ops": round(r["mora_ops"] / max(1, r["total_ops"]) * 100, 2),
            "tasa_mora_monto": round(r["mora_monto"] / max(1, r["total_monto"]) * 100, 2)
        })
    pago_order = {'Inicio de Mes (1-10)': 1, 'Mitad de Mes (11-20)': 2, 'Fin de Mes (21-31)': 3}
    mora_por_dia_pago.sort(key=lambda x: pago_order.get(x["dia_pago"], 99))

    result_data = {
        "mora_por_tipo": mora_por_tipo,
        "mora_por_actividad": mora_por_actividad,
        "por_genero": por_genero,
        "mora_por_rango_monto": mora_por_rango_monto,
        "mora_por_zona": mora_por_zona,
        "mora_por_estado_civil": mora_por_estado_civil,
        "mora_por_cargas": mora_por_cargas,
        "mora_por_edad": mora_por_edad,
        "mora_por_educacion": mora_por_educacion,
        "mora_por_vivienda": mora_por_vivienda,
        "mora_por_destino": mora_por_destino,
        "mora_por_cuotas": mora_por_cuotas,
        "mora_por_calificacion": mora_por_calificacion,
        "mora_por_ingresos": mora_por_ingresos,
        "mora_por_dia_pago": mora_por_dia_pago
    }
    _EXTENDED_STATS_CACHE = result_data
    _EXTENDED_STATS_CACHE_TIMESTAMP = now
    return result_data

