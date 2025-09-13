import React from 'react';
import '../styles.css';

export default function TopDashboard({ onMenuToggle }) {
  return (
    <header className="top-dashboard">
      <div className="dash-left">
        <span className="dash-title metallic-gradient shine-animated">Mafia</span>
      </div>
      <div className="dash-right">
        <button
          className="dash-menu metallic-gradient shine-animated"
          aria-label="Open menu"
          onClick={() => onMenuToggle && onMenuToggle()}
        >
          <span className="bar" />
          <span className="bar" />
          <span className="bar" />
        </button>
      </div>
    </header>
  );
}
