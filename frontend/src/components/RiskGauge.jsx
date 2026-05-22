import { useId } from 'react';
import { RISK_COLORS, COOP } from '../theme';

function polar(cx, cy, r, angleRad) {
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy - r * Math.sin(angleRad),
  };
}

function arcPath(cx, cy, r, startRad, endRad) {
  const start = polar(cx, cy, r, startRad);
  const end = polar(cx, cy, r, endRad);
  const span = Math.abs(startRad - endRad);
  const largeArc = span > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export default function RiskGauge({ score = 0, size = 200, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const clampedScore = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const level =
    clampedScore >= 75 ? 'Crítico' : clampedScore >= 55 ? 'Alto' : clampedScore >= 35 ? 'Medio' : 'Bajo';
  const color = RISK_COLORS[level];

  const width = size;
  const height = Math.round(size * 0.58);
  const strokeWidth = Math.max(10, Math.round(size * 0.07));
  const radius = width * 0.36;
  const cx = width / 2;
  const cy = height - strokeWidth * 0.6;

  const startAngle = Math.PI;
  const endAngle = 0;
  const progressAngle = startAngle - (clampedScore / 100) * Math.PI;

  const bgPath = arcPath(cx, cy, radius, startAngle, endAngle);
  const progPath = clampedScore > 0 ? arcPath(cx, cy, radius, startAngle, progressAngle) : '';
  const needle = polar(cx, cy, radius, progressAngle);

  const gradId = `gaugeGrad-${uid}`;

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: 'block', overflow: 'visible' }}
        aria-hidden
      >
        <defs>
          <linearGradient
            id={gradId}
            gradientUnits="userSpaceOnUse"
            x1={cx - radius}
            y1={cy}
            x2={cx + radius}
            y2={cy}
          >
            <stop offset="0%" stopColor={RISK_COLORS.Bajo} />
            <stop offset="40%" stopColor={RISK_COLORS.Medio} />
            <stop offset="70%" stopColor={RISK_COLORS.Alto} />
            <stop offset="100%" stopColor={RISK_COLORS.Crítico} />
          </linearGradient>
        </defs>

        <path
          d={bgPath}
          fill="none"
          stroke="#e8eaed"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {progPath && (
          <path
            d={progPath}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}

        {clampedScore > 0 && (
          <circle cx={needle.x} cy={needle.y} r={strokeWidth * 0.45} fill={color} />
        )}

        <text
          x={cx}
          y={cy - radius * 0.35}
          textAnchor="middle"
          fill={COOP.textoPrincipal}
          fontSize={size * 0.17}
          fontWeight="800"
          fontFamily="Roboto, Segoe UI, sans-serif"
        >
          {clampedScore}
        </text>
        <text
          x={cx}
          y={cy - radius * 0.35 + size * 0.1}
          textAnchor="middle"
          fill={COOP.textoSecundario}
          fontSize={size * 0.055}
          fontWeight="500"
          fontFamily="Roboto, Segoe UI, sans-serif"
        >
          de 100
        </text>

        <text
          x={polar(cx, cy, radius, startAngle).x}
          y={cy + strokeWidth * 0.9}
          textAnchor="middle"
          fill={COOP.textoSecundario}
          fontSize={10}
          fontFamily="Roboto, Segoe UI, sans-serif"
        >
          0
        </text>
        <text
          x={cx}
          y={polar(cx, cy, radius, Math.PI / 2).y - strokeWidth * 0.35}
          textAnchor="middle"
          fill={COOP.textoSecundario}
          fontSize={10}
          fontFamily="Roboto, Segoe UI, sans-serif"
        >
          50
        </text>
        <text
          x={polar(cx, cy, radius, endAngle).x}
          y={cy + strokeWidth * 0.9}
          textAnchor="middle"
          fill={COOP.textoSecundario}
          fontSize={10}
          fontFamily="Roboto, Segoe UI, sans-serif"
        >
          100
        </text>
      </svg>

      <div
        className={`badge ${level.toLowerCase()}`}
        style={{ marginTop: 4, fontSize: 14, padding: '5px 16px' }}
      >
        Riesgo {level}
      </div>
    </div>
  );
}
