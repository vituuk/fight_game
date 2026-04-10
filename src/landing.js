/**
 * Fighter Game - Landing Page Interactions
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ==============================================
     1. Mobile Menu Toggle
     ============================================== */
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mobileMenu = document.getElementById('mobileMenu');
  const mobileLinks = document.querySelectorAll('.mobile-link');

  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
      const spans = mobileMenuBtn.querySelectorAll('span');
      if (mobileMenu.classList.contains('open')) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(7px, -6px)';
      } else {
        spans[0].style.transform = 'none';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'none';
      }
    });

    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        const spans = mobileMenuBtn.querySelectorAll('span');
        spans[0].style.transform = 'none';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'none';
      });
    });
  }

  /* ==============================================
     2. Navbar Scroll Effect
     ============================================== */
  const navbar = document.querySelector('.navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  /* ==============================================
     3. Intersection Observer for Fade Animations
     ============================================== */
  const fadeElements = document.querySelectorAll('.fade-in, .fade-in-up');
  
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.15
  };

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  fadeElements.forEach(el => observer.observe(el));

  /* ==============================================
     4. Character Roster Interactions
     ============================================== */
  const heroData = {
    p1: {
      img: '/assets/characters/p1.png',
      name: 'DEFAULT FIGHTER',
      desc: 'The standard combatant balanced for all play styles. Master the basics before venturing further.'
    },
    dd: {
      img: '/assets/hero/dd-removebg-preview.png',
      name: 'DD (DARK DEMON)',
      desc: 'An aggressive fighter focused on relentless attacks and shield-breaking maneuvers.'
    },
    haratu: {
      img: '/assets/hero/haratu.png',
      name: 'HARATU',
      desc: 'A nimble warrior utilizing rapid strikes and superior mobility to exhaust opponents.'
    },
    luffy: {
      img: '/assets/hero/lufy.png',
      name: 'LUFFY',
      desc: 'Unpredictable and chaotic. Uses high-risk, high-reward combos to dominate the arena.'
    }
  };

  const rosterBtns = document.querySelectorAll('.roster-btn');
  const rosterImg = document.getElementById('roster-img');
  const rosterName = document.getElementById('roster-name');
  const rosterDesc = document.getElementById('roster-desc');
  const rosterCard = document.getElementById('roster-card');

  rosterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class from all
      rosterBtns.forEach(b => b.classList.remove('active'));
      // Add active to clicked
      btn.classList.add('active');

      const heroKey = btn.getAttribute('data-hero');
      const data = heroData[heroKey];

      if (data) {
        // Trigger reflow for animation
        rosterCard.classList.remove('fade-in-fast');
        void rosterCard.offsetWidth; 
        
        rosterImg.src = data.img;
        rosterName.textContent = data.name;
        rosterDesc.textContent = data.desc;
        rosterImg.alt = data.name;
        
        rosterCard.classList.add('fade-in-fast');
      }
    });
  });

  /* ==============================================
     5. Weapon Selection Interactions
     ============================================== */
  const weaponCards = document.querySelectorAll('.weapon-card');
  
  weaponCards.forEach(card => {
    card.addEventListener('click', () => {
      weaponCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    });
  });

});
