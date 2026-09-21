import type { ReactNode } from 'react';

export type IconName =
  | 'brand'
  | 'inbox'
  | 'today'
  | 'upcoming'
  | 'done'
  | 'plus'
  | 'x'
  | 'chev'
  | 'more'
  | 'cal'
  | 'clock'
  | 'flag'
  | 'trash'
  | 'check'
  | 'search'
  | 'repeat'
  | 'grip'
  | 'settings'
  | 'select'
  | 'sparkle';

interface IconDef {
  node: ReactNode;
  fill?: boolean;
  sw?: number;
}

const DEFS: Record<IconName, IconDef> = {
  brand: {
    node: (
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H9l1.2 2H19a1 1 0 0 1 1 1v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18Z" />
    )
  },
  inbox: {
    node: (
      <>
        <path d="M3.5 13h5l1 2h5l1-2h5" />
        <path d="M5.2 5.5h13.6l1.7 7.5v4.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V13Z" />
      </>
    )
  },
  today: {
    node: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
      </>
    )
  },
  upcoming: {
    node: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
      </>
    )
  },
  done: {
    node: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8.3 12.4l2.6 2.5 4.8-5" />
      </>
    )
  },
  plus: { node: <path d="M12 5v14M5 12h14" />, sw: 2 },
  x: { node: <path d="M6 6l12 12M18 6L6 18" />, sw: 1.9 },
  chev: { node: <path d="M6 9.5l6 6 6-6" />, sw: 2 },
  more: {
    node: (
      <>
        <circle cx="5.5" cy="12" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="18.5" cy="12" r="1.5" />
      </>
    ),
    fill: true
  },
  cal: {
    node: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
      </>
    ),
    sw: 1.8
  },
  clock: {
    node: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 1.8" />
      </>
    ),
    sw: 1.8
  },
  flag: { node: <path d="M6 21V4M6 5h11l-1.6 3.6L17 12H6" />, sw: 1.8 },
  trash: { node: <path d="M4.5 7h15M9.5 7V5h5v2M7 7l1 12.5h8L17 7" />, sw: 1.8 },
  check: { node: <path d="M5 12.6l4.6 4.4L19 6.5" />, sw: 3.2 },
  search: {
    node: (
      <>
        <circle cx="10.8" cy="10.8" r="6.3" />
        <path d="M15.6 15.6L20.5 20.5" />
      </>
    ),
    sw: 1.8
  },
  repeat: {
    node: (
      <>
        <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3M19.5 12a7.5 7.5 0 0 1-12.8 5.3" />
        <path d="M17.6 3.2v3.6h-3.6M6.4 20.8v-3.6h3.6" />
      </>
    ),
    sw: 1.7
  },
  grip: {
    node: (
      <>
        <circle cx="9.5" cy="6" r="1.4" />
        <circle cx="14.5" cy="6" r="1.4" />
        <circle cx="9.5" cy="12" r="1.4" />
        <circle cx="14.5" cy="12" r="1.4" />
        <circle cx="9.5" cy="18" r="1.4" />
        <circle cx="14.5" cy="18" r="1.4" />
      </>
    ),
    fill: true
  },
  settings: {
    node: (
      <>
        <circle cx="12" cy="12" r="2.9" />
        <path d="M12 3.2l1.1 1.9 2.1-.6.5 2.1 2.1.5-.6 2.1 1.9 1.1-1.9 1.1.6 2.1-2.1.5-.5 2.1-2.1-.6L12 20.8l-1.1-1.9-2.1.6-.5-2.1-2.1-.5.6-2.1L4.9 13l1.9-1.1-.6-2.1 2.1-.5.5-2.1 2.1.6z" />
      </>
    ),
    sw: 1.5
  },
  select: {
    node: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
        <path d="M8.2 12.3l2.4 2.3 4.6-4.8" />
      </>
    ),
    sw: 1.7
  },
  sparkle: {
    node: (
      <>
        <path d="M11 3.5l1.7 4.8 4.8 1.7-4.8 1.7L11 16.5 9.3 11.7 4.5 10l4.8-1.7z" />
        <path d="M18 15l.8 2.2 2.2.8-2.2.8L18 21l-.8-2.2-2.2-.8 2.2-.8z" />
      </>
    ),
    sw: 1.5
  }
};

export function Icon({
  name,
  size = 16,
  className
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const def = DEFS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      fill={def.fill ? 'currentColor' : 'none'}
      stroke={def.fill ? 'none' : 'currentColor'}
      strokeWidth={def.sw ?? 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {def.node}
    </svg>
  );
}
