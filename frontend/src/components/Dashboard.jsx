import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, CreditCard, DollarSign, AlertTriangle, TrendingUp, Bell,
  Building2, ShieldAlert, ChevronRight, Activity,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend, CartesianGrid,
} from 'recharts';
import { dashboardAPI, alertsAPI } from '../services/api';
import { RISK_COLORS, COOP, CHART_GRID, CHART_AXIS, PIE_STYLE } from '../theme';

function formatCurrency(n) {
  if (n == null) return '$0';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function formatNumber(n) {
  if (n == null) return '0';
  return n.toLocaleString();
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color, fontSize: 12, margin: '2px 0' }}>
          {entry.name}: {typeof entry.value === 'number' && entry.name?.includes('$')
            ? formatCurrency(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [riskDist, setRiskDist] = useState([]);
  const [trend, setTrend] = useState([]);
  const [byAgency, setByAgency] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([
      dashboardAPI.getOverview(),
      dashboardAPI.getRiskDistribution(),
      dashboardAPI.getTrend(),
      dashboardAPI.getRiskByAgency(),
    ]).then((results) => {
      if (cancelled) return;
      const [ov, rd, tr, ag] = results.map((r) =>
        r.status === 'fulfilled' ? r.value : null
      );
      setOverview(ov);
      setRiskDist(Array.isArray(rd) ? rd : []);
      setTrend(Array.isArray(tr) ? tr : []);
      setByAgency(Array.isArray(ag) ? ag : []);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });

    alertsAPI.getAll()
      .then((al) => {
        if (!cancelled) {
          const list = Array.isArray(al) ? al : (al?.alerts || []);
          setAlerts(list.slice(0, 6));
        }
      })
      .catch(() => { if (!cancelled) setAlerts([]); });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <div className="loading-text">Cargando indicadores de cartera...</div>
      </div>
    );
  }

  const totalRiesgo = (overview?.socios_riesgo_alto || 0) + (overview?.socios_riesgo_critico || 0);
  const totalSocios = overview?.total_socios || 1;
  const pctRiesgo = ((totalRiesgo / totalSocios) * 100).toFixed(1);

  const metrics = overview ? [
    { key: 'socios', label: 'Socios activos', value: formatNumber(overview.total_socios), icon: Users, tone: 'green' },
    { key: 'creditos', label: 'Créditos vigentes', value: formatNumber(overview.creditos_vigentes), icon: CreditCard, tone: 'green' },
    { key: 'cartera', label: 'Cartera colocada', value: formatCurrency(overview.cartera_total), icon: DollarSign, tone: 'gold' },
    { key: 'mora', label: 'Tasa de morosidad', value: `${(overview.tasa_morosidad || 0).toFixed(1)}%`, icon: Activity, tone: 'risk' },
    { key: 'alto', label: 'Riesgo alto', value: formatNumber(overview.socios_riesgo_alto), icon: ShieldAlert, tone: 'warn' },
    { key: 'critico', label: 'Riesgo crítico', value: formatNumber(overview.socios_riesgo_critico), icon: AlertTriangle, tone: 'critical' },
    { key: 'monto', label: 'Exposición en riesgo', value: formatCurrency(overview.monto_en_riesgo), icon: DollarSign, tone: 'warn' },
  ] : [];

  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.07) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.52;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        fill="#ffffff"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={13}
        fontWeight={700}
        style={{ pointerEvents: 'none' }}
      >
        {(percent * 100).toFixed(0)}%
      </text>
    );
  };

  const renderPieLegend = ({ payload }) => {
    if (!payload?.length) return null;
    return (
      <ul className="pie-legend-list">
        {payload.map((entry) => {
          const item = riskDist.find((r) => r.nivel === entry.value);
          return (
            <li key={entry.value} className="pie-legend-item">
              <span className="pie-legend-dot" style={{ background: entry.color }} />
              <span className="pie-legend-name">{entry.value}</span>
              <span className="pie-legend-pct">{item?.porcentaje ?? 0}%</span>
              <span className="pie-legend-count">({item?.cantidad ?? 0})</span>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="dashboard-page">
      {/* Hero institucional */}
      <section className="dashboard-hero">
        <div className="dashboard-hero-content">
          <div className="dashboard-hero-text">
            <span className="dashboard-hero-eyebrow">Cooperativa Tulcán · Carchi</span>
            <h1>Panel de Riesgo Crediticio</h1>
            <p>
              Vista consolidada de cartera, morosidad y alertas del motor <strong>Radar-Mora</strong>.
              Datos actualizados para gestión proactiva con socios.
            </p>
          </div>
          <div className="dashboard-hero-stats">
            <div className="hero-stat hero-stat--gold">
              <span className="hero-stat-value">{pctRiesgo}%</span>
              <span className="hero-stat-label">Socios en riesgo alto/crítico</span>
            </div>
            <div className="hero-stat hero-stat--green">
              <span className="hero-stat-value">{alerts.length}</span>
              <span className="hero-stat-label">Alertas activas</span>
            </div>
            <Link to="/alertas" className="hero-stat-link">
              Ver alertas <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Resumen ejecutivo unificado */}
      <section className="dashboard-section">
        <div className="section-heading">
          <Building2 size={20} className="section-heading-icon" />
          <div>
            <h2>Resumen ejecutivo</h2>
            <p>Indicadores clave de la cooperativa al día de hoy</p>
          </div>
        </div>

        <div className="metrics-panel">
          {metrics.map((m) => (
            <div key={m.key} className={`metric-cell metric-cell--${m.tone}`}>
              <div className="metric-cell-icon">
                <m.icon size={20} />
              </div>
              <div className="metric-cell-body">
                <span className="metric-cell-value">{m.value}</span>
                <span className="metric-cell-label">{m.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Barra de distribución de riesgo integrada */}
        {riskDist.length > 0 && (
          <div className="risk-strip">
            <span className="risk-strip-title">Composición de riesgo en cartera</span>
            <div className="risk-strip-bars">
              {riskDist.map((r) => {
                const total = riskDist.reduce((s, x) => s + (x.cantidad || 0), 0) || 1;
                const pct = ((r.cantidad || 0) / total) * 100;
                const color = RISK_COLORS[r.nivel] || COOP.verdePrimario;
                return (
                  <div
                    key={r.nivel}
                    className="risk-strip-segment"
                    style={{ width: `${Math.max(pct, 4)}%`, background: color }}
                    title={`${r.nivel}: ${r.cantidad} (${pct.toFixed(1)}%)`}
                  >
                    {pct >= 8 && <span>{r.nivel}</span>}
                  </div>
                );
              })}
            </div>
            <div className="risk-strip-legend">
              {riskDist.map((r) => (
                <span key={r.nivel} className="risk-legend-item">
                  <i style={{ background: RISK_COLORS[r.nivel] }} />
                  {r.nivel}: <strong>{r.cantidad}</strong> ({r.porcentaje}%)
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Análisis gráfico */}
      <section className="dashboard-section">
        <div className="section-heading">
          <TrendingUp size={20} className="section-heading-icon" />
          <div>
            <h2>Análisis de cartera</h2>
            <p>Distribución por nivel de riesgo y por agencia</p>
          </div>
        </div>

        <div className="chart-grid">
          <div className="card card--chart">
            <div className="card-header">
              <div>
                <div className="card-title">Distribución por nivel</div>
                <div className="card-subtitle">Clasificación del modelo de IA</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <Pie
                  data={riskDist}
                  cx="50%"
                  cy="44%"
                  innerRadius={58}
                  outerRadius={92}
                  dataKey="cantidad"
                  nameKey="nivel"
                  paddingAngle={0}
                  labelLine={false}
                  label={renderPieLabel}
                  stroke="none"
                  strokeWidth={0}
                >
                  {riskDist.map((entry, i) => (
                    <Cell key={i} fill={entry.color || RISK_COLORS[entry.nivel]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" content={renderPieLegend} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="card card--chart">
            <div className="card-header">
              <div>
                <div className="card-title">Riesgo por agencia</div>
                <div className="card-subtitle">Tulcán, Ipiales y sucursales</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byAgency} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis type="number" {...CHART_AXIS} />
                <YAxis type="category" dataKey="agencia" width={88} {...CHART_AXIS} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="bajo" name="Bajo" stackId="a" fill={RISK_COLORS.Bajo} stroke="none" strokeWidth={0} />
                <Bar dataKey="medio" name="Medio" stackId="a" fill={RISK_COLORS.Medio} stroke="none" strokeWidth={0} />
                <Bar dataKey="alto" name="Alto" stackId="a" fill={RISK_COLORS.Alto} stroke="none" strokeWidth={0} />
                <Bar dataKey="critico" name="Crítico" stackId="a" fill={RISK_COLORS.Crítico} stroke="none" strokeWidth={0} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Seguimiento y alertas */}
      <section className="dashboard-section">
        <div className="section-heading">
          <Bell size={20} className="section-heading-icon" />
          <div>
            <h2>Seguimiento y alertas</h2>
            <p>Tendencia de mora y casos que requieren atención</p>
          </div>
          <Link to="/alertas" className="section-heading-action">
            Ver todas <ChevronRight size={16} />
          </Link>
        </div>

        <div className="chart-grid">
          <div className="card card--chart">
            <div className="card-header">
              <div>
                <div className="card-title">Tendencia de morosidad</div>
                <div className="card-subtitle">Últimos 12 meses · pagos atrasados</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="colorMora" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={RISK_COLORS.Crítico} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={RISK_COLORS.Crítico} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="tasa_morosidad"
                  name="Tasa mora (%)"
                  stroke={RISK_COLORS.Crítico}
                  fill="url(#colorMora)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: RISK_COLORS.Crítico }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card card--alerts">
            <div className="card-header">
              <div>
                <div className="card-title">Alertas prioritarias</div>
                <div className="card-subtitle">Detección temprana Radar-Mora</div>
              </div>
              {alerts.length > 0 && (
                <span className="alerts-count-badge">{alerts.length}</span>
              )}
            </div>
            <div className="alerts-feed">
              {alerts.length === 0 ? (
                <div className="empty-state"><p>Sin alertas pendientes</p></div>
              ) : (
                alerts.map((alert, i) => (
                  <Link
                    key={alert.id || i}
                    to={`/socios/${alert.socio_id}`}
                    className={`alert-feed-item prioridad-${alert.prioridad || 'media'}`}
                  >
                    <div className={`alert-icon ${alert.prioridad || 'media'}`}>
                      <AlertTriangle size={15} />
                    </div>
                    <div className="alert-content">
                      <div className="alert-title">{alert.socio_nombre}</div>
                      <div className="alert-message">
                        {alert.tipo}
                        {alert.mensaje && ` · ${alert.mensaje.length > 55 ? `${alert.mensaje.slice(0, 55)}…` : alert.mensaje}`}
                      </div>
                    </div>
                    <span className={`badge ${(alert.risk_level || '').toLowerCase().replace('í', 'i')}`}>
                      {alert.risk_score}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
