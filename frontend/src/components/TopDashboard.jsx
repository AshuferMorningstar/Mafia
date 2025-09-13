import React, { useState, useRef, useEffect } from 'react';
import '../styles.css';

export default function TopDashboard({ onMenuToggle, onTabSelect, activeTab = 'How to Play' }) {
  const tabs = ['How to Play', 'Roles Info', 'Game Tips', 'About', 'Settings'];
  const [open, setOpen] = useState(false);
  const popRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  function handleTab(t) {
    setOpen(false);
    onTabSelect && onTabSelect(t);
  }

  return (
    <header className="top-dashboard">
      <div className="dash-left">
        <span className="dash-title metallic-gradient shine-animated">Mafia</span>
      </div>

      {/* inline tabs removed — tabs now live in side panel and sandwich menu popover */}

      <div className="dash-right">
        <button
          className="dash-menu metallic-gradient shine-animated"
          aria-label="Open menu"
          onClick={(e) => { e.stopPropagation(); setOpen((s) => !s); if (!open && onMenuToggle) onMenuToggle(); }}
        >
          <span className="bar" />
          <span className="bar" />
          <span className="bar" />
        </button>

        {open && (
          <div className="menu-popover" ref={popRef} role="dialog" aria-label="Menu">
            {tabs.map((t) => (
              <button key={t} className={`panel-tab ${t === activeTab ? 'active' : ''}`} onClick={() => handleTab(t)} aria-pressed={t === activeTab}>
                <span className="tab-icon" aria-hidden>
                  {t === 'How to Play' ? '📘' : t === 'Roles Info' ? '🎭' : t === 'Game Tips' ? '💡' : t === 'About' ? 'ℹ️' : '⚙️'}
                </span>
                <span className="tab-label">{t}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

