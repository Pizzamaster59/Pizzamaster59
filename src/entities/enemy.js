// import { checkCollision } from '../utils/collision.js';
// import { showMessage, showFloatingMessage } from '../ui.js';
// import { createProjectile } from './projectile.js';
import * as THREE from 'three';
import { checkCollision } from '../utils/collision.js';
import { showFloatingMessage } from '../ui.js';

// Multiplayer implementation will replace NPC enemies
export class Enemy {
    constructor(scene, game, position, weaponIndex) {
        this.scene = scene;
        this.game = game;
        this.position = position.clone();
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.rotation = 0;
        this.size = 1;
        this.health = 100;
        
        // Make sure we have a valid weapon
        if (game && game.weapons && Array.isArray(game.weapons) && 
            weaponIndex !== undefined && weaponIndex >= 0 && 
            game.weapons[weaponIndex]) {
            this.weapon = game.weapons[weaponIndex];
        } else {
            // Default fallback weapon
            this.weapon = { name: "Fists", damage: 10, range: 1, projectile: false, cooldown: 200, color: 0xcccccc };
        }
        
        this.messageSprite = null;
        
        this.createModel();
    }
    
    createModel() {
        // Enemy 3D model
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshLambertMaterial({ color: this.game && this.game.colors ? this.game.colors.ENEMY : 0xff0000 });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);
        
        // Ensure weapon is defined
        if (!this.weapon) {
            this.weapon = { name: "Fists", damage: 10, range: 1, projectile: false, cooldown: 200, color: 0xcccccc };
        }
        
        // Add enemy weapon visual
        const hasProjectile = this.weapon.projectile;
        const weaponGeometry = hasProjectile
            ? new THREE.CylinderGeometry(0.1, 0.1, 1, 8)
            : new THREE.BoxGeometry(0.2, 0.1, 1);
        
        const weaponColor = this.weapon.color ? this.weapon.color : 0xcccccc;
        const weaponMaterial = new THREE.MeshLambertMaterial({ color: weaponColor });
        const weaponMesh = new THREE.Mesh(weaponGeometry, weaponMaterial);
        weaponMesh.position.set(0.5, 0, 0.5);
        if (hasProjectile) {
            weaponMesh.rotation.set(Math.PI/2, 0, 0);
        }
        this.mesh.add(weaponMesh);
    }
    
    damage(amount) {
        // Visual effect only - actual health is managed by server
        // Flash red
        if (this.mesh && this.mesh.material) {
            const originalColor = this.mesh.material.color.clone();
            this.mesh.material.color.set(0xff0000);
            setTimeout(() => {
                if (this.mesh && this.mesh.material) {
                    this.mesh.material.color.set(originalColor);
                }
            }, 100);
        }
    }
} 