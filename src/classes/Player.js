import { Sound } from '../sound.js';

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
    this.imgEffect1 = loadImg('/assets/characters/effect1.png');

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

    /**
     * heroKey: maps to unique active ability.
     * 'DEFAULT' | 'DD' | 'HARATU' | 'LUFFY'
     */
    this.heroKey = 'DEFAULT';

    // ── Internal animation ─────────────────────────────────────
    this._state    = 'idle';
    this._frame    = 0;
    this._t        = Math.random() * Math.PI * 2;
    this._hitFlash = 0;
    this._deathRot = 0;

    // Squash-stretch
    this._scaleX = 1;
    this._scaleY = 1;

    // Gear Stretch — temporary extended reach tracker
    this._stretchActive = false;

    // After-image (Phantom Rush)
    this._afterImageAlpha = 0;
    this._afterImageX     = 0;
    this._afterImageY     = 0;
    this._afterImageFlip  = 1;

    // Screen boundary clamping
    this.clamping = true;
  }

  /** Stand the character back up and clear all temporary states/animations */
  reset() {
    this.health             = 100;
    this.isDead             = false;
    this.isAttacking        = false;
    this.isKnifeAttacking   = false;
    this.isSpecialAttacking = false;
    this.isShielding        = false;
    
    this._state    = 'idle';
    this._frame    = 0;
    this._t        = Math.random() * Math.PI * 2;
    this._hitFlash = 0;
    this._deathRot = 0;
    this._scaleX   = 1;
    this._scaleY   = 1;
    
    // Ability flags
    this._stretchActive = false;
    this._afterImageAlpha = 0;
    this.velocity = { x: 0, y: 0 };
    this.clamping = true;
    
    // Clear video hero offscreen canvases if present
    this._videoCanvas     = null;
    this._videoCtx        = null;
    this._videoCropCanvas = null;
    this._videoCropCtx    = null;

    // Clear cooldowns
    this._lastSpecialTime = 0;
    this._lastShieldTime  = 0;
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
    // Anticipation pull back, then fast snap forward
    Sound.playSwordSwing();
    this._squash(0.8, 1.1); 
    setTimeout(() => {
      this._squash(1.4, 0.7); // The strike stretch
      setTimeout(() => {
        this.isAttacking = false;
        if (this._state === 'punch') this._setState('idle');
      }, 250);
    }, 100);
  }

  /** Sword-strike — lunges forward with longer reach */
  knifeAttack() {
    if (this.isDead || this.isKnifeAttacking) return;
    this.isKnifeAttacking = true;
    this.attackBox.width = 165;
    this._setState('kick');
    // Huge windup stretch
    Sound.playSwordSwing();
    this._squash(0.6, 1.3);
    setTimeout(() => {
      // Big lunge forward
      this._squash(1.5, 0.75);
      setTimeout(() => {
        this.isKnifeAttacking = false;
        this.attackBox.width  = 130;
        if (this._state === 'kick') this._setState('idle');
      }, 300);
    }, 120);
  }

  /** Special skill attack — big aura burst and backflip */
  specialAttack() {
    if (this.isDead || this.isSpecialAttacking) return;
    
    // Cooldown logic: 3 seconds
    const now = Date.now();
    if (this._lastSpecialTime && now - this._lastSpecialTime < 3000) return;
    this._lastSpecialTime = now;

    this._activateSpecial();
  }

  /**
   * Raw special-attack activation — NO cooldown guard.
   * Called by the hero ability system which manages its own cooldowns.
   */
  _activateSpecial() {
    if (this.isDead || this.isSpecialAttacking) return;
    Sound.playSkillCast();
    this.isSpecialAttacking = true;
    this.attackBox.width = 250;   // wider reach
    this._setState('special');
    this._squash(1.2, 0.85);
    setTimeout(() => {
      this.isSpecialAttacking = false;
      this.attackBox.width    = 130;
      if (this._state === 'special') this._setState('idle');
    }, 2000);  // 2 full seconds of active skill window
  }

  shield() {
    if (this.isDead || this.isShielding) return;

    // Shield Cooldown: 2 seconds after dropping it
    const now = Date.now();
    if (this._lastShieldTime && now - this._lastShieldTime < 2000) return;

    this.isShielding = true;
    if (this._state !== 'dead') this._setState('shield');
    
    const btn = document.getElementById('btn-shield');
    if (btn) btn.style.filter = 'drop-shadow(0 0 8px #64b5f6)'; // Brighten while holding
  }

  stopShield() {
    if (!this.isShielding) return;
    this.isShielding = false;
    if (this._state === 'shield') this._setState('idle');
    
    // Start cooldown
    this._lastShieldTime = Date.now();
    const btn = document.getElementById('btn-shield');
    if (btn) {
      btn.style.filter = 'grayscale(100%) brightness(0.5)';
      setTimeout(() => { if (btn) btn.style.filter = ''; }, 2000);
    }
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
    // ✅ FIX: update attackBox Y every frame (was frozen at construction offset)
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
    const wasAir = this.velocity.y !== 0;
    if (this.position.y + this.height >= floorY) {
      if (wasAir && this.velocity.y > 2) {
        this._onLand();
        // Dynamic heavy landing squash based on fall speed
        const impact = Math.min(this.velocity.y / 20, 1.5);
        this._squash(1 + (impact * 0.5), 1 - (impact * 0.4));
      }
      this.velocity.y = 0;
      this.position.y = floorY - this.height;
    } else {
      this.velocity.y += this.game.gravity;
      // No in-air stretch — character keeps normal proportions while jumping
    }

    if (this.clamping) {
      if (this.position.x < 0) this.position.x = 0;
      if (this.position.x + this.width > this.game.canvas.width)
        this.position.x = this.game.canvas.width - this.width;
    }
  }

  /* ═══════════════════════ PRIVATE ══════════════════════════════ */

  _onLand()  { Sound.playLand(); }
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

    const anim = this._getStateAnim(f, t);

    ctx.save();

    // Hit flash: scoped inside this save() block so it ONLY affects this character's pixels
    const doHitFlash = this._hitFlash > 0;
    if (doHitFlash) {
      this._hitFlash--;
      ctx.filter = 'brightness(5) saturate(0)';
    }

    const cx = this.position.x + this.width  / 2;
    const cy = this.position.y + this.height + anim.offsetY;

    ctx.translate(cx, cy);
    const flip = this.facingRight ? 1 : -1;
    ctx.scale(flip, 1);
    ctx.scale(this._scaleX, this._scaleY * anim.bobScaleY);

    if (this._state === 'dead') {
      this._deathRot = Math.min(this._deathRot + 0.045, Math.PI / 2);
      ctx.rotate(-this._deathRot);
    }
    ctx.rotate(anim.globalRot);

    // Sprite body - SEGMENTED PUPPET RENDERING
    const dw = this.width  * 2.4;
    const dh = this.height * 1.32;
    const dhBot = dh * 0.45;

    // Accept HTMLImageElement, HTMLCanvasElement, or HTMLVideoElement
    const imgReady = this.img && (
      (this.img.complete && this.img.naturalWidth > 0) ||          // <img>
      (this.img.width > 0 && this.img.height > 0 &&
       this.img.tagName !== 'VIDEO') ||                            // <canvas>
      (this.img.tagName === 'VIDEO' &&
       this.img.readyState >= 2 && this.img.videoWidth > 0)       // <video>
    );
    if (imgReady) {
      // ── For video heroes: detect bg color from corners, strip it, crop to char ──
      let drawSrc = this.img;
      if (this.img.tagName === 'VIDEO') {
        const VW = this.img.videoWidth;
        const VH = this.img.videoHeight;
        const scale = Math.min(320 / VW, 1);
        const SW    = Math.round(VW * scale);
        const SH    = Math.round(VH * scale);

        if (!this._videoCanvas) {
          this._videoCanvas = document.createElement('canvas');
          this._videoCanvas.width  = SW;
          this._videoCanvas.height = SH;
          this._videoCtx = this._videoCanvas.getContext('2d', { willReadFrequently: true });
        } else if (this._videoCanvas.width !== SW) {
          this._videoCanvas.width  = SW;
          this._videoCanvas.height = SH;
        }

        this._videoCtx.clearRect(0, 0, SW, SH);
        this._videoCtx.drawImage(this.img, 0, 0, SW, SH);
        const id = this._videoCtx.getImageData(0, 0, SW, SH);
        const d  = id.data;

        // ── Step 1: Detect bg color — sample 4 corners, pick most likely BG ────
        const samplePatch = (cx, cy) => {
          let sr=0, sg=0, sb=0, cnt=0;
          const R = 4;
          for (let dy=-R; dy<=R; dy++) for (let dx=-R; dx<=R; dx++) {
            const px = Math.min(SW-1, Math.max(0, cx+dx));
            const py = Math.min(SH-1, Math.max(0, cy+dy));
            const ii = (py*SW+px)*4;
            sr+=d[ii]; sg+=d[ii+1]; sb+=d[ii+2]; cnt++;
          }
          const ar=sr/cnt, ag=sg/cnt, ab=sb/cnt;
          let variance = 0;
          for (let dy=-R; dy<=R; dy++) for (let dx=-R; dx<=R; dx++) {
            const px = Math.min(SW-1, Math.max(0, cx+dx));
            const py = Math.min(SH-1, Math.max(0, cy+dy));
            const ii = (py*SW+px)*4;
            variance += Math.abs(d[ii]-ar)+Math.abs(d[ii+1]-ag)+Math.abs(d[ii+2]-ab);
          }
          // Score combined: low variance is GOOD, very bright is usually BG
          const brightness = (ar + ag + ab) / 3;
          const score = variance - (brightness * 0.5); 
          return { r:ar, g:ag, b:ab, score };
        };
        const patches = [
          samplePatch(0, 0), samplePatch(SW-1, 0),
          samplePatch(0, SH-1), samplePatch(SW-1, SH-1)
        ];
        const best = patches.reduce((a, b) => b.score < a.score ? b : a);
        const bgR = best.r, bgG = best.g, bgB = best.b;

        // ── Step 2: Global color match + bounding box ───────────────
        const thr = 80;
        let minX = SW, maxX = 0, minY = SH, maxY = 0;
        for (let py = 0; py < SH; py++) {
          for (let px = 0; px < SW; px++) {
            const ii = (py * SW + px) * 4;
            const dist = Math.max(Math.abs(d[ii]-bgR), Math.abs(d[ii+1]-bgG), Math.abs(d[ii+2]-bgB));
            if (dist < thr) {
              d[ii+3] = dist < thr*0.35 ? 0 : Math.round(d[ii+3]*((dist-thr*0.35)/(thr*0.65)));
            } else if (d[ii+3] > 10) {
              if (px < minX) minX = px; if (px > maxX) maxX = px;
              if (py < minY) minY = py; if (py > maxY) maxY = py;
            }
          }
        }
        this._videoCtx.putImageData(id, 0, 0);



        // ── Step 3: Crop to character bounding box ───────────────────────────
        if (maxX > minX && maxY > minY) {
          const pad = 8;
          const cx = Math.max(0, minX - pad);
          const cy = Math.max(0, minY - pad);
          const cw = Math.min(SW, maxX + pad + 1) - cx;
          const ch = Math.min(SH, maxY + pad + 1) - cy;

          if (!this._videoCropCanvas) {
            this._videoCropCanvas = document.createElement('canvas');
            this._videoCropCtx    = this._videoCropCanvas.getContext('2d');
          }
          this._videoCropCanvas.width  = cw;
          this._videoCropCanvas.height = ch;
          this._videoCropCtx.clearRect(0, 0, cw, ch);
          this._videoCropCtx.drawImage(this._videoCanvas, cx, cy, cw, ch, 0, 0, cw, ch);
          drawSrc = this._videoCropCanvas;
        } else {
          drawSrc = this._videoCanvas;
        }
      }

      const nw = drawSrc.naturalWidth  || drawSrc.videoWidth  || drawSrc.width;
      const nh = drawSrc.naturalHeight || drawSrc.videoHeight || drawSrc.height;
      const isVideoSrc = (this.img && this.img.tagName === 'VIDEO');

      if (isVideoSrc && this._videoCanvas) {
        // ── VIDEO HERO: Proportional Scaling ──
        // We calculate a fixed scale based on the raw video canvas height.
        // This ensures the character doesn't stretch or squash when their 
        // bounding box changes shape (e.g. swinging a sword wide).
        const frameScale = 300 / this._videoCanvas.height; 
        
        const vdw = nw * frameScale;
        const vdh = nh * frameScale;
        
        ctx.save();
        ctx.rotate(anim.topRot);  // body tilt animation still applies
        // Draw from y=0 (feet/ground) up to y=-vdh (top of crop)
        ctx.drawImage(drawSrc, 0, 0, nw, nh, -vdw / 2, -vdh, vdw, vdh);
        ctx.restore();
      } else {
        // ── IMAGE HERO: segmented puppet rendering (existing system) ──────────
        const cutY  = nh * 0.55; // Waist line in raw image
        const dhTop = dh * 0.55;

        const isSplitRun = (this._state === 'run');

        if (isSplitRun) {
          // SEGMENTED RENDERING — Only for run (stomach stays still)
          const hipPct = 0.35;
          const dhHip = dhBot * hipPct;
          const dhLeg = dhBot * (1 - hipPct);
          const nwHip = nw;      const nhHip = (nh - cutY) * hipPct;
          const nwLeg = nw;      const nhLeg = (nh - cutY) * (1 - hipPct);
          const syHip = cutY;    const syLeg = cutY + nhHip;

          // 1. Hips (Static with torso)
          ctx.save();
          ctx.translate(0, -dhBot);
          ctx.rotate(anim.topRot);
          ctx.drawImage(drawSrc, 0, syHip, nwHip, nhHip, -dw / 2, 0, dw, dhHip + 2);
          ctx.restore();

          // 2. Legs (Rotation from hip-line)
          ctx.save();
          ctx.translate(0, -dhBot + dhHip);
          ctx.rotate(anim.bottomRot);
          ctx.scale(1, anim.bottomScaleY);
          ctx.drawImage(drawSrc, 0, syLeg, nwLeg, nhLeg, -dw / 2, -1, dw, dhLeg + 1);
          ctx.restore();
        } else {
          // SOLID RENDERING — For combat/skills
          ctx.save();
          ctx.translate(0, -dhBot);
          ctx.rotate(anim.bottomRot);
          ctx.scale(1, anim.bottomScaleY);
          ctx.drawImage(drawSrc, 0, cutY, nw, nh - cutY, -dw / 2, 0, dw, dhBot);
          ctx.restore();
        }

        // Top Half (Torso, Head, Arms)
        ctx.save();
        ctx.translate(0, -dhBot);
        ctx.rotate(anim.topRot);
        ctx.drawImage(drawSrc, 0, 0, nw, cutY, -dw / 2, -dhTop, dw, dhTop + 5);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = '#888';
      ctx.fillRect(-this.width/2, -this.height, this.width, this.height);
    }


    // Weapon / item overlay (matches Top Half rotation)
    ctx.save();
    ctx.translate(0, -dhBot); // Go to waist pivot
    ctx.rotate(anim.topRot);  // Rotate with body
    ctx.translate(0, dhBot);  // Go back to floor origin
    this._drawEquipped(ctx, f, t);
    ctx.restore();

    ctx.restore();

    // After-image ghost (Phantom Rush)
    if (this._afterImageAlpha > 0) {
      this._afterImageAlpha -= 0.045;
      this._drawAfterImage(ctx);
    }

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
    if (this.isEnemy) return; // Enemies already have weapons drawn into their sprites
    
    const eq    = this.equippedSkill;
    const state = this._state;

    if (!eq) return;   // bare-handed

    switch (eq) {

          /* ── SWORD ────────────────────────────────────────────── */
      case 'sword': {
        if (!this.imgSword.complete || !this.imgSword.naturalWidth) break;

        const SW = 100; // Even smaller for better proportions
        const SH = SW * (this.imgSword.naturalHeight / this.imgSword.naturalWidth);

        let tx = 28, ty = -this.height * 0.62;
        let angle = -Math.PI * 0.28;
        const isActiveAtk = (state === 'punch' || state === 'kick' || state === 'special');

        if (state === 'punch') {
          const ext = Math.min(f / 5, 1);
          angle = (-Math.PI * 0.05) + (-Math.PI * 0.05) * ext;
          tx = 30 + ext * 22;
        } else if (state === 'kick') {
          const ext = Math.min(f / 6, 1);
          angle = -Math.PI * 0.55 + (Math.PI * 0.85) * ext;
          tx = 32 + ext * 10;
          ty = -this.height * 0.66 - ext * 8;
        } else if (state === 'special') {
          angle = f * -0.5;
          tx = 18;
          ty = -this.height * 0.6;
        } else if (state === 'shield') {
          angle = Math.PI * 0.42;
          tx = -16;
          ty = -this.height * 0.3;
        } else if (state === 'run') {
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
          angle = -Math.PI * 0.28;
          ty    = -this.height * 0.62;
        }

        ctx.save();
        // shadowBlur only during active attacks — idle has no glow cost
        if (isActiveAtk) {
          ctx.shadowColor = '#a0d8ff';
          ctx.shadowBlur  = 22;
        }

        let pivotX = SW * 0.12;
        let pivotY = SH * 0.88;
        let addedAngle = 0;

        // Customise handle pivot based on the sword image since they are drawn differently
        if (this.imgSword.src && this.imgSword.src.includes('sword3')) {
          // The huge blue sword image has the handle at the TOP
          pivotX = SW * 0.5;
          pivotY = SH * 0.08; 
          addedAngle = Math.PI; // Flip it so tip points UP
        }


        ctx.translate(tx, ty);
        ctx.rotate(angle + addedAngle);
        ctx.drawImage(this.imgSword, -pivotX, -pivotY, SW, SH);
        ctx.restore();
        break;
      }

      /* ── REIMAGINED METALLIC FIRE SHIELD ──────────────────────────────────── */
      case 'shield': {
        const SZ = 70; // Much smaller shield size
        let tx = 34, ty = -this.height * 0.50, angle = -0.18;
        const tNow = Date.now() / 150;

        if (state === 'shield' || this.isShielding) {
          tx = 38; ty = -this.height * 0.56; angle = -0.30;
        } else if (state === 'punch') {
          const ext = Math.min(f / 5, 1);
          tx = 32 + ext * 18; angle = -0.1 - ext * 0.15;
        } else if (state === 'special') {
          tx = 42; ty = -this.height * 0.5; angle = f * 0.5;
        } else {
          const bob = Math.sin(t * 1.2) * 0.05;
          ty += Math.sin(t * 1.2) * 2; angle += bob;
        }

        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(angle);
        // Translate to the middle visual center for the new vector draw
        ctx.translate(SZ*0.25, -SZ*0.05);

        this._drawReimaginedFireShield(ctx, SZ, tNow);
        
        ctx.restore();
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

    // --- Floating Health Bar for all enemies ---
    if (this.isEnemy && !this.isDead && !this.isHidden) {
      const bw = 60;
      const bh = 6;
      const bx = cx - bw / 2;
      const by = this.position.y - 20;
      const hpPct = Math.max(0, this.health || 0) / 100;
      
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#000';
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#b71c1c';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(bx, by, bw * hpPct, bh);
      ctx.restore();
    }

    // Shield bubble — gradient cached by position bucket (16px grid)
    if (this.isShielding || (this.equippedSkill === 'shield' && this._state === 'shield')) {
      const bucket = Math.round(cx / 16);
      if (bucket !== this._shieldGrdBucket) {
        this._shieldGrdBucket = bucket;
        const r = 45;
        this._shieldGrd = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
        this._shieldGrd.addColorStop(0, 'rgba(255,200,0,0.85)'); // fiery gold inner
        this._shieldGrd.addColorStop(1, 'rgba(255,50,0,0.0)');   // red outer
      }
      ctx.save();
      ctx.globalAlpha = 0.40 + Math.sin(this._t * 4) * 0.08;
      ctx.fillStyle   = this._shieldGrd;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 45, 45 * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,150,0,0.65)'; // fiery border
      ctx.lineWidth   = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Skill equip ambient glow — gradient cached
    if (this.equippedSkill === 'skill' && !this.isSpecialAttacking) {
      const bucket = Math.round(cx / 16);
      if (bucket !== this._skillGrdBucket) {
        this._skillGrdBucket = bucket;
        this._skillGrd = ctx.createRadialGradient(cx, cy, 10, cx, cy, 70);
        this._skillGrd.addColorStop(0, 'rgba(255,180,0,0.8)');
        this._skillGrd.addColorStop(1, 'rgba(255,80,0,0.0)');
      }
      ctx.save();
      ctx.globalAlpha = 0.18 + Math.sin(this._t * 2) * 0.06;
      ctx.fillStyle   = this._skillGrd;
      ctx.beginPath();
      ctx.arc(cx, cy, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Special aura rings — batched into single save/restore
    if (this.isSpecialAttacking) {
      const tNow = Date.now() / 80;
      ctx.save();
      ctx.shadowColor = '#ff8800';
      ctx.shadowBlur  = 18;
      [[75,'rgba(255,200,0,0.65)',3],[95,'rgba(255,120,0,0.45)',2],[115,'rgba(255,50,0,0.25)',2]]
        .forEach(([r, c, lw], i) => {
          const pulse = r + Math.sin(tNow + i * 1.2) * 10;
          ctx.strokeStyle = c;
          ctx.lineWidth   = lw;
          ctx.beginPath();
          ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
          ctx.stroke();
        });
      // Gradient fill — cached
      const bucket = Math.round(cx / 16);
      if (bucket !== this._specialGrdBucket) {
        this._specialGrdBucket = bucket;
        this._specialGrd = ctx.createRadialGradient(cx, cy, 10, cx, cy, 80);
        this._specialGrd.addColorStop(0, 'rgba(255,200,0,0.3)');
        this._specialGrd.addColorStop(1, 'rgba(255,0,0,0)');
      }
      ctx.fillStyle   = this._specialGrd;
      ctx.globalAlpha = 0.65;
      ctx.shadowBlur  = 0; // no blur needed for fill
      ctx.beginPath();
      ctx.arc(cx, cy, 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Fiery attack trail ("Break Fire" Swirl - Image Match)
    if ((this.isAttacking || this.isKnifeAttacking) && !this.isEnemy) {
      ctx.save();
      const cy = this.position.y + this.height * 0.65;
      const xOff = this.facingRight ? 55 : -55; // Pushed out a bit more for the bigger size
      const dir = this.facingRight ? 1 : -1;
      const tNow = Date.now() / 150; // fast spin rotation
      
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cx + xOff, cy);

      // --- NEW: Exploding, pulsing hot core ---
      ctx.beginPath();
      ctx.arc(0, 0, 50 + Math.random() * 20, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 180, 0, 0.3)';
      ctx.shadowColor = '#ff3d00';
      ctx.shadowBlur = 80;
      ctx.fill();
      
      // Draw 3 HUGE layered crescent swirls crossing and spinning
      const rings = [
        // Outer massive red-orange sweep
        { color: 'rgba(255, 60, 0, 0.5)',  glow: '#ff2000', blur: 60, scale: 1.9, rot: tNow * dir },
        // Middle intense orange sweep (opposing side)
        { color: 'rgba(255, 120, 0, 0.8)', glow: '#ff7b00', blur: 30, scale: 1.5, rot: tNow * dir * 1.5 + Math.PI },
        // Inner blazing yellow sweep (perpendicular)
        { color: 'rgba(255, 240, 50, 1.0)', glow: '#ffffff', blur: 15, scale: 1.1, rot: tNow * dir * 2.5 + Math.PI * 0.5 }
      ];

      rings.forEach(ring => {
        ctx.save();
        ctx.rotate(ring.rot);
        ctx.scale(ring.scale, ring.scale);
        
        ctx.beginPath();
        // Start Top Point
        ctx.moveTo(0, -110);
        // Outer swept edge of the crescent (much thicker and wider)
        ctx.bezierCurveTo(dir * 160, -90, dir * 190, 70, 0, 150);
        // Inner sweeping edge wrapping back
        ctx.bezierCurveTo(dir * 110, 80, dir * 110, -50, 0, -110);

        ctx.fillStyle = ring.color;
        ctx.shadowColor = ring.glow;
        ctx.shadowBlur = ring.blur;
        ctx.fill();
        
        // Bonus inner bright outline for the sickle
        ctx.strokeStyle = ring.color.replace(/0\.\d+\)/, '1.0)'); // force fully opaque line
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 10]);
        ctx.stroke();
        
        ctx.restore();
      });
      ctx.restore();
    }
  }

  /* ─── Reimagined Metallic Fire Shield ───────────────────── */
  _drawReimaginedFireShield(ctx, SZ, tNow) {
    const scale = SZ / 100;
    ctx.save();
    ctx.scale(scale, scale);
    
    // --- 1. AMBIENT HEAT GLOW ---
    ctx.globalCompositeOperation = 'lighter';
    const bgGrd = ctx.createRadialGradient(0, 0, 10, 0, 0, 90);
    bgGrd.addColorStop(0, 'rgba(255, 100, 0, 0.4)');
    bgGrd.addColorStop(1, 'rgba(255, 0, 0, 0.0)');
    ctx.fillStyle = bgGrd;
    ctx.beginPath();
    ctx.arc(0, 0, 90, 0, Math.PI * 2);
    ctx.fill();

    // --- 2. RAGING FLAMES HUGGING THE SHIELD ---
    const drawFlame = (xOff, yOff, height, width, color, pulseOff) => {
       const pulse = Math.sin(tNow * 10 + pulseOff);
       ctx.beginPath();
       ctx.moveTo(xOff, yOff);
       ctx.quadraticCurveTo(xOff + width, yOff - height * 0.5, xOff + width * 0.2 + pulse * 10, yOff - height);
       ctx.quadraticCurveTo(xOff - width, yOff - height * 0.5, xOff, yOff);
       ctx.fillStyle = color;
       ctx.shadowColor = color.replace(/0\.\d+\)/, '1.0)');
       ctx.shadowBlur = 15;
       ctx.fill();
    };
    
    // Base flames wrapping the sides and bottom
    for (let i = 0; i < 7; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const xStart = side * (20 + Math.random() * 20);
        const yStart = 20 + Math.random() * 40;
        drawFlame(
          xStart, yStart, 
          60 + Math.random() * 40, 
          15 + Math.random() * 15, 
          i < 3 ? 'rgba(255,180,0,0.8)' : 'rgba(255,80,0,0.6)', 
          i
        );
    }
    
    // --- 3. THE BLUE METALLIC SHIELD BODY ---
    ctx.globalCompositeOperation = 'source-over';
    
    const traceShield = () => {
        ctx.beginPath();
        ctx.moveTo(0, -45); // top mid
        ctx.quadraticCurveTo(20, -50, 45, -50); // top right
        ctx.bezierCurveTo(45, 10, 20, 50, 0, 70); // right swoop
        ctx.bezierCurveTo(-20, 50, -45, 10, -45, -50); // left swoop
        ctx.quadraticCurveTo(-20, -50, 0, -45); // top left
        ctx.closePath();
    };

    // Right Side (Light Blue Bevel)
    ctx.save();
    traceShield();
    ctx.clip();
    const rGrd = ctx.createLinearGradient(0, -60, 45, 20);
    rGrd.addColorStop(0, '#17365c');
    rGrd.addColorStop(1, '#0b1c31');
    ctx.fillStyle = rGrd;
    ctx.fillRect(-80, -80, 160, 180);
    ctx.restore();

    // Left Side (Dark Blue Bevel)
    ctx.save();
    traceShield();
    ctx.clip();
    const lGrd = ctx.createLinearGradient(0, -60, -45, 20);
    lGrd.addColorStop(0, '#0e233d');
    lGrd.addColorStop(1, '#050c14');
    ctx.fillStyle = lGrd;
    ctx.fillRect(-80, -80, 80, 180); // only covers left half
    ctx.restore();

    // Center crease
    ctx.beginPath();
    ctx.moveTo(0, -45);
    ctx.lineTo(0, 70);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.stroke();

    // --- 4. THE GLOWING GOLDEN RIM ---
    ctx.globalCompositeOperation = 'lighter';
    traceShield();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ff6000';
    ctx.shadowColor = '#ff2000';
    ctx.shadowBlur = 20;
    ctx.stroke();

    traceShield();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffee00';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 5;
    ctx.stroke();
    
    // --- 5. FLOATING RISING EMBERS ---
    for (let e = 0; e < 12; e++) {
       const ey = ((tNow * 150 + e * 30) % 180) - 90; 
       const ex = Math.sin(tNow * 5 + e) * 50;
       ctx.beginPath();
       ctx.arc(ex, -ey, Math.random() * 2 + 1, 0, Math.PI*2);
       ctx.fillStyle = 'rgba(255, 220, 100, 0.9)';
       ctx.shadowBlur = 10;
       ctx.fill();
    }

    ctx.restore();
  }

  /* ─── After-image ghost (Phantom Rush) ──────────────────── */
  _drawAfterImage(ctx) {
    if (!this.img.complete || !this.img.naturalWidth) return;
    const cx = this._afterImageX + this.width / 2;
    const cy = this._afterImageY + this.height;
    const dw = this.width  * 2.4;
    const dh = this.height * 1.32;

    ctx.save();
    ctx.globalAlpha = Math.max(0, this._afterImageAlpha * 0.55);
    ctx.filter      = 'hue-rotate(160deg) brightness(1.4) saturate(2)';
    ctx.translate(cx, cy);
    ctx.scale(this._afterImageFlip, 1);
    ctx.drawImage(this.img, -dw / 2, -dh, dw, dh);
    ctx.restore();
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

  /* ─── State animation params (Dynamic Keyframing) ────────── */
  _getStateAnim(f, t) {
    let offsetY   = 0;
    let bobScaleY = 1;
    let globalRot = 0;
    let topRot    = 0;
    let bottomRot = 0;
    let bottomScaleY = 1;

    switch (this._state) {
      case 'idle':
        // Slow confident breathing
        bobScaleY = 1 + Math.sin(t * 1.5) * 0.012;
        break;
      case 'run': {
        // Torso stays still, only legs pump
        offsetY   = 0;
        bobScaleY = 1;
        globalRot = 0;
        topRot    = 0;
        // High-speed leg movement (t * 15)
        bottomRot = Math.sin(t * 15) * 0.22; 
        break;
      }
      case 'jump':
        bobScaleY = 1.05; // Slightly elongated
        globalRot = this.velocity.y < 0 ? -0.1 : 0.1; // Leans into the arc
        bottomScaleY = 0.5; // Legs tuck up tightly
        break;
      case 'punch':
        // Anticipation (frame 0-5) leans back, strike (frame 5+) lunges forward
        if (f < 5) {
          globalRot = -0.1; topRot = -0.2; offsetY = -2;
        } else {
          globalRot = 0.1; topRot = 0.2; offsetY = 3;
        }
        break;
      case 'kick':
        // Sword slash: big windup, enormous snap forward
        if (f < 6) {
          globalRot = -0.15; topRot = -0.3; offsetY = -4;
        } else {
          globalRot = 0.2; topRot = 0.4; offsetY = 5;
        }
        break;
      case 'special':
        // High leap, body doesn't spin (user preference)
        globalRot = 0; 
        topRot    = -0.15; // Lean back
        offsetY   = -Math.abs(Math.sin(f * 0.15)) * 40; // High leap
        bottomScaleY = 0.8; // Tucked legs
        break;
      case 'shield':
        // Brace hard into the ground
        offsetY   = 12;
        bobScaleY = 0.85; // Crunched down extremely low
        topRot    = 0.15;
        bottomRot = -0.1;
        break;
      case 'hurt':
        // Violent whiplash backwards
        globalRot = -0.2;
        topRot    = -0.3;
        offsetY   = Math.min(f, 8) * -1;
        if (f > 15) this._setState('idle');
        break;
      case 'dead':
        break;
    }
    return { offsetY, bobScaleY, globalRot, topRot, bottomRot, bottomScaleY };
  }

  animate() {}  // Sprite API stub
}

