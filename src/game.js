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
        
        // Spawn initial enemies
        for (let i = 0; i < 5; i++) {
            this.spawnEnemy();
        }
        
        // Start animation
        this.animate();
    }
    
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
    }
    
    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 200, 100);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        this.scene.add(directionalLight);
    }
    
    createPlayer() {
        this.player = new Player(this.scene, this);
    }
    
    spawnEnemy() {
        spawnEnemy(this.scene, this);
    }
    
    updateUI() {
        updateUI(this.score, this.player.health, this.player.currentWeapon);
    }
    
    showGameOver(visible) {
        showGameOver(visible);
    }
    
    restart() {
        showGameOver(false);
        
        // Cancel any existing animation frame
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        document.body.removeChild(this.renderer.domElement);
        this.init();
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
        
        // Update all enemies
        this.enemies.forEach(enemy => enemy.update());
        
        // Update all projectiles
        updateProjectiles(this);
        
        this.renderer.render(this.scene, this.camera);
    }
} 