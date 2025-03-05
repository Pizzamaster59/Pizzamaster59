import { isPositionInBuilding } from '../utils/collision.js';

export function createEnvironment(scene, game) {
    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: game.colors.GROUND });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Add buildings and obstacles
    for (let i = 0; i < 20; i++) {
        createBuilding(scene, game);
    }
    
    // Add some grass patches
    for (let i = 0; i < 15; i++) {
        const size = 2 + Math.random() * 8;
        const grassGeometry = new THREE.PlaneGeometry(size, size);
        const grassMaterial = new THREE.MeshLambertMaterial({ color: game.colors.GRASS });
        const grass = new THREE.Mesh(grassGeometry, grassMaterial);
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(
            (Math.random() - 0.5) * 90,
            0.01, // Just above ground
            (Math.random() - 0.5) * 90
        );
        grass.receiveShadow = true;
        scene.add(grass);
    }
}

function createBuilding(scene, game) {
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
    
    // Create building
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshLambertMaterial({ 
        color: new THREE.Color().setHSL(Math.random() * 0.1, 0.2, 0.5 + Math.random() * 0.2)
    });
    const building = new THREE.Mesh(geometry, material);
    building.position.set(x, height/2, z);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);
    
    // Add to obstacles list for collision detection
    game.obstacles.push({
        position: new THREE.Vector3(x, 0, z),
        size: new THREE.Vector3(width, height, depth),
        mesh: building
    });
}

export function spawnEnemy(scene, game) {
    // Don't spawn if game over
    if (game.gameOver) return;
    
    // Spawn position away from player
    let x, z;
    do {
        x = (Math.random() - 0.5) * 80;
        z = (Math.random() - 0.5) * 80;
    } while (
        (Math.abs(x - game.player.position.x) < 15 && Math.abs(z - game.player.position.z) < 15) ||
        isPositionInBuilding(new THREE.Vector3(x, 0, z), game.obstacles)
    );
    
    // Random enemy weapon (biased toward melee weapons)
    const weaponIndex = Math.random() < 0.8 ? 
        Math.floor(Math.random() * 2) : // 80% chance of first two weapons
        Math.floor(Math.random() * 2) + 2; // 20% chance of last two weapons
    
    // Create enemy
    const Enemy = game.Enemy;
    const enemy = new Enemy(
        scene,
        game,
        new THREE.Vector3(x, 0.5, z),
        weaponIndex
    );
    
    // Add to enemies array
    game.enemies.push(enemy);
} 