const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game state
const players = new Map();
const bullets = [];
const WORLD_SIZE = 50;

// Player class
class Player {
    constructor(id, x = 0, y = 1.8, z = 0) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.z = z;
        this.rotationY = 0;
        this.health = 100;
        this.ammo = 16;
        this.maxAmmo = 16;
        this.isReloading = false;
        this.lastShot = 0;
        this.isAlive = true;
    }

    takeDamage(damage) {
        this.health = Math.max(0, this.health - damage);
        if (this.health <= 0) {
            this.isAlive = false;
        }
        return !this.isAlive;
    }

    reload() {
        if (!this.isReloading && this.ammo < this.maxAmmo) {
            this.isReloading = true;
            setTimeout(() => {
                this.ammo = this.maxAmmo;
                this.isReloading = false;
                io.to(this.id).emit('reloadComplete');
            }, 3000);
            return true;
        }
        return false;
    }

    canShoot() {
        const now = Date.now();
        return this.ammo > 0 && !this.isReloading && (now - this.lastShot) > 100; // 100ms between shots
    }

    shoot() {
        if (this.canShoot()) {
            this.ammo--;
            this.lastShot = Date.now();
            return true;
        }
        return false;
    }
}

// Bullet class
class Bullet {
    constructor(id, playerId, x, y, z, dirX, dirY, dirZ) {
        this.id = id;
        this.playerId = playerId;
        this.x = x;
        this.y = y;
        this.z = z;
        this.dirX = dirX;
        this.dirY = dirY;
        this.dirZ = dirZ;
        this.speed = 100;
        this.life = 2000; // 2 seconds
        this.createdAt = Date.now();
    }

    update(deltaTime) {
        const dt = deltaTime / 1000;
        this.x += this.dirX * this.speed * dt;
        this.y += this.dirY * this.speed * dt;
        this.z += this.dirZ * this.speed * dt;
        
        return (Date.now() - this.createdAt) < this.life;
    }

    checkCollision(player) {
        const dist = Math.sqrt(
            Math.pow(this.x - player.x, 2) +
            Math.pow(this.y - player.y, 2) +
            Math.pow(this.z - player.z, 2)
        );
        return dist < 1.0; // Hit radius
    }
}

// Socket connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    // Create new player
    const player = new Player(socket.id, 
        Math.random() * 20 - 10, // Random spawn X
        1.8, 
        Math.random() * 20 - 10  // Random spawn Z
    );
    players.set(socket.id, player);

    // Send initial game state to new player
    socket.emit('gameInit', {
        playerId: socket.id,
        players: Array.from(players.values()),
        worldSize: WORLD_SIZE
    });

    // Notify other players
    socket.broadcast.emit('playerJoined', player);
    
    // Update player count
    io.emit('playerCount', players.size);

    // Handle player movement
    socket.on('playerMove', (data) => {
        const player = players.get(socket.id);
        if (player && player.isAlive) {
            // Validate movement (basic bounds checking)
            if (Math.abs(data.x) < WORLD_SIZE && Math.abs(data.z) < WORLD_SIZE) {
                player.x = data.x;
                player.y = data.y;
                player.z = data.z;
                player.rotationY = data.rotationY;
                
                // Broadcast to other players
                socket.broadcast.emit('playerMoved', {
                    id: socket.id,
                    x: player.x,
                    y: player.y,
                    z: player.z,
                    rotationY: player.rotationY
                });
            }
        }
    });

    // Handle shooting
    socket.on('shoot', (data) => {
        const player = players.get(socket.id);
        if (player && player.isAlive && player.shoot()) {
            const bulletId = Date.now() + Math.random();
            const bullet = new Bullet(
                bulletId,
                socket.id,
                data.x,
                data.y,
                data.z,
                data.dirX,
                data.dirY,
                data.dirZ
            );
            
            bullets.push(bullet);
            
            // Broadcast bullet to all players
            io.emit('bulletFired', {
                id: bulletId,
                playerId: socket.id,
                x: bullet.x,
                y: bullet.y,
                z: bullet.z,
                dirX: bullet.dirX,
                dirY: bullet.dirY,
                dirZ: bullet.dirZ
            });

            // Send updated ammo count to shooter
            socket.emit('ammoUpdate', player.ammo);
        }
    });

    // Handle reload
    socket.on('reload', () => {
        const player = players.get(socket.id);
        if (player && player.isAlive) {
            if (player.reload()) {
                socket.emit('reloadStarted');
            }
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        players.delete(socket.id);
        socket.broadcast.emit('playerLeft', socket.id);
        io.emit('playerCount', players.size);
    });
});

// Game loop
let lastUpdate = Date.now();
setInterval(() => {
    const now = Date.now();
    const deltaTime = now - lastUpdate;
    lastUpdate = now;

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        
        if (!bullet.update(deltaTime)) {
            bullets.splice(i, 1);
            io.emit('bulletExpired', bullet.id);
            continue;
        }

        // Check collisions with players
        for (const [playerId, player] of players) {
            if (bullet.playerId !== playerId && player.isAlive && bullet.checkCollision(player)) {
                // Determine damage (simple headshot detection)
                const isHeadshot = bullet.y > player.y + 0.5;
                const damage = isHeadshot ? 50 : 20;
                
                const killed = player.takeDamage(damage);
                
                // Notify players
                io.emit('playerHit', {
                    playerId: playerId,
                    damage: damage,
                    isHeadshot: isHeadshot,
                    health: player.health,
                    killed: killed,
                    shooter: bullet.playerId
                });

                // Remove bullet
                bullets.splice(i, 1);
                io.emit('bulletExpired', bullet.id);
                
                // If player died, respawn after 5 seconds
                if (killed) {
                    setTimeout(() => {
                        if (players.has(playerId)) {
                            player.health = 100;
                            player.isAlive = true;
                            player.ammo = 16;
                            player.x = Math.random() * 20 - 10;
                            player.z = Math.random() * 20 - 10;
                            
                            io.emit('playerRespawned', {
                                id: playerId,
                                x: player.x,
                                y: player.y,
                                z: player.z,
                                health: player.health
                            });
                        }
                    }, 5000);
                }
                break;
            }
        }
    }
}, 16); // ~60 FPS

server.listen(PORT, '0.0.0.0', () => {
    console.log(`FPS Game server running on port ${PORT}`);
    console.log(`Open http://<your-ip-address>:${PORT} to play`);
});
