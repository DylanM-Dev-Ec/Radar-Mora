/** Marca Cooperativa Tulcán + Radar-Mora */

const COOP_LOGO = '/images/coop-tulcan-logo.png';

export function CoopLogoImage({ className = '', alt = 'Cooperativa de Ahorro y Crédito Tulcán Ltda.' }) {
  return (
    <img
      src={COOP_LOGO}
      alt={alt}
      className={`brand-coop-logo ${className}`.trim()}
    />
  );
}

export function BrandLockup({ variant = 'header' }) {
  if (variant === 'sidebar') {
    return (
      <div className="brand-lockup brand-lockup--sidebar">
        <CoopLogoImage className="brand-coop-logo--sidebar" />
        <div className="brand-lockup-divider brand-lockup-divider--v" aria-hidden />
        <div className="brand-lockup-text">
          <span className="brand-lockup-radar">Radar-Mora</span>
          <span className="brand-lockup-coop">Alertas tempranas</span>
        </div>
      </div>
    );
  }

  return (
    <div className="brand-lockup brand-lockup--header">
      <CoopLogoImage className="brand-coop-logo--header" />
      <div className="brand-lockup-divider" aria-hidden />
      <div className="brand-lockup-text">
        <div className="brand-lockup-title-row">
          <span className="brand-lockup-radar">Radar-Mora</span>
          <span className="brand-lockup-tag">IA · Alertas tempranas</span>
        </div>
      </div>
    </div>
  );
}
