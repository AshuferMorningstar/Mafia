import React, { useEffect, useRef } from 'react';
import '../styles.css';

export default function SlidingPanel({ open, title, onClose, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (open) {
      // focus the close button when panel opens
      setTimeout(() => closeRef.current && closeRef.current.focus(), 80);
      // prevent background scroll while open
      document.body.classList.add('no-scroll');
    } else {
      // if some element inside the panel still has focus, blur it to avoid aria-hidden conflict
      try {
        if (panelRef.current && panelRef.current.contains(document.activeElement)) {
          document.activeElement.blur && document.activeElement.blur();
        }
      } catch (e) {
        // ignore
      }
      document.body.classList.remove('no-scroll');
    }
  }, [open]);

  return (
    <div className={`sliding-root ${open ? 'open' : ''}`}>
      <div className="sliding-backdrop" onClick={onClose} />
      <aside ref={panelRef} className="sliding-panel" role="dialog" aria-label={title} aria-hidden={!open}>
        <div className="sliding-header">
          <h3 className="sliding-title">{title}</h3>
          <button ref={closeRef} className="sliding-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sliding-body">{children}</div>
      </aside>
    </div>
  );
}
