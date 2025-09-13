import React, { useEffect, useState } from 'react';
import './styles.css';
import SplashScreen from './components/SplashScreen';
import WelcomePage from './components/WelcomePage';
import SidePanel from './components/SidePanel';
import TopDashboard from './components/TopDashboard';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [apiMessage, setApiMessage] = useState('');

  useEffect(() => {
    fetch('http://127.0.0.1:5001/')
      .then(res => res.json())
      .then(data => setApiMessage(data.message || JSON.stringify(data)))
      .catch(() => setApiMessage('Backend not available'));
  }, []);

  if (showSplash) return <SplashScreen onFinish={() => setShowSplash(false)} />;

  return (
    <div className="app-layout">
      <SidePanel />
      <div className="app-main">
        <TopDashboard />
        <WelcomePage onStart={() => alert('Start Game')} apiMessage={apiMessage} />
      </div>
    </div>
  );
}
