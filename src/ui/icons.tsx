// Small inline icons. Decorative: buttons carry their own aria-labels.

const base = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true } as const;

export const CloseIcon = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const HelpIcon = () => (
  <svg {...base}>
    <path
      d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="12" cy="17.5" r="1.2" fill="currentColor" />
  </svg>
);

export const PauseIcon = () => (
  <svg {...base}>
    <rect x="7" y="6" width="3.5" height="12" rx="1" fill="currentColor" />
    <rect x="13.5" y="6" width="3.5" height="12" rx="1" fill="currentColor" />
  </svg>
);

export const PlayIcon = () => (
  <svg {...base}>
    <path d="M8 5.5v13l10.5-6.5L8 5.5z" fill="currentColor" />
  </svg>
);

export const SpeakerIcon = ({ muted }: { muted: boolean }) => (
  <svg {...base}>
    <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" />
    {muted ? (
      <path d="M15.5 9.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    ) : (
      <path d="M15.5 9a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    )}
  </svg>
);

export const ChevronIcon = () => (
  <svg {...base} width={20} height={20}>
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
