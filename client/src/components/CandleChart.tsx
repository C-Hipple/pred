import type { Candle } from "../api";

const W = 640;
const H = 240;
const PAD = { top: 10, right: 10, bottom: 22, left: 36 };
const VOLUME_FRACTION = 0.16; // bottom slice of the plot reserved for volume bars

function formatTime(epochSeconds: number, intervalSeconds: number): string {
  const date = new Date(epochSeconds * 1000);
  if (intervalSeconds >= 86400) {
    return date.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function CandleChart({
  candles,
  interval,
}: {
  candles: Candle[];
  interval: number;
}) {
  if (candles.length === 0) {
    return <div className="muted small center">No trades yet — nothing to chart.</div>;
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = (H - PAD.top - PAD.bottom) * (1 - VOLUME_FRACTION);
  const volTop = PAD.top + plotH + 4;
  const volH = (H - PAD.top - PAD.bottom) * VOLUME_FRACTION - 4;

  let lo = Math.min(...candles.map((c) => c.low));
  let hi = Math.max(...candles.map((c) => c.high));
  lo = Math.max(0, lo - 5);
  hi = Math.min(100, hi + 5);
  if (hi - lo < 10) {
    const mid = (hi + lo) / 2;
    lo = Math.max(0, mid - 5);
    hi = Math.min(100, mid + 5);
  }

  const y = (price: number) => PAD.top + ((hi - price) / (hi - lo)) * plotH;
  const slot = plotW / candles.length;
  const bodyW = Math.min(Math.max(slot * 0.6, 2), 24);
  const x = (i: number) => PAD.left + slot * i + slot / 2;

  const maxVolume = Math.max(...candles.map((c) => c.volume));
  const gridStep = hi - lo > 40 ? 20 : hi - lo > 16 ? 10 : 5;
  const gridLines: number[] = [];
  for (let p = Math.ceil(lo / gridStep) * gridStep; p <= hi; p += gridStep) {
    gridLines.push(p);
  }

  // Label roughly every quarter of the x-axis without crowding.
  const labelEvery = Math.max(1, Math.ceil(candles.length / 4));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="candle-chart" role="img">
      {gridLines.map((p) => (
        <g key={p}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(p)}
            y2={y(p)}
            stroke="var(--border)"
            strokeDasharray="3 4"
          />
          <text x={PAD.left - 6} y={y(p) + 4} textAnchor="end" className="chart-label">
            {p}¢
          </text>
        </g>
      ))}
      {candles.map((c, i) => {
        const up = c.close >= c.open;
        const color = up ? "var(--yes)" : "var(--no)";
        const bodyTop = y(Math.max(c.open, c.close));
        const bodyH = Math.max(Math.abs(y(c.open) - y(c.close)), 1.5);
        return (
          <g key={c.time}>
            <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={color} />
            <rect
              x={x(i) - bodyW / 2}
              y={bodyTop}
              width={bodyW}
              height={bodyH}
              fill={color}
              rx={1}
            />
            <rect
              x={x(i) - bodyW / 2}
              y={volTop + volH * (1 - c.volume / maxVolume)}
              width={bodyW}
              height={(volH * c.volume) / maxVolume}
              fill={color}
              opacity={0.35}
              rx={1}
            />
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 6} textAnchor="middle" className="chart-label">
                {formatTime(c.time, interval)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
