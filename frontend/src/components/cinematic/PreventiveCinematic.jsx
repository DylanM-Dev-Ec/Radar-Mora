import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Calendar, ChevronRight, Clock } from 'lucide-react';
import { alertsAPI, getPreventiveItems } from '../../services/api';
import AiInsightStrip from './AiInsightStrip';
import CineKpiCard from './CineKpiCard';
import { PREVENTIVE_PAGE } from './cinematicCopy';

function fmtMoney(n) {
  return `$${(n ?? 0).toLocaleString('es-EC', { minimumFractionDigits: 0 })}`;
}

export default function PreventiveCinematic() {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    alertsAPI.getPreventiveAlerts({ limit: 12, offset: 0 })
      .then((data) => {
        setItems(getPreventiveItems(data).slice(0, 12));
        setMeta(data && !Array.isArray(data) ? data : {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading-container cinematic-page">
        <div className="spinner" />
        <div className="loading-text">Cargando ventana de cobranza preventiva…</div>
      </div>
    );
  }

  const volume = items.reduce((s, i) => s + (i.monto_esperado || 0), 0);
  const pending = meta.total_pending_gestion ?? items.filter((i) => !i.accion_preventiva || i.accion_preventiva === 'Ninguna').length;
  const managed = meta.total_managed ?? Math.max(0, items.length - pending);
  const total = meta.total_active ?? meta.pagination?.total ?? 62;

  return (
    <div className="cinematic-page">
      <section className="cine-alerts-page-hero">
        <div className="cine-eyebrow" style={{ color: 'var(--ft-muted)' }}>
          {PREVENTIVE_PAGE.eyebrow}
        </div>
        <h1>{PREVENTIVE_PAGE.title}</h1>
        <p style={{ color: 'var(--ft-muted)', marginTop: 8, maxWidth: 560 }}>
          {PREVENTIVE_PAGE.subtitle}
        </p>
      </section>

      <AiInsightStrip />

      <div className="cine-kpi-grid" style={{ marginBottom: 24 }}>
        <CineKpiCard tone="naranja" value="120" title="Capacidad semanal" sub="Gestiones preventivas" />
        <CineKpiCard tone="verde" value={total.toLocaleString('es-EC')} title="En ventana" sub="Cuotas por vencer" />
        <CineKpiCard tone="azul" value={pending.toLocaleString('es-EC')} title="Pendientes" sub="Por contactar" />
        <CineKpiCard tone="naranja" value={fmtMoney(volume)} title="Monto en vista" sub="Gestión anticipada" />
      </div>

      <div className="cine-alerts-grid">
        {items.map((item) => (
          <Link
            key={item.pago_id}
            to={`/socios/${String(item.socio_id).split('-')[0]}`}
            className="cine-alert-card prioridad-alta"
            style={{ flex: 'unset' }}
          >
            <div className="cine-alert-top">
              <span className="cine-alert-name">{item.socio_nombre}</span>
              <span className={`cine-score-ring ${item.risk_level === 'Crítico' ? 'cine-score-ring--critico' : 'cine-score-ring--alto'}`}>
                {Math.round(item.risk_score || 0)}
              </span>
            </div>
            <p className="cine-alert-msg">
              Cuota #{item.num_cuota} por {fmtMoney(item.monto_esperado)} · vencimiento {item.fecha_esperada}
              {item.accion_preventiva && item.accion_preventiva !== 'Ninguna'
                ? ` · ${item.accion_preventiva}`
                : ' · Sin gestionar'}
            </p>
            <div className="cine-alert-tags">
              <span className="cine-tag cine-tag--brand"><Shield size={10} style={{ display: 'inline', marginRight: 4 }} />Preventiva</span>
              <span className="cine-tag cine-tag--urgent">{item.risk_level}</span>
              <span className="cine-tag" style={{ background: 'rgba(0,43,91,0.06)', color: 'var(--ft-muted)' }}>
                <Calendar size={10} style={{ display: 'inline', marginRight: 4 }} />
                {item.socio_agencia?.replace('Agencia ', '')}
              </span>
              <span className="cine-tag" style={{ background: 'rgba(0,150,64,0.08)', color: 'var(--ft-accent-2)' }}>
                <Clock size={10} style={{ display: 'inline', marginRight: 4 }} />
                {managed > 0 ? 'En seguimiento' : 'Contactar hoy'}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <p style={{ marginTop: 20, fontSize: '0.8rem', color: 'var(--ft-muted)', textAlign: 'center' }}>
        {managed.toLocaleString('es-EC')} gestiones registradas en esta ventana · {pending.toLocaleString('es-EC')} por asignar
        <Link to="/" className="cine-link-cta" style={{ marginLeft: 8 }}>
          Centro de riesgo <ChevronRight size={14} />
        </Link>
      </p>
    </div>
  );
}
