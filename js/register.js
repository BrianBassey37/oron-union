/* ============================================================
   REGISTER.JS — Oron Union Member Registration
   ============================================================ */

(function () {
  'use strict';

  var TOTAL_STEPS = 6;
  var currentStep = 1;

  var LGA_CODES = {
    'Oron': 'ORN',
    'Urueoffong/Oruko': 'URO',
    'Okobo': 'OKB',
    'Mbo': 'MBO',
    'Udunguko': 'UDG'
  };

  /* ── Required fields per step ── */
  var REQUIRED = {
    1: ['f-title', 'f-firstname', 'f-lastname', 'f-dob', 'f-gender', 'f-placeofbirth'],
    2: ['f-lga', 'f-clan', 'f-compound'],
    3: ['f-phone', 'f-email', 'f-country'],
    4: ['f-qualification', 'f-occupation'],
    5: ['f-password', 'f-password2']
  };

  /* ── Storage ── */
  function getApps() {
    try { return JSON.parse(localStorage.getItem('oron_applications') || '[]'); }
    catch (e) { return []; }
  }
  function saveApps(list) { localStorage.setItem('oron_applications', JSON.stringify(list)); }

  function generateRef() {
    var ts = Date.now().toString().slice(-6);
    return 'APP-' + ts;
  }

  function generateMemberId(lga) {
    var code = LGA_CODES[lga] || 'GEN';
    var num = String(Math.floor(Math.random() * 9000) + 1000);
    return 'OU-' + new Date().getFullYear() + '-' + code + '-' + num;
  }

  /* ── Navigate steps ── */
  window.nextStep = function (from) {
    if (!validateStep(from)) return;
    goTo(from + 1);
  };

  window.prevStep = function (from) { goTo(from - 1); };

  function goTo(step) {
    var panels = document.querySelectorAll('.reg-panel');
    panels.forEach(function (p) { p.classList.remove('active'); });
    var target = document.getElementById('step-' + step) || document.getElementById('step-success');
    if (target) { target.classList.add('active'); currentStep = step; }
    updateProgress(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateProgress(step) {
    var steps = document.querySelectorAll('.rp-step');
    steps.forEach(function (s) {
      var n = parseInt(s.dataset.step, 10);
      s.classList.remove('active', 'done');
      if (n < step) s.classList.add('done');
      else if (n === step) s.classList.add('active');
    });
    /* Fill progress bar */
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

    /* Step 2: must choose birth status */
    if (step === 2) {
      var byBirth = document.querySelector('input[name="oron-birth"]:checked');
      if (!byBirth) { showStepError('Please indicate your Oron origin status.'); ok = false; }
      else if (byBirth.value === 'no') {
        var conn = document.getElementById('f-connection');
        if (!conn.value.trim()) { conn.classList.add('err'); ok = false; }
      }
    }

    /* Step 5: endorser type must be selected */
    if (step === 5) {
      var eType = document.querySelector('input[name="endorser-type"]:checked');
      if (!eType) { showStepError('Please select who will endorse your membership.'); ok = false; }
      else if (eType.value === 'branch-president' || eType.value === 'clan-rep') {
        var lgaSel = document.getElementById('f-endorser-lga');
        if (!lgaSel.value) { lgaSel.classList.add('err'); showStepError('Please select the LGA for your endorser.'); ok = false; }
      }

      /* Password match */
      var p1 = document.getElementById('f-password');
      var p2 = document.getElementById('f-password2');
      if (p1.value.length < 6) { p1.classList.add('err'); showStepError('Password must be at least 6 characters.'); ok = false; }
      else if (p1.value !== p2.value) { p2.classList.add('err'); showStepError('Passwords do not match.'); ok = false; }

      /* Email duplicate check */
      var email = document.getElementById('f-email').value.trim();
      var existing = getApps().find(function (a) { return a.email === email; });
      if (existing) { showStepError('An application with this email already exists (Ref: ' + existing.ref + ').'); ok = false; }
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
    document.querySelectorAll('.step-inline-error').forEach(function (el) {
      el.style.display = 'none';
    });
  }

  /* ── Step 5 logic: show/hide contextual fields for each endorser ── */
  var LGA_OPTS  = ['Oron','Urueoffong/Oruko','Okobo','Mbo','Udunguko'];
  var CLAN_OPTS = ['Afaha Ukwong','Afaha Ibighi','Afaha Oki-uso','Afaha Idua','Afaha Okpo','Afaha Ubodung','Ebughu','Effiat','Etta'];

  function swapEndorserOptions(sel, opts, placeholder) {
    sel.innerHTML = '<option value="">' + placeholder + '</option>';
    opts.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v; sel.appendChild(o);
    });
  }

  function initEndorserToggle() {
    var radios = document.querySelectorAll('input[name="endorser-type"]');
    radios.forEach(function (r) {
      r.addEventListener('change', function () {
        var lgaFields = document.getElementById('lga-rep-fields');
        var lgaLabel  = document.getElementById('lga-rep-label');
        var nameLabel = document.getElementById('lga-rep-name-label');
        var noteText  = document.getElementById('lga-rep-note-text');
        var lgaSel    = document.getElementById('f-endorser-lga');

        if (r.value === 'branch-president') {
          lgaFields.classList.remove('hidden');
          if (lgaLabel)  lgaLabel.innerHTML  = 'Branch LGA <span class="req">*</span>';
          if (nameLabel) nameLabel.textContent = 'Name of Branch President (if known)';
          if (noteText)  noteText.textContent  = 'The Branch President for your selected LGA will receive and review your application before your Member ID is issued.';
          swapEndorserOptions(lgaSel, LGA_OPTS, 'Select LGA');
        } else if (r.value === 'clan-rep') {
          lgaFields.classList.remove('hidden');
          if (lgaLabel)  lgaLabel.innerHTML  = 'Clan <span class="req">*</span>';
          if (nameLabel) nameLabel.textContent = 'Name of Clan Representative (if known)';
          if (noteText)  noteText.textContent  = 'The Clan Representative will verify your Oron heritage and endorse your application.';
          swapEndorserOptions(lgaSel, CLAN_OPTS, 'Select your clan');
        } else {
          lgaFields.classList.add('hidden');
          lgaSel.value = '';
        }
      });
    });
  }

  /* ── Step 2 logic: show/hide non-birth fields ── */
  function initBirthToggle() {
    document.querySelectorAll('input[name="oron-birth"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var show = r.value === 'no';
        document.getElementById('non-birth-fields').style.display = show ? 'block' : 'none';
        document.getElementById('non-birth-years').style.display  = show ? 'grid' : 'none';
      });
    });
  }

  /* ── WhatsApp same as primary ── */
  function initWhatsappCheck() {
    var cb = document.getElementById('same-whatsapp');
    if (!cb) return;
    cb.addEventListener('change', function () {
      var wa = document.getElementById('f-whatsapp');
      var ph = document.getElementById('f-phone');
      if (cb.checked) { wa.value = ph.value; wa.disabled = true; }
      else { wa.disabled = false; }
    });
  }

  /* ── Bio word count ── */
  function initBioCount() {
    var bio = document.getElementById('f-bio');
    var counter = document.getElementById('bio-count');
    if (!bio || !counter) return;
    bio.addEventListener('input', function () {
      var words = bio.value.trim() ? bio.value.trim().split(/\s+/).length : 0;
      counter.textContent = words + ' / 200 words';
      counter.style.color = words > 200 ? '#dc2626' : '';
      if (words > 200) {
        var trimmed = bio.value.trim().split(/\s+/).slice(0, 200).join(' ');
        bio.value = trimmed + ' ';
      }
    });
  }

  /* ── Photo preview ── */
  function initPhotoUpload() {
    var input = document.getElementById('f-photo');
    var preview = document.getElementById('photo-preview');
    var nameEl = document.getElementById('photo-name');
    if (!input) return;
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { alert('File too large. Max 2MB allowed.'); input.value = ''; return; }
      nameEl.textContent = file.name;
      var reader = new FileReader();
      reader.onload = function (e) {
        preview.innerHTML = '<img src="' + e.target.result + '" alt="Passport photo" />';
        /* Store base64 in hidden field for submission */
        window._photoData = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ── Password toggle ── */
  window.togglePass = function (id, btn) {
    var inp = document.getElementById(id);
    inp.type = inp.type === 'password' ? 'text' : 'password';
  };

  /* ── Build review accordion ── */
  function buildReview() {
    var data = collectData();
    var acc = document.getElementById('review-accordion');
    if (!acc) return;

    var sections = [
      {
        title: 'Personal Information',
        items: [
          ['Full Name', [data.title, data.firstname, data.middlename, data.lastname].filter(Boolean).join(' ')],
          ['Date of Birth', data.dob],
          ['Gender', data.gender],
          ['Marital Status', data.marital || '—'],
          ['Place of Birth', data.placeofbirth],
          ['Nationality', data.nationality]
        ]
      },
      {
        title: 'Origin & Verification',
        items: [
          ['LGA', data.lga],
          ['Clan', data.clan],
          ['Family / Compound', data.compound],
          ['State of Origin', data.stateOrigin],
          ['Oron by Birth', data.byBirth === 'yes' ? 'Yes' : 'No'],
          data.byBirth === 'no' ? ['Connection to Oron', data.connection] : null
        ].filter(Boolean)
      },
      {
        title: 'Contact Details',
        items: [
          ['Phone', data.phone],
          ['WhatsApp', data.whatsapp || data.phone],
          ['Email', data.email],
          ['Country', data.country],
          ['State / Province', data.stateRes || '—'],
          ['Address', data.address || '—']
        ]
      },
      {
        title: 'Professional Profile',
        items: [
          ['Qualification', data.qualification],
          ['Field of Study', data.field || '—'],
          ['Occupation', data.occupation],
          ['Employer', data.employer || '—']
        ]
      },
      {
        title: 'Endorsement',
        items: [
          ['Endorser', { 'president-general': 'President-General', 'branch-president': 'Branch President', 'clan-rep': 'Clan Representative' }[data.endorserType] || data.endorserType],
          (data.endorserType === 'branch-president' || data.endorserType === 'clan-rep') ? ['Branch / Clan', data.endorserLga] : null,
          data.repName ? ['Endorser Name', data.repName] : null
        ].filter(Boolean)
      }
    ];

    acc.innerHTML = sections.map(function (sec) {
      var items = sec.items.map(function (item) {
        return '<div class="review-item"><div class="rv-key">' + item[0] + '</div><div class="rv-val">' + (item[1] || '—') + '</div></div>';
      }).join('');
      return '<div class="review-section open">' +
        '<div class="review-section-header">' +
          sec.title +
          '<svg class="rv-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
        '</div>' +
        '<div class="review-section-body"><div class="review-grid">' + items + '</div></div>' +
      '</div>';
    }).join('');

    /* Accordion toggle */
    acc.querySelectorAll('.review-section-header').forEach(function (h) {
      h.addEventListener('click', function () {
        h.parentElement.classList.toggle('open');
      });
    });
  }

  /* ── Collect all form data ── */
  function collectData() {
    var byBirth = document.querySelector('input[name="oron-birth"]:checked');
    var eType   = document.querySelector('input[name="endorser-type"]:checked');
    return {
      title:        val('f-title'),
      firstname:    val('f-firstname'),
      middlename:   val('f-middlename'),
      lastname:     val('f-lastname'),
      dob:          val('f-dob'),
      gender:       val('f-gender'),
      marital:      val('f-marital'),
      placeofbirth: val('f-placeofbirth'),
      nationality:  val('f-nationality'),
      lga:          val('f-lga'),
      clan:         val('f-clan'),
      compound:     val('f-compound'),
      stateOrigin:  val('f-state-origin'),
      byBirth:      byBirth ? byBirth.value : '',
      connection:   val('f-connection'),
      years:        val('f-years'),
      voucher:      val('f-voucher'),
      phone:        val('f-phone'),
      whatsapp:     val('f-whatsapp'),
      email:        val('f-email'),
      country:      val('f-country'),
      stateRes:     val('f-state-res'),
      address:      val('f-address'),
      qualification: val('f-qualification'),
      field:        val('f-field'),
      occupation:   val('f-occupation'),
      employer:     val('f-employer'),
      bio:          val('f-bio'),
      endorserType: eType ? eType.value : '',
      endorserLga:  val('f-endorser-lga'),
      repName:      val('f-rep-name'),
      password:     val('f-password'),
      photo:        window._photoData || null
    };
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  /* ── Submit ── */
  window.submitApplication = function () {
    /* Must have photo */
    if (!window._photoData) {
      var err = document.getElementById('submit-error');
      err.textContent = 'Please upload your passport photograph.';
      err.classList.remove('hidden');
      return;
    }
    /* Must accept declaration */
    if (!document.getElementById('f-declaration').checked) {
      var err = document.getElementById('submit-error');
      err.textContent = 'Please read and accept the declaration before submitting.';
      err.classList.remove('hidden');
      return;
    }

    var btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"/></svg> Submitting…';

    setTimeout(function () {
      var data = collectData();
      var ref  = generateRef();
      var app  = Object.assign({}, data, {
        ref: ref,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        memberId: null
      });
      delete app.password; /* Don't store plaintext password in application record */
      app.passwordHash = btoa(data.password); /* Very basic encoding — production must use real hashing */

      var apps = getApps();
      apps.push(app);
      saveApps(apps);

      /* Populate success screen */
      document.getElementById('ref-num').textContent = ref;

      var endorserLabels = {
        'president-general': 'the President-General of Oron Union',
        'branch-president':  'the Branch President' + (data.endorserLga ? ' (' + data.endorserLga + ' LGA)' : ''),
        'clan-rep':          'the Clan Representative' + (data.endorserLga ? ' for ' + data.endorserLga : '')
      };
      var who = endorserLabels[data.endorserType] || 'your selected endorser';

      document.getElementById('endorser-notified').innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>' +
        'Your application has been forwarded to <strong>' + who + '</strong> for review and endorsement.';

      /* Show success */
      document.querySelectorAll('.reg-panel').forEach(function (p) { p.classList.remove('active'); });
      document.getElementById('step-success').classList.add('active');

      /* Mark all steps done in progress */
      document.querySelectorAll('.rp-step').forEach(function (s) { s.classList.remove('active'); s.classList.add('done'); });
      var fill = document.getElementById('rp-fill');
      if (fill) fill.style.width = '100%';

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 1200);
  };

  /* ── Intercept "Next" on step 5 to build review ── */
  var origNext5 = window.nextStep;
  window.nextStep = function (from) {
    if (from === 5) {
      if (!validateStep(5)) return;
      buildReview();
      goTo(6);
    } else {
      origNext5(from);
    }
  };

  /* ── Boot ── */
  document.addEventListener('DOMContentLoaded', function () {
    initEndorserToggle();
    initBirthToggle();
    initWhatsappCheck();
    initBioCount();
    initPhotoUpload();
    updateProgress(1);

    /* CSS for spinner */
    var style = document.createElement('style');
    style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  });

})();
