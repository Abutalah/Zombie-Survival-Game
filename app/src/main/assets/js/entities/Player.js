import * as THREE from '../../libs/three.module.js';
import * as CANNON from '../../libs/cannon-es.js';

/**
 * First-Person Player Controller
 * Integrates Cannon-es physics body with camera rig, WASD/Touch movement,
 * jump/crouch/sprint, stamina management, head bobbing, and health state.
 */
export class Player {
  constructor(camera, physicsWorld, soundEngine) {
    this.camera = camera;
    this.physics = physicsWorld;
    this.sound = soundEngine;

    // Player Stats
    this.maxHealth = 100;
    this.health = 100;
    this.maxStamina = 100;
    this.stamina = 100;
    this.isDead = false;

    // Movement Parameters
    this.walkSpeed = 6.2;
    this.sprintSpeed = 9.8;
    this.crouchSpeed = 3.2;
    this.jumpForce = 8.5;

    // State
    this.isSprinting = false;
    this.isCrouching = false;
    this.isGrounded = true;
    this.lastDamageTime = 0;

    // Camera Rig & Eye Offsets
    this.eyeHeightStanding = 1.68;
    this.eyeHeightCrouching = 1.05;
    this.currentEyeHeight = this.eyeHeightStanding;

    // Rotation Euler
    this.pitch = 0;
    this.yaw = 0;

    // Input States (Desktop & Touch unified)
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.touchMoveVector = new THREE.Vector2(0, 0); // Normalized from virtual joystick

    // Head Bobbing
    this.bobTimer = 0;
    this.bobAmount = 0.045;

    // Setup Cannon-es Physics Body (Sphere collider)
    this.body = this.physics.createPlayerBody(0, 1.8, 0, 0.65, 70);
  }

  // Camera Mouse Look Delta (from PointerLock or Touch Look Area)
  handleLook(deltaX, deltaY, sensitivity = 0.0022) {
    if (this.isDead) return;

    this.yaw -= deltaX * sensitivity;
    this.pitch -= deltaY * sensitivity;

    // Clamp vertical look angle (look up / down max 88 degrees)
    const maxPitch = Math.PI / 2 - 0.04;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

    this.updateCameraRotation();
  }

  updateCameraRotation() {
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
    this.camera.quaternion.copy(qYaw.multiply(qPitch));
  }

  jump() {
    if (this.isDead || !this.isGrounded) return;
    this.body.velocity.y = this.jumpForce;
    this.isGrounded = false;
  }

  setCrouch(crouch) {
    this.isCrouching = crouch;
  }

  setSprint(sprint) {
    this.isSprinting = sprint && !this.isCrouching && this.stamina > 10;
  }

  damage(amount) {
    if (this.isDead) return;

    this.health = Math.max(0, this.health - amount);
    this.lastDamageTime = performance.now();
    this.sound.playPlayerHurt();

    if (this.health <= 30) {
      this.sound.setHeartbeat(true);
    }

    if (this.health <= 0) {
      this.isDead = true;
      this.sound.setHeartbeat(false);
      // Fall down camera animation
      this.currentEyeHeight = 0.3;
    }
  }

  heal(amount) {
    if (this.isDead) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
    if (this.health > 30) {
      this.sound.setHeartbeat(false);
    }
  }

  update(deltaTime) {
    if (this.isDead) {
      // Smooth fall to ground when dead
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 0.3, 5 * deltaTime);
      return;
    }

    const pos = this.body.position;

    // Ground Check: Raycast or velocity Y check
    if (Math.abs(this.body.velocity.y) < 0.2) {
      this.isGrounded = true;
    }

    // Determine target speed
    let currentSpeed = this.walkSpeed;
    if (this.isCrouching) {
      currentSpeed = this.crouchSpeed;
    } else if (this.isSprinting && this.stamina > 0) {
      currentSpeed = this.sprintSpeed;
    }

    // Compute input movement vector in camera planar space
    let inputX = 0;
    let inputZ = 0;

    // Keyboard inputs
    if (this.moveForward) inputZ -= 1;
    if (this.moveBackward) inputZ += 1;
    if (this.moveLeft) inputX -= 1;
    if (this.moveRight) inputX += 1;

    // Add Touch virtual joystick input
    inputX += this.touchMoveVector.x;
    inputZ -= this.touchMoveVector.y; // forward is negative Z in camera space

    const inputLen = Math.sqrt(inputX * inputX + inputZ * inputZ);
    const isMoving = inputLen > 0.05;

    // Stamina drain and recovery
    if (this.isSprinting && isMoving) {
      this.stamina = Math.max(0, this.stamina - deltaTime * 22);
      if (this.stamina <= 0) {
        this.isSprinting = false;
      }
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + deltaTime * 16);
    }

    // Passive slow health regen after 6s of no damage
    const now = performance.now();
    if (now - this.lastDamageTime > 6000 && this.health < 60) {
      this.heal(deltaTime * 4);
    }

    // Apply movement velocity in horizontal plane
    if (isMoving) {
      const normX = inputX / (inputLen > 1 ? inputLen : 1);
      const normZ = inputZ / (inputLen > 1 ? inputLen : 1);

      // Rotate planar vector by player yaw
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);

      const worldVx = (normX * cosYaw + normZ * sinYaw) * currentSpeed;
      const worldVz = (-normX * sinYaw + normZ * cosYaw) * currentSpeed;

      this.body.velocity.x = worldVx;
      this.body.velocity.z = worldVz;

      // Head Bobbing
      this.bobTimer += deltaTime * (this.isSprinting ? 15 : 10);
    } else {
      // Damped stop
      this.body.velocity.x *= 0.6;
      this.body.velocity.z *= 0.6;
      this.bobTimer = 0;
    }

    // Smooth crouch eye height transition
    const targetEyeHeight = this.isCrouching ? this.eyeHeightCrouching : this.eyeHeightStanding;
    this.currentEyeHeight = THREE.MathUtils.lerp(this.currentEyeHeight, targetEyeHeight, 14 * deltaTime);

    // Calculate Head Bob offset
    let bobY = 0;
    let bobX = 0;
    if (isMoving && this.isGrounded) {
      bobY = Math.sin(this.bobTimer) * (this.bobAmount * (this.isSprinting ? 1.4 : 1.0));
      bobX = Math.cos(this.bobTimer * 0.5) * (this.bobAmount * 0.5);
    }

    // Synchronize Three.js Camera position with Cannon-es Body
    this.camera.position.set(
      pos.x + bobX,
      pos.y + this.currentEyeHeight - 0.65 + bobY,
      pos.z
    );

    // Arena boundary clamp to prevent flying outside map
    const arenaLimit = 54;
    if (Math.abs(pos.x) > arenaLimit) {
      pos.x = Math.sign(pos.x) * arenaLimit;
      this.body.velocity.x = 0;
    }
    if (Math.abs(pos.z) > arenaLimit) {
      pos.z = Math.sign(pos.z) * arenaLimit;
      this.body.velocity.z = 0;
    }
  }

  getPosition() {
    return this.camera.position;
  }

  reset() {
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.isDead = false;
    this.isSprinting = false;
    this.isCrouching = false;
    this.pitch = 0;
    this.yaw = 0;
    this.body.position.set(0, 1.8, 0);
    this.body.velocity.set(0, 0, 0);
    this.sound.setHeartbeat(false);
    this.updateCameraRotation();
  }
}
