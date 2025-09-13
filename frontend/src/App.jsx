import React, { useEffect, useState } from 'react';
import './styles.css';
import SplashScreen from './components/SplashScreen';
import WelcomePage from './components/WelcomePage';
import SidePanel from './components/SidePanel';
import TopDashboard from './components/TopDashboard';
import SlidingPanel from './components/SlidingPanel';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [apiMessage, setApiMessage] = useState('');
  const [activeTab, setActiveTab] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    fetch('http://127.0.0.1:5001/')
      .then(res => res.json())
      .then(data => setApiMessage(data.message || JSON.stringify(data)))
      .catch(() => setApiMessage('Backend not available'));
  }, []);

  if (showSplash) return <SplashScreen onFinish={() => setShowSplash(false)} />;

  function handleTabSelect(tab) {
    setActiveTab(tab);
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
  }

  function renderPanelContent(tab) {
    if (!tab) return null;
    if (tab === 'How to Play') {
      return (
        <div>

          <h4>1. Create a Room</h4>
          <p>One player becomes the Host and sets up the room.</p>
          <p>The Host chooses:</p>
          <ul>
            <li>Number of Killers, Doctors, and Detectives.</li>
            <li>Who will be the Speaker:</li>
            <ul>
              <li><strong>Random Player</strong> → one player acts as Speaker (they don’t play).</li>
              <li><strong>Computer</strong> → system acts as Speaker, so everyone plays.</li>
            </ul>
          </ul>

          <h4>2. Roles Assigned</h4>
          <p>Each player secretly gets a role (Civilian, Killer, Doctor, Detective).</p>
          <p>Only Killers know who their teammates are. Speaker (player or computer) guides the game.</p>

          <h4>3. Night Phase 🌙</h4>
          <ol>
            <li>Everyone “sleeps” (screen dark).</li>
            <li>Killers choose one player to eliminate.</li>
            <li>Doctor(s) choose one player to save.</li>
            <li>Detective(s) may investigate:
              <ul>
                <li>If the chosen player is a Killer, the Speaker announces it next morning.</li>
                <li>If not, only the Detective(s) know.</li>
              </ul>
            </li>
            <li>Once all actions are locked, the night ends.</li>
          </ol>

          <h4>4. Day Phase ☀️</h4>
          <ol>
            <li>Everyone “wakes up.”</li>
            <li>Speaker announces results:
              <ul>
                <li>If Doctor saved the target → “[Name] was attacked but saved by the Doctor.”</li>
                <li>If not saved → “[Name] was eliminated last night.”</li>
              </ul>
            </li>
            <li>All alive players discuss in chat → bluff, accuse, defend.</li>
            <li>Voting begins: each alive player votes to eliminate someone. The eliminated player’s role is revealed, and they become a spectator.</li>
          </ol>

          <h4>5. Repeat</h4>
          <p>Game cycles between Night and Day until:</p>
          <ul>
            <li><strong>Civilians win</strong> → all Killers are eliminated.</li>
            <li><strong>Killers win</strong> → Killers equal or outnumber Civilians.</li>
          </ul>
        </div>
      );
    }
    if (tab === 'Roles Info') {
      return (
        <div>
          <h3>🎲 Roles</h3>
          <ul>
            <li><strong>Civilians 👤</strong> – Ordinary players. No powers. Must work together to find the killers.</li>
            <li><strong>Killers 🔪</strong> – Secretly choose one player to eliminate each night. Win by outnumbering civilians.</li>
            <li><strong>Doctor 🩺</strong> – Each night, chooses one player to “save.” If that player is targeted, they survive.</li>
            <li><strong>Detective 🔍</strong> – Each night, investigates one player and silently learns if they are a killer.</li>
            <li><strong>Speaker 🎙️</strong> – The moderator. Controls the flow, announces results, and ensures fairness. Never plays as a role.</li>
          </ul>

          <h3>⚙️ Setup</h3>
          <ol>
            <li>Gather at least 6 players + 1 Speaker.</li>
            <li>Prepare role cards/slips (Civilians, Killers, Doctor, Detective). Shuffle and deal secretly. Players keep their role hidden. Only killers know each other.</li>
            <li>The Speaker explains the rules and starts the game.</li>
          </ol>

          <h3>🌙 Night Phase</h3>
          <ol>
            <li>Everyone closes their eyes.</li>
            <li>Speaker: “Killers, open your eyes.” Killers silently choose one target. Speaker confirms and says: “Killers, close your eyes.”</li>
            <li>Speaker: “Doctor, open your eyes.” Doctor points to one player to save. Speaker confirms and says: “Doctor, close your eyes.”</li>
            <li>Speaker: “Detective, open your eyes.” Detective points to one player. Speaker silently shows a 👍 if they are a killer, 👎 if not. Speaker says: “Detective, close your eyes.”</li>
            <li>Night ends.</li>
          </ol>

          <h3>☀️ Day Phase</h3>
          <ol>
            <li>Everyone opens their eyes.</li>
            <li>Speaker announces results: if doctor saved the target → “Nobody was eliminated last night.” If not saved → “Last night, [Name] was eliminated.”</li>
            <li>Discussion: All surviving players argue, accuse, and defend themselves.</li>
            <li>Voting: Speaker says: “On the count of three, point to the person you want to eliminate.” Majority vote decides. Eliminated player reveals their role and leaves the game.</li>
          </ol>

          <h3>🏆 Win Conditions</h3>
          <ul>
            <li><strong>Civilians win</strong> → All killers are eliminated.</li>
            <li><strong>Killers win</strong> → Killers equal or outnumber civilians.</li>
          </ul>

          <h3>⚖️ Role Balance</h3>
          <ul>
            <li>6–7 players → 1 Killer, 1 Doctor, rest Civilians (no Detective).</li>
            <li>8–10 players → 2 Killers, 1 Doctor, 1 Detective, rest Civilians.</li>
            <li>11–15 players → 3 Killers, 1 Doctor, 1 Detective, rest Civilians.</li>
          </ul>

          <h3>🎙️ Speaker Script (Full Cycle)</h3>
          <p>Use this word-for-word if you want to keep it smooth.</p>
          <pre style={{whiteSpace: 'pre-wrap'}}>
Game Start

“Everyone, close your eyes.”

“Killers, open your eyes and look around to recognize each other. Close your eyes again.”

“The game begins…”

Night Phase

“Everyone, close your eyes.”

“Killers, open your eyes and choose one person to eliminate.”

(Confirm silently) “Killers, close your eyes.”

“Doctor, open your eyes and choose one person to save.”

(Confirm silently) “Doctor, close your eyes.”

“Detective, open your eyes and choose one person to investigate.”

(Show thumbs up/down) “Detective, close your eyes.”

“Everyone, wake up.”

Day Phase

(Announce result of night: saved or eliminated)

“Discuss who you think the killer is. You have 5 minutes.”

“It’s time to vote. On the count of three, point to the player you want to eliminate.”

(Count votes, announce elimination)

“The town has decided. [Name], you have been eliminated. Reveal your role.”

Repeat until win condition is met.
          </pre>
        </div>
      );
    }
    if (tab === 'About') {
      return (
        <div>
          <p>Thanks for checking the tech stack — here are the main tools and libraries used to build this project:</p>
          <h4>Backend</h4>
          <ul>
            <li>fastapi — lightweight Python web framework</li>
            <li>uvicorn — ASGI server for running FastAPI</li>
            <li>python-dotenv — load environment variables from .env</li>
          </ul>

          <h4>Frontend</h4>
          <ul>
            <li>React — UI library (react, react-dom)</li>
            <li>Vite — dev server and build tool</li>
          </ul>

          <h4>Other notes</h4>
          <ul>
            <li>Styling: single CSS file with CSS custom properties and animations</li>
            <li>Icons: emoji used for lightweight UI; previously used inline SVGs</li>
            <li>Accessibility: focus management and reduced-motion support added</li>
          </ul>
        </div>
      );
    }

    return <div className="panel-placeholder">Content for {tab} will go here — paste your text and I'll render it.</div>;
  }

  return (
    <div className="app-layout">
      <SidePanel onTabSelect={handleTabSelect} activeTab={activeTab || 'How to Play'} />
      <div className="app-main">
        <TopDashboard onTabSelect={handleTabSelect} activeTab={activeTab || 'How to Play'} />
        <WelcomePage onStart={() => alert('Start Game')} apiMessage={apiMessage} />
      </div>

      <SlidingPanel open={panelOpen} title={activeTab || ''} onClose={closePanel}>
        {renderPanelContent(activeTab)}
      </SlidingPanel>
    </div>
  );
}
