import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Search, Filter, Brain, UserCheck, ShieldAlert, AlertCircle
} from 'lucide-react';
import { alertsAPI, getColaSemanal, getUniversoRiesgo, getDisplayedCount } from '../services/api';
import BusinessContextStrip from './BusinessContextStrip';

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

function AlertsPanelStandard() {
  const navigate = useNavigate();
  
  const [alerts, setAlerts] = useState([]);
  const [totalCounts, setTotalCounts] = useState({ alta: 0, critica: 0, media: 0, baja: 0 });
  const [colaSemanal, setColaSemanal] = useState(0);
  const [universoRiesgo, setUniversoRiesgo] = useState(0);
  const [displayedCount, setDisplayedCount] = useState(0);
  const [displayLimit, setDisplayLimit] = useState(150);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [prioridadFilter, setPrioridadFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    
    alertsAPI.getAll().catch(() => []).then((alertsData) => {
      if (cancelled) return;
      
      const list = Array.isArray(alertsData) ? alertsData : (alertsData?.alerts || []);
      setAlerts(list);
      
      if (alertsData && !Array.isArray(alertsData) && alertsData.total_counts) {
        setTotalCounts(alertsData.total_counts);
      } else {
        setTotalCounts({
          critica: list.filter((a) => a.prioridad === 'critica').length,
          alta: list.filter((a) => a.prioridad === 'alta').length,
          media: list.filter((a) => a.prioridad === 'media').length,
          baja: list.filter((a) => a.prioridad === 'baja').length,
        });
      }
      setColaSemanal(getColaSemanal(alertsData));
      setUniversoRiesgo(getUniversoRiesgo(alertsData));
      setDisplayedCount(getDisplayedCount(alertsData));
      setDisplayLimit(alertsData?.display_limit ?? 150);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    
    return () => { cancelled = true; };
  }, []);

  const tipos = [...new Set(alerts.map((a) => a.tipo).filter(Boolean))];

  const filteredAlerts = alerts.filter((alert) => {
    const q = search.toLowerCase();
    const matchesSearch = !q
      || alert.socio_nombre?.toLowerCase().includes(q)
      || alert.mensaje?.toLowerCase().includes(q);
    const p = (alert.prioridad || '').toLowerCase();
    const matchesPriority = !prioridadFilter || p === prioridadFilter;
    const matchesType = !tipoFilter || alert.tipo === tipoFilter;
    return matchesSearch && matchesPriority && matchesType;
  });

  // Conteos alineados con panel de riesgo: Alto + Crítico
  const counts = totalCounts;
  const hasFilters = Boolean(search || prioridadFilter || tipoFilter);
  const visibleRows = filteredAlerts.length;
  const universoParaTexto = universoRiesgo || (counts.critica || 0) + (counts.alta || 0);
  const shownInTable = hasFilters ? visibleRows : (displayedCount || alerts.length);
  const prioridadAltaCritica = colaSemanal || (counts.critica || 0) + (counts.alta || 0);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <div className="loading-text">Cargando radar de alertas...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-intro">
        <h1>Radar de Alertas Tempranas</h1>
        <p>
          Cola operativa priorizada por Radar-Mora. El universo en radar ({universoParaTexto.toLocaleString('es-EC')} socios)
          es mayor que los casos que el equipo puede gestionar en una semana.
        </p>
      </div>

      <BusinessContextStrip
        universo={universoParaTexto}
        cola={colaSemanal}
      />

      <div className="metrics-panel metrics-panel--compact" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="metric-cell metric-cell--critical">
              <div className="metric-cell-icon"><AlertTriangle size={20} /></div>
              <div className="metric-cell-body">
                <span className="metric-cell-value">{colaSemanal.toLocaleString('es-EC')}</span>
                <span className="metric-cell-label">Cola semanal operativa</span>
              </div>
            </div>
            <div className="metric-cell metric-cell--warn">
              <div className="metric-cell-icon"><ShieldAlert size={20} /></div>
              <div className="metric-cell-body">
                <span className="metric-cell-value">{universoParaTexto.toLocaleString('es-EC')}</span>
                <span className="metric-cell-label">Universo en radar</span>
              </div>
            </div>
            <div className="metric-cell metric-cell--warn">
              <div className="metric-cell-icon"><ShieldAlert size={20} /></div>
              <div className="metric-cell-body">
                <span className="metric-cell-value">{(counts.alta || 0).toLocaleString('es-EC')}</span>
                <span className="metric-cell-label">Alto en cola</span>
              </div>
            </div>
            <div className="metric-cell metric-cell--critical">
              <div className="metric-cell-icon"><AlertCircle size={20} /></div>
              <div className="metric-cell-body">
                <span className="metric-cell-value">{(counts.critica || 0).toLocaleString('es-EC')}</span>
                <span className="metric-cell-label">Crítico en cola</span>
              </div>
            </div>
          </div>

          <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Cola de alertas operativas</div>
                  <div className="card-subtitle">
                    <strong>
                      Mostrando {shownInTable.toLocaleString('es-EC')} de {universoParaTexto.toLocaleString('es-EC')} casos
                    </strong>
                    {' '}en radar · Cola asignada esta semana: {colaSemanal.toLocaleString('es-EC')} casos
                    {hasFilters ? ` · Filtro activo: ${visibleRows.toLocaleString('es-EC')} visibles` : ''}
                    {displayLimit < colaSemanal ? ` · Vista limitada a ${displayLimit} filas` : ''}
                  </div>
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
                  <option value="alta">Alta ({counts.alta || 0})</option>
                  <option value="critica">Crítica ({counts.critica || 0})</option>
                </select>
                <select className="filter-select" value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}>
                  <option value="">Todos los tipos</option>
                  {tipos.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                {filteredAlerts.length === 0 ? (
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
                          <th>Alerta</th>
                          <th>Tipo</th>
                          <th>Prioridad</th>
                          <th>Score</th>
                          <th>Fecha</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAlerts.map((alert) => {
                          const pClass = priorityClass(alert.prioridad);
                          return (
                            <tr
                              key={alert.id}
                              className="data-table-row--clickable"
                              onClick={() => navigate(`/socios/${alert.socio_id}`)}
                            >
                              <td className="cell-strong">{alert.socio_nombre}</td>
                              <td className="cell-muted" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={alert.mensaje}>{alert.mensaje || '—'}</td>
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
    </div>
  );
}

export default function AlertsPanel() {
  return <AlertsPanelStandard />;
}
