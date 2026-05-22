import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, User, MapPin, Phone, Mail, Calendar, Briefcase, Shield } from 'lucide-react';
import RiskInterventionPanel from './RiskInterventionPanel';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { sociosAPI } from '../services/api';
import { formatDiasAtraso, estadoCuotaDisplay, sortCuotasParaDetalle } from '../utils/cuotaAtraso';
import RiskGauge from './RiskGauge';
import { RISK_COLORS, COOP, CHART_GRID, CHART_AXIS } from '../theme';

const RECOMMENDATIONS = {
  'Bajo': { icon: '✅', title: 'Buen comportamiento', text: 'Socio con buen comportamiento crediticio. Mantener seguimiento estándar y considerar para nuevos productos.', color: 'bajo' },
  'Medio': { icon: '⚠️', title: 'Monitoreo preventivo', text: 'Se detectan señales leves de deterioro. Contactar al socio para verificar su situación financiera actual.', color: 'medio' },
  'Alto': { icon: '🔶', title: 'Intervención requerida', text: 'Patrón claro de deterioro crediticio. Agendar visita inmediata y evaluar opciones de reestructuración.', color: 'alto' },
  'Crítico': { icon: '🚨', title: 'Acción urgente', text: 'Alta probabilidad de mora inminente. Escalar a comité de riesgos y activar protocolo de cobranza preventiva.', color: 'critico' },
};

const MAX_DIAS_MORA_DISPLAY = 31;

function getRiskLevel(score) {
  const s = Math.round(Number(score) || 0);
  if (s >= 75) return 'Crítico';
  if (s >= 55) return 'Alto';
  if (s >= 35) return 'Medio';
  return 'Bajo';
}

function formatDiasMoraDisplay(dias) {
  const n = Math.max(0, Math.round(Number(dias) || 0));
  if (n > MAX_DIAS_MORA_DISPLAY) return `${MAX_DIAS_MORA_DISPLAY}+`;
  return String(n);
}

function clampRadar(n) {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}

/** Ejes fijos 0–100: comparables entre socios (no solo peso relativo del factor top). */
function buildConductualRadar({ score, resumen, risk, factors }) {
  const fv = risk?.feature_values || {};
  const pick = (name) => {
    const f = factors.find((x) => x.name === name);
    return f?.value ?? fv[name];
  };

  const dias = Math.min(
    MAX_DIAS_MORA_DISPLAY,
    Number(resumen?.dias_mora ?? pick('dias_mora') ?? 0),
  );
  const cuotas = Number(resumen?.cuotas_atrasadas ?? pick('cuotas_atrasadas') ?? 0);
  const saldo = Number(pick('saldo_disponible') ?? 0);
  const ratioRaw = Number(pick('ratio_ingreso_egreso'));
  const ratio = Number.isFinite(ratioRaw) && ratioRaw >= 0.05 && ratioRaw <= 5 ? ratioRaw : 1;
  const numTx = Number(pick('num_transacciones') ?? 0);
  const nroCred = Number(pick('nro_creditos') ?? 0);
  const cargas = Number(pick('nro_cargas_fam') ?? 0);
  const alertas =
    (Number(pick('alerta_critica_ia')) ? 1 : 0)
    + (Number(pick('alerta_retiro_ahorros')) ? 1 : 0)
    + (Number(pick('alerta_caida_actividad')) ? 1 : 0);

  let liquidez = 15;
  if (saldo < 30) liquidez = 92;
  else if (saldo < 120) liquidez = 72;
  else if (saldo < 400) liquidez = 48;
  else if (saldo < 1000) liquidez = 28;

  let capacidad = 25;
  if (ratio < 0.8) capacidad = 88;
  else if (ratio < 0.95) capacidad = 68;
  else if (ratio < 1.05) capacidad = 45;
  else if (ratio < 1.25) capacidad = 22;

  let actividad = 35;
  if (numTx <= 1) actividad = 78;
  else if (numTx <= 4) actividad = 58;
  else if (numTx <= 12) actividad = 32;

  const statAdj = Number(risk?.statistical_adjustment ?? 0);

  return [
    { subject: 'Score riesgo', value: clampRadar(score), fullMark: 100 },
    { subject: 'Mora (días)', value: clampRadar((dias / MAX_DIAS_MORA_DISPLAY) * 100), fullMark: 100 },
    { subject: 'Cuotas atraso', value: clampRadar((cuotas / 5) * 100), fullMark: 100 },
    { subject: 'Liquidez', value: clampRadar(liquidez), fullMark: 100 },
    { subject: 'Capacidad pago', value: clampRadar(capacidad), fullMark: 100 },
    { subject: 'Actividad', value: clampRadar(actividad), fullMark: 100 },
    { subject: 'Exposición', value: clampRadar(Math.min(100, nroCred * 22 + cargas * 8)), fullMark: 100 },
    { subject: 'Alertas / mora', value: clampRadar(alertas * 28 + (resumen?.en_mora ? 35 : 0) + statAdj * 2.5), fullMark: 100 },
  ];
}

const RadarTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{p.subject}</p>
      <p style={{ fontSize: 12, margin: 0 }}>Índice de presión: <strong>{p.value}%</strong></p>
    </div>
  );
};

function getImpactColor(impact) {
  if (impact === 'negativo') return RISK_COLORS.Crítico;
  if (impact === 'positivo') return RISK_COLORS.Bajo;
  return RISK_MIDDLE_COLOR_OR_DEFAULT(impact);
}

// Fallback for middle color matching system
function RISK_MIDDLE_COLOR_OR_DEFAULT(impact) {
  return RISK_COLORS.Medio;
}

function formatFactorValue(name, value) {
  if (value === undefined || value === null) return '—';
  
  // Dollar fields
  if (['saldo_disponible', 'volumen_total', 'ingresos_socio', 'egresos_socio'].includes(name)) {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  
  // Trend fields
  if (name === 'cambio_saldo_ahorro') {
    const sign = value > 0 ? '+' : '';
    return `${sign}$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  
  if (name === 'dias_mora') return `${formatDiasMoraDisplay(value)} días`;
  if (name === 'cuotas_atrasadas') return `${value} cuota(s)`;

  // Behavioral alerts
  if (['alerta_critica_ia', 'alerta_retiro_ahorros', 'alerta_caida_actividad'].includes(name)) {
    return value === 1 ? 'Activa 🔴' : 'Inactiva 🟢';
  }
  
  if (name === 'ratio_ingreso_egreso') {
    const r = Number(value);
    if (!Number.isFinite(r) || r < 0.05 || r > 5) return '—';
    return `${r.toFixed(2)} (ingresos/egresos)`;
  }

  if (name && String(name).startsWith('stat_')) {
    const t = Number(value);
    return Number.isFinite(t) ? `${t.toFixed(1)}% mora en segmento` : '—';
  }
  
  // Count fields
  if (name === 'nro_cargas_fam') {
    const val = Math.round(value);
    return `${val} ${val === 1 ? 'carga' : 'cargas'}`;
  }
  if (name === 'nro_creditos') {
    const val = Math.round(value);
    return `${val} ${val === 1 ? 'crédito' : 'créditos'}`;
  }
  if (name === 'num_transacciones') {
    const val = Math.round(value);
    return `${val} ${val === 1 ? 'trx' : 'trxs'}`;
  }
  
  return typeof value === 'number' ? value.toLocaleString() : String(value);
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: COOP.blancoTarjetas, border: '1px solid #ddd', borderTop: `3px solid ${COOP.acentoDorado}`, borderRadius: 8, padding: '12px 16px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
      <p style={{ color: COOP.azulTexto, fontWeight: 600, marginBottom: 6, fontSize: 13 }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color || COOP.textoSecundario, fontSize: 12, margin: '2px 0' }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
        </p>
      ))}
    </div>
  );
};

export default function SocioProfile() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [showContactOptions, setShowContactOptions] = useState(false);
  const [payments, setPayments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [balanceHistory, setBalanceHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      sociosAPI.getById(id).catch(() => null),
      sociosAPI.getPayments(id).catch(() => []),
      sociosAPI.getTransactions(id).catch(() => []),
      sociosAPI.getBalanceHistory(id).catch(() => []),
    ]).then(([d, p, t, b]) => {
      setData(d);
      setPayments(Array.isArray(p) ? sortCuotasParaDetalle(p).slice(0, 15) : []);
      setTransactions(Array.isArray(t) ? t.slice(0, 15) : []);
      setBalanceHistory(Array.isArray(b) ? b : []);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <div className="loading-text">Cargando perfil del socio...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="empty-state">
        <p>No se encontró el socio</p>
        <Link to="/socios" className="back-btn" style={{ marginTop: 16, display: 'inline-flex' }}>
          <ArrowLeft size={16} /> Volver
        </Link>
      </div>
    );
  }

  const info = data.info || {};
  const risk = data.risk || {};
  const creditos = data.creditos || [];
  const resumen = data.resumen || {};
  const score = Math.round(Number(risk.score) || 0);
  const level = getRiskLevel(score);
  const factors = (risk.factors || []).filter((f) => {
    if ((f.name || '').startsWith('stat_tipo_cartera')) return false;
    if (f.name === 'ratio_ingreso_egreso') {
      const r = Number(f.value);
      if (!Number.isFinite(r) || r < 0.05 || r > 5) return false;
      if ((level === 'Alto' || level === 'Crítico') && f.impact === 'positivo') return false;
    }
    return true;
  });
  const rec = RECOMMENDATIONS[level] || RECOMMENDATIONS['Medio'];
  const recIcon = rec.icon;
  const creditosActivos = creditos.filter((c) => (c.estado || c.estado_bd) !== 'Completado');
  const creditosMora = creditos.filter((c) => c.estado === 'Mora');
  const creditoFoco =
    creditosMora[0]
    || creditosActivos.sort((a, b) => (b.cuotas_atrasadas || 0) - (a.cuotas_atrasadas || 0))[0]
    || creditos[0];
  const radarData = buildConductualRadar({ score, resumen, risk, factors });
  const diasMoraLabel = formatDiasMoraDisplay(resumen.dias_mora);

  function creditoEstadoBadge(estado) {
    if (estado === 'Completado') return 'bajo';
    if (estado === 'Vigente') return 'bajo';
    if (estado === 'Mora') return 'critico';
    return 'medio';
  }

  const balanceChartData = balanceHistory.map((b) => {
    const raw = b.fecha || '';
    const label = raw.length >= 7 ? raw.slice(0, 7) : raw;
    return { fecha: label, saldo: Number(b.saldo) || 0 };
  });

  return (
    <div>
      {/* Header */}
      <div className="profile-header">
        <Link to="/socios" className="back-btn">
          <ArrowLeft size={16} /> Volver
        </Link>
        <h1 className="profile-name">{info.nombre || `Socio ${id}`}</h1>
        <span className={`badge ${level.toLowerCase().replace('í','i')}`} style={{ fontSize: 14, padding: '6px 16px' }}>
          {level}
        </span>
      </div>

      {/* Recomendación + reestructuración (Alto / Crítico) */}
      {(level === 'Alto' || level === 'Crítico') ? (
        <RiskInterventionPanel
          level={level}
          score={score}
          rec={rec}
          recIcon={recIcon}
          recColor={rec.color}
          creditoFoco={creditoFoco}
          creditosMoraCount={creditosMora.length}
          diasMoraLabel={diasMoraLabel}
          hasDiasMora={(resumen.dias_mora || 0) > 0}
          cuotasAtrasadas={resumen.cuotas_atrasadas}
          diasMoraCreditoLabel={formatDiasMoraDisplay(creditoFoco?.dias_mora_max)}
          info={info}
          showContactOptions={showContactOptions}
          onToggleContact={() => setShowContactOptions((v) => !v)}
          estadoBadgeClass={creditoEstadoBadge}
        />
      ) : (
        <div className={`recommendation-card ${rec.color}`}>
          <div style={{ fontSize: 28 }}>{recIcon}</div>
          <div>
            <h3>Recomendación: {rec.title}</h3>
            <p>{rec.text}</p>
          </div>
        </div>
      )}

      {/* Row 1: Info, Gauge, Factors */}
      <div className="profile-grid-3">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Información Personal</div>
            <User size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="info-row"><span className="info-label">Cédula</span><span className="info-value">{info.cedula}</span></div>
          <div className="info-row"><span className="info-label">Edad</span><span className="info-value">{info.edad} años</span></div>
          <div className="info-row"><span className="info-label">Ocupación</span><span className="info-value">{info.ocupacion}</span></div>
          <div className="info-row"><span className="info-label"><MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />Agencia</span><span className="info-value">{info.agencia ? info.agencia.replace(/^Agencia\s+/i, '') : ''}</span></div>
          <div className="info-row"><span className="info-label"><Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />Socio desde</span><span className="info-value">{info.fecha_ingreso}</span></div>
          <div className="info-row"><span className="info-label"><Phone size={12} style={{ display: 'inline', marginRight: 4 }} />Teléfono</span><span className="info-value">{info.telefono}</span></div>
          <div className="info-row"><span className="info-label"><Mail size={12} style={{ display: 'inline', marginRight: 4 }} />Email</span><span className="info-value" style={{ fontSize: 11 }}>{info.email}</span></div>
          <div className="info-row" style={{ border: 'none' }}><span className="info-label">Antigüedad</span><span className="info-value">{info.antiguedad || resumen?.antiguedad || '—'}</span></div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card-title" style={{ marginBottom: 16 }}>Score de Riesgo</div>
          <RiskGauge score={score} size={220} />
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Días de mora (máx.)</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: resumen.dias_mora > 30 ? 'var(--riesgo-critico)' : 'var(--text-primary)' }}>
              {diasMoraLabel} días
            </div>
            {resumen.cuotas_atrasadas > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {resumen.cuotas_atrasadas} cuota(s) atrasada(s)
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Factores de Riesgo</div>
            <Shield size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto', paddingRight: '4px' }}>
            {(() => {
              const maxImpForBar = Math.max(...factors.map(x => x.importance || 0.01));
              return factors.map((f, i) => {
                const norm = Math.min(((f.importance || 0) / maxImpForBar) * 100, 100);
                const isRiesgo = f.impact === 'negativo';
                const isMitigante = f.impact === 'positivo';
                const isNeutral = !isRiesgo && !isMitigante;
                
                // Color configuration for semantic card backgrounds and borders
                let badgeBg = 'rgba(108, 117, 125, 0.1)';
                let badgeColor = 'var(--text-secondary)';
                let badgeLabel = 'Neutral';
                
                const isStatFactor = (f.name || '').startsWith('stat_');

                if (isStatFactor && isRiesgo) {
                  badgeBg = 'rgba(184, 134, 11, 0.15)';
                  badgeColor = 'var(--coop-acento-dorado)';
                  badgeLabel = 'Cartera';
                } else if (isRiesgo) {
                  badgeBg = 'rgba(220, 53, 69, 0.1)';
                  badgeColor = 'var(--riesgo-critico)';
                  badgeLabel = 'Riesgo';
                } else if (isMitigante) {
                  badgeBg = 'rgba(40, 167, 69, 0.12)';
                  badgeColor = 'var(--riesgo-bajo)';
                  badgeLabel = 'Mitigante';
                }

                return (
                  <div key={i} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '14px',
                    background: 'rgba(255, 255, 255, 0.45)',
                    border: '1px solid rgba(0, 104, 55, 0.07)',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                    transition: 'all 0.2s ease-in-out'
                  }} className="factor-item-modern">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--coop-azul-texto)', lineHeight: 1.3 }}>
                        {f.description || f.name}
                      </span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 'bold',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        background: badgeBg,
                        color: badgeColor
                      }}>
                        {badgeLabel}
                      </span>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      <div>
                        Valor actual: <strong style={{ color: 'var(--text-primary)' }}>{formatFactorValue(f.name, f.value)}</strong>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Peso: {(f.importance * 100).toFixed(1)}%
                      </div>
                    </div>
                    
                    <div style={{ width: '100%', height: '6px', background: '#eaeaea', borderRadius: '3px', overflow: 'hidden', marginTop: '2px' }}>
                      <div style={{
                        height: '100%',
                        width: `${norm}%`,
                        background: getImpactColor(f.impact),
                        borderRadius: '3px'
                      }} />
                    </div>
                  </div>
                );
              });
            })()}
            {factors.length === 0 && <div className="empty-state"><p>Sin datos</p></div>}
          </div>
        </div>
      </div>

      {/* Evolución de saldo */}
      <div className="card animate-in" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Evolución del Saldo</div>
            <div className="card-subtitle">
              Saldo de cuenta según movimientos registrados
              {balanceChartData.length > 0 && ` (${balanceChartData.length} puntos)`}
            </div>
          </div>
        </div>
        {balanceChartData.length < 1 ? (
          <div className="empty-state" style={{ padding: '48px 20px' }}>
            <p>No hay suficientes movimientos para mostrar la evolución del saldo.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={balanceChartData}>
              <defs>
                <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COOP.acentoDorado} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={COOP.acentoDorado} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="fecha" {...CHART_AXIS} interval="preserveStartEnd" />
              <YAxis {...CHART_AXIS} tickFormatter={(v) => `$${Number(v).toLocaleString('es-EC', { maximumFractionDigits: 0 })}`} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="saldo"
                name="Saldo ($)"
                stroke={COOP.acentoDorado}
                fill="url(#colorSaldo)"
                strokeWidth={2}
                dot={{ r: 3, fill: COOP.acentoDorado }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Row 3: Radar + Transactions */}
      <div className="chart-grid-equal">
        <div className="card animate-in">
          <div className="card-header">
            <div>
              <div className="card-title">Perfil Conductual</div>
              <div className="card-subtitle">Dimensiones del comportamiento financiero</div>
            </div>
          </div>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart key={`conductual-${id}`} data={radarData} cx="50%" cy="50%" outerRadius="72%">
                <PolarGrid {...CHART_GRID} />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: COOP.textoSecundario }} />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fontSize: 9, fill: COOP.textoSecundario }}
                  tickCount={5}
                />
                <Tooltip content={<RadarTooltip />} />
                <Radar
                  name="Presión de riesgo"
                  dataKey="value"
                  stroke={COOP.acentoDorado}
                  fill={COOP.acentoDorado}
                  fillOpacity={0.25}
                  strokeWidth={2}
                  dot={{ r: 3, fill: COOP.verdePrimario }}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state"><p>Sin datos suficientes</p></div>
          )}
        </div>

        <div className="card animate-in">
          <div className="card-header">
            <div>
              <div className="card-title">Últimas Transacciones</div>
              <div className="card-subtitle">Movimientos recientes de la cuenta</div>
            </div>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            <div className="table-container">
            <table className="data-table data-table--static">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Monto</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => {
                  const isPositive = t.tipo?.includes('Depósito') || t.tipo?.includes('Recibida');
                  return (
                    <tr key={i}>
                      <td className="cell-muted" style={{ fontSize: 13 }}>{t.fecha}</td>
                      <td style={{ fontSize: 13 }}>{t.tipo}</td>
                      <td className="cell-strong" style={{ fontSize: 13, color: isPositive ? RISK_COLORS.Bajo : RISK_COLORS.Crítico }}>
                        {isPositive ? '+' : '-'}${Math.abs(t.monto || 0).toLocaleString()}
                      </td>
                      <td className="cell-muted" style={{ fontSize: 13 }}>${(t.saldo_resultante || 0).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {transactions.length === 0 && <div className="empty-state"><p>Sin transacciones</p></div>}
          </div>
        </div>
      </div>

      {/* Tabla detalle de cuotas */}
      <div className="card animate-in" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Detalle de cuotas</div>
            <div className="card-subtitle">Últimas cuotas: vencimiento, esperado, pagado y días de atraso</div>
          </div>
        </div>
        {payments.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}><p>Sin cuotas registradas</p></div>
        ) : (
          <div className="table-container">
            <table className="data-table data-table--static">
              <thead>
                <tr>
                  <th>Cuota</th>
                  <th>Vencimiento</th>
                  <th>Esperado</th>
                  <th>Pagado</th>
                  <th>Atraso (días)</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => {
                  const { atraso, badge: badgeText, badgeClass } = estadoCuotaDisplay(p);

                  return (
                    <tr key={i}>
                      <td className="cell-muted">#{p.num_cuota ?? i + 1}</td>
                      <td className="cell-muted" style={{ fontSize: 13 }}>{p.fecha_esperada || '—'}</td>
                      <td className="cell-strong">${(p.monto_esperado || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</td>
                      <td className="cell-strong">${(p.monto_pagado || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</td>
                      <td className="cell-muted" title={atraso >= 365 ? `${atraso} días` : undefined}>
                        {formatDiasAtraso(atraso)}
                      </td>
                      <td><span className={`badge ${badgeClass}`}>{badgeText}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Credits Summary */}
      {creditos.length > 0 && (
        <div className="card animate-in" style={{ marginTop: 24 }}>
          <div className="card-header">
            <div className="card-title">Créditos del Socio</div>
          </div>
          <div className="table-container">
          <table className="data-table data-table--static">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tipo</th>
                <th>Monto</th>
                <th>Plazo</th>
                <th>Cuota</th>
                <th>Estado</th>
                <th>Progreso</th>
              </tr>
            </thead>
            <tbody>
              {creditos.map((c, i) => (
                <tr key={i}>
                  <td className="cell-muted">#{c.id}</td>
                  <td>{c.tipo}</td>
                  <td className="cell-strong">${(c.monto || 0).toLocaleString()}</td>
                  <td className="cell-muted">{c.plazo} meses</td>
                  <td>${(c.cuota || 0).toLocaleString()}</td>
                  <td>
                    <span className={`badge ${creditoEstadoBadge(c.estado)}`}>
                      {c.estado}
                    </span>
                  </td>
                  <td>
                    <div className="risk-bar">
                      <div className="risk-bar-track" style={{ maxWidth: 60 }}>
                        <div className="risk-bar-fill" style={{ width: `${Math.min(100, c.progreso || 0)}%`, background: COOP.acentoDorado }} />
                      </div>
                      <span className="cell-muted" style={{ fontSize: 12 }}>{Math.min(100, c.progreso || 0).toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
