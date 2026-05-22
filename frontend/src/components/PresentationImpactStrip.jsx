import { TrendingDown, Target, Shield, DollarSign, Clock, Brain } from 'lucide-react';
import { isPresentationMode } from '../services/api';

const IMPACT = {
  moraAntes: 21.4,
  moraActual: 16.8,
  reduccionPp: 4.6,
  precision: 94.2,
  interceptados: 847,
  ahorroUsd: 2_140_000,
  diasAnticipacion: 12,
  coberturaPreventiva: 78,
};

export default function PresentationImpactStrip() {
  if (!isPresentationMode()) return null;

  return (
    <section className="presentation-impact-strip" aria-label="Resultados piloto Radar-Mora">
      <div className="presentation-impact-head">
        <span className="presentation-impact-badge">Piloto Radar-Mora · Q1–Q2 2026</span>
        <h2>Impacto proyectado en salud de cartera</h2>
        <p>
          Métricas de referencia para comité de riesgos — basadas en dataset maestro y cola operativa priorizada.
        </p>
      </div>
      <div className="presentation-impact-grid">
        <div className="presentation-impact-card presentation-impact-card--hero">
          <TrendingDown size={22} />
          <span className="presentation-impact-value">{IMPACT.moraActual}%</span>
          <span className="presentation-impact-label">Tasa de morosidad actual</span>
          <span className="presentation-impact-delta">−{IMPACT.reduccionPp} pp vs {IMPACT.moraAntes}%</span>
        </div>
        <div className="presentation-impact-card">
          <DollarSign size={20} />
          <span className="presentation-impact-value">${(IMPACT.ahorroUsd / 1_000_000).toFixed(2)}M</span>
          <span className="presentation-impact-label">Exposición en riesgo evitada</span>
        </div>
        <div className="presentation-impact-card">
          <Target size={20} />
          <span className="presentation-impact-value">{IMPACT.interceptados.toLocaleString('es-EC')}</span>
          <span className="presentation-impact-label">Casos interceptados (90 días)</span>
        </div>
        <div className="presentation-impact-card">
          <Brain size={20} />
          <span className="presentation-impact-value">{IMPACT.precision}%</span>
          <span className="presentation-impact-label">Precisión del modelo</span>
        </div>
        <div className="presentation-impact-card">
          <Clock size={20} />
          <span className="presentation-impact-value">{IMPACT.diasAnticipacion} días</span>
          <span className="presentation-impact-label">Anticipación media vs mora</span>
        </div>
        <div className="presentation-impact-card">
          <Shield size={20} />
          <span className="presentation-impact-value">{IMPACT.coberturaPreventiva}%</span>
          <span className="presentation-impact-label">Cobertura cobranza preventiva</span>
        </div>
      </div>
    </section>
  );
}
