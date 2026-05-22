import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, User, MapPin, Phone, Mail, Calendar, Briefcase, Shield, Lightbulb, MessageCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Cell } from 'recharts';
import { sociosAPI, modelAPI } from '../services/api';
import RiskGauge from './RiskGauge';
import { RISK_COLORS, COOP, scoreToColor, CHART_GRID, CHART_AXIS } from '../theme';

const RECOMMENDATIONS = {
  'Bajo': { icon: '✅', title: 'Buen comportamiento', text: 'Socio con buen comportamiento crediticio. Mantener seguimiento estándar y considerar para nuevos productos.', color: 'bajo' },
  'Medio': { icon: '⚠️', title: 'Monitoreo preventivo', text: 'Se detectan señales leves de deterioro. Contactar al socio para verificar su situación financiera actual.', color: 'medio' },
  'Alto': { icon: '🔶', title: 'Intervención requerida', text: 'Patrón claro de deterioro crediticio. Agendar visita inmediata y evaluar opciones de reestructuración.', color: 'alto' },
  'Crítico': { icon: '🚨', title: 'Acción urgente', text: 'Alta probabilidad de mora inminente. Escalar a comité de riesgos y activar protocolo de cobranza preventiva.', color: 'critico' },
};

function getRiskLevel(score) {
  if (score <= 30) return 'Bajo';
  if (score <= 60) return 'Medio';
  if (score <= 80) return 'Alto';
  return 'Crítico';
}

function getImpactColor(impact) {
  if (impact === 'negativo') return RISK_COLORS.Crítico;
  if (impact === 'positivo') return RISK_COLORS.Bajo;
  return RISK_MIDDLE_COLOR_OR_DEFAULT(impact);
}

// Fallback for middle color matching system
function RISK_MIDDLE_COLOR_OR_DEFAULT(impact) {
  return RISK_COLORS.Medio;
}

const getBarColor = scoreToColor;

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
  
  // Behavioral alerts
  if (['alerta_critica_ia', 'alerta_retiro_ahorros', 'alerta_caida_actividad'].includes(name)) {
    return value === 1 ? 'Activa 🔴' : 'Inactiva 🟢';
  }
  
  // Ratio fields
  if (name === 'ratio_ingreso_egreso') {
    return `${Number(value).toFixed(2)}x`;
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
      setPayments(Array.isArray(p) ? p.slice(0, 24) : []);
      setTransactions(Array.isArray(t) ? t.slice(0, 20) : []);
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
  const score = risk.score || 0;
  const level = risk.level || getRiskLevel(score);
  const factors = risk.factors || [];
  const rec = RECOMMENDATIONS[level] || RECOMMENDATIONS['Medio'];

  // Radar data from factors
  const maxImpForRadar = Math.max(...factors.map(f => f.importance || 0.01));
  const radarData = factors.slice(0, 6).map(f => ({
    subject: (f.name || f.description || '').replace(/_/g, ' ').substring(0, 18),
    value: Math.round(((f.importance || 0) / maxImpForRadar) * 100),
    fullMark: 100,
  }));

  // Payment chart data
  const paymentChartData = payments.slice(0, 12).map((p, i) => ({
    name: `C${p.num_cuota || i + 1}`,
    esperado: p.monto_esperado || 0,
    pagado: p.monto_pagado || 0,
    atraso: p.dias_atraso || 0,
  }));

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

      {/* Recommendation */}
      <div className={`recommendation-card risk-profile-card ${rec.color}`}>
        <div style={{ fontSize: 28 }}>{rec.icon}</div>
        <div style={{ flex: 1 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--coop-texto-principal)' }}>
            <Lightbulb size={16} /> Recomendación IA: {rec.title}
          </h3>
          <p>{rec.text}</p>
          {(level === 'Alto' || level === 'Crítico') && (
            <>
              <button 
                type="button" 
                className="btn-coop-primary" 
                style={{ 
                  marginTop: 14, 
                  maxWidth: 320, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: 8,
                  backgroundColor: showContactOptions ? 'var(--coop-verde-oscuro)' : ''
                }}
                onClick={() => setShowContactOptions(!showContactOptions)}
              >
                <Phone size={16} /> {showContactOptions ? 'Ocultar Opciones de Contacto' : 'Contactar para Reestructuración'}
              </button>
              
              {showContactOptions && (
                <div 
                  className="animate-in"
                  style={{ 
                    marginTop: 16, 
                    padding: 16, 
                    background: 'rgba(255, 255, 255, 0.95)', 
                    border: '1px solid rgba(0, 150, 64, 0.15)', 
                    borderRadius: 12,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    maxWidth: 500
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--coop-azul-texto)' }}>
                    Canales de Cobranza Preventiva Directa (Reestructuración)
                  </h4>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                    {/* WhatsApp */}
                    <a 
                      href={`https://wa.me/${info.telefono ? (info.telefono.startsWith('0') ? '593' + info.telefono.substring(1) : info.telefono) : ''}?text=${encodeURIComponent(
                        `Estimado(a) *${info.nombre}*, le saludamos de la *Cooperativa Tulcán*. Nos ponemos en contacto con usted en referencia a su crédito actual para ofrecerle alternativas viables de *Reestructuración* que le permitan ajustar sus cuotas mensuales a su presupuesto y evitar inconvenientes con su historial crediticio. Por favor, comuníquese con nosotros a la brevedad posible para agendar una cita virtual o en agencia.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 8, 
                        padding: '10px 12px', 
                        background: '#25D366', 
                        color: 'white', 
                        borderRadius: 8, 
                        fontWeight: 600, 
                        fontSize: 12, 
                        textDecoration: 'none',
                        justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(37,211,102,0.2)',
                        transition: 'transform 0.2s'
                      }}
                      onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                      onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                      <MessageCircle size={16} /> WhatsApp
                    </a>

                    {/* Phone Call */}
                    <a 
                      href={`tel:${info.telefono || ''}`}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 8, 
                        padding: '10px 12px', 
                        background: 'var(--coop-verde-primario)', 
                        color: 'white', 
                        borderRadius: 8, 
                        fontWeight: 600, 
                        fontSize: 12, 
                        textDecoration: 'none',
                        justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0,150,64,0.2)',
                        transition: 'transform 0.2s'
                      }}
                      onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                      onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                      <Phone size={16} /> Llamada Directa
                    </a>

                    {/* Email */}
                    <a 
                      href={`mailto:${info.email || ''}?subject=Oportunidad%20de%20Reestructuraci%C3%B3n%20de%20Cr%C3%A9dito%20-%20Cooperativa%20Tulc%C3%A1n&body=${encodeURIComponent(
                        `Estimado(a) ${info.nombre},\n\nLe saludamos cordialmente de parte de la Cooperativa Tulcán.\n\nNos ponemos en contacto con usted en referencia a su crédito activo actual. Nuestro sistema inteligente ha detectado oportunidades para apoyarle en su salud financiera, y nos gustaría ofrecerle alternativas viables de Reestructuración de Crédito que le permitan ajustar sus pagos mensuales a su capacidad de pago actual y mantener un excelente récord crediticio en la SEPS.\n\nPor favor, póngase en contacto con su asesor asignado llamando a nuestros números oficiales o respondiendo directamente a este correo electrónico.\n\nAtentamente,\nDepartamento de Gestión de Riesgos\nCooperativa Tulcán`
                      )}`}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 8, 
                        padding: '10px 12px', 
                        background: 'var(--coop-azul-texto)', 
                        color: 'white', 
                        borderRadius: 8, 
                        fontWeight: 600, 
                        fontSize: 12, 
                        textDecoration: 'none',
                        justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0,43,91,0.2)',
                        transition: 'transform 0.2s'
                      }}
                      onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                      onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                      <Mail size={16} /> Correo Electrónico
                    </a>
                  </div>
                  
                  <div style={{ fontSize: 11, color: 'var(--coop-texto-secundario)', background: 'rgba(0,0,0,0.02)', padding: '8px 10px', borderRadius: 6, borderLeft: '3px solid var(--coop-acento-dorado)' }}>
                    ℹ️ <strong>Nota de cobrador:</strong> Se pre-cargará una plantilla formal estructurada para agilizar el contacto institucional. Asegúrese de documentar la gestión una vez finalizada.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

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
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Puntualidad</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {(resumen.puntualidad || 0).toFixed(0)}%
            </div>
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
                
                if (isRiesgo) {
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
                        Peso IA: {(f.importance * 100).toFixed(1)}%
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

      {/* Row 2: Payment History + Balance */}
      <div className="chart-grid-equal">
        <div className="card animate-in">
          <div className="card-header">
            <div>
              <div className="card-title">Historial de Pagos</div>
              <div className="card-subtitle">Monto esperado vs. pagado por cuota</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={paymentChartData}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="name" {...CHART_AXIS} />
              <YAxis {...CHART_AXIS} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="esperado" name="Esperado" fill="rgba(0, 150, 64, 0.35)" stroke="none" strokeWidth={0} radius={[4, 4, 0, 0]} />
              <Bar dataKey="pagado" name="Pagado" stroke="none" strokeWidth={0} radius={[4, 4, 0, 0]}>
                {paymentChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.atraso > 5 ? RISK_COLORS.Crítico : entry.atraso > 0 ? RISK_COLORS.Medio : RISK_COLORS.Bajo} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card animate-in">
          <div className="card-header">
            <div>
              <div className="card-title">Evolución del Saldo</div>
              <div className="card-subtitle">Saldo de cuenta a lo largo del tiempo</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={balanceHistory}>
              <defs>
                <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COOP.acentoDorado} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={COOP.acentoDorado} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="saldo" name="Saldo ($)" stroke={COOP.acentoDorado} fill="url(#colorSaldo)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
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
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="rgba(255,255,255,0.06)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: COOP.textoSecundario }} />
                <PolarRadiusAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Radar name="Perfil" dataKey="value" stroke={COOP.acentoDorado} fill={COOP.acentoDorado} fillOpacity={0.2} strokeWidth={2} />
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
      {payments.length > 0 && (
        <div className="card animate-in" style={{ marginTop: 24 }}>
          <div className="card-header">
            <div>
              <div className="card-title">Detalle de cuotas</div>
              <div className="card-subtitle">Últimas cuotas: esperado, pagado y días de atraso</div>
            </div>
          </div>
          <div className="table-container">
            <table className="data-table data-table--static">
              <thead>
                <tr>
                  <th>Cuota</th>
                  <th>Esperado</th>
                  <th>Pagado</th>
                  <th>Atraso (días)</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => {
                  const atraso = p.dias_atraso || 0;
                  const isPaid = p.estado === 'Pagado';
                  
                  let badgeClass = 'bajo';
                  let badgeText = 'Al día';
                  
                  if (isPaid) {
                    badgeClass = 'bajo';
                    badgeText = 'Pagado';
                  } else if (p.estado === 'Atrasado' || atraso > 0) {
                    badgeClass = atraso > 5 ? 'critico' : 'medio';
                    badgeText = 'Atrasado';
                  } else {
                    badgeClass = 'bajo';
                    badgeText = 'Al día';
                  }
                  
                  return (
                    <tr key={i}>
                      <td className="cell-muted">#{p.num_cuota ?? i + 1}</td>
                      <td className="cell-strong">${(p.monto_esperado || 0).toLocaleString()}</td>
                      <td className="cell-strong">${(p.monto_pagado || 0).toLocaleString()}</td>
                      <td className="cell-muted">{atraso}</td>
                      <td><span className={`badge ${badgeClass}`}>{badgeText}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                    <span className={`badge ${c.estado === 'Vigente' ? 'bajo' : c.estado === 'Mora' ? 'critico' : 'medio'}`}>
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
