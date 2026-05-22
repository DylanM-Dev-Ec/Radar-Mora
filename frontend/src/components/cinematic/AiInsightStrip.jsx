import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { INSIGHTS } from './cinematicCopy';

export default function AiInsightStrip() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % INSIGHTS.length), 5200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="cine-ai-strip">
      <div className="cine-ai-strip-icon">
        <Sparkles size={20} />
      </div>
      <p
        className="cine-ai-strip-text"
        dangerouslySetInnerHTML={{ __html: INSIGHTS[idx] }}
      />
    </div>
  );
}
