// Game state
let socket = null;
let gameState = null;
let playerId = null;
let roomCode = null;
let playerName = null;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    connectToServer();
});

function connectToServer() {
    // Connect to the backend server
    socket = io('http://localhost:5000');
    
    socket.on('connect', function() {
        console.log('Connected to server');
        addMessage('Connected to server', 'success');
    });
    
    socket.on('disconnect', function() {
        console.log('Disconnected from server');
        addMessage('Disconnected from server', 'error');
    });
    
    socket.on('error', function(data) {
        console.error('Error:', data);
        addMessage(data.message, 'error');
    });
    
    // Game event listeners
    socket.on('join_success', handleJoinSuccess);
    socket.on('player_joined', handlePlayerJoined);
    socket.on('speaker_set', handleSpeakerSet);
    socket.on('game_started', handleGameStarted);
    socket.on('day_phase_started', handleDayPhaseStarted);
    socket.on('voting_started', handleVotingStarted);
    socket.on('elimination_result', handleEliminationResult);
    socket.on('game_over', handleGameOver);
    socket.on('action_confirmed', handleActionConfirmed);
    socket.on('vote_confirmed', handleVoteConfirmed);
    socket.on('night_action_received', handleNightActionReceived);
    socket.on('vote_update', handleVoteUpdate);
}

function createGame() {
    const name = document.getElementById('player-name').value.trim();
    if (!name) {
        addMessage('Please enter your name', 'error');
        return;
    }
    
    playerName = name;
    
    fetch('http://localhost:5000/api/create-game', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            roomCode = data.room_code;
            joinGameWithCode(roomCode);
        } else {
            addMessage(data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Error creating game:', error);
        addMessage('Failed to create game', 'error');
    });
}

function showJoinGame() {
    document.getElementById('join-game-form').classList.remove('hidden');
}

function joinGame() {
    const name = document.getElementById('player-name').value.trim();
    const code = document.getElementById('room-code').value.trim().toUpperCase();
    
    if (!name || !code) {
        addMessage('Please enter your name and room code', 'error');
        return;
    }
    
    playerName = name;
    roomCode = code;
    joinGameWithCode(code);
}

function joinGameWithCode(code) {
    socket.emit('join_game', {
        room_code: code,
        player_name: playerName
    });
}

function handleJoinSuccess(data) {
    playerId = data.player_id;
    gameState = data.game_state;
    roomCode = gameState.room_code;
    
    addMessage(data.message, 'success');
    showScreen('lobby-screen');
    updateLobby();
}

function handlePlayerJoined(data) {
    gameState = data.game_state;
    updateLobby();
    addMessage(`${data.player.name} joined the game`, 'success');
}

function updateLobby() {
    document.getElementById('lobby-room-code').textContent = roomCode;
    document.getElementById('player-count').textContent = gameState.alive_players.length;
    
    const container = document.getElementById('players-container');
    container.innerHTML = '';
    
    gameState.alive_players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        if (player.id === playerId) {
            playerDiv.classList.add('you');
        }
        
        playerDiv.innerHTML = `
            <span>${player.name} ${player.id === playerId ? '(You)' : ''}</span>
            <div>
                ${gameState.speaker_id === player.id ? '🎙️ Speaker' : ''}
                ${gameState.speaker_id !== player.id ? `<button class="btn" onclick="setSpeaker('${player.id}')">Make Speaker</button>` : ''}
            </div>
        `;
        container.appendChild(playerDiv);
    });
    
    // Enable start button if we have enough players and current player is speaker
    const startBtn = document.getElementById('start-game-btn');
    const canStart = gameState.alive_players.length >= 6 && gameState.speaker_id === playerId;
    startBtn.disabled = !canStart;
}

function setSpeaker(speakerId) {
    socket.emit('set_speaker', { speaker_id: speakerId });
}

function handleSpeakerSet(data) {
    gameState = data.game_state;
    updateLobby();
    addMessage(`${data.speaker_name} is now the speaker`, 'success');
}

function startGame() {
    socket.emit('start_game', {});
}

function handleGameStarted(data) {
    gameState = data.game_state;
    showScreen('game-screen');
    updateGameScreen();
    addMessage(data.message, 'success');
}

function updateGameScreen() {
    if (!gameState) return;
    
    // Update phase indicator
    const phaseIndicator = document.getElementById('phase-indicator');
    let phaseText = '';
    let phaseClass = '';
    
    switch (gameState.phase) {
        case 'night':
            phaseText = '🌙 Night Phase';
            phaseClass = 'phase-night';
            break;
        case 'day':
            phaseText = '☀️ Day Phase';
            phaseClass = 'phase-day';
            break;
        case 'voting':
            phaseText = '🗳️ Voting Phase';
            phaseClass = 'phase-voting';
            break;
        default:
            phaseText = '⏳ Waiting...';
    }
    
    phaseIndicator.textContent = phaseText;
    phaseIndicator.className = `phase-indicator ${phaseClass}`;
    
    // Update role information
    const roleSpan = document.getElementById('your-role');
    const roleDesc = document.getElementById('role-description');
    
    if (gameState.your_role) {
        const roleEmojis = {
            'civilian': '👤',
            'killer': '🔪',
            'doctor': '🩺',
            'detective': '🔍'
        };
        
        const roleDescriptions = {
            'civilian': 'Find and eliminate the killers during day voting.',
            'killer': 'Eliminate players at night. Work with fellow killers.',
            'doctor': 'Save one player each night from elimination.',
            'detective': 'Investigate one player each night to learn if they are a killer.'
        };
        
        roleSpan.textContent = `${roleEmojis[gameState.your_role]} ${gameState.your_role.charAt(0).toUpperCase() + gameState.your_role.slice(1)}`;
        roleSpan.className = `role-badge role-${gameState.your_role}`;
        roleDesc.innerHTML = `<p><strong>Your Mission:</strong> ${roleDescriptions[gameState.your_role]}</p>`;
        
        // Show fellow killers if player is a killer
        if (gameState.your_role === 'killer' && gameState.fellow_killers) {
            const fellowKillers = gameState.fellow_killers.map(k => k.name).join(', ');
            roleDesc.innerHTML += `<p><strong>Fellow Killers:</strong> ${fellowKillers}</p>`;
        }
    }
    
    // Update player lists
    updatePlayerLists();
    
    // Show/hide phase-specific controls
    updatePhaseControls();
    
    // Update speaker controls
    updateSpeakerControls();
}

function updatePlayerLists() {
    const aliveContainer = document.getElementById('alive-players-container');
    const deadContainer = document.getElementById('dead-players-container');
    
    document.getElementById('alive-count').textContent = gameState.alive_count;
    
    aliveContainer.innerHTML = '';
    deadContainer.innerHTML = '';
    
    gameState.alive_players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        if (player.id === playerId) {
            playerDiv.classList.add('you');
        }
        
        playerDiv.innerHTML = `
            <span>${player.name} ${player.id === playerId ? '(You)' : ''}</span>
            <span>${player.votes > 0 ? `📊 ${player.votes} votes` : ''}</span>
        `;
        aliveContainer.appendChild(playerDiv);
    });
    
    gameState.dead_players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item dead';
        
        const roleEmojis = {
            'civilian': '👤',
            'killer': '🔪',
            'doctor': '🩺',
            'detective': '🔍'
        };
        
        playerDiv.innerHTML = `
            <span>${player.name}</span>
            <span>${roleEmojis[player.role]} ${player.role.charAt(0).toUpperCase() + player.role.slice(1)}</span>
        `;
        deadContainer.appendChild(playerDiv);
    });
}

function updatePhaseControls() {
    const nightActions = document.getElementById('night-actions');
    const dayVoting = document.getElementById('day-voting');
    
    nightActions.classList.add('hidden');
    dayVoting.classList.add('hidden');
    
    if (gameState.phase === 'night' && gameState.you_are_alive) {
        showNightActions();
    } else if (gameState.phase === 'voting' && gameState.you_are_alive) {
        showDayVoting();
    }
}

function showNightActions() {
    if (!gameState.your_role || gameState.your_role === 'civilian') return;
    
    const nightActions = document.getElementById('night-actions');
    const targetsContainer = document.getElementById('night-targets');
    
    nightActions.classList.remove('hidden');
    targetsContainer.innerHTML = '';
    
    let actionText = '';
    let actionType = '';
    
    switch (gameState.your_role) {
        case 'killer':
            actionText = 'Choose someone to eliminate:';
            actionType = 'kill';
            break;
        case 'doctor':
            actionText = 'Choose someone to save:';
            actionType = 'save';
            break;
        case 'detective':
            actionText = 'Choose someone to investigate:';
            actionType = 'investigate';
            break;
    }
    
    if (actionType) {
        const titleP = document.createElement('p');
        titleP.textContent = actionText;
        targetsContainer.appendChild(titleP);
        
        gameState.alive_players.forEach(player => {
            if (player.id !== playerId || gameState.your_role === 'doctor') {
                const button = document.createElement('button');
                button.className = 'btn btn-secondary';
                button.textContent = player.name;
                button.onclick = () => performNightAction(actionType, player.id);
                targetsContainer.appendChild(button);
            }
        });
    }
}

function performNightAction(action, targetId) {
    socket.emit('night_action', {
        action: action,
        target_id: targetId
    });
}

function showDayVoting() {
    const dayVoting = document.getElementById('day-voting');
    const targetsContainer = document.getElementById('voting-targets');
    
    dayVoting.classList.remove('hidden');
    targetsContainer.innerHTML = '';
    
    gameState.alive_players.forEach(player => {
        if (player.id !== playerId) {
            const button = document.createElement('button');
            button.className = 'btn btn-danger';
            button.textContent = `Vote ${player.name}`;
            button.onclick = () => vote(player.id);
            targetsContainer.appendChild(button);
        }
    });
}

function vote(targetId) {
    socket.emit('vote', { target_id: targetId });
}

function updateSpeakerControls() {
    const speakerControls = document.getElementById('speaker-controls');
    
    if (gameState.speaker_id === playerId) {
        speakerControls.classList.remove('hidden');
        
        const processNightBtn = document.getElementById('process-night-btn');
        const startVotingBtn = document.getElementById('start-voting-btn');
        const processVotesBtn = document.getElementById('process-votes-btn');
        
        processNightBtn.disabled = gameState.phase !== 'night';
        startVotingBtn.disabled = gameState.phase !== 'day';
        processVotesBtn.disabled = gameState.phase !== 'voting';
    } else {
        speakerControls.classList.add('hidden');
    }
}

function processNight() {
    socket.emit('process_night', {});
}

function startVoting() {
    socket.emit('start_voting', {});
}

function processVotes() {
    socket.emit('process_votes', {});
}

function handleDayPhaseStarted(data) {
    gameState = data.game_state;
    updateGameScreen();
    
    data.results.forEach(result => {
        addMessage(result, 'success');
    });
    
    if (data.investigation_result !== undefined) {
        const result = data.investigation_result ? 'This player IS a killer! 🔪' : 'This player is NOT a killer. 👤';
        addMessage(`Investigation Result: ${result}`, 'success');
    }
}

function handleVotingStarted(data) {
    gameState = data.game_state;
    updateGameScreen();
    addMessage(data.message, 'success');
}

function handleEliminationResult(data) {
    gameState = data.game_state;
    updateGameScreen();
    addMessage(data.message, 'success');
}

function handleGameOver(data) {
    gameState = data.game_state;
    showScreen('game-over-screen');
    
    const title = document.getElementById('game-over-title');
    const message = document.getElementById('game-over-message');
    
    if (data.winner === 'civilians') {
        title.innerHTML = '🎉 Civilians Win!';
        message.textContent = 'The town has successfully identified and eliminated all the killers!';
    } else if (data.winner === 'killers') {
        title.innerHTML = '🔪 Killers Win!';
        message.textContent = 'The killers have taken over the town!';
    }
    
    // Show final player list
    const finalContainer = document.getElementById('final-players-container');
    finalContainer.innerHTML = '';
    
    [...gameState.alive_players, ...gameState.dead_players].forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = `player-item ${!player.is_alive ? 'dead' : ''}`;
        
        const roleEmojis = {
            'civilian': '👤',
            'killer': '🔪',
            'doctor': '🩺',
            'detective': '🔍'
        };
        
        playerDiv.innerHTML = `
            <span>${player.name}</span>
            <span>${roleEmojis[player.role]} ${player.role.charAt(0).toUpperCase() + player.role.slice(1)}</span>
        `;
        finalContainer.appendChild(playerDiv);
    });
    
    addMessage(data.message || 'Game Over!', 'success');
}

function handleActionConfirmed(data) {
    addMessage(data.message, 'success');
}

function handleVoteConfirmed(data) {
    addMessage(data.message, 'success');
}

function handleNightActionReceived(data) {
    addMessage(`${data.player_name} (${data.role}) has submitted their action`, 'success');
}

function handleVoteUpdate(data) {
    gameState = data.game_state;
    updatePlayerLists();
}

function leaveGame() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    goToWelcome();
}

function goToWelcome() {
    showScreen('welcome-screen');
    
    // Reset form
    document.getElementById('player-name').value = '';
    document.getElementById('room-code').value = '';
    document.getElementById('join-game-form').classList.add('hidden');
    
    // Reset game state
    gameState = null;
    playerId = null;
    roomCode = null;
    playerName = null;
    
    // Clear messages
    document.getElementById('game-messages').innerHTML = '';
    
    // Reconnect to server
    if (!socket || !socket.connected) {
        connectToServer();
    }
}

function showScreen(screenId) {
    const screens = document.querySelectorAll('.game-screen');
    screens.forEach(screen => screen.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function addMessage(message, type = 'info') {
    const messagesContainer = document.getElementById('game-messages');
    if (!messagesContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Remove old messages to prevent memory issues
    const messages = messagesContainer.children;
    if (messages.length > 50) {
        messagesContainer.removeChild(messages[0]);
    }
}

// Utility functions
function formatRole(role) {
    const roleNames = {
        'civilian': 'Civilian',
        'killer': 'Killer',
        'doctor': 'Doctor',
        'detective': 'Detective'
    };
    return roleNames[role] || role;
}

// Handle room code input formatting
document.getElementById('room-code').addEventListener('input', function(e) {
    e.target.value = e.target.value.toUpperCase();
});

// Handle enter key on forms
document.getElementById('player-name').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const joinForm = document.getElementById('join-game-form');
        if (!joinForm.classList.contains('hidden')) {
            joinGame();
        } else {
            createGame();
        }
    }
});

document.getElementById('room-code').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        joinGame();
    }
});
