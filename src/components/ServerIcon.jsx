import { useEffect, useState } from 'react';

// Gir hver server en egen farge basert på navnet, så reserve-ikonene ikke ser like ut
export function hue(str = '') {
  let h = 0;
  for (const c of str) h = (h * 31 + c.codePointAt(0)) % 360;
  return h;
}

export default function ServerIcon({ server, size = 48, radius }) {
  const icons = server.icons || [`cfxicon://icon/${server.id}`];
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [server.id]);

  const r = radius ?? Math.round(size * 0.29);
  const letter = (server.name || '?').replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase() || '?';

  if (idx >= icons.length) {
    return (
      <div
        className="server-icon fallback"
        style={{
          width: size,
          height: size,
          borderRadius: r,
          fontSize: Math.round(size * 0.42),
          background: `hsl(${hue(server.name || server.id)} 55% 34%)`,
        }}
        aria-hidden="true"
      >
        {letter}
      </div>
    );
  }
  return (
    <img
      className="server-icon"
      src={icons[idx]}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: r }}
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
