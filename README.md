# 3D FPS Multiplayer Game

A real-time 3D first-person shooter built with Three.js and Socket.io.

## Features

- **3D Graphics**: Built with Three.js for smooth 3D rendering
- **Real-time Multiplayer**: Socket.io for instant multiplayer action
- **Weapon System**: Machine gun with 16 rounds and 3-second reload time
- **Health System**: 100 HP, body shots deal 20 damage, headshots deal 50 damage
- **Interactive World**: 
  - Two-story house with large windows for strategic shooting
  - Trees and cover walls for tactical gameplay
  - Clear world boundaries
- **First-Person Controls**: WASD movement with mouse look

## Game Controls

- **WASD** - Move around
- **Mouse** - Look around
- **Left Click** - Shoot
- **R** - Reload weapon

## World Features

- **House**: Two-story building with large windows on the second floor for strategic positioning
- **Trees**: Scattered around the map for cover
- **Cover Walls**: Additional defensive positions
- **Boundaries**: Clear world limits to keep action contained

## Installation & Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## Development

For development with auto-reload:
```bash
npm run dev
```

## Game Mechanics

### Health System
- Players start with 100 HP
- Body shots: 20 damage
- Headshots: 50 damage
- Players respawn 5 seconds after being eliminated

### Weapon System
- Magazine capacity: 16 rounds
- Reload time: 3 seconds
- Rate of fire: ~600 RPM (100ms between shots)
- Automatic reload when magazine is empty

### Multiplayer
- Real-time synchronization of player positions
- Bullet physics calculated server-side
- Hit detection with damage calculation
- Player count display

## Technical Details

- **Frontend**: Three.js, HTML5, CSS3, JavaScript
- **Backend**: Node.js, Express, Socket.io
- **Real-time Communication**: WebSockets via Socket.io
- **3D Rendering**: WebGL via Three.js
- **Physics**: Custom collision detection

## Architecture

- `server.js` - Game server with multiplayer logic
- `index.html` - Main game interface
- `js/game.js` - Client-side game logic and 3D rendering
- `package.json` - Dependencies and scripts

## Browser Compatibility

- Chrome (recommended)
- Firefox
- Safari
- Edge

Requires a modern browser with WebGL support.

## Contributing

Feel free to fork and submit pull requests for improvements!

## License

MIT License
