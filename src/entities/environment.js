import { isPositionInBuilding } from '../utils/collision.js';
import THREE from '../three-module.js';

export function createEnvironment(scene, game) {
    // This function is now deprecated - environment is created from server data
    console.log("Environment creation is now handled via server-provided map data");
    
    // If for some reason we don't have server data, create a basic environment
    // This is a fallback and should not normally be used
    if (!game.socket || game.socket.readyState !== WebSocket.OPEN) {
        console.warn("No server connection, creating local fallback environment");
        // Create ground
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshLambertMaterial({ color: game.colors.GROUND });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);
        
        // Create a simple building in the center for reference
        const geometry = new THREE.BoxGeometry(5, 5, 5);
        const material = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
        const building = new THREE.Mesh(geometry, material);
        building.position.set(10, 2.5, 10);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        
        // Add to obstacles list for collision detection
        game.obstacles.push({
            position: new THREE.Vector3(10, 0, 10),
            size: new THREE.Vector3(5, 5, 5),
            mesh: building
        });
    }
}

// Deprecated - kept for backward compatibility
function createBuilding(scene, game) {
    console.log("Building creation is now handled via server-provided map data");
}

export function spawnEnemy(scene, game) {
    // This function is now handled by websocket multiplayer functionality
    console.log("Enemy spawning is now handled via multiplayer");
    /* Original enemy spawning code commented out
    // Calculate spawn position away from player
    const spawnRadius = 20 + Math.random() * 10;
    const spawnAngle = Math.random() * Math.PI * 2;
    
    let x = Math.cos(spawnAngle) * spawnRadius;
    let z = Math.sin(spawnAngle) * spawnRadius;
    
    // Add player position
    if (game && game.player) {
        x += game.player.position.x;
        z += game.player.position.z;
    }
    
    // Random enemy weapon (biased toward melee weapons)
    let weaponIndex = 0;
    if (game && game.weapons && Array.isArray(game.weapons)) {
        const maxWeaponIndex = game.weapons.length - 1;
        weaponIndex = Math.random() < 0.8 ? 
            Math.floor(Math.random() * Math.min(2, maxWeaponIndex + 1)) : // 80% chance of first two weapons 
            Math.min(Math.floor(Math.random() * 2) + 2, maxWeaponIndex); // 20% chance of last two weapons
    }
    
    // Create enemy
    if (game && game.Enemy) {
        const Enemy = game.Enemy;
        const enemy = new Enemy(
            scene,
            game,
            new THREE.Vector3(x, 0.5, z),
            weaponIndex
        );
        
        // Add to enemies array
        if (game.enemies) {
            game.enemies.push(enemy);
        }
    }
    */
} 