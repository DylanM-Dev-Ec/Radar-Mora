import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Clock, CheckCircle, ChevronRight, Sparkles } from 'lucide-react';
import { alertsAPI, getPreventiveItems, getPreventiveTotal } from '../services/api';
import { isSinGestion } from '../utils/preventiveHelpers';
import { openWhatsAppPreventiva } from '../utils/preventiveContact';
import PreventiveTableRow from './PreventiveTableRow';
import PreventiveVentanaStrip from './PreventiveVentanaStrip';

const PREVIEW_LIMIT = 8;
const FECHA_CORTE = '2026-05-21';

export default function DashboardPreventiveWidget() {
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingRows, setSavingRows] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    return alertsAPI
      .getPreventiveAlerts({ limit: PREVIEW_LIMIT, offset: 0 })
      .then((data) => {
        setItems(getPreventiveItems(data));
        setMeta(data && !Array.isArray(data) ? data : {});
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    if (selectedValue === 'SMS Enviado') openWhatsAppPreventiva(item);
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
      }, 2000);
    } catch {
      setSavingRows((prev) => ({ ...prev, [rowKey]: 'error' }));
    }
  };

  const totalActive = getPreventiveTotal(meta);
  const filteredTotal = meta.filtered_total ?? totalActive;
  const pending = meta.total_pending_gestion ?? items.filter((i) => isSinGestion(i.accion_preventiva)).length;
  const managed = meta.total_managed ?? Math.max(0, filteredTotal - pending);
  const gestionPct = filteredTotal > 0 ? (managed / filteredTotal) * 100 : 0;
  const ventana =
    meta.ventana_inicio && meta.ventana_fin
      ? `${meta.ventana_inicio} — ${meta.ventana_fin}`
      : '3 a 15 días desde corte';

  return (
    <section className="dashboard-section dashboard-section--preventive">
      <div className="section-heading">
        <Shield size={20} className="section-heading-icon" />
        <div>
          <h2>Cobranza preventiva</h2>
          <p>
            Cuotas por vencer ({ventana}) · {totalActive.toLocaleString('es-EC')} casos en ventana
          </p>
        </div>
        <Link to="/cobranza-preventiva" className="section-heading-action">
          Tablero completo <ChevronRight size={16} />
        </Link>
      </div>

      <div className="card preventive-board-summary" style={{ marginBottom: 16 }}>
        <PreventiveVentanaStrip
          compact
          fechaCorte={meta.fecha_corte || FECHA_CORTE}
          ventanaInicio={meta.ventana_inicio}
          ventanaFin={meta.ventana_fin}
          totalActive={totalActive}
        />
      </div>

      <div className="metrics-panel metrics-panel--preventive" style={{ marginBottom: 16 }}>
        <div className="metric-cell metric-cell--critical">
          <div className="metric-cell-icon"><Clock size={18} /></div>
          <div className="metric-cell-body">
            <span className="metric-cell-value">{pending.toLocaleString('es-EC')}</span>
            <span className="metric-cell-label">Por gestionar</span>
          </div>
        </div>
        <div className="metric-cell metric-cell--warn">
          <div className="metric-cell-icon"><Shield size={18} /></div>
          <div className="metric-cell-body">
            <span className="metric-cell-value">{totalActive.toLocaleString('es-EC')}</span>
            <span className="metric-cell-label">En ventana preventiva</span>
          </div>
        </div>
        <div className="metric-cell metric-cell--green">
          <div className="metric-cell-icon"><CheckCircle size={18} /></div>
          <div className="metric-cell-body">
            <span className="metric-cell-value">{gestionPct.toFixed(1)}%</span>
            <span className="metric-cell-label">Cobertura preventiva</span>
          </div>
        </div>
        <div className="metric-cell metric-cell--gold">
          <div className="metric-cell-icon">
            <Sparkles size={18} />
          </div>
          <div className="metric-cell-body">
            <span className="metric-cell-value">
              {managed.toLocaleString('es-EC')} / {filteredTotal.toLocaleString('es-EC')}
            </span>
            <span className="metric-cell-label">Contactados</span>
          </div>
        </div>
      </div>

      <div className="card preventive-workspace" style={{ borderTopColor: 'var(--coop-verde-primario)' }}>
        {loading ? (
          <div className="loading-container" style={{ minHeight: 160 }}>
            <div className="spinner" />
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state" style={{ padding: 48 }}>
            <p>No hay casos en la ventana preventiva actual.</p>
          </div>
        ) : (
          <div className="table-container preventive-table-scroll" style={{ maxHeight: 400 }}>
            <table className="data-table data-table--preventive">
              <thead>
                <tr>
                  <th>Socio / Cédula</th>
                  <th>Riesgo IA</th>
                  <th>Vencimiento</th>
                  <th>Detalle cuota</th>
                  <th>Agencia</th>
                  <th>Canales</th>
                  <th>Acción preventiva</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const rowKey = item.pago_id ?? `socio-${item.socio_id}`;
                  return (
                    <PreventiveTableRow
                      key={rowKey}
                      item={item}
                      fechaCorte={meta.fecha_corte || FECHA_CORTE}
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
        {!loading && filteredTotal > PREVIEW_LIMIT && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #eee', textAlign: 'center' }}>
            <Link to="/cobranza-preventiva" className="section-heading-action" style={{ display: 'inline-flex' }}>
              Ver los {filteredTotal.toLocaleString('es-EC')} casos <ChevronRight size={14} />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
