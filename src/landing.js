/**
 * Fighter Game – Landing Page JS (rebuilt 2026-04)
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ── 1. Mobile Menu ── */
  const mobileBtn  = document.getElementById('mobileBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileLinks = document.querySelectorAll('.mobile-link');

  if (mobileBtn && mobileMenu) {
    mobileBtn.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('open');
      const [s0, s1, s2] = mobileBtn.querySelectorAll('span');
      if (open) {
        s0.style.transform = 'rotate(45deg) translate(5px,5px)';
        s1.style.opacity   = '0';
        s2.style.transform = 'rotate(-45deg) translate(7px,-6px)';
      } else {
        s0.style.transform = s2.style.transform = 'none';
        s1.style.opacity = '1';
      }
    });
    mobileLinks.forEach(l => l.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      mobileBtn.querySelectorAll('span').forEach(s => { s.style.transform = 'none'; s.style.opacity = '1'; });
    }));
  }

  /* ── 2. Navbar scroll ── */
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 50));

  /* ── 3. Fade-in via IntersectionObserver ── */
  const observer = new IntersectionObserver(
    (entries, obs) => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    }),
    { rootMargin: '0px', threshold: 0.12 }
  );
  document.querySelectorAll('.fade-in, .fade-in-up').forEach(el => observer.observe(el));

  /* ── 4. Character Roster ── */
  const heroes = {
    hero1: {
      badge:  'WARRIOR 01',
      name:   'SHADOW WARRIOR I',
      desc:   'A master of speed and deception. Fluid movement paired with relentless strikes makes this warrior the go-to choice for aggressive, in-your-face combat.',
      video:  '/assets/hero/hero1.mp4',
      img:    '/assets/hero/hero1.png',
      stats:  { speed: 80, power: 65, defense: 55 }
    },
    hero2: {
      badge:  'WARRIOR 02',
      name:   'SHADOW WARRIOR II',
      desc:   'Raw power compressed into every blow. Slower than others but his devastating strikes can shatter shields and send enemies flying across the arena.',
      video:  '/assets/hero/hero2.mp4',
      img:    '/assets/hero/hero2.png',
      stats:  { speed: 55, power: 92, defense: 70 }
    },
    hero3: {
      badge:  'WARRIOR 03',
      name:   'SHADOW WARRIOR III',
      desc:   'A balanced duelist with precise counters and excellent reach. Masters both offense and defense, adapting to any enemy with calm tactical precision.',
      video:  '/assets/hero/hero3.mp4',
      img:    '/assets/hero/hero3.png',
      stats:  { speed: 70, power: 72, defense: 78 }
    },
    hero4: {
      badge:  'WARRIOR 04',
      name:   'SHADOW WARRIOR IV',
      desc:   'An unpredictable whirlwind of chaos. High-risk, high-reward combos and an unmatched ultimate that can wipe the entire screen when fully charged.',
      video:  '/assets/hero/hero4.mp4',
      img:    '/assets/hero/hero4.png',
      stats:  { speed: 90, power: 78, defense: 42 }
    },
    hero5: {
      badge:  'WARRIOR 05',
      name:   'SHADOW WARRIOR V',
      desc:   'The most recent recruit, battle-hardened in the darkest arenas. Exceptional defense combined with a skill set that punishes over-aggressive opponents.',
      video:  '/assets/hero/hero5.mp4',
      img:    '/assets/hero/hero5.png',
      stats:  { speed: 65, power: 68, defense: 95 }
    }
  };

  const rosterBtns  = document.querySelectorAll('.roster-btn');
  const rosterVideo = document.getElementById('roster-video');
  const rosterCard  = document.getElementById('roster-card');
  const rosterBadge = document.getElementById('roster-badge');
  const rosterName  = document.getElementById('roster-name');
  const rosterDesc  = document.getElementById('roster-desc');
  const rosterStats = document.getElementById('roster-stats');

  // Hero bg switcher
  const heroBgVideo      = document.getElementById('hero-bg-video');
  const heroShowcaseImg  = document.getElementById('hero-showcase-img');
  const heroNameTag      = document.getElementById('hero-name-tag');

  function setRoster(key) {
    const d = heroes[key];
    if (!d) return;

    rosterCard.classList.remove('fade-in-fast');
    void rosterCard.offsetWidth;

    rosterBadge.textContent = d.badge;
    rosterName.textContent  = d.name;
    rosterDesc.textContent  = d.desc;

    // Update video
    const src = rosterVideo.querySelector('source');
    src.src = d.video;
    rosterVideo.load();
    rosterVideo.play().catch(() => {});

    // Stat bars
    rosterStats.innerHTML = ['speed','power','defense'].map(stat =>
      `<div class="rstat">
        <span class="rstat-label">${stat.toUpperCase()}</span>
        <div class="rstat-bar"><div class="rstat-fill" style="width:${d.stats[stat]}%"></div></div>
      </div>`
    ).join('');

    rosterCard.classList.add('fade-in-fast');
  }

  rosterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      rosterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setRoster(btn.dataset.hero);
    });
  });

  /* ── 5. Weapon Cards ── */
  const weaponCards = document.querySelectorAll('.weapon-card');
  const winfoName   = document.getElementById('winfo-name');
  const winfoDesc   = document.getElementById('winfo-desc');

  weaponCards.forEach(card => {
    card.addEventListener('click', () => {
      weaponCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      if (winfoName) winfoName.textContent = card.dataset.weapon || '';
      if (winfoDesc) winfoDesc.textContent = card.dataset.desc  || '';
    });
  });

  /* ── 6. Hero section image cycle ── */
  const heroKeys = Object.keys(heroes);
  let heroIdx = 0;
  setInterval(() => {
    heroIdx = (heroIdx + 1) % heroKeys.length;
    const d = heroes[heroKeys[heroIdx]];
    if (heroShowcaseImg) {
      heroShowcaseImg.style.opacity = '0';
      setTimeout(() => {
        heroShowcaseImg.src = d.img;
        heroShowcaseImg.style.opacity = '1';
        heroShowcaseImg.style.transition = 'opacity .5s ease';
      }, 300);
    }
    if (heroNameTag) heroNameTag.textContent = d.name;
    // rotate bg video
    if (heroBgVideo) {
      const src = heroBgVideo.querySelector('source');
      if (src) { src.src = d.video; heroBgVideo.load(); heroBgVideo.play().catch(()=>{}); }
    }
  }, 4000);

});
