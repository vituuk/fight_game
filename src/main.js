import { Player } from './classes/Player.js';
import { rectangularCollision, determineWinner } from './utils/collision.js';
import { network, NetworkRole } from './network.js';

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

    if (this.glow) {
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

// ── Emitter helpers ───────────────────────────────────────────────────────────
function emit(config) { particles.push(new Particle(config)); }

/** Generic punch / hit sparks */
function createHitSparks(x, y) {
  const cols = ['#fbc531','#ff7675','#fd79a8','#fff','#ffe082'];
  for (let i = 0; i < 28; i++) {
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
  for (let i = 0; i < 15; i++) {
    const spd = 3 + Math.random() * 8;
    const angle = Math.random() * Math.PI * 2;
    emit({
      position: { x, y },
      velocity: { x: Math.cos(angle) * spd, y: Math.sin(angle) * spd - 3 },
      radius:   2 + Math.random() * 4,
      color:    '#d63031', // Deep blood red
      glow:     '#b71540',
      tail:     true,      // Stretches as it falls
      gravity:  0.8,       // Heavy gravity so it splashes toward the floor quickly
      friction: 0.98,
      life:     0.8,
    });
  }
}

/** Sword attack sparks – silver-blue metallic streaks + sparks */
function createSwordSparks(x, y, facingRight) {
  const dir = facingRight ? 1 : -1;
  const cols = ['#e3f2fd','#90caf9','#42a5f5','#fff','#b3e5fc'];
  // Fast streak sparks forward
  for (let i = 0; i < 22; i++) {
    const spd   = 6 + Math.random() * 14;
    const spread= (Math.random() - 0.5) * 1.8;  // mostly forward
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
  // Ring of small sparks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
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
  for (let i = 0; i < 35; i++) {
    const spd  = 8 + Math.random() * 16;
    // Arc mostly forward-down (slash sweep)
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
  // Big flash
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
  // Large golden orbs
  for (let i = 0; i < 18; i++) {
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
  // Ember shower (small fast upward)
  for (let i = 0; i < 30; i++) {
    const spd  = 3 + Math.random() * 10;
    const ang  = -Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI;  // upward arc
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
  // Central shockwave flash
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
    // Sword stab – quick forward sparks
    if (Math.random() < 0.45) {
      const dir = character.facingRight ? 1 : -1;
      emit({
        position: { x: cx + dir * 55, y: cy + (Math.random()-0.5)*30 },
        velocity: { x: dir * (3 + Math.random()*6), y: (Math.random()-0.5)*4 - 1 },
        radius:   1 + Math.random() * 2,
        color:    Math.random() < 0.5 ? '#90caf9' : '#fff',
        glow:     '#4fc3f7',
        tail:     true,
        gravity:  0.12,
        friction: 0.94,
        life:     0.7,
      });
    }
  }

  if (character.isKnifeAttacking) {
    // Sword strike – arc of sparks
    if (Math.random() < 0.6) {
      const dir = character.facingRight ? 1 : -1;
      const ang = (Math.random() - 0.5) * Math.PI * 0.8;
      emit({
        position: { x: cx + dir * (40 + Math.random()*40), y: cy + (Math.random()-0.5)*50 },
        velocity: { x: dir * Math.cos(ang) * (4+Math.random()*8), y: Math.sin(ang) * 6 - 2 },
        radius:   1.5 + Math.random() * 2.5,
        color:    ['#00e5ff','#80deea','#e0f7fa','#fff'][Math.floor(Math.random()*4)],
        glow:     '#00bcd4',
        tail:     true,
        gravity:  0.18,
        friction: 0.93,
        life:     0.65,
      });
    }
  }

  if (character.isSpecialAttacking) {
    // Special – orbiting + shooting embers
    const t = Date.now() / 120;
    for (let i = 0; i < 2; i++) {
      const ang = t * 3 + i * Math.PI;
      const r   = 55 + Math.sin(t * 4) * 12;
      emit({
        position: { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r * 0.4 },
        velocity: { x: (Math.random()-0.5)*3, y: -1 - Math.random()*2 },
        radius:   2 + Math.random() * 3,
        color:    ['#ffd54f','#ff8f00','#ffecb3','#ffe082'][Math.floor(Math.random()*4)],
        glow:     '#ffab40',
        tail:     false,
        gravity:  0.08,
        friction: 0.96,
        life:     0.75,
      });
    }
  }

  if (character.isShielding) {
    // Shield – occasional shimmer sparks on bubble edge
    if (Math.random() < 0.25) {
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

// ─── Stage definitions ────────────────────────────────────────────────────────
const STAGES = [
  {
    id: 1,
    location:    'The Dojo',
    bgSrc:       '/assets/background/b.jpg',
    enemySrc:    '/assets/characters/anamy.png',
    enemyName:   'SAMURAI',
    accentColor: '#ef5350',
  },
  {
    id: 2,
    location:    'Hero Arena',
    bgSrc:       '/assets/background/b2.jpeg',
    enemySrc:    '/assets/characters/anamy1.png',
    enemyName:   'DEKU',
    accentColor: '#4caf50',
  },
  {
    id: 3,
    location:    'City Streets',
    bgSrc:       '/assets/background/background.jpg',
    enemySrc:    '/assets/characters/anamy2.png',
    enemyName:   'SHADOW',
    accentColor: '#78909c',
  },
  {
    id: 4,
    location:    'Volcano Peak',
    bgSrc:       '/assets/background/background1.jpg',
    enemySrc:    '/assets/characters/anamy3.png',
    enemyName:   'RYU',
    accentColor: '#ff5722',
  },
  {
    id: 5,
    location:    'Enchanted Forest',
    bgSrc:       '/assets/background/forest.png',
    enemySrc:    '/assets/characters/anamy.png',
    enemyName:   'DARK SAMURAI',
    accentColor: '#7c4dff',
  },
  {
    id: 6,
    location:    'Final Arena',
    bgSrc:       '/assets/background/bg-00.png',
    enemySrc:    '/assets/characters/anamy3.png',
    enemyName:   'FINAL BOSS',
    accentColor: '#ffd600',
  },
];

let currentStageIdx = 0;
let gameActive      = true;  // false while transitioning

// Pre-load all background images so transitions are instant
const bgImages = {};
STAGES.forEach(s => {
  const img = new Image();
  img.src = s.bgSrc;
  bgImages[s.bgSrc] = img;
});

// ─── Background drawing (image-based) ────────────────────────────────────────
function drawBackground() {
  const stage = STAGES[currentStageIdx];
  const img   = bgImages[stage.bgSrc];

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Subtle vignette so characters stay readable on any background
    const vig = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.height * 0.18,
      canvas.width / 2, canvas.height / 2, canvas.height
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.48)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    // Fallback gradient while images load
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.7);
    sky.addColorStop(0,   '#0a0015');
    sky.addColorStop(0.5, '#1a0030');
    sky.addColorStop(1,   '#2d0050');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const grd = ctx.createLinearGradient(0, canvas.height - 96, 0, canvas.height);
    grd.addColorStop(0, '#2a083a');
    grd.addColorStop(1, '#12001f');
    ctx.fillStyle = grd;
    ctx.fillRect(0, canvas.height - 96, canvas.width, 96);
  }

  // Location label (bottom-left strip)
  ctx.save();
  ctx.globalAlpha = 0.62;
  ctx.fillStyle   = '#000';
  ctx.fillRect(0, canvas.height - 94, 210, 20);
  ctx.globalAlpha = 1;
  ctx.fillStyle   = '#fbc531';
  ctx.font        = '8px "Press Start 2P", cursive';
  ctx.fillText(stage.location.toUpperCase(), 8, canvas.height - 79);
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

let aiState      = AI.APPROACH;
let aiTimer      = 0;
let aiCooldown   = 0;
const AI_SPEED   = 4;
const CLOSE_DIST = CHAR_W + 50; // distance at which AI is "in range"

function tickEnemyAI() {
  if (enemy.isDead || player.isDead) return;

  const dx        = player.position.x - enemy.position.x;
  const absDx     = Math.abs(dx);
  const grounded  = enemy.velocity.y === 0;

  aiCooldown = Math.max(0, aiCooldown - 1);
  aiTimer++;

  switch (aiState) {

    // Walk toward the player until close, then randomly pick behaviour
    case AI.APPROACH: {
      enemy.velocity.x = dx > 0 ? AI_SPEED : -AI_SPEED;

      // Jump if player is significantly above
      if (player.position.y < enemy.position.y - 100 && grounded) {
        enemy.velocity.y = -20;
      }

      if (absDx <= CLOSE_DIST) {
        const roll = Math.random();
        if      (roll < 0.30) { aiState = AI.PUNCH;     }
        else if (roll < 0.50) { aiState = AI.KICK;      }
        else if (roll < 0.62) { aiState = AI.SPECIAL;   }
        else if (roll < 0.72) { aiState = AI.SHIELD;    }
        else if (roll < 0.82) { aiState = AI.JUMP_ATK;  }
        else                  { aiState = AI.BACK_OFF;  }
        aiTimer = 0;
      }
      break;
    }

    // Quick jab
    case AI.PUNCH: {
      enemy.velocity.x = 0;
      if (aiTimer === 2 && !aiCooldown) { enemy.attack(); aiCooldown = 45; }
      if (aiTimer === 18) { aiState = Math.random() < 0.6 ? AI.APPROACH : AI.BACK_OFF; aiTimer = 0; }
      break;
    }

    // Step in then kick
    case AI.KICK: {
      enemy.velocity.x = dx > 0 ? 2 : -2;
      if (aiTimer === 10 && !aiCooldown) { enemy.knifeAttack(); aiCooldown = 60; }
      if (aiTimer === 28) { aiState = AI.APPROACH; aiTimer = 0; }
      break;
    }

    // Charge up then fire
    case AI.SPECIAL: {
      enemy.velocity.x = 0;
      if (aiTimer === 10 && !aiCooldown) { enemy.specialAttack(); aiCooldown = 110; }
      if (aiTimer === 55) { aiState = AI.APPROACH; aiTimer = 0; }
      break;
    }

    // Retreat to reset
    case AI.BACK_OFF: {
      enemy.velocity.x = dx > 0 ? -AI_SPEED * 1.2 : AI_SPEED * 1.2;
      if (aiTimer > 30) { aiState = AI.APPROACH; aiTimer = 0; }
      break;
    }

    // Jump BACK away
    case AI.JUMP_BACK: {
      if (aiTimer === 1 && grounded) {
        enemy.velocity.y = -18;
        enemy.velocity.x = dx > 0 ? -AI_SPEED * 2 : AI_SPEED * 2;
      }
      if (aiTimer > 38) { aiState = AI.APPROACH; aiTimer = 0; }
      break;
    }

    // Shielding
    case AI.SHIELD: {
      enemy.velocity.x = 0;
      enemy.shield();
      if (aiTimer > 45) {
        enemy.stopShield();
        aiState = Math.random() < 0.6 ? AI.PUNCH : AI.KICK;
        aiTimer = 0;
      }
      break;
    }

    // Jump Attack
    case AI.JUMP_ATK: {
      if (aiTimer === 1 && grounded) {
        enemy.velocity.y = -22;
        enemy.velocity.x = dx > 0 ? AI_SPEED * 1.2 : -AI_SPEED * 1.2;
      }
      if (aiTimer === 14 && !aiCooldown) { enemy.attack(); aiCooldown = 50; }
      if (aiTimer > 40 && grounded) { aiState = AI.APPROACH; aiTimer = 0; }
      break;
    }
  }

  // Safety reset
  if (aiTimer > 200) { aiState = AI.APPROACH; aiTimer = 0; }
}

// ─── Stage progression helpers ────────────────────────────────────────────────
const gameOverScreen = document.getElementById('game-over-screen');
const gameOverTitle  = document.getElementById('game-over-title');
const gameOverSub    = document.getElementById('game-over-sub');
const retryBtn       = document.getElementById('btn-retry');

function updateEnemyHUD() {
  const el = document.querySelector('.p2-health .player-name');
  if (el) el.textContent = STAGES[currentStageIdx].enemyName;
}

(function injectStageBadge() {
  if (document.getElementById('stage-badge')) return;
  const uiLayer = document.getElementById('ui-layer');
  if (!uiLayer) return;
  const badge = document.createElement('div');
  badge.id = 'stage-badge';
  badge.innerHTML =
    '<div class="stage-badge-label">STAGE</div>' +
    '<div class="stage-badge-num" id="stage-badge-num">1 / ' + STAGES.length + '</div>';
  uiLayer.appendChild(badge);
})();

function updateStageBadge() {
  const el = document.getElementById('stage-badge-num');
  if (el) el.textContent = (currentStageIdx + 1) + ' / ' + STAGES.length;
}

/** Full round reset */
function resetRound(omitPlayerPos = false) {
  particles.length = 0;
  gameActive       = true;

  // --- Player ---
  player.health             = 100;
  player.isDead             = false;
  player.isAttacking        = false;
  player.isKnifeAttacking   = false;
  player.isSpecialAttacking = false;
  player.isShielding        = false;
  player.velocity.x         = 0;
  player.velocity.y         = 0;
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
  Object.values(remotePlayers).forEach(rp => {
    rp.health             = 100;
    rp.isDead             = false;
    rp.isAttacking        = false;
    rp.isKnifeAttacking   = false;
    rp.isSpecialAttacking = false;
    rp.isShielding        = false;
  });

  // --- Enemy (swap sprite) ---
  let stage = STAGES[currentStageIdx];
  enemy.health              = 100;
  enemy.isDead              = false;
  enemy.isAttacking         = false;
  enemy.isKnifeAttacking    = false;
  enemy.isSpecialAttacking  = false;
  enemy.isShielding         = false;
  if (network.role === NetworkRole.CLIENT) {
    enemy.position.x = 80;
    enemy.facingRight = true;
  } else {
    enemy.position.x = 760;
    enemy.facingRight = false;
  }
  enemy.position.y          = 10;
  enemy.velocity.x          = 0;
  enemy.velocity.y          = 0;
  enemy.name                = stage.enemyName;
  enemy.accentColor         = stage.accentColor;
  
  const newImg = new Image();
  newImg.src   = stage.enemySrc;
  enemy.img    = newImg;

  // --- HUD ---
  game.p1HealthBar.style.width   = '100%';
  game.p2HealthBar.style.width   = '100%';
  game.displayText.style.display = 'none';
  updateEnemyHUD();
  updateStageBadge();

  // --- AI ---
  aiState    = AI.APPROACH;
  aiTimer    = 0;
  aiCooldown = 0;
  
  // Pivot AI based on connections: Solo = Samurai, Duo = PvP
  refreshAI();

  // Reset name based on current persona
  stage = STAGES[currentStageIdx];
  if (enemy.isAI) {
    enemy.name = stage.enemyName;
    const enemyImg = new Image();
    enemyImg.src = stage.enemySrc;
    enemy.img = enemyImg;
    const p2Name = document.querySelector('.p2-health .player-name');
    if (p2Name) p2Name.textContent = enemy.name;
  }
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
  
  // Disable boundary clamping so player can walk off-screen
  player.clamping = false;

  // Hide any victory text immediately for seamless feel
  game.displayText.style.display = 'none';
}

function showGameOver() {
  gameActive              = false;
  gameOverTitle.textContent = 'GAME OVER';
  gameOverSub.textContent   = 'Defeated at Stage ' + STAGES[currentStageIdx].id;
  gameOverScreen.classList.remove('hidden');
  requestAnimationFrame(() => gameOverScreen.classList.add('visible'));
}

function showVictory() {
  gameActive              = false;
  gameOverTitle.textContent = '🏆 CHAMPION!';
  gameOverSub.textContent   = 'You conquered all stages!';
  gameOverScreen.classList.remove('hidden');
  requestAnimationFrame(() => gameOverScreen.classList.add('visible'));
}

retryBtn.addEventListener('click', () => {
  gameOverScreen.classList.remove('visible');
  setTimeout(() => {
    gameOverScreen.classList.add('hidden');
    currentStageIdx = 0;
    resetRound();
  }, 500);
});

function handlePlayerWin() {
  const next = currentStageIdx + 1;
  if (next < STAGES.length) {
    goToStage(next);
  } else {
    showVictory();
  }
}

function handlePlayerLose() {
  showGameOver();
}

// ─── Timer ─────────────────────────────────────────────────────────────────────
let countdown = 60;
let timerId;
function decreaseTimer() {
  if (!gameActive) return;
  if (countdown > 0) {
    timerId = setTimeout(decreaseTimer, 1000);
    countdown--;
    game.timerEl.innerHTML = countdown;
  }
  if (countdown === 0) {
    determineWinner({
      player, enemy, timerId, game,
      onPlayerWin:  handlePlayerWin,
      onPlayerLose: handlePlayerLose,
    });
  }
}

// ─── Game Loop ────────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  // Clear
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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
        player.clamping   = true; // Re-enable clamping for the fight
        isTransitioning   = false;
        gameActive        = true;
        transitionStep    = 'none';
      }
    }
  } else {
    // Regular Movement Input
    player.velocity.x = 0;
    if (keys.a.pressed) { player.velocity.x = -5; player.lastKey = 'a'; }
    if (keys.d.pressed) { player.velocity.x =  5; player.lastKey = 'd'; }
  }

  // AI & Physics
  refreshAI(); // Re-evaluate every frame so it reacts to friends joining/leaving
  if (gameActive) {
    if (enemy.isAI) {
      tickEnemyAI();
    } else if (network.role === NetworkRole.CLIENT) {
      enemy.velocity.x = 0; // Clients obey Host's broadcasted enemy position
    }
  } else {
    enemy.velocity.x = 0;
  }

  const isOnline = network.role !== NetworkRole.OFFLINE;
  const allFighters = isOnline
    ? [player, ...Object.values(remotePlayers)]         // Online: player + all remote peers
    : (enemy.isHidden ? [player] : [player, enemy]);   // Offline: player + AI enemy
  allFighters.forEach(p => p.update());
  allFighters.forEach(p => emitSkillAmbient(p));

  // Render floating nameplates + HP bars above ALL remote fighters
  allFighters.forEach(p => {
    if (p === player || p.isDead) return;
    const cx  = p.position.x + (p.width  || 60) / 2;
    const barW = 70, barH = 6;
    const hpRatio = Math.max(0, (p.health || 0) / 100);
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
        if (rectangularCollision({ rectangle1: attacker, rectangle2: victim })) {
          const hx = victim.position.x + CHAR_W / 2;
          const hy = victim.position.y + CHAR_H * 0.4;
          let dmg = 0;
          if (attacker.isAttacking) dmg = 10;
          else if (attacker.isKnifeAttacking) dmg = 15;
          else if (attacker.isSpecialAttacking) dmg = 25;
          if (dmg > 0) {
            attacker.isAttacking = false;
            attacker.isKnifeAttacking = false;
            attacker.isSpecialAttacking = false;
            createHitSparks(hx, hy);
            if (victim.isShielding) createShieldSparks(hx, hy);
            else if (dmg === 10) createSwordSparks(hx, hy, attacker.facingRight);
            else if (dmg === 15) createSlashSparks(hx, hy, attacker.facingRight);
            else if (dmg === 25) createSkillSparks(hx, hy);

            if (network.role === NetworkRole.OFFLINE) {
              // OFFLINE: apply damage directly
              victim.takeHit(dmg);
              if (victim === player) game.p1HealthBar.style.width = player.health + '%';
              if (victim === enemy)  game.p2HealthBar.style.width = enemy.health  + '%';

            } else if (network.role === NetworkRole.HOST) {
              // HOST is sole damage authority for ALL collisions (both directions)
              victim.takeHit(dmg);
              if (victim === player) game.p1HealthBar.style.width = player.health + '%';
              const firstId = Object.keys(remotePlayers)[0];
              if (firstId && victim === remotePlayers[firstId]) {
                game.p2HealthBar.style.width = victim.health + '%';
              }

            } else if (network.role === NetworkRole.CLIENT && attacker === player) {
              // CLIENT hit a remote player — report to HOST so it can apply damage authoritatively
              // (HOST can't reliably detect CLIENT→HOST collisions due to network lag)
              network.send({ type: 'hit_report', dmg });
            }
            // CLIENT: sparks shown above; authoritative HP comes back via host_sync clientHp

          }
        }
      }
    }

    // Win condition
    if (network.role === NetworkRole.OFFLINE) {
      if (!enemy.isHidden && (enemy.health <= 0 || player.health <= 0)) {
        gameActive = false;
        determineWinner({ player, enemy, timerId, game,
          onPlayerWin: handlePlayerWin, onPlayerLose: handlePlayerLose });
      }
    } else if (network.role === NetworkRole.HOST) {
      const remoteIds = Object.keys(remotePlayers);
      if (remoteIds.length > 0) {
        // Check if host is dead OR all remote players are dead
        const allRemotesDead = remoteIds.every(id => remotePlayers[id].health <= 0);
        if (player.health <= 0 || allRemotesDead) {
          const hostWon = player.health > 0;
          gameActive = false;
          // Send round_result 3× with increasing delays — guarantees CLIENT receives it
          // even if the first packet is dropped on an unreliable channel
          const rr = { type: 'round_result', hostWon };
          network.send(rr);
          setTimeout(() => network.send(rr), 200);
          setTimeout(() => network.send(rr), 600);
          game.displayText.textContent = hostWon ? 'You Win! 🏆' : 'You Lose...';
          game.displayText.style.display = 'block';
          setTimeout(() => { game.displayText.style.display = 'none'; resetRound(false); }, 2500);
        }
      }
    } else if (network.role === NetworkRole.CLIENT) {
      // CLIENT-side win detection — uses HP data already synced every frame via host_sync
      // This is independent of the round_result message, so a dropped packet never causes the
      // "You Win!" screen to be missed.
      const hostAvatar = remotePlayers['__host__'];
      if (hostAvatar && hostAvatar.health <= 0 && !network._roundResultHandled) {
        network._roundResultHandled = true;
        gameActive = false;
        game.displayText.textContent = 'You Win! 🏆';
        game.displayText.style.display = 'block';
        setTimeout(() => {
          game.displayText.style.display = 'none';
          network._roundResultHandled = false;
          resetRound(false);
        }, 2000);
      } else if (player.isDead && !network._roundResultHandled) {
        // CLIENT knows their own death from clientHp — show lose screen too
        network._roundResultHandled = true;
        gameActive = false;
        game.displayText.textContent = 'You Lose...';
        game.displayText.style.display = 'block';
        setTimeout(() => {
          game.displayText.style.display = 'none';
          network._roundResultHandled = false;
          resetRound(false);
        }, 2000);
      }
    }
    // CLIENT win condition handled via round_result message from HOST (backup)
  }

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
  if (player.isDead || isTransitioning) return;
  const px = player.position.x + (player.facingRight ? player.width + 20 : -20);
  const py = player.position.y + player.height * 0.38;
  switch (e.key) {
    case 'a': case 'A': keys.a.pressed = true;  break;
    case 'd': case 'D': keys.d.pressed = true;  break;
    case 'w': case 'W': if (player.velocity.y === 0) player.velocity.y = -22; break;
    case 's': case 'S': selectSkill('shield'); player.shield(); break;
    case ' ': createSwordSparks(px, py, player.facingRight); player.attack(); e.preventDefault(); break;
    case 'k': case 'K': selectSkill('sword'); createSlashSparks(px, py, player.facingRight); player.knifeAttack(); break;
    case 'q': case 'Q': selectSkill('skill'); createSkillSparks(px+40, py, player.facingRight); player.specialAttack(); break;
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

btn('btn-left',  () => { keys.a.pressed = true; }, () => { keys.a.pressed = false; });
btn('btn-right', () => { keys.d.pressed = true; }, () => { keys.d.pressed = false; });
btn('btn-up',    () => { if (!player.isDead && player.velocity.y === 0) player.velocity.y = -22; });
btn('btn-attack',() => { if (!player.isDead) { player.attack(); } });

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

btn('btn-kick', () => { if (!player.isDead) { selectSkill('sword'); player.knifeAttack(); } });
btn('btn-special', () => { if (!player.isDead) { selectSkill('skill'); player.specialAttack(); } });
btn('btn-shield', () => { if (!player.isDead) { selectSkill('shield'); player.shield(); } }, () => { player.stopShield(); });

// ─── Hero Selection ───────────────────────────────────────────────────────────
const heroBtns = document.querySelectorAll('.hero-btn');
const p1NameLabel = document.querySelector('.p1-health .player-name');

heroBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // 1. Update UI Classes
    heroBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 2. Change Player Sprite & Name
    const newSrc  = btn.getAttribute('data-src');
    const newName = btn.getAttribute('data-name');
    
    const img = new Image();
    img.src   = newSrc;
    player.img  = img;
    player.name = newName;
    
    if (p1NameLabel) p1NameLabel.textContent = newName;
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
    resetRound();
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
       if (network._roundResultHandled) return; // ignore duplicate sends
       network._roundResultHandled = true;
       gameActive = false;
       game.displayText.textContent = payload.hostWon ? 'You Lose...' : 'You Win! 🏆';
       game.displayText.style.display = 'block';
       setTimeout(() => {
         game.displayText.style.display = 'none';
         network._roundResultHandled = false; // reset for next round
         resetRound(false);
       }, 2000);
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
  resetRound();
});

// ─── STARTUP ─────────────────────────────────────────────────────────────────
try {
  animate();
  setupLobby();
} catch (err) {
  console.error("Startup error:", err);
}
