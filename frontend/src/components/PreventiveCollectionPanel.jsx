import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, Filter, CheckCircle, TrendingUp, UserCheck, Clock,
  ShieldAlert, Building, Sparkles, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { alertsAPI, getPreventiveItems, getPreventiveTotal, getUniversoRiesgo, getColaSemanal } from '../services/api';
import BusinessContextStrip from './BusinessContextStrip';
import PreventiveVentanaStrip from './PreventiveVentanaStrip';
import PreventiveTableRow from './PreventiveTableRow';
import { isSinGestion } from '../utils/preventiveHelpers';
import { openWhatsAppPreventiva } from '../utils/preventiveContact';

const FECHA_CORTE = '2026-05-21';
const PAGE_SIZE_OPTIONS = [25, 50];
const DEFAULT_PAGE_SIZE = 50;

function gestionParam(gestionFilter) {
  if (!gestionFilter) return undefined;
  return gestionFilter;
}

function PreventiveCollectionPanelStandard() {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({});
  const [pagination, setPagination] = useState({ page: 1, total_pages: 1, total: 0 });
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [savingRows, setSavingRows] = useState({});

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [gestionFilter, setGestionFilter] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, riskFilter, gestionFilter, agencyFilter, pageSize]);

  const firstLoadRef = useRef(true);

  const fetchPage = useCallback(async () => {
    const isInitial = firstLoadRef.current;
    firstLoadRef.current = false;
    if (isInitial) setLoading(true);
    else setTableLoading(true);

    const offset = (page - 1) * pageSize;
    try {
      const data = await alertsAPI.getPreventiveAlerts({
        limit: pageSize,
        offset,
        search: debouncedSearch || undefined,
        risk_level: riskFilter || undefined,
        gestion: gestionParam(gestionFilter),
        agencia: agencyFilter || undefined,
      });
      setItems(getPreventiveItems(data));
      setMeta(data && !Array.isArray(data) ? data : {});
      setPagination(data?.pagination || { page: 1, total_pages: 1, total: 0 });
      if (Array.isArray(data?.agencies) && data.agencies.length) {
        setAgencies(data.agencies);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setTableLoading(false);
    }
  }, [page, pageSize, debouncedSearch, riskFilter, gestionFilter, agencyFilter]);

  useEffect(() => {
    let cancelled = false;
    fetchPage().then(() => {
      if (cancelled) return undefined;
      return undefined;
    });
    return () => { cancelled = true; };
  }, [fetchPage]);

  const bumpGestionMeta = (prevAction, nextAction) => {
    const wasManaged = !isSinGestion(prevAction);
    const nowManaged = !isSinGestion(nextAction);
    if (wasManaged === nowManaged) return;
    setMeta((m) => {
      let pending = m.total_pending_gestion ?? 0;
      let managed = m.total_managed ?? 0;
      if (!wasManaged && nowManaged) {
        pending = Math.max(0, pending - 1);
        managed += 1;
      } else {
        pending += 1;
        managed = Math.max(0, managed - 1);
      }
      return { ...m, total_pending_gestion: pending, total_managed: managed };
    });
  };

  const handleActionChange = async (pagoId, selectedValue, rowKey, item) => {
    if (!pagoId) return;
    const prevAction = item?.accion_preventiva || 'Ninguna';
    if (selectedValue === 'SMS Enviado') {
      openWhatsAppPreventiva(item);
    }
    setSavingRows((prev) => ({ ...prev, [rowKey]: 'saving' }));
    try {
      await alertsAPI.savePreventiveAction(pagoId, selectedValue);
      setItems((prev) =>
        prev.map((row) =>
          row.pago_id === pagoId ? { ...row, accion_preventiva: selectedValue } : row
        )
      );
      bumpGestionMeta(prevAction, selectedValue);
      setSavingRows((prev) => ({ ...prev, [rowKey]: 'success' }));
      setTimeout(() => {
        setSavingRows((prev) => {
          const copy = { ...prev };
          delete copy[rowKey];
          return copy;
        });
      }, 2500);
    } catch (err) {
      console.error('Error saving preventive action:', err);
      setSavingRows((prev) => ({ ...prev, [rowKey]: 'error' }));
    }
  };

  const totalActive = getPreventiveTotal(meta);
  const filteredTotal = meta.filtered_total ?? pagination.total ?? items.length;
  const universoRiesgo = getUniversoRiesgo(meta);
  const colaSemanal = getColaSemanal(meta);
  const capacidadPreventiva = meta.capacidad_preventiva ?? 120;
  const pendingCount = meta.total_pending_gestion ?? 0;
  const managedCount = meta.total_managed ?? Math.max(0, filteredTotal - pendingCount);
  const gestionPct = filteredTotal > 0 ? (managedCount / filteredTotal) * 100 : 0;
  const totalVolume = meta.total_volume ?? 0;
  const ventanaInicio = meta.ventana_inicio;
  const ventanaFin = meta.ventana_fin;
  const ventanaLabel = ventanaInicio && ventanaFin
    ? `${ventanaInicio} — ${ventanaFin}`
    : '3 a 15 días desde corte';

  const fechaCorte = meta.fecha_corte || FECHA_CORTE;
  const totalPages = pagination.total_pages || 1;
  const rangeStart = filteredTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, filteredTotal);

  const pageButtons = useMemo(() => {
    const pages = totalPages;
    const count = Math.min(pages, 7);
    return Array.from({ length: count }, (_, i) => {
      if (pages <= 7) return i + 1;
      if (page <= 4) return i + 1;
      if (page >= pages - 3) return pages - 6 + i;
      return page - 3 + i;
    });
  }, [page, totalPages]);

  if (loading && items.length === 0) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <div className="loading-text">Cargando tablero de cobranza preventiva...</div>
      </div>
    );
  }

  return (
    <div className="preventive-board">
      <header className="page-intro preventive-board-hero">
        <div className="preventive-board-hero-text">
          <h1>Cobranza preventiva</h1>
          <p>
            Contacto proactivo antes del vencimiento · solo socios <strong>alto</strong> y <strong>crítico</strong>.
            Complementa la cola semanal ({colaSemanal.toLocaleString('es-EC')} casos) y el radar ({universoRiesgo.toLocaleString('es-EC')} socios).
          </p>
        </div>
        <span className="preventive-board-hero-badge">
          <Sparkles size={14} aria-hidden />
          IA proactiva
        </span>
      </header>

      <section className="preventive-board-summary card">
        <PreventiveVentanaStrip
          fechaCorte={fechaCorte}
          ventanaInicio={ventanaInicio}
          ventanaFin={ventanaFin}
          totalActive={totalActive}
        />
        <BusinessContextStrip
          universo={universoRiesgo}
          cola={colaSemanal}
          preventiva={totalActive}
          ventana={ventanaLabel}
        />
      </section>

      <div className="metrics-panel metrics-panel--preventive">
        <div className="metric-cell metric-cell--critical">
          <div className="metric-cell-icon"><Clock size={20} /></div>
          <div className="metric-cell-body">
            <span className="metric-cell-value">{pendingCount.toLocaleString('es-EC')}</span>
            <span className="metric-cell-label">Por gestionar (filtro)</span>
          </div>
        </div>
        <div className="metric-cell metric-cell--warn">
          <div className="metric-cell-icon"><TrendingUp size={20} /></div>
          <div className="metric-cell-body">
            <span className="metric-cell-value">
              ${totalVolume.toLocaleString('es-EC', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
            <span className="metric-cell-label">Monto en ventana (filtro)</span>
          </div>
        </div>
        <div className="metric-cell metric-cell--green">
          <div className="metric-cell-icon"><CheckCircle size={20} /></div>
          <div className="metric-cell-body">
            <span className="metric-cell-value">{gestionPct.toFixed(1)}%</span>
            <span className="metric-cell-label">Cobertura preventiva</span>
          </div>
        </div>
        <div className="metric-cell metric-cell--gold">
          <div className="metric-cell-icon"><Building size={20} /></div>
          <div className="metric-cell-body">
            <span className="metric-cell-value">
              {managedCount.toLocaleString('es-EC')} / {filteredTotal.toLocaleString('es-EC')}
            </span>
            <span className="metric-cell-label">Contactados (filtro)</span>
          </div>
        </div>
      </div>

      <section className="preventive-workspace card">
        <div className="preventive-workspace-head">
          <div>
            <div className="card-title preventive-workspace-title">
              <ShieldAlert size={18} aria-hidden />
              Cola de gestión
            </div>
            <p className="preventive-workspace-sub">
              <strong>
                {rangeStart.toLocaleString('es-EC')}–{rangeEnd.toLocaleString('es-EC')}
              </strong>
              {' '}de {filteredTotal.toLocaleString('es-EC')} casos filtrados
              {' '}· Capacidad orientativa {capacidadPreventiva.toLocaleString('es-EC')}/semana
              {tableLoading && <span className="preventive-workspace-loading"> · Actualizando…</span>}
            </p>
          </div>
        </div>

        <div className="preventive-toolbar filters-bar">
          <Filter size={16} className="preventive-toolbar-icon" aria-hidden />
          <div className="preventive-search">
            <Search size={16} aria-hidden />
            <input
              className="filter-input"
              placeholder="Buscar socio, cédula o agencia..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar en cola preventiva"
            />
          </div>
          <select className="filter-select" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} aria-label="Filtrar por riesgo">
            <option value="">Riesgo (todos)</option>
            <option value="Crítico">Crítico</option>
            <option value="Alto">Alto</option>
          </select>
          <select className="filter-select" value={gestionFilter} onChange={(e) => setGestionFilter(e.target.value)} aria-label="Filtrar por gestión">
            <option value="">Gestión (todos)</option>
            <option value="sin_gestionar">Sin gestionar</option>
            <option value="gestionados">Gestionados</option>
            <option value="SMS Enviado">SMS enviado</option>
            <option value="Llamada - Promesa de Pago">Llamada — promesa</option>
            <option value="Llamada - Sin respuesta">Llamada — sin respuesta</option>
            <option value="Visita de campo">Visita de campo</option>
          </select>
          <select className="filter-select" value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)} aria-label="Filtrar por agencia">
            <option value="">Agencia (todas)</option>
            {agencies.map((agency) => (
              <option key={agency} value={agency}>{agency}</option>
            ))}
          </select>
          <select
            className="filter-select"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            title="Registros por página"
            aria-label="Registros por página"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} / página</option>
            ))}
          </select>
        </div>

        <div className={`preventive-table-wrap${tableLoading ? ' preventive-table-wrap--loading' : ''}`}>
          {tableLoading && (
            <div className="preventive-table-overlay" aria-hidden="true">
              <div className="spinner" />
            </div>
          )}

          {items.length === 0 && !tableLoading ? (
            <div className="empty-state" style={{ padding: '80px 20px' }}>
              <UserCheck size={48} style={{ color: 'var(--coop-verde-primario)', opacity: 0.5 }} />
              <p style={{ marginTop: 16, fontSize: 16 }}>
                No hay socios con cuota por vencer en la ventana preventiva que coincidan con los filtros.
              </p>
            </div>
          ) : (
            <div className="table-container preventive-table-scroll">
              <table className="data-table data-table--preventive">
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
                  {items.map((item) => {
                    const rowKey = item.pago_id ?? `socio-${item.socio_id}`;
                    return (
                      <PreventiveTableRow
                        key={rowKey}
                        item={item}
                        fechaCorte={fechaCorte}
                        rowKey={rowKey}
                        saveState={savingRows[rowKey]}
                        onActionChange={handleActionChange}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filteredTotal > 0 && totalPages > 1 && (
            <div className="pagination">
              <button
                type="button"
                className="page-btn"
                disabled={page <= 1 || tableLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              {pageButtons.map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  className={`page-btn ${page === pageNum ? 'active' : ''}`}
                  disabled={tableLoading}
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </button>
              ))}
              <button
                type="button"
                className="page-btn"
                disabled={page >= totalPages || tableLoading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight size={16} />
              </button>
              <span className="page-info">
                Página {page} de {totalPages}
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default function PreventiveCollectionPanel() {
  return <PreventiveCollectionPanelStandard />;
}
