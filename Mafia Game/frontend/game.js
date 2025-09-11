// END OF FILE FIX: Add missing closing brace if needed
// Game state
let socket = null;
let gameState = null;
let playerId = null;
let roomCode = null;
let playerName = null;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    showSplashScreen();
});

// Splash Screen Functions
function showSplashScreen() {
    // Show splash screen for 3 seconds, then fade to main game
    setTimeout(() => {
        hideSplashScreen();
    }, 3000);
}

function hideSplashScreen() {
    const splashScreen = document.getElementById('splash-screen');
    const topLogoSection = document.getElementById('top-logo-section');
    const welcomeScreen = document.getElementById('welcome-screen');
    
    // Fade out splash screen
    splashScreen.classList.add('fade-out');
    
    // After fade animation, show top logo and welcome screen, then connect to server
    setTimeout(() => {
        splashScreen.style.display = 'none';
        topLogoSection.style.display = 'block';
        welcomeScreen.style.display = 'flex';
        welcomeScreen.classList.add('active');
        connectToServer();
    }, 500);
}

function connectToServer() {
    // Connect to the backend server
    socket = io('http://127.0.0.1:5001');
    
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
    socket.on('chat_message', handleChatMessage);
    socket.on('speaker_setting_changed', handleSpeakerSettingChanged);
}

// Navigation functions
function showCreateGame() {
    showScreen('create-game-screen');
}

function showJoinGame() {
    showScreen('join-game-screen');
}

function goToWelcome() {
    showScreen('welcome-screen');
}

function createGame() {
    const name = document.getElementById('create-player-name').value.trim();
    if (!name) {
        addMessage('Please enter your name', 'error');
        return;
    }
    
    playerName = name;
    
    fetch('http://127.0.0.1:5001/api/create-game', {
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

function joinGame() {
    const name = document.getElementById('join-player-name').value.trim();
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
    console.log('[DEBUG] joinGameWithCode called. Code:', code, 'PlayerName:', playerName);
    if (!socket || !socket.connected) {
        addMessage('Not connected to server. Please refresh the page.', 'error');
        console.error('[DEBUG] Socket not connected when trying to join game.');
        return;
    }
    socket.emit('join_game', {
        room_code: code,
        player_name: playerName
    });
    console.log('[DEBUG] join_game event emitted.');
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
        
        let badges = '';
        if (player.id === gameState.host_id) {
            badges += '<span class="host-badge">👑 Host</span>';
        }
        if (player.id === gameState.speaker_id) {
            badges += '<span class="speaker-badge">🎙️ Speaker</span>';
        }
        
        playerDiv.innerHTML = `
            <span>${player.name} ${player.id === playerId ? '(You)' : ''} ${badges}</span>
            <div>
                ${gameState.speaker_id !== player.id && gameState.you_are_host && !gameState.game_settings?.random_speaker ? 
                    `<button class="btn" onclick="setSpeaker('${player.id}')">Make Speaker</button>` : ''}
            </div>
        `;
        container.appendChild(playerDiv);
    });
    
    // Show/hide speaker settings based on host status
    const speakerSettings = document.getElementById('speaker-settings');
    if (gameState.you_are_host) {
        speakerSettings.classList.add('host-only');
        
        // Update random speaker toggle
        const randomToggle = document.getElementById('random-speaker-toggle');
        randomToggle.checked = gameState.game_settings?.random_speaker || false;
        
        // Show/hide manual controls based on random speaker setting
        const manualControls = document.getElementById('manual-speaker-controls');
        if (gameState.game_settings?.random_speaker) {
            manualControls.style.display = 'block';
        } else {
            manualControls.style.display = 'none';
        }
    } else {
        speakerSettings.classList.remove('host-only');
    }
    
    // Enable start button if we have enough players and current player is speaker
    const startBtn = document.getElementById('start-game-btn');
    const speakerNotice = document.getElementById('speaker-requirement');
    const canStart = gameState.alive_players.length >= 6 && gameState.you_are_speaker;
    const hasEnoughPlayers = gameState.alive_players.length >= 6;
    const hasSpeaker = gameState.speaker_id !== null;
    
    startBtn.disabled = !canStart;
    
    // Show/hide speaker requirement notice
    if (hasEnoughPlayers && !hasSpeaker && gameState.you_are_host) {
        speakerNotice.classList.remove('hidden');
    } else {
        speakerNotice.classList.add('hidden');
    }
    
    // Update chat messages
    updateChatMessages();
}

function setSpeaker(speakerId) {
    socket.emit('set_speaker', { speaker_id: speakerId });
}

function handleSpeakerSet(data) {
    gameState = data.game_state;
    updateLobby();
    
    if (data.was_random) {
        addMessage(`${data.speaker_name} was randomly selected as the speaker! 🎲`, 'success');
    } else {
        addMessage(`${data.speaker_name} is now the speaker`, 'success');
    }
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

function createGame() {
    const name = document.getElementById('create-player-name')?.value.trim();
    console.log('[DEBUG] createGame called. Name:', name);
    if (!name) {
        addMessage('Please enter your name', 'error');
        return;
    }
    playerName = name;
    console.log('[DEBUG] Sending POST to /api/create-game');
    fetch('http://127.0.0.1:5001/api/create-game', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        console.log('[DEBUG] Got response from /api/create-game', response);
        if (!response.ok) {
            addMessage('API error: ' + response.status + ' ' + response.statusText, 'error');
        }
        return response.json();
    })
    .then(data => {
        console.log('[DEBUG] Response JSON:', data);
        if (data.success) {
            roomCode = data.room_code;
            console.log('[DEBUG] Room created. Code:', roomCode);
            joinGameWithCode(roomCode);
        } else {
            addMessage(data.message || 'Failed to create game', 'error');
        }
    })
    .catch(error => {
        console.error('[DEBUG] Error creating game:', error);
        addMessage('Failed to create game: ' + error, 'error');
    });
}

function updateGameScreen() {
    // Update role and description
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
        if (gameState.your_role === 'killer' && gameState.fellow_killers && gameState.fellow_killers.length > 0) {
            const fellowKillers = gameState.fellow_killers.map(k => 
                `<span class="role-badge role-killer">${k.name}</span>`
            ).join(' ');
            roleDesc.innerHTML += `<p><strong>🔪 Fellow Killers:</strong><br>${fellowKillers}</p>`;
        } else if (gameState.your_role === 'killer') {
            roleDesc.innerHTML += `<p><strong>🔪 Fellow Killers:</strong> You are the only killer!</p>`;
        }
    }
    
    // Update player lists
    updatePlayerLists();
    
    // Show/hide phase-specific controls
    updatePhaseControls();
    
    // Update speaker controls
    updateSpeakerControls();
    
    // Update chat messages
    updateChatMessages();
}

function updatePlayerLists() {
    const aliveContainer = document.getElementById('alive-players-container');
    const deadContainer = document.getElementById('dead-players-container');
    
    document.getElementById('alive-count').textContent = gameState.alive_count;
    
    aliveContainer.innerHTML = '';
    deadContainer.innerHTML = '';
    
    const roleEmojis = {
        'civilian': '👤',
        'killer': '🔪',
        'doctor': '🩺',
        'detective': '🔍'
    };
    
    // Display alive players
    gameState.alive_players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        if (player.id === playerId) {
            playerDiv.classList.add('you');
        }
        
        let roleDisplay = '';
        if (player.role) {
            const roleName = player.role.charAt(0).toUpperCase() + player.role.slice(1);
            roleDisplay = `<span class="role-badge role-${player.role}">${roleEmojis[player.role]} ${roleName}</span>`;
        }
        
        playerDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span>${player.name} ${player.id === playerId ? '(You)' : ''}</span>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    ${roleDisplay}
                    ${player.votes > 0 ? `<span>📊 ${player.votes} votes</span>` : ''}
                </div>
            </div>
        `;
        aliveContainer.appendChild(playerDiv);
    });
    
    // Display dead players (always show roles)
    gameState.dead_players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item dead';
        
        const roleName = player.role.charAt(0).toUpperCase() + player.role.slice(1);
        const roleDisplay = `<span class="role-badge role-${player.role}">${roleEmojis[player.role]} ${roleName}</span>`;
        
        playerDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span>${player.name}</span>
                ${roleDisplay}
            </div>
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
    
    if (gameState.you_are_speaker) {
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

// Chat Functions
function sendChatMessage() {
    const currentScreen = document.querySelector('.game-screen.active').id;
    let inputId = '';
    
    if (currentScreen === 'lobby-screen') {
        inputId = 'lobby-chat-input';
    } else if (currentScreen === 'game-screen') {
        inputId = 'chat-input';
    }
    
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const message = input.value.trim();
    if (!message) return;
    
    socket.emit('send_chat_message', { message: message });
    input.value = '';
}

function handleChatMessage(data) {
    addChatMessage(data.message);
}

function addChatMessage(message) {
    // Defensive: skip if message is missing required fields
    if (!message || typeof message !== 'object') return;
    if (message.type === undefined || message.message === undefined) return;
    if (typeof message.timestamp !== 'number') return;
    if (message.type !== 'system' && !message.player_name) return;

    const currentScreen = document.querySelector('.game-screen.active').id;
    let containerId = '';
    
    if (currentScreen === 'lobby-screen') {
        containerId = 'lobby-chat-messages';
    } else if (currentScreen === 'game-screen') {
        containerId = 'chat-messages';
    }
    
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${message.type}`;
    
    const time = new Date(message.timestamp * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    if (message.type === 'system') {
        messageDiv.innerHTML = `
            <div class="chat-message-header">
                <span class="chat-message-sender">System</span>
                <span class="chat-message-time">${time}</span>
            </div>
            <div class="chat-message-content">${message.message}</div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="chat-message-header">
                <span class="chat-message-sender">${message.player_name}</span>
                <span class="chat-message-time">${time}</span>
            </div>
            <div class="chat-message-content">${message.message}</div>
        `;
    }
    
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
    
    // Remove old messages to prevent memory issues
    const messages = container.children;
    if (messages.length > 100) {
        container.removeChild(messages[0]);
    }
}

function updateChatMessages() {
    if (!gameState || !gameState.chat_messages) return;
    
    const currentScreen = document.querySelector('.game-screen.active').id;
    let containerId = '';
    
    if (currentScreen === 'lobby-screen') {
        containerId = 'lobby-chat-messages';
    } else if (currentScreen === 'game-screen') {
        containerId = 'chat-messages';
    }
    
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Clear and rebuild chat messages
    container.innerHTML = '';
    
    gameState.chat_messages.forEach(message => {
        if (!message || typeof message !== 'object') return;
        if (message.type === undefined || message.message === undefined) return;
        if (typeof message.timestamp !== 'number') return;
        if (message.type !== 'system' && !message.player_name) return;
        addChatMessage(message);
    });
}

function updateSpeakerControls() {
    const speakerControls = document.getElementById('speaker-controls');
    
    if (gameState.you_are_speaker) {
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
    
    const roleEmojis = {
        'civilian': '👤',
        'killer': '🔪',
        'doctor': '🩺',
        'detective': '🔍'
    };
    
    // Combine all players and sort by alive status
    const allPlayers = [...gameState.alive_players, ...gameState.dead_players];
    allPlayers.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = `player-item ${!player.is_alive ? 'dead' : ''}`;
        
        const roleName = player.role ? player.role.charAt(0).toUpperCase() + player.role.slice(1) : 'Unknown';
        const roleDisplay = player.role ? `${roleEmojis[player.role]} ${roleName}` : '❓ Unknown';
        
        playerDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span>${player.name} ${player.is_alive ? '(Alive)' : '(Dead)'}</span>
                <span class="role-badge role-${player.role || 'unknown'}">${roleDisplay}</span>
            </div>
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
    const welcomeScreen = document.getElementById('welcome-screen');
    const mainContainer = document.getElementById('main-container');
    const originalHeader = document.getElementById('original-header');
    
    // Remove active class from all screens
    screens.forEach(screen => {
        screen.classList.remove('active');
        if (screen.id !== screenId) {
            setTimeout(() => {
                screen.style.display = 'none';
            }, 200);
        }
    });
    
    if (screenId === 'welcome-screen') {
        // Show welcome screen and hide main container
        mainContainer.style.display = 'none';
        welcomeScreen.style.display = 'flex';
        setTimeout(() => {
            welcomeScreen.classList.add('active');
        }, 50);
    } else if (screenId === 'create-game-screen' || screenId === 'join-game-screen') {
        // Show dedicated page layout (hide original header)
        welcomeScreen.style.display = 'none';
        welcomeScreen.classList.remove('active');
        mainContainer.style.display = 'block';
        if (originalHeader) originalHeader.style.display = 'none';
        
        const targetScreen = document.getElementById(screenId);
        targetScreen.style.display = 'block';
        setTimeout(() => {
            targetScreen.classList.add('active');
        }, 50);
    } else {
        // Show main container with original header for game screens
        welcomeScreen.style.display = 'none';
        welcomeScreen.classList.remove('active');
        mainContainer.style.display = 'block';
        if (originalHeader) originalHeader.style.display = 'block';
        
        const targetScreen = document.getElementById(screenId);
        targetScreen.style.display = 'block';
        setTimeout(() => {
            targetScreen.classList.add('active');
        }, 50);
    }
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
// (guarded version below)
const roomCodeInput = document.getElementById('room-code');
if (roomCodeInput) {
    roomCodeInput.addEventListener('input', function(e) {
        e.target.value = e.target.value.toUpperCase();
    });
    roomCodeInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            joinGame();
        }
    });
}

// Handle enter key on forms
// (guarded version below)
const playerNameInput = document.getElementById('player-name');
if (playerNameInput) {
    playerNameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const joinForm = document.getElementById('join-game-form');
            if (joinForm && !joinForm.classList.contains('hidden')) {
                joinGame();
            } else {
                createGame();
            }
        }
    });
}

document.getElementById('room-code').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        joinGame();
    }
});

// Handle enter key for chat inputs
document.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.id === 'lobby-chat-input' || activeElement.id === 'chat-input')) {
            sendChatMessage();
        }
    }
});

// Role summary toggle function
function toggleRoleSummary() {
    const content = document.getElementById('role-info-content');
    const toggle = document.getElementById('role-summary-toggle');
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        toggle.classList.remove('collapsed');
        toggle.textContent = '▼';
    } else {
        content.classList.add('collapsed');
        toggle.classList.add('collapsed');
        toggle.textContent = '▶';
    }
}

// Speaker Settings Functions
function toggleRandomSpeaker() {
    const toggle = document.getElementById('random-speaker-toggle');
    const enabled = toggle.checked;
    
    socket.emit('toggle_random_speaker', { enabled: enabled });
}

function assignRandomSpeakerNow() {
    socket.emit('assign_random_speaker_now', {});
}

function handleSpeakerSettingChanged(data) {
    gameState = data.game_state;
    updateLobby();
    
    if (data.random_speaker_enabled) {
        addMessage('Random speaker assignment enabled', 'success');
    } else {
        addMessage('Random speaker assignment disabled', 'success');
    }
}
