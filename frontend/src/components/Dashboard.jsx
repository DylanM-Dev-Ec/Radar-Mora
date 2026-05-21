import { useState, useEffect } from 'react';
import { Users, CreditCard, DollarSign, AlertTriangle, TrendingUp, Bell } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, Legend, CartesianGrid } from 'recharts';
import { dashboardAPI, alertsAPI } from '../services/api';

const RISK_COLORS = { 'Bajo': '#10b981', 'Medio': '#f59e0b', 'Alto': '#f97316', 'Crítico': '#ef4444' };

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
    <div style={{ background: '#1a2035', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
      <p style={{ color: '#f1f5f9', fontWeight: 600, marginBottom: 6, fontSize: 13 }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color, fontSize: 12, margin: '2px 0' }}>
          {entry.name}: {typeof entry.value === 'number' && entry.name?.includes('$') ? formatCurrency(entry.value) : entry.value}
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
    Promise.all([
      dashboardAPI.getOverview().catch(() => null),
      dashboardAPI.getRiskDistribution().catch(() => []),
      dashboardAPI.getTrend().catch(() => []),
      dashboardAPI.getRiskByAgency().catch(() => []),
      alertsAPI.getAll().catch(() => []),
    ]).then(([ov, rd, tr, ag, al]) => {
      setOverview(ov);
      setRiskDist(Array.isArray(rd) ? rd : []);
      setTrend(Array.isArray(tr) ? tr : []);
      setByAgency(Array.isArray(ag) ? ag : []);
      const alertList = Array.isArray(al) ? al : (al?.alerts || []);
      setAlerts(alertList.slice(0, 8));
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <div className="loading-text">Cargando panel de control...</div>
      </div>
    );
  }

  const kpis = [
    { label: 'Socios Activos', value: formatNumber(overview?.total_socios), icon: Users, color: 'accent' },
    { label: 'Créditos Vigentes', value: formatNumber(overview?.creditos_vigentes), icon: CreditCard, color: 'success' },
    { label: 'Cartera Total', value: formatCurrency(overview?.cartera_total), icon: DollarSign, color: 'warning' },
    { label: 'Tasa de Morosidad', value: `${(overview?.tasa_morosidad || 0).toFixed(1)}%`, icon: AlertTriangle, color: 'danger' },
  ];

  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={600}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div>
      <div className="page-header">
        <h1>Panel de Control</h1>
        <p>Monitoreo integral del riesgo crediticio en tiempo real</p>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        {kpis.map((kpi, i) => (
          <div key={i} className={`kpi-card ${kpi.color} animate-in`}>
            <div className={`kpi-icon ${kpi.color}`}>
              <kpi.icon size={22} />
            </div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-label">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Additional KPIs row */}
      {overview && (
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
          <div className="kpi-card danger animate-in">
            <div className="kpi-icon danger"><AlertTriangle size={22} /></div>
            <div className="kpi-value">{formatNumber(overview.socios_riesgo_alto)}</div>
            <div className="kpi-label">Socios Riesgo Alto</div>
          </div>
          <div className="kpi-card danger animate-in">
            <div className="kpi-icon danger" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}><AlertTriangle size={22} /></div>
            <div className="kpi-value">{formatNumber(overview.socios_riesgo_critico)}</div>
            <div className="kpi-label">Socios Riesgo Crítico</div>
          </div>
          <div className="kpi-card warning animate-in">
            <div className="kpi-icon warning"><DollarSign size={22} /></div>
            <div className="kpi-value">{formatCurrency(overview.monto_en_riesgo)}</div>
            <div className="kpi-label">Monto en Riesgo</div>
          </div>
        </div>
      )}

      {/* Charts Row 1 */}
      <div className="chart-grid">
        <div className="card animate-in">
          <div className="card-header">
            <div>
              <div className="card-title">Distribución de Riesgo</div>
              <div className="card-subtitle">Clasificación por nivel de riesgo</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={riskDist}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={120}
                dataKey="cantidad"
                nameKey="nivel"
                labelLine={false}
                label={renderPieLabel}
                strokeWidth={2}
                stroke="rgba(10,14,26,0.8)"
              >
                {riskDist.map((entry, i) => (
                  <Cell key={i} fill={entry.color || RISK_COLORS[entry.nivel] || '#6366f1'} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                formatter={(value) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card animate-in">
          <div className="card-header">
            <div>
              <div className="card-title">Riesgo por Agencia</div>
              <div className="card-subtitle">Distribución geográfica del riesgo</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byAgency} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="agencia" width={100} tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="bajo" name="Bajo" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="medio" name="Medio" stackId="a" fill="#f59e0b" />
              <Bar dataKey="alto" name="Alto" stackId="a" fill="#f97316" />
              <Bar dataKey="critico" name="Crítico" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="chart-grid">
        <div className="card animate-in">
          <div className="card-header">
            <div>
              <div className="card-title">Tendencia de Morosidad</div>
              <div className="card-subtitle">Evolución de la tasa de mora en los últimos 12 meses</div>
            </div>
            <TrendingUp size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="colorMora" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="tasa_morosidad" name="Tasa Mora (%)" stroke="#ef4444" fill="url(#colorMora)" strokeWidth={2} dot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card animate-in">
          <div className="card-header">
            <div>
              <div className="card-title">Alertas Recientes</div>
              <div className="card-subtitle">Últimas notificaciones del sistema</div>
            </div>
            <Bell size={18} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {alerts.length === 0 ? (
              <div className="empty-state"><p>No hay alertas recientes</p></div>
            ) : (
              alerts.map((alert, i) => (
                <div key={i} className="alert-item" style={{ padding: '10px 12px', marginBottom: 6 }}>
                  <div className={`alert-icon ${alert.prioridad || 'media'}`}>
                    <AlertTriangle size={16} />
                  </div>
                  <div className="alert-content">
                    <div className="alert-title">{alert.socio_nombre || 'Socio'}</div>
                    <div className="alert-message">{alert.mensaje}</div>
                    <div className="alert-meta">{alert.fecha} · Score: {alert.risk_score}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
