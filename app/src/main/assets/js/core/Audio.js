/**
 * Web Audio API Sound Synthesizer
 * Zero external asset dependencies — eliminates 404s and network latency.
 */
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.enabled = true;
    this.heartbeatTimer = null;
    this.isHeartbeatPlaying = false;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.9, this.ctx.currentTime);

      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('Web Audio not supported or blocked:', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Pistol Gunshot
  playPistol() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Noise burst
    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.03));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // Bandpass filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, t);
    filter.Q.setValueAtTime(1.5, t);

    // Punch oscillator
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(1.0, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1.0, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    osc.connect(oscGain);
    oscGain.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(t);
    osc.start(t);
    noise.stop(t + 0.15);
    osc.stop(t + 0.12);
  }

  // Shotgun blast
  playShotgun() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Deep sub bass boom
    const boom = this.ctx.createOscillator();
    boom.type = 'sawtooth';
    boom.frequency.setValueAtTime(180, t);
    boom.frequency.exponentialRampToValueAtTime(25, t + 0.35);

    const boomGain = this.ctx.createGain();
    boomGain.gain.setValueAtTime(1.4, t);
    boomGain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

    // Heavy noisy roar
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.08));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, t);
    filter.frequency.linearRampToValueAtTime(400, t + 0.3);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);

    boom.connect(boomGain);
    boomGain.connect(gain);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    boom.start(t);
    noise.start(t);
    boom.stop(t + 0.35);
    noise.stop(t + 0.4);

    // Mechanical pump action clack after 0.4s
    setTimeout(() => this.playReloadClick(1.2), 350);
  }

  // Rifle Gunshot
  playRifle() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);

    const bufferSize = this.ctx.sampleRate * 0.12;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.025));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2200, t);
    filter.Q.setValueAtTime(2.0, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.95, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

    osc.connect(gain);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    noise.start(t);
    osc.stop(t + 0.08);
    noise.stop(t + 0.1);
  }

  // Reload click-clack
  playReloadClick(pitchMult = 1.0) {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(700 * pitchMult, t);
    osc.frequency.exponentialRampToValueAtTime(300 * pitchMult, t + 0.06);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  playDryFire() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.04);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  // Zombie Groan / Growl
  playZombieGroan(pitch = 1.0) {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    const baseFreq = 85 * pitch;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.3, t + 0.25);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, t + 0.6);

    // LFO frequency modulation for eerie vocal gargle
    const lfo = this.ctx.createOscillator();
    lfo.frequency.setValueAtTime(14, t);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(30, t);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.4, t + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.65);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    lfo.start(t);
    osc.start(t);
    lfo.stop(t + 0.65);
    osc.stop(t + 0.65);
  }

  // Zombie Attack / Claw Swipe
  playZombieAttack() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.15);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  // Bullet hit on zombie (fleshy impact)
  playHitImpact() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.08);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.08);
  }

  // Headshot Critical Hit
  playHeadshot() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    // High crunch / ding sound
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.18);
  }

  // Zombie Death Screech
  playZombieDeath() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.4);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.4);
  }

  // Barrel Explosion
  playExplosion() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    // Sub rumble
    const sub = this.ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(120, t);
    sub.frequency.exponentialRampToValueAtTime(20, t + 0.8);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(1.8, t);
    subGain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);

    // Blast noise
    const bufferSize = this.ctx.sampleRate * 0.9;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.18));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.linearRampToValueAtTime(150, t + 0.8);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1.6, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.9);

    sub.connect(subGain);
    subGain.connect(gain);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    sub.start(t);
    noise.start(t);
    sub.stop(t + 0.8);
    noise.stop(t + 0.9);
  }

  // Player Damage Grunt
  playPlayerHurt() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.18);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  // Wave Alert Horn
  playWaveStart() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(146.8, t); // D3
    osc.frequency.setValueAtTime(220, t + 0.25); // A3

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.7);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.7);
  }

  // Wave Clear Chime
  playWaveClear() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const notes = [440, 554, 659, 880];
    notes.forEach((freq, idx) => {
      const t = this.ctx.currentTime + idx * 0.1;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.35);
    });
  }

  // Pickup item (Ammo / Health)
  playPickup() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.3, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.14);
  }

  // Low health heartbeat
  setHeartbeat(active) {
    if (active && !this.isHeartbeatPlaying) {
      this.isHeartbeatPlaying = true;
      this.heartbeatTimer = setInterval(() => {
        if (!this.ctx || !this.enabled) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(65, t);
        osc.frequency.exponentialRampToValueAtTime(35, t + 0.15);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.16);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.16);
      }, 700);
    } else if (!active && this.isHeartbeatPlaying) {
      this.isHeartbeatPlaying = false;
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
