import React, { useEffect, useState } from 'react';
import './styles.css';
import SplashScreen from './components/SplashScreen';
import WelcomePage from './components/WelcomePage';
import CreateRoom from './components/CreateRoom';
import SidePanel from './components/SidePanel';
import TopDashboard from './components/TopDashboard';
import SlidingPanel from './components/SlidingPanel';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [apiMessage, setApiMessage] = useState('');
  const [activeTab, setActiveTab] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [page, setPage] = useState('home');

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
    if (tab === 'Game Tips') {
      return (
        <div>
          <h4>1. Speaker (Moderator)</h4>
          <ul>
            <li>Stay neutral. Never give away hints with tone or expressions.</li>
            <li>Keep the flow fast and smooth.</li>
            <li>Announce results clearly and fairly.</li>
            <li>If computer-controlled, follow the script exactly to avoid bias.</li>
          </ul>

          <h4>2. Killer (Mafia)</h4>
          <ul>
            <li>Coordinate silently with your fellow killers (if more than one).</li>
            <li>Blend in during the day — talk and accuse like a civilian.</li>
            <li>Avoid being too quiet or too aggressive, both raise suspicion.</li>
            <li>Push suspicion onto others subtly instead of defending yourself too hard.</li>
          </ul>

          <h4>3. Doctor</h4>
          <ul>
            <li>Try to guess who the Mafia will target — usually active or trusted players.</li>
            <li>Don’t always save the same person, you’ll become predictable.</li>
            <li>If allowed, saving yourself occasionally is smart, but don’t overdo it.</li>
            <li>Pay attention to who seems important in discussions, they may need saving.</li>
          </ul>

          <h4>4. Detective</h4>
          <ul>
            <li>Use your investigation wisely — you only get one shot (or limited uses if multiple detectives).</li>
            <li>Don’t reveal your role immediately, it makes you an easy Mafia target.</li>
            <li>If you discover a Killer, wait for the right moment to push suspicion without outing yourself too early.</li>
            <li>Work with civilians subtly — give hints without directly saying you’re the Detective.</li>
          </ul>

          <h4>5. Civilian</h4>
          <ul>
            <li>Observe behavior — who’s quiet, who’s deflecting, who’s acting nervous.</li>
            <li>Don’t follow the crowd blindly, Mafia often hide in majority votes.</li>
            <li>Speak up and defend yourself when accused. Silence looks guilty.</li>
            <li>Use voting power carefully — one wrong vote can cost the game.</li>
          </ul>
        </div>
      );
    }
    if (tab === 'Roles Info') {
      return (
        <div>
          <h4>1. Speaker</h4>
          <p>Moderates the game: controls phases, announces night/day results, and ensures fair play.</p>
          <p>Can be a random player (who sits out) or the computer (automated moderator).</p>
          <p>Does not have a role in the gameplay (no vote, no night actions).</p>

          <h4>2. Killer</h4>
          <p>Secretly selects one player to eliminate each night (may be a team if multiple killers).</p>
          <p>Only Killers know each other.</p>
          <p><strong>Win condition:</strong> Killers equal or outnumber remaining Civilians.</p>

          <h4>3. Detective</h4>
          <p>Has one investigation for the whole game.</p>
          <p>When they investigate a player at night:</p>
          <ul>
            <li>If the target is a Killer, the Speaker publicly announces that player’s role the next morning.</li>
            <li>If the target is not a Killer, only the Detective learns the truth (no public announcement).</li>
          </ul>
          <p>After using the power, the Detective becomes a normal Civilian.</p>

          <h4>4. Doctor</h4>
          <p>Each night chooses one player to protect (can choose self).</p>
          <p>If Killers target the protected player, the Speaker announces: “That player was attacked but saved by the Doctor.”</p>
          <p>Cannot protect the same player two nights in a row.</p>

          <h4>5. Civilian</h4>
          <p>No special powers.</p>
          <p>Main tools: discussion, observation, and voting to find and eliminate Killers.</p>
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
        {page === 'home' && (
          <WelcomePage onStart={() => alert('Start Game')} onCreate={() => setPage('create')} apiMessage={apiMessage} />
        )}
        {page === 'create' && (
          <CreateRoom onEnterLobby={() => alert('Entering lobby...')} onBack={() => setPage('home')} />
        )}
      </div>

      <SlidingPanel open={panelOpen} title={activeTab || ''} onClose={closePanel}>
        {renderPanelContent(activeTab)}
      </SlidingPanel>
    </div>
  );
}
