/** Narrativa gerencial — MVP hackathon Radar Mora (modo presentación) */

export const BRAND = {
  product: 'Radar Mora',
  org: 'Cooperativa de Ahorro y Crédito Tulcán',
  region: 'Carchi · Ecuador',
  tagline: 'Cobranza preventiva y priorización de cartera',
};

export const INSIGHTS = [
  '<strong>82 socios críticos</strong> detectados antes del incumplimiento · priorización automática esta semana.',
  '<strong>Patrones transaccionales anómalos</strong> en 156 perfiles · riesgo emergente fuera de banda histórica.',
  '<strong>625 socios</strong> en monitoreo alto/crítico sobre una cartera de 29.821 socios activos.',
  '<strong>Priorización de cobranza:</strong> 300 casos accionables asignados al equipo esta semana.',
  'Anticipación de hasta <strong>12 días</strong> respecto al primer día de mora en casos señalados.',
  'Cobertura en <strong>16 agencias</strong> con cola operativa y ventana de cobranza preventiva.',
];

export const DASHBOARD = {
  heroTitle: 'Radar Mora',
  heroLead: 'Plataforma de <strong>cobranza preventiva</strong> para cooperativas: anticipamos el incumplimiento, priorizamos la gestión y protegemos la relación con cada socio.',
  pill: 'Gestión de cartera · Demo',
  moraLabel: 'Morosidad actual de cartera',
  moraSub: 'Indicador consolidado al corte',
  colaLabel: 'Casos priorizados esta semana',
  colaSub: 'Cola operativa asignada al equipo',
  universoLabel: 'Socios en monitoreo alto/crítico',
  universoSub: 'Universo en radar de mora',
  flow: [
    { n: '29.821', l: 'Perfiles transaccionales monitoreados' },
    { n: '625', l: 'Socios en alerta alto/crítico' },
    { n: '300', l: 'Gestiones priorizadas / semana' },
    { n: '120', l: 'Cobranza preventiva / semana' },
  ],
  charts: {
    trendTitle: 'Morosidad histórica de cartera',
    trendSub: 'Serie mensual de referencia sobre cartera vigente',
    riskTitle: 'Distribución de riesgo',
    riskSub: 'Clasificación por nivel sobre socios activos',
  },
  alertsTitle: 'Casos prioritarios de cobranza',
  alertsSub: (cola) => `Priorización de cobranza · ${cola.toLocaleString('es-EC')} casos listos para gestión`,
  ctaAlerts: 'Ver cola de gestión',
  ctaPreventiva: 'Cobranza preventiva',
  ctaPerfil: 'Ver socio en alerta',
};

export const ALERTS_PAGE = {
  eyebrow: 'Gestión de cartera · Radar Mora',
  title: 'Priorización de cobranza',
  subtitle: (cola, universo) =>
    `${cola.toLocaleString('es-EC')} casos asignados al equipo esta semana · ${universo.toLocaleString('es-EC')} socios en monitoreo continuo`,
  kpis: ['Casos priorizados', 'Universo en alerta', 'Críticos señalados', 'Días de anticipación'],
};

export const PREVENTIVE_PAGE = {
  eyebrow: 'Cobranza preventiva · Cooperativa Tulcán',
  title: 'Intervenir antes del vencimiento',
  subtitle: 'Cuotas por vencer en segmentos de riesgo alto y crítico · capacidad de 120 gestiones semanales',
};

export const PROFILE = {
  eyebrow: 'Análisis de riesgo del socio',
  recPrefix: 'Recomendación gerencial',
};

export const NAV = {
  home: 'Centro de Riesgo',
  socios: 'Socios',
  alertas: 'Priorización',
  preventiva: 'Preventiva',
};

export const RECOMMENDATIONS_EXEC = {
  Bajo: { title: 'Relación estable', text: 'Comportamiento crediticio dentro de parámetros. Mantener seguimiento estándar y oportunidades comerciales.' },
  Medio: { title: 'Vigilancia preventiva', text: 'Señales leves de deterioro transaccional. Verificar situación del socio en los próximos 7 días.' },
  Alto: { title: 'Intervención prioritaria', text: 'Patrón de riesgo emergente. Agendar contacto y evaluar reestructuración antes del incumplimiento.' },
  Crítico: { title: 'Acción inmediata', text: 'Alta probabilidad de mora inminente. Escalar a comité y activar protocolo de cobranza preventiva hoy.' },
};
