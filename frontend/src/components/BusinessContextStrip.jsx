/**
 * Leyenda ejecutiva: diferencia universo en radar, cola semanal y preventiva.
 */
export default function BusinessContextStrip({
  universo,
  cola,
  preventiva,
  ventana,
}) {
  return (
    <div className="business-context-strip" role="note">
      <div className="business-context-item">
        <span className="business-context-kicker">Universo en radar</span>
        <span className="business-context-value">{universo?.toLocaleString('es-EC') ?? '—'}</span>
        <span className="business-context-hint">Socios alto + crítico monitoreados por IA</span>
      </div>
      <div className="business-context-item business-context-item--accent">
        <span className="business-context-kicker">Cola semanal operativa</span>
        <span className="business-context-value">{cola?.toLocaleString('es-EC') ?? '—'}</span>
        <span className="business-context-hint">Casos asignados al equipo esta semana</span>
      </div>
      {preventiva != null && (
        <div className="business-context-item">
          <span className="business-context-kicker">Cobranza preventiva</span>
          <span className="business-context-value">{preventiva?.toLocaleString('es-EC') ?? '—'}</span>
          <span className="business-context-hint">
            {ventana ? `Cuotas por vencer (${ventana})` : 'Acción antes del vencimiento'}
          </span>
        </div>
      )}
    </div>
  );
}
