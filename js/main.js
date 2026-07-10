// =====================================================================
// HERO SLIDESHOW — daily random rotation
// First visit: shows WA0026, WA0014, WA0031, WA0056 (user-selected set)
// After 24 hrs:  picks a fresh random 4 from the full photo pool
// State persisted in localStorage so the same 4 stay all day
// =====================================================================
(function () {

  // ── The starting photos (shown on first visit / until 24 hrs pass)
  var DEFAULT_SET = [
    { src: 'pictures/PG and Ahta.JPG',  alt: 'Distinguished leaders of the Oro Nation' },
    { src: 'pictures/Oro women.JPG',    alt: 'Oro women celebrating cultural heritage' },
    { src: 'pictures/orotradition.JPG', alt: 'Oro people in traditional cultural gathering' },
    { src: 'pictures/tradpic.JPG',      alt: 'Traditional scene from the Oro Nation' }
  ];

  // ── Full pool — every photo in the pictures/ folder (used for random rotation)
  var SUFFIX = 'IMG-20260317-WA';
  var POOL_NUMS = [
    11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,
    31,33,34,36,40,44,45,47,48,49,50,52,
    53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,
    73,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,99,100,
    101,102,103,104,105,106,107,108,109,110,111,113,114,115,116,117,
    118,119,120,121,122,123,124,125,126,127,130,132,133,134,139,140,
    141,142,143,144,145,148,149,150,151,152,153,154,155,156,157,158,
    159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,
    175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,
    191,192,193,194,195,196,197,198,199,200
  ];

  var FULL_POOL = POOL_NUMS.map(function (n) {
    var padded = String(n).padStart(4, '0');
    return {
      src: 'pictures/' + SUFFIX + padded + '.jpg',
      alt: 'Oron Union community event photo'
    };
  });

  var STORAGE_KEY  = 'oron_hero_slides_v2';
  var MS_24H       = 24 * 60 * 60 * 1000;

  // ── Pick count unique random items from pool
  function pickRandom(pool, count) {
    var copy = pool.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy.slice(0, count);
  }

  // ── Save chosen set + current timestamp to localStorage
  function saveSet(photos) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        photos:    photos,
        savedAt:   Date.now()
      }));
    } catch (e) {}
  }

  // ── Decide which 4 photos to show right now
  function resolvePhotos() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var stored = JSON.parse(raw);
        if (stored && stored.photos && Array.isArray(stored.photos)) {
          var age = Date.now() - (stored.savedAt || 0);
          if (age < MS_24H) {
            // Still within 24 hrs — use the stored set as-is
            return stored.photos;
          }
          // 24 hrs have passed — choose a new random set
          var fresh = pickRandom(FULL_POOL, 4);
          saveSet(fresh);
          return fresh;
        }
      }
    } catch (e) {}

    // First ever visit — use the user-specified default set & start the clock
    saveSet(DEFAULT_SET);
    return DEFAULT_SET;
  }

  // ── Inject slides + dots into the DOM
  function buildSlideshow(photos) {
    var slidesEl = document.getElementById('hero-slides');
    var dotsEl   = document.getElementById('hero-dots');
    if (!slidesEl || !dotsEl) return;

    slidesEl.innerHTML = '';
    dotsEl.innerHTML   = '';

    photos.forEach(function (photo, i) {
      // Slide
      var slide = document.createElement('div');
      slide.className = 'hero-slide' + (i === 0 ? ' active' : '');
      var img = document.createElement('img');
      img.src = photo.src;
      img.alt = photo.alt;
      if (i !== 0) img.loading = 'lazy';
      slide.appendChild(img);
      slidesEl.appendChild(slide);

      // Dot
      var dot = document.createElement('div');
      dot.className = 'hero-dot' + (i === 0 ? ' active' : '');
      dotsEl.appendChild(dot);
    });
  }

  // ── Run the carousel (called after slides are in the DOM)
  function initCarousel() {
    var slides  = document.querySelectorAll('.hero-slide');
    var dots    = document.querySelectorAll('.hero-dot');
    var current = 0;
    var timer;

    function goTo(n) {
      slides[current].classList.remove('active');
      dots[current].classList.remove('active');
      current = (n + slides.length) % slides.length;
      slides[current].classList.add('active');
      dots[current].classList.add('active');
    }

    function startTimer() {
      clearInterval(timer);
      timer = setInterval(function () { goTo(current + 1); }, 5000);
    }

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        goTo(i);
        startTimer();
      });
    });

    // Touch swipe — next/prev on horizontal swipe > 50px
    var heroEl = document.querySelector('.hero');
    if (heroEl) {
      var touchX = 0;
      heroEl.addEventListener('touchstart', function (e) {
        touchX = e.touches[0].clientX;
      }, { passive: true });
      heroEl.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 50) {
          goTo(dx < 0 ? current + 1 : current - 1);
          startTimer();
        }
      }, { passive: true });
    }

    if (slides.length > 1) startTimer();
  }

  // ── Entry point
  var photos = resolvePhotos();
  buildSlideshow(photos);
  initCarousel();

  // ── Check for 24-hr expiry every minute while the tab stays open
  //    (handles long-lived tabs that cross midnight)
  setInterval(function () {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var stored = JSON.parse(raw);
      var age = Date.now() - (stored.savedAt || 0);
      if (age >= MS_24H) {
        var fresh = pickRandom(FULL_POOL, 4);
        saveSet(fresh);
        buildSlideshow(fresh);
        initCarousel();
      }
    } catch (e) {}
  }, 60 * 1000);

})();


// =====================================================================
// MOBILE NAV
// =====================================================================
var toggle   = document.querySelector('.nav-mobile-toggle');
var navLinks = document.querySelector('.nav-links');

if (toggle && navLinks) {
  toggle.addEventListener('click', function () {
    navLinks.classList.toggle('open');
    toggle.classList.toggle('open');
  });

  navLinks.querySelectorAll('li > a').forEach(function (link) {
    var parent = link.closest('li');
    if (parent.querySelector('.dropdown') || parent.querySelector('.submenu')) {
      link.addEventListener('click', function (e) {
        if (window.innerWidth <= 960) {
          e.preventDefault();
          var wasOpen = parent.classList.contains('open');
          parent.parentElement.querySelectorAll('li.open').forEach(function (el) {
            el.classList.remove('open');
          });
          if (!wasOpen) parent.classList.add('open');
        }
      });
    }
  });

  document.addEventListener('click', function (e) {
    if (!navLinks.contains(e.target) && !toggle.contains(e.target)) {
      navLinks.classList.remove('open');
      toggle.classList.remove('open');
    }
  });
}

// =====================================================================
// NAVBAR SHADOW ON SCROLL
// =====================================================================
var navbar = document.querySelector('.navbar');
window.addEventListener('scroll', function () {
  navbar.style.boxShadow = window.scrollY > 40
    ? '0 2px 20px rgba(0,0,0,0.1)'
    : 'none';
});

// =====================================================================
// SCROLL REVEAL — replays every time element enters/leaves viewport
// =====================================================================
var revealObserver = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    } else {
      entry.target.classList.remove('visible');
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll(
  '.reveal, .reveal-left, .reveal-right, .reveal-scale, .reveal-underline, .reveal-pop'
).forEach(function (el) {
  revealObserver.observe(el);
});

// =====================================================================
// STAT COUNTER — replays every time about section scrolls in/out
// =====================================================================
function getLiveMemberCount() {
  var base = 0;
  try {
    var apps = JSON.parse(localStorage.getItem('oron_applications') || '[]');
    return base + apps.filter(function (a) { return a.status === 'approved'; }).length;
  } catch (e) { return base; }
}

var statsObserver = new IntersectionObserver(function (entries) {
  var inView = entries[0].isIntersecting;

  document.querySelectorAll('.stat-item .num').forEach(function (el) {
    /* For the live member count, always pull fresh from localStorage */
    if (el.id === 'stat-member-count') {
      var live = getLiveMemberCount();
      el.dataset.original = String(live);
    }

    if (!el.dataset.original) el.dataset.original = el.textContent.trim();
    var raw    = el.dataset.original;
    var suffix = raw.replace(/[0-9]/g, '');
    var target = parseInt(raw.replace(/\D/g, ''), 10);
    var isYear = target > 1000;
    var from   = isYear ? target - 60 : 0;

    if (inView) {
      var dur = 1400, start = null;
      el.classList.add('stat-num-anim');
      (function animate(el, from, target, suffix, dur) {
        var startTime = null;
        function tick(ts) {
          if (!startTime) startTime = ts;
          var p = Math.min((ts - startTime) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(from + (target - from) * eased) + suffix;
          if (p < 1) requestAnimationFrame(tick);
          else el.textContent = target + suffix;
        }
        requestAnimationFrame(tick);
      })(el, from, target, suffix, dur);
    } else {
      el.classList.remove('stat-num-anim');
      el.textContent = from + suffix;
    }
  });
}, { threshold: 0.4 });

var statsSection = document.querySelector('.about-stats');
if (statsSection) statsObserver.observe(statsSection);

// =====================================================================
// PROGRESS BARS — fill on scroll in, drain on scroll out
// =====================================================================
var progressObserver = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('filled');
    } else {
      entry.target.classList.remove('filled');
    }
  });
}, { threshold: 0.3 });

document.querySelectorAll('.progress-fill').forEach(function (el) {
  progressObserver.observe(el);
});

// =====================================================================
// GALLERY LIGHTBOX
// =====================================================================
var lightbox    = document.getElementById('lightbox');
var lightboxImg = document.getElementById('lightbox-img');

document.querySelectorAll('[data-lightbox]').forEach(function (item) {
  item.addEventListener('click', function () {
    lightboxImg.src = (item.querySelector('img') || {}).src || '';
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  });
});

document.getElementById('lightbox-close')
  && document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
lightbox && lightbox.addEventListener('click', function (e) {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeLightbox();
});

function closeLightbox() {
  if (lightbox) lightbox.classList.remove('open');
  document.body.style.overflow = '';
}

// =====================================================================
// PRELOADER
// =====================================================================
(function () {
  var preloader = document.getElementById('preloader');
  var bar = document.getElementById('pre-bar');
  if (!preloader) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    preloader.style.display = 'none';
    return;
  }

  var start = null, dur = 1700;
  function fill(ts) {
    if (!start) start = ts;
    var p = Math.min((ts - start) / dur, 1);
    var eased = 1 - Math.pow(1 - p, 2.8);
    if (bar) bar.style.width = (eased * 100) + '%';
    if (p < 1) {
      requestAnimationFrame(fill);
    } else {
      setTimeout(function () {
        preloader.classList.add('done');
        setTimeout(function () { preloader.style.display = 'none'; }, 1100);
      }, 150);
    }
  }
  requestAnimationFrame(fill);
})();

/* cursor handled by js/cursor.js */

// =====================================================================
// SCROLL PROGRESS BAR
// =====================================================================
(function () {
  var bar = document.getElementById('scroll-progress');
  if (!bar) return;
  window.addEventListener('scroll', function () {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (max > 0 ? (window.scrollY / max * 100) : 0) + '%';
  }, { passive: true });
})();

// =====================================================================
// 3D CARD TILT + SPECULAR SHINE
// =====================================================================
(function () {
  if (window.matchMedia('(hover: none)').matches) return;
  var MAX = 9;

  document.querySelectorAll('.explore-card, .culture-card, .news-card, .project-card').forEach(function (card) {
    card.classList.add('tilt-card');

    card.addEventListener('mousemove', function (e) {
      var r  = card.getBoundingClientRect();
      var x  = (e.clientX - r.left) / r.width;
      var y  = (e.clientY - r.top)  / r.height;
      var ry = (x - 0.5) *  MAX;
      var rx = (y - 0.5) * -MAX;
      card.style.transform = 'perspective(700px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateZ(8px)';
      card.style.setProperty('--mx', (x * 100) + '%');
      card.style.setProperty('--my', (y * 100) + '%');
    });

    card.addEventListener('mouseleave', function () {
      card.style.transform = '';
      card.style.removeProperty('--mx');
      card.style.removeProperty('--my');
    });
  });
})();

// =====================================================================
// MAGNETIC BUTTONS
// =====================================================================
(function () {
  if (window.matchMedia('(hover: none)').matches) return;
  var RADIUS = 88, STRENGTH = 0.36;

  document.querySelectorAll('.btn-primary, .btn-outline, .btn-white, .btn-outline-white, .nav-join').forEach(function (btn) {
    btn.addEventListener('mousemove', function (e) {
      var r  = btn.getBoundingClientRect();
      var cx = r.left + r.width  / 2;
      var cy = r.top  + r.height / 2;
      var dx = e.clientX - cx;
      var dy = e.clientY - cy;
      if (Math.sqrt(dx * dx + dy * dy) < RADIUS) {
        btn.style.transform  = 'translate(' + (dx * STRENGTH) + 'px,' + (dy * STRENGTH) + 'px)';
        btn.style.transition = 'transform 0.14s ease';
      }
    });

    btn.addEventListener('mouseleave', function () {
      btn.style.transform  = '';
      btn.style.transition = 'transform 0.6s cubic-bezier(0.22,1,0.36,1)';
    });
  });
})();

// =====================================================================
// ACTIVE NAV LINK ON SCROLL
// =====================================================================
var sections = document.querySelectorAll('section[id]');
window.addEventListener('scroll', function () {
  var cur = '';
  sections.forEach(function (s) {
    if (window.scrollY >= s.offsetTop - 100) cur = s.id;
  });
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    a.classList.remove('active');
    if (a.getAttribute('href') === '#' + cur) a.classList.add('active');
  });
});

// =====================================================================
// STAGGERED CARD REVEAL — children animate in sequence
// =====================================================================
(function () {
  var grids = document.querySelectorAll('.explore-grid, .events-grid, .projects-grid, .news-grid, .integrity-grid');
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var children = entry.target.children;
      Array.prototype.forEach.call(children, function (child, i) {
        child.style.transitionDelay = (i * 80) + 'ms';
        child.classList.add('visible');
        setTimeout(function () { child.style.transitionDelay = ''; }, 900 + i * 80);
      });
      io.unobserve(entry.target);
    });
  }, { threshold: 0.1 });
  grids.forEach(function (g) {
    Array.prototype.forEach.call(g.children, function (c) { c.classList.add('reveal'); });
    io.observe(g);
  });
})();

// =====================================================================
// SUBTLE PARALLAX on hero background
// =====================================================================
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var slides = document.getElementById('hero-slides');
  if (!slides) return;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    slides.style.transform = 'translateY(' + (y * 0.28) + 'px)';
  }, { passive: true });
})();

/* Page transitions handled by js/cursor.js (shared across all pages) */

// =====================================================================
// DARK MODE TOGGLE
// =====================================================================
(function () {
  var html = document.documentElement;
  var btn  = document.getElementById('dark-mode-btn');

  function applyTheme(dark) {
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('oron_theme', dark ? 'dark' : 'light'); } catch (e) {}
  }

  var saved = null;
  try { saved = localStorage.getItem('oron_theme'); } catch (e) {}
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved === 'dark' || (!saved && prefersDark));

  if (btn) {
    btn.addEventListener('click', function () {
      applyTheme(html.getAttribute('data-theme') !== 'dark');
    });
  }
})();

// =====================================================================
// YOUTH SUMMIT COUNTDOWN TIMER
// =====================================================================
(function () {
  var target = new Date('2026-09-12T09:00:00');
  var dEl = document.getElementById('cd-days');
  var hEl = document.getElementById('cd-hours');
  var mEl = document.getElementById('cd-mins');
  var sEl = document.getElementById('cd-secs');
  if (!dEl) return;

  function pad(n) { return String(n).padStart(2, '0'); }

  function tick() {
    var diff = target - Date.now();
    if (diff <= 0) {
      dEl.textContent = hEl.textContent = mEl.textContent = sEl.textContent = '00';
      return;
    }
    dEl.textContent = pad(Math.floor(diff / 86400000));
    hEl.textContent = pad(Math.floor((diff % 86400000) / 3600000));
    mEl.textContent = pad(Math.floor((diff % 3600000) / 60000));
    sEl.textContent = pad(Math.floor((diff % 60000) / 1000));
  }

  tick();
  setInterval(tick, 1000);
})();

// =====================================================================
// BACK TO TOP BUTTON
// =====================================================================
(function () {
  var btn = document.getElementById('back-to-top');
  if (!btn) return;
  window.addEventListener('scroll', function () {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
