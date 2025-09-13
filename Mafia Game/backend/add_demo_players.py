import socketio
import time

# Configuration
ROOM_CODE = "Z0FMNM"
SERVER_URL = "http://127.0.0.1:5001"
DEMO_PLAYERS = ["Player1", "Player2", "Player3", "Player4", "Player5"]

# --- Main Script ---
def add_demo_players():
    """
    Connects multiple Socket.IO clients to simulate players joining a game room.
    """
    clients = []

    for name in DEMO_PLAYERS:
        try:
            sio = socketio.Client(engineio_logger=True)
            
            @sio.event
            def connect():
                print(f"[{name}] Connection established")
                sio.emit('join_game', {'room_code': ROOM_CODE, 'player_name': name})

            @sio.event
            def join_success(data):
                print(f"[{name}] Joined room successfully: {data}")
                
            @sio.event
            def error(data):
                print(f"[{name}] Error: {data}")

            @sio.event
            def disconnect():
                print(f"[{name}] Disconnected from server")

            sio.connect(SERVER_URL, transports=['websocket'])
            clients.append(sio)
            time.sleep(0.5) # Stagger connections slightly

        except Exception as e:
            print(f"Failed to create client for {name}: {e}")

    print(f"Added {len(clients)} demo players to room {ROOM_CODE}.")
    print("You can now close this script (Ctrl+C). The players will remain in the lobby.")
    
    # Keep the script running to maintain connections
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nDisconnecting clients...")
        for sio in clients:
            sio.disconnect()
        print("All clients disconnected.")

if __name__ == '__main__':
    add_demo_players()
