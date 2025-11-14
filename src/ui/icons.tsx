import React from 'react'

export const FolderIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden {...props}>
    <path fill="currentColor" d="M10 4l2 2h8a2 2 0 012 2v1H2V6a2 2 0 012-2h6z"></path>
    <path fill="currentColor" d="M2 9h22v9a2 2 0 01-2 2H4a2 2 0 01-2-2V9z" opacity=".6"></path>
  </svg>
)

export const FileIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden {...props}>
    <path fill="currentColor" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <path fill="currentColor" d="M14 2v6h6" opacity=".6"/>
  </svg>
)

export const BackIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden {...props}>
    <path fill="currentColor" d="M15 6l-6 6 6 6"/>
  </svg>
)
export const ForwardIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden {...props}>
    <path fill="currentColor" d="M9 6l6 6-6 6"/>
  </svg>
)
export const UpIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden {...props}>
    <path fill="currentColor" d="M6 15l6-6 6 6"/>
  </svg>
)
export const HomeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden {...props}>
    <path fill="currentColor" d="M3 10l9-7 9 7v9a2 2 0 01-2 2h-5v-7H10v7H5a2 2 0 01-2-2z"/>
  </svg>
)
export const RefreshIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden {...props}>
    <path fill="currentColor" d="M17.65 6.35A7.95 7.95 0 004 12h2a6 6 0 111.76 4.24l1.42-1.42L4 13v6l2.12-2.12A8 8 0 1020 12h-2a6 6 0 01-0.35 2.06z"/>
  </svg>
)
export const PlayIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden {...props}>
    <path fill="currentColor" d="M8 5v14l11-7z"/>
  </svg>
)

export const LightIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden {...props}>
    <circle cx="12" cy="12" r="5" fill="currentColor"/>
    <g stroke="currentColor" strokeWidth="2">
      <path d="M12 1v3"/><path d="M12 20v3"/>
      <path d="M4.2 4.2l2.1 2.1"/><path d="M17.7 17.7l2.1 2.1"/>
      <path d="M1 12h3"/><path d="M20 12h3"/>
      <path d="M4.2 19.8l2.1-2.1"/><path d="M17.7 6.3l2.1-2.1"/>
    </g>
  </svg>
)
export const DarkIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden {...props}>
    <path fill="currentColor" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
  </svg>
)
export const SystemIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden {...props}>
    <rect x="3" y="4" width="18" height="14" rx="2" fill="currentColor"/>
    <rect x="8" y="20" width="8" height="2" fill="currentColor"/>
  </svg>
)

