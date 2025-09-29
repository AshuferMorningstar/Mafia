import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function PortalSelect({ id, value, onChange, options = [], className = '' }) {
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!open) return;
    const rect = btnRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX, width: rect.width });

    function onDocClick(e) {
      if (btnRef.current && btnRef.current.contains(e.target)) return;
      setOpen(false);
    }
    function onScroll() { setOpen(false); }
    window.addEventListener('click', onDocClick);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('click', onDocClick);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  function toggle() { setOpen((v) => !v); }

  function handleSelect(next) {
    onChange && onChange({ target: { value: next } });
    setOpen(false);
  }

  const menu = open ? (
    createPortal(
      <div
        role="listbox"
        aria-labelledby={id}
        style={{
          position: 'absolute',
          top: coords.top + 'px',
          left: coords.left + 'px',
          minWidth: coords.width + 'px',
          background: '#fff',
          color: '#2b1f12',
          borderRadius: 8,
          boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
          zIndex: 99999,
          padding: '6px 6px',
        }}
      >
        {options.map((opt) => (
          <div
            key={opt.value}
            role="option"
            aria-selected={opt.value === value}
            onClick={() => handleSelect(opt.value)}
            style={{
              padding: '8px 10px',
              cursor: 'pointer',
              borderRadius: 6,
              background: opt.value === value ? 'rgba(0,0,0,0.06)' : 'transparent',
              fontWeight: 700,
            }}
          >
            {opt.label}
          </div>
        ))}
      </div>,
      document.body
    )
  ) : null;

  const currentLabel = options.find((o) => o.value === value)?.label ?? String(value);

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        id={id}
        ref={btnRef}
        type="button"
        className={className}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
      >
        <span style={{ fontWeight: 700 }}>{currentLabel}</span>
        <span aria-hidden style={{ transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {menu}
    </div>
  );
}
