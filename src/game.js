import { COLORS, WEAPONS, ENEMY_MESSAGES, VERSION } from './constants.js';
import { updateUI, showMessage, showGameOver, updateVersion } from './ui.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { updateProjectiles } from './entities/projectile.js';
import { createEnvironment, spawnEnemy } from './entities/environment.js';
import { InputHandler } from './utils/input.js';
import THREE from './three-module.js';

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
        // We no longer create the environment here - it will be created based on server data
        // createEnvironment(this.scene, this);
        
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
                case 'playerConnected':
                    // Store player ID
                    this.playerId = message.id;
                    console.log(`Assigned player ID: ${this.playerId}`);
                    
                    // Set up other players
                    message.players.forEach(playerData => {
                        if (playerData.id !== this.playerId) {
                            this.addOtherPlayer(playerData);
                        }
                    });
                    
                    // Create environment from server map data
                    if (message.mapData) {
                        this.createEnvironmentFromMapData(message.mapData);
                    } else {
                        // If no map data was provided, request it
                        this.requestMapData();
                    }
                    
                    // Update battle royale zone
                    this.updateBattleRoyaleZone(message.areaSize);
                    break;
                    
                case 'playerJoined':
                    // Add new player
                    if (message.player && message.player.id !== this.playerId) {
                        showMessage('A new player has joined!');
                        this.addOtherPlayer(message.player);
                    } else if (message.id && message.id !== this.playerId) {
                        // Alternative format where player data is at the top level
                        showMessage('A new player has joined!');
                        this.addOtherPlayer(message);
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
                    
                    // Clear existing obstacles and environment objects
                    this.clearEnvironment();
                    
                    // Create new environment from map data
                    if (message.mapData) {
                        this.createEnvironmentFromMapData(message.mapData);
                    }
                    break;
                    
                case 'gameEnded':
                    // Game ended
                    showMessage('Battle Royale match has ended.');
                    
                    // If player is dead, inform them they can respawn now
                    if (this.player && this.player.isDead) {
                        showMessage('You can now respawn for the next round!');
                        
                        // Update restart button text
                        const restartButton = document.getElementById('restart');
                        if (restartButton) {
                            restartButton.textContent = 'Respawn';
                        }
                    }
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
                    } else if (this.player.isDead) {
                        showMessage(`Game over! Another player has won.`);
                    } else {
                        showMessage(`You survived until the end! Winner: ${message.winnerName || 'Another player'}`);
                    }
                    break;
                    
                case 'respawnAccepted':
                    // Server accepted our respawn request
                    console.log('Respawn accepted');
                    
                    // Reset game state
                    this.gameOver = false;
                    
                    // Remove game over screen
                    this.showGameOver(false);
                    
                    // Reset player
                    if (this.player) {
                        // Recreate the player model if it was removed
                        if (!this.scene.getObjectById(this.player.model?.id)) {
                            this.player.createModel();
                        }
                        
                        // Reset player properties
                        this.player.health = 100;
                        this.player.isDead = false;
                        
                        // Set position from server
                        if (message.position) {
                            this.player.position.set(
                                message.position.x,
                                message.position.y,
                                message.position.z
                            );
                        }
                        
                        // Update UI
                        this.updateUI();
                        
                        showMessage('You have respawned!');
                    }
                    break;
                    
                case 'respawnRejected':
                    // Server rejected our respawn request
                    console.log('Respawn rejected:', message.reason);
                    showMessage(message.reason || 'Cannot respawn at this time.');
                    break;
                    
                case 'playerRespawned':
                    // Another player respawned
                    if (message.id !== this.playerId) {
                        const existingPlayer = this.otherPlayers.get(message.id);
                        if (existingPlayer) {
                            // Update existing player
                            showMessage('A player has respawned!');
                            existingPlayer.position.set(message.position.x, message.position.y, message.position.z);
                            existingPlayer.rotation = message.rotation;
                        } else {
                            // Add new player
                            this.addOtherPlayer({
                                id: message.id,
                                position: message.position,
                                rotation: message.rotation,
                                health: message.health,
                                weapon: message.weapon
                            });
                        }
                    }
                    break;
                    
                case 'mapData':
                    // Server sent map data in response to our request
                    if (message.mapData) {
                        // Clear existing environment
                        this.clearEnvironment();
                        // Create new environment from map data
                        this.createEnvironmentFromMapData(message.mapData);
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
        // Show game over messages
        showMessage('You were eliminated!', true);
        if (killerId === 'zone') {
            showMessage('You died outside the safe zone!');
        } else {
            showMessage('You were eliminated by another player!');
        }
        
        // Set player health to 0
        this.player.health = 0;
        
        // Show game over screen
        this.gameOver = true;
        this.showGameOver(true);
        
        // Despawn the player model (but keep the camera)
        if (this.player && this.player.model) {
            // Hide the player model
            this.scene.remove(this.player.model);
            
            // If the player has a weapon model, remove that too
            if (this.player.model.weapon) {
                this.scene.remove(this.player.model.weapon);
            }
        }
        
        // Update UI to show 0 health
        this.updateUI();
        
        // Prevent player from moving or attacking
        this.player.isDead = true;
        
        console.log("Player has died and been despawned. Waiting for round to end.");
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
        console.log(`Added other player: ${playerData.id} at position:`, position);
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
        const otherPlayer = this.otherPlayers.get(playerId);
        if (otherPlayer) {
            // Update position
            otherPlayer.position.set(position.x, position.y, position.z);
            // Update rotation
            otherPlayer.rotation = rotation;
        }
    }
    
    // Create projectile fired by another player
    createEnemyProjectile(origin, direction, weaponIndex) {
        const weapon = this.weapons[weaponIndex];
        if (weapon && weapon.projectile) {
            // Mark the source player for this projectile
            if (this.otherPlayers) {
                // Find the player who fired this projectile based on location
                for (const [playerId, otherPlayer] of Object.entries(this.otherPlayers)) {
                    const distance = origin.distanceTo(otherPlayer.position);
                    if (distance < 2) {  // Within reasonable distance
                        otherPlayer.isProjectileSource = true;
                        
                        // Clear the flag after a short delay
                        setTimeout(() => {
                            if (this.otherPlayers && this.otherPlayers[playerId]) {
                                this.otherPlayers[playerId].isProjectileSource = false;
                            }
                        }, 100);
                        break;
                    }
                }
            }
            
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
        // If player was not dead, don't try to respawn
        if (this.player && !this.player.isDead) {
            console.log("Player is already alive, no need to respawn");
            return;
        }
        
        console.log("Attempting to respawn...");
        
        // Send respawn request to server
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'respawn'
            }));
            
            showMessage("Requesting respawn...");
        } else {
            showMessage("Cannot respawn: No server connection");
        }
    }
    
    animate() {
        this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
        
        // Don't update game state when game is over
        if (this.gameOver) {
            // Still render the scene, but don't update player
            this.renderer.render(this.scene, this.camera);
            return;
        }
        
        // Update player
        if (this.player) {
            this.player.update();
        }
        
        // Update other players
        this.otherPlayers.forEach(enemy => {
            if (enemy.update) {
                enemy.update();
            }
        });
        
        // Update projectiles
        updateProjectiles(this);
        
        // Send position update to server if player is alive
        if (this.player && !this.player.isDead) {
            this.sendPositionUpdate();
        }
        
        // Render scene
        this.renderer.render(this.scene, this.camera);
    }
    
    // Send position update to server
    sendPositionUpdate() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.player || !this.playerId) {
            return;
        }
        
        // Only send update if we're alive
        if (this.player.health <= 0) {
            return;
        }
        
        // Get current player position directly from property
        const position = this.player.position;
        const rotation = this.player.model ? this.player.model.rotation.y : 0;
        
        // Send position update to server
        this.socket.send(JSON.stringify({
            type: 'playerUpdate',
            position: {
                x: position.x,
                y: position.y,
                z: position.z
            },
            rotation: rotation
        }));
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
    
    // Send projectile hit to server
    sendProjectileHit(targetId, damage) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            const message = {
                type: 'projectileHit',
                targetId: targetId,
                damage: damage
            };
            
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
    
    // Create environment from server-provided map data
    createEnvironmentFromMapData(mapData) {
        if (!mapData) return;
        
        console.log('Creating environment from server map data');
        
        // Create ground
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshLambertMaterial({ color: this.colors.GROUND });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        // Add buildings from map data
        if (mapData.buildings && Array.isArray(mapData.buildings)) {
            mapData.buildings.forEach(buildingData => {
                // Create building mesh
                const geometry = new THREE.BoxGeometry(
                    buildingData.size.x, 
                    buildingData.size.y, 
                    buildingData.size.z
                );
                const material = new THREE.MeshLambertMaterial({
                    color: new THREE.Color().setHSL(buildingData.color, 0.2, 0.5 + Math.random() * 0.2)
                });
                const building = new THREE.Mesh(geometry, material);
                building.position.set(
                    buildingData.position.x,
                    buildingData.position.y,
                    buildingData.position.z
                );
                building.castShadow = true;
                building.receiveShadow = true;
                this.scene.add(building);
                
                // Add to obstacles list for collision detection
                this.obstacles.push({
                    position: new THREE.Vector3(
                        buildingData.position.x, 
                        0, 
                        buildingData.position.z
                    ),
                    size: new THREE.Vector3(
                        buildingData.size.x,
                        buildingData.size.y,
                        buildingData.size.z
                    ),
                    mesh: building
                });
            });
        }
        
        // Add grass patches from map data
        if (mapData.grassPatches && Array.isArray(mapData.grassPatches)) {
            mapData.grassPatches.forEach(grassData => {
                const grassGeometry = new THREE.PlaneGeometry(grassData.size, grassData.size);
                const grassMaterial = new THREE.MeshLambertMaterial({ color: this.colors.GRASS });
                const grass = new THREE.Mesh(grassGeometry, grassMaterial);
                grass.rotation.x = -Math.PI / 2;
                grass.position.set(
                    grassData.position.x,
                    grassData.position.y,
                    grassData.position.z
                );
                grass.receiveShadow = true;
                this.scene.add(grass);
            });
        }
        
        console.log(`Created environment with ${mapData.buildings.length} buildings and ${mapData.grassPatches.length} grass patches`);
    }
    
    // Clear existing environment objects
    clearEnvironment() {
        // Remove all obstacle meshes from the scene
        this.obstacles.forEach(obstacle => {
            if (obstacle.mesh && this.scene) {
                this.scene.remove(obstacle.mesh);
            }
        });
        
        // Clear obstacles array
        this.obstacles = [];
        
        // Find and remove ground and grass objects
        // We'll need to iterate through scene children and remove them
        if (this.scene) {
            const objectsToRemove = [];
            
            this.scene.traverse(object => {
                // Remove ground plane and grass patches (can check by geometry or material)
                if (object instanceof THREE.Mesh) {
                    // Check if it's a PlaneGeometry (ground or grass)
                    if (object.geometry instanceof THREE.PlaneGeometry) {
                        objectsToRemove.push(object);
                    }
                }
            });
            
            // Remove the objects found
            objectsToRemove.forEach(object => {
                this.scene.remove(object);
            });
        }
        
        console.log('Cleared existing environment');
    }
    
    // Request map data from the server
    requestMapData() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'requestMapData'
            }));
            console.log('Requested map data from server');
        }
    }
} 