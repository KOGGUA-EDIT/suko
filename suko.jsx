/*
 * suko — preset manager for EffectCraft
 * A single-canvas ScriptUI panel: folder rail, subfolder chips, preset grid, zoom,
 * onboarding and settings.  v1.0.0
 */
(function (thisObj) {
  var IS_PANEL = thisObj instanceof Panel;
  var VERSION = "1.0.0";
  var SECTION = "suko";
  var SETTINGS_KEY = "state";
  var CONFIG_NAME = "suko.config.json";
  var FONT_FAMILY = "Microsoft YaHei UI";
  var MIN_W = 236;
  var MIN_H = 250;
  var CAT_ALL = "__all__";
  var CAT_RECENT = "__recent__";
  var CAT_ROOT = "__root__";

  var C = {
    bg:       [0.055, 0.059, 0.074, 1],
    main:     [0.071, 0.077, 0.094, 1],
    side:     [0.063, 0.069, 0.086, 1],
    header:   [0.071, 0.077, 0.094, 1],
    footer:   [0.063, 0.069, 0.086, 1],
    card:     [0.105, 0.114, 0.137, 1],
    cardHi:   [0.132, 0.143, 0.171, 1],
    field:    [0.086, 0.094, 0.116, 1],
    fieldHi:  [0.105, 0.115, 0.140, 1],
    line:     [1, 1, 1, 0.07],
    lineHi:   [1, 1, 1, 0.12],
    text:     [0.925, 0.936, 0.955, 1],
    muted:    [0.57, 0.59, 0.65, 1],
    faint:    [0.38, 0.40, 0.46, 1],
    accent:   [0.43, 0.88, 0.74, 1],
    accent2:  [0.40, 0.72, 0.96, 1],
    accentSoft:[0.43, 0.88, 0.74, 0.13],
    onAccent: [0.045, 0.085, 0.075, 1],
    danger:   [0.96, 0.45, 0.48, 1],
    dangerSoft:[0.96, 0.45, 0.48, 0.12]
  };

  var MODES = [
    { id: "preview",  label: "预览",   icon: "image",  desc: "大图预览 · 名称" },
    { id: "preset",   label: "预设",   icon: "sliders",desc: "缩略图 · 属性摘要" },
    { id: "filename", label: "文件名", icon: "file",   desc: "紧凑列表 · 原始文件名" }
  ];

  var S = defaults();
  var ALL = [];
  var CATS = [];
  var CAT_BY_ID = {};
  var CACHE = {};
  var L = null;
  var canvas = null;
  var root = null;
  var win = null;
  var embedded = IS_PANEL;
  var hoverKey = null;
  var press = null;
  var drag = null;
  var focus = null;
  var menu = null;
  var lastClick = null;
  var lastPaint = 0;
  var lastCanvasW = -1, lastCanvasH = -1;
  var drawing = false;
  var lastError = "";
  var errorLogged = false;
  var toastText = "";
  var toastUntil = 0;
  var toastKind = "ok";
  var UI = { onboarding: false, settings: false };
  var onboardLib = "";
  var onboardCfg = "";
  var onboardError = "";
  var settingsDraft = null;
  var settingsError = "";
  var fontCache = {};
  var docsCache = "";
  var WIDTH_CACHE = {}, WIDTH_CACHE_N = 0;
  var BRUSH_CACHE = {}, BRUSH_N = 0, BRUSH_G = null;
  var PEN_CACHE = {}, PEN_N = 0, PEN_G = null;
  var PRESET_CACHE = { key: "", list: null };
  var RECENT_MAP = { version: -1, map: null };
  var DATA_VERSION = 0;
  var CACHE_LIB = "";

  // ---------------------------------------------------------------- small helpers
  function nowMs() { return (new Date()).getTime(); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function trimStr(s) { return String(s || "").replace(/^\s+|\s+$/g, ""); }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function normPath(p) {
    p = trimStr(p).replace(/\\/g, "/").replace(/\/+/g, "/");
    if (p.length > 1) p = p.replace(/\/+$/, "");
    return p;
  }
  function stripExt(name) { return String(name || "").replace(/\.[^.]+$/, ""); }
  function extOf(name) {
    var m = String(name || "").match(/\.([^.]+)$/);
    return m ? m[1].toLowerCase() : "";
  }
  function baseName(path) { return String(path || "").replace(/^.*\//, ""); }
  function dirName(path) {
    var p = normPath(path), i = p.lastIndexOf("/");
    return i > 0 ? p.substring(0, i) : p;
  }
  function withAlpha(c, a) { return [c[0], c[1], c[2], a]; }
  function mix(c1, c2, t) {
    return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t,
            c1[2] + (c2[2] - c1[2]) * t, 1];
  }
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    function hue(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue(p, q, h + 1 / 3); g = hue(p, q, h); b = hue(p, q, h - 1 / 3);
    }
    return [r, g, b, 1];
  }
  function font(size, bold) {
    var k = size + "|" + (bold ? 1 : 0);
    if (!fontCache[k]) {
      try { fontCache[k] = ScriptUI.newFont(FONT_FAMILY, bold ? "BOLD" : "REGULAR", size); }
      catch (e) { fontCache[k] = null; }
    }
    return fontCache[k];
  }
  function visualWidth(s, size) {
    s = String(s);
    var key = "$" + s;
    var bySize = WIDTH_CACHE[size];
    if (bySize && Object.prototype.hasOwnProperty.call(bySize, key)) return bySize[key];
    var w = 0, i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      w += (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) ||
           (c >= 0xff00 && c <= 0xffef) || c === 0x2026 ? size * 1.12 : size * 0.56;
    }
    if (!bySize) { bySize = WIDTH_CACHE[size] = {}; }
    if (WIDTH_CACHE_N >= 4000) { WIDTH_CACHE = {}; WIDTH_CACHE_N = 0; bySize = WIDTH_CACHE[size] = {}; }
    bySize[key] = w;
    WIDTH_CACHE_N++;
    return w;
  }
  function ellipsize(s, size, maxW) {
    s = String(s);
    if (!maxW || maxW <= 0 || visualWidth(s, size) <= maxW) return s;
    var out = "", w = 0, i, ch;
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      var cw = (ch.charCodeAt(0) >= 0x2e80) ? size * 1.12 : size * 0.56;
      if (w + cw + size * 1.1 > maxW) break;
      out += ch; w += cw;
    }
    return out + "…";
  }
  function fitPath(p, size, maxW) {
    p = String(p || "");
    if (!maxW || visualWidth(p, size) <= maxW) return p;
    var tail = "", i;
    for (i = p.length - 1; i >= 0; i--) {
      var ch = p.charAt(i);
      var cw = (ch.charCodeAt(0) >= 0x2e80) ? size * 1.12 : size * 0.56;
      if (visualWidth("…" + ch + tail, size) > maxW) break;
      tail = ch + tail;
    }
    return "…" + tail;
  }
  function normFolderPath(p) {
    p = normPath(p);
    if (!p) return p;
    var f = new Folder(p);
    return f.exists ? normPath(f.fsName) : p;
  }
  function findHomePath() {
    var users = new Folder("C:/Users"), files = [], i, home = "";
    try { if (users.exists) files = users.getFiles() || []; } catch (e) {}
    for (i = 0; i < files.length; i++) {
      if (!(files[i] instanceof Folder)) continue;
      var n = String(files[i].name || "");
      if (n === "Public" || n === "Default" || n === "All Users" || n === "Default User") continue;
      try {
        if (new Folder(normPath(files[i].fsName) + "/AppData/Roaming/EffectCraft").exists) { home = normPath(files[i].fsName); break; }
      } catch (e2) {}
    }
    if (!home) {
      for (i = 0; i < files.length; i++) {
        if (!(files[i] instanceof Folder)) continue;
        try {
          if (new Folder(normPath(files[i].fsName) + "/Documents").exists) { home = normPath(files[i].fsName); break; }
        } catch (e3) {}
      }
    }
    return home;
  }
  function docsPath() {
    if (docsCache) return docsCache;
    try { if (Folder.myDocuments && Folder.myDocuments.fsName) { docsCache = normPath(Folder.myDocuments.fsName); return docsCache; } } catch (e) {}
    try { if (Folder.current && Folder.current.fsName) { docsCache = normPath(Folder.current.fsName); return docsCache; } } catch (e2) {}
    var home = findHomePath();
    if (home) {
      try {
        var d = new Folder(home + "/Documents");
        if (d.exists) { docsCache = normPath(d.fsName); return docsCache; }
      } catch (e3) {}
    }
    try {
      var pub = new Folder("C:/Users/Public/Documents");
      if (pub.exists) { docsCache = normPath(pub.fsName); return docsCache; }
    } catch (e4) {}
    docsCache = "C:/Users";
    return docsCache;
  }
  function defaults() {
    var d = docsPath();
    return {
      library: normPath(d + "/suko"),
      configDir: normPath(d + "/suko"),
      display: "filename",
      lang: "zh",
      zoom: 132,
      selected: "",
      sub: "",
      search: "",
      onboarded: false,
      recent: [],
      current: "",
      scroll: 0,
      navScroll: 0,
      chipScroll: 0
    };
  }
  function configPath() { return normPath((S.configDir || defaults().configDir) + "/" + CONFIG_NAME); }
  function modeInfo(id) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === id) return MODES[i];
    return MODES[0];
  }

  // ---------------------------------------------------------------- state
  function mergeState(o) {
    if (!o || typeof o !== "object") return;
    if (typeof o.library === "string" && trimStr(o.library)) S.library = normPath(o.library);
    if (typeof o.configDir === "string" && trimStr(o.configDir)) S.configDir = normPath(o.configDir);
    if (o.display === "preview" || o.display === "preset" || o.display === "filename") S.display = o.display;
    if (o.lang === "zh" || o.lang === "en") S.lang = o.lang;
    if (o.zoom !== undefined && isFinite(Number(o.zoom))) S.zoom = clamp(Number(o.zoom), 84, 240);
    if (o.selected !== undefined && typeof o.selected === "string") S.selected = o.selected;
    if (o.sub !== undefined && typeof o.sub === "string") S.sub = o.sub;
    if (typeof o.onboarded === "boolean") S.onboarded = o.onboarded;
    if (o.recent && o.recent.length !== undefined) {
      var r = [], i;
      for (i = 0; i < o.recent.length && i < 20; i++) if (typeof o.recent[i] === "string") r.push(o.recent[i]);
      S.recent = r;
    }
    if (typeof o.current === "string") S.current = o.current;
  }
  function loadState() {
    var base = defaults();
    S = base;
    try {
      if (app.settings.haveSetting(SECTION, SETTINGS_KEY)) {
        var raw = app.settings.getSetting(SECTION, SETTINGS_KEY);
        if (raw) mergeState(JSON.parse(raw));
      }
    } catch (e) {}
    var cp = configPath();
    try {
      var f = new File(cp);
      if (f.exists) {
        f.encoding = "UTF-8";
        if (f.open("r")) {
          var body = f.read();
          f.close();
          if (body) mergeState(JSON.parse(body));
        }
      }
    } catch (e2) {}
    S.library = normPath(S.library || base.library);
    S.configDir = normPath(S.configDir || base.configDir);
    if (!S.recent) S.recent = [];
    if (S.zoom < 84) S.zoom = 84;
    if (S.zoom > 240) S.zoom = 240;
  }
  function configPayload() {
    return {
      app: "suko",
      version: VERSION,
      library: S.library,
      configDir: S.configDir,
      display: S.display,
      lang: S.lang,
      zoom: S.zoom,
      onboarded: S.onboarded,
      recent: S.recent,
      current: S.current,
      selected: S.selected,
      sub: S.sub
    };
  }
  function writeConfig() {
    try {
      var dir = new Folder(S.configDir || defaults().configDir);
      if (!dir.exists && !dir.create()) return false;
      var f = new File(configPath());
      f.encoding = "UTF-8";
      if (!f.open("w")) return false;
      f.write(JSON.stringify(configPayload()));
      f.close();
      return true;
    } catch (e) { return false; }
  }
  function saveState(silent) {
    try { app.settings.saveSetting(SECTION, SETTINGS_KEY, JSON.stringify(configPayload())); } catch (e) {}
    var ok = writeConfig();
    if (!ok && !silent) showToast("配置文件写入失败，已暂存到应用设置", "warn");
  }
  function addRecent(path) {
    var out = [path], i;
    for (i = 0; i < S.recent.length; i++) if (S.recent[i] !== path && out.length < 12) out.push(S.recent[i]);
    S.recent = out;
  }

  // ---------------------------------------------------------------- preset library
  function sortFiles(a, b) {
    var an = String(a.name || a).toLowerCase(), bn = String(b.name || b).toLowerCase();
    return an < bn ? -1 : (an > bn ? 1 : 0);
  }
  function subfolders(folder) {
    var out = [], files = [], i;
    try { files = folder.getFiles() || []; } catch (e) { return out; }
    for (i = 0; i < files.length; i++) {
      if (files[i] instanceof Folder) {
        var n = String(files[i].name || "");
        if (n.charAt(0) !== ".") out.push(files[i]);
      }
    }
    out.sort(sortFiles);
    return out;
  }
  function presetFiles(folder) {
    var out = [], files = [], i;
    try { files = folder.getFiles() || []; } catch (e) { return out; }
    for (i = 0; i < files.length; i++) {
      if (files[i] instanceof File) {
        var n = String(files[i].name || "");
        if (n.charAt(0) !== "." && extOf(n) === "ecpreset") out.push(files[i]);
      }
    }
    out.sort(sortFiles);
    return out;
  }
  function hashHue(s) {
    var h = 0, i;
    s = String(s);
    for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }
  function keyNumber(k) {
    if (k === null || k === undefined) return null;
    if (typeof k === "number") return isFinite(k) ? k : null;
    if (typeof k === "string") { var n = parseFloat(k); return isFinite(n) ? n : null; }
    if (k.v !== undefined) return keyNumber(k.v);
    if (k.length !== undefined && k.length > 0) return keyNumber(k[0]);
    return null;
  }
  function keyValue(k) {
    if (k === null || k === undefined) return null;
    if (k.value !== undefined) return keyNumber(k.value);
    if (k.length !== undefined && k.length > 1 && typeof k[0] === "number") return keyNumber(k[1]);
    return keyNumber(k);
  }
  function curveFromProps(props) {
    var i, j, ks, pts, k, v, t, best = null;
    for (i = 0; i < props.length; i++) {
      ks = props[i].keys || [];
      if (ks.length < 2) continue;
      pts = [];
      for (j = 0; j < ks.length; j++) {
        k = ks[j];
        v = keyValue(k);
        if (v === null) continue;
        t = (k && k.time !== undefined) ? Number(k.time) : (k && k.length ? Number(k[0]) : j);
        if (!isFinite(t)) t = j;
        pts.push([t, v]);
      }
      if (pts.length < 2) continue;
      pts.sort(function (a, b) { return a[0] - b[0]; });
      var t0 = pts[0][0], t1 = pts[pts.length - 1][0];
      var vmin = pts[0][1], vmax = pts[0][1];
      for (j = 1; j < pts.length; j++) {
        if (pts[j][1] < vmin) vmin = pts[j][1];
        if (pts[j][1] > vmax) vmax = pts[j][1];
      }
      var spanT = t1 - t0, spanV = vmax - vmin;
      var norm = [];
      for (j = 0; j < pts.length; j++) {
        norm.push([
          spanT > 0 ? (pts[j][0] - t0) / spanT : (pts.length > 1 ? j / (pts.length - 1) : 0.5),
          spanV > 0 ? (pts[j][1] - vmin) / spanV : 0.5
        ]);
      }
      if (!best || norm.length > best.length) best = norm;
    }
    return best;
  }
  function propLabel(path) {
    var p = String(path || "").replace(/\\/g, "/"), seg = p.split("/");
    var last = seg.length ? seg[seg.length - 1] : p;
    var map = {
      position: "位置", opacity: "不透明度", scale: "缩放", rotation: "旋转",
      anchorPoint: "锚点", "anchor_point": "锚点", blurriness: "模糊",
      "blur": "模糊", amount: "强度", radius: "半径", size: "大小",
      transform: "变换", time: "时间", color: "颜色", light: "光照"
    };
    return map[last] || last;
  }
  function effectName(e) {
    if (!e) return "效果";
    if (typeof e === "string") return e;
    return e.name || e.matchName || e.match_name || e.id || e.type || "效果";
  }
  function readPreset(file, catId, subId) {
    var path = normPath(file.fsName || file);
    var mtime = 0;
    try { if (file.modified) mtime = file.modified.getTime(); } catch (e0) {}
    var ck = path + "|" + mtime;
    if (CACHE[ck]) return CACHE[ck];
    var p = {
      path: path, file: file, name: stripExt(file.name), filename: String(file.name),
      cat: catId, sub: subId, rel: "", kind: "属性", meta: "", hue: 0,
      props: 0, effects: 0, keys: 0, curve: null, broken: false, error: "",
      effectNames: [], mtime: mtime, textAnim: false, animatorName: "animator", animatorProps: []
    };
    var data = null, body = "";
    try {
      file.encoding = "UTF-8";
      if (file.open("r")) { body = file.read(); file.close(); }
    } catch (e1) { p.broken = true; p.error = "无法读取"; }
    if (!p.broken && body) {
      try { data = JSON.parse(body); }
      catch (e2) { p.broken = true; p.error = "JSON 解析失败"; }
    }
    if (data) {
      if (data.name) p.name = String(data.name);
      var props = data.properties || [];
      p.props = props.length;
      var i;
      for (i = 0; i < props.length; i++) {
        p.keys += (props[i].keys ? props[i].keys.length : 0);
        var pp = String(props[i].path || "");
        if (pp.indexOf("text/animators/") === 0) {
          p.textAnim = true;
          var seg = pp.substring("text/animators/".length).split("/");
          if (seg[0]) p.animatorName = seg[0];
          if (seg[1] === "properties" && seg[2] && p.animatorProps.indexOf(seg[2]) < 0) p.animatorProps.push(seg[2]);
        }
      }
      p.curve = curveFromProps(props);
      var effs = data.effects || [];
      p.effects = effs.length;
      for (i = 0; i < effs.length && i < 8; i++) p.effectNames.push(effectName(effs[i]));
      p.kind = p.keys > 0 ? "动画" : (p.effects > 0 ? "效果" : "属性");
      var labels = [], seen = {};
      for (i = 0; i < props.length && labels.length < 3; i++) {
        var lb = propLabel(props[i].path);
        if (!seen[lb]) { seen[lb] = true; labels.push(lb); }
      }
      if (!labels.length && p.effectNames.length) labels = p.effectNames;
      p.meta = labels.length ? labels.join(" · ") : (p.broken ? p.error : "预设");
      if (p.props > 3) p.meta += "  +" + (p.props - 3);
    }
    if (!p.meta) p.meta = p.effects ? (p.effects + " 个效果") : (p.props + " 项属性");
    p.hue = hashHue(p.name + "|" + path) / 360;
    try {
      var rootPath = normPath(S.library);
      p.rel = path.indexOf(rootPath + "/") === 0 ? path.substring(rootPath.length + 1) : path;
    } catch (e3) { p.rel = path; }
    p.hay = (p.name + " " + p.filename + " " + p.rel + " " + p.meta + " " + p.effectNames.join(" ")).toLowerCase();
    p.rowCol = hsl(p.hue * 360 + 40, 0.5, 0.46);
    p.thumbCol = hsl(p.hue * 360 + 18, 0.38, 0.20);
    CACHE[ck] = p;
    return p;
  }
  function pruneCache() {
    var live = {}, i, k;
    for (i = 0; i < ALL.length; i++) live[ALL[i].path] = ALL[i].mtime;
    for (k in CACHE) {
      if (!Object.prototype.hasOwnProperty.call(CACHE, k)) continue;
      var p = CACHE[k];
      if (!p || live[p.path] === undefined || live[p.path] !== p.mtime) delete CACHE[k];
    }
  }
  function readFolder(folder, catId, subId) {
    var files = presetFiles(folder), out = [], i;
    for (i = 0; i < files.length; i++) {
      try { out.push(readPreset(files[i], catId, subId)); } catch (e) {}
    }
    out.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    return out;
  }
  function scanLibrary() {
    var rootFolder = new Folder(S.library);
    if (CACHE_LIB !== S.library) { CACHE = {}; CACHE_LIB = S.library; }
    ALL = []; CATS = []; CAT_BY_ID = {};
    if (!rootFolder.exists) {
      S.current = "";
      DATA_VERSION++;
      PRESET_CACHE.key = "";
      return false;
    }
    var i, j, top, sub;
    var tops = subfolders(rootFolder);
    for (i = 0; i < tops.length; i++) {
      top = tops[i];
      var cid = "c:" + i;
      var cat = {
        id: cid, name: String(top.name || "文件夹"), path: normPath(top.fsName),
        presets: readFolder(top, cid, ""), subs: [], count: 0
      };
      var subs = subfolders(top);
      for (j = 0; j < subs.length; j++) {
        sub = subs[j];
        var sid = cid + ":" + j;
        var sp = readFolder(sub, cid, sid);
        cat.subs.push({
          id: sid, name: String(sub.name || "子文件夹"), path: normPath(sub.fsName),
          presets: sp, count: sp.length
        });
      }
      cat.count = cat.presets.length;
      for (j = 0; j < cat.subs.length; j++) cat.count += cat.subs[j].count;
      CATS.push(cat); CAT_BY_ID[cid] = cat;
    }
    for (i = 0; i < CATS.length; i++) {
      for (j = 0; j < CATS[i].presets.length; j++) ALL.push(CATS[i].presets[j]);
      for (var k = 0; k < CATS[i].subs.length; k++) {
        for (j = 0; j < CATS[i].subs[k].presets.length; j++) ALL.push(CATS[i].subs[k].presets[j]);
      }
    }
    ALL.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
    if (!S.selected || (S.selected !== CAT_ALL && S.selected !== CAT_RECENT && !CAT_BY_ID[S.selected])) {
      S.selected = CATS.length ? CATS[0].id : "";
    }
    if (S.selected && S.selected.indexOf("c:") === 0) {
      var sc = CAT_BY_ID[S.selected], found = false;
      for (j = 0; sc && j < sc.subs.length; j++) if (sc.subs[j].id === S.sub) found = true;
      if (!found) S.sub = "";
    } else if (S.selected !== CAT_ALL) S.sub = "";
    var curFound = false;
    for (i = 0; i < ALL.length; i++) if (ALL[i].path === S.current) curFound = true;
    if (!curFound) S.current = "";
    pruneCache();
    DATA_VERSION++;
    PRESET_CACHE.key = "";
    return true;
  }
  function recentPresets() {
    if (RECENT_MAP.version !== DATA_VERSION) {
      var by = {}, i;
      for (i = 0; i < ALL.length; i++) by[ALL[i].path] = ALL[i];
      RECENT_MAP.version = DATA_VERSION;
      RECENT_MAP.map = by;
    }
    var out = [], map = RECENT_MAP.map;
    for (var j = 0; j < S.recent.length; j++) if (map[S.recent[j]]) out.push(map[S.recent[j]]);
    return out;
  }
  function currentCategory() {
    if (S.selected === CAT_ALL || S.selected === CAT_RECENT) return null;
    return CAT_BY_ID[S.selected] || null;
  }
  function presetsCacheKey() {
    return DATA_VERSION + "|" + S.selected + "|" + S.sub + "|" + trimStr(S.search).toLowerCase() +
      (S.selected === CAT_RECENT ? "|" + S.recent.join(",") : "");
  }
  function currentPresets() {
    var key = presetsCacheKey();
    if (PRESET_CACHE.list && PRESET_CACHE.key === key) return PRESET_CACHE.list;
    var base = [], i, cat;
    if (S.selected === CAT_RECENT) base = recentPresets();
    else if (!S.selected) base = ALL.slice();
    else if (S.selected !== CAT_ALL) {
      cat = currentCategory();
      if (cat) {
        if (S.sub) {
          for (i = 0; i < cat.subs.length; i++) if (cat.subs[i].id === S.sub) base = cat.subs[i].presets.slice();
        } else {
          base = cat.presets.slice();
        }
      }
    } else base = ALL.slice();
    var q = trimStr(S.search).toLowerCase();
    if (q) {
      var out = [];
      for (i = 0; i < base.length; i++) {
        var p = base[i];
        var hay = p.hay || (p.name + " " + p.filename + " " + p.rel + " " + p.meta + " " + p.effectNames.join(" ")).toLowerCase();
        if (hay.indexOf(q) >= 0) out.push(p);
      }
      base = out;
    }
    PRESET_CACHE.key = key;
    PRESET_CACHE.list = base;
    return base;
  }
  function selectedFolderPath() {
    var cat = currentCategory();
    if (!cat) return S.library;
    if (S.sub) {
      for (var i = 0; i < cat.subs.length; i++) if (cat.subs[i].id === S.sub) return cat.subs[i].path;
    }
    return cat.path;
  }
  function findPreset(path) {
    for (var i = 0; i < ALL.length; i++) if (ALL[i].path === path) return ALL[i];
    return null;
  }
  function libraryOk() { try { return new Folder(S.library).exists; } catch (e) { return false; } }

  // ---------------------------------------------------------------- actions
  function showToast(text, kind) {
    toastText = l10n(text);
    toastKind = kind || "ok";
    toastUntil = nowMs() + 2600;
  }
  function openLibraryFolder(path) {
    var f = new Folder(path || S.library);
    if (!f.exists) { showToast("文件夹不存在", "warn"); return; }
    try { f.execute(); } catch (e) { showToast("无法打开文件夹", "warn"); }
  }
  function textAnimatorExists(layer, name) {
    try {
      var tp = layer.property("ADBE Text Properties") || layer.property("Text");
      if (!tp) return false;
      var an = tp.property("ADBE Text Animators");
      if (!an) return false;
      for (var i = 1; i <= an.numProperties; i++) {
        try { if (String(an.property(i).name) === name) return true; } catch (e0) {}
      }
    } catch (e1) {}
    return false;
  }
  function ensureTextAnimator(layer, p) {
    if (!p.textAnim) return true;
    var props = p.animatorProps && p.animatorProps.length ? p.animatorProps : ["blur"];
    var name = p.animatorName || "animator";
    if (textAnimatorExists(layer, name)) return true;
    try {
      var tp = layer.property("ADBE Text Properties") || layer.property("Text");
      if (!tp) return false;
      if (!app.run) throw new Error("当前版本不支持创建文本动画器");
      var lid = layer.id;
      app.run("layer.addTextAnimator", { layer: lid, properties: props, name: name });
      return true;
    } catch (e2) {
      throw new Error("无法创建文本动画器：" + (e2 && e2.message ? e2.message : String(e2)));
    }
  }
  function applyPreset(p) {
    if (!p || p.broken) { showToast("这个预设文件无法读取", "warn"); return; }
    var comp = null;
    try { comp = app.project.activeItem; } catch (e) {}
    if (!comp || !comp.layers) { showToast("请先打开一个合成", "warn"); return; }
    var layers = comp.selectedLayers || [];
    if (!layers.length) { showToast("请先选择至少一个图层", "warn"); return; }
    var ok = 0, err = "", i, f = new File(p.path);
    if (!f.exists) { showToast("预设文件已不存在", "warn"); return; }
    var begun = false;
    try { app.beginUndoGroup("suko: 应用预设"); begun = true; } catch (e2) {}
    for (i = 0; i < layers.length; i++) {
      try {
        if (!ensureTextAnimator(layers[i], p)) throw new Error("这个预设需要文字图层");
        if (layers[i].applyPreset) layers[i].applyPreset(f);
        else if (app.run) app.run("anim.applyPreset", { path: p.path, layers: [layers[i]] });
        else throw new Error("当前版本不支持应用预设");
        ok++;
      } catch (e3) {
        err = e3 && e3.message ? e3.message : String(e3);
        try { if (app.run) { app.run("anim.applyPreset", { path: p.path, layers: [layers[i]] }); ok++; err = ""; } } catch (e4) { err = e4 && e4.message ? e4.message : String(e4); }
      }
    }
    if (begun) { try { app.endUndoGroup(); } catch (e5) {} }
    if (ok > 0) {
      addRecent(p.path);
      S.current = p.path;
      saveState(true);
      showToast("已应用 · " + p.name + (ok > 1 ? "（" + ok + " 个图层）" : ""));
    } else {
      showToast("应用失败" + (err ? "：" + err : ""), "warn");
    }
    redraw(true);
  }
  function saveCurrentPreset() {
    var comp = null;
    try { comp = app.project.activeItem; } catch (e) {}
    if (!comp || !comp.layers) { showToast("请先打开一个合成", "warn"); return; }
    var layers = comp.selectedLayers || [];
    if (!layers.length) { showToast("请先选择图层并选中属性", "warn"); return; }
    var hasSelected = false, si;
    for (si = 0; si < layers.length; si++) {
      try { if ((layers[si].selectedProperties || []).length) { hasSelected = true; break; } } catch (eSel) {}
    }
    if (!hasSelected) { showToast("请先选中要保存的属性或效果", "warn"); return; }
    var folderPath = selectedFolderPath();
    var folder = new Folder(folderPath);
    if (!folder.exists) { showToast("目标文件夹不存在", "warn"); return; }
    var def = layers[0].name ? String(layers[0].name) + " 预设" : "我的预设";
    promptText("保存当前预设", "预设名称", def, function (name) {
      var safe = trimStr(name).replace(/[\\\/:*?"<>|]/g, "_");
      if (!safe) { showToast("名称不能为空", "warn"); return; }
      var path = folderPath + "/" + safe + ".ecpreset";
      var n = 2, test = new File(path);
      while (test.exists && n < 999) { path = folderPath + "/" + safe + " " + n + ".ecpreset"; test = new File(path); n++; }
      try {
        if (!app.run) throw new Error("当前版本不支持保存预设");
        app.run("anim.savePreset", { path: path, name: trimStr(name) });
        scanLibrary();
        S.current = normPath(path);
        saveState(true);
        showToast("已保存 · " + baseName(path));
      } catch (e2) {
        var em = e2 && e2.message ? String(e2.message) : String(e2);
        if (em.indexOf("not available") >= 0) em = "请先选中要保存的属性或效果";
        showToast("保存失败：" + em, "warn");
      }
      redraw(true);
    });
  }
  function validateFolderField(path, create) {
    var p = normPath(path);
    if (!p) return { ok: false, error: "路径不能为空" };
    var f = new Folder(p);
    if (!f.exists) {
      if (!create) return { ok: false, error: "文件夹不存在" };
      try { f.create(); } catch (e) {}
      if (!f.exists) return { ok: false, error: "无法创建文件夹" };
    }
    return { ok: true, path: normPath(f.fsName) };
  }
  function startUsing() {
    var lv = validateFolderField(onboardLib, true);
    if (!lv.ok) { onboardError = "预设库：" + lv.error; redraw(true); return; }
    var cv = validateFolderField(onboardCfg, true);
    if (!cv.ok) { onboardError = "配置文件夹：" + cv.error; redraw(true); return; }
    S.library = lv.path;
    S.configDir = cv.path;
    S.onboarded = true;
    onboardError = "";
    scanLibrary();
    UI.onboarding = false;
    focus = null;
    saveState(false);
    showToast("欢迎使用 suko");
    redraw(true);
  }
  function openOnboarding(force) {
    onboardLib = S.library;
    onboardCfg = S.configDir;
    onboardError = "";
    UI.onboarding = true;
    UI.settings = false;
    settingsDraft = null;
    focus = null;
    menu = null;
    if (force) S.onboarded = false;
    redraw(true);
  }
  function openSettings() {
    settingsDraft = { library: S.library, configDir: S.configDir, lang: S.lang };
    settingsError = "";
    UI.settings = true;
    UI.onboarding = false;
    focus = null;
    menu = null;
    redraw(true);
  }
  function closeSettings(commitDisplay) {
    UI.settings = false;
    settingsDraft = null;
    settingsError = "";
    focus = null;
    if (commitDisplay !== false) saveState(true);
    redraw(true);
  }
  function saveSettings() {
    if (!settingsDraft) return;
    var lv = validateFolderField(settingsDraft.library, true);
    if (!lv.ok) { settingsError = "预设库：" + lv.error; redraw(true); return; }
    var cv = validateFolderField(settingsDraft.configDir, true);
    if (!cv.ok) { settingsError = "配置文件夹：" + cv.error; redraw(true); return; }
    S.library = lv.path;
    S.configDir = cv.path;
    if (settingsDraft.lang === "zh" || settingsDraft.lang === "en") S.lang = settingsDraft.lang;
    S.onboarded = true;
    settingsError = "";
    scanLibrary();
    UI.settings = false;
    settingsDraft = null;
    focus = null;
    saveState(false);
    showToast("设置已保存");
    redraw(true);
  }

  // ---------------------------------------------------------------- dialogs
  function driveList() {
    var out = [], i, letter, f;
    for (i = 65; i <= 90; i++) {
      letter = String.fromCharCode(i) + ":";
      try {
        f = new Folder(letter + "/");
        if (f.exists) out.push(letter);
      } catch (e) {}
    }
    if (!out.length) out.push("/");
    return out;
  }
  var auxWindows = [];
  function trackAux(win) {
    auxWindows.push(win);
    win.onClose = function () {
      for (var i = auxWindows.length - 1; i >= 0; i--) if (auxWindows[i] === win) auxWindows.splice(i, 1);
    };
  }
  function chooseFolder(start, title, cb) {
    var dlg = new Window("palette", l10n(title || "选择文件夹"));
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = 12;
    dlg.spacing = 8;
    try { dlg.preferredSize = [520, 420]; } catch (e0) {}
    var top = dlg.add("group");
    top.alignment = ["fill", "top"];
    top.spacing = 6;
    var drives = driveList();
    var driveDrop = top.add("dropdownlist", undefined, drives);
    try { driveDrop.preferredSize = [56, 24]; } catch (e1) {}
    var pathEt = top.add("edittext", undefined, "");
    pathEt.alignment = ["fill", "center"];
    pathEt.characters = 44;
    var goBtn = top.add("button", undefined, l10n("转到"));
    var list = dlg.add("listbox", undefined, [], { multiselect: false });
    list.alignment = ["fill", "fill"];
    try { list.preferredSize = [490, 270]; } catch (e2) {}
    var msg = dlg.add("statictext", undefined, "");
    msg.alignment = ["fill", "top"];
    var bottom = dlg.add("group");
    bottom.alignment = ["fill", "top"];
    var upBtn = bottom.add("button", undefined, l10n("上一级"));
    var spacer = bottom.add("statictext", undefined, "");
    spacer.alignment = ["fill", "center"];
    var cancelBtn = bottom.add("button", undefined, l10n("取消"));
    var okBtn = bottom.add("button", undefined, l10n("选择此文件夹"));
    var cur = new Folder(start || S.library || docsPath());
    if (!cur.exists) cur = new Folder(docsPath());
    function setMsg(s) { try { msg.text = s || ""; } catch (e) {} }
    function fill(folder) {
      cur = folder;
      pathEt.text = normPath(folder.fsName);
      setMsg("");
      try { list.removeAll(); } catch (e) {}
      var here = list.add("item", l10n("  ● 使用当前文件夹"));
      here.folder = folder;
      var parent = null;
      try { parent = folder.parent; } catch (e2) {}
      if (parent && parent.exists && normPath(parent.fsName) !== normPath(folder.fsName)) {
        var it = list.add("item", "..   上一级"); it.folder = parent;
      }
      var subs = subfolders(folder), i;
      for (i = 0; i < subs.length; i++) {
        var row = list.add("item", "  " + subs[i].name);
        row.folder = subs[i];
      }
      try { list.selection = null; } catch (e3) {}
    }
    function selectedFolder() {
      try {
        if (list.selection && list.selection.folder) return list.selection.folder;
      } catch (e) {}
      return cur;
    }
    pathEt.onEnterKey = function () {
      var f = new Folder(pathEt.text);
      if (f.exists) fill(f); else setMsg("路径不存在");
    };
    goBtn.onClick = function () {
      var f = new Folder(pathEt.text);
      if (f.exists) fill(f); else setMsg("路径不存在");
    };
    driveDrop.onChange = function () {
      var d = String(driveDrop.selection);
      fill(new Folder(d + "/"));
    };
    upBtn.onClick = function () {
      try { if (cur.parent && cur.parent.exists) fill(cur.parent); } catch (e) {}
    };
    list.onDoubleClick = function () {
      var f = selectedFolder();
      if (f && f.exists) fill(f);
    };
    cancelBtn.onClick = function () { dlg.close(0); };
    okBtn.onClick = function () {
      var f = selectedFolder();
      if (!f || !f.exists) { setMsg("请选择一个存在的文件夹"); return; }
      dlg.close(1);
      cb(normPath(f.fsName));
    };
    try { dlg.defaultElement = okBtn; dlg.cancelElement = cancelBtn; } catch (e4) {}
    fill(cur);
    for (var di = 0; di < drives.length; di++) {
      if (normPath(cur.fsName).indexOf(drives[di] + "/") === 0) { try { driveDrop.selection = di; } catch (e5) {} break; }
    }
    trackAux(dlg);
    dlg.show();
  }
  function promptText(title, label, initial, cb, emptyMsg) {
    var dlg = new Window("palette", l10n(title));
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = 16;
    dlg.spacing = 10;
    var lbl = dlg.add("statictext", undefined, l10n(label));
    var et = dlg.add("edittext", undefined, initial || "");
    et.characters = 32;
    var err = dlg.add("statictext", undefined, "");
    var row = dlg.add("group");
    row.alignment = ["right", "top"];
    var cancel = row.add("button", undefined, l10n("取消"));
    var ok = row.add("button", undefined, l10n("确定"));
    cancel.onClick = function () { dlg.close(0); };
    ok.onClick = function () {
      var v = trimStr(et.text);
      if (!v) { err.text = l10n(emptyMsg || "请输入名称"); return; }
      dlg.close(1);
      cb(v);
    };
    try { dlg.defaultElement = ok; dlg.cancelElement = cancel; et.active = true; } catch (e) {}
    trackAux(dlg);
    dlg.show();
  }
  function createFolder(parentPath, parentCatId) {
    if (!S.library) { showToast("请先在设置里选择预设库", "warn"); return; }
    var parent = parentPath || S.library;
    promptText(parentCatId ? "新建二级文件夹" : "新建文件夹",
      parentCatId ? "在当前一级文件夹下新建二级文件夹" : "在预设库下新建第一层文件夹",
      "新建文件夹", function (name) {
      if (/[\\/:*?"<>|]/.test(name) || name === "." || name === "..") {
        showToast("文件夹名不能包含 \\ / : * ? \" < > |", "warn");
        return;
      }
      var base = String(parent).replace(/\\/g, "/").replace(/\/+$/, "");
      var path = base + "/" + name;
      var f = new Folder(path);
      if (f.exists) { showToast("文件夹已存在 · " + name, "warn"); return; }
      var ok = false;
      try { ok = f.create(); } catch (e) {}
      if (!ok) { showToast("无法创建文件夹", "warn"); return; }
      scanLibrary();
      if (parentCatId) {
        S.selected = parentCatId;
        var pc = CAT_BY_ID[parentCatId], subId = "";
        if (pc) {
          for (var j = 0; j < pc.subs.length; j++) if (pc.subs[j].name === name) subId = pc.subs[j].id;
        }
        S.sub = subId;
      } else {
        for (var i = 0; i < CATS.length; i++) {
          if (CATS[i].name === name) { S.selected = CATS[i].id; break; }
        }
        S.sub = "";
      }
      S.scroll = 0; S.navScroll = 0;
      saveState(true);
      redraw(true);
      showToast("已新建文件夹 · " + name, "ok");
    }, "请输入文件夹名称");
  }
  // EffectCraft's ScriptUI canvas does not reliably deliver keydown events, so the
  // search box opens a small native palette with a real edittext instead of trying
  // to implement an invisible caret in onDraw.
  function openSearchDialog() {
    var dlg = new Window("palette", l10n("搜索预设"));
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = 16;
    dlg.spacing = 8;
    var lbl = dlg.add("statictext", undefined, l10n("按名称、文件夹或属性筛选"));
    var et = dlg.add("edittext", undefined, S.search || "");
    et.characters = 34;
    var row = dlg.add("group");
    row.alignment = ["right", "top"];
    var clear = row.add("button", undefined, l10n("清除"));
    var cancel = row.add("button", undefined, l10n("取消"));
    var ok = row.add("button", undefined, l10n("搜索"));
    function commit() {
      S.search = trimStr(et.text);
      S.scroll = 0;
      focus = null;
      try { dlg.close(1); } catch (e) {}
      redraw(true);
    }
    clear.onClick = function () {
      S.search = "";
      S.scroll = 0;
      focus = null;
      try { dlg.close(1); } catch (e2) {}
      redraw(true);
    };
    cancel.onClick = function () { try { dlg.close(0); } catch (e3) {} };
    ok.onClick = commit;
    et.onEnterKey = commit;
    try { dlg.defaultElement = ok; dlg.cancelElement = cancel; et.active = true; } catch (e4) {}
    trackAux(dlg);
    dlg.show();
  }

  // ---------------------------------------------------------------- drawing primitives
  function colorKey(color, width) {
    color = color || [1, 1, 1, 1];
    return Math.round(color[0] * 1000) + "," + Math.round(color[1] * 1000) + "," +
           Math.round(color[2] * 1000) + "," + Math.round(color[3] * 1000) + (width ? "|" + width : "");
  }
  function cachedBrush(g, color) {
    if (g !== BRUSH_G) { BRUSH_CACHE = {}; BRUSH_N = 0; BRUSH_G = g; }
    var k = colorKey(color, 0), b = BRUSH_CACHE[k];
    if (!b) {
      if (BRUSH_N > 600) { BRUSH_CACHE = {}; BRUSH_N = 0; }
      b = g.newBrush(g.BrushType.SOLID_COLOR, color || [1, 1, 1, 1]);
      BRUSH_CACHE[k] = b;
      BRUSH_N++;
    }
    return b;
  }
  function cachedPen(g, color, width) {
    if (g !== PEN_G) { PEN_CACHE = {}; PEN_N = 0; PEN_G = g; }
    width = width || 1;
    var k = colorKey(color, width), p = PEN_CACHE[k];
    if (!p) {
      if (PEN_N > 600) { PEN_CACHE = {}; PEN_N = 0; }
      p = g.newPen(g.PenType.SOLID_COLOR, color || [1, 1, 1, 1], width);
      PEN_CACHE[k] = p;
      PEN_N++;
    }
    return p;
  }
  function roundSubpath(g, x, y, w, h, r, segOverride) {
    // 性能优先：所有“圆角”一律画直角，省掉每个圆角 8-24 个 lineTo。
    g.moveTo(x, y);
    g.lineTo(x + w, y);
    g.lineTo(x + w, y + h);
    g.lineTo(x, y + h);
    g.closePath();
  }
  function roundPath(g, x, y, w, h, r, segOverride) {
    g.newPath();
    roundSubpath(g, x, y, w, h, r, segOverride);
  }
  function fillRound(g, x, y, w, h, r, color, seg) {
    if (w <= 0 || h <= 0) return;
    if (r <= 1.5) { g.newPath(); g.rectPath(x, y, w, h); g.fillPath(cachedBrush(g, color)); return; }
    roundPath(g, x, y, w, h, r, seg);
    g.fillPath(cachedBrush(g, color));
  }
  function strokeRound(g, x, y, w, h, r, color, width) {
    if (w <= 0 || h <= 0) return;
    if (r <= 1.5) { g.newPath(); g.rectPath(x, y, w, h); g.strokePath(cachedPen(g, color, width)); return; }
    roundPath(g, x, y, w, h, r);
    g.strokePath(cachedPen(g, color, width));
  }
  function fillStrokeRound(g, x, y, w, h, r, fillColor, strokeColor, width) {
    if (w <= 0 || h <= 0) return;
    if (r <= 1.5) { g.newPath(); g.rectPath(x, y, w, h); }
    else roundPath(g, x, y, w, h, r);
    g.fillPath(cachedBrush(g, fillColor));
    g.strokePath(cachedPen(g, strokeColor, width || 1));
  }
  function line(g, x1, y1, x2, y2, color, width) {
    g.newPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
    g.strokePath(cachedPen(g, color || C.line, width || 1));
  }
  function fillRect(g, x, y, w, h, color) {
    if (w <= 0 || h <= 0) return;
    g.newPath(); g.rectPath(x, y, w, h);
    g.fillPath(cachedBrush(g, color));
  }
  function circle(g, x, y, r, fillColor, strokeColor, strokeW) {
    g.newPath(); g.ellipsePath(x - r, y - r, r * 2, r * 2);
    if (fillColor) g.fillPath(cachedBrush(g, fillColor));
    if (strokeColor) g.strokePath(cachedPen(g, strokeColor, strokeW || 1));
  }
  function arcPath(g, cx, cy, r, a0, a1, steps) {
    steps = steps || 16;
    g.newPath();
    for (var i = 0; i <= steps; i++) {
      var a = a0 + (a1 - a0) * i / steps;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  }
  var EN_TEXT = {
    "文件夹": "FOLDERS", "设置": "Settings", "保存并关闭": "Save", "重新引导": "Setup",
    "刷新": "Refresh", "浏览": "Browse", "预设库": "Library", "配置": "Config",
    "预设库位置": "Preset library", "suko 配置文件位置": "suko config location",
    "预设库路径": "Preset library path", "未设置": "Not set", "配置文件：": "Config file: ",
    "预设管理器": "Preset Manager", "根目录": "Root", "全部": "All", "新建文件夹": "New Folder",
    "新建二级文件夹": "New Subfolder", "搜索预设…": "Search presets…", "搜索预设": "Search Presets",
    "搜索": "Search", "清除": "Clear", "清除搜索": "Clear search", "取消": "Cancel", "确定": "OK",
    "删除": "Delete", "删除文件夹": "Delete Folder", "删除预设": "Delete Preset",
    "应用预设": "Apply Preset", "刷新列表": "Refresh List", "打开文件夹": "Open Folder",
    "还没有文件夹，点下方 + 新建": "No folders yet. Click + below to create one.",
    "没有匹配的预设": "No matching presets", "试试别的关键词，或清除搜索": "Try another keyword or clear the search.",
    "欢迎使用 suko": "Welcome to suko", "先告诉 suko 两件事，之后随时可以在设置里更改。": "Two quick things. You can change them later in Settings.",
    "预设库文件夹": "Preset library folder", "suko 路径文件": "suko config folder",
    "用于存放 .ecpreset 的文件夹": "Folder for .ecpreset files", "配置文件 suko.config.json 会放在这里": "suko.config.json will be stored here",
    "开始使用": "Get Started", "用默认": "Use Defaults", "预设库：": "Preset library: ",
    "配置文件夹：": "Config folder: ", "正在加载": "Loading", "应用后": "AFTER", "应用前": "BEFORE",
    "示意": "SAMPLE", "搜索预设…": "Search presets…", "按名称、文件夹或属性筛选": "Filter by name, folder or property",
    "删除后无法恢复；这不会影响当前项目。": "This cannot be undone. The current project is not affected.",
    "确定删除这个预设吗？": "Delete this preset?", "确定删除这个文件夹吗？": "Delete this folder?",
    "文件夹或其中的文件可能被占用": "A folder or file may be in use", "文件夹不存在": "Folder does not exist",
    "路径不存在": "Path does not exist", "请选择一个存在的文件夹": "Choose an existing folder",
    "请输入文件夹名称": "Enter a folder name", "请输入名称": "Enter a name", "请输入路径": "Enter a path",
    "名称不能为空": "Name cannot be empty", "路径不能为空": "Path cannot be empty",
    "当前版本不支持应用预设": "This version cannot apply presets", "当前版本不支持保存预设": "This version cannot save presets",
    "请先选择至少一个图层": "Select at least one layer first", "请先在设置里选择预设库": "Choose a preset library in Settings first",
    "这个预设需要文字图层": "This preset requires a text layer", "这个预设文件无法读取": "This preset cannot be read",
    "编辑预设": "Edit preset", "保存当前预设": "Save Current Preset", "预设名称": "Preset name",
    "设置已保存": "Settings saved", "新建文件夹": "New Folder", "根目录": "Root",
    "转到": "Go", "上一级": "Up", "选择此文件夹": "Choose This Folder",
    "  ● 使用当前文件夹": "  ● Use this folder", "选择文件夹": "Choose Folder",
    "按名称、文件夹或属性筛选": "Filter by name, folder or property",
    "搜索预设": "Search Presets", "搜索": "Search"
  };
  function l10n(s) {
    s = String(s === undefined || s === null ? "" : s);
    if (S.lang !== "en") return s;
    if (EN_TEXT[s] !== undefined) return EN_TEXT[s];
    var t = s;
    t = t.replace(/^预设库：/, "Preset library: ").replace(/^配置文件夹：/, "Config folder: ")
      .replace(/^已应用 · /, "Applied · ").replace(/^已保存 · /, "Saved · ")
      .replace(/^已删除 · /, "Deleted · ").replace(/^已删除文件夹 · /, "Folder deleted · ")
      .replace(/^已新建文件夹 · /, "Folder created · ").replace(/^已刷新 · /, "Refreshed · ")
      .replace(/^应用失败/, "Apply failed").replace(/^保存失败：/, "Save failed: ")
      .replace(/^删除失败：/, "Delete failed: ").replace(/^无法创建文件夹/, "Cannot create folder")
      .replace(/^请先选中要保存的属性或效果$/, "Select a property or effect to save first")
      .replace(/^请先选择图层并选中属性$/, "Select a layer and a property first")
      .replace(/^这个文件夹还没有预设$/, "This folder has no presets")
      .replace(/^把 \.ecpreset 文件放进这个文件夹，然后刷新$/, "Put .ecpreset files here, then refresh.")
      .replace(/ 个预设/g, " presets").replace(/ 个图层/g, " layers")
      .replace(/ 项属性/g, " properties").replace(/ 个效果/g, " effects");
    return t;
  }
  function drawText(g, s, x, y, size, color, bold) {
    if (S.lang === "en") s = l10n(s);
    try { g.font = font(size, bold); } catch (e) { g.font = (bold ? "bold " : "") + size + "px " + FONT_FAMILY; }
    g.drawString(String(s), cachedPen(g, color || C.text, 1), x, y);
  }
  function textBox(g, s, x, y, w, h, size, color, align, bold, maxW) {
    s = String(s === undefined || s === null ? "" : s);
    if (maxW !== undefined && maxW > 0) s = ellipsize(s, size, maxW);
    var tw = visualWidth(s, size);
    var tx = align === "center" ? x + (w - tw) / 2 : (align === "right" ? x + w - tw : x);
    var ty = y + (h - size * 1.22) / 2 + 1;
    drawText(g, s, tx, ty, size, color, bold);
  }
  function drawWrapped(g, s, x, y, w, size, color, lineH, maxLines) {
    s = String(s || "");
    var words = s.split(" "), line = "", out = [], i;
    for (i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (visualWidth(test, size) > w && line) { out.push(line); line = words[i]; }
      else line = test;
    }
    if (line) out.push(line);
    for (i = 0; i < out.length && i < maxLines; i++) drawText(g, out[i], x, y + i * lineH + size, size, color, false);
  }

  // ---------------------------------------------------------------- icons
  function drawIcon(g, name, cx, cy, sz, color, width) {
    var h = sz / 2, x = cx - h, y = cy - h, i, a;
    color = color || C.text;
    width = width || 1.4;
    if (name === "grid") {
      var q = sz * 0.36, gp = sz * 0.12;
      g.newPath();
      roundSubpath(g, x, y, q, q, 2);
      roundSubpath(g, x + q + gp, y, q, q, 2);
      roundSubpath(g, x, y + q + gp, q, q, 2);
      roundSubpath(g, x + q + gp, y + q + gp, q, q, 2);
      g.fillPath(cachedBrush(g, color));
    } else if (name === "folder") {
      g.newPath();
      g.moveTo(x, y + sz * 0.24);
      g.lineTo(x, y + sz * 0.82);
      g.lineTo(x + sz, y + sz * 0.82);
      g.lineTo(x + sz, y + sz * 0.30);
      g.lineTo(x + sz * 0.48, y + sz * 0.30);
      g.lineTo(x + sz * 0.38, y + sz * 0.18);
      g.lineTo(x, y + sz * 0.18);
      g.closePath();
      g.strokePath(cachedPen(g, color, width));
    } else if (name === "clock") {
      g.newPath(); g.ellipsePath(x + sz * 0.08, y + sz * 0.08, sz * 0.84, sz * 0.84);
      g.strokePath(cachedPen(g, color, width));
      line(g, cx, cy, cx, cy - sz * 0.22, color, width);
      line(g, cx, cy, cx + sz * 0.16, cy + sz * 0.08, color, width);
    } else if (name === "search") {
      circle(g, cx - sz * 0.08, cy - sz * 0.08, sz * 0.28, null, color, width);
      line(g, cx + sz * 0.13, cy + sz * 0.13, cx + sz * 0.38, cy + sz * 0.38, color, width);
    } else if (name === "plus") {
      g.newPath();
      g.moveTo(cx, cy - h * 0.62); g.lineTo(cx, cy + h * 0.62);
      g.moveTo(cx - h * 0.62, cy); g.lineTo(cx + h * 0.62, cy);
      g.strokePath(cachedPen(g, color, width));
    } else if (name === "close") {
      g.newPath();
      g.moveTo(x + sz * 0.22, y + sz * 0.22); g.lineTo(x + sz * 0.78, y + sz * 0.78);
      g.moveTo(x + sz * 0.78, y + sz * 0.22); g.lineTo(x + sz * 0.22, y + sz * 0.78);
      g.strokePath(cachedPen(g, color, width));
    } else if (name === "chevron") {
      g.newPath(); g.moveTo(x + sz * 0.3, y + sz * 0.22); g.lineTo(x + sz * 0.7, y + sz * 0.5); g.lineTo(x + sz * 0.3, y + sz * 0.78);
      g.strokePath(cachedPen(g, color, width));
    } else if (name === "back") {
      g.newPath(); g.moveTo(x + sz * 0.62, y + sz * 0.2); g.lineTo(x + sz * 0.32, y + sz * 0.5); g.lineTo(x + sz * 0.62, y + sz * 0.8);
      g.strokePath(cachedPen(g, color, width));
    } else if (name === "up") {
      g.newPath(); g.moveTo(x + sz * 0.2, y + sz * 0.62); g.lineTo(x + sz * 0.5, y + sz * 0.3); g.lineTo(x + sz * 0.8, y + sz * 0.62);
      g.strokePath(cachedPen(g, color, width));
    } else if (name === "down") {
      g.newPath(); g.moveTo(x + sz * 0.2, y + sz * 0.38); g.lineTo(x + sz * 0.5, y + sz * 0.7); g.lineTo(x + sz * 0.8, y + sz * 0.38);
      g.strokePath(cachedPen(g, color, width));
    } else if (name === "check") {
      g.newPath(); g.moveTo(x + sz * 0.2, y + sz * 0.52); g.lineTo(x + sz * 0.42, y + sz * 0.74); g.lineTo(x + sz * 0.82, y + sz * 0.26);
      g.strokePath(cachedPen(g, color, width + 0.4));
    } else if (name === "play") {
      g.newPath(); g.moveTo(x + sz * 0.3, y + sz * 0.18); g.lineTo(x + sz * 0.82, y + sz * 0.5); g.lineTo(x + sz * 0.3, y + sz * 0.82); g.closePath();
      g.fillPath(cachedBrush(g, color));
    } else if (name === "gear") {
      circle(g, cx, cy, sz * 0.24, null, color, width);
      g.newPath();
      for (i = 0; i < 8; i++) {
        a = Math.PI * 2 * i / 8;
        g.moveTo(cx + Math.cos(a) * sz * 0.34, cy + Math.sin(a) * sz * 0.34);
        g.lineTo(cx + Math.cos(a) * sz * 0.47, cy + Math.sin(a) * sz * 0.47);
      }
      g.strokePath(cachedPen(g, color, width));
    } else if (name === "sliders") {
      g.newPath();
      for (i = 0; i < 3; i++) {
        var yy = y + sz * (0.24 + i * 0.26);
        g.moveTo(x + sz * 0.12, yy); g.lineTo(x + sz * 0.88, yy);
      }
      g.strokePath(cachedPen(g, color, width));
      g.newPath();
      for (i = 0; i < 3; i++) {
        var ky = y + sz * (0.24 + i * 0.26);
        var kx = x + sz * (i === 0 ? 0.34 : i === 1 ? 0.66 : 0.46);
        g.ellipsePath(kx - sz * 0.075, ky - sz * 0.075, sz * 0.15, sz * 0.15);
      }
      g.fillPath(cachedBrush(g, color));
    } else if (name === "image") {
      g.newPath(); g.rectPath(x + sz * 0.12, y + sz * 0.18, sz * 0.76, sz * 0.64); g.strokePath(cachedPen(g, color, width));
      circle(g, x + sz * 0.34, y + sz * 0.34, sz * 0.07, color, null, 1);
      g.newPath(); g.moveTo(x + sz * 0.18, y + sz * 0.72); g.lineTo(x + sz * 0.42, y + sz * 0.48); g.lineTo(x + sz * 0.58, y + sz * 0.64); g.lineTo(x + sz * 0.7, y + sz * 0.52); g.lineTo(x + sz * 0.84, y + sz * 0.72); g.strokePath(cachedPen(g, color, width));
    } else if (name === "file") {
      g.newPath();
      g.moveTo(x + sz * 0.24, y + sz * 0.1);
      g.lineTo(x + sz * 0.6, y + sz * 0.1);
      g.lineTo(x + sz * 0.78, y + sz * 0.28);
      g.lineTo(x + sz * 0.78, y + sz * 0.9);
      g.lineTo(x + sz * 0.24, y + sz * 0.9);
      g.closePath();
      g.moveTo(x + sz * 0.6, y + sz * 0.1); g.lineTo(x + sz * 0.6, y + sz * 0.3);
      g.moveTo(x + sz * 0.6, y + sz * 0.3); g.lineTo(x + sz * 0.78, y + sz * 0.3);
      g.strokePath(cachedPen(g, color, width));
    } else if (name === "refresh") {
      arcPath(g, cx, cy, sz * 0.32, -Math.PI * 0.15, Math.PI * 1.45, 12);
      g.moveTo(cx + sz * 0.36, cy - sz * 0.36); g.lineTo(cx + sz * 0.5, cy - sz * 0.1); g.lineTo(cx + sz * 0.18, cy - sz * 0.16);
      g.strokePath(cachedPen(g, color, width));
    } else if (name === "sparkle") {
      g.newPath();
      g.moveTo(cx, cy - sz * 0.5);
      g.lineTo(cx + sz * 0.14, cy - sz * 0.14);
      g.lineTo(cx + sz * 0.5, cy);
      g.lineTo(cx + sz * 0.14, cy + sz * 0.14);
      g.lineTo(cx, cy + sz * 0.5);
      g.lineTo(cx - sz * 0.14, cy + sz * 0.14);
      g.lineTo(cx - sz * 0.5, cy);
      g.lineTo(cx - sz * 0.14, cy - sz * 0.14);
      g.closePath();
      g.fillPath(cachedBrush(g, color));
    } else if (name === "external") {
      g.newPath(); g.rectPath(x + sz * 0.16, y + sz * 0.28, sz * 0.52, sz * 0.56); g.strokePath(cachedPen(g, color, width));
      line(g, x + sz * 0.46, y + sz * 0.14, x + sz * 0.84, y + sz * 0.14, color, width);
      line(g, x + sz * 0.84, y + sz * 0.14, x + sz * 0.84, y + sz * 0.52, color, width);
      line(g, x + sz * 0.82, y + sz * 0.16, x + sz * 0.5, y + sz * 0.48, color, width);
    } else if (name === "more") {
      g.newPath();
      g.ellipsePath(cx - sz * 0.35, cy - sz * 0.09, sz * 0.18, sz * 0.18);
      g.ellipsePath(cx - sz * 0.09, cy - sz * 0.09, sz * 0.18, sz * 0.18);
      g.ellipsePath(cx + sz * 0.17, cy - sz * 0.09, sz * 0.18, sz * 0.18);
      g.fillPath(cachedBrush(g, color));
    } else if (name === "warning") {
      g.newPath(); g.moveTo(cx, cy - sz * 0.42); g.lineTo(cx + sz * 0.44, cy + sz * 0.36); g.lineTo(cx - sz * 0.44, cy + sz * 0.36); g.closePath();
      g.strokePath(cachedPen(g, color, width));
      line(g, cx, cy - sz * 0.12, cx, cy + sz * 0.12, color, width);
      circle(g, cx, cy + sz * 0.24, sz * 0.035, color, null, 1);
    }
  }

  // ---------------------------------------------------------------- layout
  function buildLayout(g) {
    var W = 0, H = 0;
    try { W = canvas.size.width || 0; H = canvas.size.height || 0; } catch (e) {}
    if (!(W > 0) || !(H > 0)) { W = 360; H = 430; }
    W = Math.max(190, W); H = Math.max(170, H);
    var sidebarW = W >= 700 ? 202 : W >= 540 ? 182 : W >= 430 ? 160 : W >= 330 ? 148 : W >= 270 ? 104 : 58;
    var pad = W < 390 ? 10 : 14;
    var mainX = sidebarW + 1, mainW = W - mainX;
    var innerX = mainX + pad, innerW = Math.max(40, mainW - pad * 2);
    var twoRow = false;
    var headerH = 48;
    var rail = sidebarW < 100;
    var cat = currentCategory();
    var subAddW = (cat && !cat.isRoot && !cat.subs.length) ? 28 : 0;
    L = {
      W: W, H: H, sidebarW: sidebarW, rail: rail, mainX: mainX, mainW: mainW,
      pad: pad, innerX: innerX, innerW: innerW, twoRow: twoRow,
      sidebar: { x: 0, y: 0, w: sidebarW, h: H },
      header: { x: mainX, y: 0, w: mainW, h: headerH },
      cards: [], navs: [], chips: [], chipRows: 0,
      emptyButtons: [], menu: null, toast: null, settings: null, onboard: null,
      grid: null, footer: null, zoom: null, scrollbar: null, navScroll: null, railTip: null
    };
    L.header.search = { x: innerX, y: 8, w: innerW - subAddW, h: 32 };
    if (subAddW) L.subAdd = { x: innerX + innerW - 26, y: 12, w: 24, h: 24 };
    var chipsTop = headerH + 5;
    if (cat && cat.subs.length) {
      buildChips(cat, innerX, chipsTop, innerW);
      if (L.chipRows > 0) {
        L.header.h = headerH + 30 + (L.chipScroll ? 12 : 0) + 8;
        L.header.chipsTop = chipsTop;
      }
    }
    if (!L.header.h) L.header.h = headerH;
    var footerH = innerW < 390 ? 64 : 44;
    var gridY = L.header.h + 8;
    L.footer = { x: mainX, y: H - footerH, w: mainW, h: footerH, twoRow: innerW < 390 };
    L.grid = {
      x: innerX, y: gridY, w: innerW,
      h: Math.max(24, H - footerH - 8 - gridY)
    };
    buildNav(rail, sidebarW, H);
    buildGrid();
    buildFooter();
    buildOverlay();
    if (menu) layoutMenu(g);
    return L;
  }
  function buildChips(cat, x, y, maxW) {
    var items = [{ id: "", label: "根目录" }], i;
    for (i = 0; i < cat.subs.length; i++) items.push({ id: cat.subs[i].id, label: cat.subs[i].name });
    var h = 28, gap = 6, addW = 34, chipsW = Math.max(80, maxW - addW);
    L.chipAdd = { x: x + maxW - 30, y: y, w: 28, h: 28 };
    var total = 0, rawX = 0;
    for (i = 0; i < items.length; i++) {
      items[i].w = Math.max(52, Math.min(170, Math.round(visualWidth(items[i].label, 12.5) + 20)));
      items[i].h = h;
      items[i].y = y;
      items[i].rawX = rawX;
      rawX += items[i].w + gap;
      total += items[i].w + gap;
    }
    var contentW = Math.max(1, total - gap);
    var maxScroll = Math.max(0, contentW - chipsW);
    S.chipScroll = clamp(S.chipScroll || 0, 0, maxScroll);
    for (i = 0; i < items.length; i++) {
      if (items[i].id === (S.sub || "")) {
        if (items[i].rawX < S.chipScroll + 4) S.chipScroll = Math.max(0, items[i].rawX - 4);
        else if (items[i].rawX + items[i].w > S.chipScroll + chipsW - 4) S.chipScroll = clamp(items[i].rawX + items[i].w - chipsW + 4, 0, maxScroll);
        break;
      }
    }
    var sx = x - S.chipScroll;
    L.chips = [];
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      it.x = sx;
      if (it.x + it.w < x - 2) { sx += it.w + gap; continue; }
      if (it.x > x + chipsW + 2) { sx += it.w + gap; continue; }
      it.active = it.id === (S.sub || "");
      L.chips.push(it);
      sx += it.w + gap;
    }
    L.chipRows = 1;
    L.chipMaxScroll = maxScroll;
    L.chipContentW = contentW;
    L.chipViewX = x;
    L.chipViewW = chipsW;
    if (maxScroll > 0) {
      var tw = Math.max(26, Math.round(chipsW * chipsW / contentW));
      L.chipScroll = {
        x: x, y: y + 32, w: chipsW, h: 6,
        thumbW: tw, thumbX: x + (chipsW - tw) * (S.chipScroll / maxScroll),
        maxScroll: maxScroll, trackW: chipsW
      };
    } else {
      L.chipScroll = null;
    }
  }
  function buildNav(rail, W, H) {
    var headH = rail ? 46 : 54;
    var navTop = headH + 6;
    var rowH = rail ? 40 : 36;
    var settingsH = rail ? 40 : 36;
    var settingsY = H - settingsH - 12;
    var navBottom = settingsY - 8;
    var items = [];
    for (var i = 0; i < CATS.length; i++) items.push({ id: CATS[i].id, label: CATS[i].name, icon: "folder", count: CATS[i].count });
    var total = 8 + (items.length + 1) * (rowH + 3);
    var maxScroll = Math.max(0, total - (navBottom - navTop));
    S.navScroll = clamp(S.navScroll || 0, 0, maxScroll);
    L.navScrollMax = maxScroll;
    var y = navTop - S.navScroll;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      it.x = rail ? 7 : 9; it.y = y; it.w = rail ? W - 14 : W - 18; it.h = rowH;
      it.active = it.id === S.selected;
      if (y + rowH > navTop && y < navBottom) L.navs.push(it);
      y += rowH + 3;
    }
    L.navTop = navTop; L.navBottom = navBottom; L.navRowH = rowH;
    L.folderHead = { x: rail ? 0 : 14, y: 10, w: W - (rail ? 0 : 20), h: 30 };
    L.newFolder = null;
    var addRect = { x: rail ? 7 : 9, y: y, w: rail ? W - 14 : W - 18, h: rowH };
    if (y + rowH > navTop && y < navBottom) L.newFolder = addRect;
    L.settingsBtn = { x: 7, y: settingsY, w: W - 14, h: settingsH };
    if (maxScroll > 0) {
      var trackH = navBottom - navTop;
      var th = Math.max(30, trackH * trackH / total);
      L.navScroll = {
        x: W - 9, y: navTop, w: 8, h: trackH,
        thumbH: th, thumbY: navTop + (trackH - th) * (S.navScroll / maxScroll)
      };
    }
  }
  function buildGrid() {
    var gx = L.grid.x, gy = L.grid.y, gw = L.grid.w, gh = L.grid.h;
    var items = currentPresets();
    L.items = items;
    L.emptyButtons = [];
    var rowGap = 6;
    var cols = 1, cardW = Math.max(40, gw - 18);
    var cardH = Math.round(clamp(42 + (S.zoom - 84) * 0.22, 42, 68));
    L.showAdd = !trimStr(S.search);
    var rows = items.length + (L.showAdd ? 1 : 0);
    var contentH = rows * cardH + Math.max(0, rows - 1) * rowGap;
    var maxScroll = Math.max(0, contentH - gh + 4);
    S.scroll = clamp(S.scroll || 0, 0, maxScroll);
    L.gridCols = cols; L.cardW = cardW; L.cardH = cardH; L.rowGap = rowGap;
    L.thumbH = 0; L.cardTextH = cardH; L.gridContentH = contentH; L.maxScroll = maxScroll;
    var firstRow = Math.max(0, Math.floor(S.scroll / (cardH + rowGap)));
    var lastRow = Math.min(rows - 1, Math.ceil((S.scroll + gh) / (cardH + rowGap)));
    for (var r = firstRow; r <= Math.min(lastRow, items.length - 1); r++) {
      var y = gy + r * (cardH + rowGap) - S.scroll;
      L.cards.push({ p: items[r], idx: r, x: gx, y: y, w: cardW, h: cardH });
    }
    L.addCard = null;
    if (L.showAdd) {
      var addY = gy + items.length * (cardH + rowGap) - S.scroll;
      if (addY + cardH > gy && addY < gy + gh) L.addCard = { x: gx, y: addY, w: cardW, h: cardH };
    }
    L.gridEmpty = items.length === 0 && !L.showAdd;
    if (maxScroll > 0) {
      var th = Math.max(28, gh * gh / contentH);
      L.scrollbar = {
        x: gx + gw - 10, y: gy, w: 10, h: gh, thumbH: th,
        thumbY: gy + (gh - th) * (S.scroll / maxScroll)
      };
    }
  }
  function buildFooter() {
    var f = L.footer, innerX = L.innerX, right = L.innerX + L.innerW;
    var topY = f.twoRow ? f.y + 8 : f.y + Math.floor((f.h - 20) / 2);
    L.footer.refresh = { x: innerX, y: topY - 3, w: 26, h: 26 };
    if (f.twoRow) {
      var zy = f.y + 40, minusX = innerX, plusX = right - 22, sliderX = minusX + 26;
      var sliderW = Math.max(96, plusX - 14 - sliderX);
      L.zoom = {
        min: 84, max: 240, x: sliderX, y: zy, w: sliderW, h: 3,
        minus: { x: minusX, y: zy - 11, w: 22, h: 24 },
        plus: { x: plusX, y: zy - 11, w: 22, h: 24 },
        labelX: right - 30
      };
      L.footer.zoomLabel = false;
      return;
    }
    var y = topY;
    var sliderW2 = clamp(Math.round(L.innerW * 0.32), 96, 180);
    var plusX2 = right - 22, minusX2 = plusX2 - 14 - sliderW2 - 26;
    if (minusX2 < L.innerX + 120) {
      sliderW2 = Math.max(54, right - 22 - 26 - 12 - (L.innerX + 120));
      minusX2 = right - 22 - 14 - sliderW2 - 26;
    }
    L.zoom = {
      min: 84, max: 240, x: minusX2 + 26, y: y + 9, w: sliderW2, h: 3,
      minus: { x: minusX2, y: y - 2, w: 22, h: 24 },
      plus: { x: plusX2, y: y - 2, w: 22, h: 24 },
      labelX: right - 30
    };
    L.footer.zoomLabel = L.innerW > 330;
  }
  function buildOverlay() {
    if (UI.onboarding) buildOnboarding();
    if (UI.settings) buildSettings();
  }
  function buildOnboarding() {
    var W = L.W, H = L.H;
    var maxH = H - 16;
    var cw = Math.min(430, W - 20);
    var compact = maxH < 330;
    var m = compact ? 10 : 16;
    var headH = compact ? 42 : 52;
    var introH = compact ? 18 : 30;
    var rowH = compact ? 40 : 52;
    var footH = compact ? 32 : 38;
    var gap = compact ? 6 : 9;
    var errH = onboardError ? 18 : 0;
    var content = headH + introH + rowH * 2 + footH + errH + gap * 5 + m * 2;
    var ch = Math.min(maxH, Math.max(210, content));
    var cx = Math.round((W - cw) / 2), cy = Math.round((H - ch) / 2);
    var ix = cx + m, iw = cw - m * 2;
    var y = cy + m;
    var o = { x: cx, y: cy, w: cw, h: ch, m: m, innerX: ix, innerW: iw, headH: headH, compact: compact };
    o.title = { x: ix + 44, y: y, w: iw - 44, h: compact ? 24 : 28 };
    o.subtitle = { x: ix + 44, y: y + (compact ? 20 : 23), w: iw - 44, h: 16 };
    o.logo = { x: ix, y: y + 2, w: compact ? 30 : 34, h: compact ? 30 : 34 };
    y += headH;
    o.introY = y;
    y += introH;
    var browseW = compact ? 44 : 50;
    o.lib = { x: ix, y: y, w: iw, h: rowH };
    o.libField = { x: ix, y: y + (compact ? 15 : 20), w: iw - browseW - 6, h: compact ? 24 : 28 };
    o.libBrowse = { x: ix + iw - browseW, y: o.libField.y, w: browseW, h: o.libField.h };
    y += rowH;
    o.cfg = { x: ix, y: y, w: iw, h: rowH };
    o.cfgField = { x: ix, y: y + (compact ? 15 : 20), w: iw - browseW - 6, h: compact ? 24 : 28 };
    o.cfgBrowse = { x: ix + iw - browseW, y: o.cfgField.y, w: browseW, h: o.cfgField.h };
    y += rowH;
    o.errY = y;
    if (onboardError) y += errH;
    y += gap;
    var startW = Math.max(100, iw - 74);
    o.start = { x: ix, y: cy + ch - m - footH, w: startW, h: footH };
    o.useDefault = { x: ix + startW + 8, y: o.start.y, w: 66, h: footH };
    L.onboard = o;
  }
  function buildSettings() {
    var W = L.W, H = L.H;
    var cw = Math.min(470, W - 20);
    var ch = Math.min(450, H - 16);
    var compact = ch < 370;
    var m = compact ? 12 : 16;
    var cx = Math.round((W - cw) / 2), cy = Math.round((H - ch) / 2);
    var ix = cx + m, iw = cw - m * 2;
    var y = cy + (compact ? 10 : 14);
    var o = { x: cx, y: cy, w: cw, h: ch, m: m, innerX: ix, innerW: iw, compact: compact };
    o.title = { x: ix, y: y, w: iw - 104, h: 28 };
    o.close = { x: ix + iw - 26, y: y - 2, w: 26, h: 26 };
    o.langZh = { x: ix + iw - 98, y: y - 1, w: 36, h: 24 };
    o.langEn = { x: ix + iw - 60, y: y - 1, w: 36, h: 24 };
    y += compact ? 38 : 44;
    var browseW = compact ? 52 : 60;
    var rowH = compact ? 46 : 54;
    o.libLabel = { x: ix, y: y, w: iw, h: 22 };
    y += 30;
    o.libField = { x: ix, y: y, w: iw - browseW - 34, h: compact ? 32 : 38 };
    o.libBrowse = { x: ix + iw - browseW - 32, y: o.libField.y, w: browseW, h: o.libField.h };
    o.libOpen = { x: ix + iw - 28, y: o.libField.y, w: 28, h: o.libField.h };
    y += rowH;
    o.cfgLabel = { x: ix, y: y, w: iw, h: 22 };
    y += 30;
    o.cfgField = { x: ix, y: y, w: iw - browseW - 6, h: compact ? 32 : 38 };
    o.cfgBrowse = { x: ix + iw - browseW, y: o.cfgField.y, w: browseW, h: o.cfgField.h };
    y += rowH;
    o.hintY = y;
    if (settingsError) y += 18;
    var actionH = compact ? 28 : 32;
    o.actionsY = cy + ch - m - actionH;
    var narrow = iw < 260;
    var resetW = narrow ? 54 : 72;
    var refreshW = narrow ? 46 : 58;
    var saveW = narrow ? Math.max(72, iw - resetW - refreshW - 16)
                       : Math.max(90, iw - 78 - 66 - 16);
    o.narrow = narrow;
    o.save = { x: ix, y: o.actionsY, w: saveW, h: actionH };
    o.reset = { x: ix + saveW + 8, y: o.actionsY, w: resetW, h: actionH };
    o.refresh = { x: ix + saveW + 8 + resetW + 8, y: o.actionsY, w: refreshW, h: actionH };
    o.footerY = cy + ch - m + 2;
    L.settings = o;
  }

  // ---------------------------------------------------------------- draw
  function drawAll(g) {
    var W = L.W, H = L.H;
    fillRect(g, 0, 0, W, H, C.bg);
    fillRect(g, L.mainX, 0, L.mainW, H, C.main);
    // a faint mint wash behind the header, kept inside the panel
    circle(g, L.mainX + L.mainW - 18, 8, Math.min(150, L.mainW * 0.42), withAlpha(C.accent, 0.025), null, 1);
    drawCards(g);
    drawHeader(g);
    drawSidebar(g);
    drawFooter(g);
    drawScrollbar(g);
    if (L.railTip) drawRailTip(g);
    if (L.gridEmpty) drawEmpty(g);
    if (toastText && nowMs() < toastUntil) drawToast(g);
    if (UI.settings) drawSettings(g);
    if (UI.onboarding) drawOnboarding(g);
    if (menu) drawMenu(g);
    if (lastError) drawError(g);
  }
  function drawSidebar(g) {
    var s = L.sidebar;
    fillRect(g, s.x, s.y, s.w, s.h, C.side);
    line(g, s.x + s.w - 1, 0, s.x + s.w - 1, L.H, withAlpha(C.line, 0.38), 0.7);
    var rail = L.rail, fh = L.folderHead, nf = L.newFolder;
    if (!L.navs.length && !rail) {
      textBox(g, "还没有文件夹，点下方 + 新建", 14, L.navTop + 4, s.w - 28, 20, 9.5, C.faint, "left", false, s.w - 28);
    }
    var i;
    for (i = 0; i < L.navs.length; i++) {
      var n = L.navs[i];
      var hovered = hoverKey === "nav:" + n.id;
      if (n.active) fillRound(g, n.x, n.y, n.w, n.h, 8, C.accentSoft);
      else if (hovered) fillRound(g, n.x, n.y, n.w, n.h, 8, withAlpha(C.text, 0.045));
      if (n.active) fillRound(g, n.x, n.y + 9, 2, n.h - 18, 1, C.accent);
      var col = n.active ? C.accent : C.muted;
      if (rail) {
        drawIcon(g, n.icon, s.w / 2, n.y + n.h / 2, 16, col, 1.3);
      } else {
        drawIcon(g, n.icon, n.x + 16, n.y + n.h / 2, 15, col, 1.3);
        textBox(g, n.label, n.x + 34, n.y, n.w - 38, n.h, 12.5, n.active ? C.text : C.muted, "left", n.active, n.w - 38);
      }
    }
    if (!rail) {
      fillRect(g, 0, 0, s.w, L.navTop, C.side);
      textBox(g, "文件夹", fh.x, fh.y, fh.w - 48, fh.h, 11.5, C.text, "left", true, fh.w - 48);
    }
    if (nf) {
      var nfh = hoverKey === "newFolder";
      fillStrokeRound(g, nf.x, nf.y, nf.w, nf.h, 7, nfh ? C.cardHi : C.field,
        nfh ? withAlpha(C.accent, 0.7) : C.line, 1);
      drawIcon(g, "plus", nf.x + nf.w / 2, nf.y + nf.h / 2, 14, nfh ? C.accent : C.muted, 1.5);
    }
    if (L.navScroll) {
      var ns = L.navScroll;
      fillRound(g, ns.x, ns.y, ns.w, ns.h, 4, withAlpha(C.text, 0.05));
      fillRound(g, ns.x, ns.thumbY, ns.w, ns.thumbH, 4, withAlpha(C.text, 0.26));
    }
    if (hoverKey && hoverKey.indexOf("nav:") === 0) {
      for (i = 0; i < L.navs.length; i++) {
        if (hoverKey === "nav:" + L.navs[i].id) {
          var tipLabel = L.navs[i].label;
          var needTip = rail || visualWidth(tipLabel, 12.5) > L.navs[i].w - 38;
          if (needTip) {
            var tipW = Math.max(46, Math.round(visualWidth(tipLabel, 10)) + 20);
            L.railTip = {
              x: s.w + 6, y: clamp(L.navs[i].y + L.navs[i].h / 2 - 12, 4, L.H - 28),
              w: tipW, h: 24, label: tipLabel
            };
          }
          break;
        }
      }
    }
    line(g, 10, L.settingsBtn.y - 6, s.w - 10, L.settingsBtn.y - 6, C.line, 1);
    var sb = L.settingsBtn, sh = hoverKey === "settings";
    if (sh) fillRound(g, sb.x, sb.y, sb.w, sb.h, 8, withAlpha(C.text, 0.05));
    if (rail) drawIcon(g, "gear", s.w / 2, sb.y + sb.h / 2, 15, C.muted, 1.3);
    else {
      drawIcon(g, "gear", sb.x + 16, sb.y + sb.h / 2, 15, C.muted, 1.3);
      textBox(g, "设置", sb.x + 34, sb.y, sb.w - 34, sb.h, 12, C.muted, "left", false, sb.w - 40);
    }
  }
  function drawRailTip(g) {
    var t = L.railTip;
    if (!t) return;
    fillRound(g, t.x + 2, t.y + 3, t.w, t.h, 7, withAlpha([0, 0, 0], 0.35));
    fillStrokeRound(g, t.x, t.y, t.w, t.h, 7, C.card, withAlpha(C.accent, 0.32), 1);
    textBox(g, t.label, t.x + 10, t.y, t.w - 20, t.h, 8.5, C.text, "left", false, t.w - 20);
  }
  function drawHeader(g) {
    var h = L.header;
    fillRect(g, h.x, h.y, h.w, h.h, C.header);
    line(g, h.x, h.h - 1, h.x + h.w, h.h - 1, C.line, 1);
    drawSearch(g);
    var chY = L.header.chipsTop;
    if (L.chips && L.chips.length && chY !== undefined) {
      for (var c = 0; c < L.chips.length; c++) {
        var cc = L.chips[c];
        if (cc.x + cc.w <= L.chipViewX || cc.x >= L.chipViewX + L.chipViewW) continue;
        drawChip(g, cc);
      }
      fillRect(g, L.chipViewX + L.chipViewW, chY - 2, Math.max(0, L.W - (L.chipViewX + L.chipViewW)), 34, C.header);
    }
    if (L.chipScroll) drawChipScrollbar(g);
    if (L.chipAdd) drawAddButton(g, L.chipAdd, "chipAdd");
    if (L.subAdd) drawAddButton(g, L.subAdd, "subAdd");
  }
  function drawChipScrollbar(g) {
    var s = L.chipScroll;
    if (!s) return;
    fillRound(g, s.x, s.y, s.w, s.h, 3, withAlpha(C.text, 0.035));
    fillRound(g, s.thumbX, s.y, s.thumbW, s.h, 3, withAlpha(C.text, 0.22));
  }
  function drawAddButton(g, r, key) {
    var h = hoverKey === key, hot = h || key === "chipAdd" || key === "subAdd";
    fillStrokeRound(g, r.x, r.y, r.w, r.h, 7, h ? C.cardHi : C.field,
      hot ? withAlpha(C.accent, 0.6) : C.line, 1);
    drawIcon(g, "plus", r.x + r.w / 2, r.y + r.h / 2, 13, hot ? C.accent : C.muted, 1.5);
  }
  function drawSearch(g) {
    var r = L.header.search, focused = focus && focus.id === "search";
    fillStrokeRound(g, r.x, r.y, r.w, r.h, 8, focused ? C.fieldHi : C.field,
      focused ? withAlpha(C.accent, 0.7) : C.line, 1);
    drawIcon(g, "search", r.x + 15, r.y + r.h / 2, 12, focused ? C.accent : C.faint, 1.4);
    var tx = r.x + 26, tw = r.w - (trimStr(S.search) ? 52 : 34);
    var shown = S.search || "";
    if (focused) {
      drawTextCaret(g, shown, tx, r.y, tw, r.h, 11.5, focus.caret, C.text, "搜索预设…");
    } else {
      textBox(g, shown || "搜索预设…", tx, r.y, tw, r.h, 11.5, shown ? C.text : C.faint, "left", false, tw);
    }
    if (trimStr(S.search)) {
      var cx = r.x + r.w - 16, cy = r.y + r.h / 2;
      circle(g, cx, cy, 8, withAlpha(C.text, 0.06), null, 1);
      drawIcon(g, "close", cx, cy, 8, C.muted, 1.1);
    }
  }
  function drawTextCaret(g, text, x, y, w, h, size, caret, color, placeholder) {
    text = String(text || "");
    if (!text && placeholder) textBox(g, placeholder, x, y, w, h, size, C.faint, "left", false, w);
    var visible = text, offset = 0;
    if (visualWidth(visible, size) > w - 3) {
      while (offset < text.length && visualWidth(text.substring(offset), size) > w - 3) offset++;
      visible = text.substring(offset);
    }
    var tw = visualWidth(visible, size);
    textBox(g, visible, x, y, w, h, size, color, "left", false, w);
    var before = text.substring(offset, clamp(caret - offset, 0, visible.length));
    var cx = x + visualWidth(before, size);
    if (cx > x + w - 2) cx = x + w - 2;
    line(g, cx, y + h / 2 - 7, cx, y + h / 2 + 7, C.accent, 1.2);
  }
  function drawModeButton(g) {
    var r = L.header.mode, m = modeInfo(S.display), hov = hoverKey === "mode";
    fillStrokeRound(g, r.x, r.y, r.w, r.h, 8, hov ? C.fieldHi : C.field,
      hov ? C.lineHi : C.line, 1);
    var showLabel = r.w >= 74;
    drawIcon(g, m.icon, r.x + 14, r.y + r.h / 2, 12, C.muted, 1.35);
    if (showLabel) textBox(g, m.label, r.x + 25, r.y, r.w - 42, r.h, 9, C.text, "left", false, r.w - 44);
    drawIcon(g, "chevron", r.x + r.w - 10, r.y + r.h / 2, 8, C.faint, 1.2);
  }
  function drawChip(g, c) {
    var active = c.active, hov = hoverKey === "chip:" + (c.id || "all") + (c.more ? "more" : "");
    if (active) {
      fillRound(g, c.x, c.y, c.w, c.h, 7, C.accent);
    } else {
      fillStrokeRound(g, c.x, c.y, c.w, c.h, 7, hov ? C.cardHi : C.field, C.line, 1);
    }
    var maxText = c.w - 18;
    textBox(g, c.label, c.x + 10, c.y, maxText, c.h, 12.5, active ? C.onAccent : C.text, "left", active, maxText);
  }
  function cardRectSubpath(g, card) {
    var r = card;
    g.moveTo(r.x, r.y);
    g.lineTo(r.x + r.w, r.y);
    g.lineTo(r.x + r.w, r.y + r.h);
    g.lineTo(r.x, r.y + r.h);
    g.closePath();
  }
  function drawCards(g) {
    var i, card, visible = [];
    for (i = 0; i < L.cards.length; i++) {
      card = L.cards[i];
      if (card.y + card.h < L.grid.y - 2 || card.y > L.grid.y + L.grid.h + 2) continue;
      visible.push(card);
    }
    // 批量画普通卡片底色/描边：一次 fillPath / strokePath 搞定整屏卡片，
    // 只有 hover / 选中的少数卡片单独绘制。
    var any = false;
    g.newPath();
    for (i = 0; i < visible.length; i++) {
      card = visible[i];
      if (hoverKey === "card:" + card.p.path) continue;
      cardRectSubpath(g, card); any = true;
    }
    if (any) g.fillPath(cachedBrush(g, C.card));
    for (i = 0; i < visible.length; i++) {
      card = visible[i];
      if (hoverKey !== "card:" + card.p.path) continue;
      fillRound(g, card.x, card.y, card.w, card.h, 9, C.cardHi);
    }
    any = false;
    g.newPath();
    for (i = 0; i < visible.length; i++) {
      card = visible[i];
      if (card.p.path === S.current) continue;
      cardRectSubpath(g, card); any = true;
    }
    if (any) g.strokePath(cachedPen(g, C.line, 1));
    for (i = 0; i < visible.length; i++) {
      card = visible[i];
      if (card.p.path !== S.current) continue;
      strokeRound(g, card.x, card.y, card.w, card.h, 9, withAlpha(C.accent, 0.8), 1.4);
    }
    for (i = 0; i < visible.length; i++) drawFileRow(g, visible[i], true);
    if (L.addCard) drawAddCard(g, L.addCard);
  }
  function drawAddCard(g, r) {
    var hov = hoverKey === "empty:addPreset" || hoverKey === "addPreset";
    fillStrokeRound(g, r.x, r.y, r.w, r.h, 9, hov ? C.cardHi : C.card,
      hov ? withAlpha(C.accent, 0.65) : C.line, 1);
    drawIcon(g, "plus", r.x + r.w / 2, r.y + r.h / 2, 18, hov ? C.accent : C.muted, 1.6);
  }
  function drawCard(g, card) {
    var p = card.p, r = card;
    var selected = p.path === S.current;
    var hov = hoverKey === "card:" + p.path;
    var y = r.y, x = r.x, w = r.w, h = r.h;
    fillRound(g, x + 1, y + 2, w - 2, h - 1, 11, withAlpha([0, 0, 0], 0.18));
    fillRound(g, x, y, w, h, 11, hov ? C.cardHi : C.card);
    strokeRound(g, x, y, w, h, 11, selected ? withAlpha(C.accent, 0.85) : (hov ? C.lineHi : C.line), selected ? 1.4 : 1);
    var thumb = { x: x + 6, y: y + 6, w: w - 12, h: L.thumbH };
    drawThumb(g, p, thumb, hov, selected);
    var textY = y + L.thumbH + 7;
    var maxText = w - 16;
    var nameSize = w < 104 ? 9.5 : 11;
    textBox(g, p.name, x + 9, textY, maxText, 16, nameSize, selected ? C.text : C.text, "left", true, maxText);
    if (h > L.thumbH + 36) {
      var meta = p.broken ? ("无法读取 · " + p.error) : (p.meta || (p.kind + " 预设"));
      textBox(g, meta, x + 9, textY + 17, maxText, 12, 8.5, p.broken ? C.danger : C.muted, "left", false, maxText);
    }
    if (S.display === "preset" && h > L.thumbH + 47) {
      var detail = (p.props ? p.props + " 项属性" : "") + (p.effects ? (p.props ? " · " : "") + p.effects + " 个效果" : "");
      textBox(g, detail || p.filename, x + 9, textY + 30, maxText, 11, 7.8, C.faint, "left", false, maxText);
    }
    if (selected) {
      circle(g, x + w - 13, y + 13, 7, C.accent, null, 1);
      drawIcon(g, "check", x + w - 13, y + 13, 8, C.onAccent, 1.4);
    }
    if (hov && card.play) {
      fillRound(g, card.play.x, card.play.y, card.play.w, card.play.h, 15, withAlpha([0, 0, 0], 0.52));
      strokeRound(g, card.play.x, card.play.y, card.play.w, card.play.h, 15, withAlpha(C.text, 0.22), 1);
      drawIcon(g, "play", card.play.x + 15, card.play.y + 15, 11, C.text, 1);
    }
  }
  function drawThumb(g, p, r, hov, selected) {
    var base = p.thumbCol || hsl(p.hue * 360 + 18, 0.38, 0.20);
    fillRound(g, r.x, r.y, r.w, r.h, 8, base);
    var pad = Math.max(8, Math.min(16, r.w * 0.08));
    if (p.curve && p.curve.length >= 2) {
      var pts = p.curve, i, x1, y1;
      var px = r.x + pad, py = r.y + pad, pw = r.w - pad * 2, ph = r.h - pad * 2;
      g.newPath();
      for (i = 0; i < pts.length; i++) {
        x1 = px + pts[i][0] * pw;
        y1 = py + (1 - pts[i][1]) * ph;
        if (i === 0) g.moveTo(x1, y1); else g.lineTo(x1, y1);
      }
      g.strokePath(cachedPen(g, withAlpha(C.accent, 0.9), Math.max(1.2, r.w / 90)));
      for (i = 0; i < pts.length && i < 14; i++) {
        x1 = px + pts[i][0] * pw; y1 = py + (1 - pts[i][1]) * ph;
        circle(g, x1, y1, 2.2, C.accent, null, 1);
      }
    } else if (p.effects > 0) {
      var n = Math.min(4, p.effects), j;
      for (j = 0; j < n; j++) {
        var bw = r.w * (0.28 + ((j * 17) % 40) / 100);
        fillRound(g, r.x + pad, r.y + pad + j * ((r.h - pad * 2) / Math.max(2, n)), bw, 5, 2, withAlpha(C.accent, 0.35 + j * 0.1));
      }
    } else {
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      fillRound(g, cx - 18, cy - 14, 36, 28, 7, withAlpha(C.text, 0.08));
      strokeRound(g, cx - 18, cy - 14, 36, 28, 7, withAlpha(C.text, 0.18), 1);
      drawIcon(g, "sparkle", cx, cy, 17, withAlpha(C.accent, 0.85), 1);
    }
    var mid = r.x + r.w / 2;
    // Only keyframed presets get the before/after split. This is a schematic
    // hint, not a rendered preview; a static effect/value cannot show a
    // meaningful "before" state.
    if (p.keys > 0) {
      fillRound(g, r.x, r.y, r.w / 2, r.h, 8, [0.5, 0.5, 0.5, 0.5]);
      line(g, mid, r.y + 5, mid, r.y + r.h - 5, withAlpha(C.text, 0.34), 1);
      if (r.w >= 90) {
        drawText(g, "应用前", r.x + 8, r.y + 14, 6.5, withAlpha(C.text, 0.55), false);
        drawText(g, "应用后", mid + 8, r.y + 14, 6.5, withAlpha(C.accent, 0.92), false);
        drawText(g, "示意", r.x + r.w - 24, r.y + r.h - 10, 6, withAlpha(C.text, 0.4), false);
      }
    }
    if (!p.broken && p.effects > 0 && p.keys > 0) {
      fillRound(g, r.x + 8, r.y + r.h - 22, 30, 14, 5, withAlpha([0, 0, 0], 0.3));
      drawText(g, p.keys + "K", r.x + 13, r.y + r.h - 11, 7, withAlpha(C.text, 0.72), false);
    }
    if (p.broken) {
      fillRound(g, r.x + 8, r.y + r.h - 24, 76, 16, 5, withAlpha(C.danger, 0.18));
      drawText(g, "读取失败", r.x + 13, r.y + r.h - 12, 7.5, C.danger, false);
    }
  }
  function drawFileRow(g, card, noBg) {
    var p = card.p, r = card, selected = p.path === S.current, hov = hoverKey === "card:" + p.path;
    if (!noBg) {
      fillStrokeRound(g, r.x, r.y, r.w, r.h, 9, hov ? C.cardHi : C.card,
        selected ? withAlpha(C.accent, 0.8) : C.line, selected ? 1.4 : 1);
    }
    var iconX = r.x + 14;
    drawIcon(g, p.keys ? "sliders" : (p.effects ? "image" : "file"), iconX, r.y + r.h / 2, 16, p.broken ? C.danger : C.muted, 1.2);
    var nameW = Math.max(30, r.w - 44 - (r.w > 360 ? 112 : 12));
    textBox(g, p.name || p.filename, r.x + 30, r.y, nameW, r.h, 12.5, C.text, "left", true, nameW);
    if (r.w > 360) {
      textBox(g, p.broken ? "无法读取" : p.meta, r.x + r.w - 122, r.y, 108, r.h, 9.2, p.broken ? C.danger : C.faint, "right", false, 108);
    }
  }
  function drawEmpty(g) {
    var r = L.grid;
    var q = trimStr(S.search);
    L.emptyButtons = [];
    if (!q) return;
    var cx = r.x + r.w / 2;
    var cy = r.y + Math.min(Math.max(56, r.h / 2 - 8), 112);
    var iconSize = Math.min(52, r.w * 0.18);
    circle(g, cx, cy - 18, iconSize, withAlpha(C.text, 0.035), withAlpha(C.text, 0.08), 1);
    drawIcon(g, "search", cx, cy - 18, iconSize * 0.55, C.faint, 1.4);
    textBox(g, "没有匹配的预设", r.x + 10, cy + 30, r.w - 20, 22, 12.5, C.text, "center", true, r.w - 20);
    textBox(g, "试试别的关键词，或清除搜索", r.x + 10, cy + 52, r.w - 20, 16, 10, C.muted, "center", false, r.w - 20);
    var bw = Math.min(112, r.w - 24);
    var by = cy + 78;
    if (by + 28 < r.y + r.h) L.emptyButtons = [{ id: "clearSearch", x: cx - bw / 2, y: by, w: bw, h: 28, label: "清除搜索" }];
    for (var i = 0; i < L.emptyButtons.length; i++) {
      var b = L.emptyButtons[i], hov2 = hoverKey === "empty:" + b.id;
      fillStrokeRound(g, b.x, b.y, b.w, b.h, 7, hov2 ? C.cardHi : C.field, C.line, 1);
      textBox(g, b.label, b.x, b.y, b.w, b.h, 10, C.text, "center", false, b.w - 6);
    }
  }
  function drawFooter(g) {
    var f = L.footer;
    fillRect(g, f.x, f.y, f.w, f.h, C.footer);
    line(g, f.x, f.y, f.x + f.w, f.y, C.line, 1);
    var rb = L.footer.refresh, rh = hoverKey === "refresh";
    if (rh) fillRound(g, rb.x, rb.y, rb.w, rb.h, 5, withAlpha(C.text, 0.05));
    drawIcon(g, "refresh", rb.x + 13, rb.y + 13, 13, rh ? C.accent : C.faint, 1.2);
    var z = L.zoom, hov = (drag && drag.kind === "zoom") || hoverKey === "zoomTrack";
    if (!z) return;
    var pct = (S.zoom - z.min) / (z.max - z.min);
    fillRound(g, z.x, z.y - 3, z.w, 6, 3, withAlpha(C.text, hov ? 0.13 : 0.08));
    fillRound(g, z.x, z.y - 3, z.w * pct, 6, 3, C.accent);
    circle(g, z.x + z.w * pct, z.y, 6, C.accent, C.bg, 1.4);
    var mh = hoverKey === "zoomMinus", ph = hoverKey === "zoomPlus";
    if (mh) circle(g, z.minus.x + 11, z.minus.y + 12, 9, withAlpha(C.text, 0.06), null, 1);
    if (ph) circle(g, z.plus.x + 11, z.plus.y + 12, 9, withAlpha(C.text, 0.06), null, 1);
    line(g, z.minus.x + 7, z.minus.y + 12, z.minus.x + 15, z.minus.y + 12, C.muted, 1.2);
    drawIcon(g, "plus", z.plus.x + 11, z.plus.y + 12, 9, C.muted, 1.2);
    if (L.footer.zoomLabel) textBox(g, String(Math.round(S.zoom)), z.x + z.w + 4, z.y - 10, 28, 20, 7.5, C.faint, "left", false, 28);
  }
  function drawScrollbar(g) {
    var s = L.scrollbar;
    if (!s) return;
    fillRound(g, s.x, s.y, s.w, s.h, 4, withAlpha(C.text, 0.045));
    var hov = hoverKey === "scrollbar" || (drag && drag.kind === "scrollbar");
    fillRound(g, s.x, s.thumbY, s.w, s.thumbH, 4, withAlpha(C.accent, hov ? 0.7 : 0.46));
  }
  function drawToast(g) {
    var W = L.W, H = L.H;
    var msg = toastText;
    var tw = Math.min(W - 28, visualWidth(msg, 9) + 38);
    var x = Math.round((W - tw) / 2);
    var y = H - L.footer.h - 42;
    var col = toastKind === "warn" ? C.danger : C.accent;
    fillStrokeRound(g, x, y, tw, 30, 8, withAlpha([0.02, 0.03, 0.03], 0.94), withAlpha(col, 0.28), 1);
    circle(g, x + 15, y + 15, 3, col, null, 1);
    textBox(g, msg, x + 25, y, tw - 32, 30, 8.8, C.text, "left", false, tw - 34);
  }
  function drawOnboarding(g) {
    fillRect(g, 0, 0, L.W, L.H, withAlpha([0, 0, 0], 0.56));
    var o = L.onboard;
    if (!o) return;
    fillRound(g, o.x + 3, o.y + 7, o.w, o.h, 14, withAlpha([0, 0, 0], 0.28));
    fillRound(g, o.x, o.y, o.w, o.h, 14, [0.082, 0.090, 0.111, 1]);
    strokeRound(g, o.x, o.y, o.w, o.h, 14, withAlpha(C.accent, 0.22), 1);
    fillRound(g, o.logo.x, o.logo.y, o.logo.w, o.logo.h, 10, C.accentSoft);
    drawIcon(g, "sparkle", o.logo.x + o.logo.w / 2, o.logo.y + o.logo.h / 2, 17, C.accent, 1);
    textBox(g, "欢迎使用 suko", o.title.x, o.title.y, o.title.w, 24, o.compact ? 15 : 18, C.text, "left", true, o.title.w);
    textBox(g, "预设管理器", o.subtitle.x, o.subtitle.y, o.subtitle.w, 14, 8, C.faint, "left", false, o.subtitle.w);
    if (!o.compact) {
      textBox(g, "先告诉 suko 两件事，之后随时可以在设置里更改。", o.innerX, o.introY, o.innerW, 18, 9, C.muted, "left", false, o.innerW);
    }
    drawPathRow(g, o.lib, o.libField, o.libBrowse, "预设库文件夹", onboardLib, "lib", "用于存放 .ecpreset 的文件夹");
    drawPathRow(g, o.cfg, o.cfgField, o.cfgBrowse, "suko 路径文件", onboardCfg, "cfg", "配置文件 suko.config.json 会放在这里");
    if (onboardError) {
      drawText(g, "!", o.innerX + 2, o.errY + 12, 8, C.danger, true);
      textBox(g, onboardError, o.innerX + 14, o.errY, o.innerW - 14, 16, 8, C.danger, "left", false, o.innerW - 14);
    }
    var sh = hoverKey === "onboardStart";
    fillRound(g, o.start.x, o.start.y, o.start.w, o.start.h, 8, sh ? mix(C.accent, [1, 1, 1], 0.15) : C.accent);
    textBox(g, "开始使用", o.start.x, o.start.y, o.start.w, o.start.h, 9.5, C.onAccent, "center", true, o.start.w - 6);
    var dh = hoverKey === "onboardDefault";
    fillRound(g, o.useDefault.x, o.useDefault.y, o.useDefault.w, o.useDefault.h, 8, dh ? C.cardHi : C.field);
    strokeRound(g, o.useDefault.x, o.useDefault.y, o.useDefault.w, o.useDefault.h, 8, C.line, 1);
    textBox(g, "用默认", o.useDefault.x, o.useDefault.y, o.useDefault.w, o.useDefault.h, 8, C.muted, "center", false, o.useDefault.w - 4);
  }
  function drawPathRow(g, row, field, browse, label, value, id, hint) {
    drawText(g, label, row.x, row.y + 11, 8.5, C.muted, false);
    if (hint && L.onboard && !L.onboard.compact) {
      textBox(g, hint, row.x + 100, row.y + 1, row.w - 100, 12, 7, C.faint, "right", false, row.w - 100);
    }
    var focused = focus && focus.id === id;
    fillRound(g, field.x, field.y, field.w, field.h, 7, focused ? C.fieldHi : C.field);
    strokeRound(g, field.x, field.y, field.w, field.h, 7, focused ? withAlpha(C.accent, 0.7) : C.line, 1);
    var shown = String(value || "");
    if (focused) drawTextCaret(g, shown, field.x + 9, field.y, field.w - 16, field.h, 8.2, focus.caret, C.text, "");
    else textBox(g, fitPath(shown || "未设置", 8.2, field.w - 16), field.x + 9, field.y, field.w - 16, field.h, 8.2, shown ? C.text : C.faint, "left", false, field.w - 16);
    var bh = hoverKey === "browse:" + id;
    fillRound(g, browse.x, browse.y, browse.w, browse.h, 7, bh ? C.cardHi : C.field);
    strokeRound(g, browse.x, browse.y, browse.w, browse.h, 7, C.line, 1);
    textBox(g, "浏览", browse.x, browse.y, browse.w, browse.h, 8, C.muted, "center", false, browse.w - 4);
  }
  function drawSettings(g) {
    fillRect(g, 0, 0, L.W, L.H, withAlpha([0, 0, 0], 0.56));
    var o = L.settings;
    if (!o) return;
    fillRound(g, o.x + 3, o.y + 7, o.w, o.h, 14, withAlpha([0, 0, 0], 0.28));
    fillRound(g, o.x, o.y, o.w, o.h, 14, [0.082, 0.090, 0.111, 1]);
    strokeRound(g, o.x, o.y, o.w, o.h, 14, C.line, 1);
    textBox(g, "设置", o.title.x, o.title.y, o.title.w, 28, 20, C.text, "left", true, o.title.w);
    var langs = [{ r: o.langZh, id: "zh", label: "中文" }, { r: o.langEn, id: "en", label: "EN" }];
    for (var li = 0; li < langs.length; li++) {
      var lr = langs[li].r, lon = S.lang === langs[li].id;
      fillRound(g, lr.x, lr.y, lr.w, lr.h, 6, lon ? C.accentSoft : C.field);
      strokeRound(g, lr.x, lr.y, lr.w, lr.h, 6, lon ? withAlpha(C.accent, 0.65) : C.line, 1);
      textBox(g, langs[li].label, lr.x, lr.y, lr.w, lr.h, 10.5, lon ? C.accent : C.muted, "center", lon, lr.w - 4);
    }
    var ch = hoverKey === "settingsClose";
    fillRound(g, o.close.x, o.close.y, o.close.w, o.close.h, 6, ch ? C.cardHi : C.field);
    drawIcon(g, "close", o.close.x + 13, o.close.y + 13, 9, C.muted, 1.2);
    var dd = settingsDraft || { library: S.library, configDir: S.configDir };
    drawSettingsRow(g, o.libLabel, o.libField, o.libBrowse, o.libOpen, "预设库位置", dd.library, "lib", "lib");
    drawSettingsRow(g, o.cfgLabel, o.cfgField, o.cfgBrowse, null, "suko 配置文件位置", dd.configDir, "cfg", "cfg");
    if (settingsError) {
      drawText(g, "!", o.innerX + 2, o.hintY + 12, 9, C.danger, true);
      textBox(g, settingsError, o.innerX + 14, o.hintY, o.innerW - 14, 18, 10.2, C.danger, "left", false, o.innerW - 14);
    } else if (!o.compact) {
      textBox(g, "配置文件：" + fitPath(configPath(), 9.5, o.innerW - 62), o.innerX, o.hintY, o.innerW, 16, 9.5, C.faint, "left", false, o.innerW);
    }
    var sh = hoverKey === "settingsSave";
    fillRound(g, o.save.x, o.save.y, o.save.w, o.save.h, 8, sh ? mix(C.accent, [1, 1, 1], 0.12) : C.accent);
    textBox(g, "保存并关闭", o.save.x, o.save.y, o.save.w, o.save.h, 10.5, C.onAccent, "center", true, o.save.w - 4);
    var rh = hoverKey === "settingsReset";
    fillRound(g, o.reset.x, o.reset.y, o.reset.w, o.reset.h, 8, rh ? C.cardHi : C.field);
    strokeRound(g, o.reset.x, o.reset.y, o.reset.w, o.reset.h, 8, C.line, 1);
    textBox(g, "重新引导", o.reset.x, o.reset.y, o.reset.w, o.reset.h, 9.8, C.muted, "center", false, o.reset.w - 4);
    var fh = hoverKey === "settingsRefresh";
    fillRound(g, o.refresh.x, o.refresh.y, o.refresh.w, o.refresh.h, 8, fh ? C.cardHi : C.field);
    strokeRound(g, o.refresh.x, o.refresh.y, o.refresh.w, o.refresh.h, 8, C.line, 1);
    textBox(g, "刷新", o.refresh.x, o.refresh.y, o.refresh.w, o.refresh.h, 9.8, C.muted, "center", false, o.refresh.w - 4);
    if (!o.compact) textBox(g, "suko v" + VERSION + "  ·  预设管理器", o.innerX, o.footerY, o.innerW, 13, 8.8, C.faint, "left", false, o.innerW);
  }
  function drawSettingsRow(g, label, field, browse, openRect, labelText, value, id, focusId) {
    var focused = focus && focus.id === focusId;
    fillRound(g, field.x, field.y, field.w, field.h, 7, focused ? C.fieldHi : C.field);
    strokeRound(g, field.x, field.y, field.w, field.h, 7, focused ? withAlpha(C.accent, 0.7) : C.line, 1);
    var prefix = id === "lib" ? "预设库" : "配置";
    var prefixW = id === "lib" ? 52 : 38;
    textBox(g, prefix, field.x + 10, field.y, prefixW, field.h, 10.5, C.muted, "left", false, prefixW);
    var valueX = field.x + prefixW + 14, valueW = field.w - prefixW - 22;
    if (focused) drawTextCaret(g, String(value || ""), valueX, field.y, valueW, field.h, 11.5, focus.caret, C.text, "");
    else textBox(g, fitPath(value || "未设置", 11.5, valueW), valueX, field.y, valueW, field.h, 11.5, value ? C.text : C.faint, "left", false, valueW);
    var bh = hoverKey === "browse:" + id;
    fillRound(g, browse.x, browse.y, browse.w, browse.h, 7, bh ? C.cardHi : C.field);
    strokeRound(g, browse.x, browse.y, browse.w, browse.h, 7, C.line, 1);
    textBox(g, "浏览", browse.x, browse.y, browse.w, browse.h, 10.5, C.muted, "center", false, browse.w - 4);
    if (openRect) {
      var oh = hoverKey === "open:" + id;
      fillRound(g, openRect.x, openRect.y, openRect.w, openRect.h, 7, oh ? C.cardHi : C.field);
      strokeRound(g, openRect.x, openRect.y, openRect.w, openRect.h, 7, C.line, 1);
      drawIcon(g, "folder", openRect.x + openRect.w / 2, openRect.y + openRect.h / 2, 12, C.muted, 1.2);
    }
  }
  function drawMenu(g) {
    var m = L.menu;
    if (!m) return;
    fillRound(g, m.x + 3, m.y + 5, m.w, m.h, 9, withAlpha([0, 0, 0], 0.3));
    fillRound(g, m.x, m.y, m.w, m.h, 9, [0.095, 0.103, 0.126, 1]);
    strokeRound(g, m.x, m.y, m.w, m.h, 9, C.line, 1);
    var y = m.y + 4, i;
    if (m.title) {
      textBox(g, m.title, m.x + 10, y, m.w - 20, 20, 9.5, C.faint, "left", false, m.w - 20);
      y += 20;
    }
    for (i = 0; i < m.items.length; i++) {
      var it = m.items[i];
      if (it.sep) { line(g, m.x + 8, y + 3, m.x + m.w - 8, y + 3, C.line, 1); y += 7; continue; }
      var hov = hoverKey === "menu:" + i;
      if (hov) fillRound(g, m.x + 4, y, m.w - 8, 30, 6, withAlpha(C.text, 0.055));
      if (it.icon) drawIcon(g, it.icon, m.x + 18, y + 15, 12, it.checked ? C.accent : C.muted, 1.2);
      textBox(g, it.label, m.x + (it.icon ? 32 : 12), y, m.w - (it.icon ? 44 : 24), 30, 10.5, it.danger ? C.danger : C.text, "left", false, m.w - 48);
      if (it.checked) drawIcon(g, "check", m.x + m.w - 16, y + 15, 10, C.accent, 1.4);
      y += 30;
    }
  }
  function drawError(g) {
    var y = 0;
    fillRect(g, 0, 0, L.W, 28, [0.32, 0.08, 0.10, 0.96]);
    textBox(g, "suko error: " + lastError, 10, 0, L.W - 20, 28, 8, [1, 0.9, 0.9, 1], "left", false, L.W - 20);
  }

  // ---------------------------------------------------------------- hit testing / menu
  function ptIn(x, y, r) { return r && x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h; }
  function hitTest(x, y) {
    if (menu) {
      var m = L.menu;
      if (m) {
        for (var i = 0; i < m.items.length; i++) {
          if (!m.items[i].sep && ptIn(x, y, m.items[i].rect)) return { kind: "menuItem", item: m.items[i], index: i };
        }
      }
      return { kind: "menuBlank" };
    }
    if (UI.onboarding) {
      var o = L.onboard;
      if (o) {
        if (ptIn(x, y, o.start)) return { kind: "onboardStart" };
        if (ptIn(x, y, o.useDefault)) return { kind: "onboardDefault" };
        if (ptIn(x, y, o.libField)) return { kind: "field", id: "lib" };
        if (ptIn(x, y, o.libBrowse)) return { kind: "browse", id: "lib" };
        if (ptIn(x, y, o.cfgField)) return { kind: "field", id: "cfg" };
        if (ptIn(x, y, o.cfgBrowse)) return { kind: "browse", id: "cfg" };
        return { kind: "onboardBlank" };
      }
    }
    if (UI.settings) {
      var s = L.settings;
      if (s) {
        if (ptIn(x, y, s.close)) return { kind: "settingsClose" };
        if (s.langZh && ptIn(x, y, s.langZh)) return { kind: "lang", lang: "zh" };
        if (s.langEn && ptIn(x, y, s.langEn)) return { kind: "lang", lang: "en" };
        if (ptIn(x, y, s.libField)) return { kind: "field", id: "lib" };
        if (ptIn(x, y, s.cfgField)) return { kind: "field", id: "cfg" };
        if (ptIn(x, y, s.libBrowse)) return { kind: "browse", id: "lib" };
        if (ptIn(x, y, s.cfgBrowse)) return { kind: "browse", id: "cfg" };
        if (ptIn(x, y, s.libOpen)) return { kind: "open", id: "lib" };
        if (ptIn(x, y, s.save)) return { kind: "settingsSave" };
        if (ptIn(x, y, s.reset)) return { kind: "settingsReset" };
        if (ptIn(x, y, s.refresh)) return { kind: "settingsRefresh" };
        return { kind: "settingsBlank" };
      }
    }
    if (ptIn(x, y, L.header)) {
      if (L.subAdd && ptIn(x, y, L.subAdd)) return { kind: "subAdd" };
      if (L.chipAdd && ptIn(x, y, L.chipAdd)) return { kind: "chipAdd" };
      if (ptIn(x, y, L.header.search)) {
        if (trimStr(S.search)) {
          var cr = { x: L.header.search.x + L.header.search.w - 26, y: L.header.search.y, w: 26, h: L.header.search.h };
          if (ptIn(x, y, cr)) return { kind: "searchClear" };
        }
        return { kind: "search" };
      }
      if (L.chipScroll && ptIn(x, y, { x: L.chipScroll.x, y: L.chipScroll.y - 4, w: L.chipScroll.w, h: 14 })) return { kind: "chipScroll" };
      for (var ci = 0; ci < L.chips.length; ci++) if (ptIn(x, y, L.chips[ci])) {
        if (L.chips[ci].more) return { kind: "chipsMore" };
        return { kind: "chip", id: L.chips[ci].id };
      }
      return { kind: "headerBlank" };
    }
    if (ptIn(x, y, L.sidebar)) {
      if (L.newFolder && ptIn(x, y, L.newFolder)) return { kind: "newFolder" };
      if (ptIn(x, y, L.settingsBtn)) return { kind: "settings" };
      for (var ni = 0; ni < L.navs.length; ni++) if (ptIn(x, y, L.navs[ni])) return { kind: "nav", id: L.navs[ni].id };
      if (L.navScroll && ptIn(x, y, { x: L.navScroll.x - 4, y: L.navScroll.y, w: 16, h: L.navScroll.h })) return { kind: "navScroll", y0: y };
      return { kind: "sidebarBlank" };
    }
    if (ptIn(x, y, L.grid)) {
      if (L.addCard && ptIn(x, y, L.addCard)) return { kind: "addPreset" };
      for (var i2 = L.cards.length - 1; i2 >= 0; i2--) {
        var card = L.cards[i2];
        if (!ptIn(x, y, card)) continue;
        if (card.play && ptIn(x, y, card.play)) return { kind: "cardApply", path: card.p.path };
        return { kind: "card", path: card.p.path, card: card };
      }
      if (L.scrollbar && ptIn(x, y, { x: L.scrollbar.x - 4, y: L.scrollbar.y, w: 14, h: L.scrollbar.h })) return { kind: "scrollbar" };
      for (var bi = 0; bi < L.emptyButtons.length; bi++) if (ptIn(x, y, L.emptyButtons[bi])) return { kind: "empty", id: L.emptyButtons[bi].id };
      return { kind: "gridBlank" };
    }
    if (ptIn(x, y, L.footer)) {
      if (L.zoom) {
        if (ptIn(x, y, L.zoom.minus)) return { kind: "zoomMinus" };
        if (ptIn(x, y, L.zoom.plus)) return { kind: "zoomPlus" };
        if (ptIn(x, y, { x: L.zoom.x - 16, y: L.zoom.y - 16, w: L.zoom.w + 32, h: 32 })) return { kind: "zoomTrack" };
      }
      if (ptIn(x, y, L.footer.refresh)) return { kind: "refresh" };
      return { kind: "footerBlank" };
    }
    return { kind: "none" };
  }
  function openMenu(kind, anchor, items, title) {
    var x = anchor.x, y = anchor.y + anchor.h + 5;
    menu = { kind: kind, x: x, y: y, items: items, title: title, anchor: anchor };
    layoutMenu(null);
    redraw(true);
  }
  function layoutMenu(g) {
    if (!menu) return;
    var w = 140, i;
    for (i = 0; i < menu.items.length; i++) {
      var it = menu.items[i];
      if (it.sep) continue;
      var tw = visualWidth(it.label, 10.5) + (it.icon ? 48 : 28);
      if (tw > w) w = tw;
    }
    if (menu.title) w = Math.max(w, visualWidth(menu.title, 9.5) + 24);
    w = Math.min(w, L.W - 12);
    var h = 8;
    for (i = 0; i < menu.items.length; i++) h += menu.items[i].sep ? 7 : 30;
    if (menu.title) h += 20;
    var x = clamp(menu.x, 6, Math.max(6, L.W - w - 6));
    var y = clamp(menu.y, 6, Math.max(6, L.H - h - 6));
    menu.x = x; menu.y = y; menu.w = w; menu.h = h;
    var cy = y + 4;
    if (menu.title) cy += 20;
    for (i = 0; i < menu.items.length; i++) {
      if (menu.items[i].sep) { cy += 7; continue; }
      menu.items[i].rect = { x: x + 4, y: cy, w: w - 8, h: 30 };
      cy += 30;
    }
    L.menu = menu;
  }
  function modeMenu() {
    var items = [], i;
    for (i = 0; i < MODES.length; i++) {
      items.push({
        label: MODES[i].label, icon: MODES[i].icon, checked: S.display === MODES[i].id,
        action: (function (id) { return function () { S.display = id; saveState(true); menu = null; redraw(true); }; })(MODES[i].id)
      });
    }
    openMenu("mode", L.header.mode, items, "显示方式");
  }
  function moreChipsMenu() {
    var items = [], hidden = L.moreChips || [], i;
    items.push({ label: "全部", icon: "grid", checked: !S.sub, action: function () { S.sub = ""; menu = null; S.scroll = 0; redraw(true); } });
    for (i = 0; i < hidden.length; i++) {
      if (hidden[i].more) continue;
      items.push({
        label: hidden[i].label, count: hidden[i].count, checked: S.sub === hidden[i].id,
        action: (function (id) { return function () { S.sub = id; menu = null; S.scroll = 0; redraw(true); }; })(hidden[i].id)
      });
    }
    openMenu("chips", L.chips[L.chips.length - 1], items, "子文件夹");
  }
  function cardMenu(p, x, y) {
    var items = [
      { label: "应用预设", icon: "play", action: function () { menu = null; applyPreset(p); } },
      { label: "删除预设", icon: "close", action: function () { menu = null; deletePresetConfirm(p); } },
      { label: "刷新列表", icon: "refresh", action: function () { menu = null; refreshLibrary(); } }
    ];
    menu = { kind: "card", x: x, y: y, items: items, title: p.name };
    layoutMenu(null);
    redraw(true);
  }
  function deletePresetConfirm(p) {
    if (!p) return;
    var dlg = new Window("palette", l10n("删除预设"));
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = 16;
    dlg.spacing = 8;
    var msg = dlg.add("statictext", undefined, l10n("确定删除这个预设吗？"));
    var nm = dlg.add("statictext", undefined, p.filename || p.name);
    try { nm.graphics.font = ScriptUI.newFont("Microsoft YaHei UI", "BOLD", 11); } catch (e0) {}
    var where = dlg.add("statictext", undefined, fitPath(p.path, 8, 420));
    var warn = dlg.add("statictext", undefined, l10n("删除后无法恢复；这不会影响当前项目。"));
    try { warn.graphics.font = ScriptUI.newFont("Microsoft YaHei UI", "REGULAR", 8); } catch (e1) {}
    var err = dlg.add("statictext", undefined, "");
    var row = dlg.add("group");
    row.alignment = ["right", "top"];
    var cancel = row.add("button", undefined, l10n("取消"));
    var del = row.add("button", undefined, l10n("删除"));
    cancel.onClick = function () { try { dlg.close(0); } catch (e2) {} };
    del.onClick = function () {
      var f = new File(p.path), ok = false, em = "";
      try { ok = f.remove(); } catch (e3) { em = e3 && e3.message ? String(e3.message) : String(e3); }
      if (!ok) {
        err.text = "删除失败：" + (em || "文件可能被占用");
        dlg.layout.layout(true);
        return;
      }
      try { dlg.close(1); } catch (e4) {}
      var nr = [], i;
      for (i = 0; i < S.recent.length; i++) if (S.recent[i] !== p.path) nr.push(S.recent[i]);
      S.recent = nr;
      if (S.current === p.path) S.current = "";
      scanLibrary();
      saveState(true);
      showToast("已删除 · " + (p.filename || p.name));
      redraw(true);
    };
    try { dlg.defaultElement = cancel; dlg.cancelElement = cancel; } catch (e5) {}
    trackAux(dlg);
    dlg.show();
  }
  function removeFolderRecursive(path) {
    var f = new Folder(path);
    if (!f.exists) return true;
    var kids = f.getFiles();
    for (var i = 0; i < kids.length; i++) {
      var kid = kids[i];
      try {
        if (kid instanceof Folder) {
          if (!removeFolderRecursive(kid.fsName)) return false;
        } else if (!kid.remove()) {
          return false;
        }
      } catch (e1) {
        return false;
      }
    }
    try { return f.remove(); } catch (e2) { return false; }
  }

  function deleteFolderConfirm(folderObj, isSub) {
    if (!folderObj) return;
    var dlg = new Window("palette", l10n("删除文件夹"));
    dlg.orientation = "column";
    dlg.alignChildren = ["fill", "top"];
    dlg.margins = 16;
    dlg.spacing = 8;
    dlg.add("statictext", undefined, l10n("确定删除这个文件夹吗？"));
    var nm = dlg.add("statictext", undefined, folderObj.name);
    try { nm.graphics.font = ScriptUI.newFont("Microsoft YaHei UI", "BOLD", 11); } catch (e0) {}
    dlg.add("statictext", undefined, fitPath(folderObj.path, 8, 420));
    var n = folderObj.count || 0;
    var warnText = S.lang === "en"
      ? "This folder and its " + n + " presets/subfolders will be deleted. This cannot be undone."
      : "文件夹内的 " + n + " 个预设及其子文件夹也会被删除，无法恢复。";
    var warn = dlg.add("statictext", undefined, warnText);
    try { warn.graphics.font = ScriptUI.newFont("Microsoft YaHei UI", "REGULAR", 8); } catch (e1) {}
    var err = dlg.add("statictext", undefined, "");
    var row = dlg.add("group");
    row.alignment = ["right", "top"];
    var cancel = row.add("button", undefined, l10n("取消"));
    var del = row.add("button", undefined, l10n("删除"));
    cancel.onClick = function () { try { dlg.close(0); } catch (e2) {} };
    del.onClick = function () {
      var ok = false, em = "";
      try { ok = removeFolderRecursive(folderObj.path); }
      catch (e3) { em = e3 && e3.message ? String(e3.message) : String(e3); }
      if (!ok) {
        err.text = "删除失败：" + (em || "文件夹或其中的文件可能被占用");
        dlg.layout.layout(true);
        return;
      }
      try { dlg.close(1); } catch (e4) {}
      if (isSub) S.sub = "";
      else { S.selected = ""; S.sub = ""; }
      S.current = "";
      var prefix = normPath(folderObj.path).replace(/\/$/, "") + "/";
      var nr = [], i;
      for (i = 0; i < S.recent.length; i++) {
        if (S.recent[i].indexOf(prefix) !== 0) nr.push(S.recent[i]);
      }
      S.recent = nr;
      scanLibrary();
      saveState(true);
      showToast("已删除文件夹 · " + folderObj.name);
      redraw(true);
    };
    try { dlg.defaultElement = cancel; dlg.cancelElement = cancel; } catch (e5) {}
    trackAux(dlg);
    dlg.show();
  }

  function folderMenu(folderObj, isSub, x, y) {
    var items = [
      { label: "删除文件夹", icon: "close", action: function () {
        menu = null;
        deleteFolderConfirm(folderObj, isSub);
      } }
    ];
    menu = { kind: "folder", x: x, y: y, items: items, title: folderObj.name };
    layoutMenu(null);
    redraw(true);
  }

  function refreshLibrary() {
    // A manual refresh must see external edits: drop the read cache first.
    // Startup/automatic scans keep it so refresh stays cheap when nothing changed.
    CACHE = {};
    scanLibrary();
    saveState(true);
    showToast("已刷新 · " + ALL.length + " 个预设");
    redraw(true);
  }

  // ---------------------------------------------------------------- activation
  function activate(hit) {
    if (!hit) return;
    if (hit.kind === "menuItem") {
      var it = hit.item;
      menu = null;
      if (it.action) it.action();
      redraw(true);
      return;
    }
    if (hit.kind === "search") {
      openSearchDialog();
      return;
    }
    if (hit.kind === "searchClear") {
      S.search = ""; focus = { id: "search", caret: 0 }; S.scroll = 0; redraw(true); return;
    }
    if (hit.kind === "newFolder") { createFolder(); return; }
    if (hit.kind === "subAdd" || hit.kind === "chipAdd") {
      var c0 = currentCategory();
      if (c0) createFolder(c0.path, c0.id);
      return;
    }
    if (hit.kind === "nav") {
      S.selected = hit.id; S.sub = ""; S.scroll = 0; S.navScroll = 0; S.chipScroll = 0;
      settingsDraft = null; menu = null; saveState(true); redraw(true); return;
    }
    if (hit.kind === "chip") {
      S.sub = hit.id; S.scroll = 0; saveState(true); redraw(true); return;
    }
    if (hit.kind === "chipsMore") { moreChipsMenu(); return; }
    if (hit.kind === "settings") { openSettings(); return; }
    if (hit.kind === "card") {
      var p = findPreset(hit.path);
      if (p) {
        var t = nowMs();
        if (lastClick && lastClick.path === p.path && t - lastClick.t < 380) {
          lastClick = null;
          applyPreset(p);
        } else {
          S.current = p.path;
          lastClick = { path: p.path, t: t };
          saveState(true);
          redraw(true);
        }
      }
      return;
    }
    if (hit.kind === "cardApply") {
      var p2 = findPreset(hit.path);
      if (p2) applyPreset(p2);
      return;
    }
    if (hit.kind === "scrollbar") {
      drag = { kind: "scrollbar", y0: 0, scroll0: S.scroll, thumbY: L.scrollbar.thumbY, h: L.scrollbar.h, thumbH: L.scrollbar.thumbH };
      redraw(true); return;
    }
    if (hit.kind === "navScroll") {
      drag = { kind: "navScroll", y0: 0, scroll0: S.navScroll, thumbY: L.navScroll.thumbY, h: L.navScroll.h, thumbH: L.navScroll.thumbH };
      redraw(true); return;
    }
    if (hit.kind === "zoomTrack" || hit.kind === "zoomMinus" || hit.kind === "zoomPlus") {
      if (hit.kind === "zoomMinus") S.zoom = clamp(S.zoom - 12, 84, 240);
      else if (hit.kind === "zoomPlus") S.zoom = clamp(S.zoom + 12, 84, 240);
      else setZoomFromX(hitMouseX);
      saveState(true); redraw(true); return;
    }
    if (hit.kind === "refresh") { refreshLibrary(); return; }
    if (hit.kind === "addPreset") { saveCurrentPreset(); return; }
    if (hit.kind === "empty") {
      if (hit.id === "addPreset") { saveCurrentPreset(); return; }
      if (hit.id === "clearSearch") { S.search = ""; focus = { id: "search", caret: 0 }; S.scroll = 0; }
      else if (hit.id === "openLib") openLibraryFolder(S.library);
      else refreshLibrary();
      redraw(true); return;
    }
    if (hit.kind === "onboardStart") { startUsing(); return; }
    if (hit.kind === "onboardDefault") {
      var d = defaults(); onboardLib = d.library; onboardCfg = d.configDir; onboardError = "";
      redraw(true); return;
    }
    if (hit.kind === "browse") {
      var cur = hit.id === "lib" ? (UI.settings ? settingsDraft.library : onboardLib) : (UI.settings ? settingsDraft.configDir : onboardCfg);
      chooseFolder(cur, hit.id === "lib" ? "选择预设库文件夹" : "选择 suko 配置文件所在文件夹", function (path) {
        if (UI.settings && settingsDraft) { if (hit.id === "lib") settingsDraft.library = path; else settingsDraft.configDir = path; }
        else { if (hit.id === "lib") onboardLib = path; else onboardCfg = path; }
        redraw(true);
      });
      return;
    }
    if (hit.kind === "open") {
      openLibraryFolder(UI.settings && settingsDraft ? settingsDraft.library : S.library);
      return;
    }
    if (hit.kind === "settingsClose") { closeSettings(true); return; }
    if (hit.kind === "lang") {
      S.lang = hit.lang;
      if (settingsDraft) settingsDraft.lang = hit.lang;
      saveState(true); redraw(true); return;
    }
    if (hit.kind === "settingsSave") { saveSettings(); return; }
    if (hit.kind === "settingsReset") {
      UI.settings = false; settingsDraft = null; S.onboarded = false; saveState(true);
      openOnboarding(true); return;
    }
    if (hit.kind === "settingsRefresh") { refreshLibrary(); return; }
  }

  // ---------------------------------------------------------------- mouse / keyboard
  var hitMouseX = 0, hitMouseY = 0;
  function keyOf(hit) {
    if (!hit) return "";
    var tail = hit.id || hit.path || "";
    return tail ? hit.kind + ":" + tail : hit.kind;
  }
  function noteButtons(e) {
    // 0.19+ panels keep sending moves with buttons; nothing to store.
  }
  function openContextAt(x, y) {
    var rh = hitTest(x, y);
    if (rh && rh.kind === "card") {
      var p = findPreset(rh.path);
      if (p) { S.current = p.path; cardMenu(p, x, y); return true; }
    }
    if (rh && rh.kind === "nav") {
      var fc = CAT_BY_ID[rh.id];
      if (fc) { folderMenu(fc, false, x, y); return true; }
    }
    // Right-click on the folder rail can land between hit rows in ScriptUI;
    // resolve the row geometrically as a fallback.
    if (x < L.sidebar.w) {
      for (var ni = 0; ni < L.navs.length; ni++) {
        var nr = L.navs[ni];
        if (y >= nr.y && y <= nr.y + nr.h) {
          var nf = CAT_BY_ID[nr.id];
          if (nf) { folderMenu(nf, false, x, y); return true; }
        }
      }
    }
    if (rh && rh.kind === "chip" && rh.id) {
      var cc = currentCategory(), fs = null, si;
      if (cc) {
        for (si = 0; si < cc.subs.length; si++) {
          if (cc.subs[si].id === rh.id) fs = cc.subs[si];
        }
      }
      if (fs) { folderMenu(fs, true, x, y); return true; }
    }
    if (menu) { menu = null; redraw(true); }
    return true;
  }
  function onMouseDown(e) {
    hitMouseX = e.clientX; hitMouseY = e.clientY;
    noteButtons(e);
    if (e.button === 2 || e.buttons === 2) {
      openContextAt(e.clientX, e.clientY);
      return;
    }
    if (menu) {
      var mh = hitTest(e.clientX, e.clientY);
      if (mh.kind === "menuItem") activate(mh);
      else { menu = null; redraw(true); }
      return;
    }
    var hit = hitTest(e.clientX, e.clientY);
    if (!hit) return;
    if (hit.kind === "field") {
      // Canvas keydown is not reliable in EffectCraft, so path fields edit in a
      // real modeless palette instead of drawing an invisible caret.
      var fid = hit.id;
      var pathTitle = fid === "lib" ? "预设库路径" : "suko 配置文件位置";
      promptText(pathTitle, "输入文件夹路径", fieldText(fid), function (v) {
        setFieldText(fid, normPath(v));
        redraw(true);
      }, "请输入路径");
      press = null; return;
    }
    if (UI.onboarding && hit.kind === "onboardBlank") return;
    if (UI.settings && hit.kind === "settingsBlank") return;
    focus = null;
    press = { hit: hit, x: e.clientX, y: e.clientY, key: keyOf(hit), moved: false };
    var key = keyOf(hit);
    if (hit.kind === "zoomTrack") {
      drag = { kind: "zoom", track: L.zoom };
      setZoomFromX(e.clientX);
      redraw(true); return;
    }
    if (hit.kind === "scrollbar") {
      drag = { kind: "scrollbar", y0: e.clientY, scroll0: S.scroll, thumbY: L.scrollbar.thumbY, h: L.scrollbar.h, thumbH: L.scrollbar.thumbH };
      redraw(true); return;
    }
    if (hit.kind === "navScroll") {
      drag = { kind: "navScroll", y0: e.clientY, scroll0: S.navScroll, thumbY: L.navScroll.thumbY, h: L.navScroll.h, thumbH: L.navScroll.thumbH };
      redraw(true); return;
    }
    if (hit.kind === "chipScroll") {
      drag = { kind: "chipScroll", x0: e.clientX, scroll0: S.chipScroll, trackW: L.chipScroll.trackW, thumbW: L.chipScroll.thumbW, max: L.chipScroll.maxScroll };
      redraw(true); return;
    }
    if (hit.kind === "gridBlank") {
      drag = { kind: "pan", y0: e.clientY, scroll0: S.scroll, moved: false };
    }
    redraw(true);
    try { canvas.active = true; } catch (e2) {}
  }
  function onMouseMove(e) {
    noteButtons(e);
    if (e.clientX !== undefined) { hitMouseX = e.clientX; hitMouseY = e.clientY; }
    if (drag) {
      if (drag.kind === "zoom") { setZoomFromX(e.clientX); redraw(); return; }
      if (drag.kind === "scrollbar") {
        var dy = e.clientY - drag.y0;
        var max = L.maxScroll || 0;
        var track = Math.max(1, drag.h - drag.thumbH);
        S.scroll = clamp(drag.scroll0 + dy * (max / track), 0, max);
        if (Math.abs(dy) > 2) drag.moved = true;
        redraw(); return;
      }
      if (drag.kind === "navScroll") {
        var dy2 = e.clientY - drag.y0;
        var max2 = L.navScrollMax || 0;
        var track2 = Math.max(1, drag.h - drag.thumbH);
        S.navScroll = clamp(drag.scroll0 + dy2 * (max2 / track2), 0, max2);
        if (Math.abs(dy2) > 2) drag.moved = true;
        redraw(); return;
      }
      if (drag.kind === "chipScroll") {
        var dx2 = e.clientX - drag.x0;
        var ctrack = Math.max(1, drag.trackW - drag.thumbW);
        S.chipScroll = clamp(drag.scroll0 + dx2 * (drag.max / ctrack), 0, drag.max);
        if (Math.abs(dx2) > 2) drag.moved = true;
        redraw(); return;
      }
      if (drag.kind === "pan") {
        var dy3 = e.clientY - drag.y0;
        if (Math.abs(dy3) > 3) drag.moved = true;
        if (drag.moved) {
          S.scroll = clamp(drag.scroll0 - dy3, 0, L.maxScroll || 0);
          redraw(); return;
        }
      }
    }
    var hit = hitTest(e.clientX, e.clientY);
    var hk = hit ? keyOf(hit) : "";
    if (hit && (hit.kind === "card" || hit.kind === "nav" || hit.kind === "chip")) hk = "";
    if (hk !== hoverKey) { hoverKey = hk; redraw(); }
  }
  function onMouseUp(e) {
    noteButtons(e);
    if (drag) {
      if (drag.kind === "zoom") saveState(true);
      drag = null;
      press = null;
      redraw(true);
      return;
    }
    if (press) {
      var hit = hitTest(e.clientX, e.clientY);
      var same = hit && keyOf(hit) === press.key;
      var p = press; press = null;
      if (same) activate(hit);
      else redraw(true);
      return;
    }
    press = null;
  }
  function onClick(e) {
    noteButtons(e);
    if ((e.button === 2 || e.buttons === 2) && !menu) {
      openContextAt(e.clientX, e.clientY);
    }
  }
  function onMouseOut(e) {
    noteButtons(e);
    if (drag && e.buttons === 0) {
      if (drag.kind === "zoom") saveState(true);
      drag = null; press = null;
    }
    hoverKey = null;
    redraw();
  }
  function onWheel(e) {
    var z = L.zoom;
    if (!z) return;
    var x = (e && e.clientX !== undefined) ? e.clientX : hitMouseX;
    var y = (e && e.clientY !== undefined) ? e.clientY : hitMouseY;
    if (x < z.x - 16 || x > z.x + z.w + 16 || y < z.y - 16 || y > z.y + 16) return;
    var d = 0;
    if (e && e.deltaY !== undefined) d = e.deltaY;
    if (!d && e && e.wheelDelta !== undefined) d = -e.wheelDelta;
    if (!d && e && e.detail !== undefined) d = e.detail;
    if (!d) return;
    S.zoom = clamp(S.zoom + (d > 0 ? -6 : 6), 84, 240);
    saveState(true);
    redraw(true);
  }
  function setZoomFromX(x) {
    var z = L.zoom;
    if (!z) return;
    var pct = clamp((x - z.x) / z.w, 0, 1);
    S.zoom = clamp(Math.round(z.min + pct * (z.max - z.min)), z.min, z.max);
  }
  function fieldText(id) {
    if (id === "search") return S.search || "";
    if (UI.settings && settingsDraft) return id === "lib" ? settingsDraft.library : settingsDraft.configDir;
    return id === "lib" ? onboardLib : onboardCfg;
  }
  function fieldRect(id) {
    if (id === "search") return L.header.search;
    if (UI.settings) return id === "lib" ? L.settings.libField : L.settings.cfgField;
    return id === "lib" ? L.onboard.libField : L.onboard.cfgField;
  }
  function setFieldText(id, text) {
    if (id === "search") { S.search = text; S.scroll = 0; return; }
    if (UI.settings && settingsDraft) { if (id === "lib") settingsDraft.library = text; else settingsDraft.configDir = text; }
    else { if (id === "lib") onboardLib = text; else onboardCfg = text; }
  }
  function caretFromX(text, rect, x) {
    if (!rect) return String(text || "").length;
    var size = focus && focus.id === "search" ? 10 : 8.2;
    var tx = rect.x + 9, w = 0, best = 0;
    var visible = String(text || "");
    for (var i = 0; i < visible.length; i++) {
      var ch = visible.charAt(i);
      var cw = (ch.charCodeAt(0) >= 0x2e80) ? size * 1.12 : size * 0.56;
      if (tx + w + cw / 2 > x) break;
      w += cw; best = i + 1;
    }
    return best;
  }
  function onKey(e) {
    var key = String((e && (e.key || e.keyName)) || "");
    var code = e && e.keyCode;
    if (!key && code) {
      if (code === 8) key = "Backspace"; else if (code === 13) key = "Enter";
      else if (code === 27) key = "Escape"; else if (code === 37) key = "Left";
      else if (code === 38) key = "Up"; else if (code === 39) key = "Right";
      else if (code === 40) key = "Down"; else if (code === 46) key = "Delete";
      else if (code === 33) key = "PageUp"; else if (code === 34) key = "PageDown";
      else if (code === 35) key = "End"; else if (code === 36) key = "Home";
    }
    var printable = key.length === 1 && key.charCodeAt(0) >= 32;
    if (e && e.ctrlKey && (key === "f" || key === "F")) { openSearchDialog(); return; }
    if (menu) {
      if (key === "Escape") { menu = null; redraw(true); }
      return;
    }
    if (focus) {
      var text = fieldText(focus.id);
      var caret = clamp(focus.caret, 0, text.length);
      if (key === "Escape") { focus = null; redraw(true); return; }
      if (key === "Backspace" || code === 8) {
        if (caret > 0) { setFieldText(focus.id, text.substring(0, caret - 1) + text.substring(caret)); focus.caret = caret - 1; }
        redraw(true); return;
      }
      if (key === "Delete" || code === 46) {
        if (caret < text.length) setFieldText(focus.id, text.substring(0, caret) + text.substring(caret + 1));
        redraw(true); return;
      }
      if (key === "Left") { focus.caret = Math.max(0, caret - 1); redraw(true); return; }
      if (key === "Right") { focus.caret = Math.min(text.length, caret + 1); redraw(true); return; }
      if (key === "Home") { focus.caret = 0; redraw(true); return; }
      if (key === "End") { focus.caret = text.length; redraw(true); return; }
      if (key === "Enter" || code === 13) {
        if (focus.id === "search") {
          var first = L.items && L.items.length ? L.items[0] : null;
          if (first) applyPreset(first);
        } else focus = null;
        redraw(true); return;
      }
      if (printable) {
        setFieldText(focus.id, text.substring(0, caret) + key + text.substring(caret));
        focus.caret = caret + 1;
        redraw(true); return;
      }
      return;
    }
    if (UI.onboarding || UI.settings) {
      if (key === "Escape" && UI.settings) closeSettings(true);
      return;
    }
    if (key === "PageDown" || code === 34) { S.scroll = clamp(S.scroll + L.grid.h * 0.86, 0, L.maxScroll); redraw(true); return; }
    if (key === "PageUp" || code === 33) { S.scroll = clamp(S.scroll - L.grid.h * 0.86, 0, L.maxScroll); redraw(true); return; }
    if (key === "Enter" || code === 13) {
      var p = S.current ? findPreset(S.current) : null;
      if (!p && L.items && L.items.length) p = L.items[0];
      if (p) applyPreset(p);
      return;
    }
    if (key === "Up" || key === "Down" || key === "Left" || key === "Right") {
      var list = L.items || [], idx = -1, i;
      for (i = 0; i < list.length; i++) if (list[i].path === S.current) idx = i;
      if (idx < 0) idx = 0;
      var cols = L.gridCols || 1;
      if (key === "Left") idx = Math.max(0, idx - 1);
      else if (key === "Right") idx = Math.min(list.length - 1, idx + 1);
      else if (key === "Up") idx = Math.max(0, idx - cols);
      else idx = Math.min(list.length - 1, idx + cols);
      if (list[idx]) { S.current = list[idx].path; ensureVisible(idx); saveState(true); redraw(true); }
      return;
    }
  }
  function ensureVisible(idx) {
    if (!L || !L.gridCols) return;
    var row = Math.floor(idx / L.gridCols);
    var y = row * (L.cardH + L.rowGap);
    if (y < S.scroll) S.scroll = y;
    else if (y + L.cardH > S.scroll + L.grid.h) S.scroll = y + L.cardH - L.grid.h + 6;
    S.scroll = clamp(S.scroll, 0, L.maxScroll || 0);
  }

  // ---------------------------------------------------------------- draw loop / init
  function redraw(force) {
    if (!canvas || drawing) return;
    var t = nowMs();
    if (!force && t - lastPaint < 30) return;
    lastPaint = t;
    drawing = true;
    try { (win || canvas.window).layout.layout(true); }
    catch (e) { try { canvas.notify("onDraw"); } catch (e2) {} }
    drawing = false;
  }
  function onDraw() {
    var g;
    try { g = this.graphics; } catch (e) { return; }
    try {
      buildLayout(g);
      drawAll(g);
      lastError = "";
    } catch (e2) {
      lastError = (e2 && e2.message ? e2.message : String(e2)) + (e2 && e2.line ? " @" + e2.line : "");
      if (!errorLogged) {
        errorLogged = true;
        try {
          var f = new File(normPath((S.configDir || docsPath()) + "/suko-error.log"));
          f.encoding = "UTF-8";
          if (f.open("a")) { f.write("suko " + VERSION + " error: " + lastError + "\n"); f.close(); }
        } catch (e3) {}
      }
      try {
        var W = this.size.width || 300, H = this.size.height || 200;
        fillRect(g, 0, 0, W, H, [0.16, 0.05, 0.06, 1]);
        drawText(g, "suko 出错", 12, 28, 13, [1, 0.9, 0.9, 1], true);
        drawWrapped(g, lastError, 12, 34, W - 24, 8, [1, 0.86, 0.86, 1], 13, 6);
      } catch (e4) {}
    }
  }
  function init() {
    loadState();
    var ok = false;
    if (libraryOk()) ok = scanLibrary();
    embedded = IS_PANEL;
    if (IS_PANEL) {
      root = thisObj;
      root.orientation = "stack";
      root.alignChildren = ["fill", "fill"];
      root.margins = 0;
      root.spacing = 0;
      try { root.preferredSize = [MIN_W, MIN_H]; } catch (e) {}
    } else {
      root = new Window("palette", "suko", undefined, { resizeable: true });
      root.orientation = "stack";
      root.alignChildren = ["fill", "fill"];
      root.margins = 0;
      root.spacing = 0;
      try { root.size = [420, 620]; } catch (e2) {}
      win = root;
    }
    canvas = root.add("panel", undefined, undefined, { name: "canvas" });
    canvas.alignment = ["fill", "fill"];
    canvas.onDraw = onDraw;
    try { canvas.addEventListener("mousedown", onMouseDown); } catch (e3) {}
    try { canvas.addEventListener("mousemove", onMouseMove); } catch (e4) {}
    try { canvas.addEventListener("mouseup", onMouseUp); } catch (e5) {}
    try { canvas.addEventListener("click", onClick); } catch (e5a) {}
    try { canvas.addEventListener("mouseout", onMouseOut); } catch (e6) {}
    try { canvas.addEventListener("mousewheel", onWheel); } catch (e6a) {}
    try { canvas.addEventListener("wheel", onWheel); } catch (e6b) {}
    try { canvas.onMouseWheel = onWheel; } catch (e6c) {}
    try { root.addEventListener("mousewheel", onWheel); } catch (e6d) {}
    try { root.addEventListener("wheel", onWheel); } catch (e6e) {}
    try { root.onMouseWheel = onWheel; } catch (e6f) {}
    try { canvas.onKeyDown = onKey; } catch (e7) {}
    try { canvas.addEventListener("keydown", onKey); } catch (e8) {}
    try { root.onKeyDown = onKey; } catch (e9) {}
    try { root.addEventListener("keydown", onKey); } catch (e10) {}
    root.onResizing = function () {
      try {
        var s = canvas.size;
        if (s[0] !== lastCanvasW || s[1] !== lastCanvasH) {
          lastCanvasW = s[0]; lastCanvasH = s[1];
          redraw();
        }
      } catch (e) { redraw(); }
    };
    root.onResize = function () {
      try {
        var s = canvas.size;
        if (s[0] !== lastCanvasW || s[1] !== lastCanvasH) {
          lastCanvasW = s[0]; lastCanvasH = s[1];
          redraw(true);
        }
      } catch (e) { redraw(true); }
    };
    try { root.layout.layout(true); } catch (e11) {}
    if (!ok || !S.onboarded) {
      openOnboarding(true);
      redraw(true);
    } else {
      redraw(true);
    }
    if (!IS_PANEL) {
      try { root.show(); } catch (e12) {}
      redraw(true);
    }
  }

  try { init(); }
  catch (e) {
    var msg = e && e.message ? e.message : String(e);
    try { alert("suko: " + msg); } catch (e2) {}
    try {
      var logDir = "";
      try { logDir = S && S.configDir ? S.configDir : (docsPath() + "/suko"); } catch (eLog) {}
      var f = new File(normPath(logDir) + "/suko-error.log");
      f.open("a"); f.write(msg + "\n"); f.close();
    } catch (e3) {}
  }
})(this);
