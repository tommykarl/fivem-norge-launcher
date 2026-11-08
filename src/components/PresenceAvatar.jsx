// Profilbilde med grønn prikk når vennen er pålogget på nettsiden eller i launcheren
export default function PresenceAvatar({ src, name = '', online, size = 40 }) {
  return (
    <span className={online ? 'pres on' : 'pres'} style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" width={size} height={size} /> : <span className="chat-ph">{String(name).charAt(0).toUpperCase()}</span>}
      {online && <i role="img" aria-label="Pålogget" title="Pålogget" />}
    </span>
  );
}
