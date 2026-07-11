(function () {
  // ── Apply saved dark-mode theme immediately (before first paint) ──
  (function () {
    var saved = null;
    try { saved = localStorage.getItem('oron_theme'); } catch (e) {}
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme',
      (saved === 'dark' || (!saved && prefersDark)) ? 'dark' : 'light');
  })();

  // ── Inject dark-mode toggle button into the navbar ────────────────
  (function () {
    var container  = document.querySelector('.nav-container');
    var menuToggle = document.getElementById('menu-toggle');
    if (!container || document.getElementById('dark-mode-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'dark-mode-btn';
    btn.className = 'dark-mode-btn';
    btn.setAttribute('aria-label', 'Toggle dark mode');
    btn.innerHTML =
      '<svg class="dm-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/>' +
        '<line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>' +
        '<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/>' +
        '<line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>' +
        '<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' +
      '<svg class="dm-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

    btn.addEventListener('click', function () {
      var dark = document.documentElement.getAttribute('data-theme') !== 'dark';
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      try { localStorage.setItem('oron_theme', dark ? 'dark' : 'light'); } catch (e) {}
    });

    if (menuToggle) {
      container.insertBefore(btn, menuToggle);
    } else {
      container.appendChild(btn);
    }
  })();

  var toggle   = document.getElementById('menu-toggle');
  var navLinks = document.getElementById('nav-links');

  if (toggle && navLinks) {
    // Open / close the mobile nav
    toggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
      toggle.classList.toggle('open');
      if (navLinks.classList.contains('open')) navLinks.scrollTop = 0;
    });

    // Expand dropdowns and submenus on tap
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

    // Close nav on outside tap
    document.addEventListener('click', function (e) {
      if (!navLinks.contains(e.target) && !toggle.contains(e.target)) {
        navLinks.classList.remove('open');
        toggle.classList.remove('open');
      }
    });
  }

  // Navbar scroll shadow
  var navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', function () {
      navbar.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
  }

  // Scroll-reveal for all inner-page elements
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll(
    '.reveal, .reveal-scale, .reveal-left, ' +
    '.ip-card, .leader-card, .value-card, .clan-card, ' +
    '.branch-card, .ip-timeline-item, .contact-item'
  ).forEach(function (el) { io.observe(el); });
})();
