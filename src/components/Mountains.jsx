// Fjell-silhuett brukt som bakgrunn i banner og hero-kort. Fargene følger temaet (se .m1/.m2 i CSS).
export default function Mountains({ className = 'mountains' }) {
  return (
    <svg className={className} viewBox="0 0 1000 260" preserveAspectRatio="none" aria-hidden="true">
      <path className="m1" d="M0 210 L120 150 L190 180 L300 90 L380 140 L470 60 L560 130 L640 100 L760 170 L860 120 L1000 160 L1000 260 L0 260Z" />
      <path className="m2" d="M0 240 L90 200 L200 225 L310 160 L420 205 L520 150 L620 195 L740 140 L850 190 L1000 170 L1000 260 L0 260Z" />
      <path className="m-line" d="M0 210 L120 150 L190 180 L300 90 L380 140 L470 60 L560 130 L640 100 L760 170 L860 120 L1000 160" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <path className="m-snow" d="M470 60 L452 75 L470 70 L488 76Z" opacity="0.5" />
      <path className="m-snow" d="M300 90 L286 101 L300 97 L313 102Z" opacity="0.4" />
    </svg>
  );
}
