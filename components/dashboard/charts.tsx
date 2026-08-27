// Small, dependency-free visual primitives for the dashboard — plain SVG/div bars rather than a
// charting library, since every value here is a single static server-rendered snapshot (no
// tooltips/zoom/animation needed that would justify the extra bundle weight).

// A fill-proportional ring is only appropriate for metrics where "more filled" genuinely means
// "better" (e.g. training completion) — never use this for a risk-style metric like rubber-stamp
// rate, where a fuller ring would visually read as good when it means the opposite.
export function RadialProgress({
  percent,
  size = 88,
  strokeWidth = 9,
  label,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="stroke-foreground transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute text-lg font-semibold">{label}</span>
    </div>
  );
}

export function LatencyHistogram({ buckets }: { buckets: { label: string; count: number }[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="space-y-2">
      {buckets.map((b) => (
        <div key={b.label} className="flex items-center gap-2 text-xs">
          <span className="w-16 shrink-0 text-muted-foreground">{b.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground" style={{ width: `${(b.count / max) * 100}%` }} />
          </div>
          <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">{b.count}</span>
        </div>
      ))}
    </div>
  );
}

// A true pie/donut: each segment's arc length is its share of the whole, drawn as a single ring
// built from consecutive dasharray/dashoffset slices — appropriate here because tool-register
// status is a composition-of-a-whole (every tool is in exactly one bucket), not a progress
// metric, so there's no "more filled = better" ambiguity like RadialProgress has to guard against.
export function DonutChart({
  segments,
  size = 120,
  strokeWidth = 20,
  centerLabel,
  centerSublabel,
}: {
  segments: { value: number; className: string }[];
  size?: number;
  strokeWidth?: number;
  centerLabel: string;
  centerSublabel?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulativeFraction = 0;

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-muted" />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s, i) => {
              const fraction = s.value / total;
              const dash = fraction * circumference;
              const offset = circumference * (1 - cumulativeFraction);
              cumulativeFraction += fraction;
              return (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={offset}
                  className={s.className}
                />
              );
            })}
      </svg>
      <div className="absolute flex flex-col items-center text-center">
        <span className="text-xl font-semibold">{centerLabel}</span>
        {centerSublabel && <span className="text-[10px] text-muted-foreground">{centerSublabel}</span>}
      </div>
    </div>
  );
}

export function BarList({
  items,
}: {
  items: { label: string; value: number; sublabel: string }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate font-medium">{item.label}</span>
            <span className="shrink-0 text-muted-foreground">{item.sublabel}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
