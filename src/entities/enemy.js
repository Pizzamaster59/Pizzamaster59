import { checkCollision } from '../utils/collision.js';
import { showMessage, showFloatingMessage } from '../ui.js';
import { createProjectile } from './projectile.js';

export class Enemy {
    constructor(scene, game, position, weaponIndex) {
        this.scene = scene;
        this.game = game;
        this.position = position.clone();
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.rotation = 0;
        this.speed = 0.05 + Math.random() * 0.05;
        this.size = 1;
        this.health = 100;
        
        // Make sure we have a valid weapon
        if (game.weapons && weaponIndex !== undefined && game.weapons[weaponIndex]) {
            this.weapon = game.weapons[weaponIndex];
        } else {
            // Default fallback weapon
            this.weapon = { name: "Fists", damage: 10, range: 1, projectile: false, cooldown: 200, color: 0xcccccc };
        }
        
        this.lastAttackTime = 0;
        this.lastMessageTime = 0;
        this.messageSprite = null;
        
        this.createModel();
    }
    
    createModel() {
        // Enemy 3D model
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshLambertMaterial({ color: this.game.colors.ENEMY });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);
        
        // Add enemy weapon visual
        const hasProjectile = this.weapon && this.weapon.projectile;
        const weaponGeometry = hasProjectile
            ? new THREE.CylinderGeometry(0.1, 0.1, 1, 8)
            : new THREE.BoxGeometry(0.2, 0.1, 1);
        
        const weaponColor = this.weapon && this.weapon.color ? this.weapon.color : 0xcccccc;
        const weaponMaterial = new THREE.MeshLambertMaterial({ color: weaponColor });
        const weaponMesh = new THREE.Mesh(weaponGeometry, weaponMaterial);
        weaponMesh.position.set(0.5, 0, 0.5);
        if (this.weapon.projectile) {
            weaponMesh.rotation.set(Math.PI/2, 0, 0);
        }
        this.mesh.add(weaponMesh);
    }
    
    update() {
        const player = this.game.player;
        
        // Target player
        const toPlayer = new THREE.Vector3().subVectors(player.position, this.position).normalize();
        this.rotation = Math.atan2(toPlayer.x, toPlayer.z);
        
        // Calculate distance to player
        const distanceToPlayer = this.position.distanceTo(player.position);
        
        // Random shout with British gang slang - less frequently if we already have a message
        const now = Date.now();
        if (distanceToPlayer < 15 && now - this.lastMessageTime > 8000 && Math.random() < (this.messageSprite ? 0.005 : 0.01)) {
            this.lastMessageTime = now;
            const message = this.game.enemyMessages[Math.floor(Math.random() * this.game.enemyMessages.length)];
            
            // Remove previous message sprite if it exists
            if (this.messageSprite && this.messageSprite.parent) {
                this.scene.remove(this.messageSprite);
                this.messageSprite.material.dispose();
                if (this.messageSprite.material.map) {
                    this.messageSprite.material.map.dispose();
                }
            }
            
            // Create new floating message
            this.messageSprite = showFloatingMessage(message, this.mesh, this.scene, this.game.camera);
        }
        
        // Update message sprite position if it exists
        if (this.messageSprite && this.messageSprite.parent) {
            this.messageSprite.userData.update();
        }
        
        // Move towards player if not too close
        if (distanceToPlayer > this.weapon.range / 2) {
            this.velocity.copy(toPlayer).multiplyScalar(this.speed);
            
            // Try to move
            const newPosition = this.position.clone().add(this.velocity);
            
            // Check for collisions
            if (!checkCollision(newPosition, this.size, this.game.obstacles)) {
                this.position.copy(newPosition);
            } else {
                // Try to move around obstacles
                const sideStep = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).multiplyScalar(this.speed);
                const sidePosition = this.position.clone().add(sideStep);
                
                if (!checkCollision(sidePosition, this.size, this.game.obstacles)) {
                    this.position.copy(sidePosition);
                }
            }
        }
        
        // Update mesh position
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotation;
        
        // Attack if in range and cooldown elapsed
        if (distanceToPlayer <= this.weapon.range) {
            const now = Date.now();
            if (now - this.lastAttackTime > this.weapon.cooldown) {
                this.lastAttackTime = now;
                
                if (this.weapon.projectile) {
                    // Create projectile
                    createProjectile(
                        this.scene,
                        this.game,
                        this.position.clone(), 
                        toPlayer,
                        this.weapon,
                        true
                    );
                } else {
                    // Melee attack
                    player.damage(this.weapon.damage);
                }
            }
        }
    }
    
    damage(amount) {
        this.health -= amount;
        
        // Visual feedback - flash
        this.mesh.material.color.set(0xffff00);
        setTimeout(() => {
            if (this.mesh) this.mesh.material.color.set(this.game.colors.ENEMY);
        }, 100);
        
        if (this.health <= 0) {
            // Remove message sprite if it exists
            if (this.messageSprite && this.messageSprite.parent) {
                this.scene.remove(this.messageSprite);
                this.messageSprite.material.dispose();
                if (this.messageSprite.material.map) {
                    this.messageSprite.material.map.dispose();
                }
            }
            
            // Enemy defeated
            this.scene.remove(this.mesh);
            const index = this.game.enemies.indexOf(this);
            if (index !== -1) {
                this.game.enemies.splice(index, 1);
            }
            
            // Update score
            this.game.score++;
            this.game.updateUI();
            
            // Chance to drop a better weapon
            if (Math.random() < 0.2) {
                const nextWeaponIndex = this.game.weapons.indexOf(this.game.player.currentWeapon) + 1;
                if (nextWeaponIndex < this.game.weapons.length) {
                    this.game.player.setWeapon(this.game.weapons[nextWeaponIndex]);
                    showMessage("Picked up: " + this.game.player.currentWeapon.name);
                }
            }
            
            // Spawn new enemy
            setTimeout(() => this.game.spawnEnemy(), 2000);
        }
    }
} 