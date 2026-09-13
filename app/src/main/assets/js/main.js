import * as THREE from '../libs/three.module.js';
import { SoundEngine } from './core/Audio.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { Player } from './entities/Player.js';
import { WeaponManager } from './entities/Weapons.js';
import { ZombieHorde } from './entities/ZombieHorde.js';
import { Environment } from './entities/Environment.js';
import { WaveManager } from './systems/WaveManager.js';
import { UIManager } from './systems/UIManager.js';

/**
 * Main Game Controller
 * Orchestrates Three.js rendering, Cannon-es physics stepping (fixed timestep accumulator),
 * input processing, and the complete zombie survival wave loop.
 */
class ZombieSurvivalGame {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.isPaused = false;
    this.isRunning = false;

    // 1. Core Three.js Engine Setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    this.scene.add(this.camera);

    // Initialize WebGLRenderer with fallback for emulators and software rasterizers
    const canvas = document.createElement('canvas');
    let gl = null;
    const glContextAttributes = {
      alpha: false,
      antialias: false,
      powerPreference: 'low-power',
      failIfMajorPerformanceCaveat: false,
      preserveDrawingBuffer: false
    };

    try {
      gl = canvas.getContext('webgl2', glContextAttributes) ||
           canvas.getContext('webgl', glContextAttributes) ||
           canvas.getContext('experimental-webgl', glContextAttributes);
    } catch (e) {
      console.warn('Context retrieval:', e);
    }

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        context: gl || undefined,
        antialias: false,
        powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: false,
        precision: 'mediump'
      });
    } catch (e) {
      console.warn('Fallback standard renderer:', e);
      this.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: false
      });
    }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);

    // 2. Audio & Physics
    this.sound = new SoundEngine();
    this.physics = new PhysicsWorld();

    // 3. Game Entities
    this.environment = new Environment(this.scene, this.physics, this.sound);
    this.zombieHorde = new ZombieHorde(this.scene, this.sound, 120);
    this.player = new Player(this.camera, this.physics, this.sound);
    this.weapons = new WeaponManager(this.camera, this.scene, this.sound);

    // 4. Wave & UI Systems
    this.waveManager = new WaveManager(
      this.zombieHorde,
      this.environment,
      this.sound,
      (event) => this.handleWaveEvent(event)
    );

    this.ui = new UIManager(
      this.player,
      this.weapons,
      this.sound,
      () => this.startGame(),
      () => this.restartGame()
    );

    this.ui.onResumeGame = () => this.resumeGame();
    this.ui.onPauseGame = () => this.pauseGame();
    this.ui.onFire = () => this.handleWeaponFire();

    // Barrel explosion event link
    this.environment.onBarrelExploded = (pos, radius, damage) => {
      this.handleExplosionDamage(pos, radius, damage);
    };

    // 5. Input System
    this.isPointerLocked = false;
    this.initDesktopInputs();
    this.initWindowEvents();

    // 6. Physics Step Accumulator Variables
    this.lastFrameTime = performance.now();
    this.fixedTimeStep = 1 / 60;
    this.physicsAccumulator = 0;

    // Start render loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  startGame() {
    this.sound.init();
    this.isRunning = true;
    this.isPaused = false;
    this.waveManager.startFirstWave();

    // Request pointer lock on desktop if supported
    try {
      this.renderer.domElement.requestPointerLock();
    } catch (e) {
      // Ignored on mobile touch devices
    }
  }

  pauseGame() {
    this.isPaused = true;
  }

  resumeGame() {
    this.isPaused = false;
    this.lastFrameTime = performance.now();
    try {
      this.renderer.domElement.requestPointerLock();
    } catch (e) {}
  }

  restartGame() {
    this.sound.init();
    this.physics.reset();
    this.environment.reset();
    this.zombieHorde.reset();
    this.player.reset();
    this.ui.reset();
    this.waveManager.reset();
    this.isRunning = true;
    this.isPaused = false;
    this.lastFrameTime = performance.now();
    try {
      this.renderer.domElement.requestPointerLock();
    } catch (e) {}
  }

  // --- Input Handlers (Desktop & Mouse) ---
  initDesktopInputs() {
    // Keyboard inputs
    window.addEventListener('keydown', (e) => {
      if (!this.isRunning || this.isPaused) return;

      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.player.moveForward = true; break;
        case 'KeyS': case 'ArrowDown': this.player.moveBackward = true; break;
        case 'KeyA': case 'ArrowLeft': this.player.moveLeft = true; break;
        case 'KeyD': case 'ArrowRight': this.player.moveRight = true; break;
        case 'ShiftLeft': case 'ShiftRight': this.player.setSprint(true); break;
        case 'Space': this.player.jump(); break;
        case 'KeyC': this.player.setCrouch(!this.player.isCrouching); break;
        case 'KeyR': this.weapons.startReload(); break;
        case 'Digit1': this.weapons.switchWeapon(0); this.ui.updateWeaponCards(); break;
        case 'Digit2': this.weapons.switchWeapon(1); this.ui.updateWeaponCards(); break;
        case 'Digit3': this.weapons.switchWeapon(2); this.ui.updateWeaponCards(); break;
        case 'KeyP':
          this.isPaused ? this.resumeGame() : this.ui.showPauseScreen();
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.player.moveForward = false; break;
        case 'KeyS': case 'ArrowDown': this.player.moveBackward = false; break;
        case 'KeyA': case 'ArrowLeft': this.player.moveLeft = false; break;
        case 'KeyD': case 'ArrowRight': this.player.moveRight = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.player.setSprint(false); break;
      }
    });

    // Mouse PointerLock & Looking
    this.renderer.domElement.addEventListener('click', () => {
      if (!this.isRunning || this.isPaused) return;
      if (!this.isPointerLocked) {
        this.renderer.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked && !this.isPaused) {
        this.player.handleLook(e.movementX, e.movementY);
      }
    });

    // Mouse Weapon Fire & ADS
    window.addEventListener('mousedown', (e) => {
      if (!this.isPointerLocked || this.isPaused) return;
      if (e.button === 0) { // Left Click: Fire
        this.weapons.isFiring = true;
        this.handleWeaponFire();
      } else if (e.button === 2) { // Right Click: ADS
        e.preventDefault();
        this.weapons.isADS = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.weapons.isFiring = false;
        this.weapons.releaseTrigger();
      } else if (e.button === 2) {
        this.weapons.isADS = false;
      }
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  initWindowEvents() {
    const handleResize = () => {
      const w = window.innerWidth || document.documentElement.clientWidth || screen.width;
      const h = window.innerHeight || document.documentElement.clientHeight || screen.height;
      if (w > 0 && h > 0) {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h, false);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(handleResize, 100);
      setTimeout(handleResize, 400);
    });

    // Ensure size is calibrated after DOM ready
    setTimeout(handleResize, 100);
    setTimeout(handleResize, 500);

    // Auto pause on tab hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isRunning && !this.isPaused) {
        this.ui.showPauseScreen();
      }
    });
  }

  // --- Weapon Shooting & Hit Processing ---
  handleWeaponFire() {
    const now = performance.now();
    this.ui.shotsFired++;

    this.weapons.triggerFire(now, this.zombieHorde, this.environment, (hit) => {
      if (hit.type === 'zombie') {
        this.ui.shotsHit++;
        const result = this.zombieHorde.damageZombie(
          hit.zombieIndex,
          hit.damage,
          hit.point,
          hit.isHeadshot
        );

        if (result) {
          this.ui.showHitmarker(hit.isHeadshot);
          this.ui.score += result.score;

          // Screen position for floating damage number
          const screenPos = hit.point.clone().project(this.camera);
          const sx = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
          const sy = (-(screenPos.y * 0.5) + 0.5) * window.innerHeight;
          this.ui.showDamageNumber(sx, sy, Math.round(hit.damage), hit.isHeadshot);

          if (result.killed) {
            this.ui.kills++;
            if (hit.isHeadshot) this.ui.headshots++;
            this.waveManager.onZombieKilled();
          }
        }
      }
    });
  }

  // AOE Explosion Damage (from fuel barrels)
  handleExplosionDamage(origin, radius, maxDamage) {
    // Damage nearby zombies
    this.zombieHorde.zombies.forEach(z => {
      if (!z.active || z.state === 'dead') return;
      const dist = z.pos.distanceTo(origin);
      if (dist <= radius) {
        const falloff = 1 - (dist / radius);
        const dmg = maxDamage * falloff;
        const res = this.zombieHorde.damageZombie(z.id, dmg, z.pos, false);
        if (res && res.killed) {
          this.ui.kills++;
          this.ui.score += res.score;
          this.waveManager.onZombieKilled();
        }
      }
    });

    // Damage player if in radius
    const pDist = this.player.camera.position.distanceTo(origin);
    if (pDist <= radius) {
      const pDamage = 60 * (1 - pDist / radius);
      this.player.damage(pDamage);
      this.ui.flashDamageVignette(true);
    }
  }

  // --- Wave Events ---
  handleWaveEvent(event) {
    if (event.type === 'wave_prepare') {
      this.ui.waveNumber.innerText = event.wave;
      this.ui.showWaveBanner(`WAVE ${event.wave}`, `INCOMING IN ${event.intermissionSeconds}s`, 3000);
    } else if (event.type === 'wave_start') {
      this.ui.showWaveBanner(`WAVE ${event.wave}`, `SURVIVE THE HORDE!`, 2500);
    } else if (event.type === 'wave_cleared') {
      this.ui.showWaveBanner(`WAVE ${event.wave} CLEARED!`, `SUPPLY CRATES DROPPED`, 2500);
      this.ui.score += event.wave * 500;
    }
  }

  // --- Main Animation & Simulation Loop ---
  animate() {
    requestAnimationFrame(this.animate);

    const now = performance.now();
    const frameDelta = Math.min((now - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = now;

    if (!this.isRunning || this.isPaused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // 1. Continuous Fire for Automatic Rifle
    if (this.weapons.isFiring && this.weapons.currentWeapon.type === 'auto') {
      this.handleWeaponFire();
    }

    // 2. Decoupled Physics Step (Fixed Timestep Accumulator Pattern 1/60s)
    this.physicsAccumulator += frameDelta;
    while (this.physicsAccumulator >= this.fixedTimeStep) {
      this.physics.step(this.fixedTimeStep);
      this.physicsAccumulator -= this.fixedTimeStep;
    }

    // 3. Update Player Controller
    this.player.update(frameDelta);

    // 4. Update Weapon Animations & Recoil Springs
    const isMoving = this.player.moveForward || this.player.moveBackward ||
                     this.player.moveLeft || this.player.moveRight ||
                     this.player.touchMoveVector.length() > 0.1;
    this.weapons.update(frameDelta, isMoving);

    // 5. Update Zombie Horde AI & Instanced Transforms
    const playerPos = this.player.camera.position;
    this.zombieHorde.update(frameDelta, playerPos, this.player.body, (damage) => {
      // Zombie Attack Callback
      this.player.damage(damage);
      this.ui.flashDamageVignette(false);

      if (this.player.isDead) {
        this.isRunning = false;
        this.ui.showGameOverScreen();
      }
    });

    // 6. Update Arena Environment (pickups, explosion particles)
    this.environment.update(frameDelta, playerPos, (pickupType) => {
      if (pickupType === 'medkit') {
        this.player.heal(50);
      } else if (pickupType === 'ammo') {
        this.weapons.addAmmo(36);
      }
    });

    // 7. Update Wave Progression
    this.waveManager.update(frameDelta, playerPos);

    // 8. Update UI / HUD / Minimap
    this.ui.update(this.zombieHorde, this.environment);

    // 9. Render Scene
    this.renderer.render(this.scene, this.camera);
  }
}

// Instantiate game on window load
window.addEventListener('DOMContentLoaded', () => {
  window.game = new ZombieSurvivalGame();
});
