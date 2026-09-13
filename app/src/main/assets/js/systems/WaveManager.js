/**
 * Wave Progression & Spawning Manager
 * Handles wave scaling, timed intermission, zombie composition (walkers, runners, tanks),
 * and supply crate rewards.
 */
export class WaveManager {
  constructor(zombieHorde, environment, soundEngine, onWaveEvent) {
    this.horde = zombieHorde;
    this.environment = environment;
    this.sound = soundEngine;
    this.onWaveEvent = onWaveEvent;

    this.currentWave = 1;
    this.state = 'intermission'; // 'spawning', 'active', 'intermission'
    this.intermissionTimer = 3.5; // seconds before wave 1 starts

    this.zombiesToSpawn = [];
    this.spawnInterval = 0.55; // seconds between individual spawns
    this.lastSpawnTime = 0;

    this.totalZombiesInWave = 0;
    this.killedInWave = 0;
  }

  startFirstWave() {
    this.prepareWave(1);
  }

  prepareWave(waveNumber) {
    this.currentWave = waveNumber;
    this.state = 'intermission';
    this.intermissionTimer = 4.0;
    this.killedInWave = 0;

    // Calculate composition for this wave
    let walkersCount = 10 + waveNumber * 4;
    let runnersCount = Math.max(0, (waveNumber - 1) * 3);
    let tanksCount = waveNumber >= 3 ? Math.floor((waveNumber - 1) / 2) : 0;

    this.zombiesToSpawn = [];
    for (let i = 0; i < walkersCount; i++) this.zombiesToSpawn.push('walker');
    for (let i = 0; i < runnersCount; i++) this.zombiesToSpawn.push('runner');
    for (let i = 0; i < tanksCount; i++) this.zombiesToSpawn.push('tank');

    // Shuffle spawns so types mix naturally
    for (let i = this.zombiesToSpawn.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.zombiesToSpawn[i], this.zombiesToSpawn[j]] = [this.zombiesToSpawn[j], this.zombiesToSpawn[i]];
    }

    this.totalZombiesInWave = this.zombiesToSpawn.length;

    if (this.onWaveEvent) {
      this.onWaveEvent({
        type: 'wave_prepare',
        wave: this.currentWave,
        totalZombies: this.totalZombiesInWave,
        intermissionSeconds: Math.ceil(this.intermissionTimer)
      });
    }
  }

  launchWave() {
    this.state = 'spawning';
    this.sound.playWaveStart();

    if (this.onWaveEvent) {
      this.onWaveEvent({
        type: 'wave_start',
        wave: this.currentWave,
        totalZombies: this.totalZombiesInWave
      });
    }
  }

  update(deltaTime, playerPos) {
    const now = performance.now();

    // 1. Intermission Countdown
    if (this.state === 'intermission') {
      this.intermissionTimer -= deltaTime;
      if (this.onWaveEvent) {
        this.onWaveEvent({
          type: 'intermission_tick',
          secondsLeft: Math.max(0, Math.ceil(this.intermissionTimer))
        });
      }

      if (this.intermissionTimer <= 0) {
        this.launchWave();
      }
      return;
    }

    // 2. Spawning Zombies from Queue
    if (this.state === 'spawning') {
      if (this.zombiesToSpawn.length > 0) {
        if (now - this.lastSpawnTime >= this.spawnInterval * 1000) {
          this.lastSpawnTime = now;
          const type = this.zombiesToSpawn.pop();

          // Spawn at random perimeter circle away from player
          const angle = Math.random() * Math.PI * 2;
          const spawnDist = 42 + Math.random() * 8;
          const spawnX = Math.cos(angle) * spawnDist;
          const spawnZ = Math.sin(angle) * spawnDist;

          this.horde.spawnZombie(spawnX, spawnZ, type);
        }
      } else {
        this.state = 'active';
      }
    }

    // 3. Active Wave: Check if all zombies are defeated
    if (this.state === 'active') {
      const activeCount = this.horde.getActiveCount();
      if (activeCount === 0 && this.zombiesToSpawn.length === 0) {
        this.completeWave();
      }
    }
  }

  completeWave() {
    this.sound.playWaveClear();

    // Spawn Supply Drops (Ammo and Medkit) near center or player
    const ammoX = (Math.random() - 0.5) * 20;
    const ammoZ = (Math.random() - 0.5) * 20;
    this.environment.spawnPickup(ammoX, ammoZ, 'ammo');

    if (this.currentWave >= 2) {
      const medX = (Math.random() - 0.5) * 24;
      const medZ = (Math.random() - 0.5) * 24;
      this.environment.spawnPickup(medX, medZ, 'medkit');
    }

    if (this.onWaveEvent) {
      this.onWaveEvent({
        type: 'wave_cleared',
        wave: this.currentWave
      });
    }

    // Prepare next wave after brief pause
    setTimeout(() => {
      this.prepareWave(this.currentWave + 1);
    }, 2000);
  }

  onZombieKilled() {
    this.killedInWave++;
  }

  reset() {
    this.currentWave = 1;
    this.prepareWave(1);
  }
}
