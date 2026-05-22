import { useState } from 'react';
import {
  Users, CreditCard, DollarSign, TrendingUp, Briefcase, User,
  GraduationCap, Home, Calendar, Award, Heart,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area,
  Legend, CartesianGrid, LineChart, Line,
} from 'recharts';
import { COOP, CHART_GRID, CHART_AXIS } from '../theme';

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
      {payload.map((entry, i) => {
        let valStr = entry.value;
        if (typeof entry.value === 'number') {
          if (entry.name?.includes('$') || entry.name?.includes('Monto')) {
            valStr = formatCurrency(entry.value);
          } else if (entry.name?.includes('%') || entry.name?.toLowerCase().includes('tasa')) {
            valStr = `${entry.value.toFixed(1)}%`;
          } else {
            valStr = formatNumber(entry.value);
          }
        }
        return (
          <p key={i} style={{ color: entry.color, fontSize: 12, margin: '2px 0' }}>
            {entry.name}: {valStr}
          </p>
        );
      })}
    </div>
  );
};

function moraBarColor(tasa) {
  if (tasa > 20) return 'var(--riesgo-critico)';
  if (tasa > 12) return 'var(--riesgo-alto)';
  if (tasa > 5) return 'var(--riesgo-medio)';
  return 'var(--riesgo-bajo)';
}

export default function DashboardExtendedStats({ extendedStats, loading = false }) {
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [activeTab, setActiveTab] = useState('portfolio');

  // Sorting for Activities table
  const [actSortField, setActSortField] = useState('total_monto');
  const [actSortDir, setActSortDir] = useState('desc');

  const handleSortAct = (field) => {
    if (actSortField === field) {
      setActSortDir(actSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setActSortField(field);
      setActSortDir('desc');
    }
  };

  const sortedActivities = [...(extendedStats?.mora_por_actividad || [])].sort((a, b) => {
    let aVal = a[actSortField];
    let bVal = b[actSortField];
    if (typeof aVal === 'string') {
      return actSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    aVal = aVal || 0;
    bVal = bVal || 0;
    return actSortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // Sorting for Destinos table
  const [destSortField, setDestSortField] = useState('total_monto');
  const [destSortDir, setDestSortDir] = useState('desc');

  const handleSortDest = (field) => {
    if (destSortField === field) {
      setDestSortDir(destSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setDestSortField(field);
      setDestSortDir('desc');
    }
  };

  const sortedDestinos = [...(extendedStats?.mora_por_destino || [])].sort((a, b) => {
    let aVal = a[destSortField];
    let bVal = b[destSortField];
    if (typeof aVal === 'string') {
      return destSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    aVal = aVal || 0;
    bVal = bVal || 0;
    return destSortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // Helper to render beautiful interactive headers
  const renderSortableHeader = (label, field, currentField, currentDir, onSort, align = 'left', width) => {
    const isSorted = currentField === field;
    const arrow = isSorted ? (currentDir === 'asc' ? ' ▲' : ' ▼') : ' ↕';
    return (
      <th 
        onClick={() => onSort(field)}
        style={{ 
          cursor: 'pointer', 
          textAlign: align, 
          width: width,
          userSelect: 'none',
          whiteSpace: 'nowrap',
          transition: 'all 0.2s ease',
          background: isSorted ? 'rgba(0, 150, 64, 0.08)' : 'transparent',
          borderBottom: isSorted ? '2px solid var(--coop-acento-dorado)' : 'none'
        }}
        className="sortable-header"
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: align === 'center' ? 'center' : (align === 'right' ? 'flex-end' : 'flex-start'), width: '100%' }}>
          {label}
          <span style={{ 
            fontSize: '9px', 
            color: isSorted ? 'var(--coop-acento-dorado)' : 'var(--coop-texto-secundario)',
            opacity: isSorted ? 1 : 0.4,
            transition: 'all 0.2s'
          }}>
            {arrow}
          </span>
        </span>
      </th>
    );
  };

  const hasData = extendedStats && (
    (extendedStats.mora_por_tipo?.length || 0) > 0
    || (extendedStats.mora_por_actividad?.length || 0) > 0
    || (extendedStats.mora_por_zona?.length || 0) > 0
  );

  const sourceLabel = extendedStats?.source === 'production'
    ? 'Dataset de producción'
    : 'Cartera sintética (demo)';

  if (loading) {
    return (
      <section className="dashboard-section dashboard-section--extended" id="estadisticas-avanzadas">
        <div className="section-heading">
          <TrendingUp size={20} className="section-heading-icon" />
          <div>
            <h2>Estadísticas avanzadas de cartera</h2>
            <p>Cargando análisis demográfico y tablas de morosidad…</p>
          </div>
        </div>
        <div className="loading-container" style={{ minHeight: 160 }}>
          <div className="spinner" />
        </div>
      </section>
    );
  }

  if (!hasData) {
    return (
      <section className="dashboard-section dashboard-section--extended" id="estadisticas-avanzadas">
        <div className="section-heading">
          <TrendingUp size={20} className="section-heading-icon" />
          <div>
            <h2>Estadísticas avanzadas de cartera</h2>
            <p>No hay créditos activos para analizar. Inicie el backend con <code>python start.py</code>.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="dashboard-section dashboard-section--extended" id="estadisticas-avanzadas">
        <div className="section-heading">
          <TrendingUp size={20} className="section-heading-icon" />
          <div>
            <h2>Estadísticas avanzadas de cartera</h2>
            <p>Portafolio, perfil demográfico y comportamiento crediticio · <span className="extended-source-badge">{sourceLabel}</span></p>
          </div>
        </div>

      {/* Selector de Pestañas Premium */}
      <div className="stats-tabs animate-in">
        <button 
          className={`tab-btn ${activeTab === 'portfolio' ? 'active' : ''}`}
          onClick={() => setActiveTab('portfolio')}
        >
          <TrendingUp size={16} />
          Portafolio y Geografía
        </button>
        <button 
          className={`tab-btn ${activeTab === 'demographic' ? 'active' : ''}`}
          onClick={() => setActiveTab('demographic')}
        >
          <Users size={16} />
          Perfil Demográfico
        </button>
        <button 
          className={`tab-btn ${activeTab === 'behavior' ? 'active' : ''}`}
          onClick={() => setActiveTab('behavior')}
        >
          <CreditCard size={16} />
          Comportamiento Crediticio
        </button>
      </div>

      {/* PESTAÑA 1: PORTAFOLIO Y GEOGRAFÍA */}
      {activeTab === 'portfolio' && (
        <div className="animate-in" style={{ animationDelay: '0.1s' }}>
          {/* Advanced Charts Grid 1 */}
          <div className="chart-grid-three">
            <div className="card animate-in">
              <div className="card-header">
                <div>
                  <div className="card-title">Mora por Tipo de Crédito</div>
                  <div className="card-subtitle">Volumen de mora y tasa de morosidad por cartera</div>
                </div>
                <CreditCard size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={extendedStats?.mora_por_tipo || []} margin={{ bottom: 10 }}>
                  <defs>
                    <linearGradient id="colorMontoMora" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--accent-2)" stopOpacity={0.2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="tipo_cartera" tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={formatCurrency} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={(tick) => `${tick}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar yAxisId="left" dataKey="mora_monto" name="Monto en Mora ($)" fill="url(#colorMontoMora)" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="tasa_mora_monto" name="Tasa de Mora (%)" fill="var(--riesgo-critico)" radius={[4, 4, 0, 0]} opacity={0.7} />
                  <Legend verticalAlign="top" height={36} formatter={(value) => <span style={{ color: 'var(--coop-texto-secundario)', fontSize: 12 }}>{value}</span>} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card animate-in">
              <div className="card-header">
                <div>
                  <div className="card-title">Mora por Zona Geográfica</div>
                  <div className="card-subtitle">Análisis de morosidad y saldo en mora por región</div>
                </div>
                <TrendingUp size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={extendedStats?.mora_por_zona || []} margin={{ bottom: 10 }}>
                  <defs>
                    <linearGradient id="colorZonaMora" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.2} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="zona" tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={formatCurrency} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={(tick) => `${tick}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar yAxisId="left" dataKey="mora_monto" name="Monto en Mora ($)" fill="url(#colorZonaMora)" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="tasa_mora_monto" name="Tasa de Mora (%)" fill="var(--danger)" radius={[4, 4, 0, 0]} opacity={0.7} />
                  <Legend verticalAlign="top" height={36} formatter={(value) => <span style={{ color: 'var(--coop-texto-secundario)', fontSize: 12 }}>{value}</span>} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card animate-in">
              <div className="card-header">
                <div>
                  <div className="card-title">Mora por Rango de Monto</div>
                  <div className="card-subtitle">Análisis de morosidad según el volumen del crédito otorgado</div>
                </div>
                <DollarSign size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={extendedStats?.mora_por_rango_monto || []} margin={{ bottom: 10 }}>
                  <defs>
                    <linearGradient id="colorRangoMora" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--warning)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--warning)" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="rango" tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={(tick) => `${tick}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="tasa_mora_monto" name="Tasa de Morosidad (%)" stroke="var(--warning)" fill="url(#colorRangoMora)" strokeWidth={2} dot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Advanced Charts Grid 2 */}
          <div className="chart-grid">
            <div className="card animate-in" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      {showAllActivities ? "Actividades Económicas (Vista Completa)" : "Top 5 Actividades con Mayor Exposición"}
                    </div>
                    <div className="card-subtitle">
                      {showAllActivities 
                        ? "Listado detallado de todos los sectores con operaciones activas"
                        : "Sectores económicos clave con mayor número de operaciones activas"}
                    </div>
                  </div>
                  <Briefcase size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
                </div>
                <div className="table-container" style={{ marginTop: 10, maxHeight: showAllActivities ? '380px' : 'none', overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        {renderSortableHeader('Actividad Económica', 'actividad', actSortField, actSortDir, handleSortAct)}
                        {renderSortableHeader('Total Ops', 'total_ops', actSortField, actSortDir, handleSortAct, 'right')}
                        {renderSortableHeader('Cartera Total', 'total_monto', actSortField, actSortDir, handleSortAct, 'right')}
                        {renderSortableHeader('Ops en Mora', 'mora_ops', actSortField, actSortDir, handleSortAct, 'right')}
                        {renderSortableHeader('Tasa Morosidad', 'tasa_mora_monto', actSortField, actSortDir, handleSortAct, 'center', '160px')}
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllActivities 
                        ? sortedActivities
                        : sortedActivities.slice(0, 5)
                      ).map((act, i) => {
                        const barColor = moraBarColor(act.tasa_mora_monto);

                        return (
                          <tr key={i} style={{ cursor: 'default' }}>
                            <td className="cell-strong" style={{ fontSize: 13, whiteSpace: 'normal', maxWidth: '240px' }}>{act.actividad}</td>
                            <td className="cell-muted" style={{ textAlign: 'right' }}>{formatNumber(act.total_ops)}</td>
                            <td className="cell-strong" style={{ textAlign: 'right' }}>{formatCurrency(act.total_monto)}</td>
                            <td className="cell-strong" style={{ textAlign: 'right', color: 'var(--riesgo-critico)' }}>{formatNumber(act.mora_ops)}</td>
                            <td>
                              <div className="risk-bar" style={{ justifyContent: 'center' }}>
                                <div className="risk-bar-track" style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, maxWidth: '100px', flex: 1 }}>
                                  <div 
                                    className="risk-bar-fill" 
                                    style={{ 
                                      width: `${Math.min(100, act.tasa_mora_monto * 3.5)}%`, 
                                      background: barColor, 
                                      height: '100%', 
                                      borderRadius: 4 
                                    }} 
                                  />
                                </div>
                                <span className="risk-bar-value" style={{ fontSize: 12, fontWeight: 700, color: barColor, minWidth: '42px', textAlign: 'right' }}>
                                  {act.tasa_mora_monto}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                <button 
                  onClick={() => setShowAllActivities(!showAllActivities)}
className="btn-coop-secondary toggle-stats-btn"
                >
                  {showAllActivities ? 'Mostrar Menos (Top 5)' : `Ver Todas (${extendedStats?.mora_por_actividad?.length || 0} Actividades)`}
                </button>
              </div>
            </div>

            <div className="card animate-in" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div className="card-header" style={{ marginBottom: 12 }}>
                  <div>
                    <div className="card-title">Distribución por Género</div>
                    <div className="card-subtitle">Comportamiento e impacto de la cartera por sexo del socio</div>
                  </div>
                  <User size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 16 }}>
                  {extendedStats?.por_genero?.map((g, i) => {
                    const isFem = g.genero === "Femenino";
                    const genderColor = isFem ? '#ec4899' : '#3b82f6';
                    const genderBg = isFem ? 'rgba(236,72,153,0.1)' : 'rgba(59,130,246,0.1)';
                    
                    return (
                      <div key={i} style={{ 
                        background: 'rgba(255,255,255,0.02)', 
                        border: '1px solid rgba(255,255,255,0.04)', 
                        borderRadius: '12px', 
                        padding: '16px',
                        transition: 'var(--transition)',
                      }}
                      className="gender-card"
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ 
                              width: 32, 
                              height: 32, 
                              borderRadius: '8px', 
                              background: genderBg, 
                              color: genderColor,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: 14
                            }}>
                              {isFem ? '♀' : '♂'}
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--coop-texto-principal)' }}>{g.genero}</div>
                              <div style={{ fontSize: 11, color: 'var(--coop-texto-secundario)' }}>{formatNumber(g.total_ops)} operaciones</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--coop-texto-principal)' }}>{formatCurrency(g.total_monto)}</div>
                            <div style={{ fontSize: 11, color: 'var(--coop-texto-secundario)' }}>Monto colocado</div>
                          </div>
                        </div>
                        
                        <div style={{ marginTop: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                            <span style={{ color: 'var(--coop-texto-secundario)' }}>Ops en Mora: <strong style={{ color: 'var(--riesgo-critico)' }}>{formatNumber(g.mora_ops)}</strong></span>
                            <span style={{ fontWeight: 700, color: genderColor }}>Tasa Mora: {g.tasa_mora_monto}%</span>
                          </div>
                          <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ 
                              width: `${Math.min(100, g.tasa_mora_monto * 4.5)}%`, 
                              background: `linear-gradient(90deg, ${genderColor}, var(--riesgo-critico))`, 
                              height: '100%', 
                              borderRadius: 3 
                            }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div style={{ 
                marginTop: 20, 
                padding: '12px 14px', 
                background: 'var(--success-bg)', 
                border: '1px solid rgba(16,185,129,0.15)', 
                borderRadius: '10px',
                fontSize: '11px',
                color: 'var(--success)',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <span>✨</span>
                <span><strong>Nota de Riesgo:</strong> La cartera femenina presenta excelente comportamiento en pagos y menor tasa de mora en general.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: PERFIL DEMOGRÁFICO */}
      {activeTab === 'demographic' && (
        <div className="animate-in" style={{ animationDelay: '0.1s' }}>
          <div className="chart-grid">
            {/* Estado Civil */}
            <div className="card animate-in">
              <div className="card-header">
                <div>
                  <div className="card-title">Riesgo por Estado Civil</div>
                  <div className="card-subtitle">Morosidad y colocación según el estado civil del socio</div>
                </div>
                <Heart size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={extendedStats?.mora_por_estado_civil || []} margin={{ left: 10, right: 10, bottom: 5 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="estado_civil" tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={formatCurrency} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={(tick) => `${tick}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar yAxisId="left" dataKey="total_monto" name="Monto Colocado ($)" fill="var(--accent)" radius={[4, 4, 0, 0]} opacity={0.8} />
                  <Bar yAxisId="right" dataKey="tasa_mora_monto" name="Tasa Mora (%)" fill="var(--danger)" radius={[4, 4, 0, 0]} />
                  <Legend verticalAlign="top" height={36} formatter={(value) => <span style={{ color: 'var(--coop-texto-secundario)', fontSize: 12 }}>{value}</span>} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Cargas Familiares */}
            <div className="card animate-in">
              <div className="card-header">
                <div>
                  <div className="card-title">Impacto por Cargas Familiares</div>
                  <div className="card-subtitle">Relación entre número de dependientes y tasa de morosidad</div>
                </div>
                <Users size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={extendedStats?.mora_por_cargas || []} margin={{ left: 10, right: 10, bottom: 5 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="cargas" padding={{ left: 30, right: 30 }} tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={(tick) => `${tick}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="tasa_mora_monto" name="Tasa Mora (%)" stroke="var(--riesgo-critico)" strokeWidth={3} activeDot={{ r: 6 }} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-grid-three" style={{ marginTop: 24 }}>
            {/* Edad */}
            <div className="card animate-in">
              <div className="card-header">
                <div>
                  <div className="card-title">Mora por Rangos de Edad</div>
                  <div className="card-subtitle">Comportamiento según el ciclo de vida del socio</div>
                </div>
                <Calendar size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={extendedStats?.mora_por_edad || []}>
                  <defs>
                    <linearGradient id="colorEdadMora" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ec4899" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="rango_edad" tick={{ fontSize: 10, fill: 'var(--coop-texto-secundario)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={(tick) => `${tick}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="tasa_mora_monto" name="Tasa Mora (%)" stroke="#ec4899" fill="url(#colorEdadMora)" strokeWidth={2} dot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Nivel Educativo */}
            <div className="card animate-in">
              <div className="card-header">
                <div>
                  <div className="card-title">Mora por Nivel Educativo</div>
                  <div className="card-subtitle">Comportamiento de pago según grado de instrucción</div>
                </div>
                <GraduationCap size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={extendedStats?.mora_por_educacion || []}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="nivel_educativo" tick={{ fontSize: 9, fill: 'var(--coop-texto-secundario)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={(tick) => `${tick}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="tasa_mora_monto" name="Tasa Mora (%)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Tipo de Vivienda */}
            <div className="card animate-in">
              <div className="card-header">
                <div>
                  <div className="card-title">Mora por Tipo de Vivienda</div>
                  <div className="card-subtitle">Relación entre tenencia de vivienda y morosidad</div>
                </div>
                <Home size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={extendedStats?.mora_por_vivienda || []}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="tipo_vivienda" tick={{ fontSize: 10, fill: 'var(--coop-texto-secundario)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={(tick) => `${tick}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="tasa_mora_monto" name="Tasa Mora (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}

      {/* PESTAÑA 3: COMPORTAMIENTO CREDITICIO */}
      {activeTab === 'behavior' && (
        <div className="animate-in" style={{ animationDelay: '0.1s' }}>
          {/* Destinos de Crédito y Cuotas */}
          <div className="chart-grid">
            {/* Destino del Crédito Table */}
            <div className="card animate-in" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div className="card-header">
                  <div>
                    <div className="card-title">Mora por Destino del Crédito (Alta Exposición)</div>
                    <div className="card-subtitle">Tasa de mora y volumen en los principales fines declarados del crédito</div>
                  </div>
                  <Briefcase size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
                </div>
                <div className="table-container" style={{ marginTop: 12 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        {renderSortableHeader('Destino Final', 'destino', destSortField, destSortDir, handleSortDest)}
                        {renderSortableHeader('Total Ops', 'total_ops', destSortField, destSortDir, handleSortDest, 'right')}
                        {renderSortableHeader('Monto Colocado', 'total_monto', destSortField, destSortDir, handleSortDest, 'right')}
                        {renderSortableHeader('Morosidad', 'tasa_mora_monto', destSortField, destSortDir, handleSortDest, 'center', '150px')}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDestinos.map((dest, i) => {
                        const barColor = moraBarColor(dest.tasa_mora_monto);

                        return (
                          <tr key={i} style={{ cursor: 'default' }}>
                            <td style={{ fontWeight: 600, fontSize: 12, color: 'var(--coop-texto-principal)', whiteSpace: 'normal', maxWidth: '220px' }}>{dest.destino}</td>
                            <td style={{ textAlign: 'right', color: 'var(--coop-texto-secundario)', fontSize: 12 }}>{formatNumber(dest.total_ops)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--coop-texto-principal)', fontWeight: 500, fontSize: 12 }}>{formatCurrency(dest.total_monto)}</td>
                            <td>
                              <div className="risk-bar" style={{ justifyContent: 'center' }}>
                                <div className="risk-bar-track" style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, maxWidth: '80px', flex: 1 }}>
                                  <div 
                                    className="risk-bar-fill" 
                                    style={{ 
                                      width: `${Math.min(100, dest.tasa_mora_monto * 2.5)}%`, 
                                      background: barColor, 
                                      height: '100%', 
                                      borderRadius: 3 
                                    }} 
                                  />
                                </div>
                                <span className="risk-bar-value" style={{ fontSize: 11, fontWeight: 700, color: barColor, minWidth: '38px', textAlign: 'right' }}>
                                  {dest.tasa_mora_monto}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Plazo en Cuotas */}
            <div className="card animate-in">
              <div className="card-header">
                <div>
                  <div className="card-title">Mora según Plazo del Crédito (Cuotas)</div>
                  <div className="card-subtitle">Relación entre la cantidad de cuotas pactadas y el índice de mora</div>
                </div>
                <Calendar size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={extendedStats?.mora_por_cuotas || []} margin={{ left: 10, right: 10, bottom: 5 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="rango_cuotas" tick={{ fontSize: 10, fill: 'var(--coop-texto-secundario)' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={formatNumber} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={(tick) => `${tick}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar yAxisId="left" dataKey="total_ops" name="Total Operaciones" fill="#6366f1" radius={[4, 4, 0, 0]} opacity={0.8} />
                  <Bar yAxisId="right" dataKey="tasa_mora_monto" name="Tasa Mora (%)" fill="var(--riesgo-critico)" radius={[4, 4, 0, 0]} />
                  <Legend verticalAlign="top" height={36} formatter={(value) => <span style={{ color: 'var(--coop-texto-secundario)', fontSize: 12 }}>{value}</span>} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Calificación de Riesgo, Ingresos y Día de Pago */}
          <div className="chart-grid-three" style={{ marginTop: 24 }}>
            {/* Calificación */}
            <div className="card animate-in">
              <div className="card-header">
                <div>
                  <div className="card-title">Mora por Calificación Interna</div>
                  <div className="card-subtitle">Evaluación de mora según la calificación oficial</div>
                </div>
                <Award size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={extendedStats?.mora_por_calificacion || []}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="calificacion" tick={{ fontSize: 9, fill: 'var(--coop-texto-secundario)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={(tick) => `${tick}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="tasa_mora_monto" name="Tasa Mora (%)" fill="var(--riesgo-critico)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Ingresos Socio */}
            <div className="card animate-in">
              <div className="card-header">
                <div>
                  <div className="card-title">Mora por Nivel de Ingresos</div>
                  <div className="card-subtitle">Comportamiento según el salario reportado por el socio</div>
                </div>
                <DollarSign size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={extendedStats?.mora_por_ingresos || []}>
                  <defs>
                    <linearGradient id="colorIngresosMora" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--warning)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--warning)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="rango_ingresos" tick={{ fontSize: 9, fill: 'var(--coop-texto-secundario)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={(tick) => `${tick}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="tasa_mora_monto" name="Tasa Mora (%)" stroke="var(--warning)" fill="url(#colorIngresosMora)" strokeWidth={2} dot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Día de Pago */}
            <div className="card animate-in">
              <div className="card-header">
                <div>
                  <div className="card-title">Mora por Ventana / Día de Pago</div>
                  <div className="card-subtitle">Relación entre el día de cobro mensual y la morosidad</div>
                </div>
                <Calendar size={18} style={{ color: 'var(--coop-texto-secundario)' }} />
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={extendedStats?.mora_por_dia_pago || []}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="dia_pago" tick={{ fontSize: 9, fill: 'var(--coop-texto-secundario)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--coop-texto-secundario)' }} tickFormatter={(tick) => `${tick}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="tasa_mora_monto" name="Tasa Mora (%)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      </section>
    </>
  );
}
