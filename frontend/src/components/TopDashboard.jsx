import React from 'react';
import '../styles.css';

export default function TopDashboard() {
  return (
    <header className="top-dashboard">
      <div className="dash-left">
        <img src="/mafialogo.png" alt="logo" className="dash-logo" />
        <span className="dash-title">Mafia</span>
      </div>
      <div className="dash-right">
        <button className="dash-btn">New Room</button>
      </div>
    </header>
  );
}
