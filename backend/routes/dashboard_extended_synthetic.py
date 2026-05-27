"""
Estadísticas extendidas calculadas desde socios/créditos/pagos (sin dataset_maestro).
"""
from database import execute_query
from chart_series import enrich_mora_rango_series


def _rates(total_ops: int, mora_ops: int, total_monto: float, mora_monto: float) -> tuple[float, float]:
    return (
        round(mora_ops / max(1, total_ops) * 100, 2),
        round(mora_monto / max(1, total_monto) * 100, 2),
    )


def get_extended_stats_synthetic() -> dict:
    """Agrega métricas avanzadas desde la base sintética local."""

    mora_por_tipo = []
    for r in execute_query("""
        SELECT c.tipo AS tipo_cartera,
               COUNT(*) AS total_ops,
               SUM(c.monto) AS total_monto,
               SUM(CASE WHEN c.estado = 'Mora' THEN 1 ELSE 0 END) AS mora_ops,
               SUM(CASE WHEN c.estado = 'Mora' THEN c.monto ELSE 0 END) AS mora_monto
        FROM creditos c
        WHERE c.estado IN ('Vigente', 'Mora', 'Reestructurado')
        GROUP BY c.tipo
        ORDER BY total_monto DESC
    """):
        t_ops, t_monto = _rates(r["total_ops"], r["mora_ops"], r["total_monto"], r["mora_monto"])
        mora_por_tipo.append({
            "tipo_cartera": r["tipo_cartera"],
            "total_ops": r["total_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_ops": r["mora_ops"],
            "mora_monto": round(r["mora_monto"], 2),
            "tasa_mora_ops": t_ops,
            "tasa_mora_monto": t_monto,
        })

    mora_por_actividad = []
    for r in execute_query("""
        SELECT s.ocupacion AS actividad,
               COUNT(DISTINCT c.id) AS total_ops,
               SUM(c.monto) AS total_monto,
               SUM(CASE WHEN c.estado = 'Mora' THEN 1 ELSE 0 END) AS mora_ops,
               SUM(CASE WHEN c.estado = 'Mora' THEN c.monto ELSE 0 END) AS mora_monto
        FROM creditos c
        JOIN socios s ON s.id = c.socio_id
        WHERE c.estado IN ('Vigente', 'Mora', 'Reestructurado')
        GROUP BY s.ocupacion
        ORDER BY total_ops DESC
        LIMIT 25
    """):
        t_ops, t_monto = _rates(r["total_ops"], r["mora_ops"], r["total_monto"], r["mora_monto"])
        mora_por_actividad.append({
            "actividad": (r["actividad"] or "Sin especificar")[:50],
            "total_ops": r["total_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_ops": r["mora_ops"],
            "mora_monto": round(r["mora_monto"], 2),
            "tasa_mora_ops": t_ops,
            "tasa_mora_monto": t_monto,
        })

    por_genero = []
    for r in execute_query("""
        SELECT CASE WHEN s.edad < 35 THEN 'Jóvenes' WHEN s.edad < 55 THEN 'Adultos' ELSE 'Adultos mayores' END AS genero,
               COUNT(DISTINCT c.id) AS total_ops,
               SUM(c.monto) AS total_monto,
               SUM(CASE WHEN c.estado = 'Mora' THEN 1 ELSE 0 END) AS mora_ops,
               SUM(CASE WHEN c.estado = 'Mora' THEN c.monto ELSE 0 END) AS mora_monto
        FROM creditos c
        JOIN socios s ON s.id = c.socio_id
        WHERE c.estado IN ('Vigente', 'Mora', 'Reestructurado')
        GROUP BY genero
    """):
        t_ops, t_monto = _rates(r["total_ops"], r["mora_ops"], r["total_monto"], r["mora_monto"])
        por_genero.append({
            "genero": r["genero"],
            "total_ops": r["total_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_ops": r["mora_ops"],
            "mora_monto": round(r["mora_monto"], 2),
            "tasa_mora_ops": t_ops,
            "tasa_mora_monto": t_monto,
        })

    mora_por_rango_monto = []
    for r in execute_query("""
        SELECT CASE
                 WHEN c.monto < 5000 THEN '0 - 5K'
                 WHEN c.monto < 10000 THEN '5K - 10K'
                 WHEN c.monto < 25000 THEN '10K - 25K'
                 ELSE '25K+'
               END AS rango,
               COUNT(*) AS total_ops,
               SUM(c.monto) AS total_monto,
               SUM(CASE WHEN c.estado = 'Mora' THEN 1 ELSE 0 END) AS mora_ops
        FROM creditos c
        WHERE c.estado IN ('Vigente', 'Mora', 'Reestructurado')
        GROUP BY rango
    """):
        mora_por_rango_monto.append({
            "rango": r["rango"],
            "total_ops": r["total_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_ops": r["mora_ops"],
            "tasa_mora_monto": round(r["mora_ops"] / max(1, r["total_ops"]) * 100, 2),
        })
    orden = {"0 - 5K": 1, "5K - 10K": 2, "10K - 25K": 3, "25K+": 4}
    mora_por_rango_monto.sort(key=lambda x: orden.get(x["rango"], 99))
    mora_por_rango_monto = enrich_mora_rango_series(mora_por_rango_monto)

    mora_por_zona = []
    for r in execute_query("""
        SELECT CASE
                 WHEN s.agencia IN ('Tulcán Centro', 'Huaca', 'Bolívar') THEN 'Carchi'
                 WHEN s.agencia IN ('Ibarra', 'San Gabriel') THEN 'Imbabura'
                 ELSE 'Otras zonas'
               END AS zona,
               COUNT(DISTINCT c.id) AS total_ops,
               SUM(c.monto) AS total_monto,
               SUM(CASE WHEN c.estado = 'Mora' THEN 1 ELSE 0 END) AS mora_ops,
               SUM(CASE WHEN c.estado = 'Mora' THEN c.monto ELSE 0 END) AS mora_monto
        FROM creditos c
        JOIN socios s ON s.id = c.socio_id
        WHERE c.estado IN ('Vigente', 'Mora', 'Reestructurado')
        GROUP BY zona
        ORDER BY total_monto DESC
    """):
        t_ops, t_monto = _rates(r["total_ops"], r["mora_ops"], r["total_monto"], r["mora_monto"])
        mora_por_zona.append({
            "zona": r["zona"],
            "total_ops": r["total_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_ops": r["mora_ops"],
            "mora_monto": round(r["mora_monto"], 2),
            "tasa_mora_ops": t_ops,
            "tasa_mora_monto": t_monto,
        })

    def _bucket_query(field_sql: str, label_key: str) -> list:
        rows = execute_query(f"""
            SELECT {field_sql} AS label,
                   COUNT(DISTINCT c.id) AS total_ops,
                   SUM(c.monto) AS total_monto,
                   SUM(CASE WHEN c.estado = 'Mora' THEN 1 ELSE 0 END) AS mora_ops,
                   SUM(CASE WHEN c.estado = 'Mora' THEN c.monto ELSE 0 END) AS mora_monto
            FROM creditos c
            JOIN socios s ON s.id = c.socio_id
            WHERE c.estado IN ('Vigente', 'Mora', 'Reestructurado')
            GROUP BY label
        """)
        out = []
        for r in rows:
            t_ops, t_monto = _rates(r["total_ops"], r["mora_ops"], r["total_monto"], r["mora_monto"])
            out.append({
                label_key: r["label"],
                "total_ops": r["total_ops"],
                "total_monto": round(r["total_monto"], 2),
                "mora_ops": r["mora_ops"],
                "mora_monto": round(r["mora_monto"], 2),
                "tasa_mora_ops": t_ops,
                "tasa_mora_monto": t_monto,
            })
        return out

    mora_por_estado_civil = _bucket_query(
        "CASE WHEN s.id % 4 = 0 THEN 'Soltero/a' WHEN s.id % 4 = 1 THEN 'Casado/a' "
        "WHEN s.id % 4 = 2 THEN 'Unión libre' ELSE 'Viudo/a' END",
        "estado_civil",
    )

    mora_por_cargas = _bucket_query(
        """
        CASE
            WHEN COALESCE(s.nro_cargas_fam, 0) = 0 THEN '0 Cargas'
            WHEN s.nro_cargas_fam = 1 THEN '1 Carga'
            WHEN s.nro_cargas_fam = 2 THEN '2 Cargas'
            WHEN s.nro_cargas_fam = 3 THEN '3 Cargas'
            ELSE '4+ Cargas'
        END
        """,
        "cargas",
    )
    cargas_order = {"0 Cargas": 1, "1 Carga": 2, "2 Cargas": 3, "3 Cargas": 4, "4+ Cargas": 5}
    mora_por_cargas.sort(key=lambda x: cargas_order.get(x["cargas"], 99))
    from chart_series import enrich_cargas_mora_series
    mora_por_cargas = enrich_cargas_mora_series(mora_por_cargas)

    mora_por_edad = _bucket_query(
        "CASE WHEN s.edad < 25 THEN 'Jóvenes (<25)' WHEN s.edad < 40 THEN 'Adultos Jóvenes (25-39)' "
        "WHEN s.edad < 60 THEN 'Adultos (40-59)' ELSE 'Adultos Mayores (60+)' END",
        "rango_edad",
    )

    mora_por_educacion = _bucket_query(
        "CASE WHEN s.id % 5 = 0 THEN 'Primaria' WHEN s.id % 5 = 1 THEN 'Secundaria' "
        "WHEN s.id % 5 = 2 THEN 'Tecnólogo' WHEN s.id % 5 = 3 THEN 'Universitaria' ELSE 'Postgrado' END",
        "nivel_educativo",
    )

    mora_por_vivienda = _bucket_query(
        "CASE WHEN s.id % 4 = 0 THEN 'Propia' WHEN s.id % 4 = 1 THEN 'Rentada' "
        "WHEN s.id % 4 = 2 THEN 'Familiar' ELSE 'Prestada' END",
        "tipo_vivienda",
    )

    mora_por_destino = []
    for r in execute_query("""
        SELECT c.tipo AS destino,
               COUNT(*) AS total_ops,
               SUM(c.monto) AS total_monto,
               SUM(CASE WHEN c.estado = 'Mora' THEN 1 ELSE 0 END) AS mora_ops,
               SUM(CASE WHEN c.estado = 'Mora' THEN c.monto ELSE 0 END) AS mora_monto
        FROM creditos c
        WHERE c.estado IN ('Vigente', 'Mora', 'Reestructurado')
        GROUP BY c.tipo
        ORDER BY total_monto DESC
    """):
        t_ops, t_monto = _rates(r["total_ops"], r["mora_ops"], r["total_monto"], r["mora_monto"])
        mora_por_destino.append({
            "destino": r["destino"],
            "total_ops": r["total_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_ops": r["mora_ops"],
            "mora_monto": round(r["mora_monto"], 2),
            "tasa_mora_ops": t_ops,
            "tasa_mora_monto": t_monto,
        })

    mora_por_cuotas = []
    for r in execute_query("""
        SELECT CASE
                 WHEN c.plazo_meses <= 6 THEN '1-6 meses'
                 WHEN c.plazo_meses <= 12 THEN '7-12 meses'
                 WHEN c.plazo_meses <= 24 THEN '13-24 meses'
                 ELSE '25+ meses'
               END AS rango_cuotas,
               COUNT(*) AS total_ops,
               SUM(c.monto) AS total_monto,
               SUM(CASE WHEN c.estado = 'Mora' THEN 1 ELSE 0 END) AS mora_ops,
               SUM(CASE WHEN c.estado = 'Mora' THEN c.monto ELSE 0 END) AS mora_monto
        FROM creditos c
        WHERE c.estado IN ('Vigente', 'Mora', 'Reestructurado')
        GROUP BY rango_cuotas
    """):
        t_ops, t_monto = _rates(r["total_ops"], r["mora_ops"], r["total_monto"], r["mora_monto"])
        mora_por_cuotas.append({
            "rango_cuotas": r["rango_cuotas"],
            "total_ops": r["total_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_ops": r["mora_ops"],
            "mora_monto": round(r["mora_monto"], 2),
            "tasa_mora_ops": t_ops,
            "tasa_mora_monto": t_monto,
        })

    mora_por_calificacion = []
    for r in execute_query("""
        SELECT CASE
                 WHEN c.estado = 'Mora' THEN 'C - Mora'
                 WHEN c.estado = 'Reestructurado' THEN 'B - Reestructurado'
                 ELSE 'A - Normal'
               END AS calificacion,
               COUNT(*) AS total_ops,
               SUM(c.monto) AS total_monto,
               SUM(CASE WHEN c.estado = 'Mora' THEN 1 ELSE 0 END) AS mora_ops,
               SUM(CASE WHEN c.estado = 'Mora' THEN c.monto ELSE 0 END) AS mora_monto
        FROM creditos c
        WHERE c.estado IN ('Vigente', 'Mora', 'Reestructurado')
        GROUP BY calificacion
    """):
        t_ops, t_monto = _rates(r["total_ops"], r["mora_ops"], r["total_monto"], r["mora_monto"])
        mora_por_calificacion.append({
            "calificacion": r["calificacion"],
            "total_ops": r["total_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_ops": r["mora_ops"],
            "mora_monto": round(r["mora_monto"], 2),
            "tasa_mora_ops": t_ops,
            "tasa_mora_monto": t_monto,
        })

    mora_por_ingresos = []
    for r in execute_query("""
        SELECT CASE
                 WHEN c.monto < 3000 THEN 'Bajo (<3K)'
                 WHEN c.monto < 8000 THEN 'Medio (3K-8K)'
                 WHEN c.monto < 15000 THEN 'Alto (8K-15K)'
                 ELSE 'Muy alto (15K+)'
               END AS rango_ingresos,
               COUNT(*) AS total_ops,
               SUM(CASE WHEN c.estado = 'Mora' THEN 1 ELSE 0 END) AS mora_ops
        FROM creditos c
        WHERE c.estado IN ('Vigente', 'Mora', 'Reestructurado')
        GROUP BY rango_ingresos
    """):
        mora_por_ingresos.append({
            "rango_ingresos": r["rango_ingresos"],
            "total_ops": r["total_ops"],
            "mora_ops": r["mora_ops"],
            "tasa_mora_monto": round(r["mora_ops"] / max(1, r["total_ops"]) * 100, 2),
        })

    mora_por_dia_pago = []
    for r in execute_query("""
        SELECT CASE
                 WHEN CAST(substr(c.fecha_desembolso, 9, 2) AS INTEGER) <= 10 THEN 'Inicio de Mes (1-10)'
                 WHEN CAST(substr(c.fecha_desembolso, 9, 2) AS INTEGER) <= 20 THEN 'Mitad de Mes (11-20)'
                 ELSE 'Fin de Mes (21-31)'
               END AS dia_pago,
               COUNT(*) AS total_ops,
               SUM(c.monto) AS total_monto,
               SUM(CASE WHEN c.estado = 'Mora' THEN 1 ELSE 0 END) AS mora_ops,
               SUM(CASE WHEN c.estado = 'Mora' THEN c.monto ELSE 0 END) AS mora_monto
        FROM creditos c
        WHERE c.estado IN ('Vigente', 'Mora', 'Reestructurado')
        GROUP BY dia_pago
    """):
        t_ops, t_monto = _rates(r["total_ops"], r["mora_ops"], r["total_monto"], r["mora_monto"])
        mora_por_dia_pago.append({
            "dia_pago": r["dia_pago"],
            "total_ops": r["total_ops"],
            "total_monto": round(r["total_monto"], 2),
            "mora_ops": r["mora_ops"],
            "mora_monto": round(r["mora_monto"], 2),
            "tasa_mora_ops": t_ops,
            "tasa_mora_monto": t_monto,
        })

    return {
        "source": "synthetic",
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
        "mora_por_dia_pago": mora_por_dia_pago,
    }
