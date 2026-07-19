(function () {
  'use strict';

  /* ── Storage keys (local UX preference only — stream/chat state is server-side) ── */
  var STORE_NAME   = 'oron_chat_name';

  /* ── API helpers (api/stream.php) ── */
  function apiGet(action, qs) {
    return fetch('api/stream.php?action=' + action + (qs || ''), { credentials: 'same-origin' })
      .then(function (res) { return res.json(); });
  }
  function apiPost(action, body) {
    return fetch('api/stream.php?action=' + action, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
    }).then(function (res) { return res.json(); });
  }
  function authPost(action, body) {
    return fetch('api/auth.php?action=' + action, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
    }).then(function (res) { return res.json(); });
  }

  var sessionId = (function () {
    var k = 'oron_tv_session';
    var v = sessionStorage.getItem(k);
    if (!v) { v = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2); sessionStorage.setItem(k, v); }
    return v;
  })();

  var streamUrl = '';
  var isLive    = false;
  var lastLoadedUrl = null;

  /* ── Player state ── */
  var hls        = null;
  var video      = null;
  var playing    = false;
  var hideTimer  = null;

  /* ── Viewer / chat state ── */
  var viewerCount   = 0;
  var myName        = localStorage.getItem(STORE_NAME) || '';
  var chatMessages  = [];
  var lastChatId    = 0;
  var isStreamAdmin = false;

  /* ── Programme schedule (24h, repeats weekly) ── */
  var SCHEDULE = [
    { time: '06:00', title: 'Morning Devotion & Prayer',          desc: 'Spiritual upliftment for the Oron community',         live: false },
    { time: '07:00', title: 'Oron Morning News',                  desc: 'Latest news across the five LGAs',                    live: true  },
    { time: '08:30', title: 'Cultural Heritage Hour',             desc: 'Stories, folklore and traditions of the Oron people',  live: false },
    { time: '10:00', title: 'Community Business Session',         desc: 'Announcements and community affairs',                  live: true  },
    { time: '11:30', title: 'Youth Development Programme',        desc: 'Empowering the next generation of Oron leaders',       live: false },
    { time: '13:00', title: 'Midday Announcements',               desc: 'Important notices from the Executive',                 live: false },
    { time: '14:00', title: 'Oron Cuisine & Culture',             desc: 'Traditional recipes, arts and craftsmanship',          live: false },
    { time: '15:30', title: 'Children\'s Corner',                 desc: 'Educational content in the Oron language',             live: false },
    { time: '17:00', title: 'Women\'s Wing Forum',                desc: 'Discussion and updates from the Women\'s Wing',        live: true  },
    { time: '18:30', title: 'Evening News',                       desc: 'Comprehensive evening bulletin',                       live: true  },
    { time: '20:00', title: 'Town Hall Session',                  desc: 'Open forum for members and representatives',           live: true  },
    { time: '22:00', title: 'Night Vigil Broadcast',              desc: 'Closing prayers and reflections',                     live: false },
    { time: '23:59', title: 'Off Air',                            desc: '',                                                     live: false },
  ];

  /* ── Past broadcasts (VOD) ── */
  var VODS = [
    { title: 'Annual General Meeting 2025',         date: 'Jan 15, 2026',  duration: '2:34:18', views: '1,204', initials: 'AGM', color: '#800020' },
    { title: 'Centenary Celebrations Highlights',   date: 'Dec 20, 2025', duration: '1:45:22', views: '3,891', initials: 'CC',  color: '#1a4a72' },
    { title: 'Cultural Festival 2025 — Day 1',      date: 'Nov 8, 2025',  duration: '3:12:44', views: '2,150', initials: 'CF',  color: '#196F3D' },
    { title: 'Youth Development Summit',            date: 'Oct 3, 2025',  duration: '1:28:15', views: '987',   initials: 'YD',  color: '#7B3F00' },
    { title: 'Women\'s Wing Annual Conference',     date: 'Sep 12, 2025', duration: '2:05:30', views: '1,432', initials: 'WW',  color: '#6B2D8B' },
    { title: 'LGA Representatives Summit',          date: 'Aug 20, 2025', duration: '1:55:10', views: '876',   initials: 'LR',  color: '#2C3E50' },
  ];

  /* ───────────────────────────────────────────
     NAVBAR (shared with other pages)
  ─────────────────────────────────────────── */
  function initNavbar() {
    var toggle  = document.getElementById('menu-toggle');
    var navList = document.getElementById('nav-links');
    var navbar  = document.getElementById('navbar');
    if (toggle && navList) {
      toggle.addEventListener('click', function () {
        navList.classList.toggle('open');
        toggle.classList.toggle('open');
        if (navList.classList.contains('open')) navList.scrollTop = 0;
      });

      navList.querySelectorAll('li > a').forEach(function (link) {
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
        if (!navList.contains(e.target) && !toggle.contains(e.target)) {
          navList.classList.remove('open');
          toggle.classList.remove('open');
        }
      });
    }
    if (navbar) {
      window.addEventListener('scroll', function () {
        navbar.classList.toggle('scrolled', window.scrollY > 30);
      }, { passive: true });
    }
  }

  /* ───────────────────────────────────────────
     PLAYER
  ─────────────────────────────────────────── */
  function initPlayer() {
    video = document.getElementById('live-video');
    if (!video) return;

    /* Click-to-play/pause */
    var centerZone = document.getElementById('tv-center-zone');
    if (centerZone) centerZone.addEventListener('click', togglePlay);

    /* Play/pause button */
    var btnPlay = document.getElementById('btn-play');
    if (btnPlay) btnPlay.addEventListener('click', togglePlay);

    /* Mute button */
    var btnMute = document.getElementById('btn-mute');
    if (btnMute) btnMute.addEventListener('click', toggleMute);

    /* Volume slider */
    var volSlider = document.getElementById('vol-slider');
    if (volSlider) {
      volSlider.addEventListener('input', function () {
        video.volume = parseFloat(this.value);
        updateMuteIcon(video.volume === 0);
      });
    }

    /* Jump-to-live button */
    var btnLive = document.getElementById('btn-go-live');
    if (btnLive) {
      btnLive.addEventListener('click', function () {
        if (hls) hls.currentLevel = -1;
        if (video.seekable.length) video.currentTime = video.seekable.end(0);
      });
    }

    /* Fullscreen */
    var btnFs = document.getElementById('btn-fs');
    if (btnFs) {
      btnFs.addEventListener('click', function () {
        var wrap = document.getElementById('tv-player-wrap');
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          (wrap.requestFullscreen || wrap.webkitRequestFullscreen || function(){}).call(wrap);
        }
      });
    }

    /* Controls auto-hide */
    var wrap = document.getElementById('tv-player-wrap');
    if (wrap) {
      wrap.addEventListener('mousemove', showControls);
      wrap.addEventListener('touchstart', showControls, { passive: true });
    }

    /* Video events */
    video.addEventListener('play',  function () { playing = true;  updatePlayIcon(); });
    video.addEventListener('pause', function () { playing = false; updatePlayIcon(); });
  }

  function loadStream(url) {
    if (!video) return;
    lastLoadedUrl = url;
    destroyHls();

    /* Native HLS (Safari) */
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.play().catch(function () {});
      return;
    }

    /* HLS.js */
    if (typeof Hls === 'undefined' || !Hls.isSupported()) {
      showStreamError('HLS playback not supported in this browser.');
      return;
    }

    hls = new Hls({ lowLatencyMode: true, backBufferLength: 30 });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, function () {
      video.play().catch(function () {});
    });
    hls.on(Hls.Events.ERROR, function (evt, data) {
      if (data.fatal) showStreamError('Stream unavailable. Check URL or try again later.');
    });
  }

  function destroyHls() {
    if (hls) { hls.destroy(); hls = null; }
    if (video) { video.removeAttribute('src'); video.load(); }
  }

  function togglePlay() {
    if (!video) return;
    if (playing) { video.pause(); } else { video.play().catch(function(){}); }
    flashBigIcon(playing); /* show opposite — the action about to happen */
  }

  function flashBigIcon(showPause) {
    var icon = document.getElementById('tv-big-icon');
    var svg  = document.getElementById('big-play-svg');
    if (!icon || !svg) return;
    svg.innerHTML = showPause
      ? '<rect x="6" y="4" width="4" height="16" fill="white"/><rect x="14" y="4" width="4" height="16" fill="white"/>'
      : '<polygon points="5,3 19,12 5,21" fill="white"/>';
    icon.classList.remove('hidden');
    clearTimeout(flashBigIcon._t);
    flashBigIcon._t = setTimeout(function () { icon.classList.add('hidden'); }, 650);
  }

  function toggleMute() {
    if (!video) return;
    video.muted = !video.muted;
    updateMuteIcon(video.muted);
  }

  function updatePlayIcon() {
    var ip = document.getElementById('icon-play');
    var ia = document.getElementById('icon-pause');
    if (!ip || !ia) return;
    ip.classList.toggle('hidden', playing);
    ia.classList.toggle('hidden', !playing);
  }

  function updateMuteIcon(muted) {
    var iv = document.getElementById('icon-vol');
    var im = document.getElementById('icon-mute');
    if (!iv || !im) return;
    iv.classList.toggle('hidden', muted);
    im.classList.toggle('hidden', !muted);
    var slider = document.getElementById('vol-slider');
    if (slider) slider.value = muted ? 0 : (video ? video.volume : 1);
  }

  function showControls() {
    var wrap = document.getElementById('tv-player-wrap');
    if (wrap) wrap.classList.add('controls-visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (wrap) wrap.classList.remove('controls-visible');
    }, 3000);
  }

  function showStreamError(msg) {
    var offEl = document.getElementById('tv-offline');
    var nextEl = document.getElementById('tv-offline-next');
    if (offEl) offEl.classList.remove('hidden');
    if (nextEl) nextEl.innerHTML = '<strong style="color:#ff6b6b">' + msg + '</strong>';
  }

  /* ── Show / hide offline screen ── */
  function setLiveState(live) {
    var offEl = document.getElementById('tv-offline');
    if (!offEl) return;
    if (live && streamUrl) {
      offEl.classList.add('hidden');
      if (streamUrl !== lastLoadedUrl) loadStream(streamUrl);
    } else {
      lastLoadedUrl = null;
      destroyHls();
      offEl.classList.remove('hidden');
    }
  }

  /* ───────────────────────────────────────────
     SHARED STREAM STATE (polled from api/stream.php)
  ─────────────────────────────────────────── */
  function pollStreamStatus() {
    apiGet('status').then(function (res) {
      if (!res.ok) return;
      streamUrl = res.url || '';
      isLive = !!res.isLive && !!streamUrl;
      viewerCount = res.viewerCount || 0;
      updateViewerDisplay();
      var nowLabel = document.getElementById('tv-now-label');
      if (nowLabel && res.title) nowLabel.textContent = res.title;
      setLiveState(isLive);
    });
  }

  function sendHeartbeat() {
    apiPost('heartbeat', { sessionId: sessionId }).then(function (res) {
      if (res.ok) { viewerCount = res.viewerCount || 0; updateViewerDisplay(); }
    });
  }

  /* ───────────────────────────────────────────
     SCHEDULE
  ─────────────────────────────────────────── */
  function toMins(timeStr) {
    var parts = timeStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  function currentProgramme() {
    var now  = new Date();
    var mins = now.getHours() * 60 + now.getMinutes();
    for (var i = 0; i < SCHEDULE.length - 1; i++) {
      var s = toMins(SCHEDULE[i].time);
      var e = toMins(SCHEDULE[i + 1].time);
      if (mins >= s && mins < e) return i;
    }
    return 0;
  }

  function fmt12(timeStr) {
    var parts = timeStr.split(':');
    var h = parseInt(parts[0], 10);
    var m = parts[1];
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + m + ' ' + ampm;
  }

  function renderSchedule() {
    var list    = document.getElementById('schedule-list');
    var dateEl  = document.getElementById('schedule-date');
    if (!list) return;

    var now     = new Date();
    var nowMins = now.getHours() * 60 + now.getMinutes();
    var curIdx  = currentProgramme();

    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    list.innerHTML = SCHEDULE.slice(0, -1).map(function (item, i) {
      var start  = toMins(item.time);
      var end    = toMins(SCHEDULE[i + 1].time);
      var isnow  = (i === curIdx);
      var done   = (nowMins > end);
      var badge  = isnow ? '<span class="sched-badge live-badge-sm">On Air</span>'
                 : done  ? '<span class="sched-badge done-badge">Done</span>'
                 : '<span class="sched-badge upcoming-badge">Upcoming</span>';
      return '<div class="sched-item' + (isnow ? ' now' : '') + (done ? ' past' : '') + '">' +
        '<div class="sched-time">' + fmt12(item.time) + '</div>' +
        '<div class="sched-info">' +
          '<div class="sched-title">' + item.title + '</div>' +
          (item.desc ? '<div class="sched-desc">' + item.desc + '</div>' : '') +
        '</div>' +
        badge +
      '</div>';
    }).join('');

    /* Update on-air banner */
    var cur = SCHEDULE[curIdx];
    var titleEl = document.getElementById('on-air-title');
    var descEl  = document.getElementById('on-air-desc');
    var nowLabel = document.getElementById('tv-now-label');
    if (titleEl && cur)  titleEl.textContent = cur.title;
    if (descEl  && cur)  descEl.textContent  = cur.desc || 'Oron Union TV';
    if (nowLabel && cur) nowLabel.textContent = cur.title;

    /* Update offline next-up */
    var nextIdx   = (curIdx + 1) % (SCHEDULE.length - 1);
    var offNextEl = document.getElementById('tv-offline-next');
    if (offNextEl) {
      offNextEl.innerHTML = 'Next: <strong>' + SCHEDULE[nextIdx].title + '</strong> at ' + fmt12(SCHEDULE[nextIdx].time);
    }
  }

  /* ───────────────────────────────────────────
     VOD GRID
  ─────────────────────────────────────────── */
  function renderVOD() {
    var grid = document.getElementById('vod-grid');
    if (!grid) return;
    grid.innerHTML = VODS.map(function (v) {
      return '<div class="vod-card">' +
        '<div class="vod-thumb" style="background:' + v.color + '">' +
          v.initials +
          '<div class="vod-play-btn">' +
            '<svg viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>' +
          '</div>' +
          '<span class="vod-duration">' + v.duration + '</span>' +
        '</div>' +
        '<div class="vod-info">' +
          '<div class="vod-title">' + v.title + '</div>' +
          '<div class="vod-meta">' +
            '<span>' + v.date + '</span>' +
            '<span class="vod-dot">·</span>' +
            '<span>' + v.views + ' views</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ───────────────────────────────────────────
     VIEWER COUNT — real heartbeat, not simulated
  ─────────────────────────────────────────── */
  function initViewers() {
    sendHeartbeat();
    setInterval(sendHeartbeat, 20000);
  }

  function updateViewerDisplay() {
    var el1 = document.getElementById('viewer-count');
    var el2 = document.getElementById('chat-viewer-count');
    if (el1) el1.textContent = viewerCount.toLocaleString();
    if (el2) el2.textContent = viewerCount.toLocaleString();
  }

  /* ───────────────────────────────────────────
     LIVE CHAT — real, shared across all visitors (polled)
  ─────────────────────────────────────────── */
  function initChat() {
    /* Restore name */
    var nameInput = document.getElementById('chat-name-input');
    if (nameInput && myName) nameInput.value = myName;
    if (nameInput) {
      nameInput.addEventListener('input', function () {
        myName = this.value.trim();
        localStorage.setItem(STORE_NAME, myName);
      });
    }

    /* Send button */
    var sendBtn = document.getElementById('chat-send-btn');
    var msgInput = document.getElementById('chat-msg-input');
    if (sendBtn)  sendBtn.addEventListener('click', sendChat);
    if (msgInput) msgInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });

    pollChat();
    setInterval(pollChat, 4000);
  }

  function pollChat() {
    apiGet('chat_list', lastChatId ? '&afterId=' + lastChatId : '').then(function (res) {
      if (!res.ok || !res.messages || !res.messages.length) return;
      res.messages.forEach(function (m) {
        chatMessages.push(m);
        if (m.id > lastChatId) lastChatId = m.id;
      });
      if (chatMessages.length > 100) chatMessages = chatMessages.slice(-100);
      renderMessages();
    });
  }

  function sendChat() {
    var msgInput  = document.getElementById('chat-msg-input');
    var nameInput = document.getElementById('chat-name-input');
    if (!msgInput) return;

    var text = msgInput.value.trim();
    if (!text) return;

    var name = (nameInput && nameInput.value.trim()) || 'Anonymous';
    myName = name;
    localStorage.setItem(STORE_NAME, myName);

    msgInput.value = '';
    apiPost('chat_send', { name: name, message: text }).then(function (res) {
      if (res.ok) pollChat();
    });
  }

  function renderMessages() {
    var container = document.getElementById('chat-messages');
    if (!container) return;

    var last60 = chatMessages.slice(-60);
    var wasAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 40;

    container.innerHTML = last60.map(function (m) {
      var timeStr = new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      var isMe = m.name === myName;
      return '<div class="chat-msg' + (isMe ? ' is-me' : '') + '">' +
        '<div class="chat-msg-header">' +
          '<span class="chat-msg-name' + (isMe ? ' is-me' : '') + '">' + escHtml(m.name) + '</span>' +
          '<span class="chat-msg-time">' + timeStr + '</span>' +
        '</div>' +
        '<div class="chat-msg-text">' + escHtml(m.message) + '</div>' +
      '</div>';
    }).join('');

    if (wasAtBottom) container.scrollTop = container.scrollHeight;
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ───────────────────────────────────────────
     STREAM CONFIG MODAL — admin-gated, writes to the shared backend
  ─────────────────────────────────────────── */
  function initConfigModal() {
    var adminBtn   = document.getElementById('tv-admin-btn');
    var modal      = document.getElementById('stream-config-modal');
    var closeBtn   = document.getElementById('stream-config-close');
    var urlInput   = document.getElementById('stream-url-input');
    var goBtn      = document.getElementById('sc-go-btn');
    var offBtn     = document.getElementById('sc-offline-btn');
    var status     = document.getElementById('sc-status');
    var codeRow    = document.getElementById('sc-code-row');
    var codeInput  = document.getElementById('sc-code-input');
    var unlockBtn  = document.getElementById('sc-unlock-btn');
    var controlsEl = document.getElementById('sc-controls');

    if (!adminBtn || !modal) return;

    adminBtn.addEventListener('click', function () {
      if (urlInput) urlInput.value = streamUrl || '';
      if (status)  status.textContent = '';
      if (!isStreamAdmin && codeRow) { codeRow.classList.remove('hidden'); if (controlsEl) controlsEl.classList.add('hidden'); }
      modal.classList.remove('hidden');
    });
    if (closeBtn) closeBtn.addEventListener('click', function () { modal.classList.add('hidden'); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.add('hidden'); });

    if (unlockBtn) {
      unlockBtn.addEventListener('click', function () {
        var code = (codeInput && codeInput.value) || '';
        authPost('admin_login', { code: code }).then(function (res) {
          if (!res.ok) { if (status) { status.textContent = 'Invalid admin code.'; status.className = 'sc-status err'; } return; }
          isStreamAdmin = true;
          if (codeRow) codeRow.classList.add('hidden');
          if (controlsEl) controlsEl.classList.remove('hidden');
          if (status) status.textContent = '';
        });
      });
    }

    if (goBtn) {
      goBtn.addEventListener('click', function () {
        var url = (urlInput && urlInput.value.trim()) || '';
        if (!url) { if (status) { status.textContent = 'Enter a stream URL first.'; status.className = 'sc-status err'; } return; }
        if (status) { status.textContent = 'Going live…'; status.className = 'sc-status ok'; }
        apiPost('set', { url: url, isLive: true }).then(function (res) {
          if (!res.ok) { if (status) { status.textContent = res.error || 'Could not go live.'; status.className = 'sc-status err'; } return; }
          modal.classList.add('hidden');
          pollStreamStatus();
        });
      });
    }

    if (offBtn) {
      offBtn.addEventListener('click', function () {
        apiPost('set', { url: streamUrl, isLive: false }).then(function (res) {
          modal.classList.add('hidden');
          if (res.ok) pollStreamStatus();
        });
      });
    }
  }

  /* ───────────────────────────────────────────
     BOOT
  ─────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    initNavbar();
    initPlayer();
    renderSchedule();
    renderVOD();
    initChat();
    initViewers();
    initConfigModal();

    /* Refresh schedule every minute */
    setInterval(renderSchedule, 60000);

    /* Load shared stream state and keep it in sync */
    pollStreamStatus();
    setInterval(pollStreamStatus, 12000);
  });

})();
