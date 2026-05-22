export function getProvinceByCedula(cedula) {
  if (!cedula || cedula.length < 2) return '';
  const code = cedula.substring(0, 2);
  const provinces = {
    '01': 'Azuay', '02': 'Bolívar', '03': 'Cañar', '04': 'Carchi', '05': 'Cotopaxi',
    '06': 'Chimborazo', '07': 'El Oro', '08': 'Esmeraldas', '09': 'Guayas', '10': 'Imbabura',
    '11': 'Loja', '12': 'Los Ríos', '13': 'Manabí', '14': 'Morona Santiago', '15': 'Napo',
    '16': 'Pastaza', '17': 'Pichincha (Quito)', '18': 'Tungurahua', '19': 'Zamora Chinchipe',
    '20': 'Galápagos', '21': 'Sucumbíos', '22': 'Orellana', '23': 'Santo Domingo', '24': 'Santa Elena',
  };
  return provinces[code] || 'Nacional';
}

import { FECHA_CORTE_CUOTAS } from './cuotaAtraso';

export const PREVENTIVE_WINDOW_MIN = 3;
export const PREVENTIVE_WINDOW_MAX = 15;

function parseDateOnly(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

export function getDaysRemaining(targetDateStr, todayStr = FECHA_CORTE_CUOTAS) {
  const t0 = parseDateOnly(todayStr);
  const f0 = parseDateOnly(targetDateStr);
  if (t0 == null || f0 == null) return null;
  return Math.round((f0 - t0) / 86400000);
}

/** Urgencia y barra de proximidad al vencimiento (ventana 3–15 días). */
export function getVencimientoUrgency(
  daysLeft,
  minDays = PREVENTIVE_WINDOW_MIN,
  maxDays = PREVENTIVE_WINDOW_MAX,
) {
  if (daysLeft == null || Number.isNaN(daysLeft)) {
    return {
      label: 'Cuota por vencer',
      tier: 'neutral',
      progress: 0,
      badgeClass: 'bajo',
    };
  }
  const span = Math.max(1, maxDays - minDays);
  const clamped = Math.max(0, Math.min(maxDays, daysLeft));
  const progress = Math.round(((maxDays - clamped) / span) * 100);

  if (daysLeft <= 0) {
    return { label: 'Vence hoy', tier: 'critico', progress: 100, badgeClass: 'critico' };
  }
  if (daysLeft <= minDays) {
    return {
      label: daysLeft === 1 ? 'Urgente · 1 día' : `Urgente · ${daysLeft} días`,
      tier: 'critico',
      progress: Math.max(progress, 88),
      badgeClass: 'critico',
    };
  }
  if (daysLeft <= 7) {
    return {
      label: `En ${daysLeft} días`,
      tier: 'medio',
      progress,
      badgeClass: 'medio',
    };
  }
  return {
    label: `En ${daysLeft} días`,
    tier: 'calmo',
    progress,
    badgeClass: 'bajo',
  };
}

export function riskBadgeClass(level) {
  const l = (level || '').toLowerCase();
  if (l.includes('crít') || l.includes('crit')) return 'critico';
  if (l.includes('alto')) return 'alto';
  if (l.includes('medio')) return 'medio';
  return 'bajo';
}

export function isSinGestion(accion) {
  return !accion || accion === 'Ninguna' || accion === 'sin_gestionar' || accion === '';
}
