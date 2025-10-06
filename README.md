Mafia — Real-time Multiplayer Social Deduction Game
=================================================

A compact, server-authoritative implementation of the classic social deduction game "Mafia" (also known as Werewolf). Designed as a small, production-minded demo showcasing realtime systems, async server patterns, and a modern React front-end.

Features
--------
- **Real-time multiplayer**: Up to 10+ players in a room with live synchronization via WebSockets.
- **Role-based gameplay**: Dynamic role assignment (Killers, Doctor, Detective, Civilians) with private chats for special roles.
- **Server-authoritative rules**: All game logic, eliminations, and win conditions enforced on the backend to prevent cheating.
- **Interactive voting system**: Players can vote or skip; skips are counted and can prevent eliminations if they outnumber votes.
- **Night summary display**: Players always see what happened at night before win conditions are checked, ensuring fair and transparent gameplay.

Key Technical Highlights
-------------------------
- Server-authoritative game state using FastAPI + python-socketio (ASGI) demonstrating mastery of async patterns.
- Clear separation of concerns: backend enforces rules and timings, frontend is a responsive React/Vite client using socket.io-client for realtime updates.
- Thoughtful UX: host-controlled in-lobby settings, contextual in-game controls, and a defensible game flow that prioritizes player experience (night summary shown before win checks).
- Robustness: defensive coding around async tasks, improved logging for observability, and edge-case handling (skips vs votes, timer cancellations).
- Small, testable codebase that shows system design, concurrency control, and real-time event orchestration.

Table of contents
-----------------
- Project status
- Tech stack
- Architecture and key components
- How to run (dev)
- How to play
- Notable implementation details
- Testing & quality gates
- How this demonstrates engineering strengths
- Next steps & potential improvements

Project status
--------------
- Barebones production-like server (FastAPI + python-socketio)
- Frontend client built with React + Vite
- Basic persistence for chat messages and room state
- Core game flow implemented and hardened against race conditions and async task cancellation

Tech stack
----------
- Backend: Python 3.11+, FastAPI, python-socketio, asyncio
- Persistence: SQLite for in-app chat/messages
- Frontend: React, Vite, socket.io-client
- Tooling: uvicorn for ASGI, standard JS/CSS tooling via npm

Architecture & key components
-----------------------------
- backend/app/main.py — Server: socket.io handlers, room meta management, timers, role assignment, game orchestration, win-condition checks.
- frontend/src — React components including `GamePage.jsx`, `GameLobby.jsx`, `SidePanel.jsx`, `TopDashboard.jsx`, and supportive UI components.
- Realtime flow: server emits `phase`, `night_summary`, `night_result`, `vote_result`, and `room_state` events; clients send `killer_action`, `doctor_action`, `cast_vote`, etc.
- Server-authoritative rules: the server decides eliminations, role assignments, and enforces who can perform which actions.

How to run (development)
------------------------
Prerequisites:
- Python 3.11+ and virtualenv
- Node.js 18+ and npm

1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Start the backend (dev reload)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

2. Frontend

```bash
cd frontend
npm install
npm run dev
# open the Vite dev URL (usually http://localhost:5173)
```

Open the frontend in multiple browser windows to simulate players and test the room flow.

How to play
-----------
High-level flow:
1. Create a room (host) or join a room by code.
2. Host or players ready up. When all players are ready the host starts the game.
3. Roles are assigned: Killers, Doctor, (optional Detective), and Civilians.
4. Night phases:
   - Night start (short transition)
   - Killers select a target (private chat)
   - Doctor has a chance to save a player (private)
   - Night is resolved on the server; `night_result` is emitted
5. Day phases:
   - Day start (open eyes)
   - `night_summary` is shown to all players
   - If no win condition, voting phase begins
   - Players cast votes or skip; skip/abstain implementation respects majority-skips (skips ≥ top-vote prevents elimination)
6. The server checks win conditions after night summary and after any elimination. Repeat until a side wins.

Designer tips & UX decisions
---------------------------
- Server shows `night_summary` before checking win conditions so players always see what actually happened at night (fixes abrupt endings where a killer could win without players seeing the kill).
- Skips matter: the voting implementation treats skip/abstain as a legitimate outcome; if skips are equal to or greater than the top-vote count, no elimination occurs.
- Defensive coding: timers are scheduled as tasks when appropriate and we catch CancelledError to avoid silent task termination.

Testing & quality gates
-----------------------
- Run the backend with `uvicorn` and open multiple clients to validate flows manually.
- Important checks: joining/leaving rooms, role assignment correctness, timer cancellation (doctor/killer/voting), vote resolution behavior with many skips, and night-summary always displayed.

How this demonstrates engineering strengths
------------------------------------------
- Real-time systems: shows knowledge of socket.io, event ordering, and distributed state synchronization.
- Concurrency & async: careful use of asyncio tasks, cancellation handling, and timing-critical flows.
- System design: server-authoritative model to avoid client-side cheating.
- UX empathy: small delays for transitions, explicit night summaries, and skip-aware voting rules.

Next steps & potential improvements
----------------------------------
- Add unit tests for core server functions (role assignment, vote resolution, win checks).
- Implement E2E tests with headless browsers for multi-player validation.
- Add Docker support and CI/CD pipelines for automated testing and deployment.
- Enhance persistence with room state snapshots and player reconnection handling.

Contact
-------
This repo is a concise demonstration of realtime engineering skills. If you'd like to collaborate or see a demo, please contact the project owner directly (do not open sensitive requests or private data in the public repo).

AI assistance & development notes
--------------------------------
During development, AI tools were used to speed up drafting documentation, suggest refactors, and help outline debugging steps. All AI-generated suggestions were reviewed and adapted by the project owner before being applied. The core implementation, architecture decisions, and final code changes were made by the developer and validated through testing.

If you plan to discuss this project, it's good practice to mention that AI was used for documentation and development assistance, and to highlight the parts you personally authored and tested (server logic, async orchestration, and frontend integration).

License
-------
This project is licensed under a Proprietary License. See the [LICENSE](LICENSE) file for details. All rights are reserved, and use is restricted to the copyright holder only. Contact the project owner for any permissions or inquiries.