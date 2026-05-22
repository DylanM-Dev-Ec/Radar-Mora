"""
socios.py - Endpoints de socios y detalle de socio para CoopTech Tulcán.
"""

import math
from fastapi import APIRouter, Query, HTTPException
from database import (
    execute_query,
    execute_query_one,
    SQL_DIAS_ATRASO_CAP,
    cap_dias_atraso,
    cap_dias_display,
    dias_atraso_cuota,
    estado_cuota_display,
    FECHA_CORTE,
)
from models.risk_model import predict_risk, predict_all, model_exists, level_from_score
from socio_profile_enrichment import enrich_balance_history, enrich_transactions

router = APIRouter(prefix="/api/socios", tags=["Socios"])


@router.get("")
def list_socios(
    risk_level: str = Query(None, description="Filtrar por nivel de riesgo"),
    agency: str = Query(None, description="Filtrar por agencia"),
    search: str = Query(None, description="Buscar por nombre o cédula"),
    sort_by: str = Query("risk_score", description="Ordenar por campo"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Lista socios con filtros, paginación y datos de riesgo."""

    # Obtener riesgos de todos los socios
    risks = predict_all() if model_exists() else []
    risk_map = {r["socio_id"]: r for r in risks}

    # Construir query base
    query = f"""
        SELECT
            s.id, s.nombre, s.cedula, s.agencia,
            c.id as credito_id, c.monto, c.estado as credito_estado,
            COALESCE(AVG({SQL_DIAS_ATRASO_CAP}), 0) as dias_atraso_promedio
        FROM socios s
        LEFT JOIN creditos c ON c.socio_id = s.id
            AND c.estado IN ('Vigente', 'Mora', 'Reestructurado')
        LEFT JOIN pagos p ON p.credito_id = c.id
        WHERE s.estado = 'Activo'
    """
    params = []

    if agency:
        query += " AND s.agencia = ?"
        params.append(agency)

    if search:
        query += " AND (s.nombre LIKE ? OR s.cedula LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])

    query += " GROUP BY s.id ORDER BY s.nombre"

    rows = execute_query(query, tuple(params))

    # Enriquecer con datos de riesgo
    socios_enriched = []
    for row in rows:
        risk_data = risk_map.get(row["id"], {"risk_score": 0, "risk_level": "Sin datos"})

        socios_enriched.append({
            "id": row["id"],
            "nombre": row["nombre"],
            "cedula": row["cedula"],
            "agencia": row["agencia"],
            "credito_activo": row["credito_id"] is not None,
            "monto": row["monto"] or 0,
            "risk_score": risk_data["risk_score"],
            "risk_level": risk_data["risk_level"],
            "dias_atraso_promedio": round(cap_dias_atraso(row["dias_atraso_promedio"]), 1),
        })

    # Filtro por nivel de riesgo (post-query ya que viene del modelo)
    if risk_level:
        socios_enriched = [s for s in socios_enriched if s["risk_level"] == risk_level]

    # Ordenar
    sort_options = {
        "risk_score": lambda x: x["risk_score"],
        "nombre": lambda x: x["nombre"],
        "monto": lambda x: x["monto"],
        "dias_atraso": lambda x: x["dias_atraso_promedio"],
    }
    sort_fn = sort_options.get(sort_by, sort_options["risk_score"])
    reverse = sort_by in ("risk_score", "monto", "dias_atraso")
    socios_enriched.sort(key=sort_fn, reverse=reverse)

    # Paginar
    total = len(socios_enriched)
    total_pages = max(1, math.ceil(total / limit))
    start = (page - 1) * limit
    end = start + limit
    paginated = socios_enriched[start:end]

    return {
        "socios": paginated,
        "total": total,
        "page": page,
        "pages": total_pages,
    }


@router.get("/{socio_id}")
def get_socio_detail(socio_id: int):
    """Retorna detalle completo de un socio."""

    # Info básica
    socio = execute_query_one(
        "SELECT * FROM socios WHERE id = ?", (socio_id,)
    )
    if not socio:
        raise HTTPException(status_code=404, detail="Socio no encontrado")

    # Calcular antigüedad
    from datetime import datetime
    fecha_ingreso = datetime.strptime(socio["fecha_ingreso"], "%Y-%m-%d")
    now = datetime(2026, 5, 21)
    antiguedad_meses = (now.year - fecha_ingreso.year) * 12 + (now.month - fecha_ingreso.month)
    if antiguedad_meses >= 12:
        antiguedad_str = f"{antiguedad_meses // 12} años, {antiguedad_meses % 12} meses"
    else:
        antiguedad_str = f"{antiguedad_meses} meses"

    info = {
        "id": socio["id"],
        "nombre": socio["nombre"],
        "cedula": socio["cedula"],
        "edad": socio["edad"],
        "ocupacion": socio["ocupacion"],
        "agencia": socio["agencia"],
        "fecha_ingreso": socio["fecha_ingreso"],
        "antiguedad": antiguedad_str,
        "telefono": socio["telefono"],
        "email": socio["email"],
        "estado": socio["estado"],
    }

    # Riesgo
    risk_data = predict_risk(socio_id) if model_exists() else {
        "risk_score": 0, "risk_level": "Sin datos", "factors": []
    }

    risk_score = float(risk_data["risk_score"] or 0)
    risk = {
        "score": risk_score,
        "level": level_from_score(risk_score),
        "factors": risk_data.get("factors", []),
        "feature_values": risk_data.get("feature_values", {}),
        "statistical_adjustment": risk_data.get("statistical_adjustment", 0),
        "statistical_segments": risk_data.get("statistical_segments", []),
        "portfolio_avg_mora": risk_data.get("portfolio_avg_mora"),
    }

    # Créditos
    creditos_raw = execute_query(
        "SELECT * FROM creditos WHERE socio_id = ? ORDER BY fecha_desembolso DESC",
        (socio_id,)
    )

    creditos = []
    for c in creditos_raw:
        plazo = max(1, int(c["plazo_meses"] or 1))
        pago_stats = execute_query_one(
            f"""
            SELECT
                SUM(CASE WHEN p.estado = 'Pagado' THEN 1 ELSE 0 END) as pagados,
                SUM(CASE WHEN p.estado = 'Atrasado' THEN 1 ELSE 0 END) as atrasadas,
                MAX(CASE WHEN p.estado = 'Atrasado' THEN {SQL_DIAS_ATRASO_CAP} ELSE 0 END) as max_atraso
            FROM pagos p WHERE p.credito_id = ?
            """,
            (c["id"],),
        ) or {}
        pagos_pagados = int(pago_stats.get("pagados") or 0)
        progreso = round(min(100.0, pagos_pagados / plazo * 100), 1)
        estado_bd = (c.get("estado") or "Vigente").strip()
        if progreso >= 100 or pagos_pagados >= plazo:
            estado_display = "Completado"
        elif estado_bd == "Mora":
            estado_display = "Mora"
        elif int(pago_stats.get("atrasadas") or 0) > 0:
            estado_display = "Mora"
        else:
            estado_display = estado_bd

        creditos.append({
            "id": c["id"],
            "monto": c["monto"],
            "plazo": c["plazo_meses"],
            "cuota": c["cuota_mensual"],
            "estado": estado_display,
            "estado_bd": estado_bd,
            "tipo": c["tipo"],
            "fecha_desembolso": c["fecha_desembolso"],
            "tasa_interes": c["tasa_interes"],
            "progreso": progreso,
            "cuotas_atrasadas": int(pago_stats.get("atrasadas") or 0),
            "dias_mora_max": cap_dias_display(cap_dias_atraso(pago_stats.get("max_atraso"))),
        })

    # Resumen financiero
    total_creditos = len(creditos_raw)
    total_pagado_result = execute_query_one(
        """SELECT COALESCE(SUM(p.monto_pagado), 0) as total
           FROM pagos p
           JOIN creditos c ON p.credito_id = c.id
           WHERE c.socio_id = ?""",
        (socio_id,)
    )
    total_pagado = total_pagado_result["total"]

    total_pendiente_result = execute_query_one(
        """SELECT COALESCE(SUM(p.monto_esperado - p.monto_pagado), 0) as total
           FROM pagos p
           JOIN creditos c ON p.credito_id = c.id
           WHERE c.socio_id = ? AND p.estado IN ('Pendiente', 'Atrasado')""",
        (socio_id,)
    )
    total_pendiente = total_pendiente_result["total"]

    mora_resumen = execute_query_one(
        f"""SELECT
            MAX(CASE WHEN p.estado = 'Atrasado' THEN {SQL_DIAS_ATRASO_CAP} ELSE 0 END) as dias_mora,
            SUM(CASE WHEN p.estado = 'Atrasado' AND {SQL_DIAS_ATRASO_CAP} > 0 THEN 1 ELSE 0 END) as cuotas_atrasadas,
            MAX(CASE WHEN c.estado = 'Mora' THEN 1 ELSE 0 END) as en_mora
           FROM pagos p
           JOIN creditos c ON p.credito_id = c.id
           WHERE c.socio_id = ?""",
        (socio_id,),
    ) or {}

    resumen = {
        "total_creditos": total_creditos,
        "total_pagado": round(total_pagado, 2),
        "total_pendiente": round(total_pendiente, 2),
        "dias_mora": cap_dias_display(cap_dias_atraso(mora_resumen.get("dias_mora"))),
        "cuotas_atrasadas": int(mora_resumen.get("cuotas_atrasadas") or 0),
        "en_mora": bool(mora_resumen.get("en_mora")),
    }

    return {
        "info": info,
        "risk": risk,
        "creditos": creditos,
        "resumen": resumen,
    }


@router.get("/{socio_id}/payments")
def get_socio_payments(socio_id: int):
    """Retorna historial de pagos del socio."""

    # Verificar que el socio existe
    socio = execute_query_one("SELECT id FROM socios WHERE id = ?", (socio_id,))
    if not socio:
        raise HTTPException(status_code=404, detail="Socio no encontrado")

    corte = FECHA_CORTE.isoformat()
    pagos = execute_query(
        """
        SELECT
            p.num_cuota, p.fecha_esperada, p.fecha_pago,
            p.monto_esperado, p.monto_pagado, p.dias_atraso,
            p.estado, c.tipo as tipo_credito, c.id as credito_id,
            c.estado as credito_estado
        FROM pagos p
        JOIN creditos c ON p.credito_id = c.id
        WHERE c.socio_id = ?
        ORDER BY
            CASE
                WHEN p.estado = 'Atrasado' THEN 0
                WHEN p.estado = 'Pendiente' AND date(p.fecha_esperada) < date(?) THEN 1
                ELSE 2
            END,
            CASE WHEN c.estado = 'Mora' THEN 0 ELSE 1 END,
            CASE WHEN p.estado = 'Atrasado' THEN date(p.fecha_esperada) END DESC,
            p.num_cuota DESC
        LIMIT 120
        """,
        (socio_id, corte),
    )

    out = []
    for p in pagos:
        dias = dias_atraso_cuota(
            p["fecha_esperada"],
            p.get("fecha_pago"),
            p["estado"],
        )
        visual = estado_cuota_display(
            p["fecha_esperada"],
            p.get("fecha_pago"),
            p["estado"],
            p.get("monto_esperado"),
            p.get("monto_pagado"),
        )
        out.append({
            "credito_id": p["credito_id"],
            "num_cuota": p["num_cuota"],
            "fecha_esperada": p["fecha_esperada"],
            "fecha_pago": p["fecha_pago"],
            "monto_esperado": p["monto_esperado"],
            "monto_pagado": p["monto_pagado"],
            "dias_atraso": dias,
            "estado": visual,
            "estado_bd": p["estado"],
            "tipo_credito": p["tipo_credito"],
            "credito_estado": p.get("credito_estado"),
        })
    return out


@router.get("/{socio_id}/transactions")
def get_socio_transactions(socio_id: int):
    """Retorna transacciones del socio."""

    socio = execute_query_one("SELECT id FROM socios WHERE id = ?", (socio_id,))
    if not socio:
        raise HTTPException(status_code=404, detail="Socio no encontrado")

    transacciones = execute_query("""
        SELECT fecha, tipo, monto, saldo_resultante, descripcion
        FROM transacciones
        WHERE socio_id = ?
        ORDER BY fecha DESC, id DESC
        LIMIT 500
    """, (socio_id,))

    payload = [
        {
            "fecha": t["fecha"],
            "tipo": t["tipo"],
            "monto": t["monto"],
            "saldo_resultante": t["saldo_resultante"],
            "descripcion": t["descripcion"],
        }
        for t in transacciones
    ]
    return enrich_transactions(socio_id, payload)


@router.get("/{socio_id}/balance-history")
def get_socio_balance_history(socio_id: int):
    """Retorna historial de saldos del socio."""

    socio = execute_query_one("SELECT id FROM socios WHERE id = ?", (socio_id,))
    if not socio:
        raise HTTPException(status_code=404, detail="Socio no encontrado")

    balances = execute_query("""
        SELECT t.fecha, t.saldo_resultante as saldo
        FROM transacciones t
        INNER JOIN (
            SELECT fecha, MAX(id) as max_id
            FROM transacciones
            WHERE socio_id = ?
            GROUP BY fecha
        ) ult ON t.id = ult.max_id
        WHERE t.socio_id = ?
        ORDER BY t.fecha ASC
        LIMIT 24
    """, (socio_id, socio_id))

    if len(balances) < 2:
        balances = execute_query("""
            SELECT fecha, saldo_resultante as saldo
            FROM transacciones
            WHERE socio_id = ?
            ORDER BY fecha ASC, id ASC
            LIMIT 24
        """, (socio_id,))

    payload = [
        {"fecha": b["fecha"], "saldo": round(float(b["saldo"] or 0), 2)}
        for b in balances
    ]
    return enrich_balance_history(socio_id, payload)
