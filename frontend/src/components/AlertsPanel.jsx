import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Search, Filter, Cpu, Brain, CheckCircle,
  TrendingUp, Sparkles, UserCheck, Phone, Mail, Clock, ShieldAlert,
  Loader, Check, AlertCircle, Building
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

// Mapeo ecuatoriano de cédula por provincia
function getProvinceByCedula(cedula) {
  if (!cedula || cedula.length < 2) return '';
  const code = cedula.substring(0, 2);
  const provinces = {
    '01': 'Azuay',
    '02': 'Bolívar',
    '03': 'Cañar',
    '04': 'Carchi',
    '05': 'Cotopaxi',
    '06': 'Chimborazo',
    '07': 'El Oro',
    '08': 'Esmeraldas',
    '09': 'Guayas',
    '10': 'Imbabura',
    '11': 'Loja',
    '12': 'Los Ríos',
    '13': 'Manabí',
    '14': 'Morona Santiago',
    '15': 'Napo',
    '16': 'Pastaza',
    '17': 'Pichincha (Quito)',
    '18': 'Tungurahua',
    '19': 'Zamora Chinchipe',
    '20': 'Galápagos',
    '21': 'Sucumbíos',
    '22': 'Orellana',
    '23': 'Santo Domingo',
    '24': 'Santa Elena'
  };
  return provinces[code] || 'Nacional';
}

// Cálculo de días restantes desde la fecha actual simulada (2026-05-21)
function getDaysRemaining(targetDateStr) {
  const today = new Date('2026-05-21');
  const target = new Date(targetDateStr);
  const diffTime = target - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export default function AlertsPanel() {
  const navigate = useNavigate();
  
  // Tabs state
  const [activeTab, setActiveTab] = useState('ia-radar'); // 'ia-radar' | 'cobranza-preventiva'
  
  // Data state
  const [alerts, setAlerts] = useState([]);
  const [preventiveAlerts, setPreventiveAlerts] = useState([]);
  const [totalCounts, setTotalCounts] = useState({ alta: 0, media: 0, baja: 0 });
  const [modelInfo, setModelInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Row saving states for concurrent actions
  const [savingRows, setSavingRows] = useState({}); // { [pagoId]: 'saving' | 'success' | 'error' }

  // Tab 1 filters
  const [search, setSearch] = useState('');
  const [prioridadFilter, setPrioridadFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');

  // Tab 2 filters
  const [prevSearch, setPrevSearch] = useState('');
  const [prevRiskFilter, setPrevRiskFilter] = useState('');
  const [prevGestionFilter, setPrevGestionFilter] = useState('');
  const [prevAgencyFilter, setPrevAgencyFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    
    Promise.all([
      alertsAPI.getAll().catch(() => []),
      alertsAPI.getPreventiveAlerts().catch(() => []),
      modelAPI.getInfo().catch(() => null),
    ]).then(([alertsData, preventiveData, modelData]) => {
      if (cancelled) return;
      
      const list = Array.isArray(alertsData) ? alertsData : (alertsData?.alerts || []);
      setAlerts(list);
      
      if (alertsData && !Array.isArray(alertsData) && alertsData.total_counts) {
        setTotalCounts(alertsData.total_counts);
      } else {
        setTotalCounts({
          alta: list.filter((a) => a.prioridad === 'alta' || a.prioridad === 'critica').length,
          media: list.filter((a) => a.prioridad === 'media').length,
          baja: list.filter((a) => a.prioridad === 'baja').length,
        });
      }
      
      const prevList = Array.isArray(preventiveData) ? preventiveData : [];
      setPreventiveAlerts(prevList);
      
      setModelInfo(modelData);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    
    return () => { cancelled = true; };
  }, []);

  // Handler to register a preventive action
  const handleActionChange = async (pagoId, selectedValue) => {
    setSavingRows(prev => ({ ...prev, [pagoId]: 'saving' }));
    try {
      await alertsAPI.savePreventiveAction(pagoId, selectedValue);
      
      // Update local state dynamically
      setPreventiveAlerts(prev => 
        prev.map(item => item.pago_id === pagoId ? { ...item, accion_preventiva: selectedValue } : item)
      );
      
      setSavingRows(prev => ({ ...prev, [pagoId]: 'success' }));
      
      // Clear success indicator after 2.5s
      setTimeout(() => {
        setSavingRows(prev => {
          const copy = { ...prev };
          delete copy[pagoId];
          return copy;
        });
      }, 2500);
    } catch (err) {
      console.error('Error saving preventive action:', err);
      setSavingRows(prev => ({ ...prev, [pagoId]: 'error' }));
    }
  };

  // Process unique types for Tab 1
  const tipos = [...new Set(alerts.map((a) => a.tipo).filter(Boolean))];

  // Process unique agencies for Tab 2
  const agencies = [...new Set(preventiveAlerts.map(a => a.socio_agencia).filter(Boolean))].sort();

  // Filter Tab 1 (Radar de IA)
  const filteredAlerts = alerts.filter((alert) => {
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

  // Filter Tab 2 (Cobranza Preventiva)
  const filteredPreventive = preventiveAlerts.filter((item) => {
    const q = prevSearch.toLowerCase();
    const matchesSearch = !q
      || item.socio_nombre?.toLowerCase().includes(q)
      || item.socio_cedula?.includes(q)
      || item.socio_agencia?.toLowerCase().includes(q);
      
    const matchesRisk = !prevRiskFilter || item.risk_level === prevRiskFilter;
    const matchesAgency = !prevAgencyFilter || item.socio_agencia === prevAgencyFilter;
    
    let matchesGestion = true;
    if (prevGestionFilter === 'sin_gestionar') {
      matchesGestion = !item.accion_preventiva || item.accion_preventiva === 'Ninguna' || item.accion_preventiva === '';
    } else if (prevGestionFilter === 'gestionados') {
      matchesGestion = item.accion_preventiva && item.accion_preventiva !== 'Ninguna' && item.accion_preventiva !== '';
    } else if (prevGestionFilter) {
      matchesGestion = item.accion_preventiva === prevGestionFilter;
    }
    
    return matchesSearch && matchesRisk && matchesAgency && matchesGestion;
  });

  // Tab 1 counts
  const counts = totalCounts;

  // Tab 2 metrics
  const totalPreventiveCount = preventiveAlerts.length;
  const pendingPreventiveCount = preventiveAlerts.filter(a => !a.accion_preventiva || a.accion_preventiva === 'Ninguna' || a.accion_preventiva === '').length;
  const managedPreventiveCount = totalPreventiveCount - pendingPreventiveCount;
  const gestionPercentage = totalPreventiveCount > 0 ? (managedPreventiveCount / totalPreventiveCount) * 100 : 0;
  const totalRiskVolume = preventiveAlerts.reduce((sum, item) => sum + (item.monto_esperado || 0), 0);

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
        <p>Monitoreo inteligente de desvíos, predicciones Radar-Mora y cobranza preventiva activa.</p>
      </div>

      {/* Selector de Pestañas estilizado Coop */}
      <div className="stats-tabs" style={{ marginBottom: 24 }}>
        <button 
          className={`tab-btn ${activeTab === 'ia-radar' ? 'active' : ''}`}
          onClick={() => setActiveTab('ia-radar')}
        >
          <Brain size={16} /> Radar de IA y Desvíos Conductuales
        </button>
        <button 
          className={`tab-btn ${activeTab === 'cobranza-preventiva' ? 'active' : ''}`}
          onClick={() => setActiveTab('cobranza-preventiva')}
        >
          <Sparkles size={16} /> Tablero de Cobranza Preventiva
          {pendingPreventiveCount > 0 && (
            <span className="header-nav-badge" style={{ backgroundColor: 'var(--riesgo-critico)', marginLeft: 8 }}>
              {pendingPreventiveCount}
            </span>
          )}
        </button>
      </div>

      {/* CONTENIDO PESTAÑA 1: RADAR DE IA EXISTENTE */}
      {activeTab === 'ia-radar' && (
        <>
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
                  <div className="card-title">Panel de alertas activas ({filteredAlerts.length})</div>
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
                              <td className="cell-muted" style={{ maxWidth: 280 }}>{alert.mensaje || '—'}</td>
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


            </div>
          </div>
        </>
      )}

      {/* CONTENIDO PESTAÑA 2: TABLERO DE GESTIÓN PREVENTIVA [NUEVO] */}
      {activeTab === 'cobranza-preventiva' && (
        <>
          {/* Tarjetas KPI para la Cobranza Preventiva */}
          <div className="metrics-panel metrics-panel--compact" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="metric-cell metric-cell--critical">
              <div className="metric-cell-icon"><Clock size={20} /></div>
              <div className="metric-cell-body">
                <span className="metric-cell-value">{pendingPreventiveCount}</span>
                <span className="metric-cell-label">Cuotas por Gestionar</span>
              </div>
            </div>
            
            <div className="metric-cell metric-cell--warn">
              <div className="metric-cell-icon"><TrendingUp size={20} /></div>
              <div className="metric-cell-body">
                <span className="metric-cell-value">
                  ${totalRiskVolume.toLocaleString('es-EC', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
                <span className="metric-cell-label">Volumen Total en Riesgo</span>
              </div>
            </div>

            <div className="metric-cell metric-cell--green">
              <div className="metric-cell-icon"><CheckCircle size={20} /></div>
              <div className="metric-cell-body">
                <span className="metric-cell-value">{gestionPercentage.toFixed(1)}%</span>
                <span className="metric-cell-label">Cobertura Preventiva</span>
              </div>
            </div>

            <div className="metric-cell" style={{ borderLeft: '1px solid rgba(0, 104, 55, 0.12)' }}>
              <div className="metric-cell-icon" style={{ color: 'var(--coop-verde-oscuro)', background: 'rgba(0,104,55,0.08)' }}><Building size={20} /></div>
              <div className="metric-cell-body">
                <span className="metric-cell-value">{totalPreventiveCount - pendingPreventiveCount} / {totalPreventiveCount}</span>
                <span className="metric-cell-label">Pagos Contactados</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ borderTopColor: 'var(--coop-verde-primario)' }}>
            <div className="card-header">
              <div>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldAlert size={18} style={{ color: 'var(--riesgo-alto)' }} />
                  Radar de Cobranza Preventiva (Próximos 15 Días)
                </div>
                <div className="card-subtitle">
                  Mostrando {filteredPreventive.length} pagos pendientes con vencimiento del 22 de Mayo al 6 de Junio de 2026 para socios en riesgo Crítico o Alto.
                </div>
              </div>
              <span className="logo-badge" style={{ backgroundColor: 'var(--coop-verde-primario)' }}>
                IA PROACTIVA
              </span>
            </div>

            {/* Barra de Filtros Avanzada para Gestión Preventiva */}
            <div className="filters-bar" style={{ marginBottom: 20 }}>
              <Filter size={16} style={{ color: 'var(--coop-texto-secundario)', alignSelf: 'center' }} />
              
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--coop-texto-secundario)' }} />
                <input
                  className="filter-input"
                  style={{ paddingLeft: 40, width: '100%' }}
                  placeholder="Buscar socio, cédula o agencia..."
                  value={prevSearch}
                  onChange={(e) => setPrevSearch(e.target.value)}
                />
              </div>

              <select 
                className="filter-select" 
                value={prevRiskFilter} 
                onChange={(e) => setPrevRiskFilter(e.target.value)}
              >
                <option value="">Riesgo (Todos)</option>
                <option value="Crítico">Riesgo Crítico</option>
                <option value="Alto">Riesgo Alto</option>
              </select>

              <select 
                className="filter-select" 
                value={prevGestionFilter} 
                onChange={(e) => setPrevGestionFilter(e.target.value)}
              >
                <option value="">Gestión (Todos)</option>
                <option value="sin_gestionar">Sin Gestionar</option>
                <option value="gestionados">Gestionados</option>
                <option value="SMS Enviado">SMS Enviado</option>
                <option value="Llamada - Promesa de Pago">Llamada - Promesa</option>
                <option value="Llamada - Sin respuesta">Llamada - Sin respuesta</option>
                <option value="Visita de campo">Visita de campo</option>
              </select>

              <select 
                className="filter-select" 
                value={prevAgencyFilter} 
                onChange={(e) => setPrevAgencyFilter(e.target.value)}
              >
                <option value="">Agencia (Todas)</option>
                {agencies.map(agency => (
                  <option key={agency} value={agency}>{agency}</option>
                ))}
              </select>
            </div>

            {/* Listado / Tabla Principal de Pagos */}
            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
              {filteredPreventive.length === 0 ? (
                <div className="empty-state" style={{ padding: '80px 20px' }}>
                  <UserCheck size={48} style={{ color: 'var(--coop-verde-primario)', opacity: 0.5 }} />
                  <p style={{ marginTop: 16, fontSize: 16 }}>Excelente. No hay cuotas pendientes que coincidan con los filtros aplicados.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Socio / Cédula / Provincia</th>
                        <th>Riesgo IA</th>
                        <th>Vencimiento</th>
                        <th>Detalle Cuota</th>
                        <th>Agencia</th>
                        <th>Canales de Contacto</th>
                        <th style={{ width: '220px' }}>Acción Preventiva</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPreventive.map((item) => {
                        const daysLeft = getDaysRemaining(item.fecha_esperada);
                        
                        // Determinar urgencia del vencimiento
                        let urgencyClass = 'badge bajo';
                        let urgencyLabel = `En ${daysLeft} días`;
                        if (daysLeft <= 0) {
                          urgencyClass = 'badge critico';
                          urgencyLabel = 'Vence hoy / Vencido';
                        } else if (daysLeft <= 3) {
                          urgencyClass = 'badge critico';
                          urgencyLabel = `Urgente: ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`;
                        } else if (daysLeft <= 7) {
                          urgencyClass = 'badge medio';
                          urgencyLabel = `Próximo: ${daysLeft} días`;
                        } else {
                          urgencyClass = 'badge bajo';
                        }

                        const isSaving = savingRows[item.pago_id] === 'saving';
                        const isSuccess = savingRows[item.pago_id] === 'success';
                        const isError = savingRows[item.pago_id] === 'error';

                        return (
                          <tr 
                            key={item.pago_id}
                            className="data-table-row--clickable"
                            onClick={() => navigate(`/socios/${item.socio_id}`)}
                          >
                            {/* Socio & Cédula */}
                            <td className="cell-strong">
                              <div style={{ fontWeight: 700, fontSize: '14.5px', color: 'var(--coop-azul-texto)' }}>
                                {item.socio_nombre}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
                                C.I: <span style={{ fontWeight: 600 }}>{item.socio_cedula}</span> • <span style={{ fontStyle: 'italic', color: 'var(--coop-verde-oscuro)' }}>{getProvinceByCedula(item.socio_cedula)}</span>
                              </div>
                            </td>

                            {/* Nivel de Riesgo */}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <span className={`badge ${riskBadgeClass(item.risk_level)}`}>
                                  {item.risk_level}
                                </span>
                                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', paddingLeft: 4 }}>
                                  score: <strong>{item.risk_score}</strong>
                                </span>
                              </div>
                            </td>

                            {/* Vencimiento */}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <span style={{ fontWeight: 600, fontSize: '13px' }}>{item.fecha_esperada}</span>
                                <span className={urgencyClass} style={{ padding: '2px 6px', fontSize: '10.5px', textAlign: 'center' }}>
                                  {urgencyLabel}
                                </span>
                              </div>
                            </td>

                            {/* Detalle Cuota */}
                            <td className="cell-strong" style={{ fontSize: '14px' }}>
                              <div style={{ color: 'var(--coop-verde-oscuro)', fontWeight: 700 }}>
                                ${item.monto_esperado.toLocaleString('es-EC', { minimumFractionDigits: 2 })}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                Cuota N° {item.num_cuota}
                              </div>
                            </td>

                            {/* Agencia */}
                            <td className="cell-muted" style={{ fontWeight: 500 }}>
                              {item.socio_agencia}
                            </td>

                            {/* Canal de Contacto */}
                            <td>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                                <a 
                                  href={`tel:${item.socio_telefono}`}
                                  title={`Llamar a ${item.socio_telefono}`}
                                  className="btn-coop-secondary"
                                  style={{ padding: '6px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px' }}
                                >
                                  <Phone size={14} style={{ color: 'var(--coop-verde-oscuro)' }} />
                                </a>
                                <a 
                                  href={`mailto:${item.socio_email}`}
                                  title={`Enviar correo a ${item.socio_email}`}
                                  className="btn-coop-secondary"
                                  style={{ padding: '6px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px' }}
                                >
                                  <Mail size={14} style={{ color: 'var(--coop-acento-dorado)' }} />
                                </a>
                              </div>
                            </td>

                            {/* Selector de Acción Preventiva (Interactiva) */}
                            <td>
                              <div 
                                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                                onClick={e => e.stopPropagation()} // Evitar navegación al hacer click en el control
                              >
                                <select
                                  className="filter-select"
                                  style={{ 
                                    padding: '6px 12px', 
                                    fontSize: '12.5px', 
                                    minWidth: '160px',
                                    border: isError ? '1.5px solid var(--riesgo-critico)' : '1px solid #ddd',
                                    backgroundColor: item.accion_preventiva && item.accion_preventiva !== 'Ninguna' ? 'rgba(0,150,64,0.06)' : '#fff'
                                  }}
                                  value={item.accion_preventiva || 'Ninguna'}
                                  onChange={(e) => handleActionChange(item.pago_id, e.target.value)}
                                  disabled={isSaving}
                                >
                                  <option value="Ninguna">Sin Gestionar</option>
                                  <option value="SMS Enviado">SMS Enviado</option>
                                  <option value="Llamada - Promesa de Pago">Llamada - Promesa</option>
                                  <option value="Llamada - Sin respuesta">Llamada - Sin Respuesta</option>
                                  <option value="Visita de campo">Visita de Campo</option>
                                </select>

                                {/* Micro-animación de guardado */}
                                <div style={{ minWidth: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {isSaving && (
                                    <Loader size={16} className="spinner" style={{ color: 'var(--coop-acento-dorado)' }} />
                                  )}
                                  {isSuccess && (
                                    <Check size={18} style={{ color: 'var(--riesgo-bajo)', animation: 'spin 0.2s ease' }} />
                                  )}
                                  {isError && (
                                    <AlertCircle size={18} style={{ color: 'var(--riesgo-critico)' }} />
                                  )}
                                </div>
                              </div>
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
        </>
      )}
    </div>
  );
}

