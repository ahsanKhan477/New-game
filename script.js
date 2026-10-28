/* =========================================================
   ROAD FIGHTER — game.js
   Classic arcade road racer, mobile first.
   Vanilla JS + Canvas. No external assets, no backend.
   ========================================================= */

(function () {
  'use strict';

  /* =======================================================
     UTILITIES
     ======================================================= */

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;

  function hash(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
    return x - Math.floor(x);
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    if (amt >= 0) {
      r += (255 - r) * amt;
      g += (255 - g) * amt;
      b += (255 - b) * amt;
    } else {
      r *= 1 + amt;
      g *= 1 + amt;
      b *= 1 + amt;
    }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }

  /* =======================================================
     CANVAS & LAYOUT
     ======================================================= */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  let VW = 360;      // viewport width  (css px)
  let VH = 760;      // viewport height (css px)
  let S = 1;         // css px per logical unit
  let W = 360;       // logical width
  let H = 760;       // logical height
  let roadX = 0;
  let roadW = 300;
  let laneW = 75;
  const LANES = 4;
  let carW = 46;
  let carH = 82;

  /* =======================================================
     GAME CONSTANTS & STATE
     ======================================================= */

  const MIN_SPEED = 380;
  const MAX_SPEED = 1000;
  const SPEED_RAMP = 7.5;

  const PLAYER_COLOR = '#e63946';
  const ENEMY_COLORS = ['#3d7bff', '#ffd23f', '#3ddc84', '#b06cff', '#ff8c42', '#eef2f7', '#ff5fa2'];

  const G = {
    mode: 'menu',       // 'menu' | 'playing' | 'paused' | 'over'
    dist: 0,
    speed: MIN_SPEED,
    fuel: 100,
    bonus: 0,
    score: 0,
    best: 0,
    spawnTimer: 0,
    fuelTimer: 0,
    shake: 0,
    time: 0,
    overReason: 'GAME OVER'
  };

  const player = {
    x: 0,
    y: 0,
    w: 46,
    h: 82,
    targetX: 0,
    tilt: 0
  };

  let enemies = [];
  let pickups = [];
  let particles = [];

  const hudCache = { score: -1, speed: -1, fuel: -1 };

  /* =======================================================
     DOM REFERENCES
     ======================================================= */

  const elHud = document.getElementById('hud');
  const elScore = document.getElementById('score');
  const elSpeed = document.getElementById('speed');
  const elFuelFill = document.getElementById('fuelFill');
  const elBtnPause = document.getElementById('btnPause');
  const elBtnSound = document.getElementById('btnSound');
  const elIcoOn = document.getElementById('icoSoundOn');
  const elIcoOff = document.getElementById('icoSoundOff');

  const elStart = document.getElementById('screen-start');
  const elPause = document.getElementById('screen-pause');
  const elOver = document.getElementById('screen-over');

  const elBtnStart = document.getElementById('btnStart');
  const elBtnResume = document.getElementById('btnResume');
  const elBtnQuit = document.getElementById('btnQuit');
  const elBtnRetry = document.getElementById('btnRetry');
  const elBtnMenu = document.getElementById('btnMenu');

  const elStartBest = document.getElementById('startBest');
  const elFinalScore = document.getElementById('finalScore');
  const elFinalBest = document.getElementById('finalBest');
  const elOverReason = document.getElementById('overReason');

  /* =======================================================
     RESIZE / RESPONSIVE LAYOUT
     ======================================================= */

  function resize() {
    VW = Math.max(1, window.innerWidth);
    VH = Math.max(1, window.innerHeight);

    // Target ~760 logical units of vertical view
    S = VH / 760;
    W = VW / S;

    // Cap logical width on very wide (landscape) screens so the
    // road never becomes absurdly wide.
    const MAX_W = 620;
    if (W > MAX_W) {
      W = MAX_W;
      S = VW / W;
    }
    H = VH / S;

    // Road occupies 80% of the logical width (max 470 units)
    roadW = Math.min(W * 0.8, 470);
    roadX = (W - roadW) / 2;
    laneW = roadW / LANES;

    carW = laneW * 0.62;
    carH = carW * 1.78;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(VW * dpr);
    canvas.height = Math.round(VH * dpr);
    canvas.style.width = VW + 'px';
    canvas.style.height = VH + 'px';
    ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);

    // Re-position player for the new layout
    player.w = carW;
    player.h = carH;
    player.y = H * 0.76;
    const minX = roadX + player.w / 2 + 3;
    const maxX = roadX + roadW - player.w / 2 - 3;
    player.x = clamp(player.x || (roadX + roadW / 2), minX, maxX);
    player.targetX = clamp(player.targetX || player.x, minX, maxX);

    // Keep enemies proportional after a resize
    for (const e of enemies) {
      const ratio = e.w / carW;
      e.w = carW * ratio;
      e.h = e.w * 1.78;
      e.x = clamp(e.x, roadX + e.w / 2, roadX + roadW - e.w / 2);
    }
  }

  /* =======================================================
     AUDIO (WebAudio — zero external assets)
     ======================================================= */

  let actx = null;
  let masterGain = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let engineTimer = 0;
  let soundOn = true;

  function initAudio() {
    if (actx) {
      if (actx.state === 'suspended') actx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      actx = new AC();
      masterGain = actx.createGain();
      masterGain.gain.value = soundOn ? 0.55 : 0;
      masterGain.connect(actx.destination);
      startEngineNode();
    } catch (err) {
      actx = null;
    }
  }

  function startEngineNode() {
    if (!actx || engineOsc) return;
    engineOsc = actx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 58;

    engineFilter = actx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 380;

    engineGain = actx.createGain();
    engineGain.gain.value = 0.0;

    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);
    engineOsc.start();
  }

  function updateEngine(dt) {
    if (!actx || !engineOsc || !engineGain) return;
    engineTimer -= dt;
    if (engineTimer > 0) return;
    engineTimer = 0.09;

    const t = actx.currentTime;
    const ratio = clamp((G.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED), 0, 1);
    const playing = G.mode === 'playing';

    const freq = playing ? 58 + ratio * 78 : 44;
    engineOsc.frequency.setTargetAtTime(freq, t, 0.12);
    engineFilter.frequency.setTargetAtTime(320 + ratio * 1100, t, 0.15);
    engineGain.gain.setTargetAtTime(playing ? 0.055 : 0.015, t, 0.2);
  }

  function tone(freq, dur, type, vol, delay) {
    if (!actx || !soundOn) return;
    const t0 = actx.currentTime + (delay || 0);
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function sfxStart() {
    tone(392, 0.12, 'square', 0.16, 0);
    tone(523, 0.12, 'square', 0.16, 0.1);
    tone(784, 0.2, 'square', 0.16, 0.2);
  }

  function sfxPickup() {
    tone(880, 0.08, 'sine', 0.22, 0);
    tone(1320, 0.12, 'sine', 0.2, 0.07);
  }

  function sfxCrash() {
    if (!actx || !soundOn) return;
    const dur = 0.65;
    const len = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const k = 1 - i / len;
      data[i] = (Math.random() * 2 - 1) * k * k * k;
    }
    const src = actx.createBufferSource();
    src.buffer = buf;
    const flt = actx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 1700;
    const g = actx.createGain();
    g.gain.value = 0.65;
    src.connect(flt);
    flt.connect(g);
    g.connect(masterGain);
    src.start();
    tone(90, 0.4, 'sawtooth', 0.18, 0);
  }

  function setSound(on) {
    soundOn = on;
    if (masterGain && actx) {
      masterGain.gain.setTargetAtTime(on ? 0.55 : 0, actx.currentTime, 0.05);
    }
    elIcoOn.style.display = on ? 'block' : 'none';
    elIcoOff.style.display = on ? 'none' : 'block';
  }

  /* =======================================================
     WORLD SPAWNING
     ======================================================= */

  function spawnEnemy() {
    const lane = (Math.random() * LANES) | 0;
    const cx = roadX + laneW * (lane + 0.5);

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (Math.abs(e.x - cx) < laneW * 0.78 && e.y < carH * 2.8) return;
    }

    const w = carW * rand(0.92, 1.06);
    const h = w * 1.78;

    enemies.push({
      x: cx,
      y: -h * 0.5 - 12,
      w: w,
      h: h,
      rel: rand(0.42, 0.72),
      color: ENEMY_COLORS[(Math.random() * ENEMY_COLORS.length) | 0]
    });
  }

  function spawnPickup() {
    const lane = (Math.random() * LANES) | 0;
    const cx = roadX + laneW * (lane + 0.5);

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (Math.abs(e.x - cx) < laneW * 0.78 && e.y < carH * 2.8) return;
    }
    for (let i = 0; i < pickups.length; i++) {
      if (Math.abs(pickups[i].x - cx) < laneW * 0.78) return;
    }

    const w = carW * 0.72;
    pickups.push({
      x: cx,
      y: -46,
      w: w,
      h: w * 1.12,
      t: Math.random() * 6
    });
  }

  /* =======================================================
     COLLISION
     ======================================================= */

  function hits(a, b, f) {
    if (f === undefined) f = 0.42;
    return (
      Math.abs(a.x - b.x) < (a.w + b.w) * f &&
      Math.abs(a.y - b.y) < (a.h + b.h) * f
    );
  }

  /* =======================================================
     PARTICLES
     ======================================================= */

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(60, 320);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 70,
        life: rand(0.35, 0.95),
        size: rand(2, 6.5),
        color: color
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 280 * dt;
      p.vx *= 1 - 1.4 * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = clamp(p.life / 0.6, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* =======================================================
     UPDATE — PLAYING
     ======================================================= */

  function updatePlayer(dt) {
    if (keys.left) player.targetX -= 520 * dt;
    if (keys.right) player.targetX += 520 * dt;

    const minX = roadX + player.w / 2 + 3;
    const maxX = roadX + roadW - player.w / 2 - 3;
    player.targetX = clamp(player.targetX, minX, maxX);

    const prev = player.x;
    const k = Math.min(1, dt * 13);
    player.x += (player.targetX - player.x) * k;

    const vx = (player.x - prev) / Math.max(dt, 0.0001);
    player.tilt = lerp(player.tilt, clamp(vx * 0.00055, -0.17, 0.17), Math.min(1, dt * 14));
  }

  function updateEnemies(dt, frozen) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];

      if (!frozen) e.y += G.speed * (1 - e.rel) * dt;

      if (e.y > H + e.h * 2.5) {
        enemies.splice(i, 1);
        continue;
      }

      if (!frozen && hits(player, e)) {
        crash();
        return;
      }
    }
  }

  function updatePickups(dt) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.y += G.speed * dt;
      p.t += dt * 4;

      if (p.y > H + 70) {
        pickups.splice(i, 1);
        continue;
      }

      if (hits(player, p, 0.55)) {
        G.fuel = Math.min(100, G.fuel + 25);
        G.bonus += 250;
        burst(p.x, p.y, '#ffd23f', 16);
        burst(p.x, p.y, '#fff4b8', 8);
        sfxPickup();
        pickups.splice(i, 1);
      }
    }
  }

  function updatePlaying(dt) {
    G.time += dt;

    // Speed ramp
    G.speed = Math.min(MAX_SPEED, G.speed + SPEED_RAMP * dt);
    G.dist += G.speed * dt;

    const ratio = clamp((G.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED), 0, 1);
    G.score = Math.floor(G.dist / 12) + G.bonus;

    // Fuel burn
    G.fuel -= (1.8 + 2.4 * ratio) * dt;
    if (G.fuel <= 0) {
      G.fuel = 0;
      gameOver('OUT OF FUEL');
      return;
    }

    updatePlayer(dt);

    // Enemy spawning
    G.spawnTimer -= dt;
    if (G.spawnTimer <= 0) {
      spawnEnemy();
      G.spawnTimer = lerp(1.35, 0.5, ratio) * rand(0.75, 1.3);
    }

    // Fuel spawning
    G.fuelTimer -= dt;
    if (G.fuelTimer <= 0) {
      spawnPickup();
      G.fuelTimer = rand(7, 12);
    }

    updateEnemies(dt, false);
    updatePickups(dt);
    updateParticles(dt);
    updateHUD();
  }

  /* =======================================================
     RENDER
     ======================================================= */

  function drawRoad() {
    // Grass base
    ctx.fillStyle = '#1c6b36';
    ctx.fillRect(-40, -40, W + 80, H + 80);

    // Scrolling grass bands
    const band = 95;
    const cycle = band * 2;
    const off = G.dist % cycle;
    ctx.fillStyle = '#175c2e';
    for (let y = off - cycle; y < H + cycle; y += cycle) {
      ctx.fillRect(-40, y, W + 80, band);
    }

    // Asphalt
    ctx.fillStyle = '#3b4048';
    ctx.fillRect(roadX, -40, roadW, H + 80);

    // Subtle asphalt shading
    const grad = ctx.createLinearGradient(roadX, 0, roadX + roadW, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.22)');
    grad.addColorStop(0.12, 'rgba(0,0,0,0)');
    grad.addColorStop(0.88, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(roadX, -40, roadW, H + 80);

    // Edge lines
    const edgeW = Math.max(3, roadW * 0.014);
    ctx.fillStyle = '#e9edf2';
    ctx.fillRect(roadX + roadW * 0.02, -40, edgeW, H + 80);
    ctx.fillRect(roadX + roadW - roadW * 0.02 - edgeW, -40, edgeW, H + 80);

    // Lane dashes
    const dashCycle = 130;
    const dashLen = dashCycle * 0.45;
    const dashW = Math.max(3, roadW * 0.013);
    const dashOff = G.dist % dashCycle;
    ctx.fillStyle = 'rgba(238,242,247,0.85)';
    for (let i = 1; i < LANES; i++) {
      const x = roadX + i * laneW - dashW / 2;
      for (let y = dashOff - dashCycle; y < H + dashCycle; y += dashCycle) {
        ctx.fillRect(x, y, dashW, dashLen);
      }
    }
  }

  function drawTree(x, y, s) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.06, s * 0.62, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4a3320';
    ctx.fillRect(x - s * 0.085, y - s * 0.36, s * 0.17, s * 0.42);

    const greens = ['#0f5c2a', '#127a35', '#0b4a22'];
    for (let k = 0; k < 3; k++) {
      const w = s * (1.05 - k * 0.26);
      const yy = y - s * 0.3 - k * s * 0.29;
      ctx.fillStyle = greens[k];
      ctx.beginPath();
      ctx.moveTo(x, yy - s * 0.64);
      ctx.lineTo(x - w * 0.55, yy);
      ctx.lineTo(x + w * 0.55, yy);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawRock(x, y, s) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.1, s * 0.72, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#68707c';
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.7, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8b95a3';
    ctx.beginPath();
    ctx.ellipse(x - s * 0.16, y - s * 0.14, s * 0.4, s * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSideProp(y, idx, side) {
    const margin = roadX;
    if (margin < 14) return;

    const h1 = hash(idx * 1.7 + side * 13.3);
    const h2 = hash(idx * 4.1 + side * 7.7 + 5.1);
    const h3 = hash(idx * 9.3 + side * 3.1 + 17.7);

    const s = laneW * (0.2 + 0.22 * h3);
    const halfW = s * 0.62;
    const usable = Math.max(0, margin - halfW * 2 - 6);

    const cx = side === 0
      ? halfW + 5 + usable * h1
      : roadX + roadW + halfW + 5 + usable * h1;

    if (h2 < 0.74) {
      drawTree(cx, y, s);
    } else {
      drawRock(cx, y, s * 0.85);
    }
  }

  function drawRoadside() {
    const period = 200;
    const D = G.dist + H;
    const base = D % period;
    for (let y = base - period * 2; y < H + period; y += period) {
      const idx = Math.round((D - y) / period);
      drawSideProp(y, idx, 0);
      drawSideProp(y, idx, 1);
    }
  }

  function drawCar(cx, cy, w, h, color, opts) {
    opts = opts || {};
    const x = cx - w / 2;
    const y = cy - h / 2;
    const r = w * 0.24;

    ctx.save();
    if (opts.tilt) {
      ctx.translate(cx, cy);
      ctx.rotate(opts.tilt);
      ctx.translate(-cx, -cy);
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    roundRect(ctx, x + w * 0.07, y + h * 0.05, w, h, r);
    ctx.fill();

    // Wheels
    const ww = w * 0.17;
    const wh = h * 0.19;
    ctx.fillStyle = '#14171c';
    roundRect(ctx, x - ww * 0.42, y + h * 0.13, ww, wh, ww * 0.32); ctx.fill();
    roundRect(ctx, x + w - ww * 0.58, y + h * 0.13, ww, wh, ww * 0.32); ctx.fill();
    roundRect(ctx, x - ww * 0.42, y + h * 0.68, ww, wh, ww * 0.32); ctx.fill();
    roundRect(ctx, x + w - ww * 0.58, y + h * 0.68, ww, wh, ww * 0.32); ctx.fill();

    // Body
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0.0, shade(color, -0.4));
    grad.addColorStop(0.28, color);
    grad.addColorStop(0.55, shade(color, 0.24));
    grad.addColorStop(1.0, shade(color, -0.44));
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();

    // Roof
    ctx.fillStyle = shade(color, -0.14);
    roundRect(ctx, x + w * 0.19, y + h * 0.3, w * 0.62, h * 0.38, w * 0.1);
    ctx.fill();

    // Windshield
    ctx.fillStyle = 'rgba(18,26,38,0.92)';
    roundRect(ctx, x + w * 0.17, y + h * 0.12, w * 0.66, h * 0.15, w * 0.07);
    ctx.fill();

    // Rear window
    roundRect(ctx, x + w * 0.19, y + h * 0.72, w * 0.62, h * 0.13, w * 0.07);
    ctx.fill();

    // Headlights
    ctx.fillStyle = '#fff6c8';
    roundRect(ctx, x + w * 0.12, y + h * 0.015, w * 0.18, h * 0.045, w * 0.03); ctx.fill();
    roundRect(ctx, x + w * 0.7, y + h * 0.015, w * 0.18, h * 0.045, w * 0.03); ctx.fill();

    // Taillights
    ctx.fillStyle = '#ff3b3b';
    roundRect(ctx, x + w * 0.1, y + h * 0.935, w * 0.2, h * 0.04, w * 0.02); ctx.fill();
    roundRect(ctx, x + w * 0.7, y + h * 0.935, w * 0.2, h * 0.04, w * 0.02); ctx.fill();

    ctx.restore();
  }

  function drawPlayerCar() {
    drawCar(player.x, player.y, player.w, player.h, PLAYER_COLOR, { tilt: player.tilt });
  }

  function drawEnemies() {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      drawCar(e.x, e.y, e.w, e.h, e.color);
    }
  }

  function drawPickups() {
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i];
      const glow = 0.55 + 0.45 * Math.sin(p.t);
      const w = p.w;
      const h = p.h;

      ctx.save();
      ctx.translate(p.x, p.y);

      // Glow halo
      ctx.globalAlpha = 0.25 * glow;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(ctx, -w / 2 + w * 0.08, -h / 2 + h * 0.08, w, h, w * 0.2);
      ctx.fill();

      // Can body
      ctx.fillStyle = '#ffb703';
      roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.2);
      ctx.fill();

      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(ctx, -w * 0.34, -h * 0.36, w * 0.2, h * 0.6, w * 0.08);
      ctx.fill();

      // Spout
      ctx.fillStyle = '#c47f00';
      roundRect(ctx, w * 0.06, -h * 0.62, w * 0.3, h * 0.16, w * 0.06);
      ctx.fill();

      // Fuel drop symbol
      ctx.fillStyle = '#5a3200';
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.1);
      ctx.quadraticCurveTo(w * 0.2, h * 0.08, 0, h * 0.26);
      ctx.quadraticCurveTo(-w * 0.2, h * 0.08, 0, -h * 0.1);
      ctx.fill();

      ctx.restore();
    }
  }

  function render() {
    // Base fill so screen shake never reveals empty pixels
    ctx.fillStyle = '#1c6b36';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (G.shake > 0.001) {
      const s = G.shake * 15;
      ctx.translate(rand(-s, s), rand(-s, s));
    }

    drawRoad();
    drawRoadside();
    drawPickups();
    drawEnemies();
    if (G.mode !== 'over') drawPlayerCar();
    drawParticles();

    ctx.restore();
  }

  /* =======================================================
     HUD
     ======================================================= */

  function updateHUD(force) {
    const sc = G.score | 0;
    if (force || hudCache.score !== sc) {
      hudCache.score = sc;
      elScore.textContent = sc;
    }

    const kmh = Math.round(G.speed / 4);
    if (force || hudCache.speed !== kmh) {
      hudCache.speed = kmh;
      elSpeed.textContent = kmh + ' KM/H';
    }

    const f = Math.round(G.fuel);
    if (force || hudCache.fuel !== f) {
      hudCache.fuel = f;
      elFuelFill.style.width = f + '%';
      if (f <= 25) elFuelFill.classList.add('low');
      else elFuelFill.classList.remove('low');
    }
  }

  /* =======================================================
     GAME FLOW
     ======================================================= */

  function loadBest() {
    try {
      G.best = parseInt(localStorage.getItem('roadfighter_best') || '0', 10) || 0;
    } catch (err) {
      G.best = 0;
    }
  }

  function saveBest() {
    if (G.score > G.best) {
      G.best = G.score;
      try {
        localStorage.setItem('roadfighter_best', String(G.best));
      } catch (err) { /* ignore */ }
    }
  }

  function showStartScreen() {
    G.mode = 'menu';
    elHud.classList.add('hidden');
    elStart.classList.remove('hidden');
    elPause.classList.add('hidden');
    elOver.classList.add('hidden');
    elStartBest.textContent = G.best;
  }

  function startGame() {
    initAudio();
    resize();

    G.mode = 'playing';
    G.dist = 0;
    G.speed = MIN_SPEED;
    G.fuel = 100;
    G.bonus = 0;
    G.score = 0;
    G.spawnTimer = 1.1;
    G.fuelTimer = 4.5;
    G.shake = 0;
    G.time = 0;

    enemies = [];
    pickups = [];
    particles = [];

    player.x = roadX + roadW / 2;
    player.targetX = player.x;
    player.tilt = 0;

    hudCache.score = -1;
    hudCache.speed = -1;
    hudCache.fuel = -1;

    elStart.classList.add('hidden');
    elPause.classList.add('hidden');
    elOver.classList.add('hidden');
    elHud.classList.remove('hidden');

    updateHUD(true);
    sfxStart();
  }

  function crash() {
    if (G.mode !== 'playing') return;
    G.mode = 'over';
    G.overReason = 'CRASHED';
    G.shake = 1;

    burst(player.x, player.y - player.h * 0.1, '#ff6b35', 34);
    burst(player.x, player.y - player.h * 0.1, '#ffd23f', 24);
    burst(player.x, player.y, '#e63946', 22);
    sfxCrash();

    finishGame();
  }

  function gameOver(reason) {
    if (G.mode !== 'playing') return;
    G.mode = 'over';
    G.overReason = reason;
    G.shake = 0.5;
    burst(player.x, player.y, '#9aa4b2', 18);
    finishGame();
  }

  function finishGame() {
    saveBest();
    elOverReason.textContent = G.overReason;
    elFinalScore.textContent = G.score;
    elFinalBest.textContent = G.best;

    setTimeout(function () {
      if (G.mode === 'over') {
        elOver.classList.remove('hidden');
        elHud.classList.add('hidden');
      }
    }, 620);
  }

  function togglePause() {
    if (G.mode === 'playing') {
      G.mode = 'paused';
      elPause.classList.remove('hidden');
    } else if (G.mode === 'paused') {
      G.mode = 'playing';
      elPause.classList.add('hidden');
    }
  }

  /* =======================================================
     INPUT
     ======================================================= */

  const keys = { left: false, right: false };
  let drag = null;

  function clampTargetX(v) {
    const minX = roadX + player.w / 2 + 3;
    const maxX = roadX + roadW - player.w / 2 - 3;
    return clamp(v, minX, maxX);
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (G.mode !== 'playing') return;
    if (drag) return;
    drag = {
      id: e.pointerId,
      startX: e.clientX,
      startPlayerX: player.targetX
    };
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
  }, { passive: true });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.startX) / S;
    player.targetX = clampTargetX(drag.startPlayerX + dx);
  }, { passive: true });

  function endDrag(e) {
    if (drag && e.pointerId === drag.id) drag = null;
  }
  canvas.addEventListener('pointerup', endDrag, { passive: true });
  canvas.addEventListener('pointercancel', endDrag, { passive: true });
  canvas.addEventListener('pointerleave', endDrag, { passive: true });

  window.addEventListener('keydown', function (e) {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
      keys.left = true;
      e.preventDefault();
    } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
      keys.right = true;
      e.preventDefault();
    } else if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (G.mode === 'menu') startGame();
      else if (G.mode === 'over') startGame();
      else if (G.mode === 'paused') togglePause();
    } else if (k === 'Escape' || k === 'p' || k === 'P') {
      if (G.mode === 'playing' || G.mode === 'paused') togglePause();
    }
  });

  window.addEventListener('keyup', function (e) {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
  });

  /* =======================================================
     UI EVENTS
     ======================================================= */

  elBtnStart.addEventListener('click', startGame);
  elBtnRetry.addEventListener('click', startGame);
  elBtnResume.addEventListener('click', togglePause);
  elBtnPause.addEventListener('click', togglePause);

  elBtnQuit.addEventListener('click', function () {
    elPause.classList.add('hidden');
    showStartScreen();
  });

  elBtnMenu.addEventListener('click', function () {
    elOver.classList.add('hidden');
    showStartScreen();
  });

  elBtnSound.addEventListener('click', function () {
    initAudio();
    setSound(!soundOn);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.mode === 'playing') togglePause();
  });

  window.addEventListener('blur', function () {
    if (G.mode === 'playing') togglePause();
  });

  /* =======================================================
     MAIN LOOP
     ======================================================= */

  let lastT = 0;

  function frame(t) {
    let dt = (t - lastT) / 1000;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);
    lastT = t;

    if (G.mode === 'playing') {
      updatePlaying(dt);
    } else if (G.mode === 'menu') {
      G.dist += 210 * dt;
      updateParticles(dt);
    } else {
      updateParticles(dt);
    }

    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.2);

    updateEngine(dt);
    render();

    requestAnimationFrame(frame);
  }

  /* =======================================================
     INIT
     ======================================================= */

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      updateHUD(true);
    }, 80);
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  function init() {
    loadBest();
    setSound(true);
    resize();
    player.x = roadX + roadW / 2;
    player.targetX = player.x;
    elStartBest.textContent = G.best;
    elStart.classList.remove('hidden');

    lastT = performance.now();
    requestAnimationFrame(frame);
  }

  init();

})();