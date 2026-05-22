import {
  Phone,
  Mail,
  MessageCircle,
  CreditCard,
  AlertTriangle,
  Banknote,
  CalendarClock,
  Hash,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { RISK_COLORS } from '../theme';

function ScoreRing({ score, level, size = 112 }) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const color = RISK_COLORS[level] || RISK_COLORS.Crítico;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="intervention-score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={stroke}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="intervention-score-ring-center">
        <span className="intervention-score-ring-value" style={{ color }}>
          {clamped}
        </span>
        <span className="intervention-score-ring-label">Score</span>
      </div>
    </div>
  );
}

export default function RiskInterventionPanel({
  level,
  score,
  rec,
  recIcon,
  recColor,
  creditoFoco,
  creditosMoraCount,
  diasMoraLabel,
  hasDiasMora,
  cuotasAtrasadas,
  diasMoraCreditoLabel,
  info,
  showContactOptions,
  onToggleContact,
  estadoBadgeClass,
}) {
  const progreso = Math.min(100, Number(creditoFoco?.progreso) || 0);
  const waPhone = info.telefono
    ? (info.telefono.startsWith('0') ? `593${info.telefono.substring(1)}` : info.telefono)
    : '';

  return (
    <section className={`intervention-panel intervention-panel--${recColor}`}>
      <div className="intervention-hero">
        <div className="intervention-hero-glow" aria-hidden />
        <div className="intervention-hero-main">
          <div className="intervention-alert">
            <span className="intervention-alert-icon" aria-hidden>{recIcon}</span>
            <div>
              <p className="intervention-alert-kicker">
                <AlertTriangle size={14} aria-hidden />
                Recomendación operativa
              </p>
              <h2 className="intervention-alert-title">{rec.title}</h2>
              <p className="intervention-alert-text">{rec.text}</p>
            </div>
          </div>
          <div className="intervention-score-card">
            <ScoreRing score={score} level={level} />
            <span className={`intervention-level-pill badge ${level.toLowerCase().replace('í', 'i')}`}>
              {level}
            </span>
          </div>
        </div>
      </div>

      <div className="intervention-credit-block">
        <div className="intervention-credit-head">
          <h3>
            <CreditCard size={18} aria-hidden />
            Crédito a reestructurar
          </h3>
          {creditoFoco && (
            <span className={`intervention-estado badge ${estadoBadgeClass(creditoFoco.estado)}`}>
              {creditoFoco.estado}
            </span>
          )}
        </div>

        {creditoFoco ? (
          <>
            <p className="intervention-credit-id">
              <Hash size={14} aria-hidden />
              Operación <strong>#{creditoFoco.id}</strong>
              <span className="intervention-credit-tipo">{creditoFoco.tipo}</span>
            </p>

            <div className="intervention-stat-grid">
              <div className="intervention-stat">
                <span className="intervention-stat-icon"><Banknote size={18} /></span>
                <div>
                  <span className="intervention-stat-label">Monto</span>
                  <span className="intervention-stat-value">
                    ${(creditoFoco.monto || 0).toLocaleString('es-EC')}
                  </span>
                </div>
              </div>
              <div className="intervention-stat">
                <span className="intervention-stat-icon"><CalendarClock size={18} /></span>
                <div>
                  <span className="intervention-stat-label">Cuota mensual</span>
                  <span className="intervention-stat-value">
                    ${(creditoFoco.cuota || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className="intervention-stat">
                <span className="intervention-stat-icon"><Layers size={18} /></span>
                <div>
                  <span className="intervention-stat-label">Plazo</span>
                  <span className="intervention-stat-value">{creditoFoco.plazo} meses</span>
                </div>
              </div>
              <div className="intervention-stat intervention-stat--wide">
                <div className="intervention-stat-progress-head">
                  <span className="intervention-stat-label">Avance del crédito</span>
                  <span className="intervention-stat-value">{progreso.toFixed(0)}%</span>
                </div>
                <div className="intervention-progress-track">
                  <div
                    className="intervention-progress-fill"
                    style={{ width: `${progreso}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="intervention-signals">
              {hasDiasMora && (
                <span className="intervention-signal intervention-signal--danger">
                  {diasMoraLabel} días mora (máx.)
                </span>
              )}
              {cuotasAtrasadas > 0 && (
                <span className="intervention-signal intervention-signal--danger">
                  {cuotasAtrasadas} cuota(s) atrasada(s)
                </span>
              )}
              {creditosMoraCount > 1 && (
                <span className="intervention-signal">
                  {creditosMoraCount} créditos en mora
                </span>
              )}
              {(creditoFoco.cuotas_atrasadas > 0 || creditoFoco.dias_mora_max > 0) && (
                <span className="intervention-signal intervention-signal--outline">
                  Este crédito: {creditoFoco.cuotas_atrasadas || 0} cuota(s) · {diasMoraCreditoLabel} días
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="intervention-empty">Sin créditos activos registrados.</p>
        )}
      </div>

      <div className="intervention-actions">
        <button
          type="button"
          className="intervention-btn-contact"
          onClick={onToggleContact}
          aria-expanded={showContactOptions}
        >
          <Phone size={18} aria-hidden />
          {showContactOptions ? 'Ocultar canales' : 'Contactar'}
          {showContactOptions ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showContactOptions && (
          <div className="intervention-channels">
            <a
              className="intervention-channel intervention-channel--wa"
              href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                `Estimado(a) *${info.nombre}*, le saludamos de la *Cooperativa Tulcán*. Nos contactamos por su crédito #${creditoFoco?.id || ''} para ofrecerle opciones de *reestructuración*. ¿Podemos agendar una llamada?`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={18} />
              <span>WhatsApp</span>
            </a>
            <a className="intervention-channel intervention-channel--call" href={`tel:${info.telefono || ''}`}>
              <Phone size={18} />
              <span>Llamada</span>
            </a>
            <a
              className="intervention-channel intervention-channel--mail"
              href={`mailto:${info.email || ''}?subject=Reestructuración%20-%20Cooperativa%20Tulcán`}
            >
              <Mail size={18} />
              <span>Correo</span>
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
