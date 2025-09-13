import React from 'react';
import '../styles.css';

export default function SidePanel() {
  return (
    <aside className="side-panel">
      <div className="panel-brand">
        <h2 className="panel-title metallic-gradient shine-animated">Mafia</h2>
      </div>
      <nav className="panel-nav">
        <button className="panel-item">Home</button>
        <button className="panel-item">Rooms</button>
        <button className="panel-item">Profile</button>
        <button className="panel-item">Settings</button>
      </nav>
      <div className="panel-footer">v0.1</div>
    </aside>
  );
}
