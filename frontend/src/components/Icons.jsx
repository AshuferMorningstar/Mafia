import React from 'react';

export default function Icon({ name }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' };

  switch (name) {
    case 'How to Play':
      // book icon
      return (
        <svg {...common} aria-hidden>
          <path d="M6 2h9a2 2 0 012 2v16a1 1 0 01-1 1H6a2 2 0 01-2-2V4a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 4v14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'Roles Info':
      // mask icon
      return (
        <svg {...common} aria-hidden>
          <path d="M2 12c4 6 10 6 10 6s6 0 10-6c0 0-2-8-10-8S2 12 2 12z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M8.5 10a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM18 10a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" fill="currentColor" />
        </svg>
      );
    case 'Game Tips':
      // bulb icon
      return (
        <svg {...common} aria-hidden>
          <path d="M9 18h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 6a6 6 0 114 0c0 2-1.5 3-2 4s0 3 0 3H10s1-1 0-3-2-2-2-4z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case 'About':
      // info icon
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M12 8h.01M11 12h2v4h-2z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'Settings':
      // gear icon
      return (
        <svg {...common} aria-hidden>
          <path d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06A2 2 0 113 17.38l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82L4.21 6.1A2 2 0 116.04 3.27l.06.06A1.65 1.65 0 008 3.66c.5-.3 1.1-.5 1.82-.5h.36c.72 0 1.32.2 1.82.5.46.28 1 .31 1.44.07.5-.27 1.08-.55 1.82-.55.72 0 1.32.2 1.82.5.46.28 1 .31 1.44.07l.06-.06A2 2 0 1120.73 6.04l-.06.06c-.28.5-.5 1.1-.5 1.82 0 .72.2 1.32.5 1.82.28.46.31 1 .07 1.44z" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      );
  }
}
