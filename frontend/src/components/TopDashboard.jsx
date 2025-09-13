import React from 'react';
import '../styles.css';

export default function TopDashboard() {
  return (
    <header className="top-dashboard">
      <div className="dash-left">
        <span className="dash-title metallic-gradient shine-animated">Mafia</span>
      </div>
      <div className="dash-right">
        <button className="dash-btn">New Room</button>
      </div>
    </header>
  );
}
