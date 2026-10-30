(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const FIXED_STEP = 1 / 120;
  const GRAVITY = 1750;
  const START_X = 240;
  const PIXELS_PER_METER = 26;
  const SAVE_KEY = 'hcr3.save.v1';

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const normalizeAngle = (a) => {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  };
  const wrap = (v, min, max) => {
    const range = max - min;
    return ((v - min) % range + range) % range + min;
  };
  const hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  };

  const VEHICLES = [
    {
      id: 'jeep',
      name: 'Hill Jeep',
      tag: 'BALANCED',
      price: 0,
      desc: 'The trusty all-rounder. Plenty of grip, a friendly power band, and a suspension that forgives big ideas.',
      color: '#f5b62f',
      color2: '#e57a1e',
      trim: '#263842',
      rim: '#dbe5ea',
      seat: '#4a2d1b',
      bodyW: 122,
      bodyH: 39,
      wheelBase: 96,
      wheelR: 25,
      wheelOffY: 20,
      engine: 690,
      brake: 620,
      maxSpeed: 710,
      airTorque: 10.5,
      grip: 1,
      style: 'jeep',
      stats: { speed: 3, power: 3, grip: 4 }
    },
    {
      id: 'monster',
      name: 'Monster Truck',
      tag: 'HEAVY HITTER',
      price: 650,
      desc: 'Huge tires, huge torque, huge appetite for crests. The monster shrugs off rough landings that would stop a jeep.',
      color: '#ee5143',
      color2: '#ad252b',
      trim: '#262d35',
      rim: '#e7edf1',
      seat: '#3d2420',
      bodyW: 134,
      bodyH: 45,
      wheelBase: 112,
      wheelR: 34,
      wheelOffY: 27,
      engine: 835,
      brake: 690,
      maxSpeed: 660,
      airTorque: 9.5,
      grip: 1.14,
      style: 'monster',
      stats: { speed: 2, power: 5, grip: 4 }
    },
    {
      id: 'buggy',
      name: 'Dune Buggy',
      tag: 'LIGHT & QUICK',
      price: 1400,
      desc: 'A featherweight frame with a rev-happy motor. Less grip, more air, and a serious talent for backflips.',
      color: '#35c7d8',
      color2: '#157a9a',
      trim: '#21343d',
      rim: '#eef4f6',
      seat: '#32201a',
      bodyW: 118,
      bodyH: 35,
      wheelBase: 104,
      wheelR: 22,
      wheelOffY: 18,
      engine: 780,
      brake: 560,
      maxSpeed: 800,
      airTorque: 12,
      grip: 0.9,
      style: 'buggy',
      stats: { speed: 5, power: 4, grip: 2 }
    }
  ];

  const DEFAULT_SAVE = {
    coins: 0,
    best: 0,
    unlocked: ['jeep'],
    selected: 'jeep',
    tilt: false,
    sound: true,
    runs: 0
  };

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { ...DEFAULT_SAVE, unlocked: [...DEFAULT_SAVE.unlocked] };
      const parsed = JSON.parse(raw);
      const unlocked = Array.isArray(parsed.unlocked)
        ? parsed.unlocked.filter((id) => VEHICLES.some((v) => v.id === id))
        : ['jeep'];
      if (!unlocked.includes('jeep')) unlocked.unshift('jeep');
      return {
        coins: Number.isFinite(parsed.coins) ? Math.max(0, Math.floor(parsed.coins)) : 0,
        best: Number.isFinite(parsed.best) ? Math.max(0, Math.floor(parsed.best)) : 0,
        unlocked,
        selected: unlocked.includes(parsed.selected) ? parsed.selected : 'jeep',
        tilt: Boolean(parsed.tilt),
        sound: parsed.sound !== false,
        runs: Number.isFinite(parsed.runs) ? parsed.runs : 0
      };
    } catch {
      return { ...DEFAULT_SAVE, unlocked: [...DEFAULT_SAVE.unlocked] };
    }
  }

  function persistSave(save) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      /* storage can be unavailable in private contexts */
    }
  }

  function terrainHeight(x) {
    if (x < 250) return 420;
    const t = x - 250;
    const ramp = smoothstep(0, 620, t);
    const big = smoothstep(2600, 7600, x);
    const hills =
      50 * Math.sin(t * 0.00155 + 0.18) +
      25 * Math.sin(t * 0.00375 + 1.72) +
      10.5 * Math.sin(t * 0.0082 + 3.14) +
      4.2 * Math.sin(t * 0.019 + 0.44) +
      16 * Math.sin(t * 0.0115 + 0.9) +
      7.5 * Math.sin(t * 0.025 + 2.7) +
      5 * Math.sin(t * 0.047 + 1.2) +
      big * (34 * Math.sin(x * 0.00092 + 2.1) + 15 * Math.sin(x * 0.0026 + 0.8));
    return 420 + ramp * hills;
  }

  function terrainSlope(x) {
    return (terrainHeight(x + 2) - terrainHeight(x - 2)) / 4;
  }

  function localToWorld(car, lx, ly) {
    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);
    return {
      x: car.x + lx * c - ly * s,
      y: car.y + lx * s + ly * c
    };
  }

  function vehicleById(id) {
    return VEHICLES.find((v) => v.id === id) || VEHICLES[0];
  }

  function makeCar(spec, x) {
    const ground = terrainHeight(x);
    const ride = spec.wheelOffY + spec.wheelR;
    const angle = Math.atan(terrainSlope(x));
    return {
      x,
      y: ground - ride,
      vx: 0,
      vy: 0,
      angle,
      omega: 0,
      prevAngle: angle,
      wheelAngle: 0,
      grounded: true,
      airTime: 0,
      airSpin: 0,
      lastSlope: angle,
      lastLaunch: -10,
      spec
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  class SoundEngine {
    constructor(enabled) {
      this.enabled = enabled;
      this.ctx = null;
      this.master = null;
      this.engine = null;
      this.engineGain = null;
      this.engineFilter = null;
      this.engineOsc2 = null;
      this.engineGain2 = null;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.68 : 0;
        this.master.connect(this.ctx.destination);
        this.buildEngine();
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      } catch {
        this.ctx = null;
      }
    }

    buildEngine() {
      if (!this.ctx || this.engine) return;
      const ctx = this.ctx;
      this.engine = ctx.createOscillator();
      this.engine.type = 'sawtooth';
      this.engine.frequency.value = 48;
      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 180;
      this.engineFilter.Q.value = 3.5;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engine.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engine.start();

      this.engineOsc2 = ctx.createOscillator();
      this.engineOsc2.type = 'triangle';
      this.engineOsc2.frequency.value = 72;
      this.engineGain2 = ctx.createGain();
      this.engineGain2.gain.value = 0;
      this.engineOsc2.connect(this.engineGain2);
      this.engineGain2.connect(this.master);
      this.engineOsc2.start();
    }

    setEnabled(enabled) {
      this.enabled = enabled;
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(enabled ? 0.68 : 0, now, 0.04);
    }

    updateEngine(active, throttle, speed, grounded) {
      if (!this.ctx || !this.engine) return;
      const now = this.ctx.currentTime;
      const load = active ? clamp(0.012 + Math.abs(throttle) * 0.018 + speed * 0.000018, 0, 0.048) : 0;
      const freq = 44 + Math.abs(speed) * 0.082 + (throttle > 0 ? 17 : 0) + (grounded ? 0 : 8);
      this.engineGain.gain.setTargetAtTime(load, now, 0.08);
      this.engineGain2.gain.setTargetAtTime(load * 0.34, now, 0.1);
      this.engine.frequency.setTargetAtTime(freq, now, 0.06);
      this.engineOsc2.frequency.setTargetAtTime(freq * 1.48, now, 0.07);
      this.engineFilter.frequency.setTargetAtTime(150 + Math.abs(speed) * 0.55 + Math.abs(throttle) * 90, now, 0.1);
    }

    tone(freq, duration, type = 'sine', volume = 0.08, slide = 0) {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    click() {
      this.tone(520, 0.055, 'square', 0.025, 140);
    }

    coin() {
      this.tone(980, 0.075, 'sine', 0.05, 240);
      setTimeout(() => this.tone(1420, 0.1, 'sine', 0.045, 260), 55);
    }

    fuel() {
      this.tone(520, 0.1, 'triangle', 0.05, 180);
      setTimeout(() => this.tone(760, 0.15, 'sine', 0.045, 220), 85);
    }

    crash() {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const length = Math.floor(ctx.sampleRate * 0.45);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        const fade = Math.pow(1 - i / length, 2.1);
        data[i] = (Math.random() * 2 - 1) * fade;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.exponentialRampToValueAtTime(90, now + 0.4);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(now);
    }

    flip() {
      this.tone(440, 0.09, 'square', 0.04, 240);
      setTimeout(() => this.tone(660, 0.09, 'square', 0.04, 320), 80);
      setTimeout(() => this.tone(880, 0.14, 'sine', 0.045, 300), 160);
    }
  }

  class Game {
    constructor() {
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.dom = this.collectDom();
      this.save = loadSave();
      this.audio = new SoundEngine(this.save.sound);
      this.state = 'menu';
      this.time = 0;
      this.acc = 0;
      this.lastFrame = performance.now();
      this.camera = { x: 0, y: 0 };
      this.shake = 0;
      this.W = 1;
      this.H = 1;
      this.dpr = 1;
      this.scale = 1;
      this.viewW = 1000;
      this.viewH = 640;
      this.anchorY = 360;
      this.portrait = false;
      this.browseIndex = Math.max(0, VEHICLES.findIndex((v) => v.id === this.save.selected));
      this.tiltValue = 0;
      this.tiltTarget = 0;
      this.tiltNeutral = null;
      this.tiltSeen = false;
      this.tiltTimeout = null;
      this.tiltEnabled = false;
      this.boundOrientation = (e) => this.handleOrientation(e);
      this.input = { gas: false, brake: false, keyGas: false, keyBrake: false };
      this.particles = [];
      this.pickups = [];
      this.clouds = Array.from({ length: 9 }, (_, i) => ({
        x: hash(i * 3.7) * 2400,
        y: 0.08 + hash(i * 7.1) * 0.26,
        s: 0.55 + hash(i * 4.3) * 0.9,
        speed: 1.4 + hash(i * 9.2) * 3.2,
        alpha: 0.28 + hash(i * 1.9) * 0.34
      }));
      this.menuCar = makeCar(vehicleById(this.save.selected), START_X);
      this.car = null;
      this.startX = START_X;
      this.distance = 0;
      this.fuel = 100;
      this.runCoins = 0;
      this.flips = 0;
      this.spawnedUntil = 0;
      this.nextCoinX = 520;
      this.nextFuelX = 1280;
      this.outOfFuel = false;
      this.outOfFuelTimer = 0;
      this.lastDust = 0;
      this.lastExhaust = 0;
      this.lastHud = 0;
      this.bindEvents();
      this.resize();
      this.syncMenuUi();
      this.showMenu(false);
      requestAnimationFrame((t) => this.loop(t));
    }

    collectDom() {
      const $ = (id) => document.getElementById(id);
      return {
        menu: $('menu'),
        playBtn: $('playBtn'),
        menuCoins: $('menuCoins'),
        menuBest: $('menuBest'),
        menuSound: $('menuSound'),
        menuSoundIcon: $('menuSoundIcon'),
        vehicleName: $('vehicleName'),
        vehicleDesc: $('vehicleDesc'),
        vehicleCount: $('vehicleCount'),
        vehiclePrice: $('vehiclePrice'),
        vehicleAction: $('vehicleAction'),
        prevVehicle: $('prevVehicle'),
        nextVehicle: $('nextVehicle'),
        tiltToggle: $('tiltToggle'),
        tiltStatus: $('tiltStatus'),
        hud: $('hud'),
        fuelCard: $('fuelCard'),
        fuelFill: $('fuelFill'),
        fuelValue: $('fuelValue'),
        speedValue: $('speedValue'),
        distanceValue: $('distanceValue'),
        hudBest: $('hudBest'),
        runCoins: $('runCoins'),
        pauseBtn: $('pauseBtn'),
        airBadge: $('airBadge'),
        touchControls: $('touchControls'),
        brakeBtn: $('brakeBtn'),
        gasBtn: $('gasBtn'),
        tiltMeter: $('tiltMeter'),
        tiltNeedle: $('tiltNeedle'),
        toastLayer: $('toastLayer'),
        pauseOverlay: $('pauseOverlay'),
        resumeBtn: $('resumeBtn'),
        restartBtn: $('restartBtn'),
        pauseMenuBtn: $('pauseMenuBtn'),
        pauseSound: $('pauseSound'),
        gameOverOverlay: $('gameOverOverlay'),
        resultLabel: $('resultLabel'),
        resultTitle: $('resultTitle'),
        resultMessage: $('resultMessage'),
        resultDistance: $('resultDistance'),
        resultCoins: $('resultCoins'),
        resultBest: $('resultBest'),
        newBest: $('newBest'),
        retryBtn: $('retryBtn'),
        garageBtn: $('garageBtn')
      };
    }

    bindEvents() {
      window.addEventListener('resize', () => this.resize());
      window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));

      this.dom.playBtn.addEventListener('click', () => {
        this.audio.init();
        this.audio.click();
        this.startGame();
      });
      this.dom.menuSound.addEventListener('click', () => this.toggleSound());
      this.dom.pauseSound.addEventListener('click', () => this.toggleSound());

      this.dom.prevVehicle.addEventListener('click', () => this.browseVehicle(-1));
      this.dom.nextVehicle.addEventListener('click', () => this.browseVehicle(1));
      this.dom.vehicleAction.addEventListener('click', () => this.handleVehicleAction());
      this.dom.tiltToggle.addEventListener('click', () => this.toggleTilt());

      this.dom.pauseBtn.addEventListener('click', () => this.pause());
      this.dom.resumeBtn.addEventListener('click', () => this.resume());
      this.dom.restartBtn.addEventListener('click', () => this.restart());
      this.dom.pauseMenuBtn.addEventListener('click', () => this.goToMenu());
      this.dom.retryBtn.addEventListener('click', () => this.restart());
      this.dom.garageBtn.addEventListener('click', () => this.goToMenu());

      this.bindPedal(this.dom.gasBtn, 'gas');
      this.bindPedal(this.dom.brakeBtn, 'brake');

      window.addEventListener('keydown', (e) => this.onKeyDown(e));
      window.addEventListener('keyup', (e) => this.onKeyUp(e));
      window.addEventListener('blur', () => {
        this.releaseAllInput();
        if (this.state === 'playing') this.pause();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'playing') this.pause();
      });
      window.addEventListener('contextmenu', (e) => {
        if (e.target.closest && e.target.closest('#app')) e.preventDefault();
      });
    }

    bindPedal(button, name) {
      const press = (e) => {
        e.preventDefault();
        this.audio.init();
        this.input[name] = true;
        button.classList.add('active');
        try {
          button.setPointerCapture(e.pointerId);
        } catch {
          /* pointer capture may be unavailable */
        }
      };
      const release = (e) => {
        if (e) e.preventDefault();
        this.input[name] = false;
        button.classList.remove('active');
      };
      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    }

    onKeyDown(e) {
      const code = e.code;
      if (['ArrowRight', 'ArrowLeft', 'Space', 'KeyA', 'KeyD', 'KeyP', 'Escape', 'Enter', 'KeyR'].includes(code)) {
        e.preventDefault();
      }
      if (this.state === 'menu' && (code === 'Enter' || code === 'Space')) {
        this.audio.init();
        this.startGame();
        return;
      }
      if (this.state === 'gameover' && (code === 'KeyR' || code === 'Enter')) {
        this.restart();
        return;
      }
      if (code === 'KeyP' || code === 'Escape') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
        return;
      }
      if (code === 'ArrowRight' || code === 'KeyD') this.input.keyGas = true;
      if (code === 'ArrowLeft' || code === 'KeyA') this.input.keyBrake = true;
    }

    onKeyUp(e) {
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.input.keyGas = false;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.input.keyBrake = false;
    }

    releaseAllInput() {
      this.input.gas = false;
      this.input.brake = false;
      this.input.keyGas = false;
      this.input.keyBrake = false;
      this.dom.gasBtn.classList.remove('active');
      this.dom.brakeBtn.classList.remove('active');
    }

    resize() {
      this.W = Math.max(1, window.innerWidth);
      this.H = Math.max(1, window.innerHeight);
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.W * this.dpr);
      this.canvas.height = Math.round(this.H * this.dpr);
      this.canvas.style.width = `${this.W}px`;
      this.canvas.style.height = `${this.H}px`;
      this.portrait = this.H > this.W * 1.08;
      this.scale = this.portrait
        ? Math.min(this.W / 520, this.H / 1000)
        : this.H / 560;
      this.scale = clamp(this.scale, 0.42, 1.7);
      this.viewW = this.W / this.scale;
      this.viewH = this.H / this.scale;
      this.anchorY = this.portrait ? this.H * 0.44 : this.H * 0.56;
      this.updateCamera(0, true);
    }

    getThrottle() {
      if (this.input.gas && !this.input.brake) return 1;
      if (this.input.brake && !this.input.gas) return -1;
      if (this.input.keyGas && !this.input.keyBrake) return 1;
      if (this.input.keyBrake && !this.input.keyGas) return -1;
      if (this.save.tilt && this.tiltSeen) return this.tiltValue;
      return 0;
    }

    syncMenuUi() {
      this.dom.menuCoins.textContent = this.save.coins.toLocaleString();
      this.dom.menuBest.textContent = this.save.best.toLocaleString();
      this.dom.hudBest.textContent = this.save.best.toLocaleString();
      this.dom.menuSoundIcon.setAttribute('href', this.save.sound ? '#i-sound' : '#i-muted');
      this.dom.menuSound.setAttribute('aria-label', this.save.sound ? 'Mute sound' : 'Enable sound');
      this.dom.pauseSound.textContent = `SOUND: ${this.save.sound ? 'ON' : 'OFF'}`;
      this.dom.tiltToggle.setAttribute('aria-checked', String(Boolean(this.save.tilt && this.tiltEnabled)));
      if (!this.save.tilt) {
        this.dom.tiltStatus.textContent = 'Off · optional accelerometer';
      } else if (!this.tiltEnabled) {
        this.dom.tiltStatus.textContent = 'Tap to request motion access';
      } else if (!this.tiltSeen) {
        this.dom.tiltStatus.textContent = 'Waiting for motion sensor…';
      } else {
        this.dom.tiltStatus.textContent = 'On · tilt forward for gas';
      }
      this.dom.tiltMeter.classList.toggle('is-hidden', !this.save.tilt);
      this.renderGarage();
    }

    renderGarage() {
      const v = VEHICLES[this.browseIndex];
      const owned = this.save.unlocked.includes(v.id);
      const selected = this.save.selected === v.id;
      this.dom.vehicleName.textContent = v.name;
      this.dom.vehicleDesc.textContent = v.desc;
      this.dom.vehicleCount.textContent = `${this.browseIndex + 1} / ${VEHICLES.length}`;
      this.dom.vehiclePrice.textContent = owned ? 'OWNED' : v.price.toLocaleString();
      for (const [key, value] of Object.entries(v.stats)) {
        const pips = this.dom.vehicleName.closest('.garage-card').querySelector(`[data-stat="${key}"]`);
        if (pips) {
          pips.innerHTML = '';
          for (let i = 0; i < 5; i++) {
            const pip = document.createElement('i');
            if (i < value) pip.className = 'on';
            pips.appendChild(pip);
          }
        }
      }
      if (selected) {
        this.dom.vehicleAction.textContent = 'SELECTED';
        this.dom.vehicleAction.classList.add('selected');
        this.dom.vehicleAction.disabled = true;
      } else if (owned) {
        this.dom.vehicleAction.textContent = 'SELECT';
        this.dom.vehicleAction.classList.remove('selected');
        this.dom.vehicleAction.disabled = false;
      } else {
        this.dom.vehicleAction.textContent = 'UNLOCK';
        this.dom.vehicleAction.classList.remove('selected');
        this.dom.vehicleAction.disabled = false;
      }
    }

    browseVehicle(dir) {
      this.audio.init();
      this.audio.click();
      this.browseIndex = (this.browseIndex + dir + VEHICLES.length) % VEHICLES.length;
      this.renderGarage();
      this.setMenuVehicle(VEHICLES[this.browseIndex]);
    }

    setMenuVehicle(spec) {
      this.menuCar = makeCar(spec, START_X);
      this.menuCar.y = terrainHeight(START_X) - (spec.wheelOffY + spec.wheelR);
      this.menuCar.angle = Math.atan(terrainSlope(START_X));
      this.updateCamera(0, true);
    }

    handleVehicleAction() {
      const v = VEHICLES[this.browseIndex];
      const owned = this.save.unlocked.includes(v.id);
      this.audio.init();
      if (owned) {
        if (this.save.selected !== v.id) {
          this.save.selected = v.id;
          persistSave(this.save);
          this.audio.click();
          this.renderGarage();
          this.setMenuVehicle(v);
          this.showToast(`${v.name} selected`, 'green');
        }
        return;
      }
      if (this.save.coins < v.price) {
        this.audio.click();
        const missing = (v.price - this.save.coins).toLocaleString();
        this.showToast(`Need ${missing} more coins`, 'red');
        return;
      }
      this.save.coins -= v.price;
      this.save.unlocked.push(v.id);
      this.save.selected = v.id;
      persistSave(this.save);
      this.audio.coin();
      this.syncMenuUi();
      this.setMenuVehicle(v);
      this.showToast(`${v.name} unlocked!`, 'green');
    }

    toggleSound() {
      this.audio.init();
      this.save.sound = !this.save.sound;
      persistSave(this.save);
      this.audio.setEnabled(this.save.sound);
      this.audio.click();
      this.syncMenuUi();
    }

    async toggleTilt() {
      this.audio.init();
      this.audio.click();
      if (this.save.tilt) {
        this.disableTilt();
        return;
      }
      if (!window.DeviceOrientationEvent) {
        this.showToast('Motion sensors are not available', 'red');
        this.dom.tiltStatus.textContent = 'No motion sensor detected';
        return;
      }
      try {
        if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
          const permission = await window.DeviceOrientationEvent.requestPermission();
          if (permission !== 'granted') {
            this.showToast('Motion access was denied', 'red');
            this.dom.tiltStatus.textContent = 'Permission denied';
            return;
          }
        }
        window.addEventListener('deviceorientation', this.boundOrientation, true);
        this.save.tilt = true;
        this.tiltEnabled = true;
        this.tiltSeen = false;
        this.tiltNeutral = null;
        this.tiltTarget = 0;
        this.tiltValue = 0;
        persistSave(this.save);
        this.syncMenuUi();
        this.showToast('Tilt controls enabled', 'green');
        clearTimeout(this.tiltTimeout);
        this.tiltTimeout = setTimeout(() => {
          if (!this.tiltSeen) {
            this.dom.tiltStatus.textContent = 'No sensor detected · check device';
          }
        }, 2200);
      } catch {
        this.showToast('Motion access is unavailable', 'red');
        this.dom.tiltStatus.textContent = 'Motion access unavailable';
      }
    }

    disableTilt() {
      window.removeEventListener('deviceorientation', this.boundOrientation, true);
      clearTimeout(this.tiltTimeout);
      this.save.tilt = false;
      this.tiltEnabled = false;
      this.tiltTarget = 0;
      this.tiltValue = 0;
      this.tiltSeen = false;
      this.tiltNeutral = null;
      persistSave(this.save);
      this.syncMenuUi();
      this.showToast('Tilt controls off');
    }

    handleOrientation(e) {
      if (typeof e.beta !== 'number') return;
      this.tiltSeen = true;
      if (this.tiltNeutral === null) {
        this.tiltNeutral = e.beta;
        this.dom.tiltStatus.textContent = 'On · tilt forward for gas';
      }
      let delta = e.beta - this.tiltNeutral;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const dead = 3.2;
      const range = 21;
      if (Math.abs(delta) <= dead) {
        this.tiltTarget = 0;
      } else {
        this.tiltTarget = clamp((delta - Math.sign(delta) * dead) / range, -1, 1);
      }
    }

    showMenu(snap = true) {
      this.state = 'menu';
      this.releaseAllInput();
      this.dom.menu.classList.remove('is-hidden');
      this.dom.hud.classList.add('is-hidden');
      this.dom.touchControls.classList.add('is-hidden');
      this.dom.pauseOverlay.classList.add('is-hidden');
      this.dom.gameOverOverlay.classList.add('is-hidden');
      this.audio.updateEngine(false, 0, 0, true);
      this.car = null;
      this.particles = [];
      this.pickups = [];
      this.setMenuVehicle(VEHICLES[this.browseIndex]);
      this.syncMenuUi();
      this.updateCamera(0, snap);
    }

    startGame() {
      const spec = vehicleById(this.save.selected);
      this.state = 'playing';
      this.dom.menu.classList.add('is-hidden');
      this.dom.hud.classList.remove('is-hidden');
      this.dom.touchControls.classList.remove('is-hidden');
      this.dom.pauseOverlay.classList.add('is-hidden');
      this.dom.gameOverOverlay.classList.add('is-hidden');
      this.releaseAllInput();
      this.startX = START_X;
      this.car = makeCar(spec, START_X);
      this.distance = 0;
      this.fuel = 100;
      this.runCoins = 0;
      this.flips = 0;
      this.outOfFuel = false;
      this.outOfFuelTimer = 0;
      this.acc = 0;
      this.shake = 0;
      this.particles = [];
      this.pickups = [];
      this.spawnedUntil = 0;
      this.nextCoinX = 520;
      this.nextFuelX = 1280;
      this.lastDust = 0;
      this.lastExhaust = 0;
      this.buildPickups(START_X + 3600);
      this.camera.x = this.car.x + this.viewW * 0.1;
      this.camera.y = this.car.y + (this.portrait ? 22 : 34);
      this.updateHud(true);
      this.audio.init();
      this.audio.updateEngine(true, 0, 0, true);
      this.showToast('GO!', 'green');
    }

    restart() {
      this.audio.init();
      this.startGame();
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.releaseAllInput();
      this.dom.pauseOverlay.classList.remove('is-hidden');
      this.dom.touchControls.classList.add('is-hidden');
      this.audio.updateEngine(false, 0, 0, true);
      this.audio.click();
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      this.dom.pauseOverlay.classList.add('is-hidden');
      this.dom.touchControls.classList.remove('is-hidden');
      this.audio.init();
      this.audio.click();
      this.lastFrame = performance.now();
    }

    goToMenu() {
      this.audio.click();
      this.showMenu(true);
    }

    endGame(reason) {
      if (this.state !== 'playing') return;
      this.state = 'gameover';
      this.releaseAllInput();
      this.dom.touchControls.classList.add('is-hidden');
      this.audio.updateEngine(false, 0, 0, true);
      if (reason === 'crash') {
        this.audio.crash();
        this.shake = 18;
      } else {
        this.audio.tone(180, 0.35, 'sawtooth', 0.05, -100);
      }

      const meters = Math.round(this.distance);
      const isBest = meters > this.save.best;
      this.save.coins += this.runCoins;
      if (isBest) this.save.best = meters;
      this.save.runs += 1;
      persistSave(this.save);

      this.dom.resultLabel.textContent = reason === 'crash' ? 'WIPEOUT' : 'RUN COMPLETE';
      this.dom.resultTitle.textContent = reason === 'crash' ? 'THAT HURT' : 'OUT OF FUEL';
      this.dom.resultMessage.textContent = reason === 'crash'
        ? 'The driver found the one rock on the whole hill.'
        : 'The tank ran dry. Grab every fuel can you can reach.';
      this.dom.resultDistance.textContent = meters.toLocaleString();
      this.dom.resultCoins.textContent = this.runCoins.toLocaleString();
      this.dom.resultBest.textContent = this.save.best.toLocaleString();
      this.dom.newBest.classList.toggle('is-hidden', !isBest);
      this.dom.gameOverOverlay.classList.remove('is-hidden');
      this.syncMenuUi();
    }

    showToast(text, tone = '') {
      const el = document.createElement('div');
      el.className = `toast ${tone}`.trim();
      el.textContent = text;
      this.dom.toastLayer.appendChild(el);
      setTimeout(() => el.remove(), 1750);
    }

    buildPickups(toX) {
      while (this.spawnedUntil < toX) {
        const chunk = this.spawnedUntil;
        if (chunk >= this.nextCoinX) {
          const count = 4 + Math.floor(hash(chunk * 0.031) * 4);
          const spacing = 30 + hash(chunk * 0.077) * 10;
          const arc = 34 + hash(chunk * 0.043) * 72;
          for (let i = 0; i < count; i++) {
            const x = this.nextCoinX + i * spacing;
            const y = terrainHeight(x) - 50 - Math.sin((i / Math.max(1, count - 1)) * Math.PI) * arc;
            this.pickups.push({
              type: 'coin',
              x,
              y,
              phase: hash(x * 0.12) * TAU,
              collected: false
            });
          }
          this.nextCoinX += 390 + hash(chunk * 0.019) * 430;
        }
        if (chunk >= this.nextFuelX) {
          const x = this.nextFuelX;
          this.pickups.push({
            type: 'fuel',
            x,
            y: terrainHeight(x) - 55,
            phase: hash(x * 0.15) * TAU,
            collected: false
          });
          this.nextFuelX += 1900 + hash(chunk * 0.027) * 850;
        }
        this.spawnedUntil += 120;
      }
    }

    updatePickups() {
      if (!this.car) return;
      this.buildPickups(this.car.x + 3200);
      if (this.pickups.length > 180) {
        this.pickups = this.pickups.filter((p) => !p.collected && p.x > this.car.x - 900);
      }
      const car = this.car;
      for (const p of this.pickups) {
        if (p.collected) continue;
        if (Math.abs(p.x - car.x) > 70) continue;
        const dx = p.x - car.x;
        const dy = p.y - car.y;
        if (dx * dx + dy * dy < 56 * 56) {
          p.collected = true;
          if (p.type === 'coin') {
            this.runCoins += 10;
            this.audio.coin();
            this.spawnSpark(p.x, p.y);
          } else {
            this.fuel = Math.min(100, this.fuel + 38);
            this.audio.fuel();
            this.showToast('FUEL +38', 'green');
            this.spawnSpark(p.x, p.y, 16);
          }
        }
      }
    }

    spawnDust(x, y, count, power = 1) {
      for (let i = 0; i < count; i++) {
        const life = 0.5 + Math.random() * 0.7;
        this.particles.push({
          type: 'dust',
          x: x + (Math.random() - 0.5) * 24,
          y: y + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 110 * power,
          vy: -30 - Math.random() * 100 * power,
          gravity: 90,
          drag: 1.3,
          life,
          maxLife: life,
          size: 5 + Math.random() * 12 * power,
          color: Math.random() > 0.35 ? '#c6a06c' : '#8f6c46'
        });
      }
    }

    spawnSpark(x, y, count = 10) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU;
        const speed = 40 + Math.random() * 180;
        const life = 0.4 + Math.random() * 0.5;
        this.particles.push({
          type: 'spark',
          x,
          y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 40,
          gravity: 340,
          drag: 0.7,
          life,
          maxLife: life,
          size: 2 + Math.random() * 4,
          color: Math.random() > 0.4 ? '#ffd451' : '#fff3b1'
        });
      }
    }

    spawnDebris(count = 16) {
      if (!this.car) return;
      for (let i = 0; i < count; i++) {
        const a = -Math.PI + Math.random() * Math.PI;
        const speed = 80 + Math.random() * 260;
        const life = 0.6 + Math.random() * 0.7;
        this.particles.push({
          type: 'debris',
          x: this.car.x,
          y: this.car.y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 100,
          gravity: 900,
          drag: 0.25,
          life,
          maxLife: life,
          size: 2 + Math.random() * 5,
          color: Math.random() > 0.5 ? '#3d4a50' : '#e9a82c'
        });
      }
    }

    updateParticles(dt) {
      for (const p of this.particles) {
        p.life -= dt;
        p.vy += p.gravity * dt;
        p.vx *= Math.exp(-p.drag * dt);
        p.vy *= Math.exp(-p.drag * 0.22 * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      this.particles = this.particles.filter((p) => p.life > 0);
    }

    updateCamera(dt, snap = false) {
      const car = this.state === 'menu' ? this.menuCar : this.car;
      if (!car) return;
      let targetX;
      let targetY;
      const menu = this.state === 'menu';
      if (menu) {
        targetX = this.portrait ? car.x : car.x - this.viewW * 0.065;
      } else {
        targetX = car.x + this.viewW * 0.1 + car.vx * 0.13;
      }
      const desiredScreenY = menu
        ? this.H * (this.portrait ? 0.55 : 0.59)
        : this.H * (this.portrait ? 0.52 : 0.50);
      targetY = car.y - (desiredScreenY - this.anchorY) / this.scale;
      if (snap) {
        this.camera.x = targetX;
        this.camera.y = targetY;
        return;
      }
      const k = 1 - Math.exp(-(this.state === 'menu' ? 3.1 : 6.5) * dt);
      this.camera.x = lerp(this.camera.x, targetX, k);
      this.camera.y = lerp(this.camera.y, targetY, k);
    }

    updateMenu(dt) {
      const car = this.menuCar;
      if (!car) return;
      const slope = terrainSlope(car.x);
      car.angle = Math.atan(slope);
      car.y = terrainHeight(car.x) - (car.spec.wheelOffY + car.spec.wheelR) + Math.sin(this.time * 2.1) * 0.9;
      car.wheelAngle += dt * 0.75;
      this.updateCamera(dt);
      this.tiltValue = lerp(this.tiltValue, this.tiltTarget, 1 - Math.exp(-10 * dt));
    }

    stepPhysics(dt) {
      const car = this.car;
      if (!car || this.state !== 'playing') return;
      const spec = car.spec;
      const throttle = this.getThrottle();
      const fuelOk = this.fuel > 0;
      const ride = spec.wheelOffY + spec.wheelR;
      const ground = terrainHeight(car.x);
      const targetY = ground - ride;
      const slope = terrainSlope(car.x);
      const targetAngle = Math.atan(slope);
      car.prevAngle = car.angle;

      if (car.grounded && targetY - car.y > 16) car.grounded = false;
      if (car.grounded && car.vx > 235 && car.lastSlope < -0.055 && targetAngle > 0.045 && this.time - car.lastLaunch > 0.55) {
        car.grounded = false;
        car.vy = Math.min(car.vy, -Math.abs(car.vx) * 0.24);
        car.omega -= 0.7;
        car.lastLaunch = this.time;
      }

      if (car.grounded) {
        car.airTime = 0;
        car.airSpin = 0;
        car.vx += 560 * Math.sin(car.angle) * dt;
        if (fuelOk) {
          if (throttle > 0) {
            const speedFactor = clamp(1 - car.vx / spec.maxSpeed, 0, 1);
            car.vx += spec.engine * throttle * speedFactor * dt;
          } else if (throttle < 0) {
            if (car.vx > 18) car.vx -= spec.brake * dt;
            else car.vx += spec.engine * 0.5 * throttle * dt;
          }
        }
        car.vx *= Math.exp(-0.42 * dt);
        const diff = normalizeAngle(targetAngle - car.angle);
        car.omega += diff * 112 * dt;
        car.omega *= Math.exp(-9.5 * dt);
        car.angle += car.omega * dt;

        car.vy += (targetY - car.y) * 430 * dt;
        car.vy *= Math.exp(-16 * dt);
        car.y += car.vy * dt;
        if (car.y > targetY) {
          car.y = targetY;
          if (car.vy > 0) car.vy = 0;
        }
        if (targetY - car.y > 15) car.grounded = false;

        car.wheelAngle += (car.vx / spec.wheelR) * dt;

        if (Math.abs(car.vx) > 90 && this.time - this.lastDust > 0.045) {
          this.lastDust = this.time;
          const wheel = localToWorld(car, -spec.wheelBase * 0.5, spec.wheelOffY + spec.wheelR);
          this.spawnDust(wheel.x, terrainHeight(wheel.x), 1, 0.7);
        }
        if (throttle > 0 && fuelOk && this.time - this.lastExhaust > 0.09) {
          this.lastExhaust = this.time;
          const pipe = localToWorld(car, -spec.bodyW * 0.5 + 2, -4);
          this.particles.push({
            type: 'dust',
            x: pipe.x,
            y: pipe.y,
            vx: -30 - Math.random() * 30,
            vy: -18 - Math.random() * 30,
            gravity: -15,
            drag: 1.5,
            life: 0.45,
            maxLife: 0.45,
            size: 3 + Math.random() * 4,
            color: '#c9d1d1'
          });
        }
      } else {
        car.airTime += dt;
        if (fuelOk) car.omega -= throttle * spec.airTorque * dt;
        car.omega *= Math.exp(-0.3 * dt);
        car.vy += GRAVITY * dt;
        car.vx *= Math.exp(-0.045 * dt);
        car.angle += car.omega * dt;
        car.y += car.vy * dt;
        car.wheelAngle += (car.vx / spec.wheelR) * dt * 0.5;

        const spinDelta = normalizeAngle(car.angle - car.prevAngle);
        car.airSpin += spinDelta;
        if (Math.abs(car.airSpin) >= TAU) {
          const direction = Math.sign(car.airSpin);
          car.airSpin -= direction * TAU;
          this.flips += 1;
          this.runCoins += 100;
          this.audio.flip();
          this.showToast(direction < 0 ? 'BACKFLIP +100' : 'FRONTFLIP +100', 'green');
          const p = localToWorld(car, 0, -20);
          this.spawnSpark(p.x, p.y, 18);
        }

        const landGround = terrainHeight(car.x);
        const landTarget = landGround - ride;
        if (car.y >= landTarget - 2 && car.vy >= -40) {
          const impact = Math.max(0, car.vy);
          const landSlope = terrainSlope(car.x);
          const landAngle = Math.atan(landSlope);
          const angleDiff = Math.abs(normalizeAngle(car.angle - landAngle));
          car.y = landTarget;
          car.grounded = true;
          car.vy = 0;
          if (angleDiff > 1.48 || Math.abs(car.omega) > 8.2) {
            this.crash();
            return;
          }
          if (angleDiff > 0.62) {
            car.angle = landAngle + normalizeAngle(car.angle - landAngle) * 0.58;
          }
          car.omega *= 0.3;
          car.airTime = 0;
          car.airSpin = 0;
          if (impact > 170) {
            this.shake = Math.max(this.shake, Math.min(12, impact * 0.018));
            const wheel = localToWorld(car, 0, spec.wheelOffY + spec.wheelR);
            this.spawnDust(wheel.x, landGround, Math.min(14, 3 + Math.floor(impact / 70)), 1.2);
            this.audio.tone(95, 0.12, 'triangle', 0.04, -35);
          }
        }
      }

      car.x += car.vx * dt;
      if (car.x < 70) {
        car.x = 70;
        car.vx = Math.max(0, car.vx);
      }

      const head = localToWorld(car, -4, -34);
      const roof = localToWorld(car, 0, -(ride + 8));
      const front = localToWorld(car, spec.bodyW * 0.52, 0);
      const rear = localToWorld(car, -spec.bodyW * 0.52, 0);
      const crashPoints = [head, roof, front, rear];
      for (const point of crashPoints) {
        if (point.y > terrainHeight(point.x) + 2) {
          this.crash();
          return;
        }
      }
      if (car.grounded && Math.abs(normalizeAngle(car.angle - targetAngle)) > 1.5) {
        this.crash();
        return;
      }

      const fuelBurn = 1.02 + (throttle > 0 && fuelOk ? 0.82 : 0);
      this.fuel = Math.max(0, this.fuel - fuelBurn * dt);
      if (this.fuel <= 0 && !this.outOfFuel) {
        this.outOfFuel = true;
        this.outOfFuelTimer = 1.15;
        this.showToast('OUT OF FUEL', 'red');
      }
      if (this.outOfFuel) {
        this.outOfFuelTimer -= dt;
        if (this.outOfFuelTimer <= 0) {
          this.endGame('fuel');
          return;
        }
      }

      this.distance = Math.max(this.distance, (car.x - this.startX) / PIXELS_PER_METER);
      car.lastSlope = targetAngle;
      this.updatePickups();
    }

    crash() {
      if (this.state !== 'playing') return;
      this.spawnDebris(20);
      this.shake = 20;
      this.endGame('crash');
    }

    updateGame(dt) {
      if (!this.car) return;
      this.updateCamera(dt);
      this.updatePickups();
      const car = this.car;
      const throttle = this.getThrottle();
      if (car.grounded && Math.abs(car.vx) > 30 && this.time - this.lastDust > 0.08) {
        this.lastDust = this.time;
        const wheel = localToWorld(car, -car.spec.wheelBase * 0.5, car.spec.wheelOffY + car.spec.wheelR);
        this.spawnDust(wheel.x, terrainHeight(wheel.x), 1, 0.55);
      }
      this.tiltValue = lerp(this.tiltValue, this.tiltTarget, 1 - Math.exp(-12 * dt));
      this.dom.tiltNeedle.style.left = `${50 + this.tiltValue * 44}%`;
      this.updateHud();
      this.audio.updateEngine(true, throttle, Math.abs(car.vx), car.grounded);
    }

    updateHud(force = false) {
      if (!this.car) return;
      const now = this.time;
      if (!force && now - this.lastHud < 0.055) return;
      this.lastHud = now;
      const meters = Math.round(this.distance);
      const speed = Math.round(Math.abs(this.car.vx) * 3.6 / PIXELS_PER_METER);
      this.dom.distanceValue.textContent = meters.toLocaleString();
      this.dom.speedValue.textContent = speed;
      this.dom.runCoins.textContent = this.runCoins.toLocaleString();
      this.dom.fuelValue.textContent = `${Math.round(this.fuel)}%`;
      this.dom.fuelFill.style.width = `${clamp(this.fuel, 0, 100)}%`;
      this.dom.fuelCard.classList.toggle('low', this.fuel < 26);
      this.dom.hudBest.textContent = Math.max(this.save.best, meters).toLocaleString();
      if (this.car.airTime > 0.35) {
        this.dom.airBadge.classList.remove('is-hidden');
        this.dom.airBadge.textContent = `AIR TIME ${this.car.airTime.toFixed(1)}s`;
      } else {
        this.dom.airBadge.classList.add('is-hidden');
      }
    }

    update(dt) {
      this.time += dt;
      this.shake = Math.max(0, this.shake - dt * 28);
      if (this.state === 'playing') {
        this.acc = Math.min(this.acc + dt, 0.09);
        let steps = 0;
        while (this.acc >= FIXED_STEP && steps < 12) {
          this.stepPhysics(FIXED_STEP);
          this.acc -= FIXED_STEP;
          steps++;
          if (this.state !== 'playing') break;
        }
        if (this.state === 'playing') this.updateGame(dt);
      } else if (this.state === 'menu') {
        this.updateMenu(dt);
      } else {
        this.tiltValue = lerp(this.tiltValue, this.tiltTarget, 1 - Math.exp(-8 * dt));
        this.audio.updateEngine(false, 0, 0, true);
      }
      this.updateParticles(dt);
    }

    loop(now) {
      const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      this.update(dt);
      this.render();
      requestAnimationFrame((t) => this.loop(t));
    }

    render() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);
      this.drawSky(ctx);

      const car = this.state === 'menu' ? this.menuCar : this.car;
      const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
      const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.7 : 0;

      ctx.save();
      ctx.translate(this.W / 2 + shakeX, this.anchorY + shakeY);
      ctx.scale(this.scale, this.scale);
      ctx.translate(-this.camera.x, -this.camera.y);

      this.drawTerrain(ctx);
      this.drawTrailDecor(ctx);
      this.drawStartSign(ctx);
      this.drawPickups(ctx);
      this.drawParticles(ctx);
      if (car) this.drawCar(ctx, car);
      ctx.restore();

      this.drawVignette(ctx);
    }

    drawSky(ctx) {
      const { W, H } = this;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#2f83bf');
      sky.addColorStop(0.36, '#7ec6e5');
      sky.addColorStop(0.63, '#cbe8e8');
      sky.addColorStop(0.78, '#f5dfae');
      sky.addColorStop(1, '#efc07e');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      const sunX = W * 0.79 - ((this.camera.x * 0.015) % 80);
      const sunY = H * 0.16;
      const sunGlow = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, Math.max(90, H * 0.3));
      sunGlow.addColorStop(0, 'rgba(255, 251, 206, 0.95)');
      sunGlow.addColorStop(0.16, 'rgba(255, 235, 148, 0.58)');
      sunGlow.addColorStop(0.48, 'rgba(255, 214, 125, 0.16)');
      sunGlow.addColorStop(1, 'rgba(255, 214, 125, 0)');
      ctx.fillStyle = sunGlow;
      ctx.fillRect(0, 0, W, H);
      ctx.beginPath();
      ctx.arc(sunX, sunY, Math.max(23, H * 0.055), 0, TAU);
      ctx.fillStyle = '#fff6c8';
      ctx.fill();

      const cloudScale = H / 720;
      for (const cloud of this.clouds) {
        const x = wrap(cloud.x - this.camera.x * 0.035 + this.time * cloud.speed, -280, W + 280);
        const y = cloud.y * H;
        this.drawCloud(ctx, x, y, cloud.s * cloudScale, cloud.alpha);
      }

      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.strokeStyle = '#264d60';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const x = wrap(i * 410 + 170 - this.camera.x * 0.06 + this.time * (7 + i * 2), -80, W + 80);
        const y = H * (0.21 + i * 0.035) + Math.sin(this.time * 1.4 + i) * 4;
        const s = 6 + i * 2;
        ctx.beginPath();
        ctx.moveTo(x - s, y);
        ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.55, x, y - s * 0.15);
        ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.55, x + s, y);
        ctx.stroke();
      }
      ctx.restore();

      this.drawRidge(ctx, 0.055, this.anchorY + H * 0.02, H * 0.075, 0.0038, 'rgba(71, 118, 132, 0.42)');
      this.drawRidge(ctx, 0.11, this.anchorY + H * 0.07, H * 0.055, 0.0058, 'rgba(48, 99, 93, 0.64)');

      const haze = ctx.createLinearGradient(0, this.anchorY - H * 0.18, 0, this.anchorY + H * 0.12);
      haze.addColorStop(0, 'rgba(247, 227, 177, 0)');
      haze.addColorStop(0.58, 'rgba(247, 227, 177, 0.16)');
      haze.addColorStop(1, 'rgba(247, 227, 177, 0)');
      ctx.fillStyle = haze;
      ctx.fillRect(0, this.anchorY - H * 0.18, W, H * 0.3);
    }

    drawCloud(ctx, x, y, scale, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fffdf3';
      const parts = [
        [-46, 4, 42, 19],
        [-16, -8, 46, 26],
        [20, -1, 38, 19],
        [46, 7, 30, 14],
        [-58, 10, 28, 12]
      ];
      for (const [px, py, rx, ry] of parts) {
        ctx.beginPath();
        ctx.ellipse(x + px * scale, y + py * scale, rx * scale, ry * scale, 0, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = alpha * 0.42;
      ctx.fillStyle = '#d7edf0';
      ctx.beginPath();
      ctx.ellipse(x + 2 * scale, y + 15 * scale, 62 * scale, 9 * scale, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    drawRidge(ctx, parallax, baseY, amp, freq, color) {
      const { W, H } = this;
      ctx.beginPath();
      ctx.moveTo(-30, H);
      for (let x = -30; x <= W + 30; x += 16) {
        const wx = x + this.camera.x * parallax;
        const y = baseY +
          Math.sin(wx * freq) * amp +
          Math.sin(wx * freq * 2.7 + 1.8) * amp * 0.32 +
          Math.sin(wx * freq * 0.47 + 0.3) * amp * 0.62;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W + 30, H);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      if (parallax > 0.08) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#224d48';
        for (let x = 20; x < W; x += 47) {
          const wx = x + this.camera.x * parallax;
          const y = baseY + Math.sin(wx * freq) * amp + Math.sin(wx * freq * 2.7 + 1.8) * amp * 0.32 + 4;
          const treeH = 9 + hash(wx * 0.12) * 16;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 4, y - treeH);
          ctx.lineTo(x + 8, y);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }

    drawTerrain(ctx) {
      const left = this.camera.x - this.viewW * 0.58;
      const right = this.camera.x + this.viewW * 0.58;
      const step = 7;
      const bottom = this.camera.y + this.viewH * 0.85;

      ctx.beginPath();
      ctx.moveTo(left, this.camera.y + this.viewH);
      for (let x = left; x <= right + step; x += step) {
        ctx.lineTo(x, terrainHeight(x));
      }
      ctx.lineTo(right + step, bottom);
      ctx.lineTo(left, bottom);
      ctx.closePath();

      const soil = ctx.createLinearGradient(0, this.anchorY - 30, 0, this.anchorY + this.viewH * 0.75);
      soil.addColorStop(0, '#8a623b');
      soil.addColorStop(0.18, '#704b2d');
      soil.addColorStop(0.55, '#563922');
      soil.addColorStop(1, '#3c2819');
      ctx.fillStyle = soil;
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#2d1b10';
      for (let x = Math.floor(left / 57) * 57; x < right; x += 57) {
        const y = terrainHeight(x) + 40 + hash(x * 0.13) * 180;
        const w = 22 + hash(x * 0.31) * 70;
        ctx.beginPath();
        ctx.ellipse(x, y, w, 3 + hash(x * 0.7) * 4, -0.06, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = '#f4cf8f';
      for (let x = Math.floor(left / 43) * 43; x < right; x += 43) {
        const y = terrainHeight(x) + 24 + hash(x * 0.19) * 100;
        ctx.beginPath();
        ctx.arc(x, y, 1.4 + hash(x) * 2.2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(left, terrainHeight(left));
      for (let x = left; x <= right + step; x += step) {
        ctx.lineTo(x, terrainHeight(x));
      }
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#3e2a19';
      ctx.lineWidth = 15;
      ctx.stroke();
      ctx.strokeStyle = '#9b7042';
      ctx.lineWidth = 9;
      ctx.stroke();
      ctx.strokeStyle = '#c49a5f';
      ctx.lineWidth = 3.4;
      ctx.stroke();
    }

    drawTrailDecor(ctx) {
      const left = this.camera.x - this.viewW * 0.58;
      const right = this.camera.x + this.viewW * 0.58;
      const start = Math.floor(left / 38) * 38;
      for (let x = start; x < right; x += 38) {
        const r = hash(x * 0.021);
        const y = terrainHeight(x);
        if (r > 0.5) {
          const sway = Math.sin(this.time * 1.3 + x) * 1.3;
          ctx.strokeStyle = r > 0.82 ? '#5d8f36' : '#4f7a2e';
          ctx.lineWidth = 1.6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x - 3 + sway, y - 8, x - 5 + sway, y - 13);
          ctx.moveTo(x + 2, y);
          ctx.quadraticCurveTo(x + 4 + sway, y - 7, x + 7 + sway, y - 11);
          ctx.moveTo(x - 1, y);
          ctx.quadraticCurveTo(x + 1, y - 9, x + 2, y - 16);
          ctx.stroke();
          if (r > 0.95) {
            ctx.fillStyle = '#ffe06b';
            ctx.beginPath();
            ctx.arc(x + 2, y - 17, 2.2, 0, TAU);
            ctx.fill();
          }
        }
        const rock = hash(x * 0.053 + 12);
        if (rock > 0.88) {
          ctx.fillStyle = rock > 0.95 ? '#7f8a84' : '#6b5a47';
          ctx.beginPath();
          ctx.ellipse(x + 8, y + 3, 5 + rock * 4, 3 + rock * 2, -0.1, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 232, 190, 0.16)';
          ctx.beginPath();
          ctx.ellipse(x + 6, y + 1, 3, 1.4, -0.1, 0, TAU);
          ctx.fill();
        }
      }
    }

    drawStartSign(ctx) {
      const x = 352;
      const y = terrainHeight(x);
      const visibleLeft = this.camera.x - this.viewW * 0.58;
      const visibleRight = this.camera.x + this.viewW * 0.58;
      if (x < visibleLeft - 100 || x > visibleRight + 100) return;

      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = '#4b3928';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-27, 0);
      ctx.lineTo(-27, -85);
      ctx.moveTo(27, 0);
      ctx.lineTo(27, -85);
      ctx.stroke();

      roundRect(ctx, -42, -104, 84, 28, 5);
      ctx.fillStyle = '#263b42';
      ctx.fill();
      ctx.strokeStyle = '#e9d8ae';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fff6da';
      ctx.font = '900 11px "Arial Black", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('START', 0, -89);

      const flagX = 27;
      ctx.fillStyle = '#f8f1dd';
      ctx.fillRect(flagX + 2, -83, 18, 14);
      ctx.fillStyle = '#27363b';
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          if ((row + col) % 2 === 0) ctx.fillRect(flagX + 2 + col * 9, -83 + row * 7, 9, 7);
        }
      }
      ctx.restore();

      const markerBase = this.startX;
      for (let m = 100; m <= 1000; m += 100) {
        const mx = markerBase + m * PIXELS_PER_METER;
        if (mx < visibleLeft - 60 || mx > visibleRight + 60) continue;
        const my = terrainHeight(mx);
        ctx.strokeStyle = '#59422d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx, my - 38);
        ctx.stroke();
        roundRect(ctx, mx - 17, my - 55, 34, 17, 3);
        ctx.fillStyle = 'rgba(255, 248, 228, 0.82)';
        ctx.fill();
        ctx.fillStyle = '#4e5d59';
        ctx.font = '900 8px "Arial Black", Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${m}m`, mx, my - 46);
      }
    }

    drawPickups(ctx) {
      const left = this.camera.x - this.viewW * 0.56;
      const right = this.camera.x + this.viewW * 0.56;
      for (const p of this.pickups) {
        if (p.collected || p.x < left || p.x > right) continue;
        if (p.type === 'coin') this.drawCoin(ctx, p);
        else this.drawFuelCan(ctx, p);
      }
    }

    drawCoin(ctx, p) {
      const bob = Math.sin(this.time * 3.1 + p.phase) * 4;
      const ground = terrainHeight(p.x);
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#1e1207';
      ctx.beginPath();
      ctx.ellipse(p.x, ground + 1, 11, 3.2, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.translate(p.x, p.y + bob);
      const squash = 0.38 + Math.abs(Math.cos(this.time * 2.6 + p.phase)) * 0.62;
      ctx.scale(squash, 1);
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
      glow.addColorStop(0, 'rgba(255, 231, 111, 0.4)');
      glow.addColorStop(1, 'rgba(255, 196, 61, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TAU);
      ctx.fillStyle = '#ffc62f';
      ctx.fill();
      ctx.strokeStyle = '#e58b10';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 7.1, 0, TAU);
      ctx.strokeStyle = 'rgba(151, 78, 2, 0.65)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#fff2a8';
      ctx.beginPath();
      ctx.arc(-3.2, -3.4, 2.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#b96c05';
      ctx.font = '900 11px "Arial Black", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('C', 0, 0.8);
      ctx.restore();
    }

    drawFuelCan(ctx, p) {
      const bob = Math.sin(this.time * 2.4 + p.phase) * 3.2;
      const ground = terrainHeight(p.x);
      ctx.save();
      ctx.globalAlpha = 0.17;
      ctx.fillStyle = '#1e1207';
      ctx.beginPath();
      ctx.ellipse(p.x, ground + 1, 15, 3.6, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.translate(p.x, p.y + bob);
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 32);
      glow.addColorStop(0, 'rgba(255, 228, 126, 0.35)');
      glow.addColorStop(1, 'rgba(255, 196, 61, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, TAU);
      ctx.fill();
      roundRect(ctx, -13, -17, 26, 34, 5);
      const body = ctx.createLinearGradient(-13, -17, 13, 17);
      body.addColorStop(0, '#f65a3f');
      body.addColorStop(1, '#b62224');
      ctx.fillStyle = body;
      ctx.fill();
      ctx.strokeStyle = '#7d171d';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = '#6d1217';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(-8, -17);
      ctx.quadraticCurveTo(-8, -25, 0, -25);
      ctx.quadraticCurveTo(8, -25, 8, -17);
      ctx.stroke();
      roundRect(ctx, -6, -22, 12, 5, 2);
      ctx.fillStyle = '#4b2d19';
      ctx.fill();
      ctx.fillStyle = '#ffd65a';
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(6, 2);
      ctx.quadraticCurveTo(0, 9, -6, 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '900 7px "Arial Black", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('FUEL', 0, 12);
      ctx.restore();
    }

    drawParticles(ctx) {
      for (const p of this.particles) {
        const t = clamp(p.life / p.maxLife, 0, 1);
        ctx.save();
        ctx.globalAlpha = t * (p.type === 'dust' ? 0.46 : 0.9);
        ctx.fillStyle = p.color;
        if (p.type === 'debris') {
          ctx.translate(p.x, p.y);
          ctx.rotate(p.life * 9);
          ctx.fillRect(-p.size * 0.5, -p.size * 0.35, p.size, p.size * 0.7);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (p.type === 'dust' ? 1 + (1 - t) * 0.8 : t), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    drawCar(ctx, car) {
      const spec = car.spec;
      const ground = terrainHeight(car.x);
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#1a1109';
      ctx.beginPath();
      ctx.ellipse(car.x, ground + 2, spec.bodyW * 0.58, 7, Math.atan(terrainSlope(car.x)), 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      const half = spec.wheelBase * 0.5;

      ctx.strokeStyle = '#1b2a32';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-half + 9, 3);
      ctx.lineTo(-half, spec.wheelOffY);
      ctx.moveTo(half - 9, 3);
      ctx.lineTo(half, spec.wheelOffY);
      ctx.stroke();
      ctx.strokeStyle = '#55666e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-half + 9, 2);
      ctx.lineTo(-half, spec.wheelOffY - 1);
      ctx.moveTo(half - 9, 2);
      ctx.lineTo(half, spec.wheelOffY - 1);
      ctx.stroke();

      this.drawWheel(ctx, -half, spec.wheelOffY, spec.wheelR, spec, car.wheelAngle);
      this.drawWheel(ctx, half, spec.wheelOffY, spec.wheelR, spec, car.wheelAngle);

      if (spec.style === 'monster') this.drawMonsterBody(ctx, spec);
      else if (spec.style === 'buggy') this.drawBuggyBody(ctx, spec);
      else this.drawJeepBody(ctx, spec);

      ctx.restore();
    }

    drawWheel(ctx, x, y, R, spec, angle) {
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.fillStyle = '#1b2024';
      ctx.fill();
      ctx.strokeStyle = '#0d1215';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.save();
      ctx.rotate(angle);
      ctx.strokeStyle = '#30373b';
      ctx.lineWidth = Math.max(2, R * 0.11);
      ctx.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const inner = R * 0.72;
        const outer = R * 0.96;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a + 0.16) * outer, Math.sin(a + 0.16) * outer);
        ctx.stroke();
      }

      const rimGrad = ctx.createRadialGradient(-R * 0.2, -R * 0.2, 2, 0, 0, R * 0.62);
      rimGrad.addColorStop(0, '#f3f8fa');
      rimGrad.addColorStop(0.55, spec.rim);
      rimGrad.addColorStop(1, '#9faeb5');
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.6, 0, TAU);
      ctx.fillStyle = rimGrad;
      ctx.fill();
      ctx.strokeStyle = '#7e8e96';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.strokeStyle = '#82939b';
      ctx.lineWidth = Math.max(1.5, R * 0.065);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 0.14, Math.sin(a) * R * 0.14);
        ctx.lineTo(Math.cos(a) * R * 0.48, Math.sin(a) * R * 0.48);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.16, 0, TAU);
      ctx.fillStyle = '#2a343a';
      ctx.fill();
      ctx.strokeStyle = '#aab8be';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      ctx.restore();
    }

    drawJeepBody(ctx, spec) {
      const half = spec.bodyW * 0.5;
      const g = ctx.createLinearGradient(0, -52, 0, 18);
      g.addColorStop(0, '#ffd05a');
      g.addColorStop(0.45, spec.color);
      g.addColorStop(1, spec.color2);

      ctx.fillStyle = spec.trim;
      roundRect(ctx, -half - 5, 4, spec.bodyW + 10, 13, 5);
      ctx.fill();
      ctx.fillStyle = '#171d20';
      roundRect(ctx, half - 4, 0, 12, 15, 3);
      ctx.fill();
      roundRect(ctx, -half - 7, 3, 10, 13, 3);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-half + 4, -8);
      ctx.quadraticCurveTo(-half - 2, -8, -half - 2, 2);
      ctx.lineTo(-half - 2, 8);
      ctx.lineTo(half + 2, 8);
      ctx.lineTo(half + 4, -2);
      ctx.quadraticCurveTo(half + 4, -8, half - 2, -8);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(94, 47, 7, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-30, -8);
      ctx.lineTo(-30, -39);
      ctx.quadraticCurveTo(-30, -48, -19, -48);
      ctx.lineTo(12, -48);
      ctx.quadraticCurveTo(24, -48, 31, -36);
      ctx.lineTo(39, -8);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(94, 47, 7, 0.3)';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-23, -12);
      ctx.lineTo(-23, -38);
      ctx.quadraticCurveTo(-23, -42, -18, -42);
      ctx.lineTo(11, -42);
      ctx.quadraticCurveTo(19, -42, 24, -33);
      ctx.lineTo(31, -12);
      ctx.closePath();
      const glass = ctx.createLinearGradient(0, -42, 0, -10);
      glass.addColorStop(0, '#a8d8df');
      glass.addColorStop(1, '#3f7482');
      ctx.fillStyle = glass;
      ctx.fill();
      ctx.strokeStyle = 'rgba(25, 51, 58, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.strokeStyle = spec.trim;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(-26, -12);
      ctx.lineTo(-26, -43);
      ctx.quadraticCurveTo(-26, -51, -17, -51);
      ctx.lineTo(13, -51);
      ctx.quadraticCurveTo(25, -51, 32, -37);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 231, 166, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-20, -39);
      ctx.lineTo(13, -39);
      ctx.lineTo(20, -29);
      ctx.stroke();

      ctx.save();
      ctx.translate(-2, -33);
      ctx.fillStyle = spec.seat;
      ctx.beginPath();
      ctx.ellipse(0, 9, 8, 7, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 7.2, 0, TAU);
      ctx.fillStyle = '#f2c59e';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-1.5, -2.3, 7.8, Math.PI, TAU);
      ctx.lineTo(6.2, -1);
      ctx.quadraticCurveTo(0, -8, -8.5, -1);
      ctx.closePath();
      ctx.fillStyle = '#e5563e';
      ctx.fill();
      ctx.strokeStyle = '#9f2f24';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#2d3e46';
      ctx.beginPath();
      ctx.ellipse(4.4, -1.4, 3.1, 1.8, -0.2, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = spec.trim;
      ctx.beginPath();
      ctx.moveTo(19, -8);
      ctx.lineTo(45, -8);
      ctx.quadraticCurveTo(50, -8, 50, -3);
      ctx.lineTo(50, 4);
      ctx.lineTo(19, 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffe7a0';
      ctx.beginPath();
      ctx.arc(half - 6, -2, 4.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#b17817';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#ff7a43';
      ctx.beginPath();
      ctx.arc(-half + 5, -2, 2.6, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = 'rgba(95, 49, 8, 0.36)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-15, -9);
      ctx.lineTo(-15, 6);
      ctx.moveTo(12, -9);
      ctx.lineTo(12, 6);
      ctx.stroke();
      ctx.fillStyle = spec.trim;
      ctx.fillRect(-12, -2, 6, 2.2);

      ctx.strokeStyle = spec.trim;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-half + 3, 6);
      ctx.lineTo(-half - 9, 6);
      ctx.moveTo(half - 1, 6);
      ctx.lineTo(half + 11, 6);
      ctx.stroke();
      ctx.fillStyle = '#d7e1e5';
      ctx.beginPath();
      ctx.arc(-half - 9, 6, 2.5, 0, TAU);
      ctx.arc(half + 11, 6, 2.5, 0, TAU);
      ctx.fill();

      ctx.save();
      ctx.translate(-13, -15);
      ctx.rotate(-0.05);
      ctx.fillStyle = 'rgba(255, 249, 226, 0.86)';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#35505b';
      ctx.font = '900 8px "Arial Black", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('3', 0, 0.5);
      ctx.restore();

      ctx.strokeStyle = spec.trim;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-half - 2, -3);
      ctx.quadraticCurveTo(-half - 13, -3, -half - 13, 4);
      ctx.lineTo(-half - 13, 11);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(190, 205, 209, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(-half - 13, 7, 2, 0, TAU);
      ctx.stroke();
    }

    drawMonsterBody(ctx, spec) {
      const half = spec.bodyW * 0.5;
      const g = ctx.createLinearGradient(0, -58, 0, 20);
      g.addColorStop(0, '#ff7462');
      g.addColorStop(0.42, spec.color);
      g.addColorStop(1, spec.color2);

      ctx.fillStyle = '#141b1f';
      roundRect(ctx, -half - 7, 6, spec.bodyW + 14, 16, 6);
      ctx.fill();
      ctx.fillStyle = '#3b4449';
      roundRect(ctx, -half - 3, 10, spec.bodyW + 6, 5, 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-half + 7, -12);
      ctx.quadraticCurveTo(-half - 4, -12, -half - 4, 1);
      ctx.lineTo(-half - 4, 10);
      ctx.lineTo(half + 4, 10);
      ctx.lineTo(half + 6, -4);
      ctx.quadraticCurveTo(half + 6, -12, half - 4, -12);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(77, 16, 20, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-34, -12);
      ctx.lineTo(-34, -49);
      ctx.quadraticCurveTo(-34, -60, -21, -60);
      ctx.lineTo(16, -60);
      ctx.quadraticCurveTo(30, -60, 37, -46);
      ctx.lineTo(45, -12);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(77, 16, 20, 0.35)';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-27, -16);
      ctx.lineTo(-27, -48);
      ctx.quadraticCurveTo(-27, -54, -20, -54);
      ctx.lineTo(15, -54);
      ctx.quadraticCurveTo(24, -54, 30, -43);
      ctx.lineTo(37, -16);
      ctx.closePath();
      const glass = ctx.createLinearGradient(0, -54, 0, -14);
      glass.addColorStop(0, '#b9dfe2');
      glass.addColorStop(1, '#3e6c76');
      ctx.fillStyle = glass;
      ctx.fill();
      ctx.strokeStyle = 'rgba(26, 48, 53, 0.55)';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.strokeStyle = '#202a2f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-30, -15);
      ctx.lineTo(-30, -54);
      ctx.quadraticCurveTo(-30, -63, -19, -63);
      ctx.lineTo(17, -63);
      ctx.quadraticCurveTo(31, -63, 39, -46);
      ctx.stroke();

      ctx.fillStyle = '#222d32';
      roundRect(ctx, -27, -69, 50, 7, 3);
      ctx.fill();
      ctx.fillStyle = '#ffe47a';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(-20 + i * 12, -65.5, 2.6, 0, TAU);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(-2, -40);
      ctx.fillStyle = spec.seat;
      ctx.beginPath();
      ctx.ellipse(0, 10, 9, 8, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, TAU);
      ctx.fillStyle = '#efc29b';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-1.5, -2.2, 8.2, Math.PI, TAU);
      ctx.lineTo(6.5, -0.5);
      ctx.quadraticCurveTo(0, -8.5, -9, -0.5);
      ctx.closePath();
      ctx.fillStyle = '#e9c443';
      ctx.fill();
      ctx.strokeStyle = '#9a6d13';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#29363c';
      ctx.beginPath();
      ctx.ellipse(4.7, -1.2, 3.4, 1.9, -0.2, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#202b30';
      roundRect(ctx, half - 4, -7, 14, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#ffe7a0';
      ctx.beginPath();
      ctx.arc(half - 3, -1, 4.4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#b17817';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(89, 20, 22, 0.38)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-18, -13);
      ctx.lineTo(-18, 7);
      ctx.moveTo(13, -13);
      ctx.lineTo(13, 7);
      ctx.stroke();

      ctx.save();
      ctx.translate(-16, -20);
      ctx.fillStyle = 'rgba(255, 249, 226, 0.88)';
      ctx.beginPath();
      ctx.arc(0, 0, 6.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#4c1f21';
      ctx.font = '900 8px "Arial Black", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('3', 0, 0.5);
      ctx.restore();

      ctx.strokeStyle = '#2a3439';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(-half - 3, 7);
      ctx.lineTo(-half - 12, 7);
      ctx.moveTo(half + 2, 7);
      ctx.lineTo(half + 13, 7);
      ctx.stroke();
    }

    drawBuggyBody(ctx, spec) {
      const half = spec.bodyW * 0.5;
      const g = ctx.createLinearGradient(0, -46, 0, 16);
      g.addColorStop(0, '#8af2f8');
      g.addColorStop(0.4, spec.color);
      g.addColorStop(1, spec.color2);

      ctx.fillStyle = '#1b252b';
      roundRect(ctx, -half - 2, 4, spec.bodyW + 4, 12, 5);
      ctx.fill();
      ctx.fillStyle = '#596a70';
      roundRect(ctx, -half + 2, 6, spec.bodyW - 4, 3, 1.5);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-half + 2, -3);
      ctx.lineTo(-30, -15);
      ctx.lineTo(17, -15);
      ctx.lineTo(half - 4, -4);
      ctx.lineTo(half - 2, 10);
      ctx.lineTo(-half + 3, 10);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(10, 77, 94, 0.4)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.strokeStyle = '#1d2d34';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-34, -14);
      ctx.lineTo(-38, -47);
      ctx.quadraticCurveTo(-38, -55, -29, -55);
      ctx.lineTo(16, -55);
      ctx.quadraticCurveTo(27, -55, 31, -42);
      ctx.lineTo(36, -12);
      ctx.moveTo(-29, -54);
      ctx.lineTo(28, -27);
      ctx.moveTo(20, -53);
      ctx.lineTo(-22, -24);
      ctx.stroke();

      ctx.strokeStyle = '#6a8189';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-34, -14);
      ctx.lineTo(-38, -47);
      ctx.moveTo(36, -12);
      ctx.lineTo(31, -42);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-28, -18);
      ctx.lineTo(-28, -47);
      ctx.quadraticCurveTo(-28, -51, -23, -51);
      ctx.lineTo(14, -51);
      ctx.quadraticCurveTo(22, -51, 25, -43);
      ctx.lineTo(30, -18);
      ctx.closePath();
      const glass = ctx.createLinearGradient(0, -51, 0, -16);
      glass.addColorStop(0, 'rgba(190, 238, 239, 0.9)');
      glass.addColorStop(1, 'rgba(47, 108, 118, 0.75)');
      ctx.fillStyle = glass;
      ctx.fill();

      ctx.save();
      ctx.translate(-2, -37);
      ctx.fillStyle = spec.seat;
      ctx.beginPath();
      ctx.ellipse(0, 10, 8, 7, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 7.2, 0, TAU);
      ctx.fillStyle = '#eec49d';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-1.5, -2.3, 7.9, Math.PI, TAU);
      ctx.lineTo(6.3, -0.7);
      ctx.quadraticCurveTo(0, -8.5, -8.7, -0.7);
      ctx.closePath();
      ctx.fillStyle = '#f0e8d8';
      ctx.fill();
      ctx.strokeStyle = '#9c9483';
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.fillStyle = '#28383e';
      ctx.beginPath();
      ctx.ellipse(4.5, -1.2, 3.2, 1.8, -0.2, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#243139';
      roundRect(ctx, -half + 1, -10, 28, 15, 4);
      ctx.fill();
      ctx.strokeStyle = '#72858c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-half + 6, -7);
      ctx.lineTo(-half + 22, -7);
      ctx.moveTo(-half + 6, -3);
      ctx.lineTo(-half + 19, -3);
      ctx.stroke();

      ctx.fillStyle = '#26353c';
      roundRect(ctx, half - 19, -6, 17, 12, 3);
      ctx.fill();
      ctx.fillStyle = '#ffe7a0';
      ctx.beginPath();
      ctx.arc(half - 10, -1, 3.4, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = '#f4f2e8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(19, -16);
      ctx.lineTo(33, -16);
      ctx.lineTo(40, -3);
      ctx.stroke();

      ctx.save();
      ctx.translate(-17, -21);
      ctx.fillStyle = 'rgba(255, 249, 226, 0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#145568';
      ctx.font = '900 8px "Arial Black", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('3', 0, 0.5);
      ctx.restore();

      ctx.strokeStyle = '#24343a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-half + 2, 7);
      ctx.lineTo(-half - 9, 7);
      ctx.moveTo(half - 1, 7);
      ctx.lineTo(half + 10, 7);
      ctx.stroke();
      ctx.fillStyle = '#d7e1e5';
      ctx.beginPath();
      ctx.arc(-half - 9, 7, 2.2, 0, TAU);
      ctx.arc(half + 10, 7, 2.2, 0, TAU);
      ctx.fill();
    }

    drawVignette(ctx) {
      const { W, H } = this;
      const vignette = ctx.createRadialGradient(W * 0.5, H * 0.48, Math.min(W, H) * 0.32, W * 0.5, H * 0.48, Math.max(W, H) * 0.72);
      vignette.addColorStop(0, 'rgba(5, 20, 32, 0)');
      vignette.addColorStop(0.7, 'rgba(5, 20, 32, 0.06)');
      vignette.addColorStop(1, 'rgba(5, 20, 32, 0.32)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
    }
  }

  const game = new Game();
  window.hcrGame = game;
})();
