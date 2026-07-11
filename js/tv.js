(function () {
  'use strict';

  /* ── Storage / channel keys ── */
  var STORE_URL    = 'oron_stream_url';
  var STORE_LIVE   = 'oron_stream_live';
  var STORE_CHAT   = 'oron_tv_chat';
  var STORE_NAME   = 'oron_chat_name';

  /* ── Default demo HLS stream (Big Buck Bunny via Mux test CDN) ── */
  var DEMO_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

  var streamUrl = localStorage.getItem(STORE_URL) || DEMO_URL;
  var isLive    = localStorage.getItem(STORE_LIVE) !== 'false';

  /* ── Player state ── */
  var hls        = null;
  var video      = null;
  var playing    = false;
  var hideTimer  = null;

  /* ── Viewer / chat state ── */
  var viewerCount   = 0;
  var chatChannel   = null;
  var myName        = localStorage.getItem(STORE_NAME) || '';
  var chatMessages  = [];

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

  /* ── Simulated chat participants ── */
  var BOT_POOL = [
    { name: 'Nkemdirim Okon',   msgs: ['Watching from Abuja! 🎉', 'God bless Oron Union', 'This is wonderful'] },
    { name: 'Ita Effiong',      msgs: ['Greetings from Lagos', 'Excellent broadcast as always', 'Well done to the team'] },
    { name: 'Arit Bassey',      msgs: ['Live from Port Harcourt 🙏', 'We are proud of our union', 'Long live Oron!'] },
    { name: 'Engr. Sunday Eyo', msgs: ['Great initiative by the Executive', 'Technical quality is top notch', 'Kudos to the media team'] },
    { name: 'Dr. Nkeme Inyang', msgs: ['History being made here', 'Oron Union rising! 💪', 'Watching from London'] },
    { name: 'Ibiere Udofia',    msgs: ['The Women\'s Wing sends greetings', 'This is progress', 'Wonderful to be part of this'] },
    { name: 'Chief E. Edet',    msgs: ['Oron kwanu!', 'Our heritage is our strength', 'Watching from Okobo'] },
    { name: 'Obong Akpan',      msgs: ['First time watching — amazing!', 'Sharing this stream with my people', 'God bless Oron land'] },
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
    if (live) {
      offEl.classList.add('hidden');
      loadStream(streamUrl);
    } else {
      destroyHls();
      offEl.classList.remove('hidden');
    }
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
     VIEWER COUNT SIMULATION
  ─────────────────────────────────────────── */
  function initViewers() {
    viewerCount = 148 + Math.floor(Math.random() * 120);
    updateViewerDisplay();

    setInterval(function () {
      var delta = Math.floor(Math.random() * 7) - 2;
      viewerCount = Math.max(50, viewerCount + delta);
      updateViewerDisplay();
    }, 8000);
  }

  function updateViewerDisplay() {
    var el1 = document.getElementById('viewer-count');
    var el2 = document.getElementById('chat-viewer-count');
    if (el1) el1.textContent = viewerCount.toLocaleString();
    if (el2) el2.textContent = viewerCount.toLocaleString();
  }

  /* ───────────────────────────────────────────
     LIVE CHAT
  ─────────────────────────────────────────── */
  function initChat() {
    /* Load history */
    try { chatMessages = JSON.parse(localStorage.getItem(STORE_CHAT) || '[]'); } catch(e) { chatMessages = []; }
    if (chatMessages.length > 80) chatMessages = chatMessages.slice(-80);

    /* BroadcastChannel for cross-tab sync */
    try {
      chatChannel = new BroadcastChannel('oron_tv_chat');
      chatChannel.onmessage = function (e) {
        if (e.data && e.data.type === 'msg') {
          chatMessages.push(e.data.msg);
          renderMessages();
        }
      };
    } catch(e) {}

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

    /* Seed with a welcome message and recent bot activity */
    if (chatMessages.length === 0) {
      addSystemMsg('Welcome to Oron Union TV Live Chat! 👋');
    }

    renderMessages();
    startBotChat();
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

    var msg = { name: name, text: text, time: Date.now(), isMe: true };
    chatMessages.push(msg);
    saveChat();
    renderMessages();
    if (chatChannel) chatChannel.postMessage({ type: 'msg', msg: msg });

    msgInput.value = '';
  }

  function addBotMsg(name, text) {
    var msg = { name: name, text: text, time: Date.now(), isBot: true };
    chatMessages.push(msg);
    saveChat();
    renderMessages();
    if (chatChannel) chatChannel.postMessage({ type: 'msg', msg: msg });
  }

  function addSystemMsg(text) {
    chatMessages.push({ system: true, text: text, time: Date.now() });
    renderMessages();
  }

  function renderMessages() {
    var container = document.getElementById('chat-messages');
    if (!container) return;

    var last60 = chatMessages.slice(-60);
    container.innerHTML = last60.map(function (m) {
      if (m.system) return '<div class="chat-msg-system">' + escHtml(m.text) + '</div>';
      var timeStr = new Date(m.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      var nameClass = m.isMe ? 'is-me' : m.isBot ? 'is-bot' : '';
      return '<div class="chat-msg' + (m.isMe ? ' is-me' : '') + '">' +
        '<div class="chat-msg-header">' +
          '<span class="chat-msg-name ' + nameClass + '">' + escHtml(m.name) + '</span>' +
          '<span class="chat-msg-time">' + timeStr + '</span>' +
        '</div>' +
        '<div class="chat-msg-text">' + escHtml(m.text) + '</div>' +
      '</div>';
    }).join('');

    container.scrollTop = container.scrollHeight;
  }

  function saveChat() {
    if (chatMessages.length > 100) chatMessages = chatMessages.slice(-100);
    try { localStorage.setItem(STORE_CHAT, JSON.stringify(chatMessages)); } catch(e) {}
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function startBotChat() {
    function drop() {
      var bot  = BOT_POOL[Math.floor(Math.random() * BOT_POOL.length)];
      var text = bot.msgs[Math.floor(Math.random() * bot.msgs.length)];
      addBotMsg(bot.name, text);
      setTimeout(drop, 12000 + Math.random() * 18000);
    }
    /* Initial burst to seed chat */
    var delays = [1200, 3800, 7500, 11000, 15000];
    delays.forEach(function (d) {
      setTimeout(function () {
        var bot  = BOT_POOL[Math.floor(Math.random() * BOT_POOL.length)];
        var text = bot.msgs[Math.floor(Math.random() * bot.msgs.length)];
        addBotMsg(bot.name, text);
      }, d);
    });
    setTimeout(drop, 20000);
  }

  /* ───────────────────────────────────────────
     STREAM CONFIG MODAL
  ─────────────────────────────────────────── */
  function initConfigModal() {
    var adminBtn  = document.getElementById('tv-admin-btn');
    var modal     = document.getElementById('stream-config-modal');
    var closeBtn  = document.getElementById('stream-config-close');
    var urlInput  = document.getElementById('stream-url-input');
    var goBtn     = document.getElementById('sc-go-btn');
    var offBtn    = document.getElementById('sc-offline-btn');
    var status    = document.getElementById('sc-status');

    if (!adminBtn || !modal) return;

    adminBtn.addEventListener('click', function () {
      if (urlInput) urlInput.value = streamUrl !== DEMO_URL ? streamUrl : '';
      if (status)  status.textContent = '';
      modal.classList.remove('hidden');
    });
    if (closeBtn) closeBtn.addEventListener('click', function () { modal.classList.add('hidden'); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.classList.add('hidden'); });

    if (goBtn) {
      goBtn.addEventListener('click', function () {
        var url = (urlInput && urlInput.value.trim()) || DEMO_URL;
        if (url && !url.match(/\.m3u8(\?|$)/i) && url !== DEMO_URL) {
          if (status) { status.textContent = 'URL should end in .m3u8'; status.className = 'sc-status err'; }
          return;
        }
        streamUrl = url;
        localStorage.setItem(STORE_URL, url);
        localStorage.setItem(STORE_LIVE, 'true');
        isLive = true;
        if (status) { status.textContent = 'Going live…'; status.className = 'sc-status ok'; }
        setTimeout(function () {
          modal.classList.add('hidden');
          setLiveState(true);
        }, 600);
      });
    }

    if (offBtn) {
      offBtn.addEventListener('click', function () {
        localStorage.setItem(STORE_LIVE, 'false');
        isLive = false;
        modal.classList.add('hidden');
        setLiveState(false);
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

    /* Start stream or show offline */
    setLiveState(isLive);
  });

})();
