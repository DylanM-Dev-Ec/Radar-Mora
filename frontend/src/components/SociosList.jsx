import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { sociosAPI } from '../services/api';
import { scoreToColor, scoreToLevel } from '../theme';

const getRiskColor = scoreToColor;
const getRiskLevel = scoreToLevel;

export default function SociosList() {
  const navigate = useNavigate();
  const [socios, setSocios] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');
  const [sortBy, setSortBy] = useState('risk_score');
  const limit = 15;

  useEffect(() => {
    setLoading(true);
    const params = { page, limit, sort_by: sortBy };
    if (search) params.search = search;
    if (riskFilter) params.risk_level = riskFilter;
    if (agencyFilter) params.agency = agencyFilter;

    sociosAPI.getAll(params)
      .then(data => {
        setSocios(data.socios || []);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
        setLoading(false);
      })
      .catch(() => {
        setSocios([]);
        setLoading(false);
      });
  }, [page, search, riskFilter, agencyFilter, sortBy]);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <div>
      <div className="page-intro">
        <h1>Directorio de Socios</h1>
        <p>{total} socios registrados · Perfilamiento y score de riesgo Radar-Mora</p>
      </div>

      <div className="filters-bar">
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="filter-input"
            style={{ paddingLeft: 40, width: '100%' }}
            placeholder="Buscar por nombre o cédula..."
            value={search}
            onChange={handleSearch}
          />
        </div>
        <select className="filter-select" value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(1); }}>
          <option value="">Todos los niveles</option>
          <option value="Bajo">🟢 Bajo</option>
          <option value="Medio">🟡 Medio</option>
          <option value="Alto">🟠 Alto</option>
          <option value="Crítico">🔴 Crítico</option>
        </select>
        <select className="filter-select" value={agencyFilter} onChange={e => { setAgencyFilter(e.target.value); setPage(1); }}>
          <option value="">Todas las agencias</option>
          <option value="Tulcán Centro">Tulcán Centro</option>
          <option value="Ibarra">Ibarra</option>
          <option value="San Gabriel">San Gabriel</option>
          <option value="Huaca">Huaca</option>
          <option value="Bolívar">Bolívar</option>
        </select>
        <select className="filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="risk_score">Mayor riesgo</option>
          <option value="nombre">Nombre</option>
          <option value="monto">Monto crédito</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-container">
            <div className="spinner" />
            <div className="loading-text">Cargando socios...</div>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Socio</th>
                    <th>Cédula</th>
                    <th>Agencia</th>
                    <th>Crédito Activo</th>
                    <th>Score de Riesgo</th>
                    <th>Nivel</th>
                    <th>Días Atraso Prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {socios.map(socio => {
                    const score = socio.risk_score || 0;
                    const level = socio.risk_level || getRiskLevel(score);
                    const color = getRiskColor(score);
                    return (
                      <tr key={socio.id} onClick={() => navigate(`/socios/${socio.id}`)}>
                        <td className="cell-strong">{socio.nombre}</td>
                        <td className="cell-muted">{socio.cedula}</td>
                        <td className="cell-muted">{socio.agencia}</td>
                        <td className="cell-strong">${(socio.monto || socio.credito_activo || 0).toLocaleString()}</td>
                        <td>
                          <div className="risk-bar">
                            <div className="risk-bar-track">
                              <div className="risk-bar-fill" style={{ width: `${score}%`, background: color }} />
                            </div>
                            <span className="risk-bar-value" style={{ color }}>{score}</span>
                          </div>
                        </td>
                        <td><span className={`badge ${level.toLowerCase().replace('í','i')}`}>{level}</span></td>
                        <td className="cell-muted">{(socio.dias_atraso_promedio || 0).toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {socios.length === 0 && (
              <div className="empty-state">
                <p>No se encontraron socios con los filtros seleccionados</p>
              </div>
            )}

            {pages > 1 && (
              <div className="pagination">
                <button className="page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                  let pageNum;
                  if (pages <= 7) pageNum = i + 1;
                  else if (page <= 4) pageNum = i + 1;
                  else if (page >= pages - 3) pageNum = pages - 6 + i;
                  else pageNum = page - 3 + i;
                  return (
                    <button key={pageNum} className={`page-btn ${page === pageNum ? 'active' : ''}`} onClick={() => setPage(pageNum)}>
                      {pageNum}
                    </button>
                  );
                })}
                <button className="page-btn" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight size={16} />
                </button>
                <span className="page-info">Página {page} de {pages}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
