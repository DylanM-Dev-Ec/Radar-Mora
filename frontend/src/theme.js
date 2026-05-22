/** Paleta oficial Cooperativa Tulcán (sitio web) + semántica Radar-Mora */
export const COOP = {
  verdePrimario: '#009640',
  verdeOscuro: '#006837',
  verdePie: '#004D28',
  acentoDorado: '#F29124',
  acentoDoradoHover: '#E08510',
  azulTexto: '#002B5B',
  fondoDashboard: '#F5F5F5',
  blancoTarjetas: '#FFFFFF',
  textoPrincipal: '#333333',
  textoSecundario: '#666666',
};

export const RISK_COLORS = {
  Bajo: '#28A745',
  Medio: '#FFC107',
  Alto: '#FD7E14',
  Crítico: '#DC3545',
};

export function scoreToColor(score) {
  if (score <= 30) return RISK_COLORS.Bajo;
  if (score <= 60) return RISK_COLORS.Medio;
  if (score <= 80) return RISK_COLORS.Alto;
  return RISK_COLORS.Crítico;
}

export function scoreToLevel(score) {
  if (score <= 30) return 'bajo';
  if (score <= 60) return 'medio';
  if (score <= 80) return 'alto';
  return 'critico';
}

/** Estilos compartidos Recharts — líneas más visibles */
export const CHART_GRID = {
  stroke: '#9eb5a8',
  strokeWidth: 1.2,
  strokeDasharray: '5 5',
};

export const CHART_AXIS = {
  tick: { fontSize: 11, fill: COOP.textoSecundario },
  axisLine: { stroke: COOP.verdeOscuro, strokeWidth: 2 },
  tickLine: { stroke: COOP.verdeOscuro, strokeWidth: 1.5 },
};

export const PIE_STYLE = {
  paddingAngle: 0,
  stroke: 'none',
  strokeWidth: 0,
};

export const BAR_STYLE = {
  stroke: 'none',
  strokeWidth: 0,
};
