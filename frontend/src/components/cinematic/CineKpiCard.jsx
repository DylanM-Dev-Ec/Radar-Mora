/** Tarjeta KPI vertical — valor arriba, textos abajo sin solapamiento */
export default function CineKpiCard({ icon: Icon, tone, value, title, sub }) {
  return (
    <div className="cine-kpi">
      {Icon && (
        <div className={`cine-kpi-icon cine-kpi-icon--${tone}`}>
          <Icon size={18} />
        </div>
      )}
      <div className="cine-kpi-body">
        <span className="cine-kpi-value">{value}</span>
        <span className="cine-kpi-title">{title}</span>
        {sub ? <span className="cine-kpi-sub">{sub}</span> : null}
      </div>
    </div>
  );
}
