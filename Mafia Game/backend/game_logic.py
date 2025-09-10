
from enum import Enum
from typing import Dict, List, Optional, Set
import uuid
import random

class Role(Enum):
    CIVILIAN = "civilian"
    KILLER = "killer"
    DOCTOR = "doctor"
    DETECTIVE = "detective"

class GamePhase(Enum):
    WAITING = "waiting"
    NIGHT = "night"
    DAY = "day"
    VOTING = "voting"
    GAME_OVER = "game_over"

class Player:
    def __init__(self, name: str, socket_id: str):
        self.id = str(uuid.uuid4())
        self.name = name
        self.socket_id = socket_id
        self.role: Optional[Role] = None
        self.is_alive = True
        self.votes = 0
        
    def to_dict(self, include_role=False, show_role_to_player=None):
        data = {
            'id': self.id,
            'name': self.name,
            'is_alive': self.is_alive,
            'votes': self.votes
        }
        if include_role:
            data['role'] = self.role.value if self.role else None
        elif show_role_to_player and self.should_show_role_to(show_role_to_player):
            data['role'] = self.role.value if self.role else None
        return data
    
    def should_show_role_to(self, other_player):
        """Determine if this player's role should be visible to another player"""
        if not self.role or not other_player.role:
            return False
        
        # Dead players' roles are visible to everyone
        if not self.is_alive:
            return True
            
        # Killers can see other killers
        if (self.role == Role.KILLER and other_player.role == Role.KILLER and 
            self.is_alive and other_player.is_alive):
            return True
            
        # Players can always see their own role
        if self.id == other_player.id:
            return True
            
        return False

class ChatMessage:
    def __init__(self, player_name: str, message: str, message_type: str = "normal", timestamp: float = None):
        import time
        self.player_name = player_name
        self.message = message
        self.type = message_type  # "normal", "system", "whisper", "announcement"
        self.timestamp = timestamp or time.time()
        
    def to_dict(self):
        return {
            'player_name': self.player_name,
            'message': self.message,
            'type': self.type,
            'timestamp': self.timestamp
        }

class Game:
    def __init__(self, room_code: str):
        self.room_code = room_code
        self.players: Dict[str, Player] = {}
        self.phase = GamePhase.WAITING
        self.night_actions = {}
        self.day_votes = {}
        self.speaker_id: Optional[str] = None
        self.eliminated_player: Optional[str] = None
        self.saved_player: Optional[str] = None
        self.investigation_result: Optional[bool] = None
        self.winner: Optional[str] = None
        self.chat_messages: List[ChatMessage] = []
        self.host_id: Optional[str] = None  # Player who created the room
        self.game_settings = {
            'discussion_time': 300,  # 5 minutes for day discussion
            'voting_time': 120,      # 2 minutes for voting
            'allow_dead_chat': True,   # Allow dead players to chat
            'random_speaker': True     # Randomly assign speaker at game start
        }
        
    def add_player(self, name: str, socket_id: str) -> Player:
        player = Player(name, socket_id)
        self.players[player.id] = player
        
        # Set first player as host
        if not self.host_id:
            self.host_id = player.id
            # Only set as speaker if random_speaker is disabled
            if not self.game_settings['random_speaker']:
                self.speaker_id = player.id
            
        return player
    
    def set_random_speaker_setting(self, enabled: bool):
        """Toggle random speaker assignment"""
        self.game_settings['random_speaker'] = enabled
        
        # If enabling random speaker and we're still in waiting phase, clear current speaker
        if enabled and self.phase == GamePhase.WAITING:
            self.speaker_id = None
        # If disabling and no speaker is set, make host the speaker
        elif not enabled and not self.speaker_id and self.host_id:
            self.speaker_id = self.host_id
    
    def assign_random_speaker(self):
        """Randomly assign a speaker from available players"""
        if self.players:
            available_players = list(self.players.keys())
            self.speaker_id = random.choice(available_players)
            self.add_system_message(f"{self.players[self.speaker_id].name} has been randomly selected as the speaker!")
    
    def add_chat_message(self, player_name: str, message: str, message_type: str = "normal"):
        """Add a chat message to the game"""
        chat_msg = ChatMessage(player_name, message, message_type)
        self.chat_messages.append(chat_msg)
        
        # Keep only last 100 messages to prevent memory issues
        if len(self.chat_messages) > 100:
            self.chat_messages = self.chat_messages[-100:]
        
        return chat_msg
    
    def add_system_message(self, message: str):
        """Add a system message to chat"""
        return self.add_chat_message("System", message, "system")
    
    def get_chat_messages(self, include_system: bool = True) -> List[Dict]:
        """Get chat messages, optionally filtering system messages"""
        messages = []
        for msg in self.chat_messages:
            if include_system or msg.type != "system":
                messages.append(msg.to_dict())
        return messages
    
    def remove_player(self, player_id: str):
        if player_id in self.players:
            del self.players[player_id]
    
    def set_speaker(self, player_id: str):
        self.speaker_id = player_id
    
    def assign_roles(self):
        alive_players = [p for p in self.players.values() if p.is_alive]
        player_count = len(alive_players)
        
        if player_count < 6:
            return False, "Need at least 6 players to start"
        
        # Assign random speaker if the setting is enabled and no speaker is set
        if self.game_settings['random_speaker'] and not self.speaker_id:
            self.assign_random_speaker()
        elif not self.speaker_id:
            # Fallback to host if no speaker is assigned
            self.speaker_id = self.host_id
        
        # Determine role distribution based on player count
        if player_count <= 7:
            killer_count = 1
            has_detective = False
        elif player_count <= 10:
            killer_count = 2
            has_detective = True
        else:
            killer_count = 3
            has_detective = True
        
        # Shuffle players for random role assignment
        random.shuffle(alive_players)
        
        # Assign roles
        role_index = 0
        
        # Assign killers
        for i in range(killer_count):
            alive_players[role_index].role = Role.KILLER
            role_index += 1
        
        # Assign doctor
        alive_players[role_index].role = Role.DOCTOR
        role_index += 1
        
        # Assign detective if applicable
        if has_detective:
            alive_players[role_index].role = Role.DETECTIVE
            role_index += 1
        
        # Assign civilians to remaining players
        for i in range(role_index, len(alive_players)):
            alive_players[i].role = Role.CIVILIAN
        
        return True, "Roles assigned successfully"
    
    def get_killers(self) -> List[Player]:
        return [p for p in self.players.values() if p.role == Role.KILLER and p.is_alive]
    
    def get_civilians(self) -> List[Player]:
        return [p for p in self.players.values() if p.role == Role.CIVILIAN and p.is_alive]
    
    def get_doctor(self) -> Optional[Player]:
        doctors = [p for p in self.players.values() if p.role == Role.DOCTOR and p.is_alive]
        return doctors[0] if doctors else None
    
    def get_detective(self) -> Optional[Player]:
        detectives = [p for p in self.players.values() if p.role == Role.DETECTIVE and p.is_alive]
        return detectives[0] if detectives else None
    
    def start_night_phase(self):
        self.phase = GamePhase.NIGHT
        self.night_actions = {}
        self.eliminated_player = None
        self.saved_player = None
        self.investigation_result = None
        self.add_system_message("🌙 Night phase has begun. Special roles, perform your actions!")
    
    def add_night_action(self, player_id: str, action: str, target_id: str):
        self.night_actions[player_id] = {
            'action': action,
            'target_id': target_id
        }
    
    def process_night_actions(self):
        # Process killer action
        killer_target = None
        for player_id, action in self.night_actions.items():
            player = self.players[player_id]
            if player.role == Role.KILLER and action['action'] == 'kill':
                killer_target = action['target_id']
                break
        
        # Process doctor action
        doctor_target = None
        for player_id, action in self.night_actions.items():
            player = self.players[player_id]
            if player.role == Role.DOCTOR and action['action'] == 'save':
                doctor_target = action['target_id']
                break
        
        # Process detective action
        detective_result = None
        for player_id, action in self.night_actions.items():
            player = self.players[player_id]
            if player.role == Role.DETECTIVE and action['action'] == 'investigate':
                target = self.players[action['target_id']]
                detective_result = target.role == Role.KILLER
                self.investigation_result = detective_result
                break
        
        # Determine if anyone dies
        if killer_target and killer_target != doctor_target:
            self.players[killer_target].is_alive = False
            self.eliminated_player = killer_target
        elif killer_target == doctor_target:
            self.saved_player = killer_target
    
    def start_day_phase(self):
        self.phase = GamePhase.DAY
        self.day_votes = {}
        self.add_system_message("☀️ Day phase has begun. Discuss and find the killers!")
    
    def start_voting_phase(self):
        self.phase = GamePhase.VOTING
        self.day_votes = {}
        # Reset vote counts
        for player in self.players.values():
            player.votes = 0
        self.add_system_message("🗳️ Voting phase has begun. Choose who to eliminate!")
    
    def add_vote(self, voter_id: str, target_id: str):
        # Remove previous vote if exists
        if voter_id in self.day_votes:
            old_target = self.day_votes[voter_id]
            if old_target in self.players:
                self.players[old_target].votes -= 1
        
        # Add new vote
        self.day_votes[voter_id] = target_id
        if target_id in self.players:
            self.players[target_id].votes += 1
    
    def process_day_elimination(self):
        alive_players = [p for p in self.players.values() if p.is_alive]
        if not alive_players:
            return None
        
        # Find player with most votes
        max_votes = max(p.votes for p in alive_players)
        players_with_max_votes = [p for p in alive_players if p.votes == max_votes]
        
        # If tie, randomly eliminate one (or you could implement tie-breaking rules)
        if len(players_with_max_votes) == 1:
            eliminated = players_with_max_votes[0]
            eliminated.is_alive = False
            return eliminated
        elif max_votes > 0:
            # Random tie-breaker
            eliminated = random.choice(players_with_max_votes)
            eliminated.is_alive = False
            return eliminated
        
        return None  # No one was eliminated
    
    def check_win_condition(self):
        alive_players = [p for p in self.players.values() if p.is_alive]
        killers = [p for p in alive_players if p.role == Role.KILLER]
        civilians = [p for p in alive_players if p.role != Role.KILLER]
        
        if len(killers) == 0:
            self.winner = "civilians"
            self.phase = GamePhase.GAME_OVER
            return True
        elif len(killers) >= len(civilians):
            self.winner = "killers"
            self.phase = GamePhase.GAME_OVER
            return True
        
        return False
    
    def get_game_state(self, player_id: Optional[str] = None):
        current_player = self.players.get(player_id) if player_id else None
        
        # Create player lists with appropriate role visibility
        alive_players = []
        dead_players = []
        
        for p in self.players.values():
            if p.is_alive:
                alive_players.append(p.to_dict(show_role_to_player=current_player))
            else:
                dead_players.append(p.to_dict(include_role=True))  # Dead players' roles are always visible
        
        state = {
            'room_code': self.room_code,
            'phase': self.phase.value,
            'alive_players': alive_players,
            'dead_players': dead_players,
            'player_count': len(self.players),
            'alive_count': len(alive_players),
            'speaker_id': self.speaker_id,
            'host_id': self.host_id,
            'winner': self.winner,
            'chat_messages': self.get_chat_messages(),
            'game_settings': self.game_settings
        }
        
        # Add player-specific information
        if player_id and player_id in self.players:
            player = self.players[player_id]
            state['your_role'] = player.role.value if player.role else None
            state['your_id'] = player.id
            state['you_are_alive'] = player.is_alive
            state['you_are_host'] = player.id == self.host_id
            state['you_are_speaker'] = player.id == self.speaker_id
            
            # Add role-specific information
            if player.role == Role.KILLER and player.is_alive:
                state['fellow_killers'] = [p.to_dict(include_role=True) for p in self.get_killers() if p.id != player.id]
            elif player.role == Role.DETECTIVE and hasattr(self, 'investigation_result') and self.investigation_result is not None:
                state['investigation_result'] = self.investigation_result
        
        return state
    
    def to_dict(self):
        return {
            'room_code': self.room_code,
            'phase': self.phase.value,
            'players': [p.to_dict(include_role=True) for p in self.players.values()],
            'speaker_id': self.speaker_id,
            'winner': self.winner
        }

class GameManager:
    def __init__(self):
        self.games: Dict[str, Game] = {}
        self.player_to_game: Dict[str, str] = {}  # socket_id -> room_code
    
    def create_game(self, room_code: str) -> Game:
        game = Game(room_code)
        self.games[room_code] = game
        return game
    
    def get_game(self, room_code: str) -> Optional[Game]:
        return self.games.get(room_code)
    
    def join_game(self, room_code: str, player_name: str, socket_id: str) -> tuple[Optional[Game], Optional[Player], str]:
        game = self.get_game(room_code)
        if not game:
            return None, None, "Game not found"
        
        if game.phase != GamePhase.WAITING:
            return None, None, "Game already in progress"
        
        # Check if name is already taken
        for player in game.players.values():
            if player.name.lower() == player_name.lower():
                return None, None, "Name already taken"
        
        player = game.add_player(player_name, socket_id)
        self.player_to_game[socket_id] = room_code
        return game, player, "Joined successfully"
    
    def leave_game(self, socket_id: str):
        if socket_id in self.player_to_game:
            room_code = self.player_to_game[socket_id]
            game = self.get_game(room_code)
            if game:
                # Find and remove player
                player_to_remove = None
                for player in game.players.values():
                    if player.socket_id == socket_id:
                        player_to_remove = player
                        break
                
                if player_to_remove:
                    game.remove_player(player_to_remove.id)
                    
                    # If game is empty, remove it
                    if len(game.players) == 0:
                        del self.games[room_code]
            
            del self.player_to_game[socket_id]
    
    def get_game_by_socket(self, socket_id: str) -> Optional[Game]:
        if socket_id in self.player_to_game:
            room_code = self.player_to_game[socket_id]
            return self.get_game(room_code)
        return None
    
    def get_player_by_socket(self, socket_id: str) -> Optional[Player]:
        game = self.get_game_by_socket(socket_id)
        if game:
            for player in game.players.values():
                if player.socket_id == socket_id:
                    return player
        return None

# Global game manager instance
game_manager = GameManager()
