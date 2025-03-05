// Check if position is inside any building
export function isPositionInBuilding(position, obstacles) {
    for (let i = 0; i < obstacles.length; i++) {
        const obstacle = obstacles[i];
        const halfSize = obstacle.size.clone().multiplyScalar(0.5);
        
        if (
            position.x > obstacle.position.x - halfSize.x &&
            position.x < obstacle.position.x + halfSize.x &&
            position.z > obstacle.position.z - halfSize.z &&
            position.z < obstacle.position.z + halfSize.z
        ) {
            return true;
        }
    }
    return false;
}

// Check for collisions with obstacles and boundaries
export function checkCollision(position, size, obstacles) {
    // Check collision with buildings
    for (let i = 0; i < obstacles.length; i++) {
        const obstacle = obstacles[i];
        const halfSize = obstacle.size.clone().multiplyScalar(0.5);
        
        if (
            position.x + size/2 > obstacle.position.x - halfSize.x &&
            position.x - size/2 < obstacle.position.x + halfSize.x &&
            position.z + size/2 > obstacle.position.z - halfSize.z &&
            position.z - size/2 < obstacle.position.z + halfSize.z
        ) {
            return true;
        }
    }
    
    // Keep within bounds
    if (
        position.x < -50 || position.x > 50 ||
        position.z < -50 || position.z > 50
    ) {
        return true;
    }
    
    return false;
} 