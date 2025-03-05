// WebSocket server for multiplayer battle royale
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const { v4: uuid } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Add CORS headers for cross-origin requests
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '..')));

// Add ping route to prevent Render from sleeping
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// Store connected players
const players = new Map();
let gameInProgress = false;
let gameStartTime = null;
const BATTLE_ROYALE_COUNTDOWN = 60; // Seconds before the game shrinks the play area
const MAX_PLAYERS = 10;
const STARTING_AREA_SIZE = 100;
let currentAreaSize = STARTING_AREA_SIZE;

// Server-side map data
const mapData = {
    buildings: [],
    grassPatches: [],
    obstacles: []
};

// Fix for THREE.Vector3 in Node.js environment
class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    
    clone() {
        return new Vector3(this.x, this.y, this.z);
    }
}

// Define THREE before it's used
const THREE = {
    Vector3: Vector3
};

// Generate server-side map once at startup
generateMap();

// Generate random map on the server
function generateMap() {
    // Clear any existing map data
    mapData.buildings = [];
    mapData.grassPatches = [];
    mapData.obstacles = [];
    
    // Add buildings
    for (let i = 0; i < 20; i++) {
        // Random building dimensions
        const width = 3 + Math.random() * 8;
        const depth = 3 + Math.random() * 8;
        const height = 3 + Math.random() * 5;
        
        // Position away from center
        let x, z;
        do {
            x = (Math.random() - 0.5) * 80;
            z = (Math.random() - 0.5) * 80;
        } while (Math.abs(x) < 10 && Math.abs(z) < 10); // Keep clear area around player
        
        // Create building data
        const building = {
            position: new Vector3(x, height/2, z),
            size: new Vector3(width, height, depth),
            color: Math.random() * 0.1 // HSL hue value to recreate color on client
        };
        
        mapData.buildings.push(building);
        
        // Add to obstacles list for collision detection
        mapData.obstacles.push({
            position: new Vector3(x, 0, z),
            size: new Vector3(width, height, depth)
        });
    }
    
    // Add grass patches
    for (let i = 0; i < 15; i++) {
        const size = 2 + Math.random() * 8;
        
        const grassPatch = {
            position: new Vector3(
                (Math.random() - 0.5) * 90,
                0.01, // Just above ground
                (Math.random() - 0.5) * 90
            ),
            size: size
        };
        
        mapData.grassPatches.push(grassPatch);
    }
    
    console.log(`Generated server-side map with ${mapData.buildings.length} buildings and ${mapData.grassPatches.length} grass patches`);
}

// Handle new WebSocket connections
wss.on('connection', (socket, req) => {
    console.log('Client connected');
    
    // Assign unique ID to player
    const playerId = uuid();
    
    // Create player object with initial state
    players.set(playerId, {
        id: playerId,
        position: new Vector3(Math.random() * 40 - 20, 0.5, Math.random() * 40 - 20),
        rotation: 0,
        health: 100,
        weapon: 0, // Start with fists
        isAlive: true
    });
    
    // Send player their ID, current game state, and map data
    socket.send(JSON.stringify({
        type: 'playerConnected',
        id: playerId,
        gameInProgress: gameInProgress,
        mapData: mapData, // Send the server-generated map
        players: Array.from(players.entries()).map(([id, player]) => ({
            id,
            position: player.position,
            rotation: player.rotation,
            health: player.health,
            weapon: player.weapon,
            isAlive: player.isAlive
        }))
    }));
    
    // Broadcast new player to everyone else
    broadcastToAll({
        type: 'playerJoined',
        id: playerId,
        position: players.get(playerId).position,
        rotation: players.get(playerId).rotation,
        health: players.get(playerId).health,
        weapon: players.get(playerId).weapon
    }, playerId);
    
    // Handle incoming messages
    socket.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'playerUpdate':
                    // Update player position
                    if (players.has(playerId)) {
                        const player = players.get(playerId);
                        
                        // Only allow position updates for alive players
                        if (player.isAlive) {
                            // Update position
                            player.position.x = message.position.x;
                            player.position.y = message.position.y;
                            player.position.z = message.position.z;
                            
                            // Update rotation
                            player.rotation = message.rotation;
                            
                            // Broadcast to other players
                            broadcastToAll({
                                type: 'playerMoved',
                                id: playerId,
                                position: player.position,
                                rotation: player.rotation
                            }, playerId);
                        }
                    }
                    break;
                    
                case 'respawn':
                    // Handle respawn request
                    if (players.has(playerId)) {
                        const player = players.get(playerId);
                        
                        // Only allow respawn if game is not in progress or player is already alive
                        if (!gameInProgress) {
                            // Reset player
                            player.isAlive = true;
                            player.health = 100;
                            player.position = new Vector3(Math.random() * 40 - 20, 0.5, Math.random() * 40 - 20);
                            player.weapon = 0;
                            
                            // Send successful respawn confirmation
                            socket.send(JSON.stringify({
                                type: 'respawnAccepted',
                                position: player.position
                            }));
                            
                            // Broadcast player respawn to others
                            broadcastToAll({
                                type: 'playerRespawned',
                                id: playerId,
                                position: player.position,
                                rotation: player.rotation,
                                health: player.health,
                                weapon: player.weapon
                            }, playerId);
                        } else {
                            // Reject respawn - game in progress
                            socket.send(JSON.stringify({
                                type: 'respawnRejected',
                                reason: 'Cannot respawn during active game round'
                            }));
                        }
                    }
                    break;
                    
                case 'attack':
                    // Player attack
                    handleAttack(playerId, message);
                    break;
                    
                case 'projectileHit':
                    // Handle projectile hit
                    handleProjectileHit(playerId, message);
                    break;
                    
                case 'requestMapData':
                    // Player is requesting the current map data
                    socket.send(JSON.stringify({
                        type: 'mapData',
                        mapData: mapData
                    }));
                    break;
                    
                case 'ping':
                    // Ping-pong to keep connection alive
                    socket.send(JSON.stringify({
                        type: 'pong'
                    }));
                    break;
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    });
    
    // Handle disconnection
    socket.on('close', () => {
        console.log('Client disconnected');
        
        // Remove player from the game
        if (players.has(playerId)) {
            players.delete(playerId);
            
            // Broadcast player left
            broadcastToAll({
                type: 'playerLeft',
                id: playerId
            });
            
            // If game is in progress, check if we have a winner
            if (gameInProgress) {
                const alivePlayers = getAlivePlayers();
                if (alivePlayers.length <= 1) {
                    determineWinner();
                }
            }
        }
    });
    
    // Store socket reference for later communication
    socket.playerId = playerId;
});

// Start battle royale game
function startGame() {
    gameInProgress = true;
    gameStartTime = Date.now();
    currentAreaSize = STARTING_AREA_SIZE;
    
    // Generate a new map for this game
    generateMap();
    
    console.log('Battle Royale game started!');
    
    // Broadcast game start and map data to all players
    broadcastToAll({
        type: 'gameStarted',
        startTime: gameStartTime,
        mapData: mapData
    });
    
    // Start shrinking the play area over time
    startShrinkingPlayArea();
}

// End current game
function endGame() {
    gameInProgress = false;
    gameStartTime = null;
    currentAreaSize = STARTING_AREA_SIZE;
    
    console.log('Battle Royale game ended');
    
    // Broadcast game end to all players
    broadcastToAll({
        type: 'gameEnded'
    });
    
    // Reset all dead players so they can respawn
    players.forEach((player, id) => {
        // Keep players who survived as alive
        // Dead players will need to respawn
    });
}

// Periodically shrink the play area (battle royale style)
function startShrinkingPlayArea() {
    const shrinkInterval = setInterval(() => {
        if (!gameInProgress) {
            clearInterval(shrinkInterval);
            return;
        }
        
        // Reduce play area size
        currentAreaSize *= 0.9;
        
        console.log(`Shrinking play area to ${currentAreaSize}`);
        
        // Broadcast new area size
        broadcastToAll({
            type: 'areaShrank',
            newSize: currentAreaSize
        });
        
        // Check if any players are outside the play area and damage them
        players.forEach((player, id) => {
            if (player.isAlive) {
                const distanceFromCenter = Math.sqrt(
                    player.position.x * player.position.x + 
                    player.position.z * player.position.z
                );
                
                if (distanceFromCenter > currentAreaSize / 2) {
                    // Player is outside the safe zone, apply damage
                    const damage = 5;
                    applyDamage(id, damage, 'zone');
                    
                    // Inform player they're taking damage from the zone
                    const socket = getSocketByPlayerId(id);
                    if (socket) {
                        socket.send(JSON.stringify({
                            type: 'zoneDamage',
                            damage: damage
                        }));
                    }
                }
            }
        });
        
        // End the game if area is too small or only one player left
        if (currentAreaSize < 5 || getAlivePlayers().length <= 1) {
            determineWinner();
            endGame();
            clearInterval(shrinkInterval);
        }
    }, BATTLE_ROYALE_COUNTDOWN * 1000);
}

// Handle player attack
function handleAttack(attackerId, data) {
    const attacker = players.get(attackerId);
    if (!attacker || !attacker.isAlive) return;
    
    if (data.projectile) {
        // Handle projectile attack (will be checked for hits on client side)
        broadcastToAll({
            type: 'projectileFired',
            id: attackerId,
            origin: data.origin,
            direction: data.direction,
            weapon: attacker.weapon
        });
    } else {
        // Handle melee attack
        const targetId = data.targetId;
        if (targetId && players.has(targetId)) {
            const target = players.get(targetId);
            if (target.isAlive) {
                // Get weapon damage
                const weapons = [
                    { damage: 10 },  // Fists
                    { damage: 25 },  // Knife
                    { damage: 30 },  // Baseball Bat
                    { damage: 40 }   // Gun
                ];
                const damage = weapons[attacker.weapon].damage;
                
                // Apply damage to target
                applyDamage(targetId, damage, attackerId);
            }
        }
    }
}

// Handle projectile hit
function handleProjectileHit(attackerId, data) {
    const attacker = players.get(attackerId);
    const targetId = data.targetId;
    
    if (!attacker || !attacker.isAlive || !targetId || !players.has(targetId)) return;
    
    const target = players.get(targetId);
    if (!target.isAlive) return;
    
    // Apply the damage from the projectile
    applyDamage(targetId, data.damage, attackerId);
}

// Apply damage to a player
function applyDamage(playerId, amount, sourceId) {
    if (!players.has(playerId)) return;
    
    const player = players.get(playerId);
    player.health -= amount;
    
    // Broadcast damage event
    broadcastToAll({
        type: 'playerDamaged',
        id: playerId,
        health: player.health,
        source: sourceId
    });
    
    // Check if player is dead
    if (player.health <= 0 && player.isAlive) {
        playerDied(playerId, sourceId);
    }
}

// Handle player death
function playerDied(playerId, killerId) {
    const player = players.get(playerId);
    player.isAlive = false;
    
    console.log(`Player ${playerId} was eliminated by ${killerId}`);
    
    // If killer is a player, increment their score
    if (killerId !== 'zone' && players.has(killerId)) {
        const killer = players.get(killerId);
        killer.score += 1;
        
        // Broadcast score update
        broadcastToAll({
            type: 'scoreUpdated',
            id: killerId,
            score: killer.score
        });
    }
    
    // Broadcast player death
    broadcastToAll({
        type: 'playerDied',
        id: playerId,
        killerId: killerId
    });
    
    // Check if game should end (only one player left)
    const alivePlayers = getAlivePlayers();
    if (gameInProgress && alivePlayers.length <= 1) {
        determineWinner();
        endGame();
    }
}

// Get all alive players
function getAlivePlayers() {
    return Array.from(players.values()).filter(p => p.isAlive);
}

// Determine the winner
function determineWinner() {
    const alivePlayers = getAlivePlayers();
    
    if (alivePlayers.length === 1) {
        // We have a winner
        const winner = alivePlayers[0];
        console.log(`Player ${winner.id} won the game!`);
        
        // Broadcast winner
        broadcastToAll({
            type: 'gameWon',
            winnerId: winner.id,
            winnerScore: winner.score
        });
    } else {
        // No winner (everyone died or left)
        console.log('Game ended with no winner');
        broadcastToAll({
            type: 'gameDraw'
        });
    }
}

// Helper to get WebSocket by player ID
function getSocketByPlayerId(playerId) {
    for (const client of wss.clients) {
        if (client.playerId === playerId) {
            return client;
        }
    }
    return null;
}

// Broadcast message to all connected clients
function broadcastToAll(data, excludeId = null) {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && (!excludeId || client.playerId !== excludeId)) {
            client.send(message);
        }
    });
}

// Add heartbeat for connection monitoring
function heartbeat() {
    this.isAlive = true;
}

// Set up heartbeat interval to track connection status
const heartbeatInterval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping(() => {});
    });
}, 30000);

// Clean up on server close
wss.on('close', () => {
    clearInterval(heartbeatInterval);
});

// Set up regular status monitoring
setInterval(() => {
    const connectedPlayers = wss.clients.size;
    console.log(`Status: ${connectedPlayers} players connected. Game in progress: ${gameInProgress}`);
    if (gameInProgress) {
        console.log(`Current zone size: ${currentAreaSize}, Active players: ${getAlivePlayers().length}`);
    }
}, 60000);

// Use our Vector3 implementation in Node.js
if (typeof THREE === 'undefined') {
    global.THREE = {
        Vector3: Vector3
    };
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
}); 