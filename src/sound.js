/**
 * sound.js — Procedural Web Audio Engine + MP3 BGM support
 */
class SoundEngine {
  constructor() {
    this.ctx        = null;
    this.master     = null;
    this.sfxVol     = 2.0;
    this.musicVol   = 1.0;
    this.muted      = false;
    this._bgmOn     = false;
    this._bgmTimer  = null;

    // ── MP3 BGM ──────────────────────────────────────
    this._musicAudio   = null;   // <audio> element for MP3 BGM
    this._usingMp3     = false;  // true when an MP3 is playing
    this._currentTrack = null;   // src string of current track
  }

  /* ── Init (call on first user gesture) ───────────────────── */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    this.ctx    = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    // Only start procedural BGM if no MP3 is queued
    if (!this._usingMp3) this._startBGM();
  }

  toggleMute() {
    this.muted = !this.muted;
    // Mute/unmute procedural engine
    if (this.master)
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx ? this.ctx.currentTime : 0, 0.05);
    // Mute/unmute MP3 audio element
    if (this._musicAudio)
      this._musicAudio.volume = this.muted ? 0 : 0.6;
    return this.muted;
  }

  /* ── MP3 BGM Controls ─────────────────────────────────────── */

  /**
   * Play an MP3 file as background music.
   * Stops the procedural BGM and any previously playing MP3.
   * @param {string} src  - path like '/sound/sound1.mp3'
   */
  playMusic(src) {
    // Stop procedural BGM
    this._bgmOn = false;
    clearTimeout(this._bgmTimer);

    // If same track already playing, do nothing
    if (this._currentTrack === src && this._musicAudio && !this._musicAudio.paused) return;
    this._currentTrack = src;

    // Tear down old audio element
    if (this._musicAudio) {
      this._musicAudio.pause();
      this._musicAudio.src = '';
    }

    const audio = new Audio(src);
    audio.loop   = true;
    audio.volume = this.muted ? 0 : 0.6;
    this._musicAudio = audio;
    this._usingMp3   = true;

    // Resume AudioContext if needed (browser policy)
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();

    audio.play().catch(err => console.warn('BGM play blocked:', err));
  }

  /**
   * Stop the current MP3 and restart the procedural BGM.
   */
  stopMusic() {
    if (this._musicAudio) {
      this._musicAudio.pause();
      this._musicAudio.src = '';
      this._musicAudio = null;
    }
    this._usingMp3     = false;
    this._currentTrack = null;
    // Restart procedural BGM
    if (this.ctx) this._startBGM();
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  _now() { return this.ctx.currentTime; }

  _gain(vol) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(this.master);
    return g;
  }

  _noise(dur) {
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    return s;
  }

  _osc(type, freq, start, stop, g, v0, v1) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g);
    g.gain.setValueAtTime(v0, start);
    g.gain.exponentialRampToValueAtTime(Math.max(v1, 0.0001), stop);
    o.start(start); o.stop(stop + 0.01);
  }

  /* ── SFX: Hit sounds ─────────────────────────────────────── */
  playPunch() {
    if (!this.ctx) return;
    const t = this._now(), v = this.sfxVol;
    // Heavy Sub Thud
    const g1 = this._gain(0);
    const o1 = this.ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(220, t);
    o1.frequency.exponentialRampToValueAtTime(30, t + 0.15); // Deeper drop
    o1.connect(g1);
    g1.gain.setValueAtTime(v * 1.5, t); // Super loud initial hit
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o1.start(t); o1.stop(t + 0.2);
    // Distortion Crunch
    const n = this._noise(0.12), f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 0.8; // Wider crunch
    const gn = this._gain(0);
    n.connect(f); f.connect(gn);
    gn.gain.setValueAtTime(v * 0.8, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    n.start(t); n.stop(t + 0.13);
  }

  playSwordClash() {
    if (!this.ctx) return;
    const t = this._now(), v = this.sfxVol;
    [700, 1100, 1550, 2100].forEach(hz => {
      const g = this._gain(0);
      this._osc('triangle', hz + (Math.random()-0.5)*30, t, t+0.7, g, v*0.16, 0.001);
    });
    const g2 = this._gain(0);
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(230, t);
    o2.frequency.exponentialRampToValueAtTime(70, t + 0.08);
    o2.connect(g2);
    g2.gain.setValueAtTime(v * 0.6, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o2.start(t); o2.stop(t + 0.12);
  }

  playShieldBlock() {
    if (!this.ctx) return;
    const t = this._now(), v = this.sfxVol;
    // Boom
    const g1 = this._gain(0);
    const o1 = this.ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(140, t);
    o1.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    o1.connect(g1);
    g1.gain.setValueAtTime(v * 0.85, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o1.start(t); o1.stop(t + 0.16);
    // Metallic ping
    const g2 = this._gain(0);
    this._osc('triangle', 2600, t, t+0.45, g2, v*0.28, 0.001);
  }

  /* ── SFX: Attack sounds ──────────────────────────────────── */
  playSwordSwing() {
    if (!this.ctx) return;
    const t = this._now(), v = this.sfxVol;
    const n = this._noise(0.22), f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(2800, t + 0.20);
    f.Q.value = 2.8;
    const gn = this._gain(0);
    n.connect(f); f.connect(gn);
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(v * 0.55, t + 0.04);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    n.start(t); n.stop(t + 0.23);
  }

  playSkillCast() {
    if (!this.ctx) return;
    const t = this._now(), v = this.sfxVol;
    // Rising tone
    const g1 = this._gain(0);
    const o1 = this.ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(260, t);
    o1.frequency.exponentialRampToValueAtTime(1050, t + 0.45);
    o1.connect(g1);
    g1.gain.setValueAtTime(v * 0.5, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o1.start(t); o1.stop(t + 0.52);
    // Sparkles
    [0, 0.07, 0.14, 0.21].forEach((d, i) => {
      const gs = this._gain(0);
      const ts = t + d;
      this._osc('sine', 1300 + i*380, ts, ts+0.18, gs, v*0.13, 0.001);
    });
  }

  playSpecialMove() {
    if (!this.ctx) return;
    const t = this._now(), v = this.sfxVol;
    // Bass boom
    const g1 = this._gain(0);
    const o1 = this.ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(90, t);
    o1.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    o1.connect(g1);
    g1.gain.setValueAtTime(v * 0.9, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o1.start(t); o1.stop(t + 0.46);
    // Energy surge
    const g2 = this._gain(0);
    const o2 = this.ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.setValueAtTime(150, t);
    o2.frequency.exponentialRampToValueAtTime(900, t + 0.5);
    o2.connect(g2);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(v * 0.4, t + 0.1);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o2.start(t); o2.stop(t + 0.61);
    // Noise burst
    const n = this._noise(0.3), f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 3000;
    const gn = this._gain(0);
    n.connect(f); f.connect(gn);
    gn.gain.setValueAtTime(v * 0.45, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    n.start(t); n.stop(t + 0.31);
  }

  /* ── SFX: Movement ───────────────────────────────────────── */
  playJump() {
    if (!this.ctx) return;
    const t = this._now(), v = this.sfxVol;
    const g = this._gain(0);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.14);
    o.connect(g);
    g.gain.setValueAtTime(v * 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.start(t); o.stop(t + 0.17);
  }

  playLand() {
    if (!this.ctx) return;
    const t = this._now(), v = this.sfxVol;
    // Thud
    const g1 = this._gain(0);
    const o1 = this.ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(200, t);
    o1.frequency.exponentialRampToValueAtTime(55, t + 0.08);
    o1.connect(g1);
    g1.gain.setValueAtTime(v * 0.6, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o1.start(t); o1.stop(t + 0.11);
    // Dust
    const n = this._noise(0.06), f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 450;
    const gn = this._gain(0);
    n.connect(f); f.connect(gn);
    gn.gain.setValueAtTime(v * 0.28, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    n.start(t); n.stop(t + 0.07);
  }

  /* ── Heavy BGM Track (Loud Rock/Metal) ─────────────────── */
  _startBGM() {
    const BPM  = 160;
    const beat = 60 / BPM;
    const bar  = beat * 4;
    const loop = bar * 4; // 4-bar loop

    // E minor pentatonic / power chords
    const N = { E2:82.4, G2:98, A2:110, B2:123.5, D3:146.8, E3:164.8, G3:196, A3:220 };

    // Gritty power chords (bass + fifth)
    const chords = [
      {n:N.E2, t:0},      {n:N.E2, t:beat},      {n:N.G2, t:beat*2},    {n:N.A2, t:beat*3},
      {n:N.E2, t:bar},    {n:N.E2, t:bar+beat},  {n:N.B2, t:bar+beat*2},{n:N.D3, t:bar+beat*3},
      {n:N.E2, t:bar*2},  {n:N.E2, t:bar*2+beat},{n:N.G2, t:bar*2+beat*2},{n:N.A2, t:bar*2+beat*3},
      {n:N.B2, t:bar*3},  {n:N.B2, t:bar*3+beat},{n:N.A2, t:bar*3+beat*2},{n:N.G2, t:bar*3+beat*3},
    ];

    // Aggressive Lead Riff
    const lead = [
      {n:N.E3, t:0}, {n:N.G3, t:beat*0.5}, {n:N.E3, t:beat}, {n:N.A3, t:beat*1.5},
      {n:N.E3, t:bar}, {n:N.G3, t:bar+beat*0.5}, {n:N.E3, t:bar+beat}, {n:N.B2, t:bar+beat*1.5},
      {n:N.E3, t:bar*2}, {n:N.G3, t:bar*2+beat*0.5}, {n:N.E3, t:bar*2+beat}, {n:N.A3, t:bar*2+beat*1.5},
    ];

    // Heavy Drums
    const kicks = [0, beat*1.5, beat*2, bar, bar+beat*1.5, bar+beat*2, bar*2, bar*2+beat*1.5, bar*2+beat*2, bar*3, bar*3+beat*1.5];
    const snares = [beat, beat*3, bar+beat, bar+beat*3, bar*2+beat, bar*2+beat*3, bar*3+beat, bar*3+beat*2, bar*3+beat*3];
    const hats = Array.from({length:32}, (_,i) => i * beat * 0.5);

    const schedule = (startTime) => {
      if (!this._bgmOn) return;
      const mv = this.musicVol;

      // Power Chords (Sawtooth + slight detune for thickness)
      chords.forEach(({n, t}) => {
        const ts = startTime + t;
        [0, 3, 7].forEach(semi => { // root, minor 3rd, 5th
          const g  = this._gain(0);
          const o  = this.ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = n * Math.pow(1.05946, semi);
          o.connect(g);
          g.gain.setValueAtTime(mv * 0.45, ts);
          g.gain.exponentialRampToValueAtTime(0.001, ts + beat * 0.9);
          o.start(ts); o.stop(ts + beat);
        });
      });

      // Lead Guitar (Distorted square)
      lead.forEach(({n, t}) => {
        const ts = startTime + t;
        const g  = this._gain(0);
        const o  = this.ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = n * 2; // octave up
        // Distortion via filter
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 1.0;
        o.connect(f); f.connect(g);
        
        g.gain.setValueAtTime(mv * 0.6, ts);
        g.gain.linearRampToValueAtTime(0.001, ts + beat * 0.4);
        o.start(ts); o.stop(ts + beat * 0.5);
      });

      // Kick Drum
      kicks.forEach(t => {
        const ts = startTime + t;
        const g  = this._gain(0);
        const o  = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(250, ts);
        o.frequency.exponentialRampToValueAtTime(30, ts + 0.1);
        o.connect(g);
        g.gain.setValueAtTime(mv * 1.5, ts);
        g.gain.exponentialRampToValueAtTime(0.001, ts + 0.15);
        o.start(ts); o.stop(ts + 0.2);
      });

      // Snare Drum (Noise crash)
      snares.forEach(t => {
        const ts = startTime + t;
        const n = this._noise(0.2);
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.5;
        const g = this._gain(0);
        n.connect(f); f.connect(g);
        g.gain.setValueAtTime(mv * 1.0, ts);
        g.gain.exponentialRampToValueAtTime(0.001, ts + 0.2);
        n.start(ts); n.stop(ts + 0.25);
      });

      // Hi-Hats
      hats.forEach(t => {
        const ts = startTime + t;
        const n = this._noise(0.05);
        const f = this.ctx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 10000;
        const g = this._gain(0);
        n.connect(f); f.connect(g);
        g.gain.setValueAtTime(mv * 0.3, ts);
        g.gain.exponentialRampToValueAtTime(0.001, ts + 0.05);
        n.start(ts); n.stop(ts + 0.06);
      });

      const delay = Math.max(50, (startTime + loop - this.ctx.currentTime - 0.2) * 1000);
      this._bgmTimer = setTimeout(() => schedule(startTime + loop), delay);
    };

    this._bgmOn = true;
    schedule(this.ctx.currentTime + 0.1);
  }

  stopBGM() {
    this._bgmOn = false;
    clearTimeout(this._bgmTimer);
  }
}

export const Sound = new SoundEngine();
