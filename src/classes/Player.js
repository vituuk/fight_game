/**
 * Player.js  – Sprite-image based fighter with EQUIP / HOLD system
 *
 * equippedSkill: 'sword' | 'shield' | 'skill' | null
 *   → Character always grips the currently equipped item.
 *   → Clicking a different skill SETs and holds the new one.
 *   → During an attack the item animates; between attacks it rests in hand.
 *
 * States: idle | run | jump | punch | kick | special | shield | hurt | dead
 */

// ── Image cache ───────────────────────────────────────────────────────────────
const _imgCache = {};
function loadImg(src) {
  if (_imgCache[src]) return _imgCache[src];
  const img = new Image();
  img.src = src;
  _imgCache[src] = img;
  return img;
}

export class Player {
  constructor(game, {
    position,
    velocity,
    name         = 'Player',
    facingRight  = true,
    offset       = { x: 0, y: 0 },
    spriteSrc    = '/assets/characters/p1.png',
    swordSrc     = '/assets/characters/sword2.png',
    shieldSrc    = '/assets/characters/shield.png',
    skillSrc     = '/assets/characters/skill.png',
    accentColor  = '#fbc531',
    isEnemy      = false,
  }) {
    this.game        = game;
    this.position    = { ...position };
    this.velocity    = { ...velocity };
    this.name        = name;
    this.facingRight = facingRight;
    this.accentColor = accentColor;
    this.isEnemy     = isEnemy;

    // Pre-load images
    this.img       = loadImg(spriteSrc);
    this.imgSword  = loadImg(swordSrc);
    this.imgShield = loadImg(shieldSrc);
    this.imgSkill  = loadImg(skillSrc);

    // Hitbox
    this.width  = 80;
    this.height = 160;

    // Attack box
    this.attackBox = {
      position : { x: this.position.x + offset.x, y: this.position.y + offset.y },
      offset   : { ...offset },
      width    : 130,
      height   : 70,
    };

    // ── Combat state flags ─────────────────────────────────────
    this.isAttacking        = false;
    this.isKnifeAttacking   = false;
    this.isSpecialAttacking = false;
    this.isShielding        = false;
    this.health             = 100;
    this.isDead             = false;

    /**
     * equippedSkill: which weapon/tool is held RIGHT NOW.
     * 'sword'  → player grips sword at rest and attacks with it
     * 'shield' → player holds shield (block ready)
     * 'skill'  → player holds skill orb (charged up)
     * null     → bare hands (unarmed)
     */
    this.equippedSkill = 'sword';   // start equipped with sword

    // ── Internal animation ─────────────────────────────────────
    this._state    = 'idle';
    this._frame    = 0;
    this._t        = Math.random() * Math.PI * 2;
    this._hitFlash = 0;
    this._deathRot = 0;

    // Squash-stretch
    this._scaleX = 1;
    this._scaleY = 1;

    // Screen boundary clamping
    this.clamping = true;
  }

  /* ═══════════════════════ PUBLIC API ══════════════════════════ */

  /** Equip a skill slot — character will HOLD the item visually */
  equip(skill) {
    // 'sword' | 'shield' | 'skill' | null
    this.equippedSkill = skill;
  }

  /** Basic punch/slash — uses the equipped weapon */
  attack() {
    if (this.isDead || this.isAttacking) return;
    this.isAttacking = true;
    this._setState('punch');
    this._squash(1.3, 0.75);
    setTimeout(() => {
      this.isAttacking = false;
      if (this._state === 'punch') this._setState('idle');
    }, 350);
  }

  /** Sword-strike — lunges forward with longer reach */
  knifeAttack() {
    if (this.isDead || this.isKnifeAttacking) return;
    this.isKnifeAttacking = true;
    this.attackBox.width = 165;
    this._setState('kick');
    this._squash(0.8, 1.2);
    setTimeout(() => {
      this.isKnifeAttacking = false;
      this.attackBox.width  = 130;
      if (this._state === 'kick') this._setState('idle');
    }, 420);
  }

  /** Special skill attack — big aura burst */
  specialAttack() {
    if (this.isDead || this.isSpecialAttacking) return;
    this.isSpecialAttacking = true;
    this.attackBox.width = 210;
    this._setState('special');
    this._squash(1.15, 0.85);
    setTimeout(() => {
      this.isSpecialAttacking = false;
      this.attackBox.width    = 130;
      if (this._state === 'special') this._setState('idle');
    }, 700);
  }

  shield() {
    this.isShielding = true;
    if (this._state !== 'dead') this._setState('shield');
  }

  stopShield() {
    this.isShielding = false;
    if (this._state === 'shield') this._setState('idle');
  }

  takeHit(damage) {
    if (this.isDead) return;
    const dmg = this.isShielding ? damage * 0.1 : damage;
    this.health = Math.max(0, this.health - dmg);
    this._hitFlash = 12;
    if (!this.isShielding) {
      this._setState('hurt');
      this._squash(0.85, 1.25);
    }
    if (this.health <= 0) {
      this.isDead = true;
      this._setState('dead');
    }
  }

  /* ═══════════════════════ UPDATE ═══════════════════════════════ */

  update() {
    // Dynamically flip attackBox depending on direction
    if (this.facingRight) {
      this.attackBox.position.x = this.position.x + this.width;
    } else {
      this.attackBox.position.x = this.position.x - this.attackBox.width;
    }
    this.attackBox.position.y = this.position.y + this.attackBox.offset.y;

    if (!this._isCombatState()) {
      if      (this.isDead)                          this._setState('dead');
      else if (this.velocity.y !== 0)                this._setState('jump');
      else if (Math.abs(this.velocity.x) > 0.5)     this._setState('run');
      else if (this.isShielding)                     this._setState('shield');
      else                                           this._setState('idle');
    }

    this._frame++;
    this._t += 0.06;

    if (this.velocity.x >  0.5) this.facingRight = true;
    if (this.velocity.x < -0.5) this.facingRight = false;

    // Lerp squash back
    this._scaleX += (1 - this._scaleX) * 0.18;
    this._scaleY += (1 - this._scaleY) * 0.18;

    this._draw();

    this.position.x += this.velocity.x;
    this.position.y += this.velocity.y;

    const floorY = this.game.canvas.height - 96;
    if (this.position.y + this.height >= floorY) {
      this.velocity.y = 0;
      this.position.y = floorY - this.height;
    } else {
      this.velocity.y += this.game.gravity;
    }

    if (this.clamping) {
      if (this.position.x < 0) this.position.x = 0;
      if (this.position.x + this.width > this.game.canvas.width)
        this.position.x = this.game.canvas.width - this.width;
    }
  }

  /* ═══════════════════════ PRIVATE ══════════════════════════════ */

  _setState(s) {
    if (this._state === s) return;
    this._state = s;
    this._frame = 0;
  }

  _isCombatState() {
    return ['punch','kick','special','shield','hurt','dead'].includes(this._state);
  }

  _squash(sx, sy) { this._scaleX = sx; this._scaleY = sy; }

  /* ─── Master draw ──────────────────────────────────────────── */
  _draw() {
    const ctx = this.game.ctx;
    const f   = this._frame;
    const t   = this._t;

    const { offsetY, bobScaleY, tiltAngle } = this._getStateAnim(f, t);

    ctx.save();

    if (this._hitFlash > 0) {
      this._hitFlash--;
      ctx.filter = 'brightness(8) saturate(0)';
    }

    const cx = this.position.x + this.width  / 2;
    const cy = this.position.y + this.height + offsetY;

    ctx.translate(cx, cy);
    const flip = this.facingRight ? 1 : -1;
    ctx.scale(flip, 1);
    ctx.scale(this._scaleX, this._scaleY * bobScaleY);

    if (this._state === 'dead') {
      this._deathRot = Math.min(this._deathRot + 0.045, Math.PI / 2);
      ctx.rotate(-this._deathRot);
    }
    ctx.rotate(tiltAngle);

    // Sprite body
    const dw = this.width  * 2.4;
    const dh = this.height * 1.32;
    if (this.img.complete && this.img.naturalWidth > 0) {
      ctx.drawImage(this.img, -dw / 2, -dh, dw, dh);
    } else {
      ctx.fillStyle = '#888';
      ctx.fillRect(-this.width/2, -this.height, this.width, this.height);
    }

    // Weapon / item overlay (always visible while equipped)
    this._drawEquipped(ctx, f, t);

    ctx.restore();

    // World-space vfx
    this._drawWorldEffects(ctx);

    // Ground shadow
    this._drawShadow(ctx);
  }

  /* ─── EQUIPPED ITEM DRAWING ──────────────────────────────────
   *  Draws the held weapon / accessory in the character's local
   *  coordinate system (already flipped + squashed by _draw).
   *
   *  Key idea:
   *    REST  position  → item held calmly in hand
   *    ACTIVE position → item animating during the matching attack
   ──────────────────────────────────────────────────────────── */
  _drawEquipped(ctx, f, t) {
    const eq    = this.equippedSkill;
    const state = this._state;

    if (!eq) return;   // bare-handed

    switch (eq) {

      /* ── SWORD ────────────────────────────────────────────── */
      case 'sword': {
        if (!this.imgSword.complete || !this.imgSword.naturalWidth) break;

        // Sword is ALWAYS drawn – angle changes per state
        const SW = 130;   // ← BIGGER sword (was ~80)
        const SH = SW * (this.imgSword.naturalHeight / this.imgSword.naturalWidth);

        let tx = 28, ty = -this.height * 0.62;
        let angle = -Math.PI * 0.28;   // default rest: angled forward down

        if (state === 'punch') {
          // Stab forward: sword thrusts out horizontally
          const ext = Math.min(f / 5, 1);
          angle = (-Math.PI * 0.05) + (-Math.PI * 0.05) * ext;
          tx = 30 + ext * 22;
        } else if (state === 'kick') {
          // Wide slash: sword sweeps from high to low
          const ext = Math.min(f / 6, 1);
          angle = -Math.PI * 0.55 + (Math.PI * 0.85) * ext;
          tx = 32 + ext * 10;
          ty = -this.height * 0.66 - ext * 8;
        } else if (state === 'special') {
          // Raised overhead + shaking
          angle = -Math.PI * 0.75 + Math.sin(f * 0.4) * 0.12;
          tx = 18;
          ty = -this.height * 0.82;
        } else if (state === 'shield') {
          // Rested at side while shielding
          angle = Math.PI * 0.42;
          tx = -16;
          ty = -this.height * 0.3;
        } else if (state === 'run') {
          // Pumping slightly with run cycle
          angle = -Math.PI * 0.22 + Math.sin(t * 3.5) * 0.1;
          ty = -this.height * 0.58 + Math.abs(Math.sin(t * 3.5)) * 5;
        } else if (state === 'jump') {
          angle = -Math.PI * 0.45;
          ty = -this.height * 0.65;
        } else if (state === 'hurt') {
          angle = -Math.PI * 0.6;
          ty = -this.height * 0.5;
          tx = 15;
        } else if (state === 'dead') {
          angle = Math.PI * 0.3;
          tx = 20; ty = -this.height * 0.25;
        } else {
          // idle: gentle sway
          angle = -Math.PI * 0.28 + Math.sin(t * 1.2) * 0.06;
          ty    = -this.height * 0.62 + Math.sin(t * 1.2) * 2;
        }

        // Glow when actively attacking
        ctx.save();
        if (state === 'punch' || state === 'kick' || state === 'special') {
          ctx.shadowColor = '#a0d8ff';
          ctx.shadowBlur  = 22;
        }
        ctx.translate(tx, ty);
        ctx.rotate(angle);
        ctx.drawImage(this.imgSword, -SW * 0.12, -SH * 0.88, SW, SH);
        ctx.restore();
        break;
      }

      /* ── SHIELD ───────────────────────────────────────────── */
      case 'shield': {
        if (!this.imgShield.complete || !this.imgShield.naturalWidth) break;

        const SZ = 90;   // shield draw size
        let tx = 34, ty = -this.height * 0.50, angle = -0.18;

        if (state === 'shield' || this.isShielding) {
          // Full block stance: shield raised
          tx = 38; ty = -this.height * 0.56; angle = -0.30;
          ctx.save();
          ctx.shadowColor = '#64b5f6';
          ctx.shadowBlur  = 28;
          ctx.translate(tx, ty);
          ctx.rotate(angle);
          ctx.drawImage(this.imgShield, -SZ * 0.25, -SZ * 0.55, SZ, SZ);
          ctx.restore();
        } else if (state === 'punch') {
          // Shield bash forward
          const ext = Math.min(f / 5, 1);
          tx = 32 + ext * 18; angle = -0.1 - ext * 0.15;
          ctx.save();
          ctx.shadowColor = '#4fc3f7';
          ctx.shadowBlur  = 18;
          ctx.translate(tx, ty);
          ctx.rotate(angle);
          ctx.drawImage(this.imgShield, -SZ * 0.25, -SZ * 0.55, SZ, SZ);
          ctx.restore();
        } else if (state === 'special') {
          // Shield spin / glow
          const spin = f * 0.15;
          ctx.save();
          ctx.translate(42, -this.height * 0.5);
          ctx.rotate(spin);
          ctx.shadowColor = '#7c4dff';
          ctx.shadowBlur  = 30;
          ctx.drawImage(this.imgShield, -SZ / 2, -SZ / 2, SZ, SZ);
          ctx.restore();
        } else {
          // REST – held in front arm, gently bobbing
          const bob = Math.sin(t * 1.2) * 0.05;
          ctx.save();
          ctx.translate(tx, ty + Math.sin(t * 1.2) * 2);
          ctx.rotate(angle + bob);
          ctx.drawImage(this.imgShield, -SZ * 0.25, -SZ * 0.55, SZ, SZ);
          ctx.restore();
        }
        break;
      }

      /* ── SKILL ORB ────────────────────────────────────────── */
      case 'skill': {
        if (!this.imgSkill.complete || !this.imgSkill.naturalWidth) break;

        const SZ = 56;

        if (state === 'special') {
          // Skill explodes outward in a burst
          const ext  = Math.min(f / 8, 1);
          const size = SZ + ext * 40;
          const spin = f * 0.22;
          ctx.save();
          ctx.translate(55, -this.height * 0.55);
          ctx.rotate(spin);
          ctx.globalAlpha = 0.95 - ext * 0.35;
          ctx.shadowColor = '#ffab40';
          ctx.shadowBlur  = 40;
          ctx.drawImage(this.imgSkill, -size / 2, -size / 2, size, size);
          ctx.restore();

          // Extra orbiting rings while activating
          [0.6, 1.2].forEach((off, i) => {
            const r  = 50 + i * 20;
            const a  = f * 0.15 + off;
            const ox = Math.cos(a) * r;
            const oy = Math.sin(a) * r * 0.4;
            ctx.save();
            ctx.translate(55 + ox, -this.height * 0.55 + oy);
            ctx.rotate(spin * 2);
            ctx.globalAlpha = 0.6;
            ctx.drawImage(this.imgSkill, -SZ * 0.3, -SZ * 0.3, SZ * 0.6, SZ * 0.6);
            ctx.restore();
          });

        } else if (state === 'punch' || state === 'kick') {
          // Skill thrown / thrust forward
          const ext   = Math.min(f / 5, 1);
          const spark = SZ * (0.9 + ext * 0.25);
          ctx.save();
          ctx.translate(34 + ext * 30, -this.height * 0.56);
          ctx.rotate(f * 0.2);
          ctx.shadowColor = '#ffcc00';
          ctx.shadowBlur  = 20;
          ctx.drawImage(this.imgSkill, -spark / 2, -spark / 2, spark, spark);
          ctx.restore();

        } else if (state === 'shield' || this.isShielding) {
          // Skill held in front like a ward
          ctx.save();
          ctx.translate(36, -this.height * 0.5);
          ctx.rotate(Math.sin(t * 2) * 0.08);
          ctx.shadowColor = '#ff9800';
          ctx.shadowBlur  = 16;
          ctx.drawImage(this.imgSkill, -SZ / 2, -SZ / 2, SZ, SZ);
          ctx.restore();

        } else {
          // REST – orb floats gently in hand
          const bob  = Math.sin(t * 1.8) * 4;
          const spin = t * 0.4;
          ctx.save();
          ctx.translate(30, -this.height * 0.58 + bob);
          ctx.rotate(spin);
          ctx.shadowColor = '#ffab40';
          ctx.shadowBlur  = 14;
          ctx.globalAlpha = 0.92;
          ctx.drawImage(this.imgSkill, -SZ / 2, -SZ / 2, SZ, SZ);
          ctx.restore();
        }
        break;
      }
    }
  }

  /* ─── World-space VFX ────────────────────────────────────── */
  _drawWorldEffects(ctx) {
    const cx = this.position.x + this.width  / 2;
    const cy = this.position.y + this.height / 2;

    // Shield bubble (always when equipped+blocking OR just blocking)
    if (this.isShielding || (this.equippedSkill === 'shield' && this._state === 'shield')) {
      ctx.save();
      ctx.globalAlpha = 0.40 + Math.sin(this._t * 4) * 0.08;
      const r   = 76;
      const grd = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      grd.addColorStop(0, 'rgba(100,200,255,0.85)');
      grd.addColorStop(1, 'rgba(0,60,220,0.0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,230,255,0.65)';
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Skill equip – ambient glow around character
    if (this.equippedSkill === 'skill' && !this.isSpecialAttacking) {
      const t = this._t;
      ctx.save();
      ctx.globalAlpha = 0.18 + Math.sin(t * 2) * 0.06;
      const grd = ctx.createRadialGradient(cx, cy, 10, cx, cy, 70);
      grd.addColorStop(0, 'rgba(255,180,0,0.8)');
      grd.addColorStop(1, 'rgba(255,80,0,0.0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(cx, cy, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Special aura rings
    if (this.isSpecialAttacking) {
      const tNow = Date.now() / 80;
      [[75,'rgba(255,200,0,0.65)',3],[95,'rgba(255,120,0,0.45)',2],[115,'rgba(255,50,0,0.25)',2]]
        .forEach(([r, c, lw], i) => {
          const pulse = r + Math.sin(tNow + i * 1.2) * 10;
          ctx.save();
          ctx.strokeStyle = c;
          ctx.lineWidth   = lw;
          ctx.shadowColor = '#ff8800';
          ctx.shadowBlur  = 18;
          ctx.beginPath();
          ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        });
      ctx.save();
      const grd = ctx.createRadialGradient(cx, cy, 10, cx, cy, 80);
      grd.addColorStop(0, 'rgba(255,200,0,0.3)');
      grd.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle   = grd;
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.arc(cx, cy, 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Sword attack trail
    if ((this.isAttacking || this.isKnifeAttacking) && this.equippedSkill === 'sword') {
      const startA = this.facingRight ? -1.5 : Math.PI + 1.5;
      const endA   = this.facingRight ?  0.5 : Math.PI - 0.5;
      ctx.save();
      ctx.globalAlpha  = 0.65;
      ctx.strokeStyle  = '#a0d8ff';
      ctx.lineWidth    = 6;
      ctx.shadowColor  = '#7ef';
      ctx.shadowBlur   = 24;
      ctx.lineCap      = 'round';
      ctx.beginPath();
      ctx.arc(cx, this.position.y + this.height * 0.42, 85, startA, endA, !this.facingRight);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ─── Ground shadow ──────────────────────────────────────── */
  _drawShadow(ctx) {
    const cx      = this.position.x + this.width / 2;
    const groundY = this.game.canvas.height - 96;
    const w       = this.width * 1.6 * Math.abs(this._scaleX);
    ctx.save();
    ctx.globalAlpha = 0.30;
    const sg = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, w * 0.55);
    sg.addColorStop(0, 'rgba(0,0,0,0.8)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(cx, groundY, w * 0.55, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ─── State animation params ─────────────────────────────── */
  _getStateAnim(f, t) {
    let offsetY   = 0;
    let bobScaleY = 1;
    let tiltAngle = 0;

    switch (this._state) {
      case 'idle':
        offsetY   = Math.sin(t * 1.2) * 3;
        bobScaleY = 1 + Math.sin(t * 1.2) * 0.015;
        break;
      case 'run': {
        const c = Math.sin(t * 3.5);
        offsetY  = Math.abs(c) * -5;
        bobScaleY = 1 - Math.abs(c) * 0.04;
        tiltAngle = 0.12;
        break;
      }
      case 'jump':
        bobScaleY = 1.05;
        tiltAngle = this.velocity.y < 0 ? -0.08 : 0.06;
        break;
      case 'punch':
        tiltAngle = 0.12;
        break;
      case 'kick':
        tiltAngle = 0.18;
        break;
      case 'special':
        offsetY   = -Math.abs(Math.sin(f * 0.22)) * 8;
        bobScaleY = 1 + Math.sin(f * 0.3) * 0.05;
        break;
      case 'shield':
        offsetY   = 8;
        bobScaleY = 0.93;
        break;
      case 'hurt':
        tiltAngle = -0.25;
        offsetY   = Math.min(f, 8) * 0.5;
        if (f > 15) this._setState('idle');
        break;
      case 'dead':
        break;
    }
    return { offsetY, bobScaleY, tiltAngle };
  }

  animate() {}  // Sprite API stub
}
