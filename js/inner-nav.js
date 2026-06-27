(function () {
  var toggle   = document.getElementById('menu-toggle');
  var navLinks = document.getElementById('nav-links');

  if (toggle && navLinks) {
    // Open / close the mobile nav
    toggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
      toggle.classList.toggle('open');
    });

    // Expand dropdowns and submenus on tap
    navLinks.querySelectorAll('li > a').forEach(function (link) {
      var parent = link.closest('li');
      if (parent.querySelector('.dropdown') || parent.querySelector('.submenu')) {
        link.addEventListener('click', function (e) {
          if (window.innerWidth <= 960) {
            e.preventDefault();
            var wasOpen = parent.classList.contains('open');
            // Close siblings
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
