"""Completa saldo y transacciones cuando el socio tiene pocos movimientos en BD."""

from __future__ import annotations

from database import execute_query, execute_query_one


def _socio_credit_context(socio_id: int) -> dict:
    row = execute_query_one(
        """
        SELECT c.cuota_mensual, c.monto, c.plazo_meses, c.estado,
               MAX(CASE WHEN p.estado = 'Atrasado' THEN p.dias_atraso ELSE 0 END) as max_atraso
        FROM creditos c
        LEFT JOIN pagos p ON p.credito_id = c.id
        WHERE c.socio_id = ?
        GROUP BY c.id
        ORDER BY c.estado = 'Mora' DESC, c.id DESC
        LIMIT 1
        """,
        (socio_id,),
    )
    if not row:
        return {"cuota": 480.0, "en_mora": False, "max_atraso": 0}
    return {
        "cuota": float(row.get("cuota_mensual") or 480),
        "monto": float(row.get("monto") or 5000),
        "en_mora": row.get("estado") == "Mora",
        "max_atraso": int(row.get("max_atraso") or 0),
    }


def enrich_balance_history(socio_id: int, rows: list[dict]) -> list[dict]:
    """Serie mensual de saldo (mín. 10 puntos) para el gráfico."""
    if len(rows) >= 6:
        return rows[-12:]

    ctx = _socio_credit_context(socio_id)
    critical = ctx["en_mora"] or ctx["max_atraso"] >= 30
    anchor = float(rows[-1]["saldo"]) if rows else (420.0 if critical else 1200.0)

    months = [
        "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11",
        "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05",
    ]
    waves = [180, 240, 120, -90, 200, -140, 160, -200, 80, -260, 150, 0]
    if critical:
        waves = [420, 380, 320, 280, 220, 180, 140, 95, 60, 35, 18, 0]
        start = max(anchor + 2800, 2200)
    else:
        start = max(anchor + 1400, 900)

    out = []
    for i, mes in enumerate(months):
        saldo = max(50.0, round(start + waves[i], 2))
        out.append({"fecha": mes, "saldo": saldo})
    return out


def enrich_transactions(socio_id: int, rows: list[dict]) -> list[dict]:
    """Lista de movimientos recientes cuando hay pocos registros."""
    if len(rows) >= 8:
        return rows[:20]

    ctx = _socio_credit_context(socio_id)
    cuota = ctx["cuota"]
    critical = ctx["en_mora"] or ctx["max_atraso"] >= 30
    seed = socio_id % 7

    templates = [
        ("2026-05-21", "Retiro Ventanilla", -280),
        ("2026-05-19", "Depósito Efectivo", 450),
        ("2026-05-17", "Transferencia Enviada", -150),
        ("2026-05-15", "Pago de Cuota", -cuota),
        ("2026-05-12", "Retiro Cajero Automático", -200),
        ("2026-05-10", "Depósito Transferencia", 620),
        ("2026-05-08", "Compra POS Comercial", -85),
        ("2026-05-05", "Retiro Ventanilla", -310),
        ("2026-05-03", "Depósito Nómina / Ventas", 890 + seed * 12),
        ("2026-04-28", "Pago de Cuota", -cuota),
        ("2026-04-25", "Retiro Ventanilla", -420),
        ("2026-04-22", "Depósito Efectivo", 380),
        ("2026-04-18", "Transferencia Recibida", 520),
        ("2026-04-15", "Pago de Cuota", -cuota),
        ("2026-04-10", "Retiro Ventanilla", -195),
    ]
    if critical:
        templates[3] = ("2026-05-15", "Intento Pago Cuota", -min(cuota * 0.15, 80))
        templates[9] = ("2026-04-28", "Cargo por mora", -35)

    saldo = 1850.0 + (seed * 40)
    if rows:
        saldo = max(80.0, float(rows[0].get("saldo_resultante") or saldo))

    built = []
    for fecha, tipo, monto in templates:
        saldo = max(40.0, round(saldo + float(monto), 2))
        built.append({
            "fecha": fecha,
            "tipo": tipo,
            "monto": round(float(monto), 2),
            "saldo_resultante": saldo,
            "descripcion": tipo,
        })
    return built
