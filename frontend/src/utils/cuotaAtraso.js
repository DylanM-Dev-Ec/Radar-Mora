/** Fecha de corte operativa (alineada con backend). */
export const FECHA_CORTE_CUOTAS = '2026-05-21';

function parseDateOnly(str) {
  if (!str) return null;
  const s = String(str).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/**
 * Días de atraso por cuota según vencimiento (sin tope de 100 en tabla).
 */
export function diasAtrasoCuota(fechaEsperada, fechaPago, estado) {
  const venc = parseDateOnly(fechaEsperada);
  if (!venc) return 0;
  const corte = parseDateOnly(FECHA_CORTE_CUOTAS);
  const est = String(estado || '').trim();

  if (est === 'Pagado') {
    const pago = parseDateOnly(fechaPago);
    if (pago && pago >= venc) {
      return Math.max(0, Math.round((pago - venc) / 86400000));
    }
    return 0;
  }

  if (est === 'Atrasado' || est === 'Pendiente' || !fechaPago) {
    if (venc >= corte) return 0;
    return Math.max(0, Math.round((corte - venc) / 86400000));
  }

  return 0;
}

/** Muestra días de atraso; valores muy altos como "365+". */
export function formatDiasAtraso(dias) {
  const n = Math.max(0, Math.round(Number(dias) || 0));
  if (n >= 365) return '365+';
  return n.toLocaleString('es-EC');
}

/** Estado y badge alineados con mora real (vencimiento + pago). */
export function estadoCuotaDisplay(p) {
  const atraso = diasAtrasoCuota(p.fecha_esperada, p.fecha_pago, p.estado_bd ?? p.estado);
  const est = String(p.estado_bd ?? p.estado ?? '').trim().toLowerCase();
  const esperado = Number(p.monto_esperado) || 0;
  const pagado = Number(p.monto_pagado) || 0;
  const cubierto = esperado > 0 && pagado >= esperado * 0.95;

  if (est === 'pagado' && cubierto) {
    return { atraso, badge: 'Pagado', badgeClass: 'bajo' };
  }
  if (est === 'atrasado' || atraso > 0) {
    return {
      atraso,
      badge: 'Atrasado',
      badgeClass: atraso > 5 ? 'critico' : 'medio',
    };
  }
  if (est === 'pendiente') {
    return { atraso: 0, badge: 'Pendiente', badgeClass: 'bajo' };
  }
  return { atraso: 0, badge: 'Al día', badgeClass: 'bajo' };
}

export function sortCuotasParaDetalle(list) {
  return [...list].sort((a, b) => {
    const da = diasAtrasoCuota(a.fecha_esperada, a.fecha_pago, a.estado_bd ?? a.estado);
    const db = diasAtrasoCuota(b.fecha_esperada, b.fecha_pago, b.estado_bd ?? b.estado);
    if (db !== da) return db - da;
    return (Number(b.num_cuota) || 0) - (Number(a.num_cuota) || 0);
  });
}
