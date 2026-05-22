import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, User, MapPin, Phone, Mail, Calendar, Briefcase, Shield, Lightbulb } from 'lucide-react';
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

const getBarColor = scoreToColor;

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
  const radarData = factors.slice(0, 6).map(f => ({
    subject: (f.name || f.description || '').replace(/_/g, ' ').substring(0, 18),
    value: Math.round((f.value || 0) * 100),
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
            <button type="button" className="btn-coop-primary" style={{ marginTop: 14, maxWidth: 320 }}>
              Contactar para Reestructuración
            </button>
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
          <div className="info-row"><span className="info-label"><MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />Agencia</span><span className="info-value">{info.agencia}</span></div>
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
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {factors.map((f, i) => {
              const impact = Math.abs(f.impact || f.value || 0);
              const norm = Math.min(impact * 100, 100);
              return (
                <div key={i} className="factor-item">
                  <span className="factor-name" title={f.description}>{f.description || f.name}</span>
                  <div className="factor-bar" style={{ width: 60 }}>
                    <div className="factor-bar-fill" style={{ width: `${norm}%`, background: getBarColor(norm) }} />
                  </div>
                </div>
              );
            })}
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
                        <div className="risk-bar-fill" style={{ width: `${(c.progreso || 0) * 100}%`, background: COOP.acentoDorado }} />
                      </div>
                      <span className="cell-muted" style={{ fontSize: 12 }}>{((c.progreso || 0) * 100).toFixed(0)}%</span>
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
