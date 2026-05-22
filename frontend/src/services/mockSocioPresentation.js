/** Datos de presentación para perfil de socio (demo hackathon). */

const PORTFOLIO_AVG_MORA = 18.2;

const STAT_BY_SOCIO = {
  '710282': [
    { dimension: 'tipo_cartera', dimension_label: 'Tipo de cartera', segment: 'Consumo Reestructurado', tasa_mora_segmento: 44.05, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 25.85, points: 6.8 },
    { dimension: 'vivienda', dimension_label: 'Tipo de vivienda', segment: 'Rentada', tasa_mora_segmento: 25.6, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 7.4, points: 3.2 },
    { dimension: 'cargas', dimension_label: 'Cargas familiares', segment: '3 Cargas', tasa_mora_segmento: 24.26, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 6.06, points: 2.8 },
    { dimension: 'educacion', dimension_label: 'Nivel educativo', segment: 'Primaria', tasa_mora_segmento: 21.72, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 3.52, points: 2.1 },
    { dimension: 'zona', dimension_label: 'Zona geográfica', segment: 'Carchi', tasa_mora_segmento: 18.79, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 0.59, points: 0 },
  ],
  '906037': [
    { dimension: 'actividad', dimension_label: 'Actividad económica', segment: 'Servicios De Taxis', tasa_mora_segmento: 20.8, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 2.6, points: 1.4 },
    { dimension: 'tipo_cartera', dimension_label: 'Tipo de cartera', segment: 'Microcredito Liquidacion', tasa_mora_segmento: 19.42, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 1.22, points: 0 },
    { dimension: 'estado_civil', dimension_label: 'Estado civil', segment: 'Unión de Hecho', tasa_mora_segmento: 24.17, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 5.97, points: 2.6 },
    { dimension: 'rango_monto', dimension_label: 'Monto del crédito', segment: '5K - 10K', tasa_mora_segmento: 19.8, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 1.6, points: 0.8 },
  ],
  '1994670': [
    { dimension: 'tipo_cartera', dimension_label: 'Tipo de cartera', segment: 'Consumo Reestructurado', tasa_mora_segmento: 44.05, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 25.85, points: 6.5 },
    { dimension: 'destino', dimension_label: 'Destino del crédito', segment: 'Capital de Trabajo', tasa_mora_segmento: 20.2, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 2.0, points: 1.2 },
    { dimension: 'edad', dimension_label: 'Rango de edad', segment: 'Adultos Jóvenes (25-39)', tasa_mora_segmento: 18.51, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 0.31, points: 0 },
  ],
  '1976701': [
    { dimension: 'actividad', dimension_label: 'Actividad económica', segment: 'Cultivo De Papa', tasa_mora_segmento: 11.08, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: -7.12, points: 0 },
    { dimension: 'zona', dimension_label: 'Zona geográfica', segment: 'Carchi', tasa_mora_segmento: 18.79, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 0.59, points: 0 },
    { dimension: 'rango_monto', dimension_label: 'Monto del crédito', segment: '10K - 25K', tasa_mora_segmento: 21.2, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 3.0, points: 1.8 },
  ],
  '494647': [
    { dimension: 'actividad', dimension_label: 'Actividad económica', segment: 'Todas Las Actividades De Transporte De Carga', tasa_mora_segmento: 18.72, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 0.52, points: 0 },
    { dimension: 'plazo_cuotas', dimension_label: 'Plazo en cuotas', segment: '37-60 cuotas (3-5 Años)', tasa_mora_segmento: 20.63, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 2.43, points: 1.5 },
  ],
  '554224': [
    { dimension: 'educacion', dimension_label: 'Nivel educativo', segment: 'Universitaria', tasa_mora_segmento: 17.61, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: -0.59, points: 0 },
    { dimension: 'tipo_cartera', dimension_label: 'Tipo de cartera', segment: 'Consumo', tasa_mora_segmento: 15.59, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: -2.61, points: 0 },
  ],
  '1476509': [
    { dimension: 'edad', dimension_label: 'Rango de edad', segment: 'Adultos Mayores (60+)', tasa_mora_segmento: 22.82, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 4.62, points: 2.4 },
    { dimension: 'estado_civil', dimension_label: 'Estado civil', segment: 'Casado/a', tasa_mora_segmento: 18.81, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 0.61, points: 0 },
  ],
  '1380560': [
    { dimension: 'actividad', dimension_label: 'Actividad económica', segment: 'Producción De Leche Cruda De Vaca', tasa_mora_segmento: 13.01, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: -5.19, points: 0 },
    { dimension: 'zona', dimension_label: 'Zona geográfica', segment: 'Carchi', tasa_mora_segmento: 18.79, tasa_mora_cartera: PORTFOLIO_AVG_MORA, excess: 0.59, points: 0 },
  ],
};

const EXTRA_FACTORS = {
  '710282': [
    { name: 'alerta_retiro_ahorros', description: 'Retiros de ahorro por encima del patrón habitual', value: 1, importance: 0.28, impact: 'negativo' },
    { name: 'cambio_saldo_ahorro', description: 'Caída del saldo en ahorros respecto al trimestre anterior', value: -1240, importance: 0.24, impact: 'negativo' },
    { name: 'num_transacciones', description: 'Volumen de transacciones en los últimos 30 días', value: 14, importance: 0.18, impact: 'negativo' },
    { name: 'ratio_ingreso_egreso', description: 'Ingresos vs egresos del período', value: 0.82, importance: 0.2, impact: 'negativo' },
    { name: 'alerta_caida_actividad', description: 'Caída de actividad en cuenta corriente', value: 1, importance: 0.22, impact: 'negativo' },
  ],
  '906037': [
    { name: 'alerta_caida_actividad', description: 'Caída severa de transacciones en cuenta', value: 1, importance: 0.32, impact: 'negativo' },
    { name: 'ratio_ingreso_egreso', description: 'Ingresos cubren con lo justo la cuota del mes', value: 1.05, importance: 0.26, impact: 'negativo' },
    { name: 'num_transacciones', description: 'Transacciones últimos 30 días', value: 9, importance: 0.2, impact: 'negativo' },
    { name: 'saldo_disponible', description: 'Saldo disponible en cuenta', value: 420.5, importance: 0.15, impact: 'negativo' },
  ],
  '1976701': [
    { name: 'ratio_ingreso_egreso', description: 'Capacidad de pago ajustada al cierre de mes', value: 1.12, importance: 0.3, impact: 'negativo' },
    { name: 'num_transacciones', description: 'Transacciones últimos 30 días', value: 22, importance: 0.18, impact: 'negativo' },
    { name: 'volumen_total', description: 'Volumen transaccional mensual', value: 2850, importance: 0.2, impact: 'positivo' },
    { name: 'nro_creditos', description: 'Créditos vigentes', value: 1, importance: 0.12, impact: 'positivo' },
  ],
  '1994670': [
    { name: 'credito_en_mora', description: 'Crédito en estado mora', value: 1, importance: 0.35, impact: 'negativo' },
    { name: 'dias_mora', description: 'Días de atraso en cuotas', value: 48, importance: 0.3, impact: 'negativo' },
    { name: 'ratio_ingreso_egreso', description: 'Ingresos vs egresos', value: 0.95, importance: 0.22, impact: 'negativo' },
    { name: 'alerta_critica_ia', description: 'Señal crítica de deterioro transaccional', value: 1, importance: 0.25, impact: 'negativo' },
  ],
};

function statFactorsFromHits(hits) {
  return hits
    .filter((h) => h.points > 0 && h.dimension !== 'tipo_cartera')
    .slice(0, 6)
    .map((h) => ({
      name: `stat_${h.dimension}`,
      description: `${h.dimension_label}: «${h.segment}» con mora ${h.tasa_mora_segmento.toFixed(1)}% (cartera ${h.tasa_mora_cartera.toFixed(1)}%, +${h.excess.toFixed(1)} pp)`,
      value: h.tasa_mora_segmento,
      importance: Math.min(0.28, 0.12 + h.points / 40),
      impact: 'negativo',
    }));
}

export function enrichMockSocio(socio) {
  const id = socio.id;
  const allHits = STAT_BY_SOCIO[id] || [];
  const hits = allHits.filter((h) => h.points > 0);
  const adjustment = Math.round(Math.min(24, hits.reduce((s, h) => s + h.points, 0)) * 10) / 10;
  const statFactors = statFactorsFromHits(hits);
  const extra = EXTRA_FACTORS[id] || [];
  const baseFactors = socio.risk?.factors || [];
  const mergedFactors = [...baseFactors, ...extra, ...statFactors].filter((f, i, arr) => {
    const key = f.name || f.description;
    return arr.findIndex((x) => (x.name || x.description) === key) === i;
  });

  return {
    ...socio,
    risk: {
      ...socio.risk,
      factors: mergedFactors.length ? mergedFactors : extra.length ? extra : baseFactors,
      statistical_segments: hits,
      statistical_adjustment: adjustment,
      portfolio_avg_mora: PORTFOLIO_AVG_MORA,
    },
  };
}

export function buildMockTransactions(socio) {
  const id = socio.id;
  const cuota = socio.creditos?.[0]?.cuota || 480;
  const templates = {
    '710282': [
      ['2026-05-21', 'Retiro Ventanilla', -280],
      ['2026-05-19', 'Depósito Efectivo', 450],
      ['2026-05-17', 'Transferencia Enviada', -150],
      ['2026-05-15', 'Pago de Cuota', -cuota],
      ['2026-05-12', 'Retiro Cajero', -200],
      ['2026-05-10', 'Depósito Transferencia', 620],
      ['2026-05-08', 'Compra POS Comercial', -85],
      ['2026-05-05', 'Retiro Ventanilla', -310],
      ['2026-05-03', 'Depósito Nómina Socio', 890],
      ['2026-04-28', 'Pago de Cuota', -cuota],
      ['2026-04-25', 'Retiro Ventanilla', -420],
      ['2026-04-22', 'Depósito Efectivo', 380],
      ['2026-04-18', 'Transferencia Recibida', 520],
      ['2026-04-15', 'Pago de Cuota', -cuota],
      ['2026-04-10', 'Retiro Ventanilla', -195],
    ],
    '906037': [
      ['2026-05-20', 'Retiro Ventanilla', -120],
      ['2026-05-18', 'Depósito Transferencia', 340],
      ['2026-05-16', 'Compra POS', -45],
      ['2026-05-14', 'Pago de Cuota', -cuota],
      ['2026-05-11', 'Retiro Cajero', -80],
      ['2026-05-08', 'Depósito Efectivo', 290],
      ['2026-05-05', 'Retiro Ventanilla', -95],
      ['2026-05-02', 'Depósito Venta Local', 410],
      ['2026-04-28', 'Pago de Cuota', -cuota],
      ['2026-04-24', 'Retiro Ventanilla', -110],
      ['2026-04-20', 'Depósito Transferencia', 255],
      ['2026-04-17', 'Compra POS', -62],
    ],
  };
  const rows = templates[id] || templates['710282'].map(([f, t, m], i) => {
    const jitter = ((Number(id) || 0) % 5) * 15 * (i % 2 ? 1 : -1);
    return [f, t, m + jitter];
  });
  let saldo = 1850;
  return rows.map(([fecha, tipo, monto]) => {
    saldo = Math.max(0, saldo + monto);
    return { fecha, tipo, monto, saldo_resultante: saldo };
  });
}

export function buildMockPayments(socio) {
  const cred = socio.creditos?.[0];
  const cuota = cred?.cuota || 620;
  const plazo = cred?.plazo || 36;
  const maxAtraso = Math.min(socio.resumen?.dias_mora || 0, 95);
  const start = Math.max(1, plazo - 11);
  const items = [];
  for (let n = start; n <= plazo; n += 1) {
    const isLast = n >= plazo - 2;
    const atraso = isLast ? Math.round(maxAtraso) : (n === plazo - 3 ? Math.round(maxAtraso * 0.4) : 0);
    const pagado = atraso === 0 ? cuota : (n < plazo - 2 ? cuota : 0);
    items.push({
      num_cuota: n,
      monto_esperado: cuota,
      monto_pagado: pagado,
      dias_atraso: atraso,
      estado: atraso > 0 ? 'Atrasado' : 'Pagado',
    });
  }
  return items;
}

export function buildMockBalanceHistory(socio) {
  const critical = ['Crítico', 'Alto'].includes(socio.risk?.level);
  const months = [
    '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11',
    '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
  ];
  const waves = critical
    ? [420, 380, 320, 280, 220, 180, 140, 95, 60, 35, 18, 0]
    : [180, 240, 120, -90, 200, -140, 160, -200, 80, -260, 150, 0];
  const start = critical ? 2600 : 1100;
  return months.map((fecha, i) => ({
    fecha,
    saldo: Math.max(80, Math.round(start + waves[i])),
  }));
}
