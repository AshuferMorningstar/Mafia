import React from 'react';
import '../styles.css';

export default function SidePanel({ onTabSelect, activeTab = 'How to Play' }) {
  const tabs = ['How to Play', 'Roles Info', 'Game Tips', 'About'];

  return (
    <aside className="side-panel">
      <div className="panel-brand">
        <h2 className="panel-title metallic-gradient shine-animated">Mafia</h2>
      </div>

      <nav className="panel-tabs" aria-label="Side navigation">
        {tabs.map((t) => (
          <button
            key={t}
            className={`panel-tab ${t === activeTab ? 'active' : ''}`}
            onClick={() => onTabSelect && onTabSelect(t)}
            aria-pressed={t === activeTab}
          >
            <span className="tab-icon" aria-hidden>
              {t === 'How to Play' ? '📘' : t === 'Roles Info' ? '🎭' : t === 'Game Tips' ? '💡' : 'ℹ️'}
            </span>
            <span className="tab-label">{t}</span>
          </button>
        ))}
      </nav>

      <div className="panel-footer">made with ❤️ by Ashufer</div>
    </aside>
  );
}
