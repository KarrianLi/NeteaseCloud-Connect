(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var ICON = {
    play: '<path d="M8 5.2v13.6l11-6.8z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6.6" y="5" width="3.6" height="14" rx="1.3" fill="currentColor" stroke="none"/><rect x="13.8" y="5" width="3.6" height="14" rx="1.3" fill="currentColor" stroke="none"/>',
    prev: '<path d="M18.5 5.6v12.8L9 12z" fill="currentColor" stroke="none"/><rect x="5.2" y="5" width="2.4" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
    next: '<path d="M5.5 5.6v12.8L15 12z" fill="currentColor" stroke="none"/><rect x="16.4" y="5" width="2.4" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
    search: '<circle cx="11" cy="11" r="6.2"/><path d="M15.6 15.6 20 20"/>',
    back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    down: '<path d="M6 9.5 12 15.5 18 9.5"/>',
    list: '<path d="M4 6.5h11M4 12h11M4 17.5h7"/><circle cx="19" cy="6.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    order: '<path d="M4 7h10M4 12h10M4 17h10"/><path d="M17 6.5 20 9l-3 2.5"/>',
    cycle: '<path d="M5 12a7 7 0 0 1 11.6-5.3L19 9"/><path d="M19 12a7 7 0 0 1-11.6 5.3L5 15"/><path d="M19 5.6V9h-3.4"/><path d="M5 18.4V15h3.4"/>',
    single: '<path d="M5 12a7 7 0 0 1 11.6-5.3L19 9"/><path d="M19 5.6V9h-3.4"/><path d="M10.4 9.8 12.4 9v6"/><path d="M5 15.6h4"/>',
    random: '<path d="M4 7h3.2l3 5"/><path d="M4 17h3.2l8.2-10H20"/><path d="M4 12h2.4"/><path d="M15 7h5"/><path d="M17.4 4.6 20 7l-2.6 2.4"/><path d="M17.4 14.6 20 17l-2.6 2.4"/><path d="M4 17h3.2l2.4-3"/>',
    vol: '<path d="M5 9.5h3L12 6v12l-4-3.5H5z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.4 7"/><path d="M14 10a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7L13 17"/>',
    music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="16.5" cy="16" r="2.6"/>',
    lyric: '<path d="M4 7h16M4 11.6h11.5M4 16.2h8"/><circle cx="18.4" cy="15.6" r="2.1" fill="currentColor" stroke="none"/>',
    heart: '<path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 7.6 4 4 0 0 1 19 10.8C19 15.6 12 20 12 20z"/>'
  };

  function icon(name, size) {
    var s = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICON[name] + '</svg>';
  }

  var MODES = [
    { id: "playOrder", name: "顺序播放", ic: "order" },
    { id: "playCycle", name: "列表循环", ic: "cycle" },
    { id: "playOneCycle", name: "单曲循环", ic: "single" },
    { id: "playRandom", name: "随机播放", ic: "random" }
  ];

  var installEvent = null;
var S = {
    conn: false, st: 0, mode: "", vol: 0.6, track: null, pos: 0, dur: 0,
    qlen: 0, qsig: "", href: "", text: "", nick: "", busy: "",
    syncAt: 0, view: "home", playlistId: null, playlist: null,
    dragging: false, dragVal: 0, queue: null, ws: null, err: "",
    lyricOn: false, lyricId: "", lyricLines: [], lyricIdx: -1, lyricLoading: false, lyricFetched: false, lyricErr: "",
    lyricOffset: 0
  };

  /* global lyric offset (seconds): + later, - earlier; persisted across songs */
  try {
    var _lo = parseFloat(localStorage.getItem("mr.lyricOffset"));
    if (isFinite(_lo)) S.lyricOffset = Math.max(-10, Math.min(10, Math.round(_lo * 10) / 10));
  } catch (e) {}

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" + s : s);
  }
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }
  function api(path, body) {
    var opt = { headers: { "Content-Type": "application/json" } };
    if (body) { opt.method = "POST"; opt.body = JSON.stringify(body); }
    return fetch(path, opt).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j && j.error ? j.error : ("HTTP " + r.status));
        return j;
      });
    });
  }
  function modeInfo(id) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === id) return MODES[i];
    return MODES[0];
  }

  /* ---------- connection ---------- */
  function connect() {
    var proto = location.protocol === "https:" ? "wss" : "ws";
    var ws = new WebSocket(proto + "://" + location.host + "/ws");
    S.ws = ws;
    ws.onmessage = function (e) {
      var d;
      try { d = JSON.parse(e.data); } catch (err) { return; }
      if (d.type !== "state") return;
      applyRemote(d);
    };
    ws.onclose = function () { setConn(false); setTimeout(connect, 1200); };
    ws.onerror = function () {};
  }

  function applyRemote(d) {
    var prevId = S.track ? String(S.track.id) : "";
    S.conn = !!d.connected;
    S.err = d.err || "";
    S.st = d.st; S.mode = d.mode || S.mode; S.vol = d.vol;
    S.track = d.track; S.dur = d.dur || 0; S.pos = d.pos || 0;
    S.qlen = d.qlen || 0; S.qsig = d.qsig || ""; S.href = d.href || ""; S.text = d.text || "";
    S.nick = d.nick || S.nick; S.syncAt = Date.now();
    var busy = d.busy || "";
    if (busy !== S.busy) { S.busy = busy; renderBusy(); }
    setConn(S.conn);
    var newId = S.track ? String(S.track.id) : "";
    if (newId !== prevId) {
      S.pos = d.pos || 0; S.syncAt = Date.now();
      S.lyricId = ""; S.lyricFetched = false; S.lyricLoading = false;
      S.lyricLines = []; S.lyricIdx = -1; S.lyricErr = "";
      renderPlayer(); renderMini();
      if (S.view === "playlist") markPlaying();
    }
    renderMini();
    renderTransport();
    renderProgress();
  }

  function setConn(on) {
    var dot = $("dot");
    dot.className = "dot " + (on ? "on" : "off");
    dot.title = on ? "已连接电脑客户端" : (S.err || "未连接");
  }

  function curPos() {
    if (S.dragging) return S.dragVal;
    if (S.st !== 2) return S.pos;
    return Math.min(S.dur || 1e9, S.pos + (Date.now() - S.syncAt) / 1000);
  }

  /* ---------- render ---------- */
  function renderBusy() {
    var b = $("busy");
    if (S.busy) { b.hidden = false; $("busyText").textContent = S.busy; } else { b.hidden = true; }
  }

  function renderMini() {
    var mini = $("mini");
    if (!S.track) { mini.hidden = true; return; }
    mini.hidden = false;
    $("miniName").textContent = S.track.name || "—";
    $("miniAr").textContent = (S.track.artists || "") + (S.track.album ? " · " + S.track.album : "");
    var c = $("miniCover");
    if (S.track.cover) c.src = coverOf(S.track.cover); else c.removeAttribute("src");
    $("miniPlay").innerHTML = icon(S.st === 2 ? "pause" : "play", 16);
  }

  function coverOf(u) {
    if (!u) return "/icon.svg";
    return "/api/img?u=" + encodeURIComponent(String(u).replace(/^http:\/\//, "https://"));
  }

  function renderTransport() {
    $("btnPlay").innerHTML = icon(S.st === 2 ? "pause" : "play", 26);
    $("btnPlay").className = "ctrl main-ctrl" + (S.st === 2 ? " playing" : "");
    $("miniPlay").innerHTML = icon(S.st === 2 ? "pause" : "play", 16);
  }

  function renderProgress() {
    if ($("player").hidden) return;
    var d = S.dur || 0;
    var p = curPos();
    $("tCur").textContent = fmt(p);
    $("tDur").textContent = fmt(d);
    if (!S.dragging) {
      var pct = d > 0 ? Math.max(0, Math.min(100, p / d * 100)) : 0;
      var el = $("seek");
      el.value = String(Math.round(pct * 10));
      el.style.setProperty("--p", pct.toFixed(1) + "%");
    }
    tickLyric(false);
  }

  function renderPlayer() {
    var t = S.track;
    $("pName").textContent = t ? (t.name || "—") : "未在播放";
    $("pAr").textContent = t ? ((t.artists || "") + (t.album ? " · " + t.album : "")) : "在电脑上随便放首歌试试";
    $("playerSrc").textContent = S.text ? ("来自 " + S.text) : (S.href ? "正在播放" : "正在播放");
    var bg = $("playerBg");
    var cover = t && t.cover ? coverOf(t.cover) : "";
    if (cover) {
      $("bigCover").src = cover;
      bg.style.backgroundImage = "url(" + cover + ")";
    }
    var lastMode = modeInfo(S.mode);
    $("modeBtn").innerHTML = icon(lastMode.ic, 20);
    $("modeBtn").className = "mode-btn" + (S.mode === "playOrder" ? "" : " on");
    var vp = Math.round((S.vol || 0) * 100);
    $("vol").value = String(vp);
    $("vol").style.setProperty("--p", vp + "%");
    $("volNum").textContent = vp + "%";
    renderTransport();
    renderProgress();
    if (S.lyricOn) loadLyric();
  }

  function markPlaying() {
    var rows = document.querySelectorAll(".track");
    for (var i = 0; i < rows.length; i++) {
      var on = S.track && rows[i].getAttribute("data-id") === String(S.track.id);
      rows[i].classList.toggle("on", !!on);
      var idx = rows[i].querySelector(".idx");
      if (idx) idx.innerHTML = on ? '<span style="color:#ff3b4e">♪</span>' : String(i + 1);
    }
  }

  /* ---------- views ---------- */
  function showHome() {
    S.view = "home";
    $("main").innerHTML = '<div class="empty">加载中…</div>';
    api("/api/home").then(function (d) {
      S.nick = d.nick || S.nick;
      var liked = null, rest = [];
      (d.playlists || []).forEach(function (p) {
        if (p.special) liked = p; else rest.push(p);
      });
      var h = "";
      h += '<div class="section-title"><h2>' + (S.nick ? esc(S.nick) : "我的音乐") + '</h2><span>' + (rest.length + (liked ? 1 : 0)) + ' 个歌单</span></div>';
      if (liked) {
        h += '<div class="row-card" data-pl="' + esc(liked.id) + '">' +
          '<div class="ic">' + icon("heart", 22) + '</div>' +
          '<div class="txt"><b>' + esc(liked.name) + '</b><small>' + ((liked.count || 0) ? (liked.count + ' 首 · 我喜欢的音乐') : '我喜欢的音乐') + '</small></div>' +
          '<div class="ghost">' + icon("play", 16) + '</div></div>';
      }
      h += '<div class="grid">';
      rest.forEach(function (p) {
        h += '<div class="card" data-pl="' + esc(p.id) + '">' +
          '<div class="art"><img loading="lazy" src="' + esc(p.cover) + '" alt="">' +
          '<button class="c-play" data-play="' + esc(p.id) + '">' + icon("play", 14) + '</button></div>' +
          '<div class="name">' + esc(p.name) + '</div>' +
          '<div class="meta">' + (p.count || 0) + ' 首</div></div>';
      });
      if (!rest.length && !liked) h += '<div class="empty">没有读到歌单，确认电脑端已登录网易云。</div>';
      h += '</div>';
      $("main").innerHTML = h;
      $("main").scrollTop = 0;
      bindHome();
    }).catch(function (e) {
      $("main").innerHTML = '<div class="empty">读取歌单失败<br>' + esc(e.message) + '</div>';
    });
  }

  function bindHome() {
    var main = $("main");
    main.querySelectorAll("[data-pl]").forEach(function (el) {
      el.addEventListener("click", function (ev) {
        var play = ev.target.closest("[data-play]");
        var id = el.getAttribute("data-pl");
        if (play) { ev.stopPropagation(); playPlaylist(id); return; }
        showPlaylist(id);
      });
    });
  }

  function playPlaylist(id) {
    S.busy = "正在打开歌单…"; renderBusy();
    api("/api/play/playlist", { id: id }).then(function () {
      S.busy = ""; renderBusy();
      toast("开始播放");
      openPlayer();
    }).catch(function (e) {
      S.busy = ""; renderBusy(); toast("播放失败：" + e.message);
    });
  }

  function showPlaylist(id) {
    S.view = "playlist"; S.playlistId = id;
    $("main").innerHTML = '<div class="empty">加载中…</div>';
    $("main").scrollTop = 0;
    api("/api/playlist?id=" + encodeURIComponent(id)).then(function (d) {
      S.playlist = d;
      var h = "";
      h += '<div class="pl-head"><div class="pl-bg" style="background-image:url(' + esc(d.cover) + ')"></div>';
      h += '<div class="pl-top"><button class="back" id="plBack">' + icon("back", 20) + '</button><div class="ttl">' + esc(d.name) + '</div></div>';
      h += '<div class="pl-body"><img class="pl-cover" src="' + esc(d.cover) + '" alt="">';
      h += '<div class="pl-meta"><h2>' + esc(d.name) + '</h2><div class="sub">' + (d.count || d.tracks.length) + ' 首歌曲</div>';
      if (d.tracks.length) {
        h += '<div class="pl-actions"><button class="btn-play" id="plPlay">' + icon("play", 14) + '播放全部</button>' +
          '<div class="btn-ghost">' + icon("list", 15) + '列表</div></div></div></div></div>';
      } else {
        h += '</div></div></div>';
      }
      if (!d.tracks.length) h += '<div class="empty">这个歌单还没有歌曲</div>';
      h += '<div class="tracks">';
      d.tracks.forEach(function (t, i) {
        h += '<div class="track" data-id="' + esc(t.id) + '" data-i="' + i + '">' +
          '<div class="idx">' + (i + 1) + '</div>' +
          '<div class="info"><div class="n">' + esc(t.name) + (t.fee === 1 ? '<span class="tag">VIP</span>' : '') + '</div>' +
          '<div class="a">' + esc(t.ar) + '</div></div>' +
          '<div class="d">' + fmt(t.dt) + '</div></div>';
      });
      h += '</div>';
      $("main").innerHTML = h;
      $("plBack").addEventListener("click", showHome);
      if ($("plPlay")) $("plPlay").addEventListener("click", function () { playPlaylist(id); });
      $("main").querySelectorAll(".track").forEach(function (row) {
        row.addEventListener("click", function () {
          var tid = row.getAttribute("data-id");
          if (S.track && String(S.track.id) === tid) { api("/api/control", { action: "toggle" }); return; }
          S.busy = "正在切歌…"; renderBusy();
          api("/api/play/track", { playlistId: id, trackId: tid }).then(function () {
            S.busy = ""; renderBusy(); openPlayer(); markPlaying();
          }).catch(function (e) { S.busy = ""; renderBusy(); toast("切歌失败：" + e.message); });
        });
      });
      markPlaying();
    }).catch(function (e) {
      $("main").innerHTML = '<div class="empty">读取歌单失败<br>' + esc(e.message) + '</div>';
    });
  }

  function showSearch() {
    S.view = "search";
    $("main").innerHTML = '<div class="pl-top"><button class="back" id="sBack">' + icon("back", 20) + '</button><div class="ttl">搜索</div></div>' +
      '<div class="search-bar">' + icon("search", 17) + '<input id="sInput" placeholder="搜索歌曲 / 歌手" autocomplete="off"></div>' +
      '<div id="sResult"></div>';
    $("sBack").addEventListener("click", showHome);
    var inp = $("sInput");
    inp.focus();
    var timer = null;
    inp.addEventListener("input", function () {
      clearTimeout(timer);
      var q = inp.value.trim();
      if (!q) { $("sResult").innerHTML = ""; return; }
      timer = setTimeout(function () { doSearch(q); }, 320);
    });
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { clearTimeout(timer); doSearch(inp.value.trim()); } });
  }

  function doSearch(q) {
    if (!q) return;
    $("sResult").innerHTML = '<div class="empty">搜索中…</div>';
    api("/api/search?q=" + encodeURIComponent(q)).then(function (d) {
      var h = '<div class="tracks">';
      if (!d.songs.length) h += '<div class="empty">没有结果</div>';
      d.songs.forEach(function (s, i) {
        h += '<div class="track" data-id="' + esc(s.id) + '"><div class="idx">' + (i + 1) + '</div>' +
          '<div class="info"><div class="n">' + esc(s.name) + (s.fee === 1 ? '<span class="tag">VIP</span>' : '') + '</div>' +
          '<div class="a">' + esc(s.ar) + (s.album ? ' · ' + esc(s.album) : '') + '</div></div>' +
          '<div class="d">' + fmt(s.dt) + '</div></div>';
      });
      h += '</div>';
      $("sResult").innerHTML = h;
      $("sResult").querySelectorAll(".track").forEach(function (row) {
        row.addEventListener("click", function () {
          S.busy = "正在点播…"; renderBusy();
          api("/api/play/song", { id: row.getAttribute("data-id") }).then(function () {
            S.busy = ""; renderBusy(); toast("已点播"); openPlayer();
          }).catch(function (e) { S.busy = ""; renderBusy(); toast("点播失败：" + e.message); });
        });
      });
    }).catch(function (e) { $("sResult").innerHTML = '<div class="empty">搜索失败<br>' + esc(e.message) + '</div>'; });
  }

  /* ---------- player sheet ---------- */
  function openPlayer() {
    $("player").hidden = false;
    renderPlayer();
    if (S.lyricOn) tickLyric(true);
  }
  function closePlayer() { $("player").hidden = true; }

  /* ---------- 歌词 ---------- */
  function setLyricMode(on) {
    S.lyricOn = !!on;
    $("playerArt").hidden = S.lyricOn;
    $("lyrics").hidden = !S.lyricOn;
    $("lyOffset").hidden = !S.lyricOn;
    $("playerLyric").classList.toggle("on", S.lyricOn);
    if (!S.lyricOn) return;
    updateLyricOffsetUI();
    if (!S.lyricLines.length) loadLyric();
    else { renderLyrics(); tickLyric(true); }
  }
  function updateLyricOffsetUI() {
    var v = $("lyVal"), bar = $("lyOffset");
    if (!v) return;
    v.textContent = (S.lyricOffset > 0 ? "+" : "") + S.lyricOffset.toFixed(1) + "s";
    v.classList.toggle("adj", Math.abs(S.lyricOffset) > 0.001);
    if (bar && !bar.hidden) bar.title = "歌词偏移 " + v.textContent;
  }
  function adjustLyricOffset(delta) {
    var next = Math.round((S.lyricOffset + delta) * 10) / 10;
    next = Math.max(-10, Math.min(10, next));
    if (next === S.lyricOffset) return;
    S.lyricOffset = next;
    try { localStorage.setItem("mr.lyricOffset", String(next)); } catch (e) {}
    updateLyricOffsetUI();
    tickLyric(true);
  }
  function loadLyric() {
    var t = S.track;
    if (!t || $("lyrics").hidden) return;
    var id = String(t.id);
    if (S.lyricId === id && (S.lyricLoading || S.lyricFetched)) return;
    S.lyricId = id; S.lyricLoading = true; S.lyricFetched = false;
    S.lyricLines = []; S.lyricIdx = -1; S.lyricErr = "";
    $("lyrics").innerHTML = '<div class="ly-empty">歌词加载中…</div>';
    api("/api/lyric?id=" + encodeURIComponent(id)).then(function (d) {
      if (S.lyricId !== id) return;
      S.lyricLoading = false; S.lyricFetched = true;
      S.lyricLines = (d && d.lines) || [];
      renderLyrics();
      tickLyric(true);
    }).catch(function (e) {
      if (S.lyricId !== id) return;
      S.lyricLoading = false;
      S.lyricErr = e.message || "读取失败";
      S.lyricLines = [];
      renderLyrics();
    });
  }
  function renderLyrics() {
    var box = $("lyrics");
    if (!box || box.hidden) return;
    if (!S.lyricLines.length) {
      box.innerHTML = '<div class="ly-empty">' + (S.lyricLoading ? "歌词加载中…" : (S.lyricErr ? "歌词读取失败" : "暂无歌词")) + '</div>';
      S.lyricIdx = -1;
      return;
    }
    var h = "";
    for (var i = 0; i < S.lyricLines.length; i++) {
      var x = S.lyricLines[i];
      h += '<div class="ly-line" data-i="' + i + '">' + esc(x.text) + (x.tr ? '<span class="tr">' + esc(x.tr) + '</span>' : "") + '</div>';
    }
    box.innerHTML = h;
    S.lyricIdx = -1;
    box.scrollTop = 0;
  }
  function tickLyric(force) {
    if (!S.lyricOn || !S.lyricLines.length) return;
    var p = curPos() + S.lyricOffset, i = -1;
    for (var k = 0; k < S.lyricLines.length; k++) {
      if (S.lyricLines[k].t <= p + 0.03) i = k; else break;
    }
    if (i === S.lyricIdx && !force) return;
    S.lyricIdx = i;
    var box = $("lyrics");
    if (!box) return;
    var rows = box.querySelectorAll(".ly-line");
    for (var j = 0; j < rows.length; j++) rows[j].classList.toggle("on", j === i);
    if (i >= 0 && rows[i]) {
      var el = rows[i];
      var top = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
      top = Math.max(0, top);
      if (box.scrollTo) box.scrollTo({ top: top, behavior: force ? "auto" : "smooth" });
      else box.scrollTop = top;
    }
  }

  function openQueue() {
    $("queuePanel").hidden = false;
    $("queueList").innerHTML = '<div class="empty">加载中…</div>';
    api("/api/queue").then(function (d) {
      S.queue = d.items || [];
      $("qCount").textContent = S.queue.length + " 首";
      var h = "";
      S.queue.forEach(function (x) {
        h += '<div class="q-item' + (x.cur ? " on" : "") + '" data-qid="' + esc(x.id) + '">' +
          '<div class="qi">' + (x.cur ? "♪" : (x.i + 1)) + '</div>' +
          '<div class="qn"><b>' + esc(x.name) + '</b><small>' + esc(x.ar) + '</small></div>' +
          '<div class="d">' + fmt(x.dt) + '</div></div>';
      });
      $("queueList").innerHTML = h || '<div class="empty">队列为空</div>';
      $("queueList").querySelectorAll(".q-item").forEach(function (row) {
        row.addEventListener("click", function () {
          var id = row.getAttribute("data-qid");
          api("/api/play/queue-track", { id: id }).then(function () {
            $("queuePanel").hidden = true; toast("已切换");
          }).catch(function (e) { toast("切换失败：" + e.message); });
        });
      });
      var cur = $("queueList").querySelector(".q-item.on");
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "center" });
    }).catch(function (e) {
      $("queueList").innerHTML = '<div class="empty">读取队列失败<br>' + esc(e.message) + '</div>';
    });
  }

  /* ---------- bindings ---------- */
  function bind() {
    $("btnSearch").innerHTML = icon("search", 20);
    $("btnSearch").addEventListener("click", showSearch);
    $("btnPair").innerHTML = icon("link", 20);
    $("btnPair").addEventListener("click", function () {
      api("/api/pair").then(showPair).catch(function () { toast("获取连接地址失败"); });
    });
    $("miniPlay").addEventListener("click", function (e) { e.stopPropagation(); control("toggle"); });
    $("miniNext").addEventListener("click", function (e) { e.stopPropagation(); control("next"); });
    $("mini").addEventListener("click", openPlayer);
    $("playerClose").innerHTML = icon("down", 20);
    $("playerClose").addEventListener("click", closePlayer);
    $("playerQueue").innerHTML = icon("list", 20);
    $("playerQueue").addEventListener("click", openQueue);
    $("playerLyric").innerHTML = icon("lyric", 20);
    $("playerLyric").addEventListener("click", function () { setLyricMode(!S.lyricOn); });
    bindHold("lyMinus", -0.1);
    bindHold("lyPlus", 0.1);
    $("lyReset").addEventListener("click", function () { adjustLyricOffset(-S.lyricOffset); });
    $("btnQueue2").innerHTML = icon("list", 21);
    $("btnQueue2").addEventListener("click", openQueue);
    $("queueClose").innerHTML = icon("down", 20);
    $("queueClose").addEventListener("click", function () { $("queuePanel").hidden = true; });
    $("btnPrev").innerHTML = icon("prev", 26);
    $("btnPrev").addEventListener("click", function () { control("prev"); });
    $("btnNext").innerHTML = icon("next", 26);
    $("btnNext").addEventListener("click", function () { control("next"); });
    $("btnPlay").addEventListener("click", function () { control("toggle"); });
    $("modeBtn").addEventListener("click", function () {
      var i = 0;
      for (var k = 0; k < MODES.length; k++) if (MODES[k].id === S.mode) i = k;
      var next = MODES[(i + 1) % MODES.length];
      api("/api/control", { action: "mode", value: next.id }).then(function (r) {
        S.mode = r.result || next.id;
        toast(modeInfo(S.mode).name);
        renderPlayer();
      }).catch(function (e) { toast("切换失败：" + e.message); });
    });
    $("volIcon").innerHTML = icon("vol", 17);
    $("vol").addEventListener("input", function () {
      var v = Number($("vol").value) / 100;
      $("vol").style.setProperty("--p", (v * 100) + "%");
      $("volNum").textContent = Math.round(v * 100) + "%";
      clearTimeout($("vol")._t);
      $("vol")._t = setTimeout(function () {
        api("/api/control", { action: "volume", value: v }).catch(function () {});
      }, 160);
    });
    var seek = $("seek");
    seek.addEventListener("input", function () {
      S.dragging = true;
      var pct = Number(seek.value) / 1000;
      S.dragVal = pct * (S.dur || 0);
      seek.style.setProperty("--p", (pct * 100).toFixed(1) + "%");
      $("tCur").textContent = fmt(S.dragVal);
    });
    seek.addEventListener("change", function () {
      var to = Number(seek.value) / 1000 * (S.dur || 0);
      S.dragging = false;
      S.pos = to; S.syncAt = Date.now();
      tickLyric(true);
      api("/api/control", { action: "seek", value: to }).catch(function (e) { toast("跳转失败：" + e.message); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { if (!$("queuePanel").hidden) $("queuePanel").hidden = true; else if (!$("player").hidden) closePlayer(); }
    });
  }

  /* press-and-hold repeat for lyric offset buttons */
  function bindHold(id, delta) {
    var el = $(id), t1 = null, t2 = null;
    function stop() {
      if (t1) { clearTimeout(t1); t1 = null; }
      if (t2) { clearInterval(t2); t2 = null; }
    }
    el.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      adjustLyricOffset(delta);
      stop();
      t1 = setTimeout(function () {
        t2 = setInterval(function () { adjustLyricOffset(delta); }, 110);
      }, 420);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { el.addEventListener(ev, stop); });
    el.addEventListener("click", function (e) { e.preventDefault(); });
  }

  function showPair(d) {
    var old = document.getElementById("pairModal");
    if (old) old.parentNode.removeChild(old);
    var m = document.createElement("div");
    m.id = "pairModal";
    m.className = "pair-modal";
    m.innerHTML = '<div class="pair-card">' +
      '<h3>手机连接电脑</h3>' +
      '<p class="pair-tip">手机和电脑连同一个 WiFi，用相机扫码打开</p>' +
      (d.qr ? '<img class="pair-qr" src="' + d.qr + '" alt="二维码">' : '') +
      '<div class="pair-url">' + esc(d.url) + '</div>' +
      '<div class="pair-actions"><button class="pair-copy" id="pairCopy">复制地址</button>' +
      '<button class="pair-ok" id="pairClose">知道了</button></div>' +
      (installEvent ? '<button class="pair-install" id="pairInstall">安装到桌面</button>' : '') +
      (isIOS() ? '<p class="pair-ios">iPhone：点下方「分享」→「添加到主屏幕」</p>'
        : (installEvent ? '' : '<p class="pair-ios">安卓：浏览器菜单 →「添加到主屏幕」</p>')) +
      '</div>';
    document.body.appendChild(m);
    m.addEventListener("click", function (e) { if (e.target === m) m.parentNode.removeChild(m); });
    var close = document.getElementById("pairClose");
    if (close) close.addEventListener("click", function () { m.parentNode.removeChild(m); });
    var ins = document.getElementById("pairInstall");
    if (ins) ins.addEventListener("click", function () {
      if (!installEvent) return;
      installEvent.prompt();
      installEvent.userChoice.then(function (r) {
        installEvent = null;
        if (r && r.outcome === "accepted") toast("已添加到桌面");
      });
    });
    var cp = document.getElementById("pairCopy");
    if (cp) cp.addEventListener("click", function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(d.url).then(function () { toast("已复制地址"); }, function () { toast(d.url); });
      } else { toast(d.url); }
    });
  }

  function control(action) {
    api("/api/control", { action: action }).catch(function (e) { toast("操作失败：" + e.message); });
  }

  /* ---------- PWA ---------- */
  function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent); }
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    installEvent = e;
  });
  window.addEventListener("appinstalled", function () { installEvent = null; });

  /* ---------- boot ---------- */
  bind();
  connect();
  showHome();
  setInterval(function () {
    renderProgress();
    if (!$("mini").hidden && S.st === 2) {
      var el = $("mini");
      if (el) el.classList.add("playing");
    }
  }, 300);
})();
