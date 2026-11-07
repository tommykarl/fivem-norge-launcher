// Blått verifisert-merke og rødt Staff-skjold etter navnet – samme som på nettsiden
export default function NameTags({ verified, staff, size = 16 }) {
  if (!verified && !staff) return null;
  return (
    <span className="name-tags">
      {verified && (
        <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Verifisert">
          <title>Verifisert</title>
          <path fill="#3B82F6" d="M12 1.5l2.6 1.9 3.2-.2 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3.1L2.6 15.8l1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.2z" />
          <path d="M8 12.3l2.7 2.7L16.2 9.4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {staff && (
        <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Staff">
          <title>Staff i FiveM Norge</title>
          <path d="M12 1.8l8.6 3.2v6.4c0 5-3.6 9.3-8.6 10.8C7 20.7 3.4 16.4 3.4 11.4V5z" fill="#D92B43" />
          <path d="M8.4 11.9l2.5 2.5 4.8-4.9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
