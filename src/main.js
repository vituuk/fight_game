import { Player } from './classes/Player.js';
import { rectangularCollision, determineWinner } from './utils/collision.js';
import { network, NetworkRole } from './network.js';
import { Sound } from './sound.js';

// Init audio on first interaction (browser autoplay policy)
const _initAudio = () => { Sound.init(); };
window.addEventListener('keydown',   _initAudio, { once: true });
window.addEventListener('pointerdown', _initAudio, { once: true });

// ─── Mobile Responsive Scaling ───────────────────────────────────────────────
const GAME_W = 1024;
const GAME_H = 576;

// Check both touch hardware AND small screen (covers DevTools simulation)
function isMobileDevice() {
  return ('ontouchstart' in window || navigator.maxTouchPoints > 0)
      || window.innerWidth <= 768;
}

function updateTouchClass() {
  if (isMobileDevice()) {
    document.body.classList.add('touch-device');
  } else {
    document.body.classList.remove('touch-device');
  }
}
updateTouchClass();

function scaleGame() {
  const container = document.getElementById('game-container');
  const overlay   = document.getElementById('controls-overlay');
  const guide     = document.getElementById('keyboard-guide');
  if (!container) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Re-check on every resize (handles DevTools simulation toggling)
  updateTouchClass();
  const isM = isMobileDevice();

  // Scale to fill screen, never upscale beyond native 1024×576
  const scale = Math.min(vw / GAME_W, vh / GAME_H, 1);

  // Centre the container using top/left (transform-origin: top left)
  container.style.transform      = `scale(${scale})`;
  container.style.transformOrigin = 'top left';
  container.style.left = Math.round((vw - GAME_W * scale) / 2) + 'px';
  container.style.top  = Math.round((vh - GAME_H * scale) / 2) + 'px';

  if (guide) guide.style.display = 'block'; // always show keyboard guide
  if (!overlay) return;

  // ── Button sizing ──────────────────────────────────────────────────────────
  //
  // We want buttons that feel LARGE on any phone.
  // Controls live inside the canvas (position:absolute bottom:0).
  // After CSS scale the canvas px are multiplied by `scale`.
  //
  // Formula: canvasPx = desiredScreenPx / scale
  //
  // Overlay height = max(120px real, 45% of rendered game height)
  // capped so it never exceeds 50% of GAME_H canvas pixels.

  const renderedH    = GAME_H * scale;                         // game height on screen
  const wantScreenPx = Math.max(80, renderedH * 0.30);        // at least 80px on screen
  const overlayCP    = Math.min(                               // canvas pixels
    Math.round(wantScreenPx / scale),
    Math.round(GAME_H * 0.35)                                  // cap at 35% of game height
  );

  // Inner available height after vertical padding (8% each side)
  const padCP  = Math.round(overlayCP * 0.08);
  const gapCP  = Math.round(overlayCP * 0.08);
  const rowCP  = Math.round((overlayCP - padCP * 2 - gapCP) / 2); // height per button row

  // Sizes: each button fills one row; attack is 20% bigger than normal action
  const cpDpad   = rowCP;
  const cpAction = rowCP;
  const cpAttack = Math.round(rowCP * 1.18);

  const r = document.documentElement.style;
  r.setProperty('--dpad-sz',   cpDpad   + 'px');
  r.setProperty('--action-sz', cpAction + 'px');
  r.setProperty('--attack-sz', cpAttack + 'px');
  r.setProperty('--ctrl-gap',  gapCP    + 'px');
  r.setProperty('--dpad-f',   Math.round(cpDpad   * 0.44) + 'px');
  r.setProperty('--action-f', Math.round(cpAction * 0.40) + 'px');
  r.setProperty('--attack-f', Math.round(cpAttack * 0.44) + 'px');
  r.setProperty('--label-f',  Math.round(cpAction * 0.09) + 'px');

  overlay.style.height  = overlayCP + 'px';
  overlay.style.padding = `${padCP}px ${Math.round(GAME_W * 0.025)}px`;
}

scaleGame();
window.addEventListener('resize', scaleGame);
window.addEventListener('orientationchange', () => setTimeout(scaleGame, 200));



// ─── Particle System ─────────────────────────────────────────────────────────
/**
 * Spark types:
 *   'default'  – generic hit sparks (yellow/pink)
 *   'sword'    – metallic silver-blue sparks with streak tails
 *   'slash'    – wide blue arc sparks (sword strike)
 *   'shield'   – crystalline blue/white shatter shards
 *   'skill'    – golden-orange energy orbs + small embers
 *   'impact'   – large bright burst on hit
 */
class Particle {
  constructor({ position, velocity, radius, color,
                glow = null, tail = false, life = 1, gravity = 0.15,
                friction = 1, shape = 'circle', angle = 0 }) {
    this.x       = position.x;
    this.y       = position.y;
    this.vx      = velocity.x;
    this.vy      = velocity.y;
    this.radius  = radius;
    this.color   = color;
    this.glow    = glow;       // shadowColor string or null
    this.tail    = tail;       // draw a streak-tail in velocity direction
    this.alpha   = life;
    this.life    = life;
    this.gravity = gravity;
    this.friction= friction;   // velocity damping per frame
    this.shape   = shape;      // 'circle' | 'shard'
    this.angle   = angle;
    this.spin    = (Math.random() - 0.5) * 0.3;
    this.dead    = false;
  }

  update(ctx) {
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.vy += this.gravity;
    this.x  += this.vx;
    this.y  += this.vy;
    this.angle += this.spin;
    this.alpha -= 0.028;
    if (this.alpha <= 0) { this.dead = true; return; }

    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);

    if (this.glow && this.alpha > 0.4) {  // skip blur for faded particles
      ctx.shadowColor = this.glow;
      ctx.shadowBlur  = this.radius * 3.5;
    }

    if (this.tail) {
      // Streak: line in the direction of velocity
      const spd  = Math.hypot(this.vx, this.vy);
      const nx   = this.vx / (spd || 1);
      const ny   = this.vy / (spd || 1);
      const tlen = Math.min(spd * 2.5, 22);
      ctx.strokeStyle = this.color;
      ctx.lineWidth   = this.radius * 1.4;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - nx * tlen, this.y - ny * tlen);
      ctx.stroke();
    } else if (this.shape === 'shard') {
      // Diamond shard shape
      ctx.fillStyle = this.color;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.beginPath();
      ctx.moveTo(0, -this.radius * 2);
      ctx.lineTo(this.radius * 0.7, 0);
      ctx.lineTo(0, this.radius * 1.5);
      ctx.lineTo(-this.radius * 0.7, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ── Emitter helpers ─────────────────────────────────────────────────────────
const MAX_PARTICLES = 120;  // hard cap — prevents particle avalanche during skills
function emit(config) {
  if (particles.length < MAX_PARTICLES) particles.push(new Particle(config));
}

/** Generic punch / hit sparks */
function createHitSparks(x, y) {
  const cols = ['#fbc531','#ff7675','#fd79a8','#fff','#ffe082'];
  for (let i = 0; i < 16; i++) {  // was 28
    const spd   = 4 + Math.random() * 12;
    const angle = Math.random() * Math.PI * 2;
    emit({
      position: { x, y },
      velocity: { x: Math.cos(angle) * spd, y: Math.sin(angle) * spd - 2 },
      radius:   1.5 + Math.random() * 3.5,
      color:    cols[Math.floor(Math.random() * cols.length)],
      glow:     '#fbc531',
      tail:     Math.random() < 0.45,
      gravity:  0.22,
      friction: 0.96,
    });
  }
  // Central bright flash orb
  emit({
    position: { x, y },
    velocity: { x: 0, y: -1 },
    radius:   14,
    color:    'rgba(255,255,255,0.85)',
    glow:     '#fff',
    tail:     false,
    gravity:  0,
    friction: 0.85,
    life:     0.55,
  });
  // Blood Splatter
  for (let i = 0; i < 8; i++) {  // was 15
    const spd = 3 + Math.random() * 8;
    const angle = Math.random() * Math.PI * 2;
    emit({
      position: { x, y },
      velocity: { x: Math.cos(angle) * spd, y: Math.sin(angle) * spd - 3 },
      radius:   2 + Math.random() * 4,
      color:    '#d63031',
      glow:     '#b71540',
      tail:     true,
      gravity:  0.8,
      friction: 0.98,
      life:     0.8,
    });
  }
}

/** Sword attack sparks – silver-blue metallic streaks */
function createSwordSparks(x, y, facingRight) {
  const dir = facingRight ? 1 : -1;
  const cols = ['#e3f2fd','#90caf9','#42a5f5','#fff','#b3e5fc'];
  for (let i = 0; i < 14; i++) {  // was 22
    const spd    = 6 + Math.random() * 14;
    const spread = (Math.random() - 0.5) * 1.8;
    emit({
      position: { x, y: y + (Math.random() - 0.5) * 40 },
      velocity: { x: dir * spd * Math.cos(spread), y: spd * Math.sin(spread) - 3 },
      radius:   1 + Math.random() * 2.5,
      color:    cols[Math.floor(Math.random() * cols.length)],
      glow:     '#4fc3f7',
      tail:     true,
      gravity:  0.18,
      friction: 0.95,
    });
  }
  for (let i = 0; i < 7; i++) {  // was 12
    const a = (i / 7) * Math.PI * 2;
    emit({
      position: { x, y },
      velocity: { x: Math.cos(a) * 5, y: Math.sin(a) * 5 },
      radius:   2,
      color:    '#b3e5fc',
      glow:     '#29b6f6',
      tail:     false,
      gravity:  0.1,
      friction: 0.92,
      life:     0.7,
    });
  }
}

/** Sword STRIKE sparks – wide arc slash burst */
function createSlashSparks(x, y, facingRight) {
  const dir  = facingRight ? 1 : -1;
  const cols = ['#80deea','#26c6da','#00bcd4','#e0f7fa','#fff'];
  for (let i = 0; i < 20; i++) {  // was 35
    const spd  = 8 + Math.random() * 16;
    const ang  = (Math.random() * Math.PI * 0.9) - Math.PI * 0.45;
    emit({
      position: { x: x + dir * Math.random() * 30, y: y + (Math.random() - 0.5) * 60 },
      velocity: { x: dir * spd * Math.cos(ang), y: spd * Math.sin(ang) - 2 },
      radius:   1.2 + Math.random() * 3,
      color:    cols[Math.floor(Math.random() * cols.length)],
      glow:     '#00e5ff',
      tail:     Math.random() < 0.6,
      gravity:  0.2,
      friction: 0.94,
    });
  }
  emit({
    position: { x, y },
    velocity: { x: dir * 2, y: -1 },
    radius:   18,
    color:    'rgba(0,229,255,0.55)',
    glow:     '#00e5ff',
    tail:     false,
    gravity:  0,
    friction: 0.8,
    life:     0.5,
  });
}

/** Shield sparks – crystalline blue/white shards scatter */
function createShieldSparks(x, y) {
  const cols = ['#e3f2fd','#90caf9','#ce93d8','#7c4dff','#e1f5fe','#fff'];
  // Diamond shards
  for (let i = 0; i < 20; i++) {
    const spd  = 3 + Math.random() * 9;
    const ang  = Math.random() * Math.PI * 2;
    emit({
      position: { x: x + (Math.random()-0.5)*20, y: y + (Math.random()-0.5)*20 },
      velocity: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 4 },
      radius:   2 + Math.random() * 3,
      color:    cols[Math.floor(Math.random() * cols.length)],
      glow:     '#7c4dff',
      tail:     false,
      shape:    'shard',
      gravity:  0.25,
      friction: 0.93,
    });
  }
  // Glow circles
  for (let i = 0; i < 10; i++) {
    const spd = 2 + Math.random() * 6;
    const ang = Math.random() * Math.PI * 2;
    emit({
      position: { x, y },
      velocity: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 2 },
      radius:   3 + Math.random() * 5,
      color:    'rgba(100,180,255,0.8)',
      glow:     '#4fc3f7',
      tail:     false,
      gravity:  0.08,
      friction: 0.9,
      life:     0.65,
    });
  }
}

/** Skill (special) sparks – golden energy orbs + ember shower */
function createSkillSparks(x, y) {
  const cols = ['#ffd54f','#ffb300','#ff6f00','#ffe082','#fff9c4','#ff8f00'];
  for (let i = 0; i < 10; i++) {  // was 18
    const spd  = 5 + Math.random() * 15;
    const ang  = Math.random() * Math.PI * 2;
    emit({
      position: { x, y },
      velocity: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 5 },
      radius:   3 + Math.random() * 6,
      color:    cols[Math.floor(Math.random() * cols.length)],
      glow:     '#ffab40',
      tail:     Math.random() < 0.4,
      gravity:  0.12,
      friction: 0.97,
    });
  }
  for (let i = 0; i < 18; i++) {  // was 30
    const spd  = 3 + Math.random() * 10;
    const ang  = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI;
    emit({
      position: { x: x + (Math.random()-0.5)*40, y: y + (Math.random()-0.5)*20 },
      velocity: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
      radius:   1 + Math.random() * 2.5,
      color:    Math.random() < 0.5 ? '#ffe082' : '#ff8f00',
      glow:     '#ff6f00',
      tail:     true,
      gravity:  0.3,
      friction: 0.95,
    });
  }
  emit({
    position: { x, y },
    velocity: { x: 0, y: 0 },
    radius:   28,
    color:    'rgba(255,210,0,0.6)',
    glow:     '#ffc107',
    tail:     false,
    gravity:  0,
    friction: 0.75,
    life:     0.55,
  });
}

/** Continuous ambient sparks while using a skill (called each frame) */
function emitSkillAmbient(character) {
  if (character.isDead) return;
  const cx = character.position.x + character.width / 2;
  const cy = character.position.y + character.height * 0.45;

  if (character.isAttacking) {
    if (Math.random() < 0.35) {  // increased spawn rate for 'break fire'
      const dir = character.facingRight ? 1 : -1;
      emit({
        position: { x: cx + dir * 55, y: cy + (Math.random()-0.5)*30 },
        velocity: { x: dir * (6 + Math.random()*8), y: (Math.random()-0.5)*5 - 1 }, // faster blast
        radius:   1.5 + Math.random() * 2.5,
        color:    ['#ffab40', '#ff6d00', '#ffd54f', '#fff'][Math.floor(Math.random()*4)],
        glow:     '#ff3d00',
        tail:     true,
        gravity:  0.08,
        friction: 0.92,
        life:     0.8,
      });
    }
  }

  if (character.isKnifeAttacking) {
    if (Math.random() < 0.45) {  // increased spawn rate for heavier 'break fire'
      const dir = character.facingRight ? 1 : -1;
      const ang = (Math.random() - 0.5) * Math.PI * 0.8;
      emit({
        position: { x: cx + dir * (40 + Math.random()*50), y: cy + (Math.random()-0.5)*50 },
        velocity: { x: dir * Math.cos(ang) * (8+Math.random()*12), y: Math.sin(ang) * 8 - 2 },
        radius:   2 + Math.random() * 3,
        color:    ['#ff6d00','#ff3d00','#ffea00','#fff'][Math.floor(Math.random()*4)],
        glow:     '#ff9100',
        tail:     true,
        gravity:  0.15,
        friction: 0.94,
        life:     0.7,
      });
    }
  }

  if (character.isSpecialAttacking && !character.isEnemy) {
    // Fire particles emitted on the circle's circumference
    const R = 130;
    const t = Date.now() / 120;
    for (let i = 0; i < 3; i++) {
      const ang = t * 2.8 + (i / 3) * Math.PI * 2;
      const rx  = cx + Math.cos(ang) * R;
      const ry  = cy + Math.sin(ang) * R * 0.55;
      emit({
        position: { x: rx, y: ry },
        velocity: { x: Math.cos(ang) * 1.5 + (Math.random()-0.5)*2, y: -3 - Math.random()*4 },
        radius:   2 + Math.random() * 4,
        color:    ['#fff9c4','#ffd54f','#ffb300','#ff8f00','#fff'][Math.floor(Math.random()*5)],
        glow:     '#ff6f00', tail: true, gravity: -0.06, friction: 0.97, life: 0.85,
      });
    }
    // Occasional lightning spark around the ring
    if (Math.random() < 0.25) {
      const ang = Math.random() * Math.PI * 2;
      const rx  = cx + Math.cos(ang) * R;
      const ry  = cy + Math.sin(ang) * R * 0.55;
      emit({
        position: { x: rx, y: ry },
        velocity: { x: (Math.random()-0.5)*8, y: (Math.random()-0.5)*8 },
        radius:   1 + Math.random() * 2,
        color:    Math.random() < 0.5 ? '#fff' : '#b3e5fc',
        glow:     '#fff9c4', tail: true, gravity: 0.05, friction: 0.92, life: 0.7,
      });
    }
  }

  if (character.isShielding) {
    if (Math.random() < 0.15) {  // was 0.25
      const ang = Math.random() * Math.PI * 2;
      const r   = 72;
      emit({
        position: { x: cx + Math.cos(ang)*r, y: cy + Math.sin(ang)*r*1.1 },
        velocity: { x: Math.cos(ang)*1.5, y: Math.sin(ang)*1.5 - 0.5 },
        radius:   1.5 + Math.random() * 2,
        color:    Math.random() < 0.6 ? '#e3f2fd' : '#7c4dff',
        glow:     '#7c4dff',
        tail:     false,
        gravity:  -0.02,
        friction: 0.92,
        life:     0.7,
      });
    }
  }
}

// ─── Canvas ───────────────────────────────────────────────────────────────────
const canvas = document.querySelector('#gameCanvas');
const ctx    = canvas.getContext('2d');
canvas.width  = 1024;
canvas.height = 576;

const FLOOR_Y = canvas.height - 96; // y-coord of the floor surface

const game = {
  canvas,
  ctx,
  gravity:    0.75,
  displayText: document.querySelector('#displayText'),
  p1HealthBar: document.querySelector('#player1Health'),
  p2HealthBar: document.querySelector('#player2Health'),
  timerEl:     document.querySelector('#timer')
};

const particles = [];

// ─── Hero Abilities System ─────────────────────────────────────────────────
/**
 * Maps each hero's data-name attribute to its unique active ability.
 */
const HERO_ABILITIES = {
  DEFAULT: { name: 'Fury Storm',   icon: '⚡', key: 'furyStorm',   cooldown: 3000 },
  'NARUTO UZUMAKI': { name: 'Phantom Rush', icon: '👻', key: 'phantomRush', cooldown: 5000 },
  HARATU:  { name: 'Thunder Clap', icon: '⚡', key: 'thunderClap', cooldown: 4000 },
  LUFFY:   { name: 'Gear Stretch', icon: '🥊', key: 'gearStretch',  cooldown: 5000 },
};

/** Flash the ability name in centre-screen */
function showAbilityBanner(icon, name) {
  let el = document.getElementById('ability-flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ability-flash';
    Object.assign(el.style, {
      position:      'absolute',
      top:           '40%',
      left:          '50%',
      transform:     'translate(-50%,-50%) scale(0.6)',
      fontFamily:    '"Press Start 2P", cursive',
      fontSize:      '22px',
      color:         '#fff',
      textShadow:    '0 0 24px #ffd600, 0 0 6px #000, 3px 3px 0 #000',
      textAlign:     'center',
      whiteSpace:    'nowrap',
      pointerEvents: 'none',
      zIndex:        '998',
      opacity:       '0',
      transition:    'all 0.15s cubic-bezier(.17,.67,.3,1.5)',
      lineHeight:    '1.5',
    });
    document.getElementById('game-container').appendChild(el);
  }
  el.textContent = `${icon} ${name}!`;
  el.style.opacity   = '1';
  el.style.transform = 'translate(-50%,-50%) scale(1.05)';
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.opacity   = '0';
    el.style.transform = 'translate(-50%,-50%) scale(0.8)';
  }, 900);
}

/** Update the ability badge HUD (name + cooldown dim) */
function updateAbilityBadge() {
  const ab   = HERO_ABILITIES[player.heroKey] || HERO_ABILITIES.DEFAULT;
  const icon = document.getElementById('ability-badge-icon');
  const name = document.getElementById('ability-badge-name');
  if (icon) icon.textContent = ab.icon;
  if (name) name.textContent = ab.name;
}

// ── Skill circle VFX state ───────────────────────────────────────────────
let _skillCircleActive = false;
let _skillCircleEnd    = 0;

/**
 * drawSkillCircle — called every frame from the game loop.
 * Draws a large glowing fire+lightning ring around the player while
 * the skill is active, and fires arcs toward enemies.
 */
function drawSkillCircle() {
  if (!_skillCircleActive || player.isDead) return;
  if (Date.now() > _skillCircleEnd) { _skillCircleActive = false; return; }

  const cx = player.position.x + player.width  / 2;
  const cy = player.position.y + player.height * 0.45;
  const R  = 130;  // ring radius
  const t  = Date.now() / 220;

  ctx.save();

  // ── 1. Outer fire glow ring ──────────────────────────────────────────────
  ctx.lineCap     = 'round';
  ctx.shadowColor = '#ff6f00';
  ctx.shadowBlur  = 40;
  ctx.strokeStyle = `rgba(255,100,0,${0.35 + Math.sin(t * 2.5) * 0.18})`;
  ctx.lineWidth   = 28;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, R + Math.sin(t * 3) * 6, 0, Math.PI * 2);
  ctx.stroke();

  // ── 2. Main bright fire ring ─────────────────────────────────────────────
  ctx.shadowColor = '#ffd600';
  ctx.shadowBlur  = 55;
  ctx.strokeStyle = `rgba(255,210,0,${0.72 + Math.sin(t * 4) * 0.22})`;
  ctx.lineWidth   = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, R + Math.sin(t * 3.5) * 5, 0, Math.PI * 2);
  ctx.stroke();

  // ── 3. White-hot core ring ───────────────────────────────────────────────
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur  = 28;
  ctx.strokeStyle = `rgba(255,255,230,${0.85 + Math.sin(t * 5) * 0.14})`;
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, R + Math.sin(t * 4) * 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();

  // ── 4. Short lightning arcs crackling around the ring ───────────────────
  if (Math.floor(t * 6) % 2 === 0) {
    const a1 = Math.random() * Math.PI * 2;
    const px1 = cx + Math.cos(a1) * R;
    const py1 = cy + Math.sin(a1) * R * 0.55;
    const a2  = a1 + (Math.random() - 0.5) * 1.6;
    const px2 = cx + Math.cos(a2) * (R + 30 + Math.random() * 40);
    const py2 = cy + Math.sin(a2) * (R + 30 + Math.random() * 40) * 0.55;
    _drawZigzag(ctx, px1, py1, px2, py2, '#fff9c4', 1.5, 8);
  }

  // ── 5. Lightning bolts toward enemies (every ~400ms flash) ───────────────
  if (Math.floor(Date.now() / 180) !== (_drawSkillCircle_lastFlash || 0)) {
    _drawSkillCircle_lastFlash = Math.floor(Date.now() / 180);
    if (Math.random() < 0.30) {
      const targets = [
        ...(enemy.isHidden || enemy.isDead ? [] : [enemy]),
        ...enemyPool.filter(e => !e.isHidden && !e.isDead),
      ];
      targets.forEach(tgt => {
        const tx = tgt.position.x + tgt.width  / 2;
        const ty = tgt.position.y + tgt.height * 0.35;
        _drawZigzag(ctx, cx, cy - 30, tx, ty, '#ffffff', 2.5, 14);
        _drawZigzag(ctx, cx, cy - 30, tx, ty, '#b3e5fc', 1.2, 12);
        // Splash sparks at target
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2;
          emit({
            position: { x: tx + (Math.random()-0.5)*16, y: ty + (Math.random()-0.5)*16 },
            velocity: { x: Math.cos(a)*6, y: Math.sin(a)*6 - 2 },
            radius:   1 + Math.random() * 2.5,
            color:    Math.random() < 0.5 ? '#fff' : '#b3e5fc',
            glow:     '#fff9c4', tail: true, gravity: 0.15, friction: 0.93, life: 0.8,
          });
        }
      });
    }
  }
}
let _drawSkillCircle_lastFlash = 0;

/** Jagged zigzag lightning line between two points */
function _drawZigzag(ctx, x1, y1, x2, y2, color, lw, segs) {
  const pts = [[x1, y1]];
  for (let i = 1; i < segs; i++) {
    const t  = i / segs;
    const jx = (Math.random() - 0.5) * 40;
    const jy = (Math.random() - 0.5) * 20;
    pts.push([x1 + (x2 - x1) * t + jx, y1 + (y2 - y1) * t + jy]);
  }
  pts.push([x2, y2]);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth   = lw * 3;
  ctx.shadowColor = color;
  ctx.shadowBlur  = 18;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  pts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth   = lw;
  ctx.shadowBlur  = 10;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  pts.slice(1).forEach(([px, py]) => ctx.lineTo(px, py));
  ctx.stroke();
  ctx.restore();
}

/**
 * ── ABILITY: Fury Storm (DEFAULT) ─────────────────────────────────────────
 * Activates shining fire circle + fires 3 lightning strikes during 2s window.
 */
function abilityFuryStorm() {
  if (player.isDead || player.isSpecialAttacking) return;
  const now = Date.now();
  if (player._lastSpecialTime && now - player._lastSpecialTime < 3000) return;
  player._lastSpecialTime = now;

  setCooldown('btn-special', 3000);
  Sound.playSkillCast();
  selectSkill('skill');
  player.specialAttack();
  showAbilityBanner('⚡', 'Fury Storm');

  // Activate the glowing circle for 2.2 seconds
  _skillCircleActive = true;
  _skillCircleEnd    = Date.now() + 2200;

  // Burst fire sparks at attack point
  const px = player.position.x + (player.facingRight ? player.width + 40 : -40);
  const py = player.position.y + player.height * 0.38;
  createSkillSparks(px, py);

  // Screen flash
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle   = '#fff9c4';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // Lightning strikes at 0, 400, 900ms
  const fireBolt = () => {
    if (player.isDead) return;
    const sx = player.position.x + player.width / 2;
    const sy = player.position.y + player.height * 0.25;
    const targets = [
      ...(enemy.isHidden || enemy.isDead ? [] : [enemy]),
      ...enemyPool.filter(e => !e.isHidden && !e.isDead),
    ];
    targets.forEach(tgt => {
      const tx = tgt.position.x + tgt.width  / 2;
      const ty = tgt.position.y + tgt.height * 0.35;
      _drawZigzag(ctx, sx, sy, tx, ty, '#ffffff', 3, 14);
      _drawZigzag(ctx, sx, sy, tx, ty, '#fffde7', 1.5, 12);
      // Branch bolt from midpoint
      const mx = (sx + tx) / 2 + (Math.random()-0.5) * 60;
      const my = (sy + ty) / 2 + (Math.random()-0.5) * 30;
      _drawZigzag(ctx, mx, my, tx + (Math.random()-0.5)*80, ty + 40 + Math.random()*40, '#b3e5fc', 1, 7);
      // Screen flash
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle   = '#e8f5ff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      // Sparks at impact
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        emit({
          position: { x: tx+(Math.random()-0.5)*18, y: ty+(Math.random()-0.5)*18 },
          velocity: { x: Math.cos(a)*8, y: Math.sin(a)*8 - 3 },
          radius:   1.5 + Math.random() * 3,
          color:    ['#fff','#fffde7','#ffe082','#b3e5fc'][Math.floor(Math.random()*4)],
          glow: '#fff9c4', tail: true, gravity: 0.12, friction: 0.93, life: 0.85,
        });
      }
      // Balanced skill damage: deals 15 damage per bolt (45 total over 3 hits)
      if (typeof tgt.takeHit === 'function') {
        tgt.takeHit(15);
        if (typeof updateEnemyHealthHUD === 'function') {
          updateEnemyHealthHUD();
        }
      }
    });
  };
  fireBolt();
  setTimeout(fireBolt, 400);
  setTimeout(fireBolt, 900);
}

/**
 * ── ABILITY: Phantom Rush (NARUTO UZUMAKI) ──────────────────────────
 * Teleport behind the nearest enemy, trigger a backstab burst.
 */
function abilityPhantomRush() {
  if (player.isDead) return;
  const now = Date.now();
  if (player._lastSpecialTime && now - player._lastSpecialTime < 5000) return;
  player._lastSpecialTime = now;

  // Find closest active enemy
  const enemies = [
    ...(enemy.isHidden || enemy.isDead ? [] : [enemy]),
    ...enemyPool.filter(e => !e.isHidden && !e.isDead),
  ];
  if (enemies.length === 0) return;

  const target = enemies.reduce((closest, e) => {
    const d = Math.abs(e.position.x - player.position.x);
    return d < Math.abs(closest.position.x - player.position.x) ? e : closest;
  }, enemies[0]);

  // Store after-image at current position
  player._afterImageX     = player.position.x;
  player._afterImageY     = player.position.y;
  player._afterImageFlip  = player.facingRight ? 1 : -1;
  player._afterImageAlpha = 1.0;

  // Warp behind the target
  const behindX = target.facingRight
    ? target.position.x - player.width - 20
    : target.position.x + target.width + 20;
  player.position.x  = Math.max(0, Math.min(canvas.width - player.width, behindX));
  player.facingRight = !target.facingRight; // face same way as target

  // Cyan warp burst at destination
  const cx = player.position.x + player.width / 2;
  const cy = player.position.y + player.height * 0.45;
  for (let i = 0; i < 40; i++) {
    const a   = (i / 40) * Math.PI * 2;
    const spd = 5 + Math.random() * 12;
    emit({
      position: { x: cx + Math.cos(a) * 20, y: cy + Math.sin(a) * 20 },
      velocity: { x: Math.cos(a) * spd, y: Math.sin(a) * spd - 3 },
      radius:   1.5 + Math.random() * 3,
      color:    ['#00e5ff','#b3e5fc','#fff','#80deea'][Math.floor(Math.random()*4)],
      glow:     '#00e5ff',
      tail:     Math.random() < 0.5,
      gravity:  0.12,
      friction: 0.93,
    });
  }
  // Flash at old position too
  const ox = player._afterImageX + player.width / 2;
  const oy = player._afterImageY + player.height * 0.45;
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * Math.PI * 2;
    emit({
      position: { x: ox, y: oy },
      velocity: { x: Math.cos(a) * (3 + Math.random()*7), y: Math.sin(a) * 4 - 2 },
      radius:   2 + Math.random() * 3,
      color:    '#00e5ff', glow: '#00bcd4', tail: true,
      gravity: 0.1, friction: 0.92, life: 0.7,
    });
  }

  setCooldown('btn-special', 5000);
  Sound.playSwordSwing();
  selectSkill('sword');
  player.attack();
  showAbilityBanner('👻', 'Phantom Rush');
}

/**
 * ── ABILITY: Thunder Clap (HARATU) ──────────────────────
 * Ground slam — shockwave ellipse hits ALL active enemies within 300px.
 */
function abilityThunderClap() {
  if (player.isDead) return;
  const now = Date.now();
  if (player._lastSpecialTime && now - player._lastSpecialTime < 4000) return;
  player._lastSpecialTime = now;

  setCooldown('btn-special', 4000);
  Sound.playSkillCast();
  selectSkill('skill');
  player.specialAttack();
  showAbilityBanner('⚡', 'Thunder Clap');

  const cx = player.position.x + player.width / 2;
  const cy = player.position.y + player.height;

  // Lightning bolts radially outward
  for (let i = 0; i < 48; i++) {
    const a   = (i / 48) * Math.PI * 2;
    const spd = 8 + Math.random() * 14;
    emit({
      position: { x: cx + Math.cos(a)*10, y: cy + Math.sin(a)*6 },
      velocity: { x: Math.cos(a) * spd, y: Math.sin(a) * spd * 0.45 },
      radius:   1.5 + Math.random() * 3.5,
      color:    ['#ffe082','#fff9c4','#ffee58','#fff','#ffd600'][Math.floor(Math.random()*5)],
      glow:     '#ffd600',
      tail:     Math.random() < 0.7,
      gravity:  0.08,
      friction: 0.93,
    });
  }
  // Central flash
  emit({
    position: { x: cx, y: cy - 10 },
    velocity: { x: 0, y: -0.5 },
    radius: 32,
    color: 'rgba(255,230,0,0.7)',
    glow: '#ffd600', tail: false, gravity: 0, friction: 0.8, life: 0.5,
  });

  // Damage all enemies within range (bidirectional shockwave)
  const range = 300;
  const dmg   = 20;
  setTimeout(() => {
    const targets = [
      ...(enemy.isHidden || enemy.isDead ? [] : [enemy]),
      ...enemyPool.filter(e => !e.isHidden && !e.isDead),
    ];
    targets.forEach(t => {
      const dist = Math.abs((t.position.x + t.width/2) - cx);
      if (dist <= range) {
        t.takeHit(dmg);
        updateEnemyHealthHUD();
        createSkillSparks(t.position.x + t.width/2, t.position.y + t.height*0.4);
      }
    });
  }, 200);
}

/**
 * ── ABILITY: Gear Stretch (LUFFY) ────────────────────────
 * Triple attack-reach for 800ms, knocks back on connect.
 */
function abilityGearStretch() {
  if (player.isDead || player._stretchActive) return;
  const now = Date.now();
  if (player._lastSpecialTime && now - player._lastSpecialTime < 5000) return;
  player._lastSpecialTime = now;

  setCooldown('btn-special', 5000);
  Sound.playSkillCast();
  showAbilityBanner('🥊', 'Gear Stretch');
  selectSkill('skill');

  // Triple the attack box
  player._stretchActive     = true;
  player._stretchOrigWidth  = player.attackBox.width;
  player.attackBox.width    = 300;

  // Elastic orange particle trail from player toward enemy direction
  const dir = player.facingRight ? 1 : -1;
  const ox  = player.position.x + player.width / 2;
  const oy  = player.position.y + player.height * 0.38;
  for (let i = 0; i < 35; i++) {
    const ext = i / 35;
    emit({
      position: { x: ox + dir * ext * 240, y: oy + (Math.random()-0.5) * 20 },
      velocity: { x: dir * (5 + Math.random()*8), y: (Math.random()-0.5)*4 },
      radius:   3 + Math.random() * 5,
      color:    ['#ff8f00','#ffb300','#ffe082','#fff3e0'][Math.floor(Math.random()*4)],
      glow:     '#ff8f00',
      tail:     true,
      gravity:  0.05,
      friction: 0.96,
    });
  }

  // Trigger the actual swing
  player.knifeAttack();

  // Brief knockback on any hit (patched into takeHit after-effect via flag)
  player._gearKnockback = true;

  // Restore after 800ms
  setTimeout(() => {
    player.attackBox.width = player._stretchOrigWidth || 130;
    player._stretchActive  = false;
    player._gearKnockback  = false;
  }, 800);
}

/** Master dispatcher — calls the right ability for the equipped hero */
function useHeroAbility() {
  if (player.isDead || !gameActive) return;
  const key = player.heroKey || 'DEFAULT';
  switch (key) {
    case 'NARUTO UZUMAKI': abilityPhantomRush(); break;
    case 'HARATU': abilityThunderClap(); break;
    case 'LUFFY':  abilityGearStretch(); break;
    default:       abilityFuryStorm();  break;
  }
}

/** Start cooldown dim — pure CSS animation, zero DOM writes per frame */
function setCooldown(btnId, ms) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.style.setProperty('--cd-ms', ms + 'ms');
  btn.classList.add('on-cooldown');
  clearTimeout(btn._cdTimer);
  btn._cdTimer = setTimeout(() => btn.classList.remove('on-cooldown'), ms);
}

/** Gear-Stretch rubber-arm draw — called inside animate() each frame */
function drawGearStretch() {
  if (!player._stretchActive || player.isDead) return;
  const dir = player.facingRight ? 1 : -1;
  const sx  = player.position.x + (player.facingRight ? player.width : 0);
  const sy  = player.position.y + player.height * 0.35;
  const ex  = sx + dir * 300;

  const grad = ctx.createLinearGradient(sx, sy, ex, sy);
  grad.addColorStop(0,   'rgba(255,143,0,0.85)');
  grad.addColorStop(0.5, 'rgba(255,193,7,0.6)');
  grad.addColorStop(1,   'rgba(255,255,100,0.1)');

  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineWidth   = 8 + Math.sin(Date.now() / 60) * 3;
  ctx.lineCap     = 'round';
  ctx.shadowColor = '#ff8f00';
  ctx.shadowBlur  = 18;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.bezierCurveTo(
    sx + dir * 80,  sy - 20,
    ex - dir * 60,  sy + 15,
    ex, sy
  );
  ctx.stroke();
  // Fist at tip
  ctx.beginPath();
  ctx.arc(ex, sy, 10 + Math.sin(Date.now()/50)*2, 0, Math.PI*2);
  ctx.fillStyle   = 'rgba(255,180,0,0.9)';
  ctx.shadowColor = '#ffd600';
  ctx.shadowBlur  = 24;
  ctx.fill();
  ctx.restore();
}

// ─── Background definitions (decoupled from enemies) ─────────────────────────
const BACKGROUNDS = [
  { id: 1, location: 'The Dojo',          bgSrc: '/assets/background/b.jpg'         },
  { id: 2, location: 'Hero Arena',         bgSrc: '/assets/background/b2.jpeg'        },
  { id: 3, location: 'City Streets',       bgSrc: '/assets/background/background.jpg' },
  { id: 4, location: 'Volcano Peak',       bgSrc: '/assets/background/background1.jpg'},
  { id: 5, location: 'Enchanted Forest',   bgSrc: '/assets/background/forest.png'     },
  { id: 6, location: 'Final Arena',        bgSrc: '/assets/background/bg-00.png'      },
];

// ─── Enemy roster (all enemies can appear on any stage) ──────────────────────
const ENEMY_ROSTER = [
  { name: 'SAMURAI',     src: '/assets/characters/anamy.png',  accentColor: '#ef5350' },
  { name: 'DEKU',        src: '/assets/characters/anamy1.png', accentColor: '#4caf50' },
  { name: 'SHADOW',      src: '/assets/characters/anamy2.png', accentColor: '#78909c' },
  { name: 'RYU',         src: '/assets/characters/anamy3.png', accentColor: '#ff5722' },
  { name: 'WARRIOR',     src: '/assets/characters/warrior.png',accentColor: '#7c4dff' },
];

// ─── Compatibility shim: keep STAGES alias for parts of code that still use it
// Points at BACKGROUNDS since we no longer have a fixed stage-enemy binding.
const STAGES = BACKGROUNDS;

let currentStageIdx = 0;
let unlockedStageIdx = 0;
let currentWaveIdx  = 0;
let gameActive      = true;  // false while transitioning

// ─── Score Tracking ──────────────────────────────────────────────────────────
let _scoreKills     = 0;   // enemies defeated this session
let _scoreTime      = 0;   // time survived (seconds used)
let _scoreRoundStart = Date.now(); // timestamp when round begins

// Pre-load all background images so transitions are instant
const bgImages = {};
BACKGROUNDS.forEach(s => {
  const img = new Image();
  img.src = s.bgSrc;
  bgImages[s.bgSrc] = img;
});

// ─── Stage Select UI (full-screen overlay + compact bar) ─────────────────────
const _ssoEl    = document.getElementById('stage-select-overlay');
const _ssoGrid  = document.getElementById('sso-grid');
const _stageBar = document.getElementById('stage-options-bar');

/** Build both the full-screen grid and the compact top bar once */
function buildStageSelectUI() {
  if (!_ssoGrid || !_stageBar) return;
  _ssoGrid.innerHTML = '';
  _stageBar.innerHTML = '';

  BACKGROUNDS.forEach((bg, idx) => {
    // ── Full-screen grid card ──────────────────────────────────────────────
    const card = document.createElement('div');
    card.className = 'sso-card';
    card.innerHTML = `<img src="${bg.bgSrc}" alt="${bg.location}"><div class="sso-label">${bg.location.toUpperCase()}</div>`;
    card.addEventListener('click', () => selectStage(idx));
    _ssoGrid.appendChild(card);

    // ── Compact bar thumbnail ──────────────────────────────────────────────
    const btn = document.createElement('div');
    btn.className = 'stage-btn';
    btn.dataset.idx = idx;
    btn.innerHTML = `<img src="${bg.bgSrc}" alt="${bg.location}"><span class="stage-num">${idx + 1}</span>`;
    btn.title = bg.location;
    btn.addEventListener('click', () => selectStage(idx));
    _stageBar.appendChild(btn);
  });
  updateStageBarHighlight();
}

/** Update the active highlight in the compact top bar */
function updateStageBarHighlight() {
  if (_stageBar) {
    _stageBar.querySelectorAll('.stage-btn').forEach(b => {
      const idx = parseInt(b.dataset.idx);
      const isLocked = idx > unlockedStageIdx;
      b.classList.toggle('active', idx === currentStageIdx);
      b.classList.toggle('locked', isLocked);
      b.style.opacity = isLocked ? '0.4' : '1';
      b.style.pointerEvents = isLocked ? 'none' : 'auto';
      b.querySelector('.stage-num').innerHTML = `${idx + 1} ${isLocked ? '🔒' : ''}`;
      b.title = isLocked ? 'Locked' : BACKGROUNDS[idx].location;
    });
  }
  if (_ssoGrid) {
    _ssoGrid.querySelectorAll('.sso-card').forEach((card, idx) => {
      const isLocked = idx > unlockedStageIdx;
      card.classList.toggle('locked', isLocked);
      card.style.opacity = isLocked ? '0.4' : '1';
      card.style.pointerEvents = isLocked ? 'none' : 'auto';
      card.querySelector('.sso-label').innerHTML = `${BACKGROUNDS[idx].location.toUpperCase()} ${isLocked ? '🔒' : ''}`;
    });
  }
}

/** Show the full-screen stage selection overlay */
function showStageSelect() {
  gameActive = false;
  clearTimeout(timerId);
  if (!_ssoEl) return;
  updateStageBarHighlight();
  _ssoEl.classList.remove('hidden');
  requestAnimationFrame(() => _ssoEl.classList.add('visible'));
}

/** Hide the full-screen stage selection overlay */
function hideStageSelect() {
  if (!_ssoEl) return;
  _ssoEl.classList.remove('visible');
  setTimeout(() => _ssoEl.classList.add('hidden'), 420);
}

/** Called when the player clicks a stage card */
function selectStage(idx) {
  if (idx > unlockedStageIdx) return; // Prevent selection of locked stages
  currentStageIdx = idx;
  updateStageBarHighlight();
  hideStageSelect();
  // Hide game-over screen if visible
  gameOverScreen.classList.remove('visible');
  setTimeout(() => gameOverScreen.classList.add('hidden'), 520);
  // Start the round with the new background
  resetRound();
}

// Helper: pick a random entry from an array
function randomEntry(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper: pick `n` distinct random entries from an array (wraps if n > arr.length)
function randomDistinct(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  const result = [];
  for (let i = 0; i < n; i++) result.push(shuffled[i % shuffled.length]);
  return result;
}

// ─── Background-removal utility for enemy sprites ───────────────────────────
/**
 * removeWhiteBg: draws `img` onto an offscreen canvas and makes any
 * near-white pixel transparent. Returns the canvas so it can be drawn
 * in place of the original image (canvas is drawable by ctx.drawImage).
 *
 * threshold: how far from pure-white (255,255,255) a pixel may be
 * and still be erased.  30 handles off-white JPEG artefacts well.
 */
function removeWhiteBg(img, threshold = 90) {
  const oc  = document.createElement('canvas');
  const W = img.naturalWidth  || img.width;
  const H = img.naturalHeight || img.height;
  oc.width  = W;
  oc.height = H;
  const ctx = oc.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  if (!W || !H) return oc;
  const id = ctx.getImageData(0, 0, W, H);
  const d  = id.data;

  // ── 1. Score-based corner sampling: low variance + high brightness = bg ──
  // "Most opaque" doesn't work for JPEG (all alpha=255). Instead, pick the
  // corner patch that is most uniform AND brightest — that's the background.
  const samplePatch = (cx, cy) => {
    let r=0, g=0, b=0, a=0, cnt=0;
    const R = 6;
    for (let dy=-R; dy<=R; dy++) {
      for (let dx=-R; dx<=R; dx++) {
        const x = Math.min(W-1, Math.max(0, cx+dx));
        const y = Math.min(H-1, Math.max(0, cy+dy));
        const i = (y*W+x)*4;
        r+=d[i]; g+=d[i+1]; b+=d[i+2]; a+=d[i+3]; cnt++;
      }
    }
    const ar=r/cnt, ag=g/cnt, ab=b/cnt;
    // Measure variance within patch
    let variance = 0;
    for (let dy=-R; dy<=R; dy++) {
      for (let dx=-R; dx<=R; dx++) {
        const x = Math.min(W-1, Math.max(0, cx+dx));
        const y = Math.min(H-1, Math.max(0, cy+dy));
        const i = (y*W+x)*4;
        variance += Math.abs(d[i]-ar)+Math.abs(d[i+1]-ag)+Math.abs(d[i+2]-ab);
      }
    }
    const brightness = (ar + ag + ab) / 3;
    // Low variance + high brightness = most likely solid background
    const score = variance - (brightness * 0.8);
    return { r:ar, g:ag, b:ab, a:a/cnt, score };
  };

  const corners = [
    samplePatch(0, 0), samplePatch(W-1, 0),
    samplePatch(0, H-1), samplePatch(W-1, H-1)
  ];

  // If ALL corners are mostly transparent → already bg-free, skip
  if (Math.max(...corners.map(c=>c.a)) < 50) return oc;

  // Pick the corner most likely to be the background (lowest score)
  const bg  = corners.reduce((best, c) => c.score < best.score ? c : best);
  const bgR = bg.r, bgG = bg.g, bgB = bg.b;

  // ── 2. BFS flood-fill from all 4 edges ───────────────────────────────────
  const isBg = (x, y) => {
    const i = (y*W+x)*4;
    if (d[i+3] < 50) return true;
    return Math.max(Math.abs(d[i]-bgR), Math.abs(d[i+1]-bgG), Math.abs(d[i+2]-bgB)) < threshold;
  };

  const visited = new Uint8Array(W * H);
  const queue = [];
  for (let margin = 0; margin < 5; margin++) {
    for (let x=0; x<W; x++) {
      if (!visited[margin*W+x] && isBg(x, margin)) { 
        visited[margin*W+x] = 1; queue.push(x, margin); 
      }
      if (!visited[(H-1-margin)*W+x] && isBg(x, H-1-margin)) { 
        visited[(H-1-margin)*W+x] = 1; queue.push(x, H-1-margin); 
      }
    }
    for (let y=0; y<H; y++) {
      if (!visited[y*W+margin] && isBg(margin, y)) { 
        visited[y*W+margin] = 1; queue.push(margin, y); 
      }
      if (!visited[y*W+(W-1-margin)] && isBg(W-1-margin, y)) { 
        visited[y*W+(W-1-margin)] = 1; queue.push(W-1-margin, y); 
      }
    }
  }

  let qi = 0;
  while (qi < queue.length) {
    const qx = queue[qi++], qy = queue[qi++];
    const i = (qy*W+qx)*4;
    const dist = Math.max(Math.abs(d[i]-bgR),Math.abs(d[i+1]-bgG),Math.abs(d[i+2]-bgB));
    d[i+3] = dist < threshold*0.4 ? 0 : Math.round(d[i+3] * (dist - threshold*0.4) / (threshold*0.6));

    for (const [nx, ny] of [[qx-1,qy],[qx+1,qy],[qx,qy-1],[qx,qy+1]]) {
      if (nx<0||nx>=W||ny<0||ny>=H) continue;
      const ni = ny*W+nx;
      if (!visited[ni] && isBg(nx, ny)) {
        visited[ni] = 1;
        queue.push(nx, ny);
      }
    }
  }

  ctx.putImageData(id, 0, 0);

  // ── 3. Second pass: remove enclosed near-bg pockets ─────────────────────
  // BFS stops at smoke/effect borders leaving bg-colored islands inside.
  // Only run when the detected bg is bright (white/light hero backgrounds).
  const bgBrightness = (bgR + bgG + bgB) / 3;
  if (bgBrightness > 170) {
    const tightThr = 55;
    const id2 = ctx.getImageData(0, 0, W, H);
    const d2  = id2.data;
    for (let i = 0; i < d2.length; i += 4) {
      if (d2[i+3] < 20) continue;
      const dist = Math.max(
        Math.abs(d2[i]   - bgR),
        Math.abs(d2[i+1] - bgG),
        Math.abs(d2[i+2] - bgB)
      );
      if (dist < tightThr) {
        d2[i+3] = dist < tightThr * 0.3
          ? 0
          : Math.round(d2[i+3] * ((dist - tightThr*0.3) / (tightThr*0.7)));
      }
    }
    ctx.putImageData(id2, 0, 0);
  }

  return oc;
}

/** Load a sprite and return a Promise that resolves to a bg-stripped canvas */
function loadEnemyImg(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(removeWhiteBg(img));
    img.onerror = () => { resolve(img); }; // fallback: raw image
    img.src = src;
  });
}

// ─── Background drawing (image-based) ────────────────────────────────────────
function drawBackground() {
  const stage = STAGES[currentStageIdx];
  const img   = bgImages[stage.bgSrc];
  const camX  = window.cameraX || 0;

  if (img && img.complete && img.naturalWidth > 0) {
    // Crop the bottom 12% of the image to remove baked-in watermarks (like resolution text)
    const sx = 0;
    const sy = 0;
    const sWidth = img.naturalWidth;
    const sHeight = img.naturalHeight * 0.88; 
    
    const startTile = Math.floor(camX / canvas.width);
    for (let i = startTile - 1; i <= startTile + 2; i++) {
      ctx.save();
      if (Math.abs(i) % 2 === 1) {
        // Mirror odd tiles to create a seamless reflection
        ctx.translate((i * canvas.width) + canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
      } else {
        // Draw even tiles normally
        ctx.drawImage(img, sx, sy, sWidth, sHeight, i * canvas.width, 0, canvas.width, canvas.height);
      }
      ctx.restore();
    }

    // Subtle vignette so characters stay readable on any background
    const vig = ctx.createRadialGradient(
      camX + canvas.width / 2, canvas.height / 2, canvas.height * 0.18,
      camX + canvas.width / 2, canvas.height / 2, canvas.height
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.48)');
    ctx.fillStyle = vig;
    ctx.fillRect(camX, 0, canvas.width, canvas.height);
  } else {
    // Fallback gradient while images load
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.7);
    sky.addColorStop(0,   '#0a0015');
    sky.addColorStop(0.5, '#1a0030');
    sky.addColorStop(1,   '#2d0050');
    ctx.fillStyle = sky;
    ctx.fillRect(camX, 0, canvas.width, canvas.height);
    const grd = ctx.createLinearGradient(0, canvas.height - 96, 0, canvas.height);
    grd.addColorStop(0, '#2a083a');
    grd.addColorStop(1, '#12001f');
    ctx.fillStyle = grd;
    ctx.fillRect(camX, canvas.height - 96, canvas.width, 96);
  }

  // Location label (bottom-left strip)
  ctx.save();
  ctx.globalAlpha = 0.62;
  ctx.fillStyle   = '#000';
  ctx.fillRect(camX, canvas.height - 94, 210, 20);
  ctx.globalAlpha = 1;
  ctx.fillStyle   = '#fbc531';
  ctx.font        = '8px "Press Start 2P", cursive';
  ctx.fillText(stage.location.toUpperCase(), camX + 8, canvas.height - 79);
  ctx.restore();
}

// ─── Players ─────────────────────────────────────────────────────────────────

const CHAR_W   = 80;   // hitbox width
const CHAR_H   = 160;  // hitbox height
const ATTACK_W = 130;  // sword reach
const ATTACK_H = 70;

// ─ Player (always p1.png) ─────────────────────────────────────────────
const player = new Player(game, {
  position:    { x: 80, y: 10 },
  velocity:    { x: 0,  y: 0  },
  name:        'Player 1',
  facingRight: true,
  offset:      { x: CHAR_W, y: 70 },
  spriteSrc:   '/assets/characters/p1.png',
  swordSrc:    '/assets/characters/sword2.png',
  shieldSrc:   '/assets/characters/shield.png',
  skillSrc:    '/assets/characters/skill.png',
  accentColor: '#4fc3f7',
  isEnemy:     false,
});
player.width  = CHAR_W;
player.height = CHAR_H;
player.attackBox.width  = ATTACK_W;
player.attackBox.height = ATTACK_H;

// ─ Enemy (changes per stage) ─────────────────────────────────────────
const enemy = new Player(game, {
  position:    { x: 760, y: 10 },
  velocity:    { x: 0,   y: 0  },
  name:        STAGES[0].enemyName,
  facingRight: false,
  offset:      { x: -ATTACK_W, y: 70 },
  spriteSrc:   STAGES[0].enemySrc,
  swordSrc:    '/assets/characters/sword1.png',
  shieldSrc:   '/assets/characters/shield.png',
  skillSrc:    '/assets/characters/skill.png',
  accentColor: STAGES[0].accentColor,
  isEnemy:     true,
});
enemy.width  = CHAR_W;
enemy.height = CHAR_H;
enemy.attackBox.width  = ATTACK_W;
enemy.attackBox.height = ATTACK_H;

// ─ Extra Enemy Pool (up to 7 extra) ───────────────────────
const EXTRA_ENEMY_SPAWN_X = [540, 340, 640, 240, 740, 140, 440]; // Flanking positions
const EXTRA_ENEMY_COLORS  = ['#ff7043','#ab47bc','#26c6da', '#ffeb3b', '#66bb6a', '#ec407a', '#8d6e63'];

const enemyPool = EXTRA_ENEMY_SPAWN_X.map((spawnX, i) => {
  const e = new Player(game, {
    position:    { x: spawnX, y: 10 },
    velocity:    { x: 0, y: 0 },
    name:        'Enemy',
    facingRight: false,
    offset:      { x: -ATTACK_W, y: 70 },
    spriteSrc:   STAGES[0].enemySrc,
    swordSrc:    '/assets/characters/sword1.png',
    shieldSrc:   '/assets/characters/shield.png',
    skillSrc:    '/assets/characters/skill.png',
    accentColor: EXTRA_ENEMY_COLORS[i],
    isEnemy:     true,
  });
  e.width  = CHAR_W;
  e.height = CHAR_H;
  e.attackBox.width  = ATTACK_W;
  e.attackBox.height = ATTACK_H;
  e.isHidden = true; // Start hidden — activated per round
  e.isDead   = true;
  return e;
});

// Tracks how many extra enemies are active this round (0 = only main enemy)
let activeExtraCount = 0;

// ─── Pool Enemy AI — Real Fighting Logic ─────────────────────────────────────
// Each pool enemy runs independently but respects a shared "turn" system:
// only MAX_ATTACKERS enemies may attack simultaneously. Others circle and wait.
const MAX_ATTACKERS = 2; // max enemies attacking at same time
let _attackerCount  = 0; // shared counter across all pool AIs

function createAI(target, idx = 0) {
  let state       = 'footsie';  // start in neutral spacing state
  let timer       = 0;
  let cd          = 0;
  let myTurn      = false;        // whether this enemy holds an "attack turn" slot
  let evadeTimer  = 0;            // frames left evading player's attack
  let waitTimer   = Math.round(Math.random() * 20); // was 40 — shorter startup stagger

  const release = () => { if (myTurn) { _attackerCount = Math.max(0, _attackerCount - 1); myTurn = false; } };
  const claim   = () => { if (!myTurn && _attackerCount < MAX_ATTACKERS) { _attackerCount++; myTurn = true; return true; } return myTurn; };

  return function tick() {
    if (target.isHidden || target.isDead || player.isDead) { release(); return; }

    // Startup delay — stagger each enemy entering the fight
    if (waitTimer > 0) { waitTimer--; target.velocity.x = 0; return; }

    const activeEnemies = 1 + enemyPool.filter(e => !e.isHidden && !e.isDead).length;
    // Speed: slightly slower with more enemies but never sluggish
    const spd = Math.max(5.0, 6.5 - (activeEnemies - 1) * 0.25); // was max(3.8, 5.0-...)
    const cdScale = Math.max(0.55, 1 - (activeEnemies - 1) * 0.07); // slightly faster CDs

    const dx       = player.position.x - target.position.x;
    const absDx    = Math.abs(dx);
    const grounded = target.velocity.y === 0;
    const dir      = dx > 0 ? 1 : -1;

    // Low HP → desperation: enemy becomes more aggressive
    const lowHp    = target.health < 35;

    cd = Math.max(0, cd - 1);
    timer++;

    target.facingRight = dx > 0;

    // ── EVADE: player is actively attacking → step back ────────────────────
    const playerAttacking = player.isAttacking || player.isKnifeAttacking || player.isSpecialAttacking;
    if (playerAttacking && absDx < 160 && grounded && state !== 'jump_atk') {
      evadeTimer = 12; // was 22 — faster re-engage after evade
    }
    if (evadeTimer > 0) {
      evadeTimer--;
      target.velocity.x = -dir * spd * 0.9;  // step away from player
      if (evadeTimer === 0 && !cd) {
        // Punish immediately after evading (player's attack just finished)
        if (claim()) { state = absDx < 140 ? 'punch' : 'approach'; timer = 0; }
      }
      return;
    }

    switch (state) {

      // ── FOOTSIE: maintain mid-range, look for opening ──────────────────────
      case 'footsie': {
        const idealDist = lowHp ? 110 : 145; // low HP → get closer
        if (absDx > idealDist + 30) {
          target.velocity.x = dir * spd * 0.75; // walk in slowly
        } else if (absDx < idealDist - 30) {
          target.velocity.x = -dir * spd * 0.6; // maintain gap
        } else {
          target.velocity.x = 0;
        }

        // Jump to follow if player is above
        if (player.position.y < target.position.y - 90 && grounded) target.velocity.y = -16;

        // After some footsie time, decide to attack (if it's our turn)
        if (timer > 16 + idx * 4) { // was 28 + idx*8 — attacks faster
          const r = Math.random();
          if (absDx <= 150 && (lowHp || claim())) {
            if (!lowHp) _attackerCount = Math.max(0, _attackerCount - 1); // claim handled inline
            if (lowHp || myTurn) {
              if (!myTurn) { _attackerCount++; myTurn = true; }
              state = r < 0.45 ? 'dash_punch' : r < 0.80 ? 'dash_kick' : 'jump_atk';
              timer = 0;
            }
          } else {
            // Not our turn yet — reset timer and keep circling
            timer = 0;
          }
        }
        break;
      }

      // ── DASH PUNCH: close gap fast, jab ────────────────────────────────────
      case 'dash_punch': {
        if (timer < 4) {
          target.velocity.x = -dir * spd * 0.5; // wind-up (shorter, was 6 frames)
        } else if (timer < 9) {
          target.velocity.x = dir * spd * 1.8;  // faster dash (was 1.5)
        } else {
          target.velocity.x = 0;
          if (timer === 9 && !cd) { target.attack(); cd = Math.round(22 * cdScale); } // was 12, cd 32
        }
        if (timer >= 16) { release(); state = 'footsie'; timer = 0; } // was 22
        break;
      }

      // ── DASH KICK: step in and sword slash ─────────────────────────────────
      case 'dash_kick': {
        if (timer < 4) {
          target.velocity.x = dir * spd * 0.4;
        } else if (timer === 4 && !cd) {
          target.knifeAttack();
          cd = Math.round(28 * cdScale); // was 40
          target.velocity.x = dir * spd * 1.3;
        } else {
          target.velocity.x *= 0.7;
        }
        if (timer >= 16) { release(); state = 'footsie'; timer = 0; } // was 22
        break;
      }

      // ── JUMP ATTACK: leap in with aerial hit ───────────────────────────────
      case 'jump_atk': {
        if (timer === 1 && grounded) {
          target.velocity.y = -16;
          target.velocity.x = dir * spd * 1.1;
        }
        if (timer === 8 && !cd) { target.attack(); cd = Math.round(26 * cdScale); } // was frame 11, cd 38
        if (timer > 26 && grounded) { release(); state = 'footsie'; timer = 0; } // was 34
        break;
      }

      // ── APPROACH: used when we're too far ─────────────────────────────────
      case 'approach': {
        target.velocity.x = dir * spd;
        if (player.position.y < target.position.y - 90 && grounded) target.velocity.y = -16;
        if (absDx <= 150) { state = 'footsie'; timer = 0; }
        break;
      }
    }

    // ── Release turn slot after long inactivity ────────────────────────────
    if (timer > 70) { release(); state = 'footsie'; timer = 0; } // was 100
  };
}

// Create pool AI (pass index for stagger)
const poolAITick = enemyPool.map((e, i) => createAI(e, i));



export const remotePlayers = {};

// Spawn positions for up to 10 players (HOST=slot0, clients=slot1..9)
const SPAWN_XS     = [80,  760, 420, 200, 600, 310, 520, 160, 660, 360];
const BRAWL_COLORS = ['#4fc3f7','#ff6b6b','#51cf66','#ffd43b','#cc5de8',
                      '#ff922b','#20c997','#94d82d','#f06595','#74c0fc'];
let _clientJoinOrder = {}; // peerId -> join index (0 = host)


// ─── Input ────────────────────────────────────────────────────────────────────
const keys = {
  a: { pressed: false },
  d: { pressed: false },
  w: { pressed: false },
  s: { pressed: false }
};

// ─── Enemy AI ─────────────────────────────────────────────────────────────────
// refreshAI() decides who controls the enemy slot at any given moment.
// If joinId is present in URL, we are ALWAYS going to be a CLIENT — hide AI immediately.
const _isOnlineClient = !!new URLSearchParams(window.location.search).get('join');

function refreshAI() {
  const isOnline = network.role !== NetworkRole.OFFLINE;
  const p2HealthEl = document.querySelector('.p2-health');
  const p2NameEl   = document.querySelector('.p2-health .player-name');

  if (!isOnline) {
    // OFFLINE: show AI enemy health bar with stage enemy name
    enemy.isAI    = true;
    enemy.isHidden = false;
    if (p2HealthEl) p2HealthEl.style.visibility = 'visible';
    if (p2NameEl)   p2NameEl.textContent = STAGES[currentStageIdx].enemyName;
  } else {
    // ONLINE: hide AI enemy, show P2 bar for the first connected remote player
    enemy.isAI    = false;
    enemy.isHidden = true;

    const remoteIds     = Object.keys(remotePlayers);
    const hasOpponent   = remoteIds.length > 0;

    if (p2HealthEl) p2HealthEl.style.visibility = hasOpponent ? 'visible' : 'hidden';

    // Name the opponent slot dynamically
    if (hasOpponent && p2NameEl) {
      const firstId = remoteIds[0];
      const opponentName = remotePlayers[firstId].name || 'Opponent';
      p2NameEl.textContent = opponentName;
    }
  }
}
enemy.isAI = true;
enemy.isHidden = _isOnlineClient;


const AI = {
  APPROACH:  'approach',
  BACK_OFF:  'back_off',
  PUNCH:     'punch',
  KICK:      'kick',
  SPECIAL:   'special',
  SHIELD:    'shield',
  JUMP_ATK:  'jump_atk',
  JUMP_BACK: 'jump_back'
};

// ─── Main Enemy AI — Real Fighting Logic ─────────────────────────────────────
// Realistic fighter behavior: footsies, evade on player swing, punish on whiff,
// combo chains, shield occasionally, desperation mode at low HP.
let aiState      = AI.APPROACH;
let aiTimer      = 0;
let aiCooldown   = 0;
let aiEvade      = 0;   // frames left in evade after player swings
const AI_SPEED   = 6;          // was 4 — faster movement across the board
const CLOSE_DIST = CHAR_W + 50;

function tickEnemyAI() {
  if (enemy.isDead || player.isDead) return;

  const dx       = player.position.x - enemy.position.x;
  const absDx    = Math.abs(dx);
  const grounded = enemy.velocity.y === 0;
  const dir      = dx > 0 ? 1 : -1;
  const lowHp    = enemy.health < 30; // desperation mode

  aiCooldown = Math.max(0, aiCooldown - 1);
  aiTimer++;
  enemy.facingRight = dx > 0;

  // ── EVADE: step back when player is attacking ──────────────────────────────
  const playerSwinging = player.isAttacking || player.isKnifeAttacking || player.isSpecialAttacking;
  if (playerSwinging && absDx < 170 && grounded) {
    aiEvade = 12; // was 20 — shorter evade, re-engages faster
  }
  if (aiEvade > 0) {
    aiEvade--;
    enemy.velocity.x = -dir * AI_SPEED * 1.1; // step away
    if (aiEvade === 0 && !aiCooldown) {
      // Punish immediately after player's swing ends
      aiState = absDx < 150 ? 'punish' : 'footsie';
      aiTimer = 0;
    }
    return;
  }

  switch (aiState) {

    // ── FOOTSIE: neutral spacing, wait for opening ─────────────────────────
    case 'footsie': {
      const ideal = lowHp ? 100 : 135;
      if (absDx > ideal + 25)      enemy.velocity.x = dir  * AI_SPEED * 0.85;
      else if (absDx < ideal - 25) enemy.velocity.x = -dir * AI_SPEED * 0.7;
      else                         enemy.velocity.x = 0;

      if (player.position.y < enemy.position.y - 90 && grounded) enemy.velocity.y = -16;

      if (aiTimer > 18) {  // was 32 — attacks twice as often
        const roll = Math.random();
        if (absDx <= 160) {
          // 40% dash-punch, 30% sword slash, 15% combo, 10% jump, 5% back off
          if      (roll < 0.40) aiState = 'dash_punch';
          else if (roll < 0.70) aiState = AI.KICK;
          else if (roll < 0.85) aiState = 'combo';
          else if (roll < 0.95) aiState = AI.JUMP_ATK;
          else                  aiState = AI.BACK_OFF;
          aiTimer = 0;
        } else {
          aiState = AI.APPROACH; aiTimer = 0;
        }
      }
      break;
    }

    // ── APPROACH: close gap to footsie range ──────────────────────────────
    case AI.APPROACH: {
      enemy.velocity.x = dir * AI_SPEED * 1.5; // was 1.3
      if (player.position.y < enemy.position.y - 80 && grounded) enemy.velocity.y = -16;
      if (absDx <= CLOSE_DIST + 20) { aiState = 'footsie'; aiTimer = 0; }
      break;
    }

    // ── DASH PUNCH: step back (telegraph) → burst in → jab ───────────────
    case 'dash_punch': {
      if (aiTimer < 5)                   enemy.velocity.x = -dir * AI_SPEED * 0.4; // wind-up
      else if (aiTimer < 10)             enemy.velocity.x =  dir * AI_SPEED * 2.2; // dash
      else                               enemy.velocity.x = 0;
      if (aiTimer === 10 && !aiCooldown) { enemy.attack(); aiCooldown = 18; } // was 26
      if (aiTimer >= 16) { aiState = Math.random() < 0.55 ? AI.KICK : 'footsie'; aiTimer = 0; } // was 20
      break;
    }

    // ── KICK (sword slash): step in and lunge ─────────────────────────────
    case AI.KICK: {
      enemy.velocity.x = dir * AI_SPEED * 0.6;
      if (aiTimer === 5 && !aiCooldown) { enemy.knifeAttack(); aiCooldown = 22; } // was frame 6, cd 34
      if (aiTimer === 5) enemy.velocity.x = dir * AI_SPEED * 1.5; // lunge
      if (aiTimer >= 14) { aiState = 'footsie'; aiTimer = 0; } // was 18
      break;
    }

    // ── COMBO: punch → kick back-to-back ──────────────────────────────────
    case 'combo': {
      enemy.velocity.x = dir * 1.5;
      if (aiTimer === 3  && !aiCooldown) { enemy.attack();      aiCooldown = 10; } // was 14
      if (aiTimer === 14 && !aiCooldown) { enemy.knifeAttack(); aiCooldown = 20; } // was 28
      if (aiTimer >= 24) { aiState = AI.BACK_OFF; aiTimer = 0; } // was 30
      break;
    }

    // ── PUNISH: instant counter when player whiffs ─────────────────────────
    case 'punish': {
      enemy.velocity.x = dir * AI_SPEED * 1.9; // burst in
      if (aiTimer === 3  && !aiCooldown) { enemy.attack();      aiCooldown = 8;  } // was 12
      if (aiTimer === 11 && !aiCooldown) { enemy.knifeAttack(); aiCooldown = 16; } // was 22
      if (aiTimer >= 18) { aiState = 'footsie'; aiTimer = 0; } // was 24
      break;
    }

    // ── BACK OFF: short retreat ────────────────────────────────────────────
    case AI.BACK_OFF: {
      enemy.velocity.x = -dir * AI_SPEED;
      if (aiTimer > 10) { aiState = 'footsie'; aiTimer = 0; } // was 16
      break;
    }

    // ── JUMP ATTACK: aerial dive ───────────────────────────────────────────
    case AI.JUMP_ATK: {
      if (aiTimer === 1 && grounded) {
        enemy.velocity.y = -16;
        enemy.velocity.x = dir * AI_SPEED * 1.5;
      }
      if (aiTimer === 8 && !aiCooldown) { enemy.attack(); aiCooldown = 22; } // was frame 10, cd 30
      if (aiTimer > 24 && grounded) { aiState = 'footsie'; aiTimer = 0; } // was 30
      break;
    }
  }

  // Desperation: low HP → skip footsie wait, go straight to attack
  if (lowHp && aiState === 'footsie' && aiTimer > 10) { // was 16
    aiState = Math.random() < 0.6 ? 'dash_punch' : 'combo';
    aiTimer = 0;
  }

  // Safety reset
  if (aiTimer > 90) { aiState = 'footsie'; aiTimer = 0; }
}



// ─── Stage progression helpers ────────────────────────────────────────────────

const gameOverScreen = document.getElementById('game-over-screen');
const gameOverTitle  = document.getElementById('game-over-title');
const gameOverSub    = document.getElementById('game-over-sub');
const retryBtn       = document.getElementById('btn-retry');
const btnStageSelect = document.getElementById('btn-stage-select');
const scorePanelEl   = document.getElementById('score-list-panel');

// ─── Score System ─────────────────────────────────────────────────────────────
const SCORE_KEY  = 'fightgame_scores_v3';  // v3 clears static test data
const MAX_SCORES = 10;    // keep top 10 entries

/** Get and persist the current player name */
function getPlayerName() {
  const inputEl = document.getElementById('player-name-input');
  const fromInput = (inputEl && inputEl.value.trim()) || '';
  if (fromInput) {
    try { localStorage.setItem('fightgame_player_name', fromInput); } catch {}
    return fromInput.toUpperCase();
  }
  // Fall back to last saved name
  try {
    const saved = localStorage.getItem('fightgame_player_name') || '';
    if (saved) return saved.toUpperCase();
  } catch {}
  return 'PLAYER';
}

/**
 * Format a timestamp as DD/MM/YYYY HH:MM (always consistent, no locale variance).
 */
function formatDate(ts) {
  const d  = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

/** Load saved scores from localStorage (returns array sorted by score desc) */
function loadScores() {
  try {
    const scores = JSON.parse(localStorage.getItem(SCORE_KEY) || '[]');
    // Filter from real playing not static content (e.g. 0 kills and base time score)
    return scores.filter(s => s.kills > 0 || s.score > 300);
  } catch { return []; }
}

/** Save a new score entry and return the updated sorted list */
function saveScore(entry) {
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_SCORES);
  try { localStorage.setItem(SCORE_KEY, JSON.stringify(trimmed)); } catch {}
  return trimmed;
}

/**
 * Compute a numeric score:
 *  - 500 pts per stage cleared
 *  - 200 pts per enemy killed
 *  - 5 pts per second of time remaining
 *  - Bonus 1000 pts for full-game victory
 */
function calcScore(stageIdx, kills, secondsLeft, won) {
  const stageBonus   = stageIdx * 500;
  const killBonus    = kills    * 200;
  const timeBonus    = Math.max(0, secondsLeft) * 5;
  const victoryBonus = won ? 1000 : 0;
  return stageBonus + killBonus + timeBonus + victoryBonus;
}

/** Render the score panel inside #score-list-panel */
function renderScoreList(highlightIdx = -1) {
  if (!scorePanelEl) return;
  const scores = loadScores();
  if (scores.length === 0) {
    scorePanelEl.innerHTML = '';
    return;
  }

  // ── Labels row (mirrors exact same DOM structure as a data row) ──────────
  const labels = [
    `<div class="sl-labels">`,
      `<span class="sl-rank"></span>`,          // same 24px spacer as medal
      `<div class="sl-body">`,
        `<div class="sl-top">`,
          `<span class="sl-lbl-name">NAME</span>`,
          `<span class="sl-lbl-score">PTS</span>`,
        `</div>`,
        `<div class="sl-bottom">`,
          `<span class="sl-lbl-out"></span>`,    // blank — outcome icon column
          `<span class="sl-lbl-stage">STAGE</span>`,
          `<span class="sl-lbl-kill">KILL</span>`,
          `<span class="sl-lbl-date">DATE</span>`,
        `</div>`,
      `</div>`,
    `</div>`,
  ].join('');

  // ── Data rows ────────────────────────────────────────────────────────────
  const rows = scores.map((s, i) => {
    const isNew   = i === highlightIdx;
    const medal   = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
    const outcome = s.won ? '✅' : '💀';
    const name    = (s.name || 'PLAYER').toUpperCase();
    const date    = formatDate(s.ts);
    return [
      `<div class="sl-row${isNew ? ' sl-new' : ''}">`,
        `<span class="sl-rank">${medal}</span>`,
        `<div class="sl-body">`,
          // Top line: NAME  ·  SCORE
          `<div class="sl-top">`,
            `<span class="sl-name">${name}</span>`,
            `<span class="sl-score">${s.score.toLocaleString()} pts</span>`,
          `</div>`,
          // Bottom line: OUTCOME  ·  STAGE  ·  KILL  ·  DATE
          `<div class="sl-bottom">`,
            `<span class="sl-outcome">${outcome}</span>`,
            `<span class="sl-stage-val">Stage ${s.stage}</span>`,
            `<span class="sl-kill-val">${s.kills}</span>`,
            `<span class="sl-date">${date}</span>`,
          `</div>`,
        `</div>`,
      `</div>`,
    ].join('');
  }).join('');

  scorePanelEl.innerHTML =
    `<div class="sl-fixed-top">` +
      `<div class="sl-header">🏆 BEST SCORES</div>` +
      labels +
    `</div>` +
    rows;
}

function updateEnemyHUD() {
  // With random enemies, name comes from whoever is fighting not from the stage
  // This is a no-op placeholder (handled by updateEnemyHealthHUD)
}

/** 
 * Calculate and show the collective health of all active enemies.
 * Ensures the main UI bar represents the entire squad's life.
 */
function updateEnemyHealthHUD() {
  const isOnline = network.role !== NetworkRole.OFFLINE;
  const p2Bar    = game.p2HealthBar;
  if (!p2Bar || isOnline) return;

  // OFFLINE: Multi-enemy health bar logic
  let totalMax = enemy._maxHealth || 250; // Main enemy
  let totalCur = Math.max(0, enemy.health);
  let activeCount = 1;

  enemyPool.forEach(e => {
    if (!e.isHidden) {
      totalMax += e._maxHealth || 250;
      totalCur += Math.max(0, e.health);
      activeCount++;
    }
  });

  const avgHealth = (totalCur / totalMax) * 100;
  p2Bar.style.width = avgHealth + '%';

  // Update label to show survivors count
  const aliveCount = (enemy.health > 0 ? 1 : 0) + 
                     enemyPool.filter(e => !e.isHidden && e.health > 0).length;
  const nameEl     = document.querySelector('.p2-health .player-name');
  if (nameEl) {
    const baseName = STAGES[currentStageIdx].enemyName;
    nameEl.textContent = aliveCount > 1 ? `${baseName} (+ ${aliveCount-1})` : baseName;
    
    // Visual cue: if all are dead, show 'OUT OF BLOOD'
    if (aliveCount === 0) nameEl.textContent = 'ELIMINATED';
  }
}

(function injectStageBadge() {
  if (document.getElementById('stage-badge')) return;
  const uiLayer = document.getElementById('ui-layer');
  if (!uiLayer) return;
  const badge = document.createElement('div');
  badge.id = 'stage-badge';
  badge.innerHTML =
    '<div class="stage-badge-label">STAGE</div>' +
    '<div class="stage-badge-num" id="stage-badge-num">1 / ' + BACKGROUNDS.length + '</div>';
  uiLayer.appendChild(badge);
})();

function updateStageBadge() {
  const el = document.getElementById('stage-badge-num');
  if (el) el.textContent = (currentStageIdx + 1) + ' / ' + BACKGROUNDS.length;
}

/** Flash a centred banner: ROUND X and enemy count */
function showRoundBanner(roundNum, enemyCount) {
  let banner = document.getElementById('round-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'round-banner';
    Object.assign(banner.style, {
      position:      'absolute',
      top:           '50%',
      left:          '50%',
      transform:     'translate(-50%, -50%) scale(0)',
      fontFamily:    '"Press Start 2P", cursive',
      fontSize:      '28px',
      color:         '#ffd600',
      textShadow:    '0 0 18px #ff6f00, 0 0 4px #000',
      textAlign:     'center',
      whiteSpace:    'nowrap',
      pointerEvents: 'none',
      zIndex:        '999',
      lineHeight:    '1.5',
      transition:    'transform 0.2s cubic-bezier(.17,.67,.3,1.5), opacity 0.4s',
      opacity:       '0',
    });
    document.getElementById('game-container').appendChild(banner);
  }
  const sub = enemyCount > 1 ? `\n⚔️ ${enemyCount} ENEMIES!` : '';
  banner.textContent = `ROUND ${roundNum}${sub}`;
  banner.style.opacity   = '1';
  banner.style.transform = 'translate(-50%, -50%) scale(1.05)';
  setTimeout(() => {
    banner.style.opacity   = '0';
    banner.style.transform = 'translate(-50%, -50%) scale(0.8)';
  }, 2000);
}

/** Full round reset */
function resetRound(omitPlayerPos = false) {
  particles.length = 0;
  gameActive       = true;

  // Reset wave counter whenever entering a new round (not a wave continuation)
  if (!omitPlayerPos) {
    currentWaveIdx = 0;
    _scoreKills = 0;               // Reset kill count for new stage
  }
  _scoreRoundStart = Date.now();   // Reset timer

  // --- Player ---
  player.reset();
  if (!omitPlayerPos) {
    if (network.role === NetworkRole.CLIENT) {
      player.position.x = 760;
      player.facingRight = false;
    } else {
      player.position.x = 80;
      player.facingRight = true;
    }
    player.position.y = 10;
  }

  // --- Remote players: reset health so next round is fair ---
  Object.values(remotePlayers).forEach(rp => rp.reset());

  // --- Enemy (assign enemies based on stage progression) ---
  // All stages start at 1 enemy, max grows by 1 per stage:
  //   Stage 1: 1-2, Stage 2: 1-3, Stage 3: 1-4, Stage 4: 1-5, Stage 5: 1-6, Stage 6: 1-7
  const totalEnemyCount = 1 + currentWaveIdx;
  activeExtraCount = totalEnemyCount - 1; // extras = total - main enemy

  // Pick distinct random enemies from the roster for each slot
  const chosenEnemies = randomDistinct(ENEMY_ROSTER, totalEnemyCount);
  const mainEnemy = chosenEnemies[0];

  enemy.reset();
  
  // Set enemy HP dynamically based on crowd size to balance difficulty
  let enemyHp = 250;
  if (totalEnemyCount === 2) enemyHp = 190;
  else if (totalEnemyCount === 3) enemyHp = 170;
  else if (totalEnemyCount === 4) enemyHp = 160;
  else if (totalEnemyCount >= 5) enemyHp = 150;
  enemy.health = enemyHp;
  enemy._maxHealth = enemyHp;
  
  if (network.role === NetworkRole.CLIENT) {
    enemy.position.x = 80;
    enemy.facingRight = true;
  } else {
    enemy.position.x = 760;
    enemy.facingRight = false;
  }
  enemy.position.y  = -250; // Dynamic Sky Drop
  enemy.name        = mainEnemy.name;
  enemy.accentColor = mainEnemy.accentColor;
  // Load + strip white background for the main enemy
  loadEnemyImg(mainEnemy.src).then(canvas => { enemy.img = canvas; });

  enemyPool.forEach((e, i) => {
    e.reset();
    if (i < activeExtraCount) {
      const extraEnemy = chosenEnemies[i + 1];
      e.isHidden          = false;
      e.health            = enemyHp;
      e._maxHealth        = enemyHp;
      e.position.x        = EXTRA_ENEMY_SPAWN_X[i];
      e.position.y        = -250 - (i * 80); // Staggered Sky Drop for multiple enemies
      e.facingRight       = false;
      e.name              = extraEnemy ? extraEnemy.name : mainEnemy.name;
      e.accentColor       = EXTRA_ENEMY_COLORS[i]; // keep the pool colors (no change)
      const poolSrc = extraEnemy ? extraEnemy.src : mainEnemy.src;
      loadEnemyImg(poolSrc).then(canvas => { e.img = canvas; });
    } else {
      e.isHidden = true;
      e.isDead   = true;
      e.health   = 0;
    }
  });

  // Show how many enemies incoming via a quick banner
  showRoundBanner(currentStageIdx + 1, totalEnemyCount);

  // --- HUD ---
  // Player HP is locked at 250 (does not scale with enemy count)
  player.health     = 250;
  player._maxHealth = 250;

  game.p1HealthBar.style.width   = '100%';
  game.displayText.style.display = 'none';
  updateEnemyHealthHUD();
  updateStageBadge();

  // --- AI ---
  aiState    = AI.APPROACH;
  aiTimer    = 0;
  aiCooldown = 0;

  // Pivot AI based on connections: Solo = AI, Online = PvP
  refreshAI();

  if (enemy.isAI) {
    const p2Name = document.querySelector('.p2-health .player-name');
    if (p2Name) p2Name.textContent = enemy.name;
  }

  // --- Timer: reset countdown and restart ---
  clearTimeout(timerId);
  countdown = 60;
  game.timerEl.innerHTML = countdown;
  decreaseTimer();
}

let isTransitioning     = false;
let transitionStep      = 'none'; // 'walk-out' | 'walk-in'
let transitionTargetIdx = 0;

function goToStage(idx) {
  gameActive          = false;
  transitionTargetIdx = idx;
  transitionStep      = 'walk-out';
  isTransitioning     = true;
  clearTimeout(timerId);
  currentWaveIdx      = 0;
  
  // Disable boundary clamping so player can walk off-screen
  player.clamping = false;

  // Hide any victory text immediately for seamless feel
  game.displayText.style.display = 'none';
}

function showGameOver() {
  gameActive = false;
  gameOverTitle.textContent = 'GAME OVER';
  gameOverSub.textContent   = 'Defeated at ' + BACKGROUNDS[currentStageIdx].location;
  retryBtn.textContent = '▶ RETRY';

  // Save score — capture player name at the moment of game-over
  const secondsLeft = countdown;
  const sc = calcScore(currentStageIdx, _scoreKills, secondsLeft, false);
  const entry = {
    name:  getPlayerName(),
    score: sc,
    stage: currentStageIdx + 1,
    kills: _scoreKills,
    time:  secondsLeft,
    won:   false,
    ts:    Date.now()
  };
  const updatedList = saveScore(entry);
  const newIdx = updatedList.findIndex(e => e.ts === entry.ts);

  gameOverScreen.classList.remove('hidden');
  requestAnimationFrame(() => {
    gameOverScreen.classList.add('visible');
    renderScoreList(newIdx);
  });
}

function showVictory() {
  gameActive = false;
  gameOverTitle.textContent = '🏆 VICTORY!';
  gameOverSub.textContent   = BACKGROUNDS[currentStageIdx].location + ' — CLEARED!';
  retryBtn.textContent = '▶ PLAY AGAIN';

  // Save score — capture player name at the moment of victory
  const secondsLeft = countdown;
  const sc = calcScore(currentStageIdx, _scoreKills, secondsLeft, currentStageIdx === BACKGROUNDS.length - 1);
  const entry = {
    name:  getPlayerName(),
    score: sc,
    stage: currentStageIdx + 1,
    kills: _scoreKills,
    time:  secondsLeft,
    won:   true,
    ts:    Date.now()
  };
  const updatedList = saveScore(entry);
  const newIdx = updatedList.findIndex(e => e.ts === entry.ts);

  gameOverScreen.classList.remove('hidden');
  requestAnimationFrame(() => {
    gameOverScreen.classList.add('visible');
    renderScoreList(newIdx);
  });
}

// RETRY: restart same stage 
retryBtn.addEventListener('click', () => {
  gameOverScreen.classList.remove('visible');
  setTimeout(() => {
    gameOverScreen.classList.add('hidden');
    currentWaveIdx = 0;
    resetRound();
  }, 500);
});

// SELECT STAGE button: open the full-screen stage selector
if (btnStageSelect) {
  btnStageSelect.addEventListener('click', () => {
    gameOverScreen.classList.remove('visible');
    setTimeout(() => {
      gameOverScreen.classList.add('hidden');
      showStageSelect();
    }, 400);
  });
}

function handlePlayerWin() {
  // Enemy count per stage (waves start at 1 and increment up to the stage number):
  //   Stage 1: max 1   (only 1 fight)
  //   Stage 2: max 2   (waves: 1 → 2)
  //   Stage 3: max 3   (waves: 1 → 2 → 3)
  //   Stage 4: max 4   (waves: 1 → 2 → 3 → 4)
  //   Stage 5: max 5   (waves: 1 → 2 → 3 → 4 → 5)
  //   Stage 6: max 6   (waves: 1 → 2 → 3 → 4 → 5 → 6)
  const maxEnemiesForStage = currentStageIdx + 1;
  const currentTotal = 1 + currentWaveIdx;

  if (currentTotal < maxEnemiesForStage && network.role === NetworkRole.OFFLINE) {
    currentWaveIdx++;
    setTimeout(() => {
      game.displayText.style.display = 'none';
      resetRound(true);
    }, 1500);
    return;
  }

  if (currentStageIdx + 1 < BACKGROUNDS.length) {
    unlockedStageIdx = Math.max(unlockedStageIdx, currentStageIdx + 1);
    updateStageBarHighlight();
  }
  showVictory();
}

function handlePlayerLose() {
  showGameOver();
}

// ─── Timer ─────────────────────────────────────────────────────────────────────
let countdown = 60;
let timerId;
function decreaseTimer() {
  if (!gameActive || window.isHeroPopupActive) return;
  if (countdown > 0) {
    timerId = setTimeout(decreaseTimer, 1000);
    countdown--;
    game.timerEl.innerHTML = countdown;
  }
  if (countdown === 0) {
    // Time out = player couldn't kill enemies in time = player loses
    gameActive = false;
    clearTimeout(timerId);
    game.displayText.innerHTML = 'TIME UP! ⏰';
    game.displayText.style.display = 'flex';
    setTimeout(() => handlePlayerLose(), 2000);
  }
}

// ─── Game Loop ────────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  // Clear
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // --- CAMERA ---
  if (typeof window.cameraX === 'undefined') window.cameraX = 0;
  // Smoothly follow the local player
  if (player && !player.isDead) {
    const idealCamX = player.position.x + (player.width || 60) / 2 - canvas.width / 2;
    window.cameraX += (idealCamX - window.cameraX) * 0.08;
  }
  
  ctx.save();
  ctx.translate(-window.cameraX, 0);

  // Background
  drawBackground();

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].dead || particles[i].alpha <= 0) { particles.splice(i, 1); continue; }
    particles[i].update(ctx);
  }

  // ── Transition Logic ──────────────────────────────────────────────────────
  if (isTransitioning) {
    player.velocity.x = 6; // Autowalk
    if (transitionStep === 'walk-out') {
      if (player.position.x > canvas.width) {
        currentStageIdx = transitionTargetIdx;
        player.position.x = -player.width;
        transitionStep = 'walk-in';
        // Reset stage state but KEEP player walking in
        resetRound(true); 
        gameActive = false; // resetRound sets it true, we need to keep it moving
      }
    } else if (transitionStep === 'walk-in') {
      if (player.position.x >= 80) {
        player.position.x = 80;
        // Clamping remains disabled for unlimited walking
        isTransitioning   = false;
        gameActive        = true;
        transitionStep    = 'none';
      }
    }
  } else {
    // Regular Movement Input
    player.velocity.x = 0;
    if (!window.isHeroPopupActive) {
      if (keys.a.pressed) { player.velocity.x = -5; player.lastKey = 'a'; }
      if (keys.d.pressed) { player.velocity.x =  5; player.lastKey = 'd'; }
    }
  }

  // AI & Physics
  refreshAI();
  if (gameActive && !window.isHeroPopupActive) {
    if (enemy.isAI) {
      tickEnemyAI();
    } else if (network.role === NetworkRole.CLIENT) {
      enemy.velocity.x = 0;
    }
    // Tick AI for each active pool enemy
    poolAITick.forEach((tick, i) => { if (!enemyPool[i].isHidden && !enemyPool[i].isDead) tick(); });
  } else {
    enemy.velocity.x = 0;
    enemyPool.forEach(e => { e.velocity.x = 0; });
  }

  const isOnline = network.role !== NetworkRole.OFFLINE;
  const allFighters = isOnline
    ? [player, ...Object.values(remotePlayers)]
    : [
        player,
        ...(enemy.isHidden ? [] : [enemy]),
        ...enemyPool.filter(e => !e.isHidden && !e.isDead),
      ];
  allFighters.forEach(p => p.update());
  allFighters.forEach(p => emitSkillAmbient(p));

  // Gear Stretch rubber arm visual
  drawGearStretch();

  // Shining fire circle + lightning while skill is active
  drawSkillCircle();

  // Render floating nameplates + HP bars above ALL remote fighters
  allFighters.forEach(p => {
    if (p === player || p.isDead) return;
    const cx  = p.position.x + (p.width  || 60) / 2;
    const barW = 70, barH = 6;
    const hpRatio = Math.max(0, (p.health || 0) / (p._maxHealth || 250));
    const fx = cx - barW / 2;
    const fy = p.position.y - 24;
    // name
    ctx.fillStyle = '#fff';
    ctx.font = '7px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText(p.name || 'Fighter', cx, fy - 4);
    // bar bg
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(fx - 1, fy - 1, barW + 2, barH + 2);
    // bar fill
    const barColor = hpRatio > 0.6 ? '#2ecc71' : hpRatio > 0.3 ? '#f39c12' : '#e74c3c';
    ctx.fillStyle = barColor;
    ctx.fillRect(fx, fy, barW * hpRatio, barH);
    ctx.textAlign = 'left';
  });


  if (gameActive) {
    for (let attacker of allFighters) {
      if (attacker.isDead || (!attacker.isAttacking && !attacker.isKnifeAttacking && !attacker.isSpecialAttacking)) continue;
      for (let victim of allFighters) {
        if (attacker === victim || victim.isDead) continue;

        // Prevent Friendly Fire: Players only hit Enemies, Enemies only hit Players
        const attackerIsPlayer = (attacker === player);
        const victimIsPlayer   = (victim === player);
        if (attackerIsPlayer === victimIsPlayer) continue; 
        if (rectangularCollision({ rectangle1: attacker, rectangle2: victim })) {
          const hx = victim.position.x + CHAR_W / 2;
          const hy = victim.position.y + CHAR_H * 0.4;
          let dmg = 0;
          if (attackerIsPlayer) {
            // ── Player hitting enemy ──────────────────────────────────────────
            // Slightly reduced so enemies take real effort to kill
            if (attacker.isAttacking)             dmg = 8;   // was 10
            else if (attacker.isKnifeAttacking)   dmg = 12;  // was 15
            else if (attacker.isSpecialAttacking) dmg = 22;  // was 25
          } else {
            // ── Enemy hitting player ──────────────────────────────────────────
            // NO dmgMult reduction — turn system already limits simultaneous attackers.
            // Higher base damage so enemies are genuinely dangerous.
            if (attacker.isAttacking)             dmg = 15;  // was 10 * 0.55–1.0
            else if (attacker.isKnifeAttacking)   dmg = 22;  // was 15 * 0.55–1.0
            else if (attacker.isSpecialAttacking) dmg = 35;  // was 25 * 0.55–1.0
          }



          if (dmg >= 0 && (attacker.isAttacking || attacker.isKnifeAttacking || attacker.isSpecialAttacking)) {
            // Regular attacks reset on hit; Special attack stays active (multi-hit window)
            if (attacker.isAttacking)      attacker.isAttacking      = false;
            if (attacker.isKnifeAttacking) attacker.isKnifeAttacking = false;

            // Hit-rate limiter: special can hit same target max once per 400ms
            // FIX: use a unique key per attacker so pool enemies don't block each other
            const now = Date.now();
            victim._lastHitBy = victim._lastHitBy || {};
            const hitKey = attacker === player
              ? 'player_sp'
              : `enemy_${enemyPool.indexOf(attacker)}_sp`; // unique per enemy slot
            const tooSoon = attacker.isSpecialAttacking
              && victim._lastHitBy[hitKey]
              && (now - victim._lastHitBy[hitKey] < 400);

            if (!tooSoon) {
              if (attacker.isSpecialAttacking) victim._lastHitBy[hitKey] = now;
              
              createHitSparks(hx, hy);
              if (victim.isShielding) createShieldSparks(hx, hy);
              else {
                // FIX: use range check (dmgMult can make values non-integer)
                if (dmg <= 12)      createSwordSparks(hx, hy, attacker.facingRight);
                else if (dmg <= 20) createSlashSparks(hx, hy, attacker.facingRight);
                else                createSkillSparks(hx, hy);
              }

              if (network.role === NetworkRole.OFFLINE) {
                const prevHp = victim.health;
                victim.takeHit(dmg);
                if (player._gearKnockback && attacker === player) {
                  const kbDir = attacker.facingRight ? 1 : -1;
                  victim.velocity.x += kbDir * 14;
                  victim.velocity.y  = -8;
                }
                if (victim.isShielding)   Sound.playShieldBlock();
                else if (dmg >= 25)       Sound.playSpecialMove();
                else if (dmg >= 15)       Sound.playSwordClash();
                else                      Sound.playPunch();
                
                if (victim === player) {
                  // FIX: percentage of maxHealth (player can have >250 HP with bonus)
                  const maxHp = player._maxHealth || 250;
                  game.p1HealthBar.style.width = Math.max(0, (player.health / maxHp) * 100) + '%';
                } else {
                  // Track kill when an enemy's HP just reached 0
                  if (prevHp > 0 && victim.health <= 0) _scoreKills++;
                  updateEnemyHealthHUD();

                  // ── Blood cost: player spends blood to deal damage ──────────
                  // Hitting an enemy drains the player's own HP (blood price).
                  // Shielded hits cost nothing — the shield absorbed the blow.
                  if (attackerIsPlayer && !victim.isShielding) {
                    const bloodCost = attacker.isSpecialAttacking ? 12
                                    : attacker.isKnifeAttacking   ? 8
                                    :                               5;
                    player.health = Math.max(1, player.health - bloodCost);
                    const maxHp = player._maxHealth || 250;
                    game.p1HealthBar.style.width = Math.max(0, (player.health / maxHp) * 100) + '%';
                  }
                }

              } else if (network.role === NetworkRole.HOST) {
                victim.takeHit(dmg);
                if (victim === player) {
                  const maxHp = player._maxHealth || 250;
                  game.p1HealthBar.style.width = Math.max(0, (player.health / maxHp) * 100) + '%';
                }
                const firstId = Object.keys(remotePlayers)[0];
                if (firstId && victim === remotePlayers[firstId]) {
                  const vMaxHp = victim._maxHealth || 250;
                  game.p2HealthBar.style.width = Math.max(0, (victim.health / vMaxHp) * 100) + '%';
                }
              } else if (network.role === NetworkRole.CLIENT && attacker === player) {
                network.send({ type: 'hit_report', dmg });
              }
            } // end !tooSoon
          }
        }
      }
    }

    // Win condition
    if (network.role === NetworkRole.OFFLINE) {
      // All enemies must be dead: main enemy + all active pool enemies
      const allExtraDead = enemyPool.every(e => e.isHidden || e.isDead || e.health <= 0);
      const mainEnemyDead = enemy.isHidden || enemy.isDead || enemy.health <= 0;
      
      if (player.health <= 0 || (mainEnemyDead && allExtraDead)) {
        gameActive = false;
        // Calculate a 'total enemy health' for determineWinner (0 or 100)
        const combinedEnemyHealth = (mainEnemyDead && allExtraDead) ? 0 : 100;
        determineWinner({ 
          player, 
          enemy: { health: combinedEnemyHealth }, // Hand-rolled state for HUD
          timerId, 
          game,
          onPlayerWin: handlePlayerWin, 
          onPlayerLose: handlePlayerLose 
        });
      }
    } else if (network.role === NetworkRole.HOST) {
      const remoteIds = Object.keys(remotePlayers);
      if (remoteIds.length > 0) {
        // Check if host is dead OR all remote players are dead
        const allRemotesDead = remoteIds.every(id => remotePlayers[id].health <= 0);
        if (player.health <= 0 || allRemotesDead) {
          const hostWon = player.health > 0;
          gameActive = false;
          // Broadcast round result 3× for reliability
          const rr = { type: 'round_result', hostWon };
          network.send(rr);
          setTimeout(() => network.send(rr), 200);
          setTimeout(() => network.send(rr), 600);
          game.displayText.textContent = hostWon ? 'You Win! 🏆' : 'You Lose...';
          game.displayText.style.display = 'block';
          setTimeout(() => {
            game.displayText.style.display = 'none';
            // ── Return to stage select (host and client both go to picker) ──
            if (hostWon) {
              showStageSelect();
            } else {
              showGameOver();
            }
          }, 2500);
        }
      }
    } else if (network.role === NetworkRole.CLIENT) {
      // CLIENT-side win/lose detection — driven by HP data synced every frame via host_sync.
      // CLIENT does NOT call resetRound/goToStage itself — it follows HOST's stageIdx via host_sync.
      const hostAvatar = remotePlayers['__host__'];
      if (hostAvatar && hostAvatar.health <= 0 && !network._roundResultHandled) {
        network._roundResultHandled = true;
        gameActive = false;
        game.displayText.textContent = 'You Win! 🏆';
        game.displayText.style.display = 'block';
        setTimeout(() => {
          game.displayText.style.display = 'none';
          network._roundResultHandled = false;
          // HOST will trigger goToStage via host_sync — don't resetRound here
        }, 2500);
      } else if (player.isDead && !network._roundResultHandled) {
        network._roundResultHandled = true;
        gameActive = false;
        game.displayText.textContent = 'You Lose...';
        game.displayText.style.display = 'block';
        setTimeout(() => {
          game.displayText.style.display = 'none';
          network._roundResultHandled = false;
          // HOST will trigger goToStage via host_sync — don't resetRound here
        }, 2500);
      }
    }
    // CLIENT stage advancement driven by host_sync stageIdx (see handler below)
  }

  ctx.restore(); // Restore camera translation before UI/Network logic

  // ── Network Broadcast ────────────────────────────────────────────────────
  if (network.role !== NetworkRole.OFFLINE) {
    if (network.role === NetworkRole.CLIENT) {
      network.send({ type: 'client_state', data: getPlayerData(player) });
    } else if (network.role === NetworkRole.HOST) {
      // Build authoritative HP map for all clients
      const clientHp = {};
      Object.keys(remotePlayers).forEach(id => { clientHp[id] = remotePlayers[id].health; });

      const gsClients = {};
      Object.keys(remotePlayers).forEach(id => { gsClients[id] = getPlayerData(remotePlayers[id]); });

      network.send({
        type: 'host_sync',
        data: {
          host:      getPlayerData(player),
          clients:   gsClients,
          clientHp,                // authoritative HP per client peer ID
          stageIdx:  currentStageIdx
        }
      });

      // Update HOST P2 bar to show first connected opponent
      const firstId = Object.keys(remotePlayers)[0];
      if (firstId) {
        game.p2HealthBar.style.width = remotePlayers[firstId].health + '%';
      }
    }
    // Always sync local player bar every frame
    game.p1HealthBar.style.width = player.health + '%';
  }
}

// Network state packers
function getPlayerData(p) {
  return {
    x: p.position.x, y: p.position.y,
    vx: p.velocity.x, vy: p.velocity.y,
    hp: p.health, fr: p.facingRight, st: p._state,
    atk: p.isAttacking, katk: p.isKnifeAttacking,
    satk: p.isSpecialAttacking, shld: p.isShielding,
    w: p.width, src: p.img ? p.img.src : '',
    name: p.name || ''
  };
}

function applyPlayerData(p, d, skipHp = false) {
    p.position.x = d.x; p.position.y = d.y;
    p.velocity.x = d.vx; p.velocity.y = d.vy;
    p.facingRight = d.fr; p._state = d.st;
    if (!skipHp) p.health = d.hp;
    if (d.atk && !p.isAttacking) p.attack();
    if (d.katk && !p.isKnifeAttacking) p.knifeAttack();
    if (d.satk && !p.isSpecialAttacking) p.specialAttack();
    if (d.shld) p.shield(); else p.stopShield();
    if (d.src && (!p.img || !p.img.src.includes(d.src.split('/').pop()))) {
      const img = new Image(); img.src = d.src; p.img = img;
    }
}

// ─── Keyboard & Buttons ──────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if (player.isDead || isTransitioning || window.isHeroPopupActive) return;
  const px = player.position.x + (player.facingRight ? player.width + 20 : -20);
  const py = player.position.y + player.height * 0.38;
  switch (e.key) {
    case 'a': case 'A': keys.a.pressed = true;  break;
    case 'd': case 'D': keys.d.pressed = true;  break;
    case 'w': case 'W': if (player.velocity.y === 0) { player.velocity.y = -16; Sound.playJump(); } break;
    case 's': case 'S': selectSkill('shield'); player.shield(); break;
    case ' ': createSwordSparks(px, py, player.facingRight); player.attack(); e.preventDefault(); break;
    case 'k': case 'K': selectSkill('sword'); createSlashSparks(px, py, player.facingRight); player.knifeAttack(); break;
    case 'q': case 'Q': useHeroAbility(); break;
  }
});

window.addEventListener('keyup', (e) => {
  switch (e.key) {
    case 'a': case 'A': keys.a.pressed = false; break;
    case 'd': case 'D': keys.d.pressed = false; break;
    case 's': case 'S': player.stopShield(); break;
  }
});

function btn(id, onDown, onUp = () => {}) {
  const el = document.getElementById(id);
  if (!el) return;
  const dn = (e) => { e.preventDefault(); el.classList.add('active'); onDown(); };
  const up = (e) => { e.preventDefault(); el.classList.remove('active'); onUp(); };
  el.addEventListener('mousedown', dn);
  el.addEventListener('mouseup', up);
  el.addEventListener('mouseleave', up);
  el.addEventListener('touchstart', dn, { passive: false });
  el.addEventListener('touchend', up, { passive: false });
}

btn('btn-left',  () => { if (!window.isHeroPopupActive) keys.a.pressed = true; }, () => { keys.a.pressed = false; });
btn('btn-right', () => { if (!window.isHeroPopupActive) keys.d.pressed = true; }, () => { keys.d.pressed = false; });
btn('btn-up',    () => {
  if (!player.isDead && player.velocity.y === 0 && !window.isHeroPopupActive) {
    player.velocity.y = -16;
    Sound.playJump();
  }
});
btn('btn-attack', () => {
  if (!player.isDead && !window.isHeroPopupActive) player.attack();
});

const SKILL_BTNS = [
  { id: 'btn-kick',    skill: 'sword'  },
  { id: 'btn-shield',  skill: 'shield' },
  { id: 'btn-special', skill: 'skill'  },
];

function selectSkill(skill) {
  player.equip(skill);
  SKILL_BTNS.forEach(({ id, skill: s }) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('equipped', s === skill);
  });
}

btn('btn-kick',    () => { if (!player.isDead && !window.isHeroPopupActive) { selectSkill('sword'); player.knifeAttack(); } });
btn('btn-special', () => { if (!player.isDead && !window.isHeroPopupActive) { useHeroAbility(); } });
btn('btn-shield',  () => { if (!player.isDead && !window.isHeroPopupActive) { selectSkill('shield'); player.shield(); } }, () => { player.stopShield(); });

// ─── Music Control Bar ────────────────────────────────────────────────────────

// Mute button
const muteBtn = document.getElementById('btn-mute');
if (muteBtn) {
  muteBtn.addEventListener('click', () => {
    Sound.init();
    const muted = Sound.toggleMute();
    if (muted) {
      muteBtn.classList.add('is-muted');
    } else {
      muteBtn.classList.remove('is-muted');
    }
  });
}

// Music panel toggle
const musicToggleBtn = document.getElementById('btn-music-toggle');
const musicPanel     = document.getElementById('music-panel');

// Two fixed track buttons
const proceduralBtn = document.getElementById('mtrack-0');
const sound1Btn     = document.getElementById('mtrack-1');

function selectMusicTrack(src, clickedBtn) {
  Sound.init();
  // Deactivate all
  document.querySelectorAll('.music-track-btn').forEach(b => b.classList.remove('active'));
  clickedBtn.classList.add('active');

  if (src === 'procedural') {
    Sound.stopMusic();
    if (musicToggleBtn) musicToggleBtn.classList.remove('active-track');
  } else {
    Sound.playMusic(src);
    if (musicToggleBtn) musicToggleBtn.classList.add('active-track');
  }
  // Close panel
  if (musicPanel) musicPanel.classList.add('hidden');
}

if (proceduralBtn) {
  proceduralBtn.addEventListener('click', () => selectMusicTrack('procedural', proceduralBtn));
}
if (sound1Btn) {
  sound1Btn.addEventListener('click', () => selectMusicTrack('/assets/sound/sound1.mp3', sound1Btn));
}

// Toggle panel open/close
if (musicToggleBtn && musicPanel) {
  musicToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    musicPanel.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!musicPanel.contains(e.target) && e.target !== musicToggleBtn) {
      musicPanel.classList.add('hidden');
    }
  });
}

// ─── Hero Selection ───────────────────────────────────────────────────────────
const heroBtns = document.querySelectorAll('.hero-btn');
const p1NameLabel = document.querySelector('.p1-health .player-name');

heroBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    // 1. Update UI Classes
    heroBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 2. Change Player Sprite, Name & HeroKey
    const newSrc   = btn.getAttribute('data-src');
    const newName  = btn.getAttribute('data-name');
    const isVideo  = btn.getAttribute('data-video') === 'true';

    let delayPlay = null;

    if (e && e.isTrusted) {
      // Create visual popup
      const pop = document.createElement('div');
      pop.style.cssText = `
        position: absolute; top: 50%; left: 50%; z-index: 9999; opacity: 0;
        transform: translate(-50%, -50%) scale(0.1); pointer-events: none;
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      `;

      const container = document.createElement('div');
      container.style.cssText = `
        display: flex; flex-direction: column; align-items: center;
        background: rgba(0,0,0,0.85); padding: 30px; border: 3px solid #00e5ff;
        border-radius: 12px; box-shadow: 0 0 40px rgba(0,229,255,0.4);
      `;

      const previewCanvas = document.createElement('canvas');
      previewCanvas.width = 300; previewCanvas.height = 300;
      previewCanvas.style.cssText = `width: 280px; height: 280px; filter: drop-shadow(0 0 20px #00e5ff); object-fit: contain;`;
      container.appendChild(previewCanvas);

      // Label below canvas
      const labels = document.createElement('div');
      labels.style.cssText = `display:flex; flex-direction:column; align-items:center;`;
      labels.innerHTML = `
        <div style="color: #fff; font-family: 'Press Start 2P', cursive; font-size: 18px; margin-top: 20px; text-shadow: 0 0 10px #00e5ff;">SELECTED:</div>
        <div style="color: #00e5ff; font-family: 'Press Start 2P', cursive; font-size: 24px; margin-top: 10px; text-shadow: 0 0 15px #00e5ff;">${newName}</div>
      `;
      container.appendChild(labels);

      const pctx = previewCanvas.getContext('2d');
      let stopLoop = false;

      if (isVideo) {
        const v = document.createElement('video');
        v.src = newSrc; v.muted = true; v.loop = true; v.playsInline = true;
        v.play().catch(()=>{});
        
        const tempC = document.createElement('canvas');
        const tctx  = tempC.getContext('2d', { willReadFrequently: true });
        
        let _previewFrame = 0;
        let lastCrop = null;

        const renderLoop = () => {
          if (stopLoop) return;
          _previewFrame++;
          if (v.readyState >= 2) {
            if (tempC.width !== v.videoWidth) {
              tempC.width = v.videoWidth; tempC.height = v.videoHeight;
            }
            // Process every 2nd frame for performance, like in Player.js
            if (_previewFrame % 2 !== 0 && lastCrop) {
              pctx.clearRect(0, 0, 300, 300);
              pctx.drawImage(lastCrop, 0, 0, lastCrop.width, lastCrop.height, lastCrop.dx, lastCrop.dy, lastCrop.dw, lastCrop.dh);
            } else {
              tctx.drawImage(v, 0, 0);
              const VW = tempC.width, VH = tempC.height;
              const id = tctx.getImageData(0, 0, VW, VH);
              const d = id.data;
              
              // 1. Score-based bg color detection
              const samplePatch = (cx, cy) => {
                let sr=0, sg=0, sb=0, cnt=0;
                const R = 6;
                for (let dy=-R; dy<=R; dy++) for (let dx=-R; dx<=R; dx++) {
                  const px = Math.min(VW-1, Math.max(0, cx+dx));
                  const py = Math.min(VH-1, Math.max(0, cy+dy));
                  const ii = (py*VW+px)*4;
                  sr+=d[ii]; sg+=d[ii+1]; sb+=d[ii+2]; cnt++;
                }
                const ar=sr/cnt, ag=sg/cnt, ab=sb/cnt;
                let variance = 0;
                for (let dy=-R; dy<=R; dy++) for (let dx=-R; dx<=R; dx++) {
                  const px = Math.min(VW-1, Math.max(0, cx+dx));
                  const py = Math.min(VH-1, Math.max(0, cy+dy));
                  const ii = (py*VW+px)*4;
                  variance += Math.abs(d[ii]-ar)+Math.abs(d[ii+1]-ag)+Math.abs(d[ii+2]-ab);
                }
                const brightness = (ar + ag + ab) / 3;
                const score = variance - (brightness * 0.8);
                return { r:ar, g:ag, b:ab, score };
              };
              const patches = [
                samplePatch(0, 0), samplePatch(VW-1, 0),
                samplePatch(0, VH-1), samplePatch(VW-1, VH-1)
              ];
              const best = patches.reduce((a, b) => b.score < a.score ? b : a);
              const bgR = best.r, bgG = best.g, bgB = best.b;
              
              // 2. BFS flood fill
              const thr = 90;
              const isBgPixel = (px, py) => {
                const ii = (py*VW+px)*4;
                if (d[ii+3] < 30) return true;
                return Math.max(Math.abs(d[ii]-bgR), Math.abs(d[ii+1]-bgG), Math.abs(d[ii+2]-bgB)) < thr;
              };
              
              const visited = new Uint8Array(VW * VH);
              const queue = [];
              for (let margin = 0; margin < 5; margin++) {
                for (let x = 0; x < VW; x++) {
                  if (!visited[margin*VW+x] && isBgPixel(x, margin)) { 
                    visited[margin*VW+x] = 1; queue.push(x, margin); 
                  }
                  if (!visited[(VH-1-margin)*VW+x] && isBgPixel(x, VH-1-margin)) { 
                    visited[(VH-1-margin)*VW+x] = 1; queue.push(x, VH-1-margin); 
                  }
                }
                for (let y = 0; y < VH; y++) {
                  if (!visited[y*VW+margin] && isBgPixel(margin, y)) { 
                    visited[y*VW+margin] = 1; queue.push(margin, y); 
                  }
                  if (!visited[y*VW+(VW-1-margin)] && isBgPixel(VW-1-margin, y)) { 
                    visited[y*VW+(VW-1-margin)] = 1; queue.push(VW-1-margin, y); 
                  }
                }
              }
              
              let qi = 0;
              while (qi < queue.length) {
                const qx = queue[qi++], qy = queue[qi++];
                const ii = (qy*VW+qx)*4;
                const dist = Math.max(Math.abs(d[ii]-bgR), Math.abs(d[ii+1]-bgG), Math.abs(d[ii+2]-bgB));
                d[ii+3] = dist < thr*0.35 ? 0 : Math.round(d[ii+3]*((dist-thr*0.35)/(thr*0.65)));
      
                for (const [nx, ny] of [[qx-1,qy],[qx+1,qy],[qx,qy-1],[qx,qy+1]]) {
                  if (nx<0||nx>=VW||ny<0||ny>=VH) continue;
                  const ni = ny*VW+nx;
                  if (!visited[ni] && isBgPixel(nx, ny)) {
                    visited[ni] = 1;
                    queue.push(nx, ny);
                  }
                }
              }
              
              // 3. Second pass
              const bgBright = (bgR + bgG + bgB) / 3;
              if (bgBright > 170) {
                const tightThr = 55;
                for (let i = 0; i < d.length; i += 4) {
                  if (d[i+3] < 20) continue;
                  const dist2 = Math.max(
                    Math.abs(d[i]   - bgR),
                    Math.abs(d[i+1] - bgG),
                    Math.abs(d[i+2] - bgB)
                  );
                  if (dist2 < tightThr) {
                    d[i+3] = dist2 < tightThr * 0.3
                      ? 0
                      : Math.round(d[i+3] * ((dist2 - tightThr*0.3) / (tightThr*0.7)));
                  }
                }
              }
              
              tctx.putImageData(id, 0, 0);
              
              // Crop and center
              pctx.clearRect(0, 0, 300, 300);
              let minX = VW, maxX = 0, minY = VH, maxY = 0;
              for (let py = 0; py < VH; py++) {
                for (let px = 0; px < VW; px++) {
                  if (d[(py*VW+px)*4+3] > 10) {
                    if (px < minX) minX = px; if (px > maxX) maxX = px;
                    if (py < minY) minY = py; if (py > maxY) maxY = py;
                  }
                }
              }
              
              let cropData = { canvas: tempC, x: 0, y: 0, w: VW, h: VH, width: tempC.width, height: tempC.height };

              if (maxX > minX && maxY > minY) {
                const pad = 8;
                const cx = Math.max(0, minX - pad);
                const cy = Math.max(0, minY - pad);
                const cw = Math.min(VW, maxX + pad + 1) - cx;
                const ch = Math.min(VH, maxY + pad + 1) - cy;
                const aspect = cw / ch;
                let dw = 300, dh = 300;
                if (aspect > 1) { dh = Math.round(300 / aspect); }
                else            { dw = Math.round(300 * aspect); }
                const dx = (300 - dw) / 2, dy = (300 - dh) / 2;
                
                const cropC = document.createElement('canvas');
                cropC.width = cw; cropC.height = ch;
                cropC.getContext('2d').drawImage(tempC, cx, cy, cw, ch, 0, 0, cw, ch);
                
                lastCrop = cropC;
                lastCrop.dx = dx; lastCrop.dy = dy; lastCrop.dw = dw; lastCrop.dh = dh;
                
                pctx.drawImage(cropC, 0, 0, cw, ch, dx, dy, dw, dh);
              } else {
                lastCrop = tempC;
                lastCrop.dx = 0; lastCrop.dy = 0; lastCrop.dw = 300; lastCrop.dh = 300;
                pctx.drawImage(tempC, 0, 0, VW, VH, 0, 0, 300, 300);
              }
            }
          }
          requestAnimationFrame(renderLoop);
        };
        renderLoop();
      } else {
        loadEnemyImg(newSrc).then(canvas => {
          if (stopLoop) return;
          pctx.clearRect(0, 0, 300, 300);
          const aspect = canvas.width / canvas.height;
          let dw = 300, dh = 300;
          if (aspect > 1) { dh = Math.round(300 / aspect); }
          else            { dw = Math.round(300 * aspect); }
          const dx = (300 - dw) / 2, dy = (300 - dh) / 2;
          pctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, dx, dy, dw, dh);
        });
      }

      pop.appendChild(container);
      document.getElementById('game-container').appendChild(pop);

      
      requestAnimationFrame(() => {
        pop.style.transform = 'translate(-50%, -50%) scale(1)';
        pop.style.opacity = '1';
      });

      window.isHeroPopupActive = true;
      delayPlay = new Promise(resolve => {
        setTimeout(() => {
          pop.style.transform = 'translate(-50%, -50%) scale(1.5)';
          pop.style.opacity = '0';
          pop.style.filter = 'blur(10px)';
          setTimeout(() => {
            stopLoop = true;
            pop.remove();
            window.isHeroPopupActive = false;
            if (gameActive) { clearTimeout(timerId); decreaseTimer(); }
          }, 400);
          resolve();
        }, 1500);
      });
    } else {
      delayPlay = Promise.resolve();
    }


    if (isVideo) {
      // ── Video hero: create a hidden <video> element ──────────────────────
      // Clean up any previous video hero
      if (player._videoEl) {
        player._videoEl.pause();
        player._videoEl.remove();
      }
      const vid = document.createElement('video');
      vid.src      = newSrc;
      vid.loop     = true;
      vid.muted    = true;
      vid.playsInline = true;
      vid.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(vid);

      delayPlay.then(() => {
        vid.play().catch(() => {});
      });

      player._videoEl = vid;
      player.img      = vid; // ctx.drawImage works with <video>!

      // ── Static fallback: show bg-removed thumbnail until video is ready ──
      // Find matching thumbnail PNG (same name, .png extension)
      const thumbSrc = newSrc.replace(/\.mp4$/, '.png');
      loadEnemyImg(thumbSrc).then(thumbCanvas => {
        // Only apply if video hasn't started playing yet
        if (player._videoEl === vid && vid.readyState < 2) {
          player.img = thumbCanvas;
          // Switch back to video once it can play
          const onCanPlay = () => {
            if (player._videoEl === vid) player.img = vid;
            vid.removeEventListener('canplay', onCanPlay);
          };
          vid.addEventListener('canplay', onCanPlay);
        }
      });
    } else {
      // ── Normal image hero ───────────────────────────────────────────────
      if (player._videoEl) {
        player._videoEl.pause();
        player._videoEl.remove();
        player._videoEl = null;
      }
      // Use loadEnemyImg so the grey/white background is stripped via canvas
      loadEnemyImg(newSrc).then(canvas => {
        player.img = canvas;
      });
    }

    player.name    = newName;
    player.heroKey = newName; // DD | HARATU | LUFFY | DEFAULT | SHADOW WARRIOR

    if (p1NameLabel) p1NameLabel.textContent = newName;

    // 3. Update ability badge HUD
    updateAbilityBadge();
  });
});

// Seed badge on startup
updateAbilityBadge();

// ── Set Video Hero as Default ──
// Use the first hero button's thumbnail so the character appears immediately,
// then upgrade to video once the user interacts (satisfies browser autoplay policy).
(function setDefaultHero() {
  const firstBtn = heroBtns[0];
  if (!firstBtn) return;

  // Mark it active in the UI
  heroBtns.forEach(b => b.classList.remove('active'));
  firstBtn.classList.add('active');

  const newSrc  = firstBtn.getAttribute('data-src');  // hero1.mp4
  const newName = firstBtn.getAttribute('data-name');
  const isVideo = firstBtn.getAttribute('data-video') === 'true';

  player.name    = newName;
  player.heroKey = newName;
  if (p1NameLabel) p1NameLabel.textContent = newName;
  updateAbilityBadge();

  if (isVideo) {
    // Load the static thumbnail (bg-removed) immediately so the hero is visible
    const thumbSrc = newSrc.replace(/\.mp4$/, '.png');
    loadEnemyImg(thumbSrc).then(thumbCanvas => {
      // Only set if hero hasn't been changed by user yet
      if (player.name === newName && !(player._videoEl)) {
        player.img = thumbCanvas;
      }
    });

    // On first user interaction, upgrade to the live video
    const upgradeToVideo = () => {
      // Only upgrade if the user hasn't manually selected a different hero
      if (player.name !== newName) return;

      if (player._videoEl) {
        player._videoEl.pause();
        player._videoEl.remove();
      }
      const vid = document.createElement('video');
      vid.src       = newSrc;
      vid.loop      = true;
      vid.muted     = true;
      vid.playsInline = true;
      vid.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(vid);
      vid.play().catch(() => {});

      player._videoEl = vid;

      // Switch to live video once it has frames
      const onCanPlay = () => {
        if (player._videoEl === vid && player.name === newName) player.img = vid;
        vid.removeEventListener('canplay', onCanPlay);
      };
      vid.addEventListener('canplay', onCanPlay);
    };

    // Browsers allow play() after any user gesture
    window.addEventListener('keydown',     upgradeToVideo, { once: true });
    window.addEventListener('pointerdown', upgradeToVideo, { once: true });
  } else {
    loadEnemyImg(newSrc).then(canvas => { player.img = canvas; });
  }
})();

// ─── Sword Selection ──────────────────────────────────────────────────────────
const swordBtns = document.querySelectorAll('.sword-btn');

swordBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // 1. Update UI Classes
    swordBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 2. Change Player Sword Sprite
    const newSrc = btn.getAttribute('data-src');
    const img = new Image();
    img.src = newSrc;
    player.imgSword = img;
  });
});


// ─── Multiplayer Lobby ──────────────────────────────────────────────────────
const urlParams      = new URLSearchParams(window.location.search);
const joinId         = urlParams.get('join');
const lobbyScreen    = document.getElementById('lobby-screen');
const lobbySub       = document.getElementById('lobby-sub');
const lobbyHostUi    = document.getElementById('lobby-host-ui');
const inviteInput    = document.getElementById('invite-link-input');
const btnCopy        = document.getElementById('btn-copy');
const btnOffline     = document.getElementById('btn-play-offline');
const uiLayer        = document.getElementById('ui-layer');
const playerNameInput = document.getElementById('player-name-input');
const btnEnterArena   = document.getElementById('btn-enter-arena');
const lobbyNameUi     = document.getElementById('lobby-name-ui');

// ─── Enter Arena: capture name then start network ─────────────────────────────
function commitPlayerName() {
  const typed = playerNameInput.value.trim().toUpperCase();
  if (typed) {
    player.name = typed;
    if (p1NameLabel) p1NameLabel.textContent = typed;
  }
  // Hide name panel, reveal status + offline button
  lobbyNameUi.style.display  = 'none';
  lobbySub.style.display     = 'block';
  btnOffline.style.display   = 'inline-block';
  // Kick off the WebRTC handshake
  network.init(joinId);
}

btnEnterArena.addEventListener('click', commitPlayerName);
playerNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') commitPlayerName();
});


function setupLobby() {
  uiLayer.style.display = 'none';
  lobbyScreen.classList.remove('hidden');
  lobbyScreen.classList.add('visible');

  network.onReady = (id) => {
    if (joinId) {
      lobbySub.textContent = "Connecting to Host... (requires STUN/TURN)";
      // Fallback: If connection takes longer than 12s, force offline mode
      setTimeout(() => {
        if (!network.hostConn || network.hostConn.open !== true) {
          lobbySub.style.color = '#ff4757';
          lobbySub.textContent = "Connection timed out. Starting Offline Mode...";
          setTimeout(() => btnOffline.click(), 1000);
        }
      }, 12000);
    } else {
      lobbySub.textContent = "Waiting for challenger...";
      lobbyHostUi.style.display = 'block';
      inviteInput.value = network.getInviteLink(id);
    }
  };

  network.onConnect = () => {
    lobbyScreen.classList.add('hidden');
    uiLayer.style.display = 'flex';
    // Show stage select so both players choose the battlefield
    showStageSelect();
  };

  network.onData = (peerId, payload) => {
    // ── HOST receives client input ──────────────────────────────────────────
    if (network.role === NetworkRole.HOST && payload.type === 'client_state') {
      const cd = payload.data;
      if (!remotePlayers[peerId]) {
        // New client joining — assign a spawn slot
        const joinIdx = Object.keys(_clientJoinOrder).length + 1;
        _clientJoinOrder[peerId] = joinIdx;
        const spawnX = SPAWN_XS[joinIdx] ?? 420;
        remotePlayers[peerId] = new Player(game, {
          position:   { x: spawnX, y: 10 },
          velocity:   { x: 0, y: 0 },
          name:        cd.name || ('Fighter' + peerId.substring(0, 4)),
          facingRight: joinIdx % 2 === 0,
          offset:      { x: -ATTACK_W, y: 70 },
          spriteSrc:   cd.src || '/assets/characters/p1.png',
          swordSrc:    '/assets/characters/sword2.png',
          shieldSrc:   '/assets/characters/shield.png',
          skillSrc:    '/assets/characters/skill.png',
          accentColor: BRAWL_COLORS[joinIdx % BRAWL_COLORS.length],
          isEnemy:     false
        });
        remotePlayers[peerId].health    = 100;
        remotePlayers[peerId].width     = CHAR_W;
        remotePlayers[peerId].height    = CHAR_H;
        remotePlayers[peerId].attackBox.width  = ATTACK_W;
        remotePlayers[peerId].attackBox.height = ATTACK_H;
      }
      // Update position/animation — HOST owns health, so skipHp=true
      applyPlayerData(remotePlayers[peerId], cd, true);

    // ── HOST receives a hit report from CLIENT ─────────────────────────────
    } else if (network.role === NetworkRole.HOST && payload.type === 'hit_report') {
      const dmg = payload.dmg;
      const now = performance.now();
      // Per-peer cooldown to prevent the same attack registering multiple frames
      if (!network._hitCooldown) network._hitCooldown = {};
      const lastHit = network._hitCooldown[peerId] || 0;
      if (typeof dmg === 'number' && dmg > 0 && !player.isDead && gameActive && (now - lastHit) > 350) {
        network._hitCooldown[peerId] = now;
        player.takeHit(dmg);
        game.p1HealthBar.style.width = player.health + '%';
        // Visual feedback for HOST
        const hx = player.position.x + CHAR_W / 2;
        const hy = player.position.y + CHAR_H * 0.4;
        createHitSparks(hx, hy);
        player._hitFlash = 12;
        if (typeof player._setState === 'function') player._setState('hurt');
        if (typeof player._squash  === 'function') player._squash(0.85, 1.25);
        // Immediately push HOST's new HP to ALL clients so their P2 bar updates right away
        // (don't wait for the next host_sync frame — that delay caused the 'invisible health drain' bug)
        network.send({ type: 'host_hp', hp: player.health });
      }

    // ── CLIENT receives full game state from HOST ───────────────────────────
    } else if (network.role === NetworkRole.CLIENT && payload.type === 'host_sync') {
      const d = payload.data;

      // Lazily create HOST's avatar so it appears in allFighters
      if (!remotePlayers['__host__']) {
        remotePlayers['__host__'] = new Player(game, {
          position:   { x: 80, y: 10 },
          velocity:   { x: 0, y: 0 },
          name:        d.host.name || 'Host',
          facingRight: true,
          offset:      { x: ATTACK_W, y: 70 },
          spriteSrc:   d.host.src || '/assets/characters/p2.png',
          swordSrc:    '/assets/characters/sword2.png',
          shieldSrc:   '/assets/characters/shield.png',
          skillSrc:    '/assets/characters/skill.png',
          accentColor: BRAWL_COLORS[0], isEnemy: true
        });
        remotePlayers['__host__'].health = 100;
        remotePlayers['__host__'].width  = CHAR_W;
        remotePlayers['__host__'].height = CHAR_H;
        remotePlayers['__host__'].attackBox.width  = ATTACK_W;
        remotePlayers['__host__'].attackBox.height = ATTACK_H;
      }

      // Apply HOST position/animation — d.host.hp is HOST's authoritative health
      // Use d.host.fr for the correct facing direction from HOST
      applyPlayerData(remotePlayers['__host__'], d.host, true);
      remotePlayers['__host__'].facingRight = d.host.fr; // ensure facing is in sync
      remotePlayers['__host__'].health = Math.max(0, d.host.hp ?? 100);
      remotePlayers['__host__'].name   = d.host.name || 'Host';

      // Update P2 bar on CLIENT to show HOST health
      game.p2HealthBar.style.width = remotePlayers['__host__'].health + '%';

      // HOST is damage authority — apply OUR authoritative HP
      if (d.clientHp && network.peer && d.clientHp[network.peer.id] !== undefined) {
        const authHp = d.clientHp[network.peer.id];
        if (typeof authHp === 'number' && authHp >= 0) {
          const prevHp = player.health;
          player.health = authHp;
          game.p1HealthBar.style.width = authHp + '%';

          // Show blood/hurt effect on CLIENT when HOST deals damage to us
          if (authHp < prevHp && authHp > 0) {
            player._hitFlash = 12;
            if (typeof player._setState === 'function') player._setState('hurt');
            if (typeof player._squash === 'function')   player._squash(0.85, 1.25);
            const hx = player.position.x + CHAR_W / 2;
            const hy = player.position.y + CHAR_H * 0.4;
            createHitSparks(hx, hy);
            createSwordSparks(hx, hy, player.facingRight);
          }
          if (authHp <= 0 && !player.isDead) {
            player.isDead = true;
            if (typeof player._setState === 'function') player._setState('dead');
          }
        }
      }

      // Other connected clients in 3+ player mode
      Object.keys(d.clients || {}).forEach(clientId => {
        if (clientId === network.peer.id) return;
        if (!remotePlayers[clientId]) {
          remotePlayers[clientId] = new Player(game, {
            position: { x: 420, y: 10 }, velocity: { x: 0, y: 0 },
            name:     d.clients[clientId].name || ('P' + clientId.substring(0, 4)),
            facingRight: false, offset: { x: -ATTACK_W, y: 70 },
            spriteSrc: d.clients[clientId].src || '/assets/characters/p1.png',
            swordSrc: '/assets/characters/sword2.png',
            shieldSrc: '/assets/characters/shield.png', skillSrc: '/assets/characters/skill.png',
            accentColor: '#cc5de8', isEnemy: false
          });
          remotePlayers[clientId].health = 100;
          remotePlayers[clientId].width  = CHAR_W;
          remotePlayers[clientId].height = CHAR_H;
          remotePlayers[clientId].attackBox.width  = ATTACK_W;
          remotePlayers[clientId].attackBox.height = ATTACK_H;
        }
        applyPlayerData(remotePlayers[clientId], d.clients[clientId]);
      });

      // ── CLIENT follows HOST stage progression ─────────────────────────────
      // When HOST advances to next stage (stageIdx changes in host_sync),
      // CLIENT kicks off its own goToStage() walk-out/walk-in animation.
      if (typeof d.stageIdx === 'number' &&
          d.stageIdx !== currentStageIdx &&
          !isTransitioning &&
          !network._roundResultHandled) {
        goToStage(d.stageIdx);
      }



    } else if (network.role === NetworkRole.CLIENT && payload.type === 'host_hp') {
      // HOST is broadcasting its HP immediately after taking a hit — update our P2 bar right away
      const newHp = Math.max(0, payload.hp ?? 100);
      if (remotePlayers['__host__']) {
        remotePlayers['__host__'].health = newHp;
      }
      game.p2HealthBar.style.width = newHp + '%';
      // Visual hurt flash on HOST avatar so CLIENT sees the hit land
      if (remotePlayers['__host__']) {
        remotePlayers['__host__']._hitFlash = 10;
        if (typeof remotePlayers['__host__']._setState === 'function') {
          remotePlayers['__host__']._setState('hurt');
        }
      }

    } else if (network.role === NetworkRole.CLIENT && payload.type === 'round_result') {
       if (network._roundResultHandled) return; // ignore duplicates
       network._roundResultHandled = true;
       gameActive = false;
       game.displayText.textContent = payload.hostWon ? 'You Lose...' : 'You Win! 🏆';
       game.displayText.style.display = 'block';
       setTimeout(() => {
         game.displayText.style.display = 'none';
         network._roundResultHandled = false;
         // HOST drives stage progression via host_sync stageIdx — don't call resetRound here
       }, 2500);
    }
  };



  network.onDisconnect = (peerId) => {
    if (remotePlayers[peerId] || remotePlayers['__host__']) {
        console.log(`Player ${peerId} left the arena.`);
        delete remotePlayers[peerId];
        delete remotePlayers['__host__'];
        refreshAI(); // Reactivate AI if the last friend left
        
        // If we are the client and host left, switch offline
        if (network.role === NetworkRole.CLIENT) {
           alert("Host disconnected! Switching to offline mode.");
           network.role = NetworkRole.OFFLINE;
           btnOffline.click();
        }
    } else {
        // We never fully connected, let the connection timeout handle it
        console.log("Connection closed during lobby.");
    }
  };
}

btnCopy.addEventListener('click', () => {
  inviteInput.select();
  document.execCommand('copy');
  btnCopy.textContent = "COPIED!";
});

btnOffline.addEventListener('click', () => {
  network.role = NetworkRole.OFFLINE;
  lobbyScreen.classList.add('hidden');
  uiLayer.style.display = 'flex';
  // Show stage select first so player can choose their battlefield
  showStageSelect();
});

// ─── STARTUP ─────────────────────────────────────────────────────────────────
try {
  buildStageSelectUI(); // Populate stage-select UI grids before anything else
  animate();
  setupLobby();
} catch (err) {
  console.error("Startup error:", err);
}
