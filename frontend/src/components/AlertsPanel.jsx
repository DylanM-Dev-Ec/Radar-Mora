import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Search, Filter, Cpu, Brain, CheckCircle,
  TrendingUp, Sparkles, UserCheck,
} from 'lucide-react';
import { alertsAPI, modelAPI } from '../services/api';

function riskBadgeClass(level) {
  const l = (level || '').toLowerCase();
  if (l.includes('crít') || l.includes('crit')) return 'critico';
  if (l.includes('alto')) return 'alto';
  if (l.includes('medio')) return 'medio';
  return 'bajo';
}

function priorityClass(prioridad) {
  const p = (prioridad || '').toLowerCase();
  if (p === 'alta' || p === 'critica') return 'alta';
  if (p === 'media') return 'media';
  return 'baja';
}

export default function AlertsPanel() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [modelInfo, setModelInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [prioridadFilter, setPrioridadFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      alertsAPI.getAll().catch(() => []),
      modelAPI.getInfo().catch(() => null),
    ]).then(([alertsData, modelData]) => {
      if (cancelled) return;
      const list = Array.isArray(alertsData) ? alertsData : (alertsData?.alerts || []);
      setAlerts(list);
      setModelInfo(modelData);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const tipos = [...new Set(alerts.map((a) => a.tipo).filter(Boolean))];

  const filtered = alerts.filter((alert) => {
    const q = search.toLowerCase();
    const matchesSearch = !q
      || alert.socio_nombre?.toLowerCase().includes(q)
      || alert.mensaje?.toLowerCase().includes(q);
    let p = (alert.prioridad || '').toLowerCase();
    if (p === 'critica') p = 'alta';
    const matchesPriority = !prioridadFilter || p === prioridadFilter;
    const matchesType = !tipoFilter || alert.tipo === tipoFilter;
    return matchesSearch && matchesPriority && matchesType;
  });

  const counts = {
    alta: alerts.filter((a) => a.prioridad === 'alta' || a.prioridad === 'critica').length,
    media: alerts.filter((a) => a.prioridad === 'media').length,
    baja: alerts.filter((a) => a.prioridad === 'baja').length,
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <div className="loading-text">Cargando radar de alertas y telemetría de IA...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-intro">
        <h1>Radar de Alertas Tempranas</h1>
        <p>Predicciones del modelo Radar-Mora y desvíos transaccionales detectados</p>
      </div>

      <div className="metrics-panel metrics-panel--compact" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="metric-cell metric-cell--critical">
          <div className="metric-cell-icon"><AlertTriangle size={20} /></div>
          <div className="metric-cell-body">
            <span className="metric-cell-value">{counts.alta}</span>
            <span className="metric-cell-label">Prioridad alta / crítica</span>
          </div>
        </div>
        <div className="metric-cell metric-cell--warn">
          <div className="metric-cell-icon"><AlertTriangle size={20} /></div>
          <div className="metric-cell-body">
            <span className="metric-cell-value">{counts.media}</span>
            <span className="metric-cell-label">Prioridad media</span>
          </div>
        </div>
        <div className="metric-cell metric-cell--green">
          <div className="metric-cell-icon"><CheckCircle size={20} /></div>
          <div className="metric-cell-body">
            <span className="metric-cell-value">{counts.baja}</span>
            <span className="metric-cell-label">Prioridad baja</span>
          </div>
        </div>
      </div>

      <div className="alerts-layout">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Panel de alertas activas ({filtered.length})</div>
              <div className="card-subtitle">Casos que requieren monitoreo o contacto con el socio</div>
            </div>
            <AlertTriangle size={18} style={{ color: 'var(--riesgo-critico)' }} />
          </div>

          <div className="filters-bar" style={{ marginBottom: 16 }}>
            <Filter size={16} style={{ color: 'var(--coop-texto-secundario)' }} />
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--coop-texto-secundario)' }} />
              <input
                className="filter-input"
                style={{ paddingLeft: 40, width: '100%' }}
                placeholder="Buscar por nombre o palabra clave..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="filter-select" value={prioridadFilter} onChange={(e) => setPrioridadFilter(e.target.value)}>
              <option value="">Todas las prioridades</option>
              <option value="alta">Alta / Crítica ({counts.alta})</option>
              <option value="media">Media ({counts.media})</option>
              <option value="baja">Baja ({counts.baja})</option>
            </select>
            <select className="filter-select" value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}>
              <option value="">Todos los tipos</option>
              {tipos.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div style={{ maxHeight: 560, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div className="empty-state" style={{ padding: '60px 20px' }}>
                <UserCheck size={40} style={{ color: 'var(--coop-verde-primario)', opacity: 0.7 }} />
                <p style={{ marginTop: 12 }}>No hay alertas que coincidan con los filtros.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="data-table data-table--static">
                  <thead>
                    <tr>
                      <th>Socio</th>
                      <th>Tipo</th>
                      <th>Prioridad</th>
                      <th>Score</th>
                      <th>Fecha</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((alert) => {
                      const pClass = priorityClass(alert.prioridad);
                      return (
                        <tr
                          key={alert.id}
                          className="data-table-row--clickable"
                          onClick={() => navigate(`/socios/${alert.socio_id}`)}
                        >
                          <td className="cell-strong">{alert.socio_nombre}</td>
                          <td className="cell-muted">{alert.tipo}</td>
                          <td>
                            <span className={`badge ${pClass}`}>
                              {alert.prioridad === 'critica' ? 'crítica' : alert.prioridad}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${riskBadgeClass(alert.risk_level)}`}>
                              {alert.risk_score ?? '—'}
                            </span>
                          </td>
                          <td className="cell-muted">{alert.fecha}</td>
                          <td>
                            <button
                              type="button"
                              className="btn-coop-secondary"
                              style={{ padding: '4px 10px', fontSize: 12 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/socios/${alert.socio_id}`);
                              }}
                            >
                              <Brain size={12} /> Perfil
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Brain size={18} style={{ color: 'var(--coop-verde-oscuro)' }} />
                  Estado de la IA
                </div>
                <div className="card-subtitle">Métricas de entrenamiento del modelo</div>
              </div>
              <Sparkles size={16} style={{ color: 'var(--coop-acento-dorado)' }} />
            </div>
            {modelInfo ? (
              <>
                <div className="model-telemetry-card" style={{ marginBottom: 14 }}>
                  <Cpu size={24} style={{ color: 'var(--coop-verde-primario)' }} />
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--coop-texto-secundario)' }}>Algoritmo</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--coop-azul-texto)' }}>
                      {modelInfo.model_name || 'Random Forest'}
                    </div>
                  </div>
                </div>
                <div className="info-row">
                  <span className="info-label">Accuracy</span>
                  <span className="info-value" style={{ color: 'var(--coop-verde-primario)' }}>
                    {((modelInfo.accuracy || 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Precision</span>
                  <span className="info-value">{((modelInfo.precision || 0) * 100).toFixed(1)}%</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Recall</span>
                  <span className="info-value">{((modelInfo.recall || 0) * 100).toFixed(1)}%</span>
                </div>
                <div className="info-row" style={{ border: 'none' }}>
                  <span className="info-label">F1-Score</span>
                  <span className="info-value">{((modelInfo.f1_score || 0) * 100).toFixed(1)}%</span>
                </div>
              </>
            ) : (
              <div className="empty-state"><p>Sin datos del modelo</p></div>
            )}
          </div>

          <div className="card pitch-guide-card">
            <div className="card-header" style={{ marginBottom: 12 }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <TrendingUp size={16} style={{ color: 'var(--coop-acento-dorado)' }} />
                Guía para el pitch
              </div>
            </div>
            <p><strong>1. Socio en alerta:</strong> Filtra por prioridad alta y abre el perfil desde la tabla.</p>
            <p><strong>2. Explica el porqué:</strong> Muestra factores de riesgo y el score en el perfil del socio.</p>
            <p><strong>3. Acción preventiva:</strong> Radar-Mora permite reestructurar antes de la mora legal.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
