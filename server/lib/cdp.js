"use strict";
// CDP client for the NetEase Cloud Music desktop client (CEF) page.
const WebSocket = require("ws");
const http = require("http");

function getJson(target, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const req = http.get(target, function (res) {
      let d = "";
      res.setEncoding("utf8");
      res.on("data", function (c) { d += c; });
      res.on("end", function () { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs || 5000, function () { req.destroy(new Error("timeout")); });
  });
}

const COOKIE_URLS = ["https://music.163.com", "https://interface.music.163.com", "orpheus://orpheus/pub/app.html"];

class Cdp {
  constructor(opts) {
    opts = opts || {};
    this.port = opts.port || 9222;
    this.log = opts.log || function () {};
    this.ws = null;
    this.seq = 0;
    this.pending = new Map();
    this.chunks = null;
    this.pageInfo = null;
    this.ready = false;
  }

  async findPage() {
    const list = await getJson("http://127.0.0.1:" + this.port + "/json/list");
    const pages = (list || []).filter(function (t) { return t.type === "page" && t.webSocketDebuggerUrl; });
    const orpheus = pages.filter(function (p) { return /orpheus|app\.html|music\.163\.com/i.test(p.url || "") || /网易云|oris|cEF/i.test(p.title || ""); });
    const pick = orpheus[0] || pages[0];
    if (!pick) throw new Error("CDP 端口可达，但没有找到页面目标");
    this.pageInfo = pick;
    return pick;
  }

  async connect() {
    const page = await this.findPage();
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
      this.ws = ws;
      const timer = setTimeout(function () { reject(new Error("CDP websocket 连接超时")); }, 8000);
      ws.on("open", () => { clearTimeout(timer); resolve(); });
      ws.on("error", (e) => { clearTimeout(timer); reject(e); });
      ws.on("message", (raw) => this._onMessage(raw));
      ws.on("close", () => { this.ready = false; this.pending.forEach(function (p) { p.reject(new Error("CDP 连接已断开")); }); this.pending.clear(); });
    });
    await this.send("Runtime.enable");
    try { await this.send("Network.enable"); } catch (e) {}
    this.ready = true;
    this.log("[cdp] connected to " + String(page.title || "").slice(0, 40) + " " + page.id);
    return page;
  }

  _onMessage(raw) {
    let m;
    try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (m.method === "HeapProfiler.addHeapSnapshotChunk") { if (this.chunks) this.chunks.push(m.params.chunk); return; }
    if (m.method === "HeapProfiler.reportHeapSnapshotProgress") return;
    if (m.id && this.pending.has(m.id)) {
      const p = this.pending.get(m.id); this.pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message || JSON.stringify(m.error))); else p.resolve(m.result);
    }
  }

  send(method, params, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) return reject(new Error("CDP socket not open"));
      const id = ++this.seq;
      const timer = setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error("CDP timeout: " + method)); } }, timeoutMs || 20000);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      });
      this.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  }

  async evaluate(expression, timeoutMs) {
    const r = await this.send("Runtime.evaluate", { expression: expression, returnByValue: true, awaitPromise: true, userGesture: true }, timeoutMs);
    if (r && r.exceptionDetails) {
      const d = r.exceptionDetails.exception && r.exceptionDetails.exception.description;
      throw new Error("页面脚本异常: " + String(d || r.exceptionDetails.text || "").split("\n")[0]);
    }
    return r && r.result ? r.result.value : undefined;
  }

  async cookies() {
    const r = await this.send("Network.getCookies", { urls: COOKIE_URLS });
    const list = (r && r.cookies) || [];
    if (!list.length) return "";
    return list.map(function (c) { return c.name + "=" + c.value; }).join("; ");
  }

  async ensureStore() {
    let ok = false;
    try { ok = await this.evaluate("(function(){try{return !!(window.__STORE && typeof window.__STORE.dispatch===\"function\" && typeof window.__STORE.getState===\"function\")}catch(e){return false}})()"); } catch (e) {}
    if (ok) { this.log("[cdp] store 已就绪 (window.__STORE)"); return "cached"; }
    const scan = await this._scanScope();
    if (scan) { this.log("[cdp] store 已捕获: " + scan); return scan; }
    this.log("[cdp] 作用域内未找到 store，回退堆快照扫描（约 10-30 秒）…");
    const found = await this._heapFindStore();
    if (!found) throw new Error("无法定位客户端播放器 store");
    await this.evaluate("(function(){try{var s=window.__STORE;return !!(s&&typeof s.dispatch===\"function\")}catch(e){return false}})()");
    return "heap-snapshot";
  }

  async _scanScope() {
    const expr = [
      "(function(){",
      "  function isStore(o){try{return !!o&&(typeof o===\"object\"||typeof o===\"function\")&&typeof o.dispatch===\"function\"&&typeof o.getState===\"function\"}catch(e){return false}}",
      "  for (var k in window){ try{ var v=window[k]; if(isStore(v)){ window.__STORE=v; return \"window.\"+k; } }catch(e){} }",
      "  var root=document.getElementById(\"root\")||document.body;",
      "  if(!root) return null;",
      "  var ks=Object.keys(root), key=null;",
      "  for(var i=0;i<ks.length;i++){ if(ks[i].indexOf(\"__reactContainer\")===0||ks[i].indexOf(\"__reactFiber\")===0){key=ks[i];break;} }",
      "  if(!key) return null;",
      "  var start=root[key]; if(start&&start.current) start=start.current;",
      "  var stack=[start], n=0;",
      "  while(stack.length && n<300000){",
      "    var f=stack.pop(); n++; if(!f) continue;",
      "    try{",
      "      var p=f.memoizedProps;",
      "      if(p){ if(isStore(p.store)){window.__STORE=p.store;return \"props.store@\"+n;} if(isStore(p.value)){window.__STORE=p.value;return \"props.value@\"+n;} }",
      "      var t=f.type; if(t){ if(isStore(t._currentValue)){window.__STORE=t._currentValue;return \"ctx@\"+n;} if(t._context&&isStore(t._context._currentValue)){window.__STORE=t._context._currentValue;return \"ctx2@\"+n;} }",
      "      var sn=f.stateNode; if(sn){ if(isStore(sn.store)){window.__STORE=sn.store;return \"stateNode.store@\"+n;} if(isStore(sn)){window.__STORE=sn;return \"stateNode@\"+n;} }",
      "    }catch(e){}",
      "    if(f.sibling) stack.push(f.sibling);",
      "    if(f.child) stack.push(f.child);",
      "  }",
      "  return null;",
      "})()"
    ].join("\n");
    try { const v = await this.evaluate(expr, 30000); return typeof v === "string" ? v : null; } catch (e) { return null; }
  }

  async _heapFindStore() {
    await this.send("HeapProfiler.enable");
    this.chunks = [];
    await this.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, captureNumericValue: false }, 180000);
    const joined = this.chunks.join("");
    this.chunks = null;
    const snap = JSON.parse(joined);
    const meta = snap.snapshot.meta;
    const nf = meta.node_fields, NF = nf.length;
    const iName = nf.indexOf("name"), iId = nf.indexOf("id"), iEdges = nf.indexOf("edge_count");
    const nodes = snap.nodes, strings = snap.strings;
    const ef = meta.edge_fields, EF = ef.length;
    const iET = ef.indexOf("type"), iEN = ef.indexOf("name_or_index");
    const eTypes = meta.edge_types[0], edges = snap.edges;
    let acc = 0;
    const starts = new Int32Array(Math.floor(nodes.length / NF));
    for (let j = 0, i = 0; i < nodes.length; i += NF, j++) { starts[j] = acc; acc += nodes[i + iEdges] * EF; }
    const byNode = new Map();
    for (let j = 0; j < starts.length; j++) {
      const i = j * NF, cnt = nodes[i + iEdges], st = starts[j];
      if (!cnt) continue;
      for (let k = 0; k < cnt; k++) {
        const e = st + k * EF, et = eTypes[edges[e + iET]];
        if (et !== "property" && et !== "internal") continue;
        const nm = strings[edges[e + iEN]];
        if (nm === "dispatch" || nm === "getState" || nm === "subscribe" || nm === "replaceReducer") {
          const sid = nodes[i + iId];
          let o = byNode.get(sid);
          if (!o) { o = { id: sid, props: new Set() }; byNode.set(sid, o); }
          o.props.add(nm);
        }
      }
    }
    const stores = [];
    byNode.forEach(function (o) { if (o.props.has("dispatch") && o.props.has("getState")) stores.push(o); });
    for (let n = 0; n < stores.length; n++) {
      try {
        const ro = await this.send("HeapProfiler.getObjectByHeapObjectId", { objectId: String(stores[n].id) });
        const oid = ro && ro.result && ro.result.objectId;
        if (!oid) continue;
        const r = await this.send("Runtime.callFunctionOn", { objectId: oid, functionDeclaration: "function(){try{if(this&&typeof this.dispatch===\"function\"&&typeof this.getState===\"function\"){window.__STORE=this;return true}}catch(e){}return false}", returnByValue: true });
        if (r && r.result && r.result.value === true) return true;
      } catch (e) {}
    }
    return false;
  }

  close() { try { this.ws && this.ws.close(); } catch (e) {} this.ready = false; }
}

module.exports = Cdp;