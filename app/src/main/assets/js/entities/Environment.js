import * as THREE from '../../libs/three.module.js';

/**
 * 3D Arena Environment:
 * Includes bounded perimeter walls, obstacles with Cannon-es colliders,
 * explosive fuel barrels with AOE splash damage, supply pickups, and atmospheric lighting.
 */
export class Environment {
  constructor(scene, physicsWorld, soundEngine) {
    this.scene = scene;
    this.physics = physicsWorld;
    this.sound = soundEngine;

    this.collidableMeshes = [];
    this.barrels = [];
    this.pickups = [];

    this.arenaRadius = 60; // 120x120 arena size

    this.initLights();
    this.buildGround();
    this.buildPerimeterWalls();
    this.buildObstacles();
    this.spawnBarrels();
    this.initExplosionParticles();
  }

  initLights() {
    // Atmospheric Fog
    this.scene.fog = new THREE.FogExp2(0x0e1422, 0.016);

    // Rich Ambient Light
    const ambientLight = new THREE.AmbientLight(0x758aa4, 1.1);
    this.scene.add(ambientLight);

    // Hemisphere Light (sky light & ground bounce)
    const hemiLight = new THREE.HemisphereLight(0x9fc0e8, 0x222a36, 0.9);
    this.scene.add(hemiLight);

    // Directional Moonlight with Shadows
    this.moonLight = new THREE.DirectionalLight(0xdce7fa, 1.5);
    this.moonLight.position.set(30, 45, 25);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.width = 1024;
    this.moonLight.shadow.mapSize.height = 1024;
    this.moonLight.shadow.camera.near = 5;
    this.moonLight.shadow.camera.far = 120;
    const d = 60;
    this.moonLight.shadow.camera.left = -d;
    this.moonLight.shadow.camera.right = d;
    this.moonLight.shadow.camera.top = d;
    this.moonLight.shadow.camera.bottom = -d;
    this.moonLight.shadow.bias = -0.001;
    this.scene.add(this.moonLight);

    // Emergency Red Floodlights at outpost corners
    const floodlightPositions = [
      { x: -35, y: 5, z: -35, color: 0xff3838 },
      { x: 35, y: 5, z: 35, color: 0xff3838 },
      { x: -35, y: 5, z: 35, color: 0xffa502 },
      { x: 35, y: 5, z: -35, color: 0xffa502 }
    ];

    floodlightPositions.forEach(p => {
      const light = new THREE.PointLight(p.color, 1.8, 28);
      light.position.set(p.x, p.y, p.z);
      this.scene.add(light);

      // Lamp fixture mesh
      const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 5.5, 8);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.8 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(p.x, 2.75, p.z);
      this.scene.add(pole);

      const bulbGeo = new THREE.SphereGeometry(0.3, 8, 8);
      const bulbMat = new THREE.MeshBasicMaterial({ color: p.color });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(p.x, p.y, p.z);
      this.scene.add(bulb);
    });
  }

  buildGround() {
    // Procedural asphalt/concrete canvas texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#181d24';
    ctx.fillRect(0, 0, 512, 512);

    // Grid lines & distress
    ctx.strokeStyle = '#222933';
    ctx.lineWidth = 4;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i); ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Hazard stripes in center
    ctx.fillStyle = '#cc8e14';
    for (let i = 220; i < 290; i += 16) {
      ctx.fillRect(i, 236, 8, 40);
    }

    const groundTex = new THREE.CanvasTexture(canvas);
    groundTex.wrapS = THREE.RepeatWrapping;
    groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(16, 16);

    const groundGeo = new THREE.PlaneGeometry(130, 130);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.9,
      metalness: 0.1
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);

    // Physics Ground Plane
    this.physics.createGround(130);
  }

  buildPerimeterWalls() {
    const wallHeight = 6;
    const wallThick = 2;
    const size = 120;
    const half = size / 2;

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2c3340,
      roughness: 0.9,
      metalness: 0.15
    });

    const wallsData = [
      { x: 0, z: -half, w: size, d: wallThick }, // North
      { x: 0, z: half, w: size, d: wallThick },  // South
      { x: -half, z: 0, w: wallThick, d: size }, // West
      { x: half, z: 0, w: wallThick, d: size }   // East
    ];

    wallsData.forEach(w => {
      const geo = new THREE.BoxGeometry(w.w, wallHeight, w.d);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(w.x, wallHeight / 2, w.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.collidableMeshes.push(mesh);

      // Physics wall collider
      this.physics.createBox(w.x, wallHeight / 2, w.z, w.w, wallHeight, w.d);
    });
  }

  buildObstacles() {
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x3d4b3a, roughness: 0.75, metalness: 0.2 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x474f5d, roughness: 0.9, metalness: 0.1 });
    const containerMat = new THREE.MeshStandardMaterial({ color: 0x782d2d, roughness: 0.6, metalness: 0.4 });

    // Shipping Containers
    const containers = [
      { x: -18, z: -14, rot: 0.3, w: 3.2, h: 3.0, d: 8.0, mat: containerMat },
      { x: 22, z: 16, rot: -0.5, w: 3.2, h: 3.0, d: 8.0, mat: containerMat },
      { x: -24, z: 20, rot: 1.2, w: 3.2, h: 3.0, d: 8.0, mat: crateMat }
    ];

    containers.forEach(c => {
      const geo = new THREE.BoxGeometry(c.w, c.h, c.d);
      const mesh = new THREE.Mesh(geo, c.mat);
      mesh.position.set(c.x, c.h / 2, c.z);
      mesh.rotation.y = c.rot;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.collidableMeshes.push(mesh);

      // Physics box
      this.physics.createBox(c.x, c.h / 2, c.z, c.w, c.h, c.d);
    });

    // Concrete Barricades & Roadblocks
    const barricades = [
      { x: 0, z: -12, w: 6.0, h: 1.3, d: 1.2 },
      { x: -8, z: 8, w: 5.0, h: 1.3, d: 1.2 },
      { x: 12, z: -6, w: 5.0, h: 1.3, d: 1.2 },
      { x: 15, z: 28, w: 7.0, h: 1.3, d: 1.2 }
    ];

    barricades.forEach(b => {
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const mesh = new THREE.Mesh(geo, concreteMat);
      mesh.position.set(b.x, b.h / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.collidableMeshes.push(mesh);

      this.physics.createBox(b.x, b.h / 2, b.z, b.w, b.h, b.d);
    });

    // Watchtower in arena quadrant
    this.buildWatchtower(26, -26);
  }

  buildWatchtower(x, z) {
    const towerGroup = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x42382c, roughness: 0.85 });

    // 4 Corner Pillars
    for (let dx of [-2, 2]) {
      for (let dz of [-2, 2]) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 6.0, 8), woodMat);
        pillar.position.set(dx, 3.0, dz);
        pillar.castShadow = true;
        towerGroup.add(pillar);
      }
    }

    // Elevated Platform
    const platform = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.3, 4.8), woodMat);
    platform.position.set(0, 5.8, 0);
    platform.receiveShadow = true;
    towerGroup.add(platform);

    towerGroup.position.set(x, 0, z);
    this.scene.add(towerGroup);

    this.physics.createBox(x, 3.0, z, 4.8, 6.0, 4.8);
  }

  // --- Explosive Fuel Barrels ---
  spawnBarrels() {
    const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14);
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0xd63031, // Warning Red
      roughness: 0.35,
      metalness: 0.6
    });

    const barrelPositions = [
      { x: -10, z: -10 },
      { x: 14, z: 6 },
      { x: -18, z: 8 },
      { x: 8, z: -22 },
      { x: 20, z: -16 },
      { x: -28, z: -20 }
    ];

    barrelPositions.forEach((pos, idx) => {
      const mesh = new THREE.Mesh(barrelGeo, barrelMat.clone());
      mesh.position.set(pos.x, 0.55, pos.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      // Yellow hazard stripes ring
      const ringGeo = new THREE.CylinderGeometry(0.43, 0.43, 0.2, 14);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0xfdcb6e });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(0, 0.1, 0);
      mesh.add(ring);

      const barrelBody = this.physics.createDynamicBox(pos.x, 0.55, pos.z, 0.84, 1.1, 0.84, 25);

      this.barrels.push({
        id: idx,
        mesh: mesh,
        body: barrelBody,
        health: 50,
        exploded: false,
        pos: new THREE.Vector3(pos.x, 0.55, pos.z)
      });
    });
  }

  // Raycast intersection check against environment
  checkRaycastHit(raycaster) {
    // 1. Check Barrels
    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i];
      if (b.exploded) continue;

      const intersects = raycaster.intersectObject(b.mesh, false);
      if (intersects.length > 0) {
        return {
          distance: intersects[0].distance,
          point: intersects[0].point,
          isBarrel: true,
          barrelIndex: i
        };
      }
    }

    // 2. Check Static Obstacles
    const hits = raycaster.intersectObjects(this.collidableMeshes, false);
    if (hits.length > 0) {
      return {
        distance: hits[0].distance,
        point: hits[0].point,
        isBarrel: false
      };
    }

    return null;
  }

  damageBarrel(index, damage, hitPoint) {
    const b = this.barrels[index];
    if (!b || b.exploded) return;

    b.health -= damage;
    // Flash barrel yellow
    b.mesh.material.color.setHex(0xffeaa7);
    setTimeout(() => {
      if (!b.exploded) b.mesh.material.color.setHex(0xd63031);
    }, 80);

    if (b.health <= 0) {
      this.detonateBarrel(b);
    }
  }

  detonateBarrel(b) {
    b.exploded = true;
    this.sound.playExplosion();

    // Trigger Fireball explosion particles
    this.spawnFireball(b.mesh.position);

    // Blast damage & physics impulse to nearby zombies & player
    const blastRadius = 9.0;
    const blastDamage = 250;

    // Remove barrel mesh & physics
    this.scene.remove(b.mesh);
    this.physics.removeBody(b.body);

    // Notify through callback in main loop
    if (this.onBarrelExploded) {
      this.onBarrelExploded(b.mesh.position, blastRadius, blastDamage);
    }
  }

  // --- Explosion Particles FX ---
  initExplosionParticles() {
    this.maxExplosionParticles = 80;
    const geo = new THREE.SphereGeometry(0.2, 5, 5);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff7675 });
    this.explosionMesh = new THREE.InstancedMesh(geo, mat, this.maxExplosionParticles);
    this.explosionMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.explosionMesh);

    this.explosionDummy = new THREE.Object3D();
    this.explosionParticles = [];

    for (let i = 0; i < this.maxExplosionParticles; i++) {
      this.explosionParticles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        color: new THREE.Color(),
        life: 0,
        maxLife: 0.8
      });
      this.explosionDummy.position.set(0, -500, 0);
      this.explosionDummy.updateMatrix();
      this.explosionMesh.setMatrixAt(i, this.explosionDummy.matrix);
    }
    this.explosionMesh.instanceMatrix.needsUpdate = true;
  }

  spawnFireball(origin) {
    let spawned = 0;
    const colors = [0xff4757, 0xffa502, 0xff6348, 0xffffff];

    for (let i = 0; i < this.maxExplosionParticles && spawned < 40; i++) {
      const p = this.explosionParticles[i];
      if (!p.active) {
        p.active = true;
        p.pos.copy(origin);
        p.pos.y += 0.5;
        p.vel.set(
          (Math.random() - 0.5) * 14,
          Math.random() * 12 + 4,
          (Math.random() - 0.5) * 14
        );
        p.life = 0;
        p.maxLife = 0.6 + Math.random() * 0.4;
        p.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
        spawned++;
      }
    }
  }

  // --- Pickups (Medkit & Ammo Drops) ---
  spawnPickup(x, z, type = 'ammo') {
    const isMedkit = type === 'medkit';
    const group = new THREE.Group();

    if (isMedkit) {
      // Medkit Box
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.4, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
      );
      // Red Cross
      const crossH = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.08, 0.31),
        new THREE.MeshBasicMaterial({ color: 0xff3333 })
      );
      const crossV = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.28, 0.31),
        new THREE.MeshBasicMaterial({ color: 0xff3333 })
      );
      group.add(box);
      group.add(crossH);
      group.add(crossV);
    } else {
      // Military Ammo Box
      const ammoBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.35, 0.35),
        new THREE.MeshStandardMaterial({ color: 0x3b5249, roughness: 0.4, metalness: 0.4 })
      );
      group.add(ammoBox);
    }

    group.position.set(x, 0.5, z);
    this.scene.add(group);

    this.pickups.push({
      mesh: group,
      type: type,
      pos: new THREE.Vector3(x, 0.5, z),
      active: true,
      spawnTime: performance.now()
    });
  }

  update(deltaTime, playerPos, onPickupCollected) {
    // 1. Animate Pickups (bobbing & rotation)
    const now = performance.now();
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      if (!p.active) continue;

      p.mesh.rotation.y += deltaTime * 2.0;
      p.mesh.position.y = 0.4 + Math.sin(now * 0.004) * 0.12;

      // Player collection distance check
      const dist = playerPos.distanceTo(p.pos);
      if (dist < 1.6) {
        p.active = false;
        this.scene.remove(p.mesh);
        this.pickups.splice(i, 1);
        this.sound.playPickup();
        if (onPickupCollected) {
          onPickupCollected(p.type);
        }
      }
    }

    // 2. Animate Fireball Particles
    let activeParticles = 0;
    for (let i = 0; i < this.maxExplosionParticles; i++) {
      const p = this.explosionParticles[i];
      if (!p.active) continue;

      p.life += deltaTime;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.explosionDummy.position.set(0, -500, 0);
        this.explosionDummy.updateMatrix();
        this.explosionMesh.setMatrixAt(i, this.explosionDummy.matrix);
      } else {
        p.vel.y -= 12 * deltaTime; // Gravity
        p.pos.addScaledVector(p.vel, deltaTime);
        if (p.pos.y < 0.1) p.pos.y = 0.1;

        const scale = (1 - p.life / p.maxLife) * 1.8;
        this.explosionDummy.position.copy(p.pos);
        this.explosionDummy.scale.set(scale, scale, scale);
        this.explosionDummy.updateMatrix();
        this.explosionMesh.setMatrixAt(i, this.explosionDummy.matrix);
        activeParticles++;
      }
    }
    if (activeParticles > 0) {
      this.explosionMesh.instanceMatrix.needsUpdate = true;
    }
  }

  reset() {
    // Clean up pickups
    this.pickups.forEach(p => {
      this.scene.remove(p.mesh);
    });
    this.pickups = [];

    // Respawn barrels
    this.barrels.forEach(b => {
      this.scene.remove(b.mesh);
      this.physics.removeBody(b.body);
    });
    this.barrels = [];
    this.spawnBarrels();
  }
}
