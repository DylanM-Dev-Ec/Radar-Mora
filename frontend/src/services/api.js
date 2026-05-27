// api.js - Servicio de conexión con la API y motor de Mocks híbrido para Radar Mora
import {
  enrichMockSocio,
  buildMockTransactions,
  buildMockPayments,
  buildMockBalanceHistory,
} from './mockSocioPresentation';

const REAL_API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? '/api' : 'http://localhost:8000/api');

/** Modo presentación: datos optimizados para diapositivas y video (sin banner “demo”). */
export const PRESENTATION_MODE = import.meta.env.VITE_PRESENTATION_MODE === 'true';

/** true solo si el healthcheck falló (backend caído, red o timeout). */
let demoMode = PRESENTATION_MODE;

export function isPresentationMode() {
  return PRESENTATION_MODE;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isDemoMode() {
  return demoMode;
}

function isInfrastructureFailure(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  if (err instanceof TypeError) return true;
  return false;
}

/** Cola semanal operativa (casos asignados al equipo). */
export function getColaSemanal(data) {
  if (!data) return 0;
  if (!Array.isArray(data) && data.cola_semanal_operativa != null) {
    return data.cola_semanal_operativa;
  }
  return data?.total_active ?? 0;
}

/** Socios alto+crítico en radar (universo monitoreado). */
export function getUniversoRiesgo(data) {
  if (!data) return 0;
  if (!Array.isArray(data) && data.universo_riesgo_total != null) {
    return data.universo_riesgo_total;
  }
  const tc = data?.total_counts;
  if (tc) return (tc.critica || 0) + (tc.alta || 0);
  return data?.total_active ?? 0;
}

export function getDisplayedCount(data) {
  if (!data) return 0;
  if (!Array.isArray(data) && data.displayed_count != null) {
    return data.displayed_count;
  }
  const list = Array.isArray(data) ? data : (data?.alerts || []);
  return list.length;
}

/** Badge Alertas: cola semanal, no el universo completo. */
export function getAlertsTotal(data) {
  return getColaSemanal(data);
}

export function getPreventiveItems(data) {
  if (!data) return [];
  return Array.isArray(data) ? data : (data.items || []);
}

export function getPreventiveTotal(data) {
  if (!data) return 0;
  if (!Array.isArray(data)) {
    if (data.total_active != null) return data.total_active;
    if (data.pagination?.total != null) return data.pagination.total;
  }
  return getPreventiveItems(data).length;
}

function buildPreventiveQuery(params = {}) {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.offset != null) qs.set('offset', String(params.offset));
  if (params.search) qs.set('search', params.search);
  if (params.risk_level) qs.set('risk_level', params.risk_level);
  if (params.gestion) qs.set('gestion', params.gestion);
  if (params.agencia) qs.set('agencia', params.agencia);
  const q = qs.toString();
  return q ? `?${q}` : '';
}

function paginateMockPreventive(allItems, params = {}) {
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 50);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const search = (params.search || '').trim().toLowerCase();
  const risk = params.risk_level || '';
  const ag = params.agencia || '';
  const gestion = params.gestion || '';

  let filtered = allItems;
  if (risk) filtered = filtered.filter((i) => i.risk_level === risk);
  if (ag) filtered = filtered.filter((i) => i.socio_agencia === ag);
  if (gestion === 'sin_gestionar') {
    filtered = filtered.filter((i) => !i.accion_preventiva || i.accion_preventiva === 'Ninguna');
  } else if (gestion === 'gestionados') {
    filtered = filtered.filter((i) => i.accion_preventiva && i.accion_preventiva !== 'Ninguna');
  } else if (gestion) {
    filtered = filtered.filter((i) => i.accion_preventiva === gestion);
  }
  if (search) {
    filtered = filtered.filter((i) => {
      const blob = `${i.socio_nombre || ''} ${i.socio_cedula || ''} ${i.socio_agencia || ''}`.toLowerCase();
      return blob.includes(search);
    });
  }

  filtered = [...filtered].sort((a, b) => {
    const da = a.dias_para_vencer ?? 999;
    const db = b.dias_para_vencer ?? 999;
    if (da !== db) return da - db;
    if (a.risk_level !== b.risk_level) {
      return (a.risk_level === 'Crítico' ? 0 : 1) - (b.risk_level === 'Crítico' ? 0 : 1);
    }
    return (b.risk_score || 0) - (a.risk_score || 0);
  });
  const pageItems = filtered.slice(offset, offset + limit);
  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit) || 1);
  const pending = filtered.filter((i) => !i.accion_preventiva || i.accion_preventiva === 'Ninguna').length;
  const volume = filtered.reduce((s, i) => s + (i.monto_esperado || 0), 0);
  const agencies = [...new Set(allItems.map((i) => i.socio_agencia).filter(Boolean))].sort();

  return {
    items: pageItems,
    pagination: {
      limit,
      offset,
      total: totalFiltered,
      page: Math.floor(offset / limit) + 1,
      total_pages: totalPages,
      has_next: offset + limit < totalFiltered,
      has_prev: offset > 0,
    },
    total_active: allItems.length,
    filtered_total: totalFiltered,
    displayed_count: pageItems.length,
    total_pending_gestion: pending,
    total_managed: totalFiltered - pending,
    total_volume: volume,
    socios_riesgo_alto: filtered.filter((i) => i.risk_level === 'Alto').length,
    socios_riesgo_critico: filtered.filter((i) => i.risk_level === 'Crítico').length,
    universo_riesgo_total: MOCK_DB.overview.universo_riesgo_total,
    cola_semanal_operativa: MOCK_DB.overview.cola_semanal_operativa,
    capacidad_preventiva: 120,
    ventana_inicio: '2026-05-24',
    ventana_fin: '2026-06-05',
    fecha_corte: '2026-05-21',
    agencies,
  };
}

// Base de datos de gestiones persistida localmente (incluso para Mocks)
const getPersistedActions = () => {
  try {
    return JSON.parse(localStorage.getItem('radar_mora_actions') || '{}');
  } catch {
    return {};
  }
};

const savePersistedAction = (pagoId, action) => {
  const actions = getPersistedActions();
  actions[pagoId] = action;
  localStorage.setItem('radar_mora_actions', JSON.stringify(actions));
};

// --- MOTOR DE MOCK DATA DE ALTA FIDELIDAD ---
const MOCK_DB = {
  overview: {
    total_socios: 29821,
    socios_activos: 29821,
    total_socios_registrados: 32370,
    pct_socios_activos: 92.1,
    creditos_vigentes: 32088,
    total_creditos: 32088,
    cartera_total: 408621430.2,
    tasa_morosidad: 16.8,
    tasa_morosidad_anterior: 21.4,
    reduccion_mora_pp: 4.6,
    precision_modelo_pct: 94.2,
    casos_interceptados_90d: 847,
    ahorro_cartera_usd: 2140000,
    dias_anticipacion_promedio: 12,
    cobertura_preventiva_pct: 78,
    socios_riesgo_alto: 543,
    socios_riesgo_critico: 82,
    universo_riesgo_total: 625,
    casos_gestion_semana: 300,
    cola_semanal_operativa: 300,
    socios_monitoreo_ml: 6014,
    max_casos_semana: 300,
    monto_en_riesgo: 4280000,
    socios_criticos_anticipados: 82,
    patrones_anomalos_activos: 156,
    gestiones_efectivas_semana: 287,
    tasa_recuperacion_preventiva_pct: 73.4,
    monto_recuperado_preventivo_usd: 186400,
    cobertura_agencias: 16,
    alertas_tiempo_real: 625,
    contactos_preventivos_mes: 312,
    transacciones_perfiladas: 29821,
  },
  riskDistribution: [
    { nivel: "Bajo", cantidad: 15218, porcentaje: 51.0, color: "#28A745" },
    { nivel: "Medio", cantidad: 13978, porcentaje: 46.9, color: "#FFC107" },
    { nivel: "Alto", cantidad: 543, porcentaje: 1.8, color: "#F29124" },
    { nivel: "Crítico", cantidad: 82, porcentaje: 0.3, color: "#DC3545" }
  ],
  trend: [
    { mes: "2025-06", tasa_morosidad: 18.20, nuevos_morosos: 128 },
    { mes: "2025-07", tasa_morosidad: 19.40, nuevos_morosos: 108 },
    { mes: "2025-08", tasa_morosidad: 18.50, nuevos_morosos: 141 },
    { mes: "2025-09", tasa_morosidad: 20.10, nuevos_morosos: 156 },
    { mes: "2025-10", tasa_morosidad: 19.00, nuevos_morosos: 149 },
    { mes: "2025-11", tasa_morosidad: 21.40, nuevos_morosos: 178 },
    { mes: "2025-12", tasa_morosidad: 20.50, nuevos_morosos: 162 },
    { mes: "2026-01", tasa_morosidad: 22.00, nuevos_morosos: 147 },
    { mes: "2026-02", tasa_morosidad: 20.20, nuevos_morosos: 131 },
    { mes: "2026-03", tasa_morosidad: 21.70, nuevos_morosos: 125 },
    { mes: "2026-04", tasa_morosidad: 19.50, nuevos_morosos: 110 },
    { mes: "2026-05", tasa_morosidad: 17.10, nuevos_morosos: 95 }
  ],
  riskByAgency: [
    { agencia: "Ambato", total: 1240, bajo: 620, medio: 350, alto: 210, critico: 60 },
    { agencia: "Cayambe", total: 850, bajo: 420, medio: 250, alto: 130, critico: 50 },
    { agencia: "El Ángel", total: 920, bajo: 460, medio: 270, alto: 140, critico: 50 },
    { agencia: "Guaranda", total: 600, bajo: 300, medio: 180, alto: 90, critico: 30 },
    { agencia: "Huaca", total: 780, bajo: 390, medio: 220, alto: 120, critico: 50 },
    { agencia: "Ibarra", total: 2100, bajo: 1050, medio: 600, alto: 320, critico: 130 },
    { agencia: "Julio Andrade", total: 1400, bajo: 700, medio: 400, alto: 210, critico: 90 },
    { agencia: "Latacunga", total: 950, bajo: 470, medio: 280, alto: 150, critico: 50 },
    { agencia: "Otavalo", total: 1100, bajo: 550, medio: 320, alto: 170, critico: 60 },
    { agencia: "Quito", total: 2800, bajo: 1400, medio: 810, alto: 430, critico: 160 },
    { agencia: "Quito Norte", total: 1500, bajo: 750, medio: 430, alto: 230, critico: 90 },
    { agencia: "Quito Sur", total: 1800, bajo: 900, medio: 520, alto: 280, critico: 100 },
    { agencia: "Riobamba", total: 1200, bajo: 600, medio: 350, alto: 180, critico: 70 },
    { agencia: "San Gabriel", total: 1650, bajo: 820, medio: 480, alto: 250, critico: 100 },
    { agencia: "Sangolquí", total: 1300, bajo: 650, medio: 370, alto: 200, critico: 80 },
    { agencia: "Tulcán (Matriz)", total: 7919, bajo: 3959, medio: 2289, alto: 1219, critico: 452 }
  ],
  extendedStats: {
    mora_por_tipo: [
      { tipo_cartera: "Consumo", total_ops: 18500, total_monto: 245000000.0, mora_ops: 3200, mora_monto: 38200000.0, tasa_mora_ops: 17.3, tasa_mora_monto: 15.59 },
      { tipo_cartera: "Consumo Reestructurado", total_ops: 4200, total_monto: 68000000.0, mora_ops: 1850, mora_monto: 28900000.0, tasa_mora_ops: 44.05, tasa_mora_monto: 42.5 },
      { tipo_cartera: "Microcredito Liquidacion", total_ops: 9388, total_monto: 95621430.2, mora_ops: 1823, mora_monto: 13332104.5, tasa_mora_ops: 19.42, tasa_mora_monto: 13.94 }
    ],
    mora_por_actividad: [
      { actividad: "Producción De Leche Cruda De Vaca", total_ops: 1936, total_monto: 27800000.0, mora_ops: 291, mora_monto: 3600000.0, tasa_mora_monto: 13.01 },
      { actividad: "Todas Las Actividades De Transporte De Carga", total_ops: 1290, total_monto: 20500000.0, mora_ops: 244, mora_monto: 3800000.0, tasa_mora_monto: 18.72 },
      { actividad: "Cultivo De Papa", total_ops: 1171, total_monto: 12200000.0, mora_ops: 161, mora_monto: 1350000.0, tasa_mora_monto: 11.08 },
      { actividad: "Servicios De Taxis", total_ops: 947, total_monto: 11800000.0, mora_ops: 227, mora_monto: 2450000.0, tasa_mora_monto: 20.80 },
      { actividad: "Transporte Terrestre De Pasajeros", total_ops: 694, total_monto: 1100000.0, mora_ops: 213, mora_monto: 288000.0, tasa_mora_monto: 26.21 }
    ],
    por_genero: [
      { genero: "Femenino", total_ops: 14737, total_monto: 181400000.0, mora_ops: 3006, tasa_mora_monto: 17.15 },
      { genero: "Masculino", total_ops: 17351, total_monto: 227200000.0, mora_ops: 3874, tasa_mora_monto: 18.39 }
    ],
    mora_por_rango_monto: [
      { rango: "0 - 5K", total_ops: 14500, total_monto: 45000000.0, mora_ops: 2900, tasa_mora_monto: 17.2 },
      { rango: "5K - 10K", total_ops: 9200, total_monto: 72000000.0, mora_ops: 1800, tasa_mora_monto: 21.4 },
      { rango: "10K - 25K", total_ops: 6100, total_monto: 112000000.0, mora_ops: 1350, tasa_mora_monto: 19.6 },
      { rango: "25K+", total_ops: 2288, total_monto: 179621430.2, mora_ops: 829, tasa_mora_monto: 25.1 }
    ],
    mora_por_zona: [
      { zona: "Carchi", total_ops: 12850, total_monto: 165000000.0, mora_ops: 2650, mora_monto: 31000000.0, tasa_mora_monto: 18.79 },
      { zona: "Pichincha", total_ops: 8100, total_monto: 110000000.0, mora_ops: 1800, mora_monto: 21500000.0, tasa_mora_monto: 19.55 },
      { zona: "Imbabura", total_ops: 5850, total_monto: 75000000.0, mora_ops: 1250, mora_monto: 14800000.0, tasa_mora_monto: 19.73 },
      { zona: "Sierra Centro", total_ops: 5288, total_monto: 58621430.2, mora_ops: 1178, mora_monto: 13132104.5, tasa_mora_monto: 22.40 }
    ],
    mora_por_estado_civil: [
      { estado_civil: "Soltero/a", total_ops: 11200, mora_ops: 2100, total_monto: 125000000.0, mora_monto: 21500000.0, tasa_mora_ops: 18.75, tasa_mora_monto: 17.2 },
      { estado_civil: "Casado/a", total_ops: 15400, mora_ops: 3150, total_monto: 210000000.0, mora_monto: 39500000.0, tasa_mora_ops: 20.45, tasa_mora_monto: 18.81 },
      { estado_civil: "Divorciado/a", total_ops: 2800, mora_ops: 950, total_monto: 42000000.0, mora_monto: 11800000.0, tasa_mora_ops: 33.93, tasa_mora_monto: 28.1 },
      { estado_civil: "Unión de Hecho", total_ops: 1800, mora_ops: 510, total_monto: 24000000.0, mora_monto: 5800000.0, tasa_mora_ops: 28.33, tasa_mora_monto: 24.17 },
      { estado_civil: "Viudo/a", total_ops: 888, mora_ops: 178, total_monto: 7621430.2, mora_monto: 1832104.5, tasa_mora_ops: 20.04, tasa_mora_monto: 24.04 }
    ],
    mora_por_cargas: [
      { cargas: "0 Cargas", total_ops: 12400, mora_ops: 2150, total_monto: 145000000.0, mora_monto: 24200000.0, tasa_mora_ops: 17.34, tasa_mora_monto: 16.69 },
      { cargas: "1 Carga", total_ops: 7800, mora_ops: 1510, total_monto: 98000000.0, mora_monto: 17800000.0, tasa_mora_ops: 19.36, tasa_mora_monto: 18.16 },
      { cargas: "2 Cargas", total_ops: 6100, mora_ops: 1390, total_monto: 82000000.0, mora_monto: 16900000.0, tasa_mora_ops: 22.79, tasa_mora_monto: 20.61 },
      { cargas: "3 Cargas", total_ops: 3900, mora_ops: 1100, total_monto: 54000000.0, mora_monto: 13100000.0, tasa_mora_ops: 28.21, tasa_mora_monto: 24.26 },
      { cargas: "4+ Cargas", total_ops: 1888, mora_ops: 738, total_monto: 29621430.2, mora_monto: 8432104.5, tasa_mora_ops: 39.09, tasa_mora_monto: 28.47 }
    ],
    mora_por_edad: [
      { rango_edad: "Jóvenes (<25)", total_ops: 2850, mora_ops: 820, total_monto: 26000000.0, mora_monto: 6900000.0, tasa_mora_ops: 28.77, tasa_mora_monto: 26.54 },
      { rango_edad: "Adultos Jóvenes (25-39)", total_ops: 11400, mora_ops: 2310, total_monto: 154000000.0, mora_monto: 28500000.0, tasa_mora_ops: 20.26, tasa_mora_monto: 18.51 },
      { rango_edad: "Adultos (40-59)", total_ops: 12100, mora_ops: 2590, total_monto: 168000000.0, mora_monto: 31200000.0, tasa_mora_ops: 21.40, tasa_mora_monto: 18.57 },
      { rango_edad: "Adultos Mayores (60+)", total_ops: 5738, mora_ops: 1168, total_monto: 60621430.2, mora_monto: 13832104.5, tasa_mora_ops: 20.36, tasa_mora_monto: 22.82 }
    ],
    mora_por_educacion: [
      { nivel_educativo: "Ninguno", total_ops: 950, mora_ops: 290, total_monto: 8500000.0, mora_monto: 2400000.0, tasa_mora_ops: 30.53, tasa_mora_monto: 28.24 },
      { nivel_educativo: "Primaria", total_ops: 12400, mora_ops: 2850, total_monto: 145000000.0, mora_monto: 31500000.0, tasa_mora_ops: 22.98, tasa_mora_monto: 21.72 },
      { nivel_educativo: "Secundaria", total_ops: 9800, mora_ops: 2100, total_monto: 128000000.0, mora_monto: 24100000.0, tasa_mora_ops: 21.43, tasa_mora_monto: 18.83 },
      { nivel_educativo: "Tecnólogo", total_ops: 2900, mora_ops: 510, total_monto: 38000000.0, mora_monto: 6800000.0, tasa_mora_ops: 17.59, tasa_mora_monto: 17.89 },
      { nivel_educativo: "Universitaria", total_ops: 4200, mora_ops: 980, total_monto: 71000000.0, mora_monto: 12500000.0, tasa_mora_ops: 23.33, tasa_mora_monto: 17.61 },
      { nivel_educativo: "Postgrado", total_ops: 1771, mora_ops: 158, total_monto: 18121430.2, mora_monto: 3132104.5, tasa_mora_ops: 8.92, tasa_mora_monto: 17.28 }
    ],
    mora_por_vivienda: [
      { tipo_vivienda: "Propia", total_ops: 18400, mora_ops: 3200, total_monto: 235000000.0, mora_monto: 38900000.0, tasa_mora_ops: 17.39, tasa_mora_monto: 16.55 },
      { tipo_vivienda: "Rentada", total_ops: 6800, mora_ops: 1950, total_monto: 84000000.0, mora_monto: 21500000.0, tasa_mora_ops: 28.68, tasa_mora_monto: 25.60 },
      { tipo_vivienda: "Familiar", total_ops: 4500, mora_ops: 1100, total_monto: 56000000.0, mora_monto: 12400000.0, tasa_mora_ops: 24.44, tasa_mora_monto: 22.14 },
      { tipo_vivienda: "Prestada", total_ops: 1500, mora_ops: 510, total_monto: 24000000.0, mora_monto: 6100000.0, tasa_mora_ops: 34.00, tasa_mora_monto: 25.42 },
      { tipo_vivienda: "Anticresis", total_ops: 621, mora_ops: 128, total_monto: 9621430.2, mora_monto: 1532104.5, tasa_mora_ops: 20.61, tasa_mora_monto: 15.92 }
    ],
    mora_por_destino: [
      { destino: "Consumo", total_ops: 16500, mora_ops: 2850, total_monto: 215000000.0, mora_monto: 32400000.0, tasa_mora_ops: 17.27, tasa_mora_monto: 15.07 },
      { destino: "Capital de Trabajo", total_ops: 8200, mora_ops: 1950, total_monto: 98000000.0, mora_monto: 19800000.0, tasa_mora_ops: 23.78, tasa_mora_monto: 20.20 },
      { destino: "Vivienda", total_ops: 3400, mora_ops: 920, total_monto: 54000000.0, mora_monto: 12400000.0, tasa_mora_ops: 27.06, tasa_mora_monto: 22.96 },
      { destino: "Vehículos", total_ops: 2200, mora_ops: 580, total_monto: 24000000.0, mora_monto: 7100000.0, tasa_mora_ops: 26.36, tasa_mora_monto: 29.58 },
      { destino: "Educación", total_ops: 1521, mora_ops: 588, total_monto: 17621430.2, mora_monto: 8732104.5, tasa_mora_ops: 38.66, tasa_mora_monto: 49.55 }
    ],
    mora_por_cuotas: [
      { rango_cuotas: "1-12 cuotas (<= 1 Año)", total_ops: 8200, mora_ops: 1150, total_monto: 65000000.0, mora_monto: 9800000.0, tasa_mora_ops: 14.02, tasa_mora_monto: 15.08 },
      { rango_cuotas: "13-36 cuotas (1-3 Años)", total_ops: 14100, mora_ops: 2950, total_monto: 185000000.0, mora_monto: 34200000.0, tasa_mora_ops: 20.92, tasa_mora_monto: 18.49 },
      { rango_cuotas: "37-60 cuotas (3-5 Años)", total_ops: 7300, mora_ops: 1950, total_monto: 112000000.0, mora_monto: 23100000.0, tasa_mora_ops: 26.71, tasa_mora_monto: 20.63 },
      { rango_cuotas: "61+ cuotas (> 5 Años)", total_ops: 2221, mora_ops: 838, total_monto: 46621430.2, mora_monto: 13332104.5, tasa_mora_ops: 37.73, tasa_mora_monto: 28.59 }
    ]
  }
};

const CINEMATIC_ALERT_MSG = {
  '710282': 'Socio crítico detectado antes de incumplimiento: retiros de ahorro y deterioro de flujo en 14 días.',
  '906037': 'Patrones transaccionales anómalos: caída del 62% en movimientos vs. su segmento.',
  '1976701': 'Capacidad de pago al límite antes del cierre de mes · señal de alerta temprana.',
  '1994670': 'Consumo reestructurado con señales de mora emergente · caso prioritario de cobranza.',
  '494647': 'Vigilancia reforzada: antigüedad favorable con atraso puntual en cuota vigente.',
  '554224': 'Perfil estable con micro-alertas: ingresos por nómina sostienen la relación.',
  '1476509': 'Monitoreo preventivo: socia de larga data con concentración en línea consumo.',
  '1380560': 'Riesgo estacional en sector lácteo: ingresos variables en ventana de cosecha.',
};

const MOCK_SOCIOS = [
  { id: "710282", info: { cedula: "0401710282", nombre: "LUIS HUMBERTO CORAL BENAVIDES", edad: 45, ocupacion: "Agricultor / Cultivador de Papa", agencia: "Agencia Tulcán (Matriz)", fecha_ingreso: "2015-04-12", telefono: "0987654321", email: "l.coral@email.com", antiguedad: "11 años" }, risk: { score: 92.4, level: "Crítico", factors: [{ name: "dias_mora", description: "Días de mora: 87 día(s) de atraso en cuotas", value: 87, importance: 0.45, impact: "negativo" }, { name: "cuotas_atrasadas", description: "8 cuota(s) con estado atrasado", value: 8, importance: 0.22, impact: "negativo" }, { name: "credito_en_mora", description: "Al menos un crédito en estado Mora", value: 1, importance: 0.20, impact: "negativo" }] }, creditos: [{ id: 10452, tipo: "Consumo Reestructurado", monto: 18500, plazo: 36, cuota: 620, estado: "Mora", progreso: 45 }], resumen: { dias_mora: 87, cuotas_atrasadas: 8, en_mora: true } },
  { id: "906037", info: { cedula: "1002906037", nombre: "MARIA ELENA CADENA PORTILLA", edad: 38, ocupacion: "Comerciante minorista", agencia: "Agencia Otavalo", fecha_ingreso: "2018-09-05", telefono: "0991234567", email: "m.cadena@email.com", antiguedad: "7 años" }, risk: { score: 85.9, level: "Crítico", factors: [{ name: "alerta_caida_actividad", description: "Caída severa de transacciones en cuenta", value: 1, importance: 0.32, impact: "negativo" }, { name: "ratio_ingreso_egreso", description: "Ingresos cubren con lo justo la cuota del mes", value: 1.05, importance: 0.26, impact: "negativo" }] }, creditos: [{ id: 11029, tipo: "Microcrédito", monto: 8500, plazo: 24, cuota: 410, estado: "Mora", progreso: 60 }], resumen: { dias_mora: 52.0 } },
  { id: "494647", info: { cedula: "0401494647", nombre: "EDGAR MAURICIO ORTEGA DELGADO", edad: 52, ocupacion: "Transportista de carga pesada", agencia: "Agencia Ibarra", fecha_ingreso: "2010-06-20", telefono: "0981112222", email: "e.ortega@email.com", antiguedad: "15 años" }, risk: { score: 42.0, level: "Medio", factors: [{ name: "antiguedad_socio", description: "Alta antigüedad como socio en la cooperativa", value: 15, importance: 0.30, impact: "positivo" }, { name: "nro_creditos", description: "Tiene 2 créditos vigentes al día", value: 2, importance: 0.15, impact: "positivo" }] }, creditos: [{ id: 8945, tipo: "Consumo", monto: 25000, plazo: 60, cuota: 580, estado: "Vigente", progreso: 80 }], resumen: { dias_mora: 92.0 } },
  { id: "554224", info: { cedula: "1002554224", nombre: "JUAN CARLOS BENAVIDES ERAZO", edad: 31, ocupacion: "Docente de Primaria", agencia: "Agencia Quito Norte", fecha_ingreso: "2020-02-14", telefono: "0993334444", email: "j.benavides@email.com", antiguedad: "6 años" }, risk: { score: 39.7, level: "Medio", factors: [{ name: "estabilidad_laboral", description: "Excelente historial de ingresos por nómina pública", value: "Estable", importance: 0.28, impact: "positivo" }] }, creditos: [{ id: 12054, tipo: "Consumo", monto: 12000, plazo: 48, cuota: 320, estado: "Vigente", progreso: 30 }], resumen: { dias_mora: 94.0 } },
  { id: "1476509", info: { cedula: "0401476509", nombre: "CARMEN YOLANDA MORILLO REVELO", edad: 61, ocupacion: "Jubilada", agencia: "Agencia Tulcán (Matriz)", fecha_ingreso: "2005-11-30", telefono: "0985556666", email: "c.morillo@email.com", antiguedad: "20 años" }, risk: { score: 39.6, level: "Medio", factors: [{ name: "antiguedad_socio", description: "Socia fundadora con excelente récord histórico", value: 20, importance: 0.40, impact: "positivo" }] }, creditos: [{ id: 7452, tipo: "Consumo", monto: 5000, plazo: 12, cuota: 450, estado: "Vigente", progreso: 95 }], resumen: { dias_mora: 99.0 } },
  { id: "1380560", info: { cedula: "1709380560", nombre: "SEGUNDO ANASTACIO GUERRERO CHAMORRO", edad: 48, ocupacion: "Productor de Leche Cruda", agencia: "Agencia San Gabriel", fecha_ingreso: "2012-03-25", telefono: "0997778888", email: "s.guerrero@email.com", antiguedad: "14 años" }, risk: { score: 39.4, level: "Medio", factors: [{ name: "volumen_total", description: "Alto flujo de depósitos mensuales por ventas", value: 3450.00, importance: 0.35, impact: "positivo" }] }, creditos: [{ id: 9856, tipo: "Microcrédito", monto: 15000, plazo: 36, cuota: 530, estado: "Vigente", progreso: 70 }], resumen: { dias_mora: 95.0 } },
  { id: "1976701", info: { cedula: "0401976701", nombre: "JAIME EDUARDO POZO GUERRERO", edad: 41, ocupacion: "Comerciante de Papas", agencia: "Agencia Tulcán (Matriz)", fecha_ingreso: "2016-08-18", telefono: "0982223333", email: "j.pozo@email.com", antiguedad: "9 años" }, risk: { score: 78.5, level: "Alto", factors: [] }, creditos: [{ id: 10123, tipo: "Consumo", monto: 10000, plazo: 24, cuota: 480, estado: "Vigente", progreso: 50 }], resumen: { dias_mora: 78.0 } },
  { id: "1994670", info: { cedula: "1709994670", nombre: "ANA MARIA DELGADO ERAZO", edad: 35, ocupacion: "Floricultora", agencia: "Agencia Cayambe", fecha_ingreso: "2019-07-22", telefono: "0998889999", email: "a.delgado@email.com", antiguedad: "6 años" }, risk: { score: 82.1, level: "Crítico", factors: [] }, creditos: [{ id: 11234, tipo: "Consumo Reestructurado", monto: 15000, plazo: 36, cuota: 510, estado: "Mora", progreso: 40 }], resumen: { dias_mora: 48.0 } }
];

// Generar una lista grande de cuotas pendientes para simular las 571 del tablero preventivo
const generateMockCuotas = () => {
  const actions = getPersistedActions();
  const baseCuotas = [
    { id: "pago_1976701", socio_id: "1976701", nombre: "JAIME EDUARDO POZO GUERRERO", cedula: "0401976701", agencia: "Agencia Tulcán (Matriz)", monto_cuota: 480.00, dias_atraso: 12, risk_level: "Alto", num_cuota: 3 },
    { id: "pago_1994670", socio_id: "1994670", nombre: "ANA MARIA DELGADO ERAZO", cedula: "1709994670", agencia: "Agencia Cayambe", monto_cuota: 510.00, dias_atraso: 35, risk_level: "Crítico", num_cuota: 5 },
    { id: "pago_710282", socio_id: "710282", nombre: "LUIS HUMBERTO CORAL BENAVIDES", cedula: "0401710282", agencia: "Agencia Tulcán (Matriz)", monto_cuota: 620.00, dias_atraso: 87, risk_level: "Crítico", num_cuota: 8 },
    { id: "pago_906037", socio_id: "906037", nombre: "MARIA ELENA CADENA PORTILLA", cedula: "1002906037", agencia: "Agencia Otavalo", monto_cuota: 410.00, dias_atraso: 95, risk_level: "Crítico", num_cuota: 1 },
    { id: "pago_494647", socio_id: "494647", nombre: "EDGAR MAURICIO ORTEGA DELGADO", cedula: "0401494647", agencia: "Agencia Ibarra", monto_cuota: 580.00, dias_atraso: 72, risk_level: "Medio", num_cuota: 37 }
  ];

  // Rellenar hasta 571 registros
  const fullCuotas = [...baseCuotas];
  const agencias = ["Agencia Ibarra", "Agencia Quito", "Agencia Tulcán (Matriz)", "Agencia Cayambe", "Agencia Otavalo", "Agencia San Gabriel"];
  const nombres = [
    "ROSA ELVIRA CÓRDOVA CUASPA", "CARLOS ALBERTO BENAVIDES MORA", "MARIANA DE JESÚS POZO ORTEGA",
    "JOSÉ FRANCISCO GUERRERO DELGADO", "MARÍA ESTHER CADENA PINEDA", "LUIS ALFONSO MORILLO ORTEGA",
    "HUGO ROLANDO CHAMORRO BENAVIDES", "BLANCA YOLANDA POZO MORILLO", "RICARDO ARTURO ORTEGA POZO"
  ];

  for (let i = 5; i < 571; i++) {
    const id = 100000 + i;
    const socio_id = String(500000 + i);
    const nombre = nombres[i % nombres.length];
    const cedula = "040" + String(100000 + i);
    const agencia = agencias[i % agencias.length];
    const risk_level = i % 10 === 0 ? "Crítico" : (i % 6 === 0 ? "Alto" : "Medio");
    
    fullCuotas.push({
      id: `pago_${id}`,
      socio_id,
      nombre,
      cedula,
      agencia,
      monto_cuota: Math.round(150 + (i % 5) * 85),
      dias_atraso: 2 + (i % 98),
      risk_level,
      num_cuota: 1 + (i % 12)
    });
  }

  return fullCuotas.map(c => ({
    ...c,
    accion_preventiva: actions[c.id] || "Ninguna"
  }));
};

/** Mock del tablero preventivo: solo Alto/Crítico con cuota pendiente en ventana 15 días */
const MOCK_PREVENTIVE_BASE = (() => {
  const ventana = ['2026-05-24', '2026-05-25', '2026-05-26', '2026-05-27', '2026-05-28'];
  const corte = '2026-05-21';
  const base = [
    { pago_id: 101, socio_id: '1976701', socio_nombre: 'JAIME EDUARDO POZO GUERRERO', socio_cedula: '0401976701', socio_telefono: '0982223333', socio_email: 'j.pozo@email.com', socio_agencia: 'Agencia Tulcán (Matriz)', monto_esperado: 480, num_cuota: 4, fecha_esperada: ventana[0], risk_level: 'Alto', risk_score: 78.5 },
    { pago_id: 102, socio_id: '1994670', socio_nombre: 'ANA MARIA DELGADO ERAZO', socio_cedula: '1709994670', socio_telefono: '0998889999', socio_email: 'a.delgado@email.com', socio_agencia: 'Agencia Cayambe', monto_esperado: 510, num_cuota: 6, fecha_esperada: ventana[1], risk_level: 'Crítico', risk_score: 82.1 },
    { pago_id: 103, socio_id: '710282', socio_nombre: 'LUIS HUMBERTO CORAL BENAVIDES', socio_cedula: '0401710282', socio_telefono: '0987654321', socio_email: 'l.coral@email.com', socio_agencia: 'Agencia Tulcán (Matriz)', monto_esperado: 620, num_cuota: 9, fecha_esperada: ventana[2], risk_level: 'Crítico', risk_score: 91 },
    { pago_id: 104, socio_id: '906037', socio_nombre: 'MARIA ELENA CADENA PORTILLA', socio_cedula: '1002906037', socio_telefono: '0991112222', socio_email: 'm.cadena@email.com', socio_agencia: 'Agencia Otavalo', monto_esperado: 410, num_cuota: 2, fecha_esperada: ventana[3], risk_level: 'Crítico', risk_score: 88 },
  ];
  const items = [];
  for (let i = 0; i < 62; i += 1) {
    const b = base[i % base.length];
    const fecha_esperada = ventana[i % ventana.length];
    const dias_para_vencer = Math.round(
      (new Date(fecha_esperada) - new Date(corte)) / 86400000,
    );
    items.push({
      ...b,
      pago_id: 1000 + i,
      socio_id: `${b.socio_id}-${i}`,
      socio_cedula: `${b.socio_cedula}${String(i).padStart(2, '0')}`,
      fecha_esperada,
      dias_para_vencer,
      monto_esperado: b.monto_esperado + (i % 5) * 10,
      pago_estado: 'Pendiente',
      dias_atraso: 0,
      accion_preventiva: 'Ninguna',
      tipo_gestion: 'Cuota por vencer (preventiva)',
      credito_monto: 10000,
      credito_tipo: 'Consumo',
    });
  }
  return items;
})();

const generateMockPreventiveItems = () => {
  const actions = getPersistedActions();
  return MOCK_PREVENTIVE_BASE.map((item) => ({
    ...item,
    accion_preventiva: actions[item.pago_id] || item.accion_preventiva || 'Ninguna',
  }));
};

// --- Cliente API: mocks globales solo en demoMode (healthcheck fallido) ---
async function fetchJSON(url, timeoutMs = 8000) {
  if (demoMode || PRESENTATION_MODE) {
    return resolveMock(url);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new ApiError(`API error: ${res.status}`, res.status);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (isInfrastructureFailure(err)) {
      console.warn(`[Radar-Mora API] Fallo de red/timeout en ${url}`, err);
      throw err;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Enrutador interno para responder peticiones en Mock Mode
function parseUrlQuery(url) {
  const q = url.includes('?') ? url.split('?')[1] : '';
  const params = {};
  new URLSearchParams(q).forEach((v, k) => { params[k] = v; });
  return params;
}

function resolveMock(url) {
  const raw = url.replace(REAL_API_BASE, '');
  const path = raw.split('?')[0];
  const query = parseUrlQuery(url);
  
  if (path === '/dashboard/overview') {
    const base = { ...MOCK_DB.overview };
    if (!PRESENTATION_MODE) {
      const cuotas = generateMockCuotas();
      const contactados = cuotas.filter((c) => c.accion_preventiva !== 'Ninguna' && c.accion_preventiva !== 'sin_gestionar').length;
      base.tasa_morosidad = parseFloat((21.4 - contactados * 0.005).toFixed(2));
    }
    return Promise.resolve(base);
  }
  if (path === '/dashboard/risk-distribution') {
    return Promise.resolve(MOCK_DB.riskDistribution);
  }
  if (path === '/dashboard/trend') {
    return Promise.resolve(MOCK_DB.trend);
  }
  if (path === '/dashboard/risk-by-agency') {
    return Promise.resolve(MOCK_DB.riskByAgency);
  }
  if (path === '/dashboard/extended-stats') {
    return Promise.resolve(MOCK_DB.extendedStats);
  }
  if (path === '/alerts') {
    const { socios_riesgo_alto, socios_riesgo_critico, universo_riesgo_total, cola_semanal_operativa } = MOCK_DB.overview;
    const mockAlerts = MOCK_SOCIOS.map((s, i) => ({
        id: i + 1,
        socio_id: s.id,
        socio_nombre: s.info.nombre,
        tipo: 'Riesgo preventivo',
        mensaje: CINEMATIC_ALERT_MSG[s.id] || `Nivel ${s.risk.level}: comportamiento transaccional fuera de banda de cartera.`,
        fecha: '2026-05-21',
        risk_score: s.risk.score,
        risk_level: s.risk.level,
        prioridad: s.risk.level === 'Crítico' ? 'critica' : (s.risk.level === 'Alto' ? 'alta' : 'media'),
        dias_anticipacion: s.risk.level === 'Crítico' ? 14 : (s.risk.level === 'Alto' ? 10 : 7),
        agencia: s.info.agencia,
      }));
    const counts = {
      critica: mockAlerts.filter((a) => a.prioridad === 'critica').length,
      alta: mockAlerts.filter((a) => a.prioridad === 'alta').length,
      media: mockAlerts.filter((a) => a.prioridad === 'media').length,
      baja: mockAlerts.filter((a) => a.prioridad === 'baja').length,
    };
    return Promise.resolve({
      alerts: mockAlerts,
      total_counts: counts,
      total_active: cola_semanal_operativa,
      cola_semanal_operativa,
      universo_riesgo_total,
      displayed_count: 150,
      display_limit: 150,
      socios_riesgo_alto,
      socios_riesgo_critico,
      socios_alto_cola: 4,
      socios_critico_cola: 2,
      max_casos_semana: 300,
    });
  }
  if (path === '/alerts/preventive/summary') {
    const items = generateMockPreventiveItems();
    const pending = items.filter((i) => !i.accion_preventiva || i.accion_preventiva === 'Ninguna').length;
    const managed = Math.max(18, items.length - pending);
    return Promise.resolve({
      total_active: items.length,
      total_pending_gestion: pending,
      total_managed: managed,
      capacidad_preventiva: 120,
      gestiones_semana: 47,
      socios_riesgo_alto: items.filter((i) => i.risk_level === 'Alto').length,
      socios_riesgo_critico: items.filter((i) => i.risk_level === 'Crítico').length,
      universo_riesgo_total: MOCK_DB.overview.universo_riesgo_total,
      cola_semanal_operativa: MOCK_DB.overview.cola_semanal_operativa,
    });
  }
  if (path === '/alerts/preventive') {
    return Promise.resolve(paginateMockPreventive(generateMockPreventiveItems(), query));
  }
  if (path.startsWith('/socios/')) {
    const parts = path.split('/');
    const id = parts[2];
    const subpath = parts[3];
    const raw = MOCK_SOCIOS.find((s) => s.id === id) || MOCK_SOCIOS[0];
    const socio = enrichMockSocio(raw);

    if (subpath === 'payments') {
      return Promise.resolve(buildMockPayments(socio));
    }
    if (subpath === 'transactions') {
      return Promise.resolve(buildMockTransactions(socio));
    }
    if (subpath === 'balance-history') {
      return Promise.resolve(buildMockBalanceHistory(socio));
    }
    return Promise.resolve(socio);
  }
  if (path === '/socios') {
    return Promise.resolve({
      total: MOCK_SOCIOS.length,
      pages: 1,
      page: 1,
      limit: 15,
      socios: MOCK_SOCIOS.map(s => ({
        id: s.id,
        nombre: s.info.nombre,
        cedula: s.info.cedula,
        agencia: s.info.agencia,
        score: s.risk.score,
        risk_level: s.risk.level,
        dias_atraso_promedio: s.id === "710282" ? 124 : 8
      }))
    });
  }
  if (path === '/model/info') {
    return Promise.resolve({ Accuracy: "94.2%", F1_Score: "93.8%", Model_Type: "XGBoost Classifier" });
  }
  
  return Promise.reject("Not Found Mock");
}

export async function checkApiHealth() {
  if (PRESENTATION_MODE) {
    demoMode = true;
    return {
      status: 'ok',
      database: 'dataset_maestro',
      model: 'radar-mora',
      mode: 'presentation',
      isMockMode: true,
    };
  }
  const base = import.meta.env.DEV ? '' : REAL_API_BASE.replace('/api', '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    if (!res.ok) throw new Error('health check failed');
    const data = await res.json();
    demoMode = false;
    return { ...data, isMockMode: false };
  } catch (err) {
    console.warn('[Radar-Mora] Backend inalcanzable. Modo demo activado (solo por healthcheck).', err);
    demoMode = true;
    return {
      status: 'demo',
      database: 'mock',
      model: 'mock',
      isMockMode: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const dashboardAPI = {
  getOverview: () => fetchJSON(`${REAL_API_BASE}/dashboard/overview`),
  getRiskDistribution: () => fetchJSON(`${REAL_API_BASE}/dashboard/risk-distribution`),
  getTrend: () => fetchJSON(`${REAL_API_BASE}/dashboard/trend`),
  getRiskByAgency: () => fetchJSON(`${REAL_API_BASE}/dashboard/risk-by-agency`),
  getExtendedStats: () => fetchJSON(`${REAL_API_BASE}/dashboard/extended-stats`),
};

export const sociosAPI = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchJSON(`${REAL_API_BASE}/socios?${query}`);
  },
  getById: (id) => fetchJSON(`${REAL_API_BASE}/socios/${id}`),
  getPayments: (id) => fetchJSON(`${REAL_API_BASE}/socios/${id}/payments`),
  getTransactions: (id) => fetchJSON(`${REAL_API_BASE}/socios/${id}/transactions`),
  getBalanceHistory: (id) => fetchJSON(`${REAL_API_BASE}/socios/${id}/balance-history`),
};

export const alertsAPI = {
  getAll: () => fetchJSON(`${REAL_API_BASE}/alerts`),
  getPreventiveAlerts: (params = {}) =>
    fetchJSON(`${REAL_API_BASE}/alerts/preventive${buildPreventiveQuery(params)}`),
  getPreventiveSummary: () => fetchJSON(`${REAL_API_BASE}/alerts/preventive/summary`),
  savePreventiveAction: (pagoId, action) => {
    savePersistedAction(pagoId, action);
    if (demoMode) {
      return Promise.resolve({ success: true, message: 'Action saved in mock database' });
    }
    return fetch(`${REAL_API_BASE}/alerts/preventive/${pagoId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }).then((res) => {
      if (!res.ok) throw new ApiError(`API error: ${res.status}`, res.status);
      return res.json();
    });
  }
};

export const modelAPI = {
  getFeatureImportance: () => fetchJSON(`${REAL_API_BASE}/model/feature-importance`),
  getInfo: () => fetchJSON(`${REAL_API_BASE}/model/info`),
};
