import { CalendarRange, CalendarClock } from 'lucide-react';
import { PREVENTIVE_WINDOW_MIN, PREVENTIVE_WINDOW_MAX } from '../utils/preventiveHelpers';

export default function PreventiveVentanaStrip({
  fechaCorte,
  ventanaInicio,
  ventanaFin,
  totalActive,
  compact = false,
}) {
  const markers = [
    { day: PREVENTIVE_WINDOW_MIN, label: `+${PREVENTIVE_WINDOW_MIN}d`, tier: 'urgent' },
    { day: 7, label: '+7d', tier: 'mid' },
    { day: PREVENTIVE_WINDOW_MAX, label: `+${PREVENTIVE_WINDOW_MAX}d`, tier: 'end' },
  ];

  return (
    <div className={`preventive-ventana${compact ? ' preventive-ventana--compact' : ''}`}>
      <div className="preventive-ventana-head">
        <div className="preventive-ventana-title">
          <CalendarRange size={compact ? 16 : 18} aria-hidden />
          <span>Ventana de contacto</span>
        </div>
        <span className="preventive-ventana-corte">
          <CalendarClock size={13} aria-hidden />
          Corte {fechaCorte || '—'}
        </span>
      </div>

      <div className="preventive-ventana-track" aria-hidden>
        <div className="preventive-ventana-track-bg" />
        <div className="preventive-ventana-track-fill" />
        {markers.map((m, i) => {
          const isFirst = i === 0;
          const isLast = i === markers.length - 1;
          const pct = ((m.day - PREVENTIVE_WINDOW_MIN) / (PREVENTIVE_WINDOW_MAX - PREVENTIVE_WINDOW_MIN)) * 100;
          return (
            <span
              key={m.day}
              className={`preventive-ventana-marker preventive-ventana-marker--${m.tier}`}
              style={
                isFirst
                  ? { left: 0, transform: 'none' }
                  : isLast
                    ? { right: 0, left: 'auto', transform: 'none' }
                    : { left: `${pct}%` }
              }
            >
              {m.label}
            </span>
          );
        })}
      </div>

      <div className="preventive-ventana-meta">
        <div className="preventive-ventana-dates">
          <strong>{ventanaInicio || '—'}</strong>
          <span className="preventive-ventana-arrow">→</span>
          <strong>{ventanaFin || '—'}</strong>
        </div>
        <p className="preventive-ventana-note">
          Cuotas pendientes que vencen entre <strong>{PREVENTIVE_WINDOW_MIN} y {PREVENTIVE_WINDOW_MAX} días</strong>
          {' '}después del corte
          {totalActive != null && (
            <>
              {' '}· <span className="preventive-ventana-count">{totalActive.toLocaleString('es-EC')} en cola</span>
            </>
          )}
        </p>
      </div>

      <div className="preventive-ventana-legend">
        <span><i className="dot dot--critico" /> 3–7 días · prioridad alta</span>
        <span><i className="dot dot--medio" /> 8–15 días · seguimiento</span>
      </div>
    </div>
  );
}
