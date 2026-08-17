import React from "react";

const ICON_PATHS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M9.5 19.5V14h5v5.5"/>',
  box: '<path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z"/><path d="M3.5 7.5v9L12 21l8.5-4.5v-9"/><path d="M12 12v9"/>',
  truck: '<rect x="1.5" y="7" width="12.5" height="9.5" rx="1"/><path d="M14 10.5h3.7L21 14v2.5h-7"/><circle cx="6" cy="18.5" r="1.7"/><circle cx="17" cy="18.5" r="1.7"/>',
  clipboard: '<rect x="5.5" y="4" width="13" height="17" rx="2"/><path d="M9 4V2.3h6V4"/><path d="M8.5 10.5h7M8.5 14h7M8.5 17.5h4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8L16.3 9"/>',
  alert: '<path d="M12 3.3 21.5 20H2.5L12 3.3Z"/><path d="M12 9.5v4.3"/><circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/>',
  file: '<path d="M6.5 2.5h8l5 5v14h-13v-19Z"/><path d="M14.5 2.5V7.5h5"/><path d="M9 12.5h6M9 15.8h6M9 9.2h2.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 12a7.3 7.3 0 0 0-.15-1.5l1.9-1.4-1.8-3.1-2.2.85a7.4 7.4 0 0 0-2.6-1.5L14.2 2.5h-3.6l-.35 2.85a7.4 7.4 0 0 0-2.6 1.5l-2.2-.85-1.8 3.1 1.9 1.4a7.3 7.3 0 0 0 0 3l-1.9 1.4 1.8 3.1 2.2-.85c.75.65 1.63 1.16 2.6 1.5l.35 2.85h3.6l.35-2.85a7.4 7.4 0 0 0 2.6-1.5l2.2.85 1.8-3.1-1.9-1.4c.1-.5.15-1 .15-1.5Z"/>',
  logout: '<path d="M9.5 21H5.8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2H9.5"/><path d="M16 16.5l4.5-4.5-4.5-4.5"/><path d="M20.5 12H9.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  undo: '<path d="M3.5 7v6h6"/><path d="M3.7 13a9 9 0 1 0 2.7-6.6L3.5 9"/>',
  scale: '<path d="M12 3v18"/><path d="M4.5 8h6M13.5 8h6"/><path d="M4.5 8 2 13.5a2.7 2.7 0 0 0 5 0L4.5 8Z"/><path d="M19.5 8 17 13.5a2.7 2.7 0 0 0 5 0L19.5 8Z"/><path d="M8.5 21h7"/>',
  users: '<circle cx="8.5" cy="8" r="3"/><path d="M2.5 20a6.5 6.5 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 13.3A5.6 5.6 0 0 1 21.5 20"/>',
  download: '<path d="M12 3v12"/><path d="M7 10.5 12 15l5-4.5"/><path d="M4.5 19.5h15"/>',
  arrowR: '<path d="M4 12h16"/><path d="M14 6l6 6-6 6"/>',
  camera: '<path d="M14.5 4h-5L7.8 7H4.5A2.5 2.5 0 0 0 2 9.5v8A2.5 2.5 0 0 0 4.5 20h15a2.5 2.5 0 0 0 2.5-2.5v-8A2.5 2.5 0 0 0 19.5 7h-3.3L14.5 4Z"/><circle cx="12" cy="13.5" r="3"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>'
};

export default function Icon({ name, size = 18, className = "" }) {
  const path = ICON_PATHS[name] || "";
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: path }}
    />
  );
}
