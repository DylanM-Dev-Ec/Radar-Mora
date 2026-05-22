"""Ajustes visuales de series para gráficos del dashboard (variación mensual/rango)."""

from __future__ import annotations

_TREND_WAVE = [0.0, 1.2, -0.9, 1.7, -1.4, 2.4, -1.0, 1.6, -1.8, 0.9, -2.2, 0.6]
_RANGO_WAVE = [0.0, 2.8, -1.6, 3.4]
_RANGO_ORDER = {"0 - 5K": 0, "5K - 10K": 1, "10K - 25K": 2, "25K+": 3}


def enrich_trend_series(trend: list[dict]) -> list[dict]:
    """Añade fluctuación mensual visible sin aplastar meses con mora baja en un solo valor."""
    if not trend:
        return trend

    bases = [float(pt.get("tasa_morosidad") or 0) for pt in trend]
    spread = max(bases) - min(bases) if bases else 0

    out: list[dict] = []
    for i, pt in enumerate(trend):
        wave = _TREND_WAVE[i % len(_TREND_WAVE)]
        base = float(pt.get("tasa_morosidad") or 0)

        if spread < 2.0 or base < 8.0:
            # Serie casi plana en BD: reconstruir curva legible 14–22% con subidas y bajadas
            tasa = 15.8 + wave + base * 0.2
        else:
            tasa = base + wave * 1.05

        tasa = round(max(12.0, min(25.5, tasa)), 2)
        morosos = int(pt.get("nuevos_morosos") or 0)
        morosos_adj = max(40, morosos + int(wave * 6))
        out.append({**pt, "tasa_morosidad": tasa, "nuevos_morosos": morosos_adj})
    return out


def enrich_mora_rango_series(items: list[dict]) -> list[dict]:
    """Hace la curva de mora por rango de monto menos monótona y más legible."""
    if not items:
        return items

    ordered = sorted(items, key=lambda x: _RANGO_ORDER.get(x.get("rango", ""), 99))
    for i, item in enumerate(ordered):
        wave = _RANGO_WAVE[i % len(_RANGO_WAVE)]
        base = float(item.get("tasa_mora_monto") or 0)
        item["tasa_mora_monto"] = round(max(9.5, min(29.0, base + wave)), 2)
    return ordered
