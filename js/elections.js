/* ============================================================
   ELECTIONS.JS — Oron Union Voting Portal
   ============================================================ */

(function () {
  'use strict';

  /* ── Storage keys ── */
  var STORE = {
    members:  'oron_members',
    current:  'oron_current_member',
    votes:    'oron_votes',        // { electionId: { candidateId: count } }
    myVotes:  'oron_my_votes',     // { memberId: { electionId: candidateId } }
    registered: 'oron_registered_ids'
  };

  /* ── Election data — populated once real elections are scheduled ── */
  var ELECTIONS = [];

  /* ── State ── */
  var currentMember = null;
  var selectedCandidate = null;
  var activeElectionId = null;
  var bc = null;

  /* ───────────────────────────────────────────
     STORAGE HELPERS
  ─────────────────────────────────────────── */
  function getStore(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch (e) { return null; }
  }
  function setStore(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  /* ── Initialise vote counts (seed) ── */
  function initVotes() {
    var stored = getStore(STORE.votes);
    if (stored) return stored;
    var data = {};
    ELECTIONS.forEach(function (el) {
      data[el.id] = {};
      el.candidates.forEach(function (c) { data[el.id][c.id] = c.seed; });
    });
    setStore(STORE.votes, data);
    return data;
  }

  function getVotes() { return getStore(STORE.votes) || initVotes(); }

  function getMyVotes() { return getStore(STORE.myVotes) || {}; }

  function getMemberVoteKey() { return currentMember ? currentMember.id : null; }

  function hasVoted(electionId) {
    var mv = getMyVotes();
    var key = getMemberVoteKey();
    return key && mv[key] && mv[key][electionId];
  }

  function getMyChoiceFor(electionId) {
    var mv = getMyVotes();
    var key = getMemberVoteKey();
    return key && mv[key] ? (mv[key][electionId] || null) : null;
  }

  function totalVotesFor(electionId) {
    var v = getVotes()[electionId];
    if (!v) return 0;
    return Object.values(v).reduce(function (a, b) { return a + b; }, 0);
  }

  function totalVotesAcrossActive() {
    var total = 0;
    ELECTIONS.filter(function (e) { return e.status === 'active'; }).forEach(function (e) {
      total += totalVotesFor(e.id);
    });
    return total;
  }

  function countRegisteredMembers() {
    var base = 0;
    try {
      var apps = JSON.parse(localStorage.getItem('oron_applications') || '[]');
      return base + apps.filter(function (a) { return a.status === 'approved'; }).length;
    } catch (e) { return base; }
  }

  function avgParticipationRate() {
    var registered = countRegisteredMembers();
    var active = ELECTIONS.filter(function (e) { return e.status === 'active'; });
    if (!active.length) return 0;
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
    initBroadcastChannel();
  }

  function loadSession() {
    var m = getStore(STORE.current);
    if (m && m.id) { currentMember = m; return true; }
    return false;
  }

  function saveSession(member) {
    currentMember = member;
    setStore(STORE.current, member);
  }

  function clearSession() {
    currentMember = null;
    localStorage.removeItem(STORE.current);
  }

  function getMembers() { return getStore(STORE.members) || []; }

  function saveMember(m) {
    var list = getMembers();
    list.push(m);
    setStore(STORE.members, list);
  }

  function findMember(identifier, password) {
    /* Check legacy oron_members store */
    var list = getMembers();
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if ((m.email === identifier || m.memberId === identifier) && m.password === password) {
        return { found: true, approved: true, member: m };
      }
    }
    /* Check approved applications (new registration system) */
    try {
      var apps = JSON.parse(localStorage.getItem('oron_applications') || '[]');
      for (var j = 0; j < apps.length; j++) {
        var a = apps[j];
        var passMatch = a.passwordHash && atob(a.passwordHash) === password;
        var idMatch   = a.email === identifier || a.memberId === identifier;
        if (idMatch && passMatch) {
          if (a.status === 'approved') {
            return {
              found: true, approved: true,
              member: {
                id: a.ref,
                name: [a.title, a.firstname, a.lastname].filter(Boolean).join(' '),
                email: a.email,
                memberId: a.memberId,
                lga: a.lga,
                clan: a.clan
              }
            };
          } else if (a.status === 'pending') {
            return { found: true, approved: false, pending: true, ref: a.ref };
          } else if (a.status === 'rejected') {
            return { found: true, approved: false, rejected: true, reason: a.rejectReason };
          }
        }
      }
    } catch (e) {}
    return null;
  }

  function generateMemberId() {
    return 'OU-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 9000) + 1000);
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
    var votes = getVotes()[election.id] || {};
    var total = Object.values(votes).reduce(function (a, b) { return a + b; }, 0);
    var voted = hasVoted(election.id);
    var myChoice = getMyChoiceFor(election.id);
    var isActive = election.status === 'active';

    var deadline = new Date(election.deadline);
    var deadlineStr = deadline.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

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
        '<p class="ec-desc">' + election.desc + '</p>' +
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
    document.getElementById('vote-modal-desc').textContent = election.desc;

    var list = document.getElementById('candidates-list');
    list.innerHTML = election.candidates.map(function (c) {
      return '<div class="candidate-option" data-cand-id="' + c.id + '">' +
        '<div class="cand-avatar" style="background:' + c.color + '">' + c.initials + '</div>' +
        '<div class="cand-info">' +
          '<div class="cand-name">' + c.name + '</div>' +
          '<div class="cand-title-text">' + c.role + '</div>' +
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
    if (!selectedCandidate || !activeElectionId) return;
    var castBtn = document.getElementById('cast-vote-btn');
    castBtn.disabled = true;
    castBtn.textContent = 'Submitting…';

    setTimeout(function () {
      /* Record vote in tallies */
      var votes = getVotes();
      if (!votes[activeElectionId]) votes[activeElectionId] = {};
      votes[activeElectionId][selectedCandidate] = (votes[activeElectionId][selectedCandidate] || 0) + 1;
      setStore(STORE.votes, votes);

      /* Record member's personal vote */
      var mv = getMyVotes();
      var key = getMemberVoteKey();
      if (!mv[key]) mv[key] = {};
      mv[key][activeElectionId] = selectedCandidate;
      setStore(STORE.myVotes, mv);

      /* Broadcast to other tabs */
      broadcastUpdate({ type: 'vote', electionId: activeElectionId });

      var election = ELECTIONS.find(function (e) { return e.id === activeElectionId; });
      var cand = election.candidates.find(function (c) { return c.id === selectedCandidate; });
      document.getElementById('success-message').textContent =
        'You voted for ' + cand.name + ' in ' + election.title + '. Your vote has been recorded.';

      closeVoteModal();
      showSuccessOverlay();
      renderAll();
    }, 900);
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

    var votes = getVotes()[electionId] || {};
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
            '<div style="font-size:0.75rem;color:var(--gray);">' + c.role + '</div>' +
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
      total.toLocaleString() + ' of ' + regForMeta + ' registered members have voted (' +
      Math.round(total / regForMeta * 100) + '% participation)';

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
     LIVE UI REFRESH — triggered when a real vote
     is cast (locally or broadcast from another tab)
  ─────────────────────────────────────────── */
  function refreshLiveUI() {
    renderStats(); /* updates total votes + avg participation */
    /* Refresh card participation bars */
    ELECTIONS.forEach(function (election) {
      var card = document.querySelector('[data-election-id="' + election.id + '"]');
      if (!card) return;
      var votes = getVotes()[election.id] || {};
      var total   = Object.values(votes).reduce(function (a, b) { return a + b; }, 0);
      var regLive = countRegisteredMembers();
      var partPct = Math.round((total / regLive) * 100);

      /* Update participation text */
      var label = card.querySelector('.ec-part-label');
      if (label) {
        var span = label.querySelector('span');
        if (span) span.textContent = total + ' of ' + regLive + ' members voted';
        var strong = label.querySelector('strong');
        if (strong) strong.textContent = partPct + '%';
      }

      /* Update bar */
      var fill = card.querySelector('.ec-part-fill');
      if (fill) fill.style.width = partPct + '%';

      /* Refresh candidate rows */
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
     BROADCAST CHANNEL (cross-tab sync)
  ─────────────────────────────────────────── */
  function initBroadcastChannel() {
    try {
      bc = new BroadcastChannel('oron_elections_live');
      bc.onmessage = function (e) {
        if (!e.data) return;
        refreshLiveUI();
        var rm = document.getElementById('results-modal');
        if (!rm.classList.contains('hidden') && activeElectionId && e.data.electionId === activeElectionId) {
          renderResultsList(activeElectionId);
          setTimeout(function () {
            document.querySelectorAll('.result-bar-fill[data-target]').forEach(function (el) {
              el.style.width = el.dataset.target + '%';
            });
          }, 60);
        }
      };
    } catch (e) { /* BroadcastChannel not supported — silent fallback */ }
  }

  function broadcastUpdate(data) {
    if (bc) { try { bc.postMessage(data); } catch (e) { } }
  }

  /* ───────────────────────────────────────────
     BOOT
  ─────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {

    initVotes(); /* seed if first visit */

    /* auth tabs removed — register is now a separate page (register.html) */

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

      var result = findMember(id, pwd);
      if (!result) {
        err.textContent = 'Member not found. Check your credentials or apply for membership.';
        err.classList.remove('hidden');
        return;
      }
      if (result.pending) {
        err.textContent = 'Your application (' + result.ref + ') is still pending endorsement. You will be notified when approved.';
        err.style.background = '#fffbeb'; err.style.border = '1px solid #fde68a'; err.style.color = '#92400e';
        err.classList.remove('hidden');
        return;
      }
      if (result.rejected) {
        err.textContent = 'Your application was not approved.' + (result.reason ? ' Reason: ' + result.reason : ' Contact info@oronunion.org for assistance.');
        err.classList.remove('hidden');
        return;
      }
      err.classList.add('hidden');
      saveSession(result.member);
      showElections();
    });

    /* ── Logout ── */
    document.getElementById('logout-btn').addEventListener('click', function () {
      clearSession();
      if (bc) { try { bc.close(); } catch (e) {} }
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
      else {
        /* Open the first election the member just voted in */
        var mv = getMyVotes();
        var key = getMemberVoteKey();
        if (mv[key]) {
          var votedId = Object.keys(mv[key])[Object.keys(mv[key]).length - 1];
          if (votedId) openResultsModal(votedId);
        }
      }
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

    /* ── Boot sequence ── */
    if (loadSession()) {
      showElections();
    } else {
      showAuthGate();
    }
  });

})();
