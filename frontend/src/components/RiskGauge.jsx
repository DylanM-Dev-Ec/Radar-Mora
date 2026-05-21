export default function RiskGauge({ score = 0, size = 200 }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const level = clampedScore <= 30 ? 'Bajo' : clampedScore <= 60 ? 'Medio' : clampedScore <= 80 ? 'Alto' : 'Crítico';
  const levelColors = { 'Bajo': '#10b981', 'Medio': '#f59e0b', 'Alto': '#f97316', 'Crítico': '#ef4444' };
  const color = levelColors[level];

  const cx = size / 2;
  const cy = size / 2 + 10;
  const radius = size * 0.38;
  const strokeWidth = size * 0.08;

  // Arc from 180° to 0° (semicircle, left to right)
  const startAngle = Math.PI;
  const endAngle = 0;
  const totalAngle = Math.PI;
  const progressAngle = startAngle - (clampedScore / 100) * totalAngle;

  const bgArcStart = { x: cx + radius * Math.cos(startAngle), y: cy - radius * Math.sin(startAngle) };
  const bgArcEnd = { x: cx + radius * Math.cos(endAngle), y: cy - radius * Math.sin(endAngle) };
  const progArcEnd = { x: cx + radius * Math.cos(progressAngle), y: cy - radius * Math.sin(progressAngle) };

  const bgPath = `M ${bgArcStart.x} ${bgArcStart.y} A ${radius} ${radius} 0 0 1 ${bgArcEnd.x} ${bgArcEnd.y}`;
  const largeArc = clampedScore > 50 ? 1 : 0;
  const progPath = `M ${bgArcStart.x} ${bgArcStart.y} A ${radius} ${radius} 0 ${largeArc} 1 ${progArcEnd.x} ${progArcEnd.y}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.65}`}>
        <defs>
          <linearGradient id={`gaugeGrad-${score}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="40%" stopColor="#f59e0b" />
            <stop offset="70%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background arc */}
        <path d={bgPath} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} strokeLinecap="round" />

        {/* Progress arc */}
        {clampedScore > 0 && (
          <path d={progPath} fill="none" stroke={`url(#gaugeGrad-${score})`} strokeWidth={strokeWidth} strokeLinecap="round" filter="url(#glow)"
            style={{ transition: 'all 1s ease' }} />
        )}

        {/* Needle dot */}
        <circle cx={progArcEnd.x} cy={progArcEnd.y} r={strokeWidth * 0.5} fill={color} filter="url(#glow)" />

        {/* Score text */}
        <text x={cx} y={cy - 8} textAnchor="middle" fill="#f1f5f9" fontSize={size * 0.18} fontWeight="800" fontFamily="Inter">
          {clampedScore}
        </text>
        <text x={cx} y={cy + size * 0.08} textAnchor="middle" fill="#64748b" fontSize={size * 0.06} fontWeight="500" fontFamily="Inter">
          de 100
        </text>

        {/* Scale labels */}
        <text x={bgArcStart.x + 4} y={cy + 16} textAnchor="middle" fill="#64748b" fontSize={10} fontFamily="Inter">0</text>
        <text x={cx} y={cy - radius - strokeWidth - 4} textAnchor="middle" fill="#64748b" fontSize={10} fontFamily="Inter">50</text>
        <text x={bgArcEnd.x - 4} y={cy + 16} textAnchor="middle" fill="#64748b" fontSize={10} fontFamily="Inter">100</text>
      </svg>

      <div className={`badge ${level.toLowerCase()}`} style={{ marginTop: -4, fontSize: 14, padding: '5px 16px' }}>
        Riesgo {level}
      </div>
    </div>
  );
}
