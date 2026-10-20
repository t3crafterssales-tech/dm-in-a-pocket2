// Line icons and the logo, drawn for this app.

const icon = (body: string) =>
  `<svg class="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  plus: icon(`<path d="M12 5v14M5 12h14"/>`),
  trash: icon(`<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>`),
  bin: icon(`<path d="M4 7h16M6 7l1 13h10l1-13M9 7V4h6v3"/><path d="M10 14l2-2 2 2M12 12v5"/>`),
  gear: icon(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`),
  import: icon(`<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>`),
  home: icon(`<path d="M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5"/>`),
  close: icon(`<path d="M6 6l12 12M18 6L6 18"/>`),
  image: icon(`<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>`),
  folder: icon(`<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`),
  book: icon(`<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/>`),
  undo: icon(`<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`),
  redo: icon(`<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>`),
  pencil: icon(`<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>`),
  chevron: icon(`<path d="M9 6l6 6-6 6"/>`),
  clock: icon(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`),
  star: icon(`<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>`),
  layers: icon(`<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>`),
  spark: icon(`<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>`),
  dice: icon(`<path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z"/><path d="M12 7.5l4 7h-8z M12 2.8v4.7M20 7.4l-4 7.1M4 7.4l4 7.1M12 21.2l-4-6.7M12 21.2l4-6.7"/>`),
  globe: icon(`<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z"/>`),
};

/** The logo: a d20 tucked in a pocket. Its glow is the save indicator. */
export const LOGO = `<svg class="logo" viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
  <g class="logo-die" fill="#fffdf8" stroke="#2b2620" stroke-width="2.4" stroke-linejoin="round">
    <path d="M32 4 L45 11.5 V26.5 L32 34 L19 26.5 V11.5 Z"/>
    <path d="M32 11 L39.5 24 H24.5 Z M32 4 V11 M45 11.5 L39.5 24 M19 11.5 L24.5 24 M45 26.5 L39.5 24 M19 26.5 L24.5 24 M32 34 L39.5 24 M32 34 L24.5 24" fill="none" stroke-width="1.8"/>
  </g>
  <path class="logo-pocket" d="M9 22 H55 V43 Q55 46 52.5 47.5 L33.5 58.5 Q32 59.3 30.5 58.5 L11.5 47.5 Q9 46 9 43 Z" fill="#8a4b2a" stroke="#2b2620" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M13.5 26.5 H50.5 V42 Q50.5 43.6 49 44.5 L32 54.3 L15 44.5 Q13.5 43.6 13.5 42 Z" fill="none" stroke="#f3d9b8" stroke-width="1.4" stroke-dasharray="3 2.6"/>
</svg>`;
