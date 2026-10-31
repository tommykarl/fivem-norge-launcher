// Enkel områdegraf for spillertall siste 24 timer.
export default function Sparkline({ points, max }) {
  const W = 600;
  const H = 140;
  const t0 = Date.now() - 24 * 3600_000;
  const t1 = Date.now();
  const top = Math.max(max || 0, ...points.map((p) => p.c), 1);
  const x = (t) => ((t - t0) / (t1 - t0)) * W;
  const y = (c) => H - 6 - (c / top) * (H - 16);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.c).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points[points.length - 1].t).toFixed(1)} ${H} L${x(points[0].t).toFixed(1)} ${H}Z`;
  const peak = points.reduce((a, b) => (b.c > a.c ? b : a), points[0]);
  const label = `Spillertall siste 24 timer, høyeste ${peak.c}, nå ${points[points.length - 1].c}`;

  return (
    <figure className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}>
        {max ? <line x1="0" x2={W} y1={y(max)} y2={y(max)} className="spark-max" vectorEffect="non-scaling-stroke" /> : null}
        <path d={area} className="spark-area" />
        <path d={line} className="spark-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption>
        <span>24 t siden</span>
        <span>Topp {peak.c} {max ? `· maks ${max}` : ''}</span>
        <span>Nå</span>
      </figcaption>
    </figure>
  );
}
