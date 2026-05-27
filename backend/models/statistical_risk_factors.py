"""
Factores de riesgo derivados de las mismas segmentaciones que alimentan los gráficos
del panel extendido (mora por tipo, actividad, zona, edad, etc.).
"""
from __future__ import annotations

import time
from typing import Any

from database import execute_query, execute_query_one

BENCHMARK_CACHE_TTL = 300.0
_benchmarks_cache: dict | None = None
_benchmarks_ts = 0.0

# Pesos por dimensión analítica (alineados con relevancia en comité de riesgo)
DIMENSION_WEIGHTS = {
    "tipo_cartera": 1.25,
    "actividad": 1.05,
    "genero": 0.65,
    "rango_monto": 1.0,
    "zona": 0.85,
    "estado_civil": 0.75,
    "cargas": 1.15,
    "edad": 0.95,
    "educacion": 0.75,
    "vivienda": 0.75,
    "destino": 0.95,
    "plazo_cuotas": 0.85,
    "calificacion": 1.15,
    "ingresos": 0.8,
    "dia_pago": 0.6,
}

STATISTICAL_SCORE_CAP = 24.0
MORA_EXCESS_THRESHOLD = 2.5  # puntos % sobre el promedio cartera para activar factor


def _table_exists(name: str) -> bool:
    from models.risk_model import _table_exists as check
    return check(name)


def _tasa_mora_monto(item: dict) -> float:
    return float(
        item.get("tasa_mora_monto")
        or item.get("tasa_mora_ops")
        or 0.0
    )


def _portfolio_avg(stats: dict) -> float:
    totals = []
    for key in (
        "mora_por_tipo", "mora_por_actividad", "por_genero", "mora_por_rango_monto",
        "mora_por_zona", "mora_por_estado_civil", "mora_por_cargas", "mora_por_edad",
        "mora_por_educacion", "mora_por_vivienda", "mora_por_destino", "mora_por_cuotas",
        "mora_por_calificacion", "mora_por_ingresos", "mora_por_dia_pago",
    ):
        for row in stats.get(key) or []:
            t = _tasa_mora_monto(row)
            if t > 0:
                totals.append(t)
    if not totals:
        return 18.0
    return sum(totals) / len(totals)


def _index_segments(stats: dict, portfolio_avg: float) -> dict[tuple[str, str], dict]:
    """Índice (dimensión, etiqueta) → tasa de mora del segmento vs cartera."""
    mapping: list[tuple[str, str, str]] = [
        ("tipo_cartera", "mora_por_tipo", "tipo_cartera"),
        ("actividad", "mora_por_actividad", "actividad"),
        ("genero", "por_genero", "genero"),
        ("rango_monto", "mora_por_rango_monto", "rango"),
        ("zona", "mora_por_zona", "zona"),
        ("estado_civil", "mora_por_estado_civil", "estado_civil"),
        ("cargas", "mora_por_cargas", "cargas"),
        ("edad", "mora_por_edad", "rango_edad"),
        ("educacion", "mora_por_educacion", "nivel_educativo"),
        ("vivienda", "mora_por_vivienda", "tipo_vivienda"),
        ("destino", "mora_por_destino", "destino"),
        ("plazo_cuotas", "mora_por_cuotas", "rango_cuotas"),
        ("calificacion", "mora_por_calificacion", "calificacion"),
        ("ingresos", "mora_por_ingresos", "rango_ingresos"),
        ("dia_pago", "mora_por_dia_pago", "dia_pago"),
    ]
    index: dict[tuple[str, str], dict] = {}
    for dim, stats_key, label_key in mapping:
        for row in stats.get(stats_key) or []:
            label = str(row.get(label_key) or "").strip()
            if not label or label.lower() == "otros":
                continue
            tasa = _tasa_mora_monto(row)
            index[(dim, label)] = {
                "tasa_mora": tasa,
                "excess_vs_portfolio": tasa - portfolio_avg,
                "total_ops": int(row.get("total_ops") or 0),
            }
    return index


def load_statistical_benchmarks(force: bool = False) -> dict:
    global _benchmarks_cache, _benchmarks_ts
    now = time.time()
    if (
        not force
        and _benchmarks_cache is not None
        and (now - _benchmarks_ts) < BENCHMARK_CACHE_TTL
    ):
        return _benchmarks_cache

    stats = None
    if _table_exists("dataset_maestro"):
        try:
            from routes.dashboard_extended import get_extended_stats
            stats = get_extended_stats()
        except Exception:
            stats = None
    if not stats:
        try:
            from routes.dashboard_extended_synthetic import get_extended_stats_synthetic
            stats = get_extended_stats_synthetic()
        except Exception:
            stats = {}

    portfolio_avg = _portfolio_avg(stats)
    _benchmarks_cache = {
        "portfolio_avg_mora": round(portfolio_avg, 2),
        "segments": _index_segments(stats, portfolio_avg),
        "source": stats.get("source", "production" if _table_exists("dataset_maestro") else "synthetic"),
    }
    _benchmarks_ts = now
    return _benchmarks_cache


def invalidate_statistical_benchmarks() -> None:
    global _benchmarks_cache, _benchmarks_ts
    _benchmarks_cache = None
    _benchmarks_ts = 0.0


# --- Etiquetado del socio (misma lógica que dashboard_extended) ---

CIVIL_MAP = {
    "C": "Casado/a", "S": "Soltero/a", "D": "Divorciado/a",
    "V": "Viudo/a", "U": "Unión de Hecho", "UH": "Unión de Hecho",
}

EDU_MAP = {
    "N": "Ninguno", "P": "Primaria", "S": "Secundaria",
    "T": "Tecnólogo", "U": "Universitaria", "G": "Postgrado",
}

VIV_MAP = {
    "P": "Propia", "R": "Rentada", "F": "Familiar", "PR": "Prestada", "A": "Anticresis",
}

ZONA_BY_OFICINA = {
    20: "Carchi", 48: "Carchi", 41: "Carchi", 83: "Carchi", 69: "Carchi", 27: "Carchi",
    90: "Imbabura", 76: "Imbabura", 111: "Imbabura",
    62: "Pichincha", 97: "Pichincha", 55: "Pichincha", 118: "Pichincha",
}


def _rango_monto(monto: float) -> str:
    if monto < 5000:
        return "0 - 5K"
    if monto < 10000:
        return "5K - 10K"
    if monto < 25000:
        return "10K - 25K"
    return "25K+"


def _rango_cuotas(plazo: int, nro_cuotas: int) -> str:
    n = nro_cuotas or plazo or 0
    if n <= 12:
        return "1-12 cuotas (<= 1 Año)"
    if n <= 36:
        return "13-36 cuotas (1-3 Años)"
    if n <= 60:
        return "37-60 cuotas (3-5 Años)"
    return "61+ cuotas (> 5 Años)"


def _rango_edad(fech_nac: str | None) -> str:
    if not fech_nac or not str(fech_nac).strip():
        return "Otros"
    try:
        year = int(str(fech_nac)[:4])
        age = 2026 - year
    except (TypeError, ValueError):
        return "Otros"
    if age < 25:
        return "Jóvenes (<25)"
    if age < 40:
        return "Adultos Jóvenes (25-39)"
    if age < 60:
        return "Adultos (40-59)"
    return "Adultos Mayores (60+)"


def _rango_ingresos(ing: float) -> str:
    if ing < 500:
        return "Bajo (< $500)"
    if ing < 1500:
        return "Medio ($500 - $1500)"
    if ing < 3000:
        return "Alto ($1500 - $3000)"
    return "Muy Alto ($3000+)"


def _dia_pago_label(dia: int | None) -> str:
    d = int(dia or 15)
    if d <= 10:
        return "Inicio de Mes (1-10)"
    if d <= 20:
        return "Mitad de Mes (11-20)"
    return "Fin de Mes (21-31)"


def _cargas_label(n: int | None) -> str:
    c = int(n) if n is not None else -1
    if c < 0:
        return "Otros"
    if c == 0:
        return "0 Cargas"
    if c == 1:
        return "1 Carga"
    if c == 2:
        return "2 Cargas"
    if c == 3:
        return "3 Cargas"
    return "4+ Cargas"


def _zona_label(nro_oficina: int | None) -> str:
    try:
        oid = int(nro_oficina or 20)
    except (TypeError, ValueError):
        return "Sierra Centro"
    return ZONA_BY_OFICINA.get(oid, "Sierra Centro")


def _normalize_tipo_cartera(tipo: str | None) -> str:
    t = (tipo or "Consumo").strip()
    return t.title() if t else "Consumo"


def _normalize_actividad(act: str | None) -> str:
    return (act or "Sin especificar").strip()[:80]


def _normalize_destino(dest: str | None, cod: str | None) -> str:
    d = (dest or cod or "Consumo").strip()
    if not d:
        return "Consumo"
    low = d.lower()
    if "capital" in low or "trabajo" in low:
        return "Capital de Trabajo"
    if "vivi" in low:
        return "Vivienda"
    if "veh" in low or "auto" in low:
        return "Vehículos"
    if "educ" in low:
        return "Educación"
    return "Consumo"


def profile_to_segments(profile: dict) -> list[tuple[str, str]]:
    """Devuelve lista (dimensión, etiqueta) del socio para cruce con benchmarks."""
    monto = float(profile.get("monto_credito") or 0)
    plazo = int(profile.get("plazo") or profile.get("nro_cuotas") or 0)
    nro_cuotas = int(profile.get("nro_cuotas") or plazo)
    sexo = (profile.get("sexo") or "M").strip().upper()
    genero = "Femenino" if sexo in ("F", "FEMENINO") else "Masculino"

    civil_raw = (profile.get("estado_civil") or "").strip().upper()
    estado_civil = CIVIL_MAP.get(civil_raw, "Otros")

    edu_raw = (profile.get("nivel_educa") or profile.get("nivel_educativo") or "S").strip().upper()
    educacion = EDU_MAP.get(edu_raw[:1], "Secundaria")

    viv_raw = (profile.get("tipo_vivien") or profile.get("tipo_vivienda") or "F").strip().upper()
    vivienda = VIV_MAP.get(viv_raw[:2] if len(viv_raw) >= 2 else viv_raw[:1], "Familiar")

    cal = (profile.get("calificacion") or "B").strip().upper()
    cal_label = {"A": "A", "B": "B", "C": "C", "D": "D", "E": "E"}.get(cal[:1], cal[:1] or "B")

    return [
        ("tipo_cartera", _normalize_tipo_cartera(profile.get("tipo_cartera"))),
        ("actividad", _normalize_actividad(profile.get("actividad_socio") or profile.get("ocupacion"))),
        ("genero", genero),
        ("rango_monto", _rango_monto(monto)),
        ("zona", _zona_label(profile.get("nro_oficina"))),
        ("estado_civil", estado_civil),
        ("cargas", _cargas_label(profile.get("nro_cargas_fam"))),
        ("edad", _rango_edad(profile.get("fech_nacimiento"))),
        ("educacion", educacion),
        ("vivienda", vivienda),
        ("destino", _normalize_destino(profile.get("destino_op"), profile.get("cod_destino_op"))),
        ("plazo_cuotas", _rango_cuotas(plazo, nro_cuotas)),
        ("calificacion", cal_label),
        ("ingresos", _rango_ingresos(float(profile.get("ingresos_socio") or 0))),
        ("dia_pago", _dia_pago_label(profile.get("dia_pago"))),
    ]


def fetch_socio_statistical_profile(socio_id: int) -> dict:
    if _table_exists("dataset_maestro"):
        row = execute_query_one(
            """
            SELECT
                cliente AS socio_id,
                tipo_cartera,
                actividad_socio,
                sexo,
                estado_civil,
                nro_cargas_fam,
                fech_nacimiento,
                nivel_educa,
                tipo_vivien,
                destino_op,
                cod_destino_op,
                monto_credito,
                plazo,
                nro_cuotas,
                calificacion,
                ingresos_socio,
                dia_pago,
                nro_oficina
            FROM dataset_maestro
            WHERE cliente = ?
            ORDER BY monto_credito DESC
            LIMIT 1
            """,
            (socio_id,),
        )
        if row:
            return dict(row)

    row = execute_query_one(
        """
        SELECT
            s.id AS socio_id,
            s.ocupacion AS actividad_socio,
            s.edad,
            COALESCE(s.nro_cargas_fam, 0) AS nro_cargas_fam,
            c.tipo AS tipo_cartera,
            c.monto AS monto_credito,
            c.plazo,
            c.plazo AS nro_cuotas
        FROM socios s
        LEFT JOIN creditos c ON c.socio_id = s.id
            AND c.estado IN ('Vigente', 'Mora', 'Reestructurado')
        WHERE s.id = ?
        ORDER BY c.monto DESC
        LIMIT 1
        """,
        (socio_id,),
    )
    if not row:
        return {"socio_id": socio_id}
    prof = dict(row)
    if prof.get("edad") is not None:
        prof["fech_nacimiento"] = f"{2026 - int(prof['edad'])}-01-01"
    return prof


def fetch_socio_profiles_bulk() -> dict[int, dict]:
    """Perfil estadístico por socio (una operación principal por cliente)."""
    profiles: dict[int, dict] = {}

    if _table_exists("dataset_maestro"):
        rows = execute_query(
            """
            SELECT d.*
            FROM dataset_maestro d
            INNER JOIN (
                SELECT cliente, MAX(monto_credito) AS max_monto
                FROM dataset_maestro
                GROUP BY cliente
            ) m ON d.cliente = m.cliente AND d.monto_credito = m.max_monto
            """
        )
        for r in rows:
            sid = int(r["cliente"])
            if sid not in profiles:
                profiles[sid] = dict(r)
        return profiles

    rows = execute_query(
        """
        SELECT
            s.id AS socio_id,
            s.ocupacion AS actividad_socio,
            s.edad,
            COALESCE(s.nro_cargas_fam, 0) AS nro_cargas_fam,
            c.tipo AS tipo_cartera,
            c.monto AS monto_credito,
            c.plazo,
            c.plazo AS nro_cuotas
        FROM socios s
        LEFT JOIN creditos c ON c.socio_id = s.id
            AND c.estado IN ('Vigente', 'Mora', 'Reestructurado')
        WHERE s.estado = 'Activo'
        ORDER BY s.id, c.monto DESC
        """
    )
    for r in rows:
        sid = int(r["socio_id"])
        if sid not in profiles:
            prof = dict(r)
            if prof.get("edad") is not None:
                prof["fech_nacimiento"] = f"{2026 - int(prof['edad'])}-01-01"
            profiles[sid] = prof
    return profiles


DIMENSION_LABELS_ES = {
    "tipo_cartera": "Tipo de cartera",
    "actividad": "Actividad económica",
    "genero": "Género",
    "rango_monto": "Monto del crédito",
    "zona": "Zona geográfica",
    "estado_civil": "Estado civil",
    "cargas": "Cargas familiares",
    "edad": "Rango de edad",
    "educacion": "Nivel educativo",
    "vivienda": "Tipo de vivienda",
    "destino": "Destino del crédito",
    "plazo_cuotas": "Plazo en cuotas",
    "calificacion": "Calificación interna",
    "ingresos": "Nivel de ingresos",
    "dia_pago": "Día de pago",
}


def compute_statistical_risk(profile: dict, benchmarks: dict | None = None) -> dict[str, Any]:
    """
    Ajuste al score según segmentos estadísticos del panel extendido.
    Retorna adjustment (0-24), hits (detalle) y factors (para UI).
    """
    benchmarks = benchmarks or load_statistical_benchmarks()
    segment_index = benchmarks.get("segments") or {}
    portfolio_avg = float(benchmarks.get("portfolio_avg_mora") or 18.0)

    def _lookup_segment(dim: str, label: str) -> dict | None:
        seg = segment_index.get((dim, label))
        if seg:
            return seg
        if dim == "actividad" and label:
            short = label[:40].lower()
            for (d, lbl), data in segment_index.items():
                if d != dim:
                    continue
                l = lbl.lower()
                if short in l or l in short or short.split()[0] in l:
                    return data
        return None

    hits: list[dict] = []
    for dim, label in profile_to_segments(profile):
        if dim == "tipo_cartera" or label == "Otros":
            continue
        seg = _lookup_segment(dim, label)
        if not seg:
            continue
        excess = float(seg.get("excess_vs_portfolio") or 0)
        if excess < MORA_EXCESS_THRESHOLD:
            continue
        weight = DIMENSION_WEIGHTS.get(dim, 0.8)
        ops = int(seg.get("total_ops") or 0)
        confidence = min(1.0, ops / 500.0) if ops else 0.5
        points = min(8.0, (excess / 4.0) * weight * confidence)
        hits.append({
            "dimension": dim,
            "dimension_label": DIMENSION_LABELS_ES.get(dim, dim),
            "segment": label,
            "tasa_mora_segmento": seg.get("tasa_mora"),
            "tasa_mora_cartera": portfolio_avg,
            "excess": round(excess, 2),
            "points": round(points, 2),
        })

    hits.sort(key=lambda x: x["points"], reverse=True)
    adjustment = round(min(STATISTICAL_SCORE_CAP, sum(h["points"] for h in hits)), 2)

    factors = []
    for h in hits[:8]:
        factors.append({
            "name": f"stat_{h['dimension']}",
            "description": (
                f"{h['dimension_label']}: «{h['segment']}» con mora {h['tasa_mora_segmento']:.1f}% "
                f"(cartera {h['tasa_mora_cartera']:.1f}%, +{h['excess']:.1f} pp)"
            ),
            "value": h["tasa_mora_segmento"],
            "importance": min(0.28, 0.12 + h["points"] / 40),
            "impact": "negativo",
        })

    return {
        "adjustment": adjustment,
        "portfolio_avg_mora": portfolio_avg,
        "hits": hits[:8],
        "factors": factors,
        "segments_matched": len(hits),
    }


def enrich_score_context(
    ctx: dict,
    socio_id: int,
    profile: dict | None = None,
    benchmarks: dict | None = None,
) -> dict:
    """Fusiona contexto de mora con ajuste estadístico."""
    prof = profile or fetch_socio_statistical_profile(socio_id)
    stat = compute_statistical_risk(prof, benchmarks)
    ctx = {**ctx, "socio_id": socio_id, "statistical_profile": prof}
    ctx["statistical_adjustment"] = stat["adjustment"]
    ctx["statistical_hits"] = stat["hits"]
    ctx["statistical_factors"] = stat["factors"]
    ctx["portfolio_avg_mora"] = stat["portfolio_avg_mora"]
    return ctx
