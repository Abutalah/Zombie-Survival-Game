import * as THREE from '../../libs/three.module.js';

/**
 * High-Performance Instanced Zombie Horde System
 * Renders hundreds of animated zombies using 6 InstancedMesh draw calls (Head, Torso, Limbs).
 * Features: Object pooling, Boids separation AI, Type stats, Headshots, Ragdoll death animations.
 */
export class ZombieHorde {
  constructor(scene, soundEngine, maxZombies = 120) {
    this.scene = scene;
    this.sound = soundEngine;
    this.maxZombies = maxZombies;

    // Materials
    this.zombieMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.85,
      metalness: 0.1,
      bumpScale: 0.05
    });

    // Segmented Instanced Meshes for Procedural Skeletal Walking Animations
    const headGeo = new THREE.BoxGeometry(0.30, 0.30, 0.30);
    const torsoGeo = new THREE.BoxGeometry(0.46, 0.62, 0.28);
    const armGeo = new THREE.BoxGeometry(0.14, 0.58, 0.14);
    armGeo.translate(0, -0.25, 0); // Pivot at shoulder
    const legGeo = new THREE.BoxGeometry(0.16, 0.68, 0.16);
    legGeo.translate(0, -0.32, 0); // Pivot at hip

    this.headMesh = new THREE.InstancedMesh(headGeo, this.zombieMaterial, this.maxZombies);
    this.torsoMesh = new THREE.InstancedMesh(torsoGeo, this.zombieMaterial, this.maxZombies);
    this.leftArmMesh = new THREE.InstancedMesh(armGeo, this.zombieMaterial, this.maxZombies);
    this.rightArmMesh = new THREE.InstancedMesh(armGeo, this.zombieMaterial, this.maxZombies);
    this.leftLegMesh = new THREE.InstancedMesh(legGeo, this.zombieMaterial, this.maxZombies);
    this.rightLegMesh = new THREE.InstancedMesh(legGeo, this.zombieMaterial, this.maxZombies);

    const parts = [
      this.headMesh, this.torsoMesh,
      this.leftArmMesh, this.rightArmMesh,
      this.leftLegMesh, this.rightLegMesh
    ];

    parts.forEach(mesh => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(mesh);
    });

    // Reusable matrices & vectors to prevent GC allocations
    this.dummy = new THREE.Object3D();
    this.tempMatrix = new THREE.Matrix4();
    this.tempColor = new THREE.Color();

    // Zombie Pool Data
    this.zombies = [];
    for (let i = 0; i < this.maxZombies; i++) {
      this.zombies.push({
        id: i,
        active: false,
        type: 'walker', // walker, runner, tank
        maxHealth: 100,
        health: 100,
        speed: 3.2,
        damage: 15,
        attackCooldown: 1.0,
        lastAttackTime: 0,
        scale: 1.0,
        pos: new THREE.Vector3(0, -100, 0), // off-screen when inactive
        rotY: 0,
        animPhase: Math.random() * Math.PI * 2,
        state: 'idle', // idle, chase, attack, dead
        deathTime: 0,
        deathRotX: 0,
        hitFlashTimer: 0,
        baseColor: new THREE.Color(0x4a6344)
      });
      // Initialize matrices to far away
      this.hideInstance(i);
    }

    this.updateInstanceMatrices();

    // Pooled Blood & Impact Particles
    this.initBloodParticles();
  }

  // Hide an inactive zombie instance under the map
  hideInstance(index) {
    this.dummy.position.set(0, -500, 0);
    this.dummy.scale.set(0.001, 0.001, 0.001);
    this.dummy.updateMatrix();

    this.headMesh.setMatrixAt(index, this.dummy.matrix);
    this.torsoMesh.setMatrixAt(index, this.dummy.matrix);
    this.leftArmMesh.setMatrixAt(index, this.dummy.matrix);
    this.rightArmMesh.setMatrixAt(index, this.dummy.matrix);
    this.leftLegMesh.setMatrixAt(index, this.dummy.matrix);
    this.rightLegMesh.setMatrixAt(index, this.dummy.matrix);
  }

  // Spawn Zombie from Pool
  spawnZombie(x, z, type = 'walker') {
    const zObj = this.zombies.find(z => !z.active);
    if (!zObj) return null; // pool full

    zObj.active = true;
    zObj.type = type;
    zObj.pos.set(x, 0.9, z);
    zObj.rotY = Math.random() * Math.PI * 2;
    zObj.animPhase = Math.random() * Math.PI * 2;
    zObj.state = 'chase';
    zObj.hitFlashTimer = 0;
    zObj.deathTime = 0;
    zObj.deathRotX = 0;

    // Type Stats & Scaling
    if (type === 'walker') {
      zObj.maxHealth = 100;
      zObj.health = 100;
      zObj.speed = 2.8 + Math.random() * 0.8;
      zObj.damage = 15;
      zObj.scale = 1.0;
      zObj.baseColor.setHex(0x4a6344); // diseased undead green
    } else if (type === 'runner') {
      zObj.maxHealth = 60;
      zObj.health = 60;
      zObj.speed = 6.2 + Math.random() * 1.2;
      zObj.damage = 10;
      zObj.scale = 0.9;
      zObj.baseColor.setHex(0x782828); // dried bloody crimson
    } else if (type === 'tank') {
      zObj.maxHealth = 350;
      zObj.health = 350;
      zObj.speed = 2.0;
      zObj.damage = 35;
      zObj.scale = 1.6;
      zObj.baseColor.setHex(0x2f3542); // dark stony behemoth
    }

    this.setInstanceColor(zObj.id, zObj.baseColor);
    return zObj;
  }

  setInstanceColor(index, color) {
    this.torsoMesh.setColorAt(index, color);
    this.headMesh.setColorAt(index, color);
    this.leftArmMesh.setColorAt(index, color);
    this.rightArmMesh.setColorAt(index, color);
    this.leftLegMesh.setColorAt(index, color);
    this.rightLegMesh.setColorAt(index, color);

    if (this.torsoMesh.instanceColor) this.torsoMesh.instanceColor.needsUpdate = true;
    if (this.headMesh.instanceColor) this.headMesh.instanceColor.needsUpdate = true;
    if (this.leftArmMesh.instanceColor) this.leftArmMesh.instanceColor.needsUpdate = true;
    if (this.rightArmMesh.instanceColor) this.rightArmMesh.instanceColor.needsUpdate = true;
    if (this.leftLegMesh.instanceColor) this.leftLegMesh.instanceColor.needsUpdate = true;
    if (this.rightLegMesh.instanceColor) this.rightLegMesh.instanceColor.needsUpdate = true;
  }

  // --- Blood Particle FX Pool ---
  initBloodParticles() {
    this.maxBloodParticles = 60;
    const pGeo = new THREE.SphereGeometry(0.045, 4, 4);
    const pMat = new THREE.MeshBasicMaterial({ color: 0x990000 });
    this.bloodMesh = new THREE.InstancedMesh(pGeo, pMat, this.maxBloodParticles);
    this.bloodMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.bloodMesh);

    this.bloodParticles = [];
    for (let i = 0; i < this.maxBloodParticles; i++) {
      this.bloodParticles.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.6
      });
      this.dummy.position.set(0, -500, 0);
      this.dummy.updateMatrix();
      this.bloodMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.bloodMesh.instanceMatrix.needsUpdate = true;
  }

  spawnBloodBurst(pos, isHeadshot) {
    const count = isHeadshot ? 16 : 8;
    let spawned = 0;

    for (let i = 0; i < this.maxBloodParticles && spawned < count; i++) {
      const p = this.bloodParticles[i];
      if (!p.active) {
        p.active = true;
        p.pos.copy(pos);
        p.vel.set(
          (Math.random() - 0.5) * 4,
          Math.random() * 3 + (isHeadshot ? 3 : 1),
          (Math.random() - 0.5) * 4
        );
        p.life = 0;
        p.maxLife = 0.5 + Math.random() * 0.3;
        spawned++;
      }
    }
  }

  // --- Raycast Hit Detection ---
  checkRaycastHit(raycaster, rayOrigin) {
    let closestZombie = null;
    let minDistance = Infinity;
    let isHeadshot = false;
    let hitPoint = null;

    // Check against active zombies
    for (let i = 0; i < this.maxZombies; i++) {
      const z = this.zombies[i];
      if (!z.active || z.state === 'dead') continue;

      const zombieCenter = z.pos.clone().add(new THREE.Vector3(0, 0.9 * z.scale, 0));
      const boundingRadius = 0.65 * z.scale;

      // Sphere intersection test
      const ray = raycaster.ray;
      const toCenter = zombieCenter.clone().sub(ray.origin);
      const proj = toCenter.dot(ray.direction);

      if (proj > 0) {
        const perpDistSq = toCenter.lengthSq() - proj * proj;
        if (perpDistSq <= boundingRadius * boundingRadius) {
          const distToHit = proj - Math.sqrt(boundingRadius * boundingRadius - perpDistSq);
          if (distToHit < minDistance && distToHit > 0) {
            minDistance = distToHit;
            closestZombie = z;
            hitPoint = ray.origin.clone().addScaledVector(ray.direction, distToHit);

            // Headshot calculation: top 25% of zombie height
            const headThresholdY = z.pos.y + 1.25 * z.scale;
            isHeadshot = hitPoint.y >= headThresholdY;
          }
        }
      }
    }

    if (closestZombie) {
      return {
        zombieIndex: closestZombie.id,
        distance: minDistance,
        point: hitPoint,
        isHeadshot: isHeadshot
      };
    }
    return null;
  }

  // Apply Damage to Zombie
  damageZombie(index, amount, hitPoint, isHeadshot) {
    const z = this.zombies[index];
    if (!z || !z.active || z.state === 'dead') return null;

    z.health -= amount;
    z.hitFlashTimer = 0.08;
    this.setInstanceColor(index, new THREE.Color(0xffffff)); // Hit flash white

    // Spawn blood particles
    this.spawnBloodBurst(hitPoint || z.pos, isHeadshot);
    if (isHeadshot) this.sound.playHeadshot();
    else this.sound.playHitImpact();

    if (z.health <= 0) {
      this.killZombie(z, isHeadshot);
      return { killed: true, isHeadshot, type: z.type, score: isHeadshot ? 150 : 100 };
    }
    return { killed: false, isHeadshot, type: z.type, score: 20 };
  }

  killZombie(z, isHeadshot) {
    z.state = 'dead';
    z.deathTime = performance.now();
    this.sound.playZombieDeath();
  }

  // --- AI Steering & Horde Simulation Loop ---
  update(deltaTime, playerPos, playerBody, onPlayerAttacked) {
    const now = performance.now();

    for (let i = 0; i < this.maxZombies; i++) {
      const z = this.zombies[i];
      if (!z.active) continue;

      // Handle Death State (Ragdoll collapse + sink into ground)
      if (z.state === 'dead') {
        const elapsed = (now - z.deathTime) / 1000;
        z.deathRotX = Math.min(z.deathRotX + deltaTime * 4, Math.PI / 2);

        // After 2.5s, sink into floor
        if (elapsed > 2.5) {
          z.pos.y -= deltaTime * 0.4;
          if (elapsed > 4.5 || z.pos.y < -3) {
            z.active = false;
            this.hideInstance(i);
            continue;
          }
        }
        this.renderZombieInstance(z, true);
        continue;
      }

      // Hit Flash recovery
      if (z.hitFlashTimer > 0) {
        z.hitFlashTimer -= deltaTime;
        if (z.hitFlashTimer <= 0) {
          this.setInstanceColor(z.id, z.baseColor);
        }
      }

      // Vector to Player
      const toPlayer = playerPos.clone().sub(z.pos);
      toPlayer.y = 0;
      const distToPlayer = toPlayer.length();

      // Steering Behavior
      if (distToPlayer > 0.01) {
        const targetRotY = Math.atan2(toPlayer.x, toPlayer.z);
        // Smooth rotation
        let angleDiff = targetRotY - z.rotY;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        z.rotY += angleDiff * Math.min(deltaTime * 6, 1.0);
      }

      // Separation Force (Avoid clumping with nearby zombies)
      const separation = new THREE.Vector3();
      for (let j = 0; j < this.maxZombies; j++) {
        if (i === j) continue;
        const other = this.zombies[j];
        if (!other.active || other.state === 'dead') continue;

        const diff = z.pos.clone().sub(other.pos);
        diff.y = 0;
        const dist = diff.length();
        const minDist = (z.scale + other.scale) * 0.6;
        if (dist < minDist && dist > 0.001) {
          separation.addScaledVector(diff.normalize(), (minDist - dist) / minDist);
        }
      }

      // Attack Distance Check
      const attackRange = 1.6 * z.scale;
      if (distToPlayer <= attackRange) {
        z.state = 'attack';
        if (now - z.lastAttackTime > z.attackCooldown * 1000) {
          z.lastAttackTime = now;
          this.sound.playZombieAttack();
          if (onPlayerAttacked) {
            onPlayerAttacked(z.damage);
          }
        }
      } else {
        z.state = 'chase';
        // Move towards player + separation
        const moveDir = toPlayer.normalize().addScaledVector(separation, 1.4).normalize();
        z.pos.addScaledVector(moveDir, z.speed * deltaTime);

        // Clamp to map boundary
        const arenaRadius = 55;
        if (z.pos.length() > arenaRadius) {
          z.pos.setLength(arenaRadius);
        }
      }

      // Advance animation phase
      z.animPhase += deltaTime * (z.speed * 2.2);

      // Render updated matrices for this zombie
      this.renderZombieInstance(z, false);
    }

    this.updateInstanceMatrices();
    this.updateBloodParticles(deltaTime);
  }

  // Calculate & Set Sub-Mesh Transforms for a Single Zombie
  renderZombieInstance(z, isDead) {
    const idx = z.id;
    const s = z.scale;

    // Ground position
    const posX = z.pos.x;
    const posY = z.pos.y;
    const posZ = z.pos.z;
    const rotY = z.rotY;

    if (isDead) {
      // Dead ragdoll fallen backward on the floor
      this.dummy.position.set(posX, posY + 0.15 * s, posZ);
      this.dummy.rotation.set(z.deathRotX, rotY, 0);
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();

      this.headMesh.setMatrixAt(idx, this.dummy.matrix);
      this.torsoMesh.setMatrixAt(idx, this.dummy.matrix);
      this.leftArmMesh.setMatrixAt(idx, this.dummy.matrix);
      this.rightArmMesh.setMatrixAt(idx, this.dummy.matrix);
      this.leftLegMesh.setMatrixAt(idx, this.dummy.matrix);
      this.rightLegMesh.setMatrixAt(idx, this.dummy.matrix);
      return;
    }

    // Walking / Running Kinematics
    const legAngle = Math.sin(z.animPhase) * 0.65;
    const armAngle = Math.cos(z.animPhase) * 0.75;
    const isAttacking = z.state === 'attack';

    // 1. Torso
    this.dummy.position.set(posX, posY + 0.95 * s, posZ);
    this.dummy.rotation.set(0.12, rotY, 0); // slight forward hunch
    this.dummy.scale.set(s, s, s);
    this.dummy.updateMatrix();
    this.torsoMesh.setMatrixAt(idx, this.dummy.matrix);

    // 2. Head
    this.dummy.position.set(
      posX + Math.sin(rotY) * 0.08 * s,
      posY + 1.45 * s,
      posZ + Math.cos(rotY) * 0.08 * s
    );
    this.dummy.rotation.set(0.2, rotY + Math.sin(z.animPhase * 0.5) * 0.1, 0);
    this.dummy.scale.set(s, s, s);
    this.dummy.updateMatrix();
    this.headMesh.setMatrixAt(idx, this.dummy.matrix);

    // 3. Left Arm (shoulder offset)
    const armDist = 0.32 * s;
    const leftArmX = posX + Math.cos(rotY) * armDist;
    const leftArmZ = posZ - Math.sin(rotY) * armDist;
    this.dummy.position.set(leftArmX, posY + 1.15 * s, leftArmZ);
    this.dummy.rotation.set(isAttacking ? -1.2 : -0.6 + armAngle, rotY, 0.2);
    this.dummy.scale.set(s, s, s);
    this.dummy.updateMatrix();
    this.leftArmMesh.setMatrixAt(idx, this.dummy.matrix);

    // 4. Right Arm
    const rightArmX = posX - Math.cos(rotY) * armDist;
    const rightArmZ = posZ + Math.sin(rotY) * armDist;
    this.dummy.position.set(rightArmX, posY + 1.15 * s, rightArmZ);
    this.dummy.rotation.set(isAttacking ? -1.3 : -0.6 - armAngle, rotY, -0.2);
    this.dummy.scale.set(s, s, s);
    this.dummy.updateMatrix();
    this.rightArmMesh.setMatrixAt(idx, this.dummy.matrix);

    // 5. Left Leg
    const legDist = 0.14 * s;
    const leftLegX = posX + Math.cos(rotY) * legDist;
    const leftLegZ = posZ - Math.sin(rotY) * legDist;
    this.dummy.position.set(leftLegX, posY + 0.65 * s, leftLegZ);
    this.dummy.rotation.set(legAngle, rotY, 0);
    this.dummy.scale.set(s, s, s);
    this.dummy.updateMatrix();
    this.leftLegMesh.setMatrixAt(idx, this.dummy.matrix);

    // 6. Right Leg
    const rightLegX = posX - Math.cos(rotY) * legDist;
    const rightLegZ = posZ + Math.sin(rotY) * legDist;
    this.dummy.position.set(rightLegX, posY + 0.65 * s, rightLegZ);
    this.dummy.rotation.set(-legAngle, rotY, 0);
    this.dummy.scale.set(s, s, s);
    this.dummy.updateMatrix();
    this.rightLegMesh.setMatrixAt(idx, this.dummy.matrix);
  }

  updateInstanceMatrices() {
    this.headMesh.instanceMatrix.needsUpdate = true;
    this.torsoMesh.instanceMatrix.needsUpdate = true;
    this.leftArmMesh.instanceMatrix.needsUpdate = true;
    this.rightArmMesh.instanceMatrix.needsUpdate = true;
    this.leftLegMesh.instanceMatrix.needsUpdate = true;
    this.rightLegMesh.instanceMatrix.needsUpdate = true;
  }

  updateBloodParticles(deltaTime) {
    let activeParticles = 0;
    for (let i = 0; i < this.maxBloodParticles; i++) {
      const p = this.bloodParticles[i];
      if (!p.active) continue;

      p.life += deltaTime;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.dummy.position.set(0, -500, 0);
        this.dummy.updateMatrix();
        this.bloodMesh.setMatrixAt(i, this.dummy.matrix);
      } else {
        p.vel.y -= 14 * deltaTime; // Gravity
        p.pos.addScaledVector(p.vel, deltaTime);
        if (p.pos.y < 0.05) {
          p.pos.y = 0.05;
          p.vel.set(0, 0, 0);
        }
        const scale = (1 - p.life / p.maxLife);
        this.dummy.position.copy(p.pos);
        this.dummy.scale.set(scale, scale, scale);
        this.dummy.updateMatrix();
        this.bloodMesh.setMatrixAt(i, this.dummy.matrix);
        activeParticles++;
      }
    }
    if (activeParticles > 0) {
      this.bloodMesh.instanceMatrix.needsUpdate = true;
    }
  }

  getActiveCount() {
    return this.zombies.filter(z => z.active && z.state !== 'dead').length;
  }

  reset() {
    for (let i = 0; i < this.maxZombies; i++) {
      this.zombies[i].active = false;
      this.zombies[i].state = 'idle';
      this.hideInstance(i);
    }
    this.updateInstanceMatrices();
  }
}
