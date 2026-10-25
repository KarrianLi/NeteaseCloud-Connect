"use strict";
// 网易云手机遥控 —— PC 桥接服务：CDP 控制官方客户端 + 手机 Web UI
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { WebSocketServer } = require("ws");
const Cdp = require("./lib/cdp");

const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const IMG = path.join(DATA, "img");
const TMP = path.join(DATA, "tmp");
fs.mkdirSync(IMG, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });
process.env.TEMP = TMP;
process.env.TMP = TMP;
const PORT = Number(process.env.PORT || 3040);

function log() {
  const a = Array.prototype.slice.call(arguments);
  console.log("[" + new Date().toTimeString().slice(0, 8) + "] " + a.join(" "));
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

let api = null;
function getApi() {
  if (!api) api = require("@neteasecloudmusicapienhanced/api");
  return api;
}
async function call(name, params) {
  const r = await getApi()[name](Object.assign({ cookie: cookie }, params || {}));
  return (r && r.body) || r;
}

// ---------------- 状态 ----------------
const S = {
  connected: false, err: "", busy: "",
  st: 0, mode: "playOrder", vol: 0.6, track: null, qlen: 0, qsig: "", playId: "",
  scene: "", href: "", text: "",
  posBase: 0, posAt: Date.now(),
  uid: "", nick: ""
};
let cookie = "";

function duration() { return (S.track && S.track.dur) || 0; }
function posNow() {
  if (S.st !== 2) return S.posBase;
  const p = S.posBase + (Date.now() - S.posAt) / 1000;
  const d = duration();
  return d > 0 ? Math.min(p, d) : p;
}

const POLL_EXPR = [
  "(function(){",
  "  try {",
  "    var s = window.__STORE.getState();",
  "    var p = s.playing || {};",
  "    var list = (s.playingList && s.playingList.curPlayingList) || [];",
  "    var c = p.curPlaying || {};",
  "    var t = c.track || {};",
  "    var alb = t.album || {};",
  "    var first = list[0] || {}, last = list[list.length - 1] || {};",
  "    return JSON.stringify({",
  "      st: typeof p.playingState === \"number\" ? p.playingState : 0,",
  "      mode: p.playingMode || \"\",",
  "      vol: typeof p.playingVolume === \"number\" ? p.playingVolume : 0.6,",
  "      playId: p.playId || \"\",",
  "      qlen: list.length,",
  "      qsig: list.length + \"|\" + (first.resourceId || \"\") + \"|\" + (last.resourceId || \"\") + \"|\" + (c.href || \"\"),",
  "      scene: c.scene || \"\",",
  "      href: c.href || \"\",",
  "      text: c.text || \"\",",
  "      track: t.id ? {",
  "        id: String(t.id), name: t.name || \"\",",
  "        artists: (t.artists || []).map(function (a) { return a.name; }).join(\" / \"),",
  "        album: alb.name || \"\", cover: alb.picUrl || \"\",",
  "        dur: (t.duration || 0) / 1000, fee: t.fee || 0",
  "      } : null",
  "    });",
  "  } catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); }",
  "})()"
].join("\n");

const QUEUE_EXPR = [
  "(function(){",
  "  try {",
  "    var s = window.__STORE.getState();",
  "    var p = s.playing || {};",
  "    var cur = (p.curPlaying || {}).id;",
  "    var list = (s.playingList && s.playingList.curPlayingList) || [];",
  "    return JSON.stringify(list.map(function (it, i) {",
  "      var t = it.track || {};",
  "      return { i: i, id: String(it.resourceId || (t && t.id) || \"\"), name: t.name || it.text || \"\",",
  "        ar: (t.artists || []).map(function (a) { return a.name; }).join(\" / \"),",
  "        dt: Math.round((t.duration || 0) / 1000), cur: String(it.resourceId) === String(cur) };",
  "    }));",
  "  } catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); }",
  "})()"
].join("\n");

function dispatchAction(type, payload) {
  const expr = "(function(){try{window.__STORE.dispatch(" + JSON.stringify({ type: type, payload: payload || {} }) + ");return 1}catch(e){return \"ERR \"+e.message}})()";
  return cdp.evaluate(expr);
}
async function waitFor(fn, timeoutMs, intervalMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (timeoutMs || 8000)) {
    try { if (await fn()) return true; } catch (e) {}
    await sleep(intervalMs || 250);
  }
  return false;
}

// ---------------- 播放器操作 ----------------
async function refreshState() {
  const raw = await cdp.evaluate(POLL_EXPR);
  if (typeof raw !== "string") throw new Error("无法读取播放状态");
  const d = JSON.parse(raw);
  if (d.error) throw new Error("状态读取失败: " + d.error);
  applyState(d);
  return d;
}

function applyState(d) {
  const now = Date.now();
  const prevPos = posNow();
  const prevSt = S.st;
  const prevId = S.track ? S.track.id : null;
  const oldDur = duration();
  const newId = d.track ? d.track.id : null;

  S.st = d.st; S.mode = d.mode || S.mode; S.vol = d.vol; S.playId = d.playId || "";
  S.qlen = d.qlen; S.qsig = d.qsig; S.scene = d.scene; S.href = d.href; S.text = d.text;
  S.track = d.track;

  if (newId !== prevId) {
    S.posBase = 0; S.posAt = now;
  } else if (d.st === 2 && prevSt !== 2) {
    S.posBase = prevPos; S.posAt = now;
  } else if (d.st !== 2 && prevSt === 2) {
    S.posBase = prevPos; S.posAt = now;
  }
  if (oldDur !== duration() && d.st === 2) { S.posAt = now; S.posBase = Math.min(S.posBase, duration()); }
}

async function loadPlaylistIntoClient(playlistId) {
  const id = String(playlistId);
  S.busy = "正在打开歌单…"; broadcast();
  await dispatchAction("@@router/CALL_HISTORY_METHOD", { method: "push", args: ["/playlist/" + id] });
  const clickExpr = [
    "(function(){",
    "  var want = " + JSON.stringify(id) + ";",
    "  var btn = null;",
    "  var all = document.querySelectorAll(\"[data-log]\");",
    "  for (var i = 0; i < all.length; i++) {",
    "    var d = all[i].getAttribute(\"data-log\") || \"\";",
    "    if (d.indexOf(\"btn_pc_playall\") >= 0 && d.indexOf(want) >= 0) { btn = all[i]; break; }",
    "  }",
    "  if (!btn) return 0;",
    "  btn.click();",
    "  return 1;",
    "})()"
  ].join("\n");
  let clicked = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const r = await cdp.evaluate(clickExpr);
    if (r === 1) { clicked = true; break; }
    await sleep(400);
  }
  if (!clicked) { S.busy = ""; broadcast(); throw new Error("歌单页面加载超时（找不到播放全部按钮）"); }
  const ok = await waitFor(async function () {
    const raw = await cdp.evaluate(POLL_EXPR);
    const d = JSON.parse(raw);
    if (d.error) return false;
    applyState(d);
    return d.qlen > 0 && String(d.href || "").indexOf("/playlist/" + id) >= 0;
  }, 15000, 350);
  S.busy = "";
  broadcast();
  if (!ok) throw new Error("歌单队列加载超时");
  await refreshState();
  return true;
}

async function ensureQueueOf(playlistId) {
  await refreshState();
  const want = "/playlist/" + String(playlistId);
  if (String(S.href || "").indexOf(want) >= 0 && S.qlen > 0) return true;
  return loadPlaylistIntoClient(playlistId);
}

async function playTrackInPlaylist(playlistId, trackId) {
  await ensureQueueOf(playlistId);
  S.busy = "正在切歌…"; broadcast();
  await dispatchAction("playing/playOneTrackInPlayingList", { item: String(trackId), flag: 1, switchType: "call", triggerScene: "playingList" });
  const ok = await waitFor(async function () {
    const raw = await cdp.evaluate(POLL_EXPR);
    const d = JSON.parse(raw);
    if (d.error) return false;
    applyState(d);
    return d.track && String(d.track.id) === String(trackId);
  }, 9000, 300);
  S.busy = "";
  broadcast();
  if (!ok) throw new Error("切歌超时（可能是版权/试听限制）");
  return true;
}

async function playSongById(songId) {
  await refreshState();
  if (S.track && String(S.track.id) === String(songId)) return true;
  const detail = await call("song_detail", { ids: String(songId) });
  const songs = (detail && detail.songs) || [];
  if (!songs.length) throw new Error("歌曲不存在");
  const song = songs[0];
  const privs = (detail && detail.privileges) || [];
  const pv = privs.find(function (p) { return String(p.id) === String(songId); });
  if (pv) song.privilege = pv;
  const trackIn = {
    id: String(song.id), displayOrder: 0, randomOrder: 0, isPlayedOnce: false, ai: "", aiRcmd: false,
    scene: "playlist", href: S.href || "", text: S.text || "", localTrack: {}, track: song,
    resourceType: "track",
    fromInfo: { originalScene: "playlist", originalResourceType: "playlist", computeSourceResourceType: "track", sourceData: { id: "", name: S.text || "" } },
    resourceId: String(song.id), trackId: String(song.id), referInfo: {}
  };
  await dispatchAction("playing/setPlaying", { trackIn: trackIn, playingState: 2, fromType: "call", triggerScene: "playlist" });
  const ok = await waitFor(async function () {
    const raw = await cdp.evaluate(POLL_EXPR);
    const d = JSON.parse(raw);
    if (d.error) return false;
    applyState(d);
    return d.track && String(d.track.id) === String(songId);
  }, 9000, 300);
  if (!ok) throw new Error("点播超时");
  return true;
}

const MODES = ["playOrder", "playCycle", "playOneCycle", "playRandom"];
async function control(action, value) {
  switch (action) {
    case "toggle": {
      await refreshState();
      return control(S.st === 2 ? "pause" : "play");
    }
    case "play": await dispatchAction("playing/resume", { triggerScene: "hotKey" }); break;
    case "pause": await dispatchAction("playing/pause", { triggerScene: "hotKey" }); break;
    case "next": await dispatchAction("playingList/jump2Track", { flag: 1, type: "call", triggerScene: "hotKey" }); break;
    case "prev": await dispatchAction("playingList/jump2Track", { flag: -1, type: "call", triggerScene: "hotKey" }); break;
    case "seek": {
      const to = Math.max(0, Math.min(Number(value) || 0, duration() || Number(value) || 0));
      S.posBase = to; S.posAt = Date.now();
      await dispatchAction("playing/setPlayingPosition", { duration: to });
      broadcast();
      return true;
    }
    case "volume": await dispatchAction("playing/setVolume", { volume: Math.max(0, Math.min(1, Number(value))) }); break;
    case "mode": {
      if (MODES.indexOf(value) < 0) throw new Error("不支持的播放模式");
      await dispatchAction("playing/switchPlayingMode", { playingMode: value, triggerScene: "hotKey", HeartBeatFlage: false });
      await sleep(400);
      await refreshState();
      broadcast();
      return S.mode;
    }
    case "stop": await dispatchAction("playing/stop", {}); break;
    default: throw new Error("未知操作: " + action);
  }
  await sleep(300);
  await refreshState();
  broadcast();
  return true;
}

// ---------------- 数据接口 ----------------
function coverOf(url) {
  if (!url) return "";
  return "/api/img?u=" + encodeURIComponent(String(url).replace(/^http:\/\//, "https://"));
}
function fmtTime(ms) { return Math.round((ms || 0) / 1000); }

async function getHome() {
  if (!S.uid) await readHost();
  const r = await call("user_playlist", { uid: S.uid, limit: 100, offset: 0 });
  const list = (r && r.playlist) || [];
  const out = list.map(function (p) {
    if (p.specialType === 5) S.likedId = String(p.id);
    return { id: String(p.id), name: p.name, count: p.trackCount || 0, cover: coverOf(p.coverImgUrl), special: p.specialType === 5 };
  });
  return { nick: S.nick, uid: S.uid, playlists: out };
}

async function getLikedTracks() {
  if (!S.uid) await readHost();
  const r = await call("likelist", { uid: S.uid });
  const ids = (r && r.ids) || [];
  const out = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500).map(String).join(",");
    if (!chunk) break;
    const d = await call("song_detail", { ids: chunk });
    const songs = (d && d.songs) || [];
    songs.forEach(function (t) {
      out.push({ id: String(t.id), name: t.name, ar: (t.ar || t.artists || []).map(function (a) { return a.name; }).join(" / "), dt: fmtTime(t.dt || t.duration), fee: t.fee || 0 });
    });
  }
  return out;
}

async function getPlaylist(id) {
  const r = await call("playlist_detail", { id: String(id), s: 0 });
  const p = (r && r.playlist) || null;
  if (!p) throw new Error("歌单不存在");
  const isLiked = p.specialType === 5 || String(id) === String(S.likedId || "");
  if (isLiked) {
    const liked = await getLikedTracks();
    if (liked.length) {
      return { id: String(p.id), name: p.name, cover: coverOf(p.coverImgUrl), count: liked.length, tracks: liked, liked: true };
    }
  }
  let tracks = (p.tracks || []).map(function (t) {
    return { id: String(t.id), name: t.name, ar: (t.ar || t.artists || []).map(function (a) { return a.name; }).join(" / "), dt: fmtTime(t.dt || t.duration), fee: t.fee || 0 };
  });
  if (!tracks.length || tracks.length < (p.trackCount || 0)) {
    try {
      const all = [];
      const total = p.trackCount || 0;
      for (let off = 0; off < Math.max(total, 1); off += 1000) {
        const rr = await call("playlist_track_all", { id: String(id), limit: 1000, offset: off });
        const songs = (rr && rr.songs) || [];
        if (!songs.length) break;
        songs.forEach(function (t) {
          all.push({ id: String(t.id), name: t.name, ar: (t.ar || t.artists || []).map(function (a) { return a.name; }).join(" / "), dt: fmtTime(t.dt || t.duration), fee: t.fee || 0 });
        });
        if (songs.length < 1000) break;
      }
      if (all.length) tracks = all;
    } catch (e) {}
  }
  return { id: String(p.id), name: p.name, cover: coverOf(p.coverImgUrl), count: p.trackCount || tracks.length, tracks: tracks };
}

async function getQueue() {
  const raw = await cdp.evaluate(QUEUE_EXPR);
  const items = JSON.parse(raw);
  if (items && items.error) throw new Error(items.error);
  return { items: items, curIndex: items.findIndex(function (x) { return x.cur; }) };
}

async function readHost() {
  const raw = await cdp.evaluate("(function(){try{var h=window.__STORE.getState().host||{};return JSON.stringify({uid:String(h.uid||\"\"),nick:h.nickName||h.userName||\"\"})}catch(e){return \"{}\"}})()");
  try { const h = JSON.parse(raw); S.uid = h.uid || S.uid; S.nick = h.nick || S.nick; } catch (e) {}
}

// ---------------- 广播 ----------------
let wss = null;
function snapshot() {
  return {
    type: "state",
    connected: S.connected, err: S.err, busy: S.busy,
    st: S.st, mode: S.mode, vol: S.vol, track: S.track,
    pos: Math.round(posNow() * 10) / 10, dur: Math.round(duration() * 10) / 10,
    qlen: S.qlen, qsig: S.qsig, scene: S.scene, href: S.href, text: S.text,
    nick: S.nick, ts: Date.now()
  };
}
function broadcast() {
  if (!wss) return;
  const msg = JSON.stringify(snapshot());
  wss.clients.forEach(function (c) { if (c.readyState === 1) { try { c.send(msg); } catch (e) {} } });
}

// ---------------- 采集循环 ----------------
let cdp = new Cdp({ port: Number(process.env.CDP_PORT || 9222), log: log });
let pollTimer = null;
let lastSig = "";

async function boot() {
  clearInterval(pollTimer); pollTimer = null;
  try { cdp.close(); } catch (e) {}
  cdp = new Cdp({ port: Number(process.env.CDP_PORT || 9222), log: log });
  try {
    await cdp.connect();
    await cdp.ensureStore();
    cookie = await cdp.cookies();
    if (!cookie) throw new Error("无法读取客户端登录态");
    await readHost();
    await refreshState();
    S.connected = true; S.err = "";
    log("[boot] OK uid=" + S.uid + " nick=" + S.nick + " track=" + (S.track ? S.track.name : "-"));
    broadcast();
    pollTimer = setInterval(tick, 900);
  } catch (e) {
    S.connected = false; S.err = String((e && e.message) || e);
    log("[boot] 失败: " + S.err);
    broadcast();
    setTimeout(boot, 5000);
  }
}

let failCount = 0;
async function tick() {
  try {
    const d = await refreshState();
    failCount = 0;
    if (!S.connected) { S.connected = true; S.err = ""; }
    const sig = d.qsig + "|" + d.st + "|" + (d.track ? d.track.id : "");
    broadcast();
    if (sig !== lastSig) { lastSig = sig; }
  } catch (e) {
    failCount++;
    if (failCount >= 3) {
      S.connected = false; S.err = "与客户端连接中断: " + String((e && e.message) || e);
      log("[tick] " + S.err);
      broadcast();
      boot();
    }
  }
}

// ---------------- HTTP ----------------
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

// ---------------- 歌词 ----------------
const lyricCache = new Map();
function parseLrc(raw) {
  const out = [];
  if (!raw) return out;
  String(raw).split(/\r?\n/).forEach(function (line) {
    const times = [];
    const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    let m;
    while ((m = re.exec(line))) {
      let frac = 0;
      if (m[3]) frac = Number("0." + (m[3].length === 3 ? m[3] : (m[3] + "0")));
      times.push(Number(m[1]) * 60 + Number(m[2]) + frac);
    }
    const text = line.replace(/\[[^\]]*\]/g, "").trim();
    if (!text || !times.length) return;
    times.forEach(function (t) { out.push({ t: Math.round(t * 1000) / 1000, text: text }); });
  });
  out.sort(function (a, b) { return a.t - b.t; });
  return out;
}
async function getLyric(id) {
  const key = String(id || "");
  if (!key) throw new Error("缺少歌曲 id");
  if (lyricCache.has(key)) return lyricCache.get(key);
  const r = await call("lyric", { id: key, lv: -1, tv: -1 });
  let lines = parseLrc((r && r.lrc && r.lrc.lyric) || "");
  const CREDIT = /^(作词|作曲|编曲|制作人|制作|监制|出品|发行|录音|混音|母带|吉他|贝斯|鼓|键盘|和声|OP|SP|词|曲)\s*[:：]/i;
  lines = lines.filter(function (x) { return !(x.t <= 12 && CREDIT.test(x.text)); });
  const trs = parseLrc((r && r.tlyric && r.tlyric.lyric) || "");
  if (trs.length) {
    const map = new Map();
    trs.forEach(function (x) { map.set(Math.round(x.t * 10), x.text); });
    lines.forEach(function (x) {
      const tr = map.get(Math.round(x.t * 10));
      if (tr && tr !== x.text) x.tr = tr;
    });
  }
  const out = { id: key, lines: lines, hasLrc: lines.length > 0 };
  if (lyricCache.size >= 60) lyricCache.clear();
  lyricCache.set(key, out);
  return out;
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
function readBody(req) {
  return new Promise(function (resolve) {
    let d = "";
    req.on("data", function (c) { d += c; if (d.length > 1e6) req.destroy(); });
    req.on("end", function () { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { resolve({}); } });
  });
}

const imgCache = new Map();
async function proxyImg(u, res) {
  const hit = imgCache.get(u);
  if (hit) { res.writeHead(200, { "Content-Type": hit.type, "Cache-Control": "max-age=604800" }); res.end(hit.buf); return; }
  const mod = u.startsWith("https:") ? require("https") : require("http");
  const req = mod.get(u, { headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://music.163.com/" } }, function (r) {
    if (r.statusCode && r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return proxyImg(r.headers.location, res); }
    const chunks = [];
    r.on("data", function (c) { chunks.push(c); });
    r.on("end", function () {
      const buf = Buffer.concat(chunks);
      const type = r.headers["content-type"] || "image/jpeg";
      imgCache.set(u, { buf: buf, type: type });
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "max-age=604800" });
      res.end(buf);
    });
  });
  req.on("error", function () { res.writeHead(502); res.end(); });
  req.setTimeout(10000, function () { req.destroy(); });
}

function serveStatic(p, res) {
  const file = path.join(ROOT, "public", p);
  if (!file.startsWith(path.join(ROOT, "public"))) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(buf);
  });
}

function lanIp() {
  const nets = os.networkInterfaces();
  for (const k of Object.keys(nets)) {
    for (const n of nets[k] || []) {
      if (n.family === "IPv4" && !n.internal && !/^169\.254/.test(n.address)) return n.address;
    }
  }
  return "127.0.0.1";
}

const server = http.createServer(async function (req, res) {
  const u = new URL(req.url, "http://x");
  const p = u.pathname;
  try {
    if (p === "/api/status") return sendJson(res, 200, snapshot());
    if (p === "/api/home") return sendJson(res, 200, await getHome());
    if (p === "/api/playlist") return sendJson(res, 200, await getPlaylist(u.searchParams.get("id")));
    if (p === "/api/queue") return sendJson(res, 200, await getQueue());
    if (p === "/api/lyric") return sendJson(res, 200, await getLyric(u.searchParams.get("id")));
    if (p === "/api/search") {
      const q = u.searchParams.get("q") || "";
      const r = await call("cloudsearch", { keywords: q, type: 1, limit: 30 });
      const songs = ((r && r.result && r.result.songs) || []).map(function (s) {
        return { id: String(s.id), name: s.name, ar: (s.ar || []).map(function (a) { return a.name; }).join(" / "), album: (s.al && s.al.name) || "", cover: coverOf(s.al && s.al.picUrl), dt: fmtTime(s.dt), fee: s.fee || 0 };
      });
      return sendJson(res, 200, { songs: songs });
    }
    if (p === "/api/img") return proxyImg(u.searchParams.get("u") || "", res);
    if (p === "/api/pair") {
      const url = "http://" + lanIp() + ":" + PORT + "/";
      let qr = "";
      try {
        qr = await require("qrcode").toDataURL(url, { margin: 1, width: 260, errorCorrectionLevel: "M", color: { dark: "#0a0a0cff", light: "#ffffffff" } });
      } catch (e) { log("[pair] qr failed " + String(e && e.message || e)); }
      return sendJson(res, 200, { ip: lanIp(), port: PORT, url: url, qr: qr });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      if (p === "/api/play/playlist") {
        await loadPlaylistIntoClient(body.id);
        return sendJson(res, 200, { ok: true, state: snapshot() });
      }
      if (p === "/api/play/track") {
        await playTrackInPlaylist(body.playlistId, body.trackId);
        return sendJson(res, 200, { ok: true, state: snapshot() });
      }
      if (p === "/api/play/song") {
        await playSongById(body.id);
        return sendJson(res, 200, { ok: true, state: snapshot() });
      }
      if (p === "/api/play/queue-track") {
        await refreshState();
        await dispatchAction("playing/playOneTrackInPlayingList", { item: String(body.id), flag: 1, switchType: "call", triggerScene: "playingList" });
        await sleep(700);
        await refreshState();
        broadcast();
        if (!S.track || String(S.track.id) !== String(body.id)) throw new Error("切换失败（歌曲可能已不在队列）");
        return sendJson(res, 200, { ok: true, state: snapshot() });
      }
      if (p === "/api/control") {
        const v = await control(body.action, body.value);
        return sendJson(res, 200, { ok: true, result: v === undefined ? true : v, state: snapshot() });
      }
      return sendJson(res, 404, { error: "unknown endpoint" });
    }
    if (p === "/") return serveStatic("index.html", res);
    return serveStatic(p.replace(/^\//, ""), res);
  } catch (e) {
    log("[http] " + p + " -> " + String((e && e.message) || e));
    sendJson(res, 500, { error: String((e && e.message) || e) });
  }
});

wss = new WebSocketServer({ server: server, path: "/ws" });
wss.on("connection", function (ws) {
  try { ws.send(JSON.stringify(snapshot())); } catch (e) {}
  ws.on("error", function () {});
});

server.listen(PORT, "0.0.0.0", function () {
  log("遥控服务已启动: http://" + lanIp() + ":" + PORT + "/  (本机 http://127.0.0.1:" + PORT + "/)");
  boot();
});

process.on("uncaughtException", function (e) { log("[fatal] " + (e && e.stack || e)); });