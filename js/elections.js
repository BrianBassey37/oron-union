/* ============================================================
   ELECTIONS.JS — Oron Union Voting Portal (Supabase-backed)
   ============================================================ */

(function () {
  'use strict';

  function apiGet(action) {
    return fetch('api/elections.php?action=' + action, { credentials: 'same-origin' })
      .then(function (res) { return res.json(); });
  }
  function apiPost(action, body) {
    return fetch('api/elections.php?action=' + action, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
    }).then(function (res) { return res.json(); });
  }
  function authGet(action) {
    return fetch('api/auth.php?action=' + action, { credentials: 'same-origin' })
      .then(function (res) { return res.json(); });
  }
  function authPost(action, body) {
    return fetch('api/auth.php?action=' + action, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
    }).then(function (res) { return res.json(); });
  }

  /* ── State ── */
  var currentMember = null;   /* { id, name, email, memberId, lga, clan } */
  var ELECTIONS = [];         /* [{id,title,desc,deadline,status,candidates:[...]}] */
  var resultsCache = {};      /* { electionId: { candidateId: count } } */
  var myVotes = {};           /* { electionId: candidateId } */
  var registeredCount = 0;
  var selectedCandidate = null;
  var activeElectionId = null;
  var pollTimer = null;

  /* ───────────────────────────────────────────
     DATA LOADING
  ─────────────────────────────────────────── */
  function loadElections() {
    return apiGet('list').then(function (res) {
      var elections = (res.ok && res.elections) || [];
      var candidates = (res.ok && res.candidates) || [];
      ELECTIONS = elections.map(function (e) {
        return {
          id: e.id, title: e.title, desc: e.description, deadline: e.deadline, status: e.status,
          candidates: candidates.filter(function (c) { return c.election_id === e.id; })
            .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
            .map(function (c) { return { id: c.id, name: c.name, role: c.role, initials: c.initials, color: c.color || '#800020' }; })
        };
      });
    });
  }

  function loadResults() {
    return apiGet('results').then(function (res) {
      var out = {};
      ((res.ok && res.results) || []).forEach(function (r) {
        if (!out[r.election_id]) out[r.election_id] = {};
        out[r.election_id][r.candidate_id] = parseInt(r.vote_count, 10);
      });
      resultsCache = out;
      registeredCount = (res.ok && res.registeredCount) || 0;
    });
  }

  function loadMyVotes() {
    if (!currentMember) return Promise.resolve();
    return apiGet('my_votes').then(function (res) {
      var out = {};
      ((res.ok && res.votes) || []).forEach(function (v) { out[v.election_id] = v.candidate_id; });
      myVotes = out;
    });
  }

  function loadAllData() {
    return Promise.all([loadElections(), loadResults(), loadMyVotes()]);
  }

  /* ───────────────────────────────────────────
     DERIVED HELPERS (synchronous, read from cache)
  ─────────────────────────────────────────── */
  function getVotes(electionId) { return resultsCache[electionId] || {}; }
  function hasVoted(electionId) { return !!myVotes[electionId]; }
  function getMyChoiceFor(electionId) { return myVotes[electionId] || null; }
  function countRegisteredMembers() { return registeredCount; }

  function totalVotesFor(electionId) {
    var v = getVotes(electionId);
    return Object.values(v).reduce(function (a, b) { return a + b; }, 0);
  }

  function totalVotesAcrossActive() {
    var total = 0;
    ELECTIONS.filter(function (e) { return e.status === 'active'; }).forEach(function (e) {
      total += totalVotesFor(e.id);
    });
    return total;
  }

  function avgParticipationRate() {
    var registered = countRegisteredMembers();
    var active = ELECTIONS.filter(function (e) { return e.status === 'active'; });
    if (!active.length || !registered) return 0;
    var sum = active.reduce(function (acc, e) {
      return acc + Math.min(100, Math.round((totalVotesFor(e.id) / registered) * 100));
    }, 0);
    return Math.round(sum / active.length);
  }

  /* ───────────────────────────────────────────
     AUTH
  ─────────────────────────────────────────── */
  function showAuthGate() {
    document.getElementById('auth-gate').classList.remove('hidden');
    document.getElementById('elections-main').classList.add('hidden');
  }

  function showElections() {
    document.getElementById('auth-gate').classList.add('hidden');
    document.getElementById('elections-main').classList.remove('hidden');
    var nameEl = document.getElementById('member-name-display');
    nameEl.textContent = currentMember.name;
    if (currentMember.memberId) {
      nameEl.innerHTML += ' <span class="member-id-chip">' + currentMember.memberId + '</span>';
    }
    renderAll();
    startLivePolling();
  }

  function memberFromResponse(p) {
    return {
      id: p.id,
      name: [p.title, p.firstname, p.lastname].filter(Boolean).join(' '),
      email: p.email, memberId: p.member_id, lga: p.lga, clan: p.clan
    };
  }

  function attemptLogin(identifier, password) {
    return authPost('login', { identifier: identifier, password: password }).then(function (res) {
      if (!res.ok) {
        return { ok: false, pending: !!res.pending, rejected: !!res.rejected, message: res.error };
      }
      currentMember = memberFromResponse(res.member);
      return { ok: true };
    });
  }

  function clearSession() {
    currentMember = null;
    stopLivePolling();
    authPost('logout');
  }

  /* ───────────────────────────────────────────
     RENDER
  ─────────────────────────────────────────── */
  function renderAll() {
    renderStats();
    renderActiveElections();
    renderPastElections();
  }

  function renderStats() {
    var total      = totalVotesAcrossActive();
    var registered = countRegisteredMembers();
    animateNum('stat-total-voters', total);
    animateNum('stat-registered',   registered);
    document.getElementById('stat-participation').textContent = avgParticipationRate() + '%';
  }

  function animateNum(id, target) {
    var el = document.getElementById(id);
    if (!el) return;
    var current = parseInt(el.textContent.replace(/\D/g, ''), 10) || 0;
    var duration = 800;
    var start = performance.now();
    function tick(now) {
      var t = Math.min((now - start) / duration, 1);
      t = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      el.textContent = Math.round(current + (target - current) * t);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    el.classList.add('bump');
    setTimeout(function () { el.classList.remove('bump'); }, 350);
  }

  var NO_ACTIVE_HTML = '<p class="elec-empty-note">No active elections at this time. Check back soon.</p>';
  var NO_PAST_HTML   = '<p class="elec-empty-note">No completed elections yet.</p>';

  function renderActiveElections() {
    var grid = document.getElementById('active-elections-grid');
    if (!grid) return;
    var active = ELECTIONS.filter(function (e) { return e.status === 'active'; });
    document.getElementById('stat-active').textContent = active.length;
    grid.innerHTML = active.length ? active.map(function (e) { return buildCard(e); }).join('') : NO_ACTIVE_HTML;
    bindCardButtons();
    scheduleBarAnimate();
  }

  function renderPastElections() {
    var grid = document.getElementById('past-elections-grid');
    if (!grid) return;
    var past = ELECTIONS.filter(function (e) { return e.status === 'closed'; });
    grid.innerHTML = past.length ? past.map(function (e) { return buildCard(e); }).join('') : NO_PAST_HTML;
    bindCardButtons();
    scheduleBarAnimate();
  }

  function buildCard(election) {
    var votes = getVotes(election.id);
    var total = Object.values(votes).reduce(function (a, b) { return a + b; }, 0);
    var voted = hasVoted(election.id);
    var isActive = election.status === 'active';

    var deadline = election.deadline ? new Date(election.deadline) : null;
    var deadlineStr = deadline ? deadline.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

    /* Status badge */
    var statusClass = voted ? 'voted' : isActive ? 'active' : 'closed';
    var statusText  = voted ? '&#10003; Voted' : isActive ? '&#9679; Active' : 'Closed';

    /* Candidate rows */
    var sortedCands = election.candidates.slice().sort(function (a, b) {
      return (votes[b.id] || 0) - (votes[a.id] || 0);
    });
    var candRows = sortedCands.slice(0, 3).map(function (c, i) {
      var v = votes[c.id] || 0;
      var pct = total > 0 ? Math.round((v / total) * 100) : 0;
      var isLeading = i === 0 && total > 0;
      return '<div class="ec-cand-row">' +
        '<div class="ec-cand-avatar" style="background:' + c.color + '">' + c.initials + '</div>' +
        '<span class="ec-cand-name">' + c.name + '</span>' +
        (isLeading ? '<span class="ec-cand-leading">Leading</span>' : '') +
        '<span class="ec-cand-pct">' + pct + '%</span>' +
        '</div>';
    }).join('');

    /* Participation bar — use live registered count */
    var regCount = countRegisteredMembers();
    var partPct  = regCount > 0 ? Math.round((total / regCount) * 100) : 0;

    /* Action buttons */
    var btns = '';
    if (isActive) {
      if (voted) {
        btns = '<button class="ec-btn-vote" disabled style="background:#6b7280;">&#10003; Voted</button>' +
               '<button class="ec-btn-results" data-id="' + election.id + '">Live Results</button>';
      } else {
        btns = '<button class="ec-btn-vote" data-id="' + election.id + '">Vote Now &#8594;</button>' +
               '<button class="ec-btn-results" data-id="' + election.id + '">Results</button>';
      }
    } else {
      btns = '<button class="ec-btn-results" data-id="' + election.id + '" style="flex:2;">View Final Results</button>';
    }

    return '<div class="election-card" data-election-id="' + election.id + '">' +
      '<div class="election-card-header">' +
        '<div class="ec-status ' + statusClass + '">' + statusText + '</div>' +
        '<div class="ec-title">' + election.title + '</div>' +
        '<div class="ec-deadline">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
          (isActive ? 'Deadline: ' + deadlineStr : 'Closed: ' + deadlineStr) +
        '</div>' +
      '</div>' +
      '<div class="election-card-body">' +
        '<p class="ec-desc">' + (election.desc || '') + '</p>' +
        '<div class="ec-participation">' +
          '<div class="ec-part-label"><span>' + total + ' of ' + regCount + ' members voted</span><strong>' + partPct + '%</strong></div>' +
          '<div class="ec-part-track"><div class="ec-part-fill" data-target="' + partPct + '"></div></div>' +
        '</div>' +
        '<div class="ec-candidates-preview">' + candRows + '</div>' +
      '</div>' +
      '<div class="election-card-actions">' + btns + '</div>' +
    '</div>';
  }

  function scheduleBarAnimate() {
    setTimeout(function () {
      document.querySelectorAll('.ec-part-fill[data-target]').forEach(function (el) {
        el.style.width = el.dataset.target + '%';
      });
    }, 120);
  }

  function bindCardButtons() {
    document.querySelectorAll('.ec-btn-vote[data-id]').forEach(function (btn) {
      btn.addEventListener('click', function () { openVoteModal(btn.dataset.id); });
    });
    document.querySelectorAll('.ec-btn-results[data-id]').forEach(function (btn) {
      btn.addEventListener('click', function () { openResultsModal(btn.dataset.id); });
    });
  }

  /* ───────────────────────────────────────────
     VOTE MODAL
  ─────────────────────────────────────────── */
  function openVoteModal(electionId) {
    var election = ELECTIONS.find(function (e) { return e.id === electionId; });
    if (!election || hasVoted(electionId)) return;

    activeElectionId = electionId;
    selectedCandidate = null;

    document.getElementById('vote-modal-title').textContent = election.title;
    document.getElementById('vote-modal-desc').textContent = election.desc || '';

    var list = document.getElementById('candidates-list');
    list.innerHTML = election.candidates.map(function (c) {
      return '<div class="candidate-option" data-cand-id="' + c.id + '">' +
        '<div class="cand-avatar" style="background:' + c.color + '">' + c.initials + '</div>' +
        '<div class="cand-info">' +
          '<div class="cand-name">' + c.name + '</div>' +
          '<div class="cand-title-text">' + (c.role || '') + '</div>' +
        '</div>' +
        '<div class="cand-radio"><div class="cand-radio-dot"></div></div>' +
      '</div>';
    }).join('');

    /* Bind candidate selection */
    list.querySelectorAll('.candidate-option').forEach(function (opt) {
      opt.addEventListener('click', function () {
        list.querySelectorAll('.candidate-option').forEach(function (o) { o.classList.remove('selected'); });
        opt.classList.add('selected');
        selectedCandidate = opt.dataset.candId;
        var castBtn = document.getElementById('cast-vote-btn');
        var cand = election.candidates.find(function (c) { return c.id === selectedCandidate; });
        castBtn.disabled = false;
        castBtn.textContent = 'Vote for ' + cand.name + ' →';
      });
    });

    document.getElementById('cast-vote-btn').disabled = true;
    document.getElementById('cast-vote-btn').textContent = 'Select a candidate first';
    document.getElementById('vote-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeVoteModal() {
    document.getElementById('vote-modal').classList.add('hidden');
    document.body.style.overflow = '';
    selectedCandidate = null;
  }

  function castVote() {
    if (!selectedCandidate || !activeElectionId || !currentMember) return;
    var castBtn = document.getElementById('cast-vote-btn');
    castBtn.disabled = true;
    castBtn.textContent = 'Submitting…';

    apiPost('vote', { electionId: activeElectionId, candidateId: selectedCandidate }).then(function (res) {
      if (!res.ok) {
        castBtn.disabled = false;
        if (/already voted/i.test(res.error || '')) {
          castBtn.textContent = 'You already voted';
          myVotes[activeElectionId] = myVotes[activeElectionId] || selectedCandidate;
          renderAll();
        } else {
          castBtn.textContent = 'Try again';
          alert('Could not submit your vote: ' + res.error);
        }
        return;
      }

      myVotes[activeElectionId] = selectedCandidate;

      loadResults().then(function () {
        var election = ELECTIONS.find(function (e) { return e.id === activeElectionId; });
        var cand = election.candidates.find(function (c) { return c.id === selectedCandidate; });
        document.getElementById('success-message').textContent =
          'You voted for ' + cand.name + ' in ' + election.title + '. Your vote has been recorded.';

        closeVoteModal();
        showSuccessOverlay();
        renderAll();
      });
    });
  }

  /* ───────────────────────────────────────────
     RESULTS MODAL
  ─────────────────────────────────────────── */
  function openResultsModal(electionId) {
    var election = ELECTIONS.find(function (e) { return e.id === electionId; });
    if (!election) return;

    activeElectionId = electionId;
    document.getElementById('results-modal-title').textContent = election.title;
    renderResultsList(electionId);
    document.getElementById('results-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    /* Animate bars after paint */
    setTimeout(function () {
      document.querySelectorAll('.result-bar-fill[data-target]').forEach(function (el) {
        el.style.width = el.dataset.target + '%';
      });
    }, 100);
  }

  function renderResultsList(electionId) {
    var election = ELECTIONS.find(function (e) { return e.id === electionId; });
    if (!election) return;

    var votes = getVotes(electionId);
    var total = Object.values(votes).reduce(function (a, b) { return a + b; }, 0);
    var myChoice = getMyChoiceFor(electionId);

    var sorted = election.candidates.slice().sort(function (a, b) {
      return (votes[b.id] || 0) - (votes[a.id] || 0);
    });

    var html = sorted.map(function (c, i) {
      var v = votes[c.id] || 0;
      var pct = total > 0 ? (v / total * 100).toFixed(1) : '0.0';
      var isLeading = i === 0 && total > 0;
      var isMyVote  = myChoice === c.id;

      return '<div class="result-item">' +
        '<div class="result-item-header">' +
          '<div class="result-avatar" style="background:' + c.color + '">' + c.initials + '</div>' +
          '<div>' +
            '<div class="result-name">' + c.name +
              (isLeading ? '<span class="result-leading-tag">Leading</span>' : '') +
              (isMyVote  ? '<span class="result-my-vote-tag">Your Vote</span>' : '') +
            '</div>' +
            '<div style="font-size:0.75rem;color:var(--gray);">' + (c.role || '') + '</div>' +
          '</div>' +
          '<span class="result-votes">' + v.toLocaleString() + ' votes</span>' +
          '<span class="result-pct-label">' + pct + '%</span>' +
        '</div>' +
        '<div class="result-bar-track">' +
          '<div class="result-bar-fill" data-target="' + parseFloat(pct) + '" style="background:' + (isLeading ? 'linear-gradient(90deg,var(--red),var(--gold))' : c.color) + '"></div>' +
        '</div>' +
      '</div>';
    }).join('');

    document.getElementById('results-list').innerHTML = html;
    var regForMeta = countRegisteredMembers();
    document.getElementById('results-modal-meta').textContent =
      total.toLocaleString() + ' of ' + regForMeta + ' registered members have voted' +
      (regForMeta > 0 ? ' (' + Math.round(total / regForMeta * 100) + '% participation)' : '');

    var votedNotice = document.getElementById('voted-notice');
    if (hasVoted(electionId)) {
      votedNotice.classList.remove('hidden');
    } else {
      votedNotice.classList.add('hidden');
    }

    document.getElementById('results-last-updated').textContent =
      'Last updated: ' + new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function closeResultsModal() {
    document.getElementById('results-modal').classList.add('hidden');
    document.body.style.overflow = '';
    activeElectionId = null;
  }

  /* ───────────────────────────────────────────
     SUCCESS OVERLAY
  ─────────────────────────────────────────── */
  function showSuccessOverlay() {
    document.getElementById('success-overlay').classList.remove('hidden');
  }

  function closeSuccessOverlay() {
    document.getElementById('success-overlay').classList.add('hidden');
  }

  /* ───────────────────────────────────────────
     LIVE UI REFRESH — polls Supabase for fresh
     results so every visitor sees real, shared
     tallies (not just their own browser).
  ─────────────────────────────────────────── */
  function refreshLiveUI() {
    renderStats();
    ELECTIONS.forEach(function (election) {
      var card = document.querySelector('[data-election-id="' + election.id + '"]');
      if (!card) return;
      var votes = getVotes(election.id);
      var total   = Object.values(votes).reduce(function (a, b) { return a + b; }, 0);
      var regLive = countRegisteredMembers();
      var partPct = regLive > 0 ? Math.round((total / regLive) * 100) : 0;

      var label = card.querySelector('.ec-part-label');
      if (label) {
        var span = label.querySelector('span');
        if (span) span.textContent = total + ' of ' + regLive + ' members voted';
        var strong = label.querySelector('strong');
        if (strong) strong.textContent = partPct + '%';
      }

      var fill = card.querySelector('.ec-part-fill');
      if (fill) fill.style.width = partPct + '%';

      var preview = card.querySelector('.ec-candidates-preview');
      if (preview) {
        var sorted = election.candidates.slice().sort(function (a, b) {
          return (votes[b.id] || 0) - (votes[a.id] || 0);
        });
        preview.innerHTML = sorted.slice(0, 3).map(function (c, i) {
          var v = votes[c.id] || 0;
          var pct = total > 0 ? Math.round((v / total) * 100) : 0;
          return '<div class="ec-cand-row">' +
            '<div class="ec-cand-avatar" style="background:' + c.color + '">' + c.initials + '</div>' +
            '<span class="ec-cand-name">' + c.name + '</span>' +
            (i === 0 ? '<span class="ec-cand-leading">Leading</span>' : '') +
            '<span class="ec-cand-pct">' + pct + '%</span>' +
            '</div>';
        }).join('');
      }
    });
  }

  /* ───────────────────────────────────────────
     LIVE POLLING (replaces the old cross-tab-only
     BroadcastChannel — this reflects real votes
     from every visitor, not just this browser)
  ─────────────────────────────────────────── */
  function startLivePolling() {
    stopLivePolling();
    pollTimer = setInterval(function () {
      loadResults().then(function () {
        refreshLiveUI();
        var rm = document.getElementById('results-modal');
        if (!rm.classList.contains('hidden') && activeElectionId) {
          renderResultsList(activeElectionId);
          setTimeout(function () {
            document.querySelectorAll('.result-bar-fill[data-target]').forEach(function (el) {
              el.style.width = el.dataset.target + '%';
            });
          }, 60);
        }
      });
    }, 15000);
  }

  function stopLivePolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  /* ───────────────────────────────────────────
     BOOT
  ─────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    /* ── Password toggle ── */
    var togglePassBtn = document.querySelector('.toggle-pass');
    if (togglePassBtn) {
      togglePassBtn.addEventListener('click', function () {
        var inp = document.getElementById('login-pass');
        if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
      });
    }

    /* ── Login ── */
    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var id  = document.getElementById('login-id').value.trim();
      var pwd = document.getElementById('login-pass').value;
      var err = document.getElementById('login-error');
      var submitBtn = e.target.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      attemptLogin(id, pwd).then(function (result) {
        if (submitBtn) submitBtn.disabled = false;
        if (!result.ok) {
          err.textContent = result.message;
          if (result.pending) {
            err.style.background = '#fffbeb'; err.style.border = '1px solid #fde68a'; err.style.color = '#92400e';
          } else {
            err.style.background = ''; err.style.border = ''; err.style.color = '';
          }
          err.classList.remove('hidden');
          return;
        }
        err.classList.add('hidden');
        loadAllData().then(showElections);
      });
    });

    /* ── Logout ── */
    document.getElementById('logout-btn').addEventListener('click', function () {
      clearSession();
      showAuthGate();
    });

    /* ── Vote modal triggers ── */
    document.getElementById('vote-modal-close').addEventListener('click', closeVoteModal);
    document.getElementById('cancel-vote-btn').addEventListener('click', closeVoteModal);
    document.getElementById('cast-vote-btn').addEventListener('click', castVote);

    /* ── Results modal triggers ── */
    document.getElementById('results-modal-close').addEventListener('click', closeResultsModal);
    document.getElementById('close-results-btn').addEventListener('click', closeResultsModal);

    /* ── Success overlay ── */
    document.getElementById('success-view-results').addEventListener('click', function () {
      closeSuccessOverlay();
      if (activeElectionId) openResultsModal(activeElectionId);
    });

    /* ── Close modals on backdrop click ── */
    document.getElementById('vote-modal').addEventListener('click', function (e) {
      if (e.target === this) closeVoteModal();
    });
    document.getElementById('results-modal').addEventListener('click', function (e) {
      if (e.target === this) closeResultsModal();
    });
    document.getElementById('success-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeSuccessOverlay();
    });

    /* ── Escape key ── */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeVoteModal(); closeResultsModal(); closeSuccessOverlay();
    });

    /* ── Sticky stats bar shadow on scroll ── */
    var statsBar = document.querySelector('.vote-stats-bar');
    if (statsBar) {
      window.addEventListener('scroll', function () {
        statsBar.classList.toggle('pinned', window.scrollY > 20);
      }, { passive: true });
    }

    /* ── Boot sequence — resume an existing PHP session if there is one ── */
    authGet('me').then(function (res) {
      if (!res.ok || !res.member || res.member.status !== 'approved') { showAuthGate(); return; }
      currentMember = memberFromResponse(res.member);
      loadAllData().then(showElections);
    });
  });

})();
