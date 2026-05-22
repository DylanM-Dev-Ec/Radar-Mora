import { CloudRain, Mountain, TrendingDown, Info, Newspaper, Sparkles, MapPin } from 'lucide-react';

const CATEGORY_ICONS = {
  desastre_natural: Mountain,
  clima: CloudRain,
  economico: TrendingDown,
  otros: Info,
};

const NIVEL_CLASS = {
  Alto: 'context-intel-pred--alto',
  Medio: 'context-intel-pred--medio',
  Bajo: 'context-intel-pred--bajo',
};

function formatFecha(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });
  } catch {
    return iso;
  }
}

export default function SocioContextIntel({ contexto }) {
  if (!contexto) return null;

  const { zona, fecha_analisis, noticias_sugeridas = [], prediccion_ia: pred } = contexto;
  const nivelClass = NIVEL_CLASS[pred?.nivel] || NIVEL_CLASS.Medio;
  const factoresActivos = (pred?.factores || []).filter((f) => f.activo).slice(0, 4);
  const noticias = noticias_sugeridas.slice(0, 2);

  return (
    <section className="card context-intel context-intel--compact animate-in">
      <div className="context-intel-header">
        <div className="context-intel-header-main">
          <Newspaper size={15} />
          <span className="context-intel-title">Contexto externo</span>
          <span className={`badge badge-sm ${(pred?.nivel || 'Medio').toLowerCase().replace('í', 'i')}`}>
            {pred?.nivel}
          </span>
        </div>
        <span className="context-intel-meta-inline">
          <MapPin size={11} />
          {zona} · {formatFecha(fecha_analisis)}
        </span>
      </div>

      <div className={`context-intel-pred ${nivelClass}`}>
        <Sparkles size={14} className="context-intel-pred-icon-sm" />
        <div className="context-intel-pred-main">
          <p className="context-intel-pred-title">{pred?.titulo}</p>
          <p className="context-intel-pred-text">{pred?.explicacion}</p>
        </div>
      </div>

      {factoresActivos.length > 0 && (
        <div className="context-intel-chips">
          {factoresActivos.map((f) => {
            const Icon = CATEGORY_ICONS[f.tipo] || Info;
            return (
              <span key={f.tipo} className="context-intel-chip">
                <Icon size={11} />
                {f.etiqueta}
              </span>
            );
          })}
        </div>
      )}

      {noticias.length > 0 && (
        <ul className="context-intel-news-compact">
          {noticias.map((n) => {
            const Icon = CATEGORY_ICONS[n.categoria] || Info;
            return (
              <li key={n.id} className="context-intel-news-row">
                <span className={`context-intel-news-cat context-intel-news-cat--${n.categoria}`}>
                  <Icon size={10} />
                </span>
                <span className="context-intel-news-headline">{n.titulo}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
