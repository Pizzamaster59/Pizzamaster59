// UI-related functions
export function updateUI(score, health, currentWeapon) {
    document.getElementById('score').textContent = score;
    document.getElementById('health-bar').style.width = health + '%';
    document.getElementById('weapon').textContent = 'Weapon: ' + currentWeapon.name;
}

export function updateVersion(version) {
    document.getElementById('version').textContent = 'v' + version;
}

export function showMessage(text) {
    const messagesContainer = document.getElementById('messages');
    const message = document.createElement('div');
    message.className = 'message';
    message.textContent = text;
    messagesContainer.appendChild(message);
    
    // Fade out and remove after 3 seconds
    setTimeout(() => {
        message.style.opacity = '0';
        setTimeout(() => {
            messagesContainer.removeChild(message);
        }, 1000);
    }, 3000);
}

export function showFloatingMessage(text, object, scene, camera, duration = 3000) {
    // Create a text sprite that will float above the object
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512; // Larger canvas for bigger text
    canvas.height = 256;
    
    // Set background transparent
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set text color and style - bigger text
    context.font = 'bold 40px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Add text stroke for better visibility against any background
    context.strokeStyle = 'black';
    context.lineWidth = 8;
    
    // Draw text in the canvas
    const maxWidth = 490;
    const words = text.split(' ');
    let line = '';
    let lines = [];
    let y = 64;
    
    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = context.measureText(testLine);
        const testWidth = metrics.width;
        
        if (testWidth > maxWidth && i > 0) {
            lines.push(line);
            line = words[i] + ' ';
        } else {
            line = testLine;
        }
    }
    lines.push(line);
    
    // Draw the lines on the canvas
    if (lines.length === 1) {
        context.strokeText(lines[0], canvas.width / 2, canvas.height / 2);
        context.fillText(lines[0], canvas.width / 2, canvas.height / 2);
    } else {
        const lineHeight = 50; // Increased line height for bigger text
        const startY = canvas.height / 2 - (lines.length - 1) * lineHeight / 2;
        
        for (let i = 0; i < lines.length; i++) {
            context.strokeText(lines[i], canvas.width / 2, startY + i * lineHeight);
            context.fillText(lines[i], canvas.width / 2, startY + i * lineHeight);
        }
    }
    
    // Create a texture from the canvas
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true
    });
    const sprite = new THREE.Sprite(material);
    
    // Scale the sprite - make it bigger
    sprite.scale.set(4, 2, 1);
    
    // Position the sprite above the object
    sprite.position.copy(object.position);
    sprite.position.y += 2.5;
    
    // Add sprite to scene
    scene.add(sprite);
    
    // Create update function to make the sprite follow the object
    const update = function() {
        if (sprite.parent === null) return; // If removed from scene, stop updating
        
        // Make sprite always face the camera
        sprite.quaternion.copy(camera.quaternion);
        
        // Update position to follow the object
        if (object && object.position) {
            sprite.position.copy(object.position);
            sprite.position.y += 2.5;
        }
    };
    
    // Add the update function to the animation loop
    sprite.userData.update = update;
    
    // No timeout for removal - the message will stay until the enemy dies
    
    return sprite;
}

export function showGameOver(visible) {
    document.getElementById('game-over').style.display = visible ? 'block' : 'none';
    document.getElementById('restart').style.display = visible ? 'block' : 'none';
} 