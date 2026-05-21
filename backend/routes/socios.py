"""
socios.py - Endpoints de socios y detalle de socio para CoopTech Tulcán.
"""

import math
from fastapi import APIRouter, Query, HTTPException
from database import execute_query, execute_query_one
from models.risk_model import predict_risk, predict_all, model_exists

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
    query = """
        SELECT
            s.id, s.nombre, s.cedula, s.agencia,
            c.id as credito_id, c.monto, c.estado as credito_estado,
            COALESCE(AVG(p.dias_atraso), 0) as dias_atraso_promedio
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
            "dias_atraso_promedio": round(row["dias_atraso_promedio"], 1),
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

    risk = {
        "score": risk_data["risk_score"],
        "level": risk_data["risk_level"],
        "factors": risk_data.get("factors", []),
    }

    # Créditos
    creditos_raw = execute_query(
        "SELECT * FROM creditos WHERE socio_id = ? ORDER BY fecha_desembolso DESC",
        (socio_id,)
    )

    creditos = []
    for c in creditos_raw:
        # Calcular progreso
        pagos_pagados = execute_query_one(
            "SELECT COUNT(*) as cnt FROM pagos WHERE credito_id = ? AND estado = 'Pagado'",
            (c["id"],)
        )["cnt"]
        progreso = round(pagos_pagados / max(1, c["plazo_meses"]) * 100, 1)

        creditos.append({
            "id": c["id"],
            "monto": c["monto"],
            "plazo": c["plazo_meses"],
            "cuota": c["cuota_mensual"],
            "estado": c["estado"],
            "tipo": c["tipo"],
            "fecha_desembolso": c["fecha_desembolso"],
            "tasa_interes": c["tasa_interes"],
            "progreso": progreso,
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

    pagos_totales = execute_query_one(
        """SELECT
            COUNT(*) as total,
            SUM(CASE WHEN dias_atraso <= 5 AND estado = 'Pagado' THEN 1 ELSE 0 END) as puntuales
           FROM pagos p
           JOIN creditos c ON p.credito_id = c.id
           WHERE c.socio_id = ? AND p.estado = 'Pagado'""",
        (socio_id,)
    )
    puntualidad = round(
        pagos_totales["puntuales"] / max(1, pagos_totales["total"]) * 100, 1
    ) if pagos_totales["total"] else 0

    resumen = {
        "total_creditos": total_creditos,
        "total_pagado": round(total_pagado, 2),
        "total_pendiente": round(total_pendiente, 2),
        "puntualidad": puntualidad,
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

    pagos = execute_query("""
        SELECT
            p.num_cuota, p.fecha_esperada, p.fecha_pago,
            p.monto_esperado, p.monto_pagado, p.dias_atraso,
            p.estado, c.tipo as tipo_credito, c.id as credito_id
        FROM pagos p
        JOIN creditos c ON p.credito_id = c.id
        WHERE c.socio_id = ?
        ORDER BY c.id, p.num_cuota
    """, (socio_id,))

    return [
        {
            "credito_id": p["credito_id"],
            "num_cuota": p["num_cuota"],
            "fecha_esperada": p["fecha_esperada"],
            "fecha_pago": p["fecha_pago"],
            "monto_esperado": p["monto_esperado"],
            "monto_pagado": p["monto_pagado"],
            "dias_atraso": p["dias_atraso"],
            "estado": p["estado"],
            "tipo_credito": p["tipo_credito"],
        }
        for p in pagos
    ]


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

    return [
        {
            "fecha": t["fecha"],
            "tipo": t["tipo"],
            "monto": t["monto"],
            "saldo_resultante": t["saldo_resultante"],
            "descripcion": t["descripcion"],
        }
        for t in transacciones
    ]


@router.get("/{socio_id}/balance-history")
def get_socio_balance_history(socio_id: int):
    """Retorna historial de saldos del socio."""

    socio = execute_query_one("SELECT id FROM socios WHERE id = ?", (socio_id,))
    if not socio:
        raise HTTPException(status_code=404, detail="Socio no encontrado")

    # Obtener último saldo de cada día
    balances = execute_query("""
        SELECT fecha, saldo_resultante as saldo
        FROM transacciones
        WHERE socio_id = ?
        GROUP BY fecha
        HAVING id = MAX(id)
        ORDER BY fecha
    """, (socio_id,))

    return [
        {"fecha": b["fecha"], "saldo": b["saldo"]}
        for b in balances
    ]
