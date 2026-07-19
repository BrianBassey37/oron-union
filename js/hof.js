/* ============================================================
   HOF.JS — Oron Union Hall of Fame (public voting)
   ============================================================ */

(function () {
  'use strict';

  function apiGet(action) {
    return fetch('api/hof.php?action=' + action, { credentials: 'same-origin' })
      .then(function (res) { return res.json(); });
  }
  function apiPost(action, body) {
    return fetch('api/hof.php?action=' + action, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
    }).then(function (res) { return res.json(); });
  }

  var VOTED_KEY = 'oron_hof_voted_categories';
  var hofVerifiedEmail = null;
  var hofOtpCooldownUntil = 0;

  function otpApi(action, body) {
    return fetch('api/otp.php?action=' + action, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
    }).then(function (res) { return res.json(); });
  }

  var categories = [];
  var nominees = [];
  var results = {}; /* { categoryId: { nomineeId: count } } */
  var activeCategoryId = null;
  var activeNomineeId = null;

  var PERSON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

  function getVotedCategories() {
    try { return JSON.parse(localStorage.getItem(VOTED_KEY) || '[]'); } catch (e) { return []; }
  }
  function markCategoryVoted(categoryId) {
    var v = getVotedCategories();
    if (v.indexOf(categoryId) === -1) v.push(categoryId);
    localStorage.setItem(VOTED_KEY, JSON.stringify(v));
  }

  function loadAll() {
    return Promise.all([apiGet('list'), apiGet('results')]).then(function (res) {
      var listRes = res[0], resultsRes = res[1];
      categories = (listRes.ok && listRes.categories) || [];
      nominees   = (listRes.ok && listRes.nominees) || [];
      var out = {};
      ((resultsRes.ok && resultsRes.results) || []).forEach(function (r) {
        if (!out[r.category_id]) out[r.category_id] = {};
        out[r.category_id][r.nominee_id] = parseInt(r.vote_count, 10);
      });
      results = out;
    });
  }

  function totalVotes() {
    var total = 0;
    Object.keys(results).forEach(function (catId) {
      Object.values(results[catId]).forEach(function (v) { total += v; });
    });
    return total;
  }

  function renderStats() {
    document.getElementById('hof-stat-votes').textContent = totalVotes();
    document.getElementById('hof-stat-categories').textContent = categories.length;
    document.getElementById('hof-stat-nominees').textContent = nominees.length;
  }

  function nomineeCard(n, categoryVotes, categoryTotal, alreadyVoted) {
    var v = categoryVotes[n.id] || 0;
    var pct = categoryTotal > 0 ? Math.round((v / categoryTotal) * 100) : 0;
    var isLeading = categoryTotal > 0 && v === Math.max.apply(null, Object.values(categoryVotes).concat(0));
    var photo = n.photo_url
      ? '<img src="' + n.photo_url + '" alt="' + esc(n.name) + '" loading="lazy" />'
      : PERSON_SVG;

    return '<div class="hof-card">' +
      '<div class="hof-card-photo">' + photo + '</div>' +
      '<div class="hof-card-body">' +
        '<div class="hof-card-name">' + esc(n.name) + '</div>' +
        (n.bio ? '<p class="hof-card-bio">' + esc(n.bio) + '</p>' : '') +
        '<div class="hof-card-votebar-track"><div class="hof-card-votebar-fill" data-target="' + pct + '"></div></div>' +
        '<div class="hof-card-stats"><span' + (isLeading && categoryTotal > 0 ? ' class="leading"' : '') + '>' + v + ' vote' + (v !== 1 ? 's' : '') + (isLeading && categoryTotal > 0 ? ' — Leading' : '') + '</span><span>' + pct + '%</span></div>' +
        '<button class="hof-vote-btn" data-cat="' + n.category_id + '" data-nom="' + n.id + '" data-name="' + esc(n.name) + '"' + (alreadyVoted ? ' disabled' : '') + '>' +
          (alreadyVoted ? 'Vote recorded' : 'Vote &rarr;') +
        '</button>' +
      '</div>' +
    '</div>';
  }

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function renderCategories() {
    var wrap = document.getElementById('hof-categories-wrap');
    var voted = getVotedCategories();

    if (!categories.length) {
      wrap.innerHTML = '<p class="hof-empty-note" style="text-align:center;padding:64px 24px;">Categories are being set up. Check back soon.</p>';
      return;
    }

    wrap.innerHTML = categories.map(function (cat) {
      var catNoms = nominees.filter(function (n) { return n.category_id === cat.id; });
      var catVotes = results[cat.id] || {};
      var catTotal = Object.values(catVotes).reduce(function (a, b) { return a + b; }, 0);
      var alreadyVoted = voted.indexOf(cat.id) !== -1;

      var body = catNoms.length
        ? '<div class="hof-nominee-grid">' + catNoms.map(function (n) { return nomineeCard(n, catVotes, catTotal, alreadyVoted); }).join('') + '</div>'
        : '<p class="hof-empty-note">Nominees for this category will be announced soon.</p>';

      return '<section class="hof-category" data-category-id="' + cat.id + '">' +
        '<h2 class="hof-category-title">' + esc(cat.name) + '</h2>' +
        (cat.description ? '<p class="hof-category-desc">' + esc(cat.description) + '</p>' : '') +
        body +
      '</section>';
    }).join('');

    bindVoteButtons();
    scheduleBarAnimate();
  }

  function scheduleBarAnimate() {
    setTimeout(function () {
      document.querySelectorAll('.hof-card-votebar-fill[data-target]').forEach(function (el) {
        el.style.width = el.dataset.target + '%';
      });
    }, 120);
  }

  function bindVoteButtons() {
    document.querySelectorAll('.hof-vote-btn[data-nom]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        openVoteModal(btn.dataset.cat, btn.dataset.nom, btn.dataset.name);
      });
    });
  }

  /* ───────────────────────────────────────────
     VOTE MODAL
  ─────────────────────────────────────────── */
  function openVoteModal(categoryId, nomineeId, name) {
    activeCategoryId = categoryId;
    activeNomineeId = nomineeId;
    var cat = categories.find(function (c) { return c.id === categoryId; });

    document.getElementById('hof-vote-modal-title').textContent = 'Vote for ' + name;
    document.getElementById('hof-vote-modal-desc').textContent = cat ? cat.name : '';
    document.getElementById('hof-vote-form').reset();
    document.getElementById('hof-vote-error').classList.add('hidden');
    document.getElementById('hof-otp-row').classList.add('hidden');
    document.getElementById('hof-otp-status-note').textContent = '';

    var btn = document.getElementById('hof-cast-vote-btn');
    btn.textContent = 'Submit Vote →';

    if (hofVerifiedEmail) {
      document.getElementById('hof-voter-email').value = hofVerifiedEmail;
      document.getElementById('hof-otp-verified-note').classList.remove('hidden');
      btn.disabled = false;
    } else {
      document.getElementById('hof-otp-verified-note').classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Verify email to vote';
    }

    document.getElementById('hof-vote-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeVoteModal() {
    document.getElementById('hof-vote-modal').classList.add('hidden');
    document.body.style.overflow = '';
  }

  function submitVote(e) {
    e.preventDefault();
    var name = document.getElementById('hof-voter-name').value.trim();
    var email = document.getElementById('hof-voter-email').value.trim();
    var phone = document.getElementById('hof-voter-phone').value.trim();
    var errEl = document.getElementById('hof-vote-error');
    var btn = document.getElementById('hof-cast-vote-btn');

    if (!name || !email) {
      errEl.textContent = 'Please enter your name and email.';
      errEl.classList.remove('hidden');
      return;
    }
    if (hofVerifiedEmail !== email) {
      errEl.textContent = 'Please verify your email address before voting.';
      errEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting…';

    apiPost('vote', {
      categoryId: activeCategoryId,
      nomineeId: activeNomineeId,
      voterName: name,
      voterEmail: email,
      voterPhone: phone || null
    }).then(function (res) {
      if (!res.ok) {
        btn.disabled = false;
        btn.textContent = 'Submit Vote →';
        errEl.textContent = res.error || 'Could not submit your vote. Please try again.';
        errEl.classList.remove('hidden');
        return;
      }

      markCategoryVoted(activeCategoryId);
      closeVoteModal();
      document.getElementById('hof-success-message').textContent =
        'Thank you, ' + name + ' — your vote has been recorded.';
      document.getElementById('hof-success-overlay').classList.remove('hidden');

      loadAll().then(function () {
        renderStats();
        renderCategories();
      });
    });
  }

  function initEmailOtp() {
    var emailEl = document.getElementById('hof-voter-email');
    var sendBtn = document.getElementById('hof-send-otp-btn');
    var codeRow = document.getElementById('hof-otp-row');
    var codeInput = document.getElementById('hof-otp-code');
    var verifyBtn = document.getElementById('hof-verify-otp-btn');
    var statusNote = document.getElementById('hof-otp-status-note');
    var verifiedNote = document.getElementById('hof-otp-verified-note');
    var castBtn = document.getElementById('hof-cast-vote-btn');
    if (!emailEl || !sendBtn) return;

    emailEl.addEventListener('input', function () {
      var email = emailEl.value.trim();
      if (hofVerifiedEmail && hofVerifiedEmail !== email) {
        hofVerifiedEmail = null;
        verifiedNote.classList.add('hidden');
        codeRow.classList.add('hidden');
        statusNote.textContent = '';
        castBtn.disabled = true;
        castBtn.textContent = 'Verify email to vote';
      }
    });

    sendBtn.addEventListener('click', function () {
      var email = emailEl.value.trim();
      var errEl = document.getElementById('hof-vote-error');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errEl.textContent = 'Enter a valid email address first.';
        errEl.classList.remove('hidden');
        return;
      }
      if (Date.now() < hofOtpCooldownUntil) return;

      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      otpApi('send', { email: email, purpose: 'hof_vote' }).then(function (res) {
        if (!res.ok) {
          sendBtn.disabled = false;
          sendBtn.textContent = 'Send Code';
          errEl.textContent = res.error || 'Could not send code. Please try again.';
          errEl.classList.remove('hidden');
          return;
        }
        codeRow.classList.remove('hidden');
        statusNote.textContent = 'Code sent — check your inbox.';
        codeInput.focus();
        hofOtpCooldownUntil = Date.now() + 45000;
        var secondsLeft = 45;
        sendBtn.textContent = 'Resend (' + secondsLeft + 's)';
        var timer = setInterval(function () {
          secondsLeft--;
          if (secondsLeft <= 0) {
            clearInterval(timer);
            sendBtn.disabled = false;
            sendBtn.textContent = 'Resend Code';
          } else {
            sendBtn.textContent = 'Resend (' + secondsLeft + 's)';
          }
        }, 1000);
      });
    });

    verifyBtn.addEventListener('click', function () {
      var email = emailEl.value.trim();
      var code = codeInput.value.trim();
      if (!code) { statusNote.textContent = 'Enter the code sent to your email.'; return; }

      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying…';
      otpApi('verify', { email: email, purpose: 'hof_vote', code: code }).then(function (res) {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify';
        if (!res.ok) {
          statusNote.textContent = res.error || 'Invalid code.';
          return;
        }
        hofVerifiedEmail = email;
        codeRow.classList.add('hidden');
        verifiedNote.classList.remove('hidden');
        castBtn.disabled = false;
        castBtn.textContent = 'Submit Vote →';
        document.getElementById('hof-vote-error').classList.add('hidden');
      });
    });
  }

  /* ───────────────────────────────────────────
     BOOT
  ─────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    initEmailOtp();
    document.getElementById('hof-vote-modal-close').addEventListener('click', closeVoteModal);
    document.getElementById('hof-cancel-vote-btn').addEventListener('click', closeVoteModal);
    document.getElementById('hof-vote-form').addEventListener('submit', submitVote);
    document.getElementById('hof-vote-modal').addEventListener('click', function (e) {
      if (e.target === this) closeVoteModal();
    });
    document.getElementById('hof-success-close').addEventListener('click', function () {
      document.getElementById('hof-success-overlay').classList.add('hidden');
    });
    document.getElementById('hof-success-overlay').addEventListener('click', function (e) {
      if (e.target === this) this.classList.add('hidden');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeVoteModal();
      document.getElementById('hof-success-overlay').classList.add('hidden');
    });

    loadAll().then(function () {
      renderStats();
      renderCategories();
    });
  });
})();
