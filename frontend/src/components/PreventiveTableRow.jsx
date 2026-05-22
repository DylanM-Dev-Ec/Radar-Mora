import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Mail, MessageCircle, Loader, Check, AlertCircle } from 'lucide-react';
import {
  getProvinceByCedula,
  getDaysRemaining,
  getVencimientoUrgency,
  riskBadgeClass,
  isSinGestion,
} from '../utils/preventiveHelpers';
import { whatsAppHref } from '../utils/preventiveContact';

function PreventiveTableRow({
  item,
  fechaCorte,
  rowKey,
  saveState,
  onActionChange,
}) {
  const navigate = useNavigate();
  const daysLeft =
    item.dias_para_vencer != null && Number.isFinite(Number(item.dias_para_vencer))
      ? Number(item.dias_para_vencer)
      : item.fecha_esperada
        ? getDaysRemaining(item.fecha_esperada, fechaCorte)
        : null;
  const urgency = getVencimientoUrgency(daysLeft);

  const isSaving = saveState === 'saving';
  const isSuccess = saveState === 'success';
  const isError = saveState === 'error';
  const waLink = whatsAppHref(item);
  const managed = !isSinGestion(item.accion_preventiva);

  return (
    <tr
      className={`data-table-row--clickable preventive-row preventive-row--${urgency.tier}`}
      onClick={() => navigate(`/socios/${item.socio_id}`)}
    >
      <td className="preventive-cell-socio">
        <div className="preventive-socio-name">{item.socio_nombre}</div>
        <div className="preventive-socio-meta">
          <span>C.I. {item.socio_cedula}</span>
          <span className="preventive-socio-prov">{getProvinceByCedula(item.socio_cedula)}</span>
        </div>
      </td>

      <td>
        <div className="preventive-risk-cell">
          <span className={`badge ${riskBadgeClass(item.risk_level)}`}>{item.risk_level}</span>
          <span className="preventive-risk-score">Score {Number(item.risk_score).toFixed(1)}</span>
        </div>
      </td>

      <td className="preventive-cell-venc">
        <time className="preventive-venc-date" dateTime={item.fecha_esperada}>
          {item.fecha_esperada || '—'}
        </time>
        <div className={`preventive-venc-bar preventive-venc-bar--${urgency.tier}`}>
          <div
            className="preventive-venc-bar-fill"
            style={{ width: `${urgency.progress}%` }}
          />
        </div>
        <span className={`preventive-venc-badge badge ${urgency.badgeClass}`}>
          {urgency.label}
        </span>
      </td>

      <td className="preventive-cell-cuota">
        <span className="preventive-cuota-monto">
          ${(item.monto_esperado || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}
        </span>
        <span className="preventive-cuota-num">
          {item.num_cuota != null ? `Cuota N° ${item.num_cuota}` : '—'}
        </span>
      </td>

      <td className="preventive-cell-agencia">{item.socio_agencia}</td>

      <td onClick={(e) => e.stopPropagation()}>
        <div className="preventive-channels" role="group" aria-label="Canales de contacto">
          <a
            href={`tel:${item.socio_telefono}`}
            title={`Llamar a ${item.socio_telefono}`}
            className="preventive-channel-btn"
          >
            <Phone size={15} />
          </a>
          <a
            href={`mailto:${item.socio_email}`}
            title={`Correo a ${item.socio_email}`}
            className="preventive-channel-btn preventive-channel-btn--mail"
          >
            <Mail size={15} />
          </a>
          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp — recordatorio de cuota"
              className="preventive-channel-btn preventive-channel-btn--wa"
              onClick={(e) => e.stopPropagation()}
            >
              <MessageCircle size={15} />
            </a>
          ) : null}
        </div>
      </td>

      <td onClick={(e) => e.stopPropagation()}>
        <div className={`preventive-action-cell${managed ? ' preventive-action-cell--done' : ''}`}>
          <select
            className="preventive-action-select"
            value={item.accion_preventiva || 'Ninguna'}
            onChange={(e) => onActionChange(item.pago_id, e.target.value, rowKey, item)}
            disabled={isSaving || !item.pago_id}
            aria-invalid={isError || undefined}
          >
            <option value="Ninguna">Sin gestionar</option>
            <option value="SMS Enviado">SMS enviado</option>
            <option value="Llamada - Promesa de Pago">Llamada — promesa</option>
            <option value="Llamada - Sin respuesta">Llamada — sin respuesta</option>
            <option value="Visita de campo">Visita de campo</option>
          </select>
          <span className="preventive-action-status" aria-live="polite">
            {isSaving && <Loader size={16} className="spinner" />}
            {isSuccess && <Check size={18} className="preventive-action-ok" />}
            {isError && <AlertCircle size={18} className="preventive-action-err" />}
          </span>
        </div>
      </td>
    </tr>
  );
}

export default memo(PreventiveTableRow);
