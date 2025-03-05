// WebSocket server for multiplayer battle royale
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const { v4: uuid } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, '..')));

// Store connected players
const players = new Map();
let gameInProgress = false;
let gameStartTime = null;
const BATTLE_ROYALE_COUNTDOWN = 60; // Seconds before the game shrinks the play area
const MAX_PLAYERS = 10;
const STARTING_AREA_SIZE = 100;
let currentAreaSize = STARTING_AREA_SIZE;

// Handle new WebSocket connections
wss.on('connection', (ws) => {
    // Assign unique ID to player
    const playerId = uuid();
    
    console.log(`Player connected: ${playerId}`);
    
    // Initialize player
    const player = {
        id: playerId,
        position: new THREE.Vector3(
            (Math.random() - 0.5) * STARTING_AREA_SIZE * 0.8,
            0.5,
            (Math.random() - 0.5) * STARTING_AREA_SIZE * 0.8
        ),
        rotation: 0,
        health: 100,
        weapon: 0, // Start with basic weapon
        score: 0,
        isAlive: true
    };
    
    // Add player to collection
    players.set(playerId, player);
    
    // Send initial game state to new player
    ws.send(JSON.stringify({
        type: 'init',
        playerId: playerId,
        players: Array.from(players.values()),
        gameInProgress,
        gameStartTime,
        areaSize: currentAreaSize
    }));
    
    // Broadcast new player to all connected clients
    broadcastToAll({
        type: 'playerJoined',
        player: player
    });
    
    // Start game if we have enough players
    if (players.size >= 2 && !gameInProgress) {
        startGame();
    }
    
    // Handle messages from client
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'updatePosition':
                    // Update player position and rotation
                    if (players.has(playerId)) {
                        const player = players.get(playerId);
                        player.position = data.position;
                        player.rotation = data.rotation;
                        
                        // Broadcast updated position to all other players
                        broadcastToAll({
                            type: 'playerMoved',
                            id: playerId,
                            position: player.position,
                            rotation: player.rotation
                        }, playerId); // Don't send to originating player
                    }
                    break;
                    
                case 'attack':
                    // Handle player attack
                    handleAttack(playerId, data);
                    break;
                    
                case 'respawn':
                    // Handle player respawn request after death
                    if (players.has(playerId)) {
                        const player = players.get(playerId);
                        // Only allow respawn if game is not in progress
                        if (!gameInProgress) {
                            player.isAlive = true;
                            player.health = 100;
                            player.position = new THREE.Vector3(
                                (Math.random() - 0.5) * currentAreaSize * 0.8,
                                0.5,
                                (Math.random() - 0.5) * currentAreaSize * 0.8
                            );
                            player.weapon = 0;
                            
                            // Inform all clients of respawn
                            broadcastToAll({
                                type: 'playerRespawned',
                                id: playerId,
                                position: player.position
                            });
                        }
                    }
                    break;
            }
        } catch (e) {
            console.error('Error parsing message:', e);
        }
    });
    
    // Handle disconnect
    ws.on('close', () => {
        console.log(`Player disconnected: ${playerId}`);
        
        // Remove player from collection
        players.delete(playerId);
        
        // Broadcast player left to all connected clients
        broadcastToAll({
            type: 'playerLeft',
            id: playerId
        });
        
        // End game if not enough players
        if (gameInProgress && players.size < 2) {
            endGame();
        }
    });
    
    // Store WebSocket connection with player ID
    ws.playerId = playerId;
});

// Start battle royale game
function startGame() {
    gameInProgress = true;
    gameStartTime = Date.now();
    currentAreaSize = STARTING_AREA_SIZE;
    
    console.log('Battle Royale game started!');
    
    // Broadcast game start to all players
    broadcastToAll({
        type: 'gameStarted',
        startTime: gameStartTime
    });
    
    // Start shrinking the play area over time
    startShrinkingPlayArea();
}

// End the game
function endGame() {
    gameInProgress = false;
    console.log('Game ended');
    
    // Broadcast game end to all players
    broadcastToAll({
        type: 'gameEnded'
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

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
}); 