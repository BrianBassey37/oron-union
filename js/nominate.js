/* ============================================================
   NOMINATE.JS — Oron Union Hall of Fame public nominations
   ============================================================ */

(function () {
  'use strict';

  var TOTAL_STEPS = 3;
  var currentStep = 1;
  var verifiedEmail = null;
  var otpCooldownUntil = 0;
  var categories = [];

  var REQUIRED = {
    1: ['f-name', 'f-email', 'f-phone'],
    2: ['f-category', 'f-nominee-name', 'f-reason']
  };

  /* ── Navigate steps ── */
  window.nextStep = function (from) {
    if (!validateStep(from)) return;
    goTo(from + 1);
    if (from === 2) buildReview();
  };
  window.prevStep = function (from) { goTo(from - 1); };

  function goTo(step) {
    document.querySelectorAll('.reg-panel').forEach(function (p) { p.classList.remove('active'); });
    var target = document.getElementById('step-' + step) || document.getElementById('step-success');
    if (target) { target.classList.add('active'); currentStep = step; }
    updateProgress(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateProgress(step) {
    document.querySelectorAll('.rp-step').forEach(function (s) {
      var n = parseInt(s.dataset.step, 10);
      s.classList.remove('active', 'done');
      if (n < step) s.classList.add('done');
      else if (n === step) s.classList.add('active');
    });
    var fill = document.getElementById('rp-fill');
    if (fill) {
      var pct = step > 1 ? ((step - 1) / (TOTAL_STEPS - 1)) * 100 : 0;
      fill.style.width = pct + '%';
    }
  }

  /* ── Validation ── */
  function validateStep(step) {
    var required = REQUIRED[step] || [];
    var ok = true;

    required.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('err');
      if (!el.value.trim()) { el.classList.add('err'); ok = false; }
    });

    if (step === 1) {
      var emailEl = document.getElementById('f-email');
      var email = emailEl.value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        emailEl.classList.add('err');
        showStepError('Please enter a valid email address.');
        ok = false;
      } else if (verifiedEmail !== email) {
        showStepError('Please enter the code we emailed you, then tap Verify.');
        ok = false;
      }

      var phoneEl = document.getElementById('f-phone');
      var phoneDigits = phoneEl.value.replace(/[^\d]/g, '');
      if (!phoneEl.value.trim() || phoneDigits.length < 7 || phoneDigits.length > 15) {
        phoneEl.classList.add('err');
        showStepError('Please enter a valid phone number.');
        ok = false;
      }
    }

    if (ok) clearStepError();
    return ok;
  }

  function showStepError(msg) {
    var activePanel = document.querySelector('.reg-panel.active');
    if (!activePanel) return;
    var container = activePanel.querySelector('.reg-fields') || activePanel;
    var el = container.querySelector('.step-inline-error');
    if (!el) {
      el = document.createElement('div');
      el.className = 'step-inline-error';
      container.insertBefore(el, container.firstChild);
    }
    el.textContent = msg;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(function () { el.style.display = 'none'; }, 5000);
  }

  function clearStepError() {
    document.querySelectorAll('.step-inline-error').forEach(function (el) { el.style.display = 'none'; });
  }

  /* ── Categories ── */
  function loadCategories() {
    fetch('api/hof.php?action=list', { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (res) {
        categories = res.ok ? (res.categories || []) : [];
        var sel = document.getElementById('f-category');
        if (!categories.length) {
          sel.innerHTML = '<option value="">No categories available right now</option>';
          return;
        }
        sel.innerHTML = '<option value="">Select a category</option>' +
          categories.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
      })
      .catch(function () {
        document.getElementById('f-category').innerHTML = '<option value="">Could not load categories</option>';
      });
  }

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

  /* ── Email OTP verification (reuses the Hall of Fame voting purpose,
     so one verified email unlocks both nominating and voting) ── */
  function otpApi(action, body) {
    return fetch('api/otp.php?action=' + action, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
    }).then(function (res) { return res.json(); });
  }

  function initEmailOtp() {
    var emailEl = document.getElementById('f-email');
    var sendBtn = document.getElementById('send-otp-btn');
    var codeRow = document.getElementById('otp-code-row');
    var codeInput = document.getElementById('f-otp-code');
    var verifyBtn = document.getElementById('verify-otp-btn');
    var statusNote = document.getElementById('otp-status-note');
    var verifiedNote = document.getElementById('otp-verified-note');
    if (!emailEl || !sendBtn) return;

    function resetVerification() {
      verifiedEmail = null;
      verifiedNote.classList.add('hidden');
      codeRow.classList.add('hidden');
      statusNote.textContent = '';
    }

    emailEl.addEventListener('input', function () {
      if (verifiedEmail && verifiedEmail !== emailEl.value.trim()) resetVerification();
    });

    sendBtn.addEventListener('click', function () {
      var email = emailEl.value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        emailEl.classList.add('err');
        showStepError('Enter a valid email address first.');
        return;
      }
      if (Date.now() < otpCooldownUntil) return;

      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      otpApi('send', { email: email, purpose: 'hof_vote' }).then(function (res) {
        if (!res.ok) {
          sendBtn.disabled = false;
          sendBtn.textContent = 'Send Code';
          showStepError(res.error || 'Could not send code. Please try again.');
          return;
        }
        codeRow.classList.remove('hidden');
        statusNote.textContent = 'Code sent — check your inbox.';
        codeInput.focus();
        otpCooldownUntil = Date.now() + 20000;
        var secondsLeft = 20;
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
          statusNote.textContent = "Oops! That code doesn't match. Please check and try again 🤔";
          statusNote.style.color = '#dc2626';
          return;
        }
        statusNote.style.color = '';
        verifiedEmail = email;
        codeRow.classList.add('hidden');
        verifiedNote.classList.remove('hidden');
        clearStepError();
      });
    });
  }

  /* ── Review step ── */
  function buildReview() {
    var acc = document.getElementById('review-accordion');
    if (!acc) return;
    var categoryName = '';
    var catSel = document.getElementById('f-category');
    if (catSel && catSel.selectedOptions.length) categoryName = catSel.selectedOptions[0].textContent;

    var items = [
      ['Person Nominated', val('f-nominee-name')],
      ['Category', categoryName],
      ['Reason', val('f-reason')],
      ['Your Name', val('f-name')],
      ['Your Email', val('f-email')],
      ['Your Phone', val('f-phone') || '—']
    ];

    acc.innerHTML = '<div class="review-section open">' +
      '<div class="review-section-header">Your Nomination</div>' +
      '<div class="review-section-body"><div class="review-grid">' +
        items.map(function (item) {
          return '<div class="review-item"><div class="rv-key">' + item[0] + '</div><div class="rv-val">' + esc(item[1] || '—') + '</div></div>';
        }).join('') +
      '</div></div>' +
    '</div>';
  }

  /* ── Submit ── */
  window.submitNomination = function () {
    var btn = document.getElementById('submit-btn');
    var errEl = document.getElementById('submit-error');
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg> Submitting…';

    function fail(msg) {
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = 'Submit Nomination';
    }

    fetch('api/hof.php?action=nominate', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: val('f-category'),
        nomineeName: val('f-nominee-name'),
        reason: val('f-reason'),
        nominatorName: val('f-name'),
        nominatorEmail: val('f-email'),
        nominatorPhone: val('f-phone') || null
      })
    })
      .then(function (res) { return res.json(); })
      .then(function (res) {
        if (!res.ok) { fail(res.error || 'Could not submit your nomination. Please try again.'); return; }
        document.querySelectorAll('.reg-panel').forEach(function (p) { p.classList.remove('active'); });
        document.getElementById('step-success').classList.add('active');
        document.querySelectorAll('.rp-step').forEach(function (s) { s.classList.remove('active'); s.classList.add('done'); });
        var fill = document.getElementById('rp-fill');
        if (fill) fill.style.width = '100%';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function () {
        fail('Could not connect. Please check your internet connection and try again.');
      });
  };

  /* ── Boot ── */
  document.addEventListener('DOMContentLoaded', function () {
    initEmailOtp();
    loadCategories();
    updateProgress(1);

    var style = document.createElement('style');
    style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  });

})();
