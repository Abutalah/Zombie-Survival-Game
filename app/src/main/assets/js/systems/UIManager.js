/**
 * UI & HUD Manager:
 * Handles HUD stats, 2D radar minimap, dynamic crosshair, hitmarkers,
 * damage popups, touch controls (virtual joystick & buttons), and screens.
 */
export class UIManager {
  constructor(player, weapons, soundEngine, onStartGame, onRestartGame) {
    this.player = player;
    this.weapons = weapons;
    this.sound = soundEngine;
    this.onStartGame = onStartGame;
    this.onRestartGame = onRestartGame;

    // DOM Elements
    this.healthBar = document.getElementById('health-bar-fill');
    this.healthVal = document.getElementById('health-val');
    this.staminaBar = document.getElementById('stamina-bar-fill');
    this.ammoCurrent = document.getElementById('ammo-current');
    this.ammoReserve = document.getElementById('ammo-reserve');
    this.ammoReloading = document.getElementById('ammo-reloading');
    this.waveNumber = document.getElementById('wave-number');
    this.zombiesCount = document.getElementById('zombies-count-val');
    this.scoreVal = document.getElementById('score-val');
    this.crosshair = document.getElementById('crosshair');
    this.hitmarker = document.getElementById('hitmarker');
    this.vignette = document.getElementById('damage-vignette');
    this.damageContainer = document.getElementById('damage-numbers-container');
    this.waveBanner = document.getElementById('wave-banner');
    this.waveBannerTitle = document.getElementById('wave-banner-title');
    this.waveBannerSubtitle = document.getElementById('wave-banner-subtitle');

    // Screens
    this.startScreen = document.getElementById('start-screen');
    this.pauseScreen = document.getElementById('pause-screen');
    this.gameOverScreen = document.getElementById('game-over-screen');

    // Minimap Canvas
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;

    // Weapon Cards
    this.weaponCards = [
      document.getElementById('weapon-card-0'),
      document.getElementById('weapon-card-1'),
      document.getElementById('weapon-card-2')
    ];

    // Stats
    this.score = 0;
    this.kills = 0;
    this.headshots = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.startTime = performance.now();

    this.initEventListeners();
    this.initTouchControls();
  }

  initEventListeners() {
    // Start / Restart Buttons
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.startScreen.classList.add('hidden');
        if (this.onStartGame) this.onStartGame();
      });
    }

    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        this.gameOverScreen.classList.add('hidden');
        if (this.onRestartGame) this.onRestartGame();
      });
    }

    const resumeBtn = document.getElementById('resume-btn');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        this.pauseScreen.classList.add('hidden');
        if (this.onResumeGame) this.onResumeGame();
      });
    }

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        this.showPauseScreen();
      });
    }

    // Weapon Selector Cards
    this.weaponCards.forEach((card, idx) => {
      if (card) {
        card.addEventListener('click', () => {
          this.weapons.switchWeapon(idx);
          this.updateWeaponCards();
        });
      }
    });
  }

  // --- Mobile Touch Controls ---
  initTouchControls() {
    const joystickArea = document.getElementById('joystick-area');
    const joystickKnob = document.getElementById('joystick-knob');
    const lookArea = document.getElementById('touch-look-area');

    if (!joystickArea || !lookArea) return;

    // Virtual Joystick Tracking
    let joystickTouchId = null;
    let joystickCenter = { x: 0, y: 0 };
    const maxRadius = 45;

    joystickArea.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      joystickTouchId = touch.identifier;
      const rect = joystickArea.getBoundingClientRect();
      joystickCenter = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      this.updateJoystick(touch.clientX, touch.clientY, maxRadius, joystickKnob);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickTouchId) {
          e.preventDefault();
          this.updateJoystick(touch.clientX, touch.clientY, maxRadius, joystickKnob);
        }
      }
    }, { passive: false });

    const endJoystick = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystickTouchId) {
          joystickTouchId = null;
          joystickKnob.style.transform = 'translate(-50%, -50%)';
          this.player.touchMoveVector.set(0, 0);
        }
      }
    };
    window.addEventListener('touchend', endJoystick);
    window.addEventListener('touchcancel', endJoystick);

    // Touch Look Area Tracking
    let lookTouchId = null;
    let lastLookX = 0;
    let lastLookY = 0;

    lookArea.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      lookTouchId = touch.identifier;
      lastLookX = touch.clientX;
      lastLookY = touch.clientY;
    }, { passive: false });

    lookArea.addEventListener('touchmove', (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === lookTouchId) {
          e.preventDefault();
          const deltaX = touch.clientX - lastLookX;
          const deltaY = touch.clientY - lastLookY;
          lastLookX = touch.clientX;
          lastLookY = touch.clientY;
          this.player.handleLook(deltaX, deltaY, 0.0035);
        }
      }
    }, { passive: false });

    const endLook = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookTouchId) {
          lookTouchId = null;
        }
      }
    };
    lookArea.addEventListener('touchend', endLook);
    lookArea.addEventListener('touchcancel', endLook);

    // Action Buttons
    const fireBtn = document.getElementById('touch-fire-btn');
    if (fireBtn) {
      fireBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.weapons.isFiring = true;
        this.weapons.releaseTrigger();
        if (this.onFire) this.onFire();
      }, { passive: false });
      fireBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.weapons.isFiring = false;
        this.weapons.releaseTrigger();
      });
    }

    const adsBtn = document.getElementById('touch-ads-btn');
    if (adsBtn) {
      adsBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.weapons.isADS = !this.weapons.isADS;
        adsBtn.style.borderColor = this.weapons.isADS ? '#ffa502' : 'rgba(255,255,255,0.3)';
      }, { passive: false });
    }

    const reloadBtn = document.getElementById('touch-reload-btn');
    if (reloadBtn) {
      reloadBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.weapons.startReload();
      }, { passive: false });
    }

    const jumpBtn = document.getElementById('touch-jump-btn');
    if (jumpBtn) {
      jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.player.jump();
      }, { passive: false });
    }

    const crouchBtn = document.getElementById('touch-crouch-btn');
    if (crouchBtn) {
      crouchBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.player.setCrouch(!this.player.isCrouching);
        crouchBtn.style.borderColor = this.player.isCrouching ? '#ffa502' : 'rgba(255,255,255,0.3)';
      }, { passive: false });
    }
  }

  updateJoystick(clientX, clientY, maxRadius, knob) {
    const rect = document.getElementById('joystick-area').getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    // Normalize -1 to 1 for movement
    const normX = dx / maxRadius;
    const normY = -dy / maxRadius; // invert Y so up is positive forward
    this.player.touchMoveVector.set(normX, normY);
  }

  // --- Screen Controls ---
  showPauseScreen() {
    this.pauseScreen.classList.remove('hidden');
    if (this.onPauseGame) this.onPauseGame();
  }

  showGameOverScreen() {
    this.gameOverScreen.classList.remove('hidden');
    document.getElementById('stat-waves').innerText = this.waveNumber.innerText;
    document.getElementById('stat-kills').innerText = this.kills;
    document.getElementById('stat-headshots').innerText = this.headshots;
    document.getElementById('stat-score').innerText = this.score;

    const acc = this.shotsFired > 0 ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0;
    document.getElementById('stat-accuracy').innerText = `${acc}%`;

    const survivalSeconds = Math.round((performance.now() - this.startTime) / 1000);
    const mins = Math.floor(survivalSeconds / 60);
    const secs = survivalSeconds % 60;
    document.getElementById('stat-time').innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // --- HUD Feedback ---
  showHitmarker(isHeadshot) {
    if (!this.hitmarker) return;
    this.hitmarker.className = isHeadshot ? 'active crit' : 'active';
    setTimeout(() => {
      this.hitmarker.className = '';
    }, 120);
  }

  showDamageNumber(x, y, damage, isCrit) {
    if (!this.damageContainer) return;
    const el = document.createElement('div');
    el.className = isCrit ? 'damage-number crit' : 'damage-number';
    el.innerText = isCrit ? `+${damage} CRIT!` : `+${damage}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.damageContainer.appendChild(el);
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 800);
  }

  flashDamageVignette(critical) {
    if (!this.vignette) return;
    this.vignette.classList.add('hit');
    if (critical) this.vignette.classList.add('critical');
    setTimeout(() => {
      this.vignette.classList.remove('hit');
      if (!critical) this.vignette.classList.remove('critical');
    }, 200);
  }

  showWaveBanner(title, subtitle, duration = 3000) {
    if (!this.waveBanner) return;
    this.waveBannerTitle.innerText = title;
    this.waveBannerSubtitle.innerText = subtitle;
    this.waveBanner.classList.add('show');
    setTimeout(() => {
      this.waveBanner.classList.remove('show');
    }, duration);
  }

  // --- Frame Update ---
  update(zombieHorde, environment) {
    // 1. Health Bar
    const hpPct = Math.max(0, (this.player.health / this.player.maxHealth) * 100);
    this.healthBar.style.width = `${hpPct}%`;
    this.healthVal.innerText = `${Math.ceil(this.player.health)} HP`;

    if (this.player.health <= 30) {
      this.vignette.classList.add('critical');
    } else {
      this.vignette.classList.remove('critical');
    }

    // 2. Stamina Bar
    const stamPct = Math.max(0, (this.player.stamina / this.player.maxStamina) * 100);
    this.staminaBar.style.width = `${stamPct}%`;

    // 3. Ammo Display
    const w = this.weapons.currentWeapon;
    if (this.weapons.isReloading) {
      this.ammoCurrent.innerText = '--';
      this.ammoReloading.classList.remove('hidden');
    } else {
      this.ammoCurrent.innerText = w.currentClip;
      this.ammoReloading.classList.add('hidden');
    }
    this.ammoReserve.innerText = w.currentReserve;

    // 4. Crosshair State
    if (this.weapons.isADS) {
      this.crosshair.classList.add('ads');
    } else {
      this.crosshair.classList.remove('ads');
    }

    // 5. Weapon Cards
    this.updateWeaponCards();

    // 6. Active Zombie Count & Score
    if (zombieHorde) {
      this.zombiesCount.innerText = zombieHorde.getActiveCount();
    }
    this.scoreVal.innerText = this.score;

    // 7. Radar / Minimap
    this.renderMinimap(zombieHorde, environment);
  }

  updateWeaponCards() {
    this.weaponCards.forEach((card, idx) => {
      if (card) {
        if (idx === this.weapons.currentIndex) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      }
    });
  }

  // --- 2D Top-Down Radar Minimap ---
  renderMinimap(zombieHorde, environment) {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 0.9; // arena radius 60 maps to ~54px

    ctx.clearRect(0, 0, w, h);

    // Background circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#0a101d';
    ctx.fillRect(0, 0, w, h);

    // Radar concentric rings
    ctx.strokeStyle = 'rgba(0, 255, 150, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.arc(cx, cy, 40, 0, Math.PI * 2);
    ctx.stroke();

    const pPos = this.player.camera.position;
    const pYaw = this.player.yaw;

    // Render Explosive Barrels (Yellow dots)
    if (environment && environment.barrels) {
      ctx.fillStyle = '#ffa502';
      environment.barrels.forEach(b => {
        if (b.exploded) return;
        const rx = cx + (b.pos.x - pPos.x) * scale;
        const ry = cy + (b.pos.z - pPos.z) * scale;
        ctx.beginPath();
        ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Render Zombies (Red dots)
    if (zombieHorde && zombieHorde.zombies) {
      ctx.fillStyle = '#ff4757';
      zombieHorde.zombies.forEach(z => {
        if (!z.active || z.state === 'dead') return;
        const rx = cx + (z.pos.x - pPos.x) * scale;
        const ry = cy + (z.pos.z - pPos.z) * scale;

        // Clip to minimap circular boundary
        const dx = rx - cx;
        const dy = ry - cy;
        if (dx * dx + dy * dy < (cx - 4) * (cx - 4)) {
          ctx.beginPath();
          ctx.arc(rx, ry, z.type === 'tank' ? 3.8 : 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // Render Player Center Triangle (pointing along yaw)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(pYaw);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();

    // Player FOV vision cone
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 42, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  reset() {
    this.score = 0;
    this.kills = 0;
    this.headshots = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.startTime = performance.now();
    this.startScreen.classList.add('hidden');
    this.pauseScreen.classList.add('hidden');
    this.gameOverScreen.classList.add('hidden');
  }
}
