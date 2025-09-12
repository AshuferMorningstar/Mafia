from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
import random
import string
from game_logic import game_manager, GamePhase, Role

app = Flask(__name__)
app.config['SECRET_KEY'] = 'mafia_game_secret_key'
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*", logger=True, engineio_logger=True)

def generate_room_code():
    """Generate a 6-character room code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

@app.route('/api/create-game', methods=['POST'])
def create_game():
    """Create a new game room"""
    room_code = generate_room_code()
    
    # Ensure room code is unique
    while game_manager.get_game(room_code):
        room_code = generate_room_code()
    
    game = game_manager.create_game(room_code)
    
    return jsonify({
        'success': True,
        'room_code': room_code,
        'message': 'Game created successfully'
    })

@app.route('/api/game/<room_code>/status', methods=['GET'])
def get_game_status(room_code):
    """Get current game status"""
    game = game_manager.get_game(room_code)
    
    if not game:
        return jsonify({'success': False, 'message': 'Game not found'}), 404
    
    return jsonify({
        'success': True,
        'game_state': game.get_game_state()
    })

@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')
    emit('connected', {'message': 'Connected to Mafia game server'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle player disconnecting from the server"""
    print(f'Client disconnected: {request.sid}')
    game, player = game_manager.leave_game(request.sid)
    
    if game and player:
        # Notify remaining players in the room
        socketio.emit('player_left', {
            'player_id': player.id,
            'player_name': player.name,
            'game_state': game.get_game_state()
        }, room=game.room_code)
        
        # Add system message about player leaving
        game.add_system_message(f"{player.name} left the game")

@socketio.on('send_chat_message')
def handle_send_chat_message(data):
    """Handle chat messages from players"""
    game = game_manager.get_game_by_socket(request.sid)
    player = game_manager.get_player_by_socket(request.sid)
    
    if not game or not player:
        emit('error', {'message': 'Game or player not found'})
        return
    
    message = data.get('message', '').strip()
    if not message or len(message) > 500:  # Limit message length
        emit('error', {'message': 'Invalid message'})
        return
    
    # Check if player can chat
    can_chat = False
    if player.is_alive and game.phase in [GamePhase.WAITING, GamePhase.DAY, GamePhase.VOTING]:
        can_chat = True
    elif not player.is_alive and game.game_settings.get('allow_dead_chat', True):
        can_chat = True
    elif player.id == game.speaker_id:  # Speaker can always chat
        can_chat = True
    
    if not can_chat:
        emit('error', {'message': 'You cannot chat at this time'})
        return
    
    # Add message to game
    chat_message = game.add_chat_message(player.name, message)
    
    # Broadcast to all players
    socketio.emit('chat_message', {
        'message': chat_message.to_dict()
    }, room=game.room_code)

@socketio.on('join_game')
def handle_join_game(data):
    """Handle player joining a game"""
    room_code = data.get('room_code', '').upper()
    player_name = data.get('player_name', '').strip()
    
    if not room_code or not player_name:
        emit('error', {'message': 'Room code and player name are required'})
        return
    
    game, player, message = game_manager.join_game(room_code, player_name, request.sid)
    
    if not game or not player:
        emit('error', {'message': message})
        return
    
    # Join the socket room
    join_room(room_code)
    
    # Emit success to the joining player
    emit('join_success', {
        'message': message,
        'player_id': player.id,
        'game_state': game.get_game_state(player.id)
    })
    
    # Notify all players in the room about the new player
    socketio.emit('player_joined', {
        'player': player.to_dict(),
        'game_state': game.get_game_state()
    }, room=room_code)
    
    # Add system message about player joining
    game.add_system_message(f"{player.name} joined the game")

@socketio.on('close_lobby')
def handle_close_lobby(data):
    """Handle host closing the lobby"""
    game = game_manager.get_game_by_socket(request.sid)
    player = game_manager.get_player_by_socket(request.sid)
    
    if not game or not player:
        emit('error', {'message': 'Game or player not found'})
        return
    
    # Only host can close the lobby
    if player.id != game.host_id:
        emit('error', {'message': 'Only the host can close the lobby'})
        return
    
    # Notify all players in the room that the lobby is closing
    socketio.emit('lobby_closed', {
        'message': f'The host has closed the lobby. Returning to main menu.'
    }, room=game.room_code)
    
    # Remove all players from the room and delete the game
    for player_socket_id in list(game_manager.player_to_game.keys()):
        if game_manager.player_to_game.get(player_socket_id) == game.room_code:
            leave_room(game.room_code, sid=player_socket_id)
            del game_manager.player_to_game[player_socket_id]
    
    # Delete the game
    del game_manager.games[game.room_code]
    print(f"Lobby {game.room_code} has been closed by the host")

@socketio.on('set_speaker')
def handle_set_speaker(data):
    """Set a player as the speaker/moderator"""
    game = game_manager.get_game_by_socket(request.sid)
    player = game_manager.get_player_by_socket(request.sid)
    
    if not game or not player:
        emit('error', {'message': 'Game or player not found'})
        return
    
    if game.phase != GamePhase.WAITING:
        emit('error', {'message': 'Cannot change speaker after game has started'})
        return
    
    # Only host can change speaker initially, or current speaker can transfer
    if player.id != game.host_id and player.id != game.speaker_id:
        emit('error', {'message': 'Only the host or current speaker can change the speaker'})
        return
    
    speaker_id = data.get('speaker_id')
    if speaker_id not in game.players:
        emit('error', {'message': 'Invalid speaker selection'})
        return
    
    game.set_speaker(speaker_id)
    
    # Add system message
    game.add_system_message(f"{game.players[speaker_id].name} is now the speaker")
    
    # Notify all players
    socketio.emit('speaker_set', {
        'speaker_id': speaker_id,
        'speaker_name': game.players[speaker_id].name,
        'game_state': game.get_game_state()
    }, room=game.room_code)

@socketio.on('toggle_random_speaker')
def handle_toggle_random_speaker(data):
    """Toggle random speaker assignment setting"""
    game = game_manager.get_game_by_socket(request.sid)
    player = game_manager.get_player_by_socket(request.sid)
    
    if not game or not player:
        emit('error', {'message': 'Game or player not found'})
        return
    
    if game.phase != GamePhase.WAITING:
        emit('error', {'message': 'Cannot change speaker settings after game has started'})
        return
    
    # Only host can change speaker settings
    if player.id != game.host_id:
        emit('error', {'message': 'Only the host can change speaker settings'})
        return
    
    enabled = data.get('enabled', True)
    game.set_random_speaker_setting(enabled)
    
    # Add system message
    if enabled:
        game.add_system_message("Random speaker assignment enabled - speaker will be chosen randomly at game start")
    else:
        game.add_system_message("Random speaker assignment disabled - host can manually assign speaker")
    
    # Notify all players
    socketio.emit('speaker_setting_changed', {
        'random_speaker_enabled': enabled,
        'game_state': game.get_game_state()
    }, room=game.room_code)

@socketio.on('assign_random_speaker_now')
def handle_assign_random_speaker_now(data):
    """Immediately assign a random speaker"""
    game = game_manager.get_game_by_socket(request.sid)
    player = game_manager.get_player_by_socket(request.sid)
    
    if not game or not player:
        emit('error', {'message': 'Game or player not found'})
        return
    
    if game.phase != GamePhase.WAITING:
        emit('error', {'message': 'Cannot change speaker after game has started'})
        return
    
    # Only host can assign random speaker
    if player.id != game.host_id:
        emit('error', {'message': 'Only the host can assign a random speaker'})
        return
    
    if len(game.players) < 2:
        emit('error', {'message': 'Need at least 2 players to assign random speaker'})
        return
    
    game.assign_random_speaker()
    
    # Notify all players
    socketio.emit('speaker_set', {
        'speaker_id': game.speaker_id,
        'speaker_name': game.players[game.speaker_id].name,
        'game_state': game.get_game_state(),
        'was_random': True
    }, room=game.room_code)

@socketio.on('start_game')
def handle_start_game(data):
    """Start the game (assign roles and begin)"""
    game = game_manager.get_game_by_socket(request.sid)
    player = game_manager.get_player_by_socket(request.sid)
    
    if not game or not player:
        emit('error', {'message': 'Game or player not found'})
        return
    
    if player.id != game.host_id:
        emit('error', {'message': 'Only the host can start the game'})
        return
    
    if game.phase != GamePhase.WAITING:
        emit('error', {'message': 'Game already started'})
        return
    
    success, message = game.assign_roles()
    if not success:
        emit('error', {'message': message})
        return
    
    # Start night phase
    game.start_night_phase()
    
    # Add system message about game start
    game.add_system_message("🎮 Game has started! Check your role and prepare for the night phase.")
    
    # Notify all players with their roles
    for player_id, game_player in game.players.items():
        socketio.emit('game_started', {
            'message': 'Game started! Roles have been assigned.',
            'game_state': game.get_game_state(player_id)
        }, room=game_player.socket_id)

@socketio.on('night_action')
def handle_night_action(data):
    """Handle night phase actions (kill, save, investigate)"""
    game = game_manager.get_game_by_socket(request.sid)
    player = game_manager.get_player_by_socket(request.sid)
    
    if not game or not player:
        emit('error', {'message': 'Game or player not found'})
        return
    
    if game.phase != GamePhase.NIGHT or not player.is_alive:
        emit('error', {'message': 'Invalid action for current game state'})
        return
    
    action = data.get('action')
    target_id = data.get('target_id')
    
    if not action or not target_id:
        emit('error', {'message': 'Action and target are required'})
        return
    
    if target_id not in game.players:
        emit('error', {'message': 'Invalid target'})
        return
    
    # Validate action based on role
    valid_action = False
    if player.role == Role.KILLER and action == 'kill':
        valid_action = True
    elif player.role == Role.DOCTOR and action == 'save':
        valid_action = True
    elif player.role == Role.DETECTIVE and action == 'investigate':
        valid_action = True
    
    if not valid_action:
        emit('error', {'message': 'Invalid action for your role'})
        return
    
    game.add_night_action(player.id, action, target_id)
    
    emit('action_confirmed', {
        'message': f'Your {action} action has been recorded',
        'action': action,
        'target_name': game.players[target_id].name
    })
    
    # Notify speaker of action (without revealing details)
    if game.speaker_id:
        speaker = game.players[game.speaker_id]
        socketio.emit('night_action_received', {
            'player_name': player.name,
            'role': player.role.value
        }, room=speaker.socket_id)

@socketio.on('process_night')
def handle_process_night(data):
    """Process all night actions and move to day phase"""
    game = game_manager.get_game_by_socket(request.sid)
    player = game_manager.get_player_by_socket(request.sid)
    
    if not game or not player:
        emit('error', {'message': 'Game or player not found'})
        return
    
    if player.id != game.speaker_id:
        emit('error', {'message': 'Only the speaker can process night actions'})
        return
    
    if game.phase != GamePhase.NIGHT:
        emit('error', {'message': 'Not currently in night phase'})
        return
    
    # Process night actions
    game.process_night_actions()
    game.start_day_phase()
    
    # Prepare results message
    results = []
    if game.eliminated_player:
        eliminated = game.players[game.eliminated_player]
        results.append(f"{eliminated.name} was eliminated last night.")
    elif game.saved_player:
        results.append("Nobody was eliminated last night.")
    else:
        results.append("Nobody was eliminated last night.")
    
    # Check win condition
    game_over = game.check_win_condition()
    
    # Notify all players of results
    for player_id, game_player in game.players.items():
        game_state = game.get_game_state(player_id)
        
        # Add investigation result for detective
        message_data = {
            'results': results,
            'game_state': game_state
        }
        
        if (game_player.role == Role.DETECTIVE and 
            game_player.is_alive and 
            game.investigation_result is not None):
            message_data['investigation_result'] = game.investigation_result
        
        socketio.emit('day_phase_started', message_data, room=game_player.socket_id)
    
    if game_over:
        socketio.emit('game_over', {
            'winner': game.winner,
            'game_state': game.get_game_state()
        }, room=game.room_code)

@socketio.on('start_voting')
def handle_start_voting(data):
    """Start the voting phase"""
    game = game_manager.get_game_by_socket(request.sid)
    player = game_manager.get_player_by_socket(request.sid)
    
    if not game or not player:
        emit('error', {'message': 'Game or player not found'})
        return
    
    if player.id != game.speaker_id:
        emit('error', {'message': 'Only the speaker can start voting'})
        return
    
    if game.phase != GamePhase.DAY:
        emit('error', {'message': 'Not currently in day phase'})
        return
    
    game.start_voting_phase()
    
    socketio.emit('voting_started', {
        'message': 'Voting phase has begun. Choose who to eliminate.',
        'game_state': game.get_game_state()
    }, room=game.room_code)

@socketio.on('vote')
def handle_vote(data):
    """Handle player votes during day phase"""
    game = game_manager.get_game_by_socket(request.sid)
    player = game_manager.get_player_by_socket(request.sid)
    
    if not game or not player:
        emit('error', {'message': 'Game or player not found'})
        return
    
    if game.phase != GamePhase.VOTING or not player.is_alive:
        emit('error', {'message': 'Invalid vote for current game state'})
        return
    
    target_id = data.get('target_id')
    if not target_id or target_id not in game.players:
        emit('error', {'message': 'Invalid vote target'})
        return
    
    target = game.players[target_id]
    if not target.is_alive:
        emit('error', {'message': 'Cannot vote for eliminated player'})
        return
    
    game.add_vote(player.id, target_id)
    
    emit('vote_confirmed', {
        'message': f'You voted to eliminate {target.name}',
        'target_name': target.name
    })
    
    # Notify speaker of vote count update
    if game.speaker_id:
        speaker = game.players[game.speaker_id]
        socketio.emit('vote_update', {
            'game_state': game.get_game_state()
        }, room=speaker.socket_id)

@socketio.on('process_votes')
def handle_process_votes(data):
    """Process votes and eliminate player"""
    game = game_manager.get_game_by_socket(request.sid)
    player = game_manager.get_player_by_socket(request.sid)
    
    if not game or not player:
        emit('error', {'message': 'Game or player not found'})
        return
    
    if player.id != game.speaker_id:
        emit('error', {'message': 'Only the speaker can process votes'})
        return
    
    if game.phase != GamePhase.VOTING:
        emit('error', {'message': 'Not currently in voting phase'})
        return
    
    eliminated_player = game.process_day_elimination()
    
    # Check win condition
    game_over = game.check_win_condition()
    
    if eliminated_player:
        message = f"{eliminated_player.name} has been eliminated. They were a {eliminated_player.role.value}."
    else:
        message = "No one was eliminated today."
    
    if game_over:
        socketio.emit('game_over', {
            'message': message,
            'winner': game.winner,
            'game_state': game.get_game_state()
        }, room=game.room_code)
    else:
        # Start next night phase
        game.start_night_phase()
        
        # Notify all players
        for player_id, game_player in game.players.items():
            socketio.emit('elimination_result', {
                'message': message,
                'eliminated_player': eliminated_player.to_dict(include_role=True) if eliminated_player else None,
                'game_state': game.get_game_state(player_id)
            }, room=game_player.socket_id)

@socketio.on('get_game_state')
def handle_get_game_state(data):
    """Get current game state for a player"""
    game = game_manager.get_game_by_socket(request.sid)
    player = game_manager.get_player_by_socket(request.sid)
    
    if not game or not player:
        emit('error', {'message': 'Game or player not found'})
        return
    
    emit('game_state_update', {
        'game_state': game.get_game_state(player.id)
    })

if __name__ == '__main__':
    print("🎲 Mafia Game Server Starting...")
    print("📡 WebSocket server running on http://localhost:5001")
    socketio.run(app, host='0.0.0.0', port=5001, debug=True, use_reloader=False)
