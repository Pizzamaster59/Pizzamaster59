import { checkCollision } from '../utils/collision.js';
import { showMessage } from '../ui.js';
import { createProjectile } from './projectile.js';
import THREE from '../three-module.js';

export class Player {
    constructor(scene, game) {
        this.scene = scene;
        this.game = game;
        this.position = new THREE.Vector3(0, 0.5, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.rotation = 0;
        this.speed = 0.15;
        this.size = 1;
        this.keys = { up: false, down: false, left: false, right: false };
        this.mouse = new THREE.Vector2();
        this.health = 100;
        this.currentWeapon = game.weapons[0];
        this.lastAttackTime = 0;
        this.isDead = false;
        
        this.createModel();
    }
    
    createModel() {
        // Player 3D model
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshLambertMaterial({ color: this.game.colors.PLAYER });
        this.model = new THREE.Mesh(geometry, material);
        this.model.position.copy(this.position);
        this.model.castShadow = true;
        this.model.receiveShadow = true;
        this.scene.add(this.model);
        
        // Add weapon to player
        this.updateWeaponModel();
    }
    
    updateWeaponModel() {
        // Remove old weapon if exists
        if (this.model.weapon) {
            this.model.remove(this.model.weapon);
        }
        
        // Create weapon mesh based on current weapon
        const weaponGeometry = this.currentWeapon.projectile 
            ? new THREE.CylinderGeometry(0.1, 0.1, 1.5, 8)
            : new THREE.BoxGeometry(0.2, 0.1, 1.2);
        
        const weaponMaterial = new THREE.MeshLambertMaterial({ color: this.currentWeapon.color });
        this.model.weapon = new THREE.Mesh(weaponGeometry, weaponMaterial);
        
        // Position weapon in player's "hand"
        this.model.weapon.position.set(0.7, 0, 0);
        if (this.currentWeapon.projectile) {
            this.model.weapon.rotation.set(Math.PI/2, 0, 0);
        }
        
        this.model.add(this.model.weapon);
    }
    
    setWeapon(weapon) {
        this.currentWeapon = weapon;
        this.updateWeaponModel();
        this.game.updateUI();
    }
    
    update() {
        // Skip movement if player is dead
        if (this.isDead) {
            return;
        }
        
        // Handle keyboard movement
        this.velocity.x = 0;
        this.velocity.z = 0;
        
        if (this.keys.up) this.velocity.z = -this.speed;
        if (this.keys.down) this.velocity.z = this.speed;
        if (this.keys.left) this.velocity.x = -this.speed;
        if (this.keys.right) this.velocity.x = this.speed;
        
        // Normalize velocity for diagonal movement
        if (this.velocity.x !== 0 && this.velocity.z !== 0) {
            this.velocity.normalize().multiplyScalar(this.speed);
        }
        
        // Store old position for collision resolution
        const oldPosition = this.position.clone();
        
        // Update position based on velocity
        this.position.add(this.velocity);
        
        // Check boundary collisions (keep player within play area)
        if (this.game.battleRoyaleZoneSize) {
            const maxDistance = this.game.battleRoyaleZoneSize / 2;
            const distanceFromCenter = Math.sqrt(this.position.x * this.position.x + this.position.z * this.position.z);
            
            if (distanceFromCenter > maxDistance) {
                // Keep player within zone
                const angle = Math.atan2(this.position.z, this.position.x);
                this.position.x = Math.cos(angle) * maxDistance;
                this.position.z = Math.sin(angle) * maxDistance;
            }
        }
        
        // Check collisions with obstacles
        if (this.game.obstacles) {
            for (const obstacle of this.game.obstacles) {
                if (checkCollision(this.position, this.size, obstacle.position, obstacle.size)) {
                    // Collision detected, revert to old position
                    this.position.copy(oldPosition);
                    break;
                }
            }
        }
        
        // Update model position
        this.model.position.copy(this.position);
        
        // Face the direction of mouse cursor
        if (this.game.camera) {
            const cameraPosition = this.game.camera.position.clone();
            this.model.lookAt(cameraPosition.x, this.model.position.y, cameraPosition.z);
        }
    }
    
    attack() {
        // Don't allow attacking if player is dead
        if (this.isDead) {
            return;
        }
        
        const now = Date.now();
        
        // Check if cooldown has elapsed
        if (now - this.lastAttackTime < this.currentWeapon.cooldown) {
            return;
        }
        
        this.lastAttackTime = now;
        
        // Get rotation for direction vector - handle potential NaN values
        const safeRotation = isNaN(this.rotation) ? 0 : this.rotation;
        
        if (this.currentWeapon.projectile) {
            // Create direction vector from player rotation
            const direction = new THREE.Vector3(
                Math.sin(safeRotation),
                0,
                Math.cos(safeRotation)
            );
            
            // Validate direction vector
            if (direction.lengthSq() === 0) {
                console.error("Zero length direction vector in attack method");
                direction.set(0, 0, 1); // Default forward
            }
            
            // Origin for projectile
            const origin = new THREE.Vector3(
                this.position.x + direction.x,
                this.position.y,
                this.position.z + direction.z
            );
            
            // Spawn projectile locally
            createProjectile(
                this.scene,
                this.game,
                origin,
                direction,
                this.currentWeapon,
                false
            );
            
            // Send projectile info to server for multiplayer
            if (this.game.socket && this.game.socket.readyState === WebSocket.OPEN) {
                this.game.sendAttack(null, true, origin, direction);
            }
        } else {
            // Melee attack
            const direction = new THREE.Vector3(
                Math.sin(safeRotation),
                0,
                Math.cos(safeRotation)
            );
            
            // Validate melee direction vector
            if (direction.lengthSq() === 0) {
                direction.set(0, 0, 1); // Default forward
            }
            
            let hitAnyone = false;
            
            // Check for other players in melee range
            this.game.otherPlayers.forEach((enemy, playerId) => {
                const distance = enemy.position.distanceTo(this.position);
                
                if (distance <= this.currentWeapon.range) {
                    // Check if enemy is in front of player using dot product
                    const toEnemy = new THREE.Vector3().subVectors(enemy.position, this.position).normalize();
                    const dot = direction.dot(toEnemy);
                    
                    if (dot > 0.7) { // Within about 45 degrees
                        // Visual feedback only - server determines actual damage
                        enemy.damage(10);
                        
                        // Notify server of hit
                        if (this.game.socket && this.game.socket.readyState === WebSocket.OPEN) {
                            this.game.sendAttack(playerId, false);
                        }
                        
                        hitAnyone = true;
                    }
                }
            });
            
            // Legacy support for NPC enemies (for testing without multiplayer)
            if (this.game.enemies) {
                for (let i = 0; i < this.game.enemies.length; i++) {
                    const enemy = this.game.enemies[i];
                    const distance = enemy.position.distanceTo(this.position);
                    
                    if (distance <= this.currentWeapon.range) {
                        // Check if enemy is in front of player using dot product
                        const toEnemy = new THREE.Vector3().subVectors(enemy.position, this.position).normalize();
                        const dot = direction.dot(toEnemy);
                        
                        if (dot > 0.7) { // Within about 45 degrees
                            enemy.damage(this.currentWeapon.damage);
                            hitAnyone = true;
                        }
                    }
                }
            }
            
            // Show message if we didn't hit anyone
            if (!hitAnyone) {
                // Swing animation could be added here
            }
        }
    }
    
    damage(amount) {
        this.health -= amount;
        this.game.updateUI();
        
        // Visual feedback - flash player red
        this.model.material.color.set(0xff0000);
        setTimeout(() => {
            this.model.material.color.set(this.game.colors.PLAYER);
        }, 100);
        
        // Check if player is dead
        if (this.health <= 0) {
            // Player is now dead - the actual game over handling is done by handlePlayerDeath
            // and other server messages. We don't set game.gameOver here since the server
            // is the source of truth about player death.
            console.log("Player health reduced to zero");
        }
    }
} 