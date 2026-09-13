import * as THREE from '../../libs/three.module.js';

/**
 * Weapons System: Pistol, Shotgun, Assault Rifle
 * Includes procedural 3D weapon models, spring recoil simulation,
 * ADS, muzzle flashes, raycasting, and pooled bullet tracers.
 */
export class WeaponManager {
  constructor(camera, scene, soundEngine) {
    this.camera = camera;
    this.scene = scene;
    this.sound = soundEngine;

    // Weapon Definitions
    this.weaponConfigs = [
      {
        id: 0,
        name: '9mm Pistol',
        type: 'semi',
        damage: 32,
        clipSize: 12,
        maxReserve: 60,
        currentClip: 12,
        currentReserve: 48,
        fireRate: 0.2, // seconds between shots
        reloadTime: 1.1,
        spreadHip: 0.012,
        spreadADS: 0.003,
        pellets: 1,
        recoilKickZ: 0.06,
        recoilKickRotX: 0.12,
        restPos: new THREE.Vector3(0.18, -0.16, -0.38),
        adsPos: new THREE.Vector3(0.0, -0.12, -0.30),
        restRot: new THREE.Euler(0, 0, 0),
        buildModel: () => this.createPistolMesh()
      },
      {
        id: 1,
        name: '12G Shotgun',
        type: 'pump',
        damage: 18, // per pellet x 8 pellets = 144 max
        clipSize: 8,
        maxReserve: 32,
        currentClip: 8,
        currentReserve: 24,
        fireRate: 0.75,
        reloadTime: 1.8,
        spreadHip: 0.055,
        spreadADS: 0.035,
        pellets: 8,
        recoilKickZ: 0.12,
        recoilKickRotX: 0.25,
        restPos: new THREE.Vector3(0.20, -0.18, -0.42),
        adsPos: new THREE.Vector3(0.0, -0.13, -0.36),
        restRot: new THREE.Euler(0, 0, 0),
        buildModel: () => this.createShotgunMesh()
      },
      {
        id: 2,
        name: 'AR-15 Rifle',
        type: 'auto',
        damage: 24,
        clipSize: 30,
        maxReserve: 180,
        currentClip: 30,
        currentReserve: 120,
        fireRate: 0.095, // ~10.5 rounds/sec
        reloadTime: 1.5,
        spreadHip: 0.024,
        spreadADS: 0.006,
        pellets: 1,
        recoilKickZ: 0.05,
        recoilKickRotX: 0.08,
        restPos: new THREE.Vector3(0.20, -0.18, -0.44),
        adsPos: new THREE.Vector3(0.0, -0.14, -0.38),
        restRot: new THREE.Euler(0, 0, 0),
        buildModel: () => this.createRifleMesh()
      }
    ];

    this.currentIndex = 0;
    this.currentWeapon = this.weaponConfigs[this.currentIndex];

    // State
    this.isFiring = false;
    this.isReloading = false;
    this.isADS = false;
    this.lastFireTime = 0;
    this.reloadEndTime = 0;
    this.semiTriggerReleased = true;

    // View Model Container
    this.weaponPivot = new THREE.Group();
    this.camera.add(this.weaponPivot);

    // Build all weapon models and attach to pivot
    this.weaponMeshes = [];
    this.weaponConfigs.forEach((cfg, idx) => {
      const mesh = cfg.buildModel();
      mesh.visible = idx === this.currentIndex;
      this.weaponPivot.add(mesh);
      this.weaponMeshes.push(mesh);
    });

    // Recoil Spring Variables
    this.recoilPosOffset = new THREE.Vector3();
    this.recoilRotOffset = new THREE.Vector3();
    this.recoilPosVelocity = new THREE.Vector3();
    this.recoilRotVelocity = new THREE.Vector3();

    // Muzzle Flash Light & Mesh
    this.muzzleLight = new THREE.PointLight(0xffaa33, 0, 8);
    this.scene.add(this.muzzleLight);
    this.muzzleFlashTimer = 0;

    // Bullet Tracers Pool
    this.tracerPool = [];
    this.maxTracers = 24;
    this.initTracers();

    // Raycaster for projectile hit detection
    this.raycaster = new THREE.Raycaster();
  }

  // --- Procedural 3D Weapon Models ---

  createPistolMesh() {
    const group = new THREE.Group();
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x1f242e, roughness: 0.35, metalness: 0.75 });
    const slideMat = new THREE.MeshStandardMaterial({ color: 0x3d4452, roughness: 0.25, metalness: 0.85 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.8, metalness: 0.1 });

    // Gun body / slide
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.22), slideMat);
    slide.position.set(0, 0.04, -0.05);
    slide.castShadow = true;
    group.add(slide);

    // Barrel tip
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.08, 12), slideMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, -0.16);
    group.add(barrel);

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.06), gripMat);
    grip.rotation.x = -0.25;
    grip.position.set(0, -0.04, 0.01);
    group.add(grip);

    // Iron sights
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.01), slideMat);
    rearSight.position.set(0, 0.07, 0.05);
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.015, 0.01), slideMat);
    frontSight.position.set(0, 0.07, -0.14);
    group.add(rearSight);
    group.add(frontSight);

    return group;
  }

  createShotgunMesh() {
    const group = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x242830, roughness: 0.3, metalness: 0.85 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3825, roughness: 0.65, metalness: 0.05 });

    // Long double barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.52, 12), metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025, -0.16);
    barrel.castShadow = true;
    group.add(barrel);

    // Magazine tube underneath
    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.46, 12), metalMat);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.01, -0.14);
    group.add(magTube);

    // Receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.22), metalMat);
    receiver.position.set(0, 0.01, 0.05);
    group.add(receiver);

    // Pump slide
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 12), woodMat);
    pump.rotation.x = Math.PI / 2;
    pump.position.set(0, -0.01, -0.16);
    group.add(pump);

    // Stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.08, 0.25), woodMat);
    stock.rotation.x = -0.15;
    stock.position.set(0, -0.06, 0.22);
    group.add(stock);

    return group;
  }

  createRifleMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.35, metalness: 0.8 });
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x2b303c, roughness: 0.2, metalness: 0.9 });
    const magMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.7, metalness: 0.2 });

    // Main Upper & Lower Receiver
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, 0.32), bodyMat);
    receiver.position.set(0, 0.02, -0.02);
    receiver.castShadow = true;
    group.add(receiver);

    // Barrel & Handguard
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.055, 0.28), bodyMat);
    handguard.position.set(0, 0.025, -0.28);
    group.add(handguard);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.52, 12), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.025, -0.34);
    group.add(barrel);

    // Muzzle Brake
    const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8), barrelMat);
    brake.rotation.x = Math.PI / 2;
    brake.position.set(0, 0.025, -0.58);
    group.add(brake);

    // Curved Magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.16, 0.08), magMat);
    mag.rotation.x = 0.25;
    mag.position.set(0, -0.09, -0.08);
    group.add(mag);

    // Pistol Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.12, 0.05), magMat);
    grip.rotation.x = -0.3;
    grip.position.set(0, -0.06, 0.08);
    group.add(grip);

    // Red Dot Sight Housing
    const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.09), bodyMat);
    sightBase.position.set(0, 0.075, -0.04);
    group.add(sightBase);

    // Red Dot Lens
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4 });
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.005, 12), lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.085, -0.04);
    group.add(lens);

    return group;
  }

  // --- Bullet Tracers Pool ---

  initTracers() {
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffeaa7,
      transparent: true,
      opacity: 0.85
    });
    for (let i = 0; i < this.maxTracers; i++) {
      const geo = new THREE.CylinderGeometry(0.008, 0.008, 1.2, 4);
      geo.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, tracerMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.tracerPool.push({
        mesh: mesh,
        active: false,
        startPos: new THREE.Vector3(),
        endPos: new THREE.Vector3(),
        progress: 0,
        speed: 80
      });
    }
  }

  spawnTracer(origin, hitPoint) {
    const tracer = this.tracerPool.find(t => !t.active);
    if (!tracer) return;
    tracer.active = true;
    tracer.progress = 0;
    tracer.startPos.copy(origin);
    tracer.endPos.copy(hitPoint);
    tracer.mesh.position.copy(origin);
    tracer.mesh.lookAt(hitPoint);
    tracer.mesh.visible = true;
  }

  // --- Weapon Actions ---

  switchWeapon(index) {
    if (index < 0 || index >= this.weaponConfigs.length) return;
    if (this.currentIndex === index || this.isReloading) return;

    this.currentIndex = index;
    this.currentWeapon = this.weaponConfigs[this.currentIndex];

    // Update mesh visibility
    this.weaponMeshes.forEach((mesh, idx) => {
      mesh.visible = idx === this.currentIndex;
    });

    this.sound.playReloadClick(1.4);
  }

  startReload() {
    const w = this.currentWeapon;
    if (this.isReloading) return;
    if (w.currentClip === w.clipSize) return;
    if (w.currentReserve <= 0) return;

    this.isReloading = true;
    this.reloadEndTime = performance.now() + w.reloadTime * 1000;
    this.sound.playReloadClick(0.9);

    // Dip weapon during reload
    this.recoilPosVelocity.y = -0.15;
    this.recoilRotVelocity.x = -0.3;
  }

  triggerFire(now, zombieHorde, environment, onHitCallback) {
    const w = this.currentWeapon;

    // Check semi trigger
    if (w.type === 'semi' && !this.semiTriggerReleased) return;
    if (w.type === 'semi') this.semiTriggerReleased = false;

    // Check reloading
    if (this.isReloading) return;

    // Check ammo
    if (w.currentClip <= 0) {
      this.sound.playDryFire();
      this.startReload();
      return;
    }

    // Check fire rate cooldown
    if (now - this.lastFireTime < w.fireRate * 1000) return;

    this.lastFireTime = now;
    w.currentClip--;

    // Play Weapon Audio
    if (w.id === 0) this.sound.playPistol();
    else if (w.id === 1) this.sound.playShotgun();
    else if (w.id === 2) this.sound.playRifle();

    // Trigger Recoil Kick
    this.applyRecoilKick(w);

    // Muzzle Flash
    this.triggerMuzzleFlash();

    // Raycast Shooting
    this.executeRaycasts(w, zombieHorde, environment, onHitCallback);

    // Auto reload if clip emptied
    if (w.currentClip <= 0 && w.currentReserve > 0) {
      setTimeout(() => this.startReload(), 200);
    }
  }

  releaseTrigger() {
    this.semiTriggerReleased = true;
  }

  applyRecoilKick(w) {
    // Push weapon back and tilt up
    this.recoilPosOffset.z += w.recoilKickZ;
    this.recoilRotOffset.x += w.recoilKickRotX;
    // Slight random horizontal shake
    this.recoilRotOffset.y += (Math.random() - 0.5) * 0.03;
  }

  triggerMuzzleFlash() {
    const muzzleWorldPos = new THREE.Vector3();
    this.weaponPivot.getWorldPosition(muzzleWorldPos);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    muzzleWorldPos.addScaledVector(forward, 0.4);

    this.muzzleLight.position.copy(muzzleWorldPos);
    this.muzzleLight.intensity = 4.5;
    this.muzzleFlashTimer = 0.05;
  }

  executeRaycasts(w, zombieHorde, environment, onHitCallback) {
    const pellets = w.pellets || 1;
    const spreadAngle = this.isADS ? w.spreadADS : w.spreadHip;

    // Get origin from camera
    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);

    for (let p = 0; p < pellets; p++) {
      // Calculate ray direction with spread
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);

      const spreadX = (Math.random() * 2 - 1) * spreadAngle;
      const spreadY = (Math.random() * 2 - 1) * spreadAngle;

      const rayDir = forward.clone()
        .addScaledVector(right, spreadX)
        .addScaledVector(up, spreadY)
        .normalize();

      this.raycaster.set(origin, rayDir);
      this.raycaster.far = 120;

      // 1. Raycast against Zombie Horde
      let closestHit = null;
      let hitZombieInfo = null;

      if (zombieHorde) {
        hitZombieInfo = zombieHorde.checkRaycastHit(this.raycaster, origin);
        if (hitZombieInfo) {
          closestHit = {
            distance: hitZombieInfo.distance,
            point: hitZombieInfo.point,
            isZombie: true,
            isHeadshot: hitZombieInfo.isHeadshot,
            zombieIndex: hitZombieInfo.zombieIndex
          };
        }
      }

      // 2. Raycast against Environment (barrels, walls, obstacles)
      if (environment) {
        const envHit = environment.checkRaycastHit(this.raycaster);
        if (envHit && (!closestHit || envHit.distance < closestHit.distance)) {
          closestHit = {
            distance: envHit.distance,
            point: envHit.point,
            isZombie: false,
            isBarrel: envHit.isBarrel,
            barrelIndex: envHit.barrelIndex
          };
        }
      }

      const endPoint = closestHit
        ? closestHit.point
        : origin.clone().addScaledVector(rayDir, 80);

      // Spawn bullet tracer
      this.spawnTracer(origin.clone().addScaledVector(right, 0.1).addScaledVector(up, -0.1), endPoint);

      // Handle Hit Effects
      if (closestHit) {
        if (closestHit.isZombie) {
          const finalDamage = closestHit.isHeadshot ? w.damage * 3 : w.damage;
          if (onHitCallback) {
            onHitCallback({
              type: 'zombie',
              damage: finalDamage,
              isHeadshot: closestHit.isHeadshot,
              zombieIndex: closestHit.zombieIndex,
              point: closestHit.point
            });
          }
        } else if (closestHit.isBarrel) {
          if (environment) {
            environment.damageBarrel(closestHit.barrelIndex, w.damage, closestHit.point);
          }
        }
      }
    }
  }

  // --- Animation & Recoil Spring Update ---

  update(deltaTime, isMoving) {
    const w = this.currentWeapon;
    const now = performance.now();

    // Check reload completion
    if (this.isReloading && now >= this.reloadEndTime) {
      this.isReloading = false;
      const needed = w.clipSize - w.currentClip;
      const loaded = Math.min(needed, w.currentReserve);
      w.currentClip += loaded;
      w.currentReserve -= loaded;
    }

    // Continuous fire for automatic weapons
    if (this.isFiring && w.type === 'auto') {
      // Trigger handled in main loop
    }

    // Recoil Spring Simulation (Hooke's Law + damping)
    const springK = 80;
    const damping = 12;

    const fx = -springK * this.recoilPosOffset.x - damping * this.recoilPosVelocity.x;
    const fy = -springK * this.recoilPosOffset.y - damping * this.recoilPosVelocity.y;
    const fz = -springK * this.recoilPosOffset.z - damping * this.recoilPosVelocity.z;

    this.recoilPosVelocity.x += fx * deltaTime;
    this.recoilPosVelocity.y += fy * deltaTime;
    this.recoilPosVelocity.z += fz * deltaTime;

    this.recoilPosOffset.x += this.recoilPosVelocity.x * deltaTime;
    this.recoilPosOffset.y += this.recoilPosVelocity.y * deltaTime;
    this.recoilPosOffset.z += this.recoilPosVelocity.z * deltaTime;

    const rfx = -springK * this.recoilRotOffset.x - damping * this.recoilRotVelocity.x;
    const rfy = -springK * this.recoilRotOffset.y - damping * this.recoilRotVelocity.y;

    this.recoilRotVelocity.x += rfx * deltaTime;
    this.recoilRotVelocity.y += rfy * deltaTime;

    this.recoilRotOffset.x += this.recoilRotVelocity.x * deltaTime;
    this.recoilRotOffset.y += this.recoilRotVelocity.y * deltaTime;

    // Target position (Rest vs ADS)
    const targetPos = this.isADS ? w.adsPos : w.restPos;
    const lerpSpeed = this.isADS ? 14 : 10;

    this.weaponPivot.position.lerp(targetPos, lerpSpeed * deltaTime);
    this.weaponPivot.position.x += this.recoilPosOffset.x;
    this.weaponPivot.position.y += this.recoilPosOffset.y;
    this.weaponPivot.position.z += this.recoilPosOffset.z;

    // Slight weapon sway when moving
    if (isMoving && !this.isADS) {
      const time = now * 0.006;
      this.weaponPivot.position.x += Math.sin(time) * 0.008;
      this.weaponPivot.position.y += Math.abs(Math.cos(time)) * 0.006;
    }

    this.weaponPivot.rotation.x = this.recoilRotOffset.x;
    this.weaponPivot.rotation.y = this.recoilRotOffset.y;

    // Smooth FOV zoom during ADS
    const targetFov = this.isADS ? 52 : 75;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 12 * deltaTime);
    this.camera.updateProjectionMatrix();

    // Muzzle Flash Light Decay
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= deltaTime;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleLight.intensity = 0;
      }
    }

    // Update Bullet Tracers
    this.updateTracers(deltaTime);
  }

  updateTracers(deltaTime) {
    this.tracerPool.forEach(t => {
      if (!t.active) return;
      t.progress += t.speed * deltaTime;
      const dir = t.endPos.clone().sub(t.startPos);
      const totalDist = dir.length();
      if (t.progress >= totalDist) {
        t.active = false;
        t.mesh.visible = false;
      } else {
        const currentPos = t.startPos.clone().addScaledVector(dir.normalize(), t.progress);
        t.mesh.position.copy(currentPos);
      }
    });
  }

  addAmmo(rounds) {
    this.currentWeapon.currentReserve = Math.min(
      this.currentWeapon.currentReserve + rounds,
      this.currentWeapon.maxReserve
    );
  }
}
