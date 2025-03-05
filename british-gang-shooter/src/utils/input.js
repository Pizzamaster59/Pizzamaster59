export class InputHandler {
    constructor(game) {
        this.game = game;
        this.player = game.player;
        
        // Set up event listeners
        window.addEventListener('resize', this.onWindowResize.bind(this));
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));
        document.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        
        // Set up restart button
        document.getElementById('restart').addEventListener('click', () => {
            this.game.restart();
        });
    }
    
    onWindowResize() {
        this.game.camera.aspect = window.innerWidth / window.innerHeight;
        this.game.camera.updateProjectionMatrix();
        this.game.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    onKeyDown(event) {
        if (this.game.gameOver) return;
        
        switch(event.key) {
            case 'w': case 'ArrowUp':
                this.player.keys.up = true;
                break;
            case 's': case 'ArrowDown':
                this.player.keys.down = true;
                break;
            case 'a': case 'ArrowLeft':
                this.player.keys.left = true;
                break;
            case 'd': case 'ArrowRight':
                this.player.keys.right = true;
                break;
            case '1': case '2': case '3': case '4':
                const weaponIndex = parseInt(event.key) - 1;
                if (weaponIndex >= 0 && weaponIndex < this.game.weapons.length) {
                    this.player.setWeapon(this.game.weapons[weaponIndex]);
                }
                break;
        }
    }
    
    onKeyUp(event) {
        switch(event.key) {
            case 'w': case 'ArrowUp':
                this.player.keys.up = false;
                break;
            case 's': case 'ArrowDown':
                this.player.keys.down = false;
                break;
            case 'a': case 'ArrowLeft':
                this.player.keys.left = false;
                break;
            case 'd': case 'ArrowRight':
                this.player.keys.right = false;
                break;
        }
    }
    
    onMouseDown(event) {
        if (this.game.gameOver) return;
        this.player.attack();
    }
    
    onMouseMove(event) {
        if (this.game.gameOver) return;
        
        // Convert mouse position to normalized device coordinates
        this.player.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.player.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // Create a raycaster to determine where in the 3D world the mouse is pointing
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(this.player.mouse, this.game.camera);
        
        // Define a plane at the player's height
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.player.position.y);
        
        // Find the point where the ray intersects with the plane
        const targetPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, targetPoint);
        
        // Calculate angle between player and target point
        const dx = targetPoint.x - this.player.position.x;
        const dz = targetPoint.z - this.player.position.z;
        this.player.rotation = Math.atan2(dx, dz);
    }
} 