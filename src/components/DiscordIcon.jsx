// Enkel generisk "chat-boble"-ikon; bytt gjerne ut med offisiell Discord-logo fra deres brand-side.
export default function DiscordIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="11" r="1.4" fill="currentColor" />
      <circle cx="15" cy="11" r="1.4" fill="currentColor" />
    </svg>
  );
}
