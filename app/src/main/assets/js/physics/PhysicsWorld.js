import * as CANNON from '../../libs/cannon-es.js';

/**
 * Cannon-es Physics World Wrapper
 * Implements a fixed-timestep accumulator pattern (1/60s) decoupled from render frames.
 */
export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -22, 0);

    // Broadphase optimization for fast collision detection
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.defaultContactMaterial.friction = 0.2;
    this.world.defaultContactMaterial.restitution = 0.1;

    // Contact materials
    this.groundMaterial = new CANNON.Material('ground');
    this.playerMaterial = new CANNON.Material('player');
    this.obstacleMaterial = new CANNON.Material('obstacle');

    const playerGroundContact = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.groundMaterial,
      {
        friction: 0.0, // Prevent sticky friction when running against floor
        restitution: 0.0
      }
    );
    this.world.addContactMaterial(playerGroundContact);

    const playerObstacleContact = new CANNON.ContactMaterial(
      this.playerMaterial,
      this.obstacleMaterial,
      {
        friction: 0.0, // Smooth sliding along walls
        restitution: 0.0
      }
    );
    this.world.addContactMaterial(playerObstacleContact);

    // Accumulator for fixed physics stepping
    this.fixedTimeStep = 1 / 60;
    this.maxSubSteps = 5;
    this.timeAccumulator = 0;

    // References to dynamic bodies for lifecycle management
    this.bodies = [];
  }

  step(deltaTime) {
    // Guard against excessive delta spikes when switching tabs
    const clampedDelta = Math.min(deltaTime, 0.1);
    this.world.step(this.fixedTimeStep, clampedDelta, this.maxSubSteps);
  }

  // Create Ground Plane Collider
  createGround(size = 120) {
    const groundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: this.groundMaterial
    });
    // Rotate plane to be horizontal facing +Y
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    groundBody.position.set(0, 0, 0);
    this.world.addBody(groundBody);
    this.bodies.push(groundBody);
    return groundBody;
  }

  // Create Static Box Obstacle
  createBox(x, y, z, width, height, depth) {
    const halfExtents = new CANNON.Vec3(width / 2, height / 2, depth / 2);
    const boxShape = new CANNON.Box(halfExtents);
    const boxBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: boxShape,
      position: new CANNON.Vec3(x, y, z),
      material: this.obstacleMaterial
    });
    this.world.addBody(boxBody);
    this.bodies.push(boxBody);
    return boxBody;
  }

  // Create Dynamic Barrel/Crate with physics response
  createDynamicBox(x, y, z, width, height, depth, mass = 15) {
    const halfExtents = new CANNON.Vec3(width / 2, height / 2, depth / 2);
    const boxShape = new CANNON.Box(halfExtents);
    const boxBody = new CANNON.Body({
      mass: mass,
      shape: boxShape,
      position: new CANNON.Vec3(x, y, z),
      material: this.obstacleMaterial,
      linearDamping: 0.4,
      angularDamping: 0.5
    });
    this.world.addBody(boxBody);
    this.bodies.push(boxBody);
    return boxBody;
  }

  // Create Player Capsule Proxy (Sphere collider with bottom ground probe)
  createPlayerBody(x = 0, y = 1.8, z = 0, radius = 0.6, mass = 75) {
    const sphereShape = new CANNON.Sphere(radius);
    const playerBody = new CANNON.Body({
      mass: mass,
      shape: sphereShape,
      position: new CANNON.Vec3(x, y, z),
      material: this.playerMaterial,
      fixedRotation: true, // Do not roll like a ball
      linearDamping: 0.05
    });
    this.world.addBody(playerBody);
    this.bodies.push(playerBody);
    return playerBody;
  }

  removeBody(body) {
    if (!body) return;
    this.world.removeBody(body);
    const idx = this.bodies.indexOf(body);
    if (idx !== -1) this.bodies.splice(idx, 1);
  }

  reset() {
    // Remove all managed bodies
    while (this.bodies.length > 0) {
      const b = this.bodies.pop();
      this.world.removeBody(b);
    }
  }
}
