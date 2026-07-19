/* Oron Union — custom cursor + page transitions, shared across all pages */

// =====================================================================
// LIVE MEMBER COUNT — inner pages only (home page has its own
// animated version in main.js, gated on the preloader element)
// =====================================================================
(function () {
  if (document.getElementById('preloader')) return;
  var el = document.getElementById('stat-member-count');
  if (!el) return;
  fetch('api/stats.php?action=member_count', { credentials: 'same-origin' })
    .then(function (res) { return res.json(); })
    .then(function (res) { el.textContent = res.ok ? res.count : 0; })
    .catch(function () { el.textContent = 0; });
})();

// =====================================================================
// PAGE TRANSITIONS
// =====================================================================
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* ── Arrival: fade body in when navigating from another oron page ── */
  if (sessionStorage.getItem('oron_pt')) {
    sessionStorage.removeItem('oron_pt');
    /* Don't animate body on home page — the preloader handles the entrance */
    if (!document.getElementById('preloader')) {
      document.body.style.opacity = '0';
      requestAnimationFrame(function () {
        document.body.style.transition = 'opacity 0.35s ease';
        document.body.style.opacity = '1';
        setTimeout(function () { document.body.style.transition = ''; }, 400);
      });
    }
  }

  /* ── Departure: fade body out before navigating away ── */
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href]');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') ||
        href.startsWith('tel:') || link.target === '_blank' ||
        e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (href.endsWith('.html') || href.match(/^[a-zA-Z][^:]*\.html/)) {
      e.preventDefault();
      sessionStorage.setItem('oron_pt', '1');
      document.body.style.transition = 'opacity 0.2s ease';
      document.body.style.opacity = '0';
      setTimeout(function () { window.location = href; }, 220);
    }
  });
})();

// =====================================================================
// CUSTOM CURSOR
// =====================================================================
(function () {
  var dot  = document.getElementById('cursor-dot');
  var ring = document.getElementById('cursor-ring');
  if (!dot || !ring || window.matchMedia('(hover: none)').matches) return;

  document.body.classList.add('custom-cursor');

  var mx = -300, my = -300, rx = -300, ry = -300;

  document.addEventListener('mousemove', function (e) {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = 'translate(calc(' + mx + 'px - 50%), calc(' + my + 'px - 50%))';
  });

  (function lerpRing() {
    rx += (mx - rx) * 0.12;
    ry += (my - ry) * 0.12;
    ring.style.transform = 'translate(calc(' + rx + 'px - 50%), calc(' + ry + 'px - 50%))';
    requestAnimationFrame(lerpRing);
  })();

  /*
   * Named dark sections — sections with image/gradient/video backgrounds
   * that fool getComputedStyle. Listed by class or id so the walk-up
   * finds them even when a transparent child element is the event target.
   */
  var DARK_CLASSES = [
    'hero', 'join-cta', 'ticker-wrap',
    'elec-hero', 'auth-gate', 'auth-overlay',
    'rp-header',
    'tv-player-wrap', 'tv-sidebar', 'tv-overlay'
  ];
  var DARK_IDS = ['preloader', 'contact', 'auth-gate'];

  function toLinear(c) {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function luminance(r, g, b) {
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }
  function parseRGB(str) {
    var m = str.match(/[\d.]+/g);
    return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : null;
  }

  function isDarkBg(el) {
    var cur = el;
    while (cur && cur !== document.documentElement) {
      /* 1. Named dark sections checked first — never blocked by children */
      if (cur.classList) {
        for (var i = 0; i < DARK_CLASSES.length; i++) {
          if (cur.classList.contains(DARK_CLASSES[i])) return true;
        }
      }
      if (cur.id && DARK_IDS.indexOf(cur.id) !== -1) return true;

      /* 2. Luminance check — alpha threshold 0.85 so that semi-transparent
            overlays (e.g. rgba(255,255,255,0.2) badge inside hero) are
            skipped and we keep walking to the real opaque dark parent */
      var bg = window.getComputedStyle(cur).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        var rgb = parseRGB(bg);
        if (rgb) {
          var parts = bg.match(/[\d.]+/g) || [];
          var a = parts.length >= 4 ? parseFloat(parts[3]) : 1;
          if (a > 0.85) return luminance(rgb[0], rgb[1], rgb[2]) <= 0.35;
        }
      }
      cur = cur.parentElement;
    }
    return false;
  }

  var LIGHT_RING = 'rgba(128,0,32,0.7)';
  var DARK_RING  = 'rgba(255,255,255,0.8)';
  var LIGHT_DOT  = '#800020';
  var DARK_DOT   = '#ffffff';

  document.addEventListener('mouseover', function (e) {
    document.body.classList[window.getComputedStyle(e.target).cursor === 'pointer' ? 'add' : 'remove']('cursor-hover');
    var dark = isDarkBg(e.target);
    ring.style.borderColor = dark ? DARK_RING : LIGHT_RING;
    dot.style.background   = dark ? DARK_DOT  : LIGHT_DOT;
  });

  document.addEventListener('mousedown',  function () { document.body.classList.add('cursor-click'); });
  document.addEventListener('mouseup',    function () { document.body.classList.remove('cursor-click'); });
  document.addEventListener('mouseleave', function () { dot.style.opacity = '0'; ring.style.opacity = '0'; });
  document.addEventListener('mouseenter', function () { dot.style.opacity = '1'; ring.style.opacity = '1'; });
})();
