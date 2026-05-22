import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { alertsAPI, getColaSemanal, getUniversoRiesgo } from '../../services/api';
import AiInsightStrip from './AiInsightStrip';
import CineKpiCard from './CineKpiCard';
import { ALERTS_PAGE } from './cinematicCopy';

export default function AlertsCinematic() {
  const [alerts, setAlerts] = useState([]);
  const [cola, setCola] = useState(300);
  const [universo, setUniverso] = useState(625);
  const [counts, setCounts] = useState({ critica: 0, alta: 0, media: 0 });
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    alertsAPI.getAll().then((data) => {
      const list = Array.isArray(data) ? data : (data?.alerts || []);
      setCola(getColaSemanal(data));
      setUniverso(getUniversoRiesgo(data));
      setCounts(data?.total_counts || {
        critica: list.filter((a) => a.prioridad === 'critica').length,
        alta: list.filter((a) => a.prioridad === 'alta').length,
        media: list.filter((a) => a.prioridad === 'media').length,
      });
      setAlerts([...list].sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = filter
    ? alerts.filter((a) => (a.prioridad || '') === filter)
    : alerts;

  const critCount = counts.critica || alerts.filter((a) => a.prioridad === 'critica').length;

  if (loading) {
    return (
      <div className="loading-container cinematic-page">
        <div className="spinner" />
        <div className="loading-text">Cargando Radar Mora…</div>
      </div>
    );
  }

  const kpiValues = [
    cola,
    universo,
    critCount,
    '12 días',
  ];

  return (
    <div className="cinematic-page">
      <section className="cine-alerts-page-hero">
        <div className="cine-eyebrow" style={{ color: 'var(--ft-muted)' }}>
          {ALERTS_PAGE.eyebrow}
        </div>
        <h1>{ALERTS_PAGE.title}</h1>
        <p style={{ color: 'var(--ft-muted)', marginTop: 8, maxWidth: 620 }}>
          {ALERTS_PAGE.subtitle(cola, universo)}
        </p>
      </section>

      <AiInsightStrip />

      <div className="cine-kpi-grid" style={{ marginBottom: 20 }}>
        {[
          { title: 'Casos priorizados', sub: 'Esta semana', value: kpiValues[0] },
          { title: 'Universo en alerta', sub: 'Monitoreo continuo', value: kpiValues[1] },
          { title: 'Críticos señalados', sub: 'Antes de mora', value: kpiValues[2] },
          { title: 'Anticipación', sub: 'Media estimada', value: kpiValues[3] },
        ].map((k) => (
          <CineKpiCard
            key={k.title}
            tone="verde"
            value={typeof k.value === 'number' ? k.value.toLocaleString('es-EC') : k.value}
            title={k.title}
            sub={k.sub}
          />
        ))}
      </div>

      <div className="cine-filter-pills">
        {[
          { id: '', label: `Todos (${alerts.length})` },
          { id: 'critica', label: `Crítica (${counts.critica || 0})` },
          { id: 'alta', label: `Alta (${counts.alta || 0})` },
          { id: 'media', label: `Vigilancia (${counts.media || 0})` },
        ].map((p) => (
          <button
            key={p.id || 'all'}
            type="button"
            className={`cine-pill${filter === p.id ? ' active' : ''}`}
            onClick={() => setFilter(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="cine-alerts-grid">
        {filtered.map((a, i) => {
          const crit = a.prioridad === 'critica' || (a.risk_level || '').includes('rít');
          const alto = (a.risk_level || '').includes('Alto');
          const ringClass = crit ? 'cine-score-ring--critico' : (alto ? 'cine-score-ring--alto' : 'cine-score-ring--medio');
          return (
            <Link
              key={a.id || i}
              to={`/socios/${a.socio_id}`}
              className={`cine-alert-card prioridad-${a.prioridad || 'alta'}`}
              style={{ flex: 'unset', maxWidth: 'none' }}
            >
              <div className="cine-alert-top">
                <span className="cine-alert-name">{a.socio_nombre}</span>
                <span className={`cine-score-ring ${ringClass}`}>
                  {Math.round(a.risk_score || 0)}
                </span>
              </div>
              <p className="cine-alert-msg">{a.mensaje}</p>
              <div className="cine-alert-tags">
                <span className="cine-tag cine-tag--brand">Radar Mora</span>
                <span className="cine-tag cine-tag--urgent">{a.risk_level || 'Alto'}</span>
                <span className="cine-tag" style={{ background: 'rgba(0,43,91,0.06)', color: 'var(--ft-muted)' }}>
                  {a.agencia?.replace('Agencia ', '') || a.fecha}
                </span>
              </div>
              <span className="cine-link-cta" style={{ marginTop: 12, fontSize: '0.75rem', border: 'none', padding: 0 }}>
                Ver análisis del socio <ChevronRight size={14} />
              </span>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="cine-panel" style={{ textAlign: 'center', padding: 48 }}>
          <AlertTriangle size={32} color="var(--ft-accent)" />
          <p style={{ marginTop: 12, color: 'var(--ft-muted)' }}>No hay casos en este nivel de priorización.</p>
        </div>
      )}
    </div>
  );
}
