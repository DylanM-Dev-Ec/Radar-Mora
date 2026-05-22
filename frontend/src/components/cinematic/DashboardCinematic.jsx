import { useState, useEffect, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, CreditCard, DollarSign, Bell, Shield, TrendingDown,
  ChevronRight, Target, AlertOctagon, HandCoins, Clock,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { COOP, RISK_COLORS } from '../../theme';
import { dashboardAPI, alertsAPI, getColaSemanal, getUniversoRiesgo } from '../../services/api';
import AiInsightStrip from './AiInsightStrip';
import CineKpiCard from './CineKpiCard';
import { BRAND, DASHBOARD } from './cinematicCopy';

const DashboardExtendedStats = lazy(() => import('../DashboardExtendedStats'));

const CHART = {
  verde: COOP.verdePrimario,
  naranja: COOP.acentoDorado,
  muted: '#5a6b63',
  ink: COOP.azulTexto,
};

function fmtCurrency(n) {
  if (n == null) return '$0';
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString('es-EC')}`;
}

function fmtNum(n) {
  return (n ?? 0).toLocaleString('es-EC');
}

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="cine-chart-tooltip">
      <div>{label}</div>
      {payload.map((p) => (
        <div key={p.name}>{p.name}: {p.value}{String(p.name).includes('mora') ? '%' : ''}</div>
      ))}
    </div>
  );
};

export default function DashboardCinematic() {
  const [overview, setOverview] = useState(null);
  const [trend, setTrend] = useState([]);
  const [riskDist, setRiskDist] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [cola, setCola] = useState(300);
  const [universo, setUniverso] = useState(625);
  const [extendedStats, setExtendedStats] = useState(null);
  const [extendedLoading, setExtendedLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      dashboardAPI.getOverview(),
      dashboardAPI.getTrend(),
      dashboardAPI.getRiskDistribution(),
      alertsAPI.getAll(),
      dashboardAPI.getExtendedStats(),
    ]).then(([ov, tr, rd, al, ext]) => {
      if (cancelled) return;
      setOverview(ov.status === 'fulfilled' ? ov.value : null);
      setTrend(tr.status === 'fulfilled' && Array.isArray(tr.value) ? tr.value : []);
      setRiskDist(rd.status === 'fulfilled' && Array.isArray(rd.value) ? rd.value : []);
      const data = al.status === 'fulfilled' ? al.value : null;
      const list = Array.isArray(data) ? data : (data?.alerts || []);
      setCola(getColaSemanal(data));
      setUniverso(getUniversoRiesgo(data));
      setAlerts([...list].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)).slice(0, 8));
      setExtendedStats(ext.status === 'fulfilled' ? ext.value : null);
      setExtendedLoading(false);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="loading-container cinematic-page">
        <div className="spinner" />
        <div className="loading-text">Cargando Radar Mora…</div>
      </div>
    );
  }

  const mora = overview?.tasa_morosidad ?? 16.8;

  const kpis = [
    { icon: Users, tone: 'verde', value: fmtNum(overview?.total_socios ?? 29821), title: 'Socios activos', sub: 'Monitoreo continuo' },
    { icon: CreditCard, tone: 'azul', value: fmtNum(overview?.creditos_vigentes ?? 32088), title: 'Créditos vigentes', sub: 'Operaciones en cartera' },
    { icon: DollarSign, tone: 'verde', value: fmtCurrency(overview?.cartera_total ?? 408621430), title: 'Cartera colocada', sub: 'Bajo análisis preventivo' },
    { icon: Bell, tone: 'naranja', value: fmtNum(cola), title: 'Priorización semanal', sub: 'Casos para el equipo' },
    { icon: Shield, tone: 'azul', value: fmtNum(universo), title: 'Alerta alto / crítico', sub: 'Universo en radar' },
    { icon: Target, tone: 'verde', value: fmtNum(overview?.socios_criticos_anticipados ?? 82), title: 'Críticos señalados', sub: 'Antes de incumplir' },
    { icon: AlertOctagon, tone: 'naranja', value: fmtNum(overview?.patrones_anomalos_activos ?? 156), title: 'Patrones anómalos', sub: 'Comportamiento transaccional' },
    { icon: HandCoins, tone: 'naranja', value: fmtNum(overview?.capacidad_preventiva ?? 120), title: 'Cobranza preventiva', sub: 'Capacidad semanal' },
    { icon: TrendingDown, tone: 'verde', value: fmtCurrency(overview?.monto_en_riesgo ?? 4280000), title: 'Exposición priorizada', sub: 'Monto en riesgo' },
    { icon: Clock, tone: 'azul', value: `${overview?.dias_anticipacion_promedio ?? 12} días`, title: 'Anticipación media', sub: 'Ventana antes de mora' },
  ];

  const pieData = riskDist.filter((r) => ['Alto', 'Crítico', 'Medio', 'Bajo'].includes(r.nivel));
  const pieColors = {
    Bajo: RISK_COLORS.Bajo,
    Medio: RISK_COLORS.Medio,
    Alto: RISK_COLORS.Alto,
    Crítico: RISK_COLORS.Crítico,
  };

  return (
    <div className="cinematic-page">
      <section className="cine-hero">
        <div className="cine-hero-grid">
          <div>
            <div className="cine-eyebrow">
              {BRAND.org} · {BRAND.region}
              <span className="cine-ai-pill">{DASHBOARD.pill}</span>
            </div>
            <h1>{DASHBOARD.heroTitle}</h1>
            <p className="cine-hero-lead" dangerouslySetInnerHTML={{ __html: DASHBOARD.heroLead }} />
            <p style={{ marginTop: 10, fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)' }}>{BRAND.tagline}</p>
          </div>
          <div className="cine-hero-metrics">
            <div className="cine-hero-metric cine-hero-metric--highlight">
              <span className="cine-metric-value">{mora}%</span>
              <div className="cine-metric-copy">
                <span className="cine-metric-label">{DASHBOARD.moraLabel}</span>
                <span className="cine-metric-hint">{DASHBOARD.moraSub}</span>
              </div>
            </div>
            <div className="cine-hero-metric">
              <span className="cine-metric-value">{fmtNum(cola)}</span>
              <div className="cine-metric-copy">
                <span className="cine-metric-label">{DASHBOARD.colaLabel}</span>
                <span className="cine-metric-hint">{DASHBOARD.colaSub}</span>
              </div>
            </div>
            <div className="cine-hero-metric">
              <span className="cine-metric-value">{fmtNum(universo)}</span>
              <div className="cine-metric-copy">
                <span className="cine-metric-label">{DASHBOARD.universoLabel}</span>
                <span className="cine-metric-hint">{DASHBOARD.universoSub}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <AiInsightStrip />

      <p className="cine-kpi-section-title">Indicadores de cartera</p>
      <div className="cine-kpi-grid">
        {kpis.map((k) => (
          <CineKpiCard key={k.title} {...k} />
        ))}
      </div>

      <div className="cine-charts">
        <div className="cine-panel">
          <div className="cine-panel-head">
            <h2>{DASHBOARD.charts.trendTitle}</h2>
            <p>{DASHBOARD.charts.trendSub}</p>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="moraGradCoop" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART.verde} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART.verde} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: CHART.muted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: CHART.muted }} unit="%" domain={['dataMin - 1', 'dataMax + 1']} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Area
                type="monotone"
                dataKey="tasa_morosidad"
                name="Morosidad"
                stroke={CHART.verde}
                strokeWidth={3}
                fill="url(#moraGradCoop)"
                dot={{ r: 4, fill: CHART.naranja, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="cine-panel">
          <div className="cine-panel-head">
            <h2>{DASHBOARD.charts.riskTitle}</h2>
            <p>{DASHBOARD.charts.riskSub}</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="cantidad"
                nameKey="nivel"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                stroke="none"
              >
                {pieData.map((entry) => (
                  <Cell key={entry.nivel} fill={entry.color || pieColors[entry.nivel] || CHART.verde} />
                ))}
              </Pie>
              <Tooltip content={<ChartTip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 8 }}>
            {pieData.map((r) => (
              <span key={r.nivel} style={{ fontSize: 11, color: CHART.muted }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: r.color || pieColors[r.nivel], marginRight: 4 }} />
                {r.nivel} {r.porcentaje}%
              </span>
            ))}
          </div>
        </div>
      </div>

      <section className="cine-alerts-section">
        <div className="cine-section-head">
          <div>
            <h2>{DASHBOARD.alertsTitle}</h2>
            <p>{DASHBOARD.alertsSub(cola)}</p>
          </div>
          <Link to="/alertas" className="cine-link-cta">
            {DASHBOARD.ctaAlerts} <ChevronRight size={16} />
          </Link>
        </div>
        <div className="cine-alerts-scroll">
          {alerts.map((a, i) => {
            const crit = (a.prioridad === 'critica' || (a.risk_level || '').includes('rít'));
            const alto = (a.risk_level || '').includes('Alto');
            const ringClass = crit ? 'cine-score-ring--critico' : (alto ? 'cine-score-ring--alto' : 'cine-score-ring--medio');
            return (
              <Link
                key={a.id || i}
                to={`/socios/${a.socio_id}`}
                className={`cine-alert-card prioridad-${a.prioridad || 'alta'}`}
              >
                <div className="cine-alert-top">
                  <span className="cine-alert-name">{a.socio_nombre}</span>
                  <span className={`cine-score-ring ${ringClass}`}>
                    {Math.round(a.risk_score || 0)}
                  </span>
                </div>
                <p className="cine-alert-msg">
                  {a.mensaje?.slice(0, 110) || 'Patrones transaccionales anómalos detectados en ventana preventiva.'}
                </p>
                <div className="cine-alert-tags">
                  <span className="cine-tag cine-tag--brand">Radar Mora</span>
                  <span className="cine-tag cine-tag--urgent">{a.risk_level || 'Alto'}</span>
                  {a.dias_anticipacion ? (
                    <span className="cine-tag" style={{ background: 'rgba(0,43,91,0.06)', color: CHART.ink }}>
                      +{a.dias_anticipacion}d anticipación
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="cine-flow">
        {DASHBOARD.flow.map((s) => (
          <div key={s.l} className="cine-flow-step">
            <div className="cine-flow-num">{s.n}</div>
            <div className="cine-flow-label">{s.l}</div>
          </div>
        ))}
      </section>

      <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/cobranza-preventiva" className="cine-link-cta">
          <Activity size={16} /> {DASHBOARD.ctaPreventiva}
        </Link>
        <Link to="/socios/710282" className="cine-link-cta">
          <TrendingDown size={16} /> {DASHBOARD.ctaPerfil}
        </Link>
      </div>

      <section style={{ marginTop: 40 }}>
        <div className="cine-section-head" style={{ marginBottom: 20 }}>
          <div>
            <h2>Análisis estadístico de cartera</h2>
            <p style={{ color: 'var(--ft-muted)', fontSize: '0.85rem', marginTop: 6 }}>
              Mismos cortes del comité de riesgos: tipo, zona, edad, actividad y más
            </p>
          </div>
        </div>
        <Suspense
          fallback={(
            <div className="loading-container" style={{ minHeight: 120 }}>
              <div className="spinner" />
              <div className="loading-text">Cargando análisis estadístico…</div>
            </div>
          )}
        >
          <DashboardExtendedStats extendedStats={extendedStats} loading={extendedLoading} />
        </Suspense>
      </section>
    </div>
  );
}
