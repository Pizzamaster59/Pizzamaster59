import { COLORS, WEAPONS, ENEMY_MESSAGES, VERSION } from './constants.js';
import { updateUI, showMessage, showGameOver, updateVersion } from './ui.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { updateProjectiles } from './entities/projectile.js';
import { createEnvironment, spawnEnemy } from './entities/environment.js';
import { InputHandler } from './utils/input.js';

export class Game {
    constructor() {
        // Game state
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.player = null;
        this.enemies = [];
        this.projectiles = [];
        this.obstacles = [];
        this.score = 0;
        this.gameOver = false;
        this.animationFrameId = null;
        
        // Game constants
        this.colors = COLORS;
        this.weapons = WEAPONS;
        this.enemyMessages = ENEMY_MESSAGES;
        
        // Multiplayer specific properties
        this.socket = null;
        this.playerId = null;
        this.otherPlayers = new Map(); // Initialize the otherPlayers Map
        this.battleRoyaleZoneSize = 100; // Initial zone size
        this.safeZoneMesh = null; // Visual indicator for the battle royale safe zone
        
        // Class references
        this.Player = Player;
        this.Enemy = Enemy;
        
        this.init();
    }
    
    init() {
        // Reset game state
        this.enemies = [];
        this.projectiles = [];
        this.obstacles = [];
        this.score = 0;
        this.gameOver = false;
        
        this.setupScene();
        this.setupLights();
        this.createPlayer();
        createEnvironment(this.scene, this);
        
        // Initialize input handler
        this.inputHandler = new InputHandler(this);
        
        // Update UI
        this.updateUI();
        
        // Update version display
        updateVersion(VERSION);
        
        // Connect to WebSocket server
        this.connectToServer();
        
        // Add window unload handler for cleanup
        window.addEventListener('beforeunload', () => {
            this.cleanUp();
        });
        
        // Start animation
        this.animate();
    }
    
    // Connect to WebSocket server
    connectToServer() {
        // Determine WebSocket URL (adjust for production)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log(`Connecting to WebSocket server at ${wsUrl}`);
        
        try {
            this.socket = new WebSocket(wsUrl);
            
            // Set up WebSocket event handlers
            this.socket.onopen = this.handleSocketOpen.bind(this);
            this.socket.onmessage = this.handleSocketMessage.bind(this);
            this.socket.onclose = this.handleSocketClose.bind(this);
            this.socket.onerror = this.handleSocketError.bind(this);
            
            // Setup ping to keep connection alive
            this.setupPing();
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            showMessage('Failed to connect to multiplayer server. Will retry...');
            
            // Retry connection after delay
            setTimeout(() => this.connectToServer(), 3000);
        }
    }
    
    // Setup ping to keep connection alive and detect disconnections
    setupPing() {
        // Clear any existing ping interval
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        
        // Set up new ping interval
        this.pingInterval = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                // Send lightweight ping
                this.socket.send(JSON.stringify({
                    type: 'ping',
                    timestamp: Date.now()
                }));
            }
        }, 15000); // Ping every 15 seconds
    }
    
    // WebSocket event handlers
    handleSocketOpen() {
        console.log('Connected to server!');
        showMessage('Connected to multiplayer server!');
        
        // Update connection status indicator
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = 'Connected';
            statusElement.style.background = 'rgba(0,128,0,0.5)';
        }
        
        // Reset reconnection attempts
        this.reconnectAttempts = 0;
    }
    
    handleSocketMessage(event) {
        try {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'init':
                    // Store player ID
                    this.playerId = message.playerId;
                    console.log(`Assigned player ID: ${this.playerId}`);
                    
                    // Set up other players
                    message.players.forEach(playerData => {
                        if (playerData.id !== this.playerId) {
                            this.addOtherPlayer(playerData);
                        }
                    });
                    
                    // Update battle royale zone
                    this.updateBattleRoyaleZone(message.areaSize);
                    break;
                    
                case 'playerJoined':
                    // Add new player
                    if (message.player.id !== this.playerId) {
                        showMessage('A new player has joined!');
                        this.addOtherPlayer(message.player);
                    }
                    break;
                    
                case 'playerLeft':
                    // Remove player
                    this.removeOtherPlayer(message.id);
                    break;
                    
                case 'playerMoved':
                    // Update other player position
                    this.updateOtherPlayerPosition(message.id, message.position, message.rotation);
                    break;
                    
                case 'playerDamaged':
                    // Player took damage
                    if (message.id === this.playerId) {
                        // This is us
                        this.player.damage(0); // Visual effect only, health managed by server
                        this.player.health = message.health;
                        this.updateUI();
                    } else {
                        // Another player
                        const otherPlayer = this.otherPlayers.get(message.id);
                        if (otherPlayer) {
                            otherPlayer.damage(10); // Visual effect only
                        }
                    }
                    break;
                    
                case 'playerDied':
                    // A player died
                    if (message.id === this.playerId) {
                        // We died
                        this.handlePlayerDeath(message.killerId);
                    } else {
                        // Another player died
                        const otherPlayer = this.otherPlayers.get(message.id);
                        if (otherPlayer) {
                            showMessage(`Player was eliminated!`);
                            this.removeOtherPlayer(message.id);
                            
                            // If we killed them, update score
                            if (message.killerId === this.playerId) {
                                this.score++;
                                this.updateUI();
                                showMessage('You eliminated a player!');
                            }
                        }
                    }
                    break;
                    
                case 'projectileFired':
                    // Another player fired a projectile
                    if (message.id !== this.playerId) {
                        const origin = new THREE.Vector3(
                            message.origin.x,
                            message.origin.y,
                            message.origin.z
                        );
                        const direction = new THREE.Vector3(
                            message.direction.x,
                            message.direction.y,
                            message.direction.z
                        );
                        // Create projectile in scene
                        this.createEnemyProjectile(origin, direction, message.weapon);
                    }
                    break;
                    
                case 'gameStarted':
                    // Battle royale game is starting
                    showMessage('Battle Royale match is starting!');
                    break;
                    
                case 'gameEnded':
                    // Game ended
                    showMessage('Battle Royale match has ended.');
                    break;
                    
                case 'areaShrank':
                    // Battle royale safe zone shrunk
                    showMessage('The safe zone is shrinking!');
                    this.updateBattleRoyaleZone(message.newSize);
                    break;
                    
                case 'zoneDamage':
                    // We're taking damage from being outside the zone
                    showMessage('Warning: Outside safe zone!', true);
                    break;
                    
                case 'gameWon':
                    // Someone won the game
                    if (message.winnerId === this.playerId) {
                        showMessage('VICTORY ROYALE! You are the last one standing!', true);
                    } else {
                        showMessage(`Game over! Another player has won.`);
                    }
                    break;
            }
        } catch (e) {
            console.error('Error handling message:', e);
        }
    }
    
    handleSocketClose(event) {
        console.log(`Disconnected from server, code: ${event.code}, reason: ${event.reason}`);
        showMessage('Disconnected from multiplayer server. Attempting to reconnect...');
        
        // Update connection status indicator
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = 'Disconnected - Reconnecting...';
            statusElement.style.background = 'rgba(255,0,0,0.5)';
        }
        
        // Clean up
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        // Try to reconnect with increasing delays
        this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
        const delay = Math.min(30000, Math.pow(1.5, this.reconnectAttempts) * 1000);
        
        console.log(`Attempting to reconnect in ${delay/1000} seconds...`);
        
        setTimeout(() => {
            if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
                this.connectToServer();
            }
        }, delay);
    }
    
    handleSocketError(error) {
        console.error('WebSocket error:', error);
        showMessage('Error with multiplayer connection.');
        
        // Update connection status indicator
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = 'Connection Error';
            statusElement.style.background = 'rgba(255,165,0,0.5)';
        }
        
        // No need to reconnect here as onclose will be called
    }
    
    // Handle player death in multiplayer
    handlePlayerDeath(killerId) {
        showMessage('You were eliminated!', true);
        if (killerId === 'zone') {
            showMessage('You died outside the safe zone!');
        } else {
            showMessage('You were eliminated by another player!');
        }
        this.player.health = 0;
        this.updateUI();
    }
    
    // Add another player to the scene
    addOtherPlayer(playerData) {
        // Create enemy instance to represent the other player
        const position = new THREE.Vector3(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
        );
        
        const enemy = new Enemy(
            this.scene,
            this,
            position,
            playerData.weapon
        );
        
        // Store in otherPlayers map
        this.otherPlayers.set(playerData.id, enemy);
    }
    
    // Remove another player from the scene
    removeOtherPlayer(playerId) {
        const enemy = this.otherPlayers.get(playerId);
        if (enemy) {
            // Remove from scene
            if (enemy.mesh) {
                this.scene.remove(enemy.mesh);
            }
            
            // Remove from map
            this.otherPlayers.delete(playerId);
        }
    }
    
    // Update other player's position and rotation
    updateOtherPlayerPosition(playerId, position, rotation) {
        const enemy = this.otherPlayers.get(playerId);
        if (enemy) {
            enemy.position.set(position.x, position.y, position.z);
            enemy.rotation = rotation;
            
            if (enemy.mesh) {
                enemy.mesh.position.copy(enemy.position);
                enemy.mesh.rotation.y = enemy.rotation;
            }
        }
    }
    
    // Create projectile fired by another player
    createEnemyProjectile(origin, direction, weaponIndex) {
        const weapon = this.weapons[weaponIndex];
        if (weapon && weapon.projectile) {
            createProjectile(
                this.scene,
                this,
                origin,
                direction,
                weapon,
                true
            );
        }
    }
    
    // Update the battle royale zone visual indicator
    updateBattleRoyaleZone(size) {
        this.battleRoyaleZoneSize = size;
        
        // Remove existing zone mesh if it exists
        if (this.safeZoneMesh) {
            this.scene.remove(this.safeZoneMesh);
        }
        
        // Create new zone indicator
        const zoneGeometry = new THREE.RingGeometry(size/2 - 0.5, size/2, 32);
        const zoneMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00ffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.3
        });
        this.safeZoneMesh = new THREE.Mesh(zoneGeometry, zoneMaterial);
        this.safeZoneMesh.rotation.x = Math.PI / 2;
        this.safeZoneMesh.position.y = 0.1;
        this.scene.add(this.safeZoneMesh);
    }
    
    // Setup the scene
    setupScene() {
        // Set up the scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x222222);
        
        // Set up the camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 20, 0);
        this.camera.lookAt(0, 0, 0);
        
        // Set up the renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
    
    setupLights() {
        // Add directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        this.scene.add(directionalLight);
        
        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0x404040);
        this.scene.add(ambientLight);
    }
    
    createPlayer() {
        this.player = new Player(this.scene, this);
    }
    
    // Commented out NPC spawning - now using player-controlled enemies
    spawnEnemy() {
        console.log("Enemy spawning disabled in multiplayer mode");
        // spawnEnemy(this.scene, this);
    }
    
    updateUI() {
        updateUI(this.score, this.player.health, this.player.currentWeapon);
    }
    
    showGameOver(visible) {
        showGameOver(visible);
    }
    
    restart() {
        // Reset game state
        this.gameOver = false;
        this.score = 0;
        
        // Clear enemies
        this.enemies.forEach(enemy => {
            this.scene.remove(enemy.mesh);
        });
        this.enemies = [];
        
        // Clean up other players
        this.otherPlayers.forEach((enemy, id) => {
            if (enemy.mesh) {
                this.scene.remove(enemy.mesh);
            }
        });
        this.otherPlayers.clear();
        
        // Reset player
        this.player.health = 100;
        this.player.position.set(0, 0.5, 0);
        this.player.velocity.set(0, 0, 0);
        this.player.setWeapon(this.weapons[0]);
        
        // Send respawn request to server
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'respawn'
            }));
        }
        
        // Update UI
        this.updateUI();
        showGameOver(false);
        
        // Restart animation if needed
        if (!this.animationFrameId) {
            this.animate();
        }
    }
    
    animate() {
        if (this.gameOver) {
            // Cancel animation when game is over
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            return;
        }
        
        this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
        
        this.player.update();
        
        // Send player position update to server
        this.sendPositionUpdate();
        
        // Update all other players (no AI logic needed, just visual updates)
        this.otherPlayers.forEach(enemy => {
            if (enemy.mesh) {
                enemy.mesh.position.copy(enemy.position);
                enemy.mesh.rotation.y = enemy.rotation;
            }
        });
        
        // Update all projectiles
        updateProjectiles(this);
        
        this.renderer.render(this.scene, this.camera);
    }
    
    // Send position update to server
    sendPositionUpdate() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.playerId) {
            // Limit update rate to avoid flooding the server
            const now = Date.now();
            // Reduce to 10 updates per second to save bandwidth
            if (!this.lastUpdateTime || now - this.lastUpdateTime > 100) {
                this.lastUpdateTime = now;
                
                // Only send if position or rotation changed
                const posChanged = !this.lastSentPosition || 
                    this.lastSentPosition.distanceTo(this.player.position) > 0.01;
                const rotChanged = this.lastSentRotation !== this.player.rotation;
                
                if (posChanged || rotChanged) {
                    // Save last sent values
                    this.lastSentPosition = this.player.position.clone();
                    this.lastSentRotation = this.player.rotation;
                    
                    this.socket.send(JSON.stringify({
                        type: 'updatePosition',
                        position: {
                            x: this.player.position.x,
                            y: this.player.position.y,
                            z: this.player.position.z
                        },
                        rotation: this.player.rotation
                    }));
                }
            }
        }
    }
    
    // Send attack to server
    sendAttack(targetId, isProjectile, origin, direction) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            const message = {
                type: 'attack'
            };
            
            if (isProjectile) {
                message.projectile = true;
                message.origin = {
                    x: origin.x,
                    y: origin.y,
                    z: origin.z
                };
                message.direction = {
                    x: direction.x,
                    y: direction.y,
                    z: direction.z
                };
            } else {
                message.projectile = false;
                message.targetId = targetId;
            }
            
            this.socket.send(JSON.stringify(message));
        }
    }
    
    // Clean up resources when game ends or page unloads
    cleanUp() {
        // Cancel animation frame
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        // Clear ping interval
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        // Close WebSocket connection
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.close();
        }
    }
} 