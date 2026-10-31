/* ==========================================================================
 * My Acronym —— 预览运行时
 *
 * 由 tools/build-preview.mjs 内联进 preview.html。
 * 做的事：把真实的 WXML 编译成真实 DOM，并挂上真实页面 JS 的事件处理，
 *          wx API 用浏览器能力模拟（存储落到 localStorage，键名与小程序一致）。
 *
 * 这样预览出来的行为 = 真机行为：搜索、收藏、增删改全部走 utils/storage.js。
 * ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 1. 模块系统（CommonJS 迷你实现，支持相对路径）
   * ------------------------------------------------------------------ */
  var SRC = window.__PREVIEW_MODULES__ || {};
  var cache = {};
  var loadingPath = null;
  var pageConfigs = {};
  var appConfig = null;

  function resolvePath(from, req) {
    if (req.charAt(0) !== '.') return req;
    var base = from ? from.split('/').slice(0, -1) : [];
    var parts = req.split('/');
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === '' || p === '.') continue;
      if (p === '..') base.pop();
      else base.push(p);
    }
    return base.join('/');
  }

  function req(from, request) {
    var p = resolvePath(from, request);
    if (cache[p]) return cache[p].exports;
    var mod = { exports: {} };
    cache[p] = mod;
    var prev = loadingPath;
    loadingPath = p;
    try {
      var fn = new Function(
        'require', 'module', 'exports', 'wx', 'Page', 'App', 'getApp', 'console',
        SRC[p]
      );
      fn(
        function (r) { return req(p, r); },
        mod, mod.exports,
        wx, Page, App, getApp, console
      );
    } catch (e) {
      console.error('[预览] 加载模块失败 ' + p, e);
    }
    loadingPath = prev;
    return mod.exports;
  }

  function Page(opts) { pageConfigs[loadingPath] = opts; }
  function App(opts) { appConfig = opts; }
  function getApp() { return appConfig || { globalData: {} }; }

  /* ------------------------------------------------------------------ *
   * 2. wx API 模拟
   * ------------------------------------------------------------------ */
  var toastTimer = null;
  var modalResolve = null;

  var wx = {
    getStorageSync: function (key) {
      try {
        var v = localStorage.getItem(key);
        return v === null ? '' : JSON.parse(v);
      } catch (e) { return ''; }
    },
    setStorageSync: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); }
      catch (e) { console.warn('[预览] 写入存储失败', key, e); }
    },
    removeStorageSync: function (key) { localStorage.removeItem(key); },
    clearStorageSync: function () { localStorage.clear(); },
    getStorageInfoSync: function () {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      return { keys: keys };
    },

    showToast: function (opts) {
      opts = opts || {};
      var el = document.getElementById('toast');
      el.innerHTML = '';
      if (opts.icon === 'success') {
        el.appendChild(makeEl('div', 'wx-toast-icon', '✓'));
      }
      el.appendChild(makeEl('div', 'wx-toast-text', opts.title || ''));
      el.className = 'wx-toast show';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { el.className = 'wx-toast'; }, opts.duration || 1500);
    },
    hideToast: function () {
      var el = document.getElementById('toast');
      el.className = 'wx-toast';
    },

    showModal: function (opts) {
      opts = opts || {};
      var mask = document.getElementById('modal-mask');
      var box = document.getElementById('modal-box');
      box.innerHTML = '';
      if (opts.title) box.appendChild(makeEl('div', 'wx-modal-title', opts.title));
      if (opts.content) box.appendChild(makeEl('div', 'wx-modal-content', opts.content));
      var btns = makeEl('div', 'wx-modal-btns');
      var cancel = makeEl('button', 'wx-modal-btn wx-modal-cancel', opts.cancelText || '取消');
      var confirm = makeEl('button', 'wx-modal-btn wx-modal-confirm', opts.confirmText || '确定');
      if (opts.confirmColor) confirm.style.color = opts.confirmColor;
      btns.appendChild(cancel); btns.appendChild(confirm);
      box.appendChild(btns);
      mask.className = 'wx-modal-mask show';

      function close(res) {
        mask.className = 'wx-modal-mask';
        if (opts.success) opts.success(res);
      }
      cancel.addEventListener('click', function () { close({ confirm: false, cancel: true }); });
      confirm.addEventListener('click', function () { close({ confirm: true, cancel: false }); });
      modalResolve = close;
    },

    navigateTo: function (opts) { router.push(opts.url); },
    navigateBack: function () { router.back(); },
    switchTab: function (opts) { router.switchTab(opts.url); },
    setNavigationBarTitle: function (opts) { chrome.setTitle(opts.title); },
    showLoading: function () {}, hideLoading: function () {},
    stopPullDownRefresh: function () {},
    createSelectorQuery: function () {
      return { select: function () { return { boundingClientRect: function () { return { exec: function () {} }; } }; } };
    }
  };

  function makeEl(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /* ------------------------------------------------------------------ *
   * 3. WXML 解析
   * ------------------------------------------------------------------ */
  var VOID_TAGS = { input: 1, image: 1, icon: 1, progress: 1, slider: 1, switch: 1, picker: 1 };

  function parseWXML(src) {
    var root = { tag: '#root', attrs: [], children: [] };
    var stack = [root];
    var i = 0;

    while (i < src.length) {
      if (src.charAt(i) === '<') {
        if (src.substr(i, 4) === '<!--') {
          var end = src.indexOf('-->', i);
          i = end === -1 ? src.length : end + 3;
          continue;
        }
        // 闭合标签 </tag>
        if (src.charAt(i + 1) === '/') {
          var gt = src.indexOf('>', i);
          if (gt === -1) { i = src.length; break; }
          var closeTag = src.slice(i + 2, gt).trim();
          for (var s = stack.length - 1; s > 0; s--) {
            if (stack[s].tag === closeTag) { stack.length = s; break; }
          }
          i = gt + 1;
          continue;
        }
        var rest = src.slice(i);
        var m = /^<([a-zA-Z][\w-]*)((?:\s+[\w:.@\-]+(?:\s*=\s*"[^"]*")?)*)\s*(\/?)>/.exec(rest);
        if (!m) { i++; continue; }
        var node = {
          tag: m[1],
          attrs: parseAttrs(m[2] || ''),
          children: []
        };
        stack[stack.length - 1].children.push(node);
        var selfClose = m[3] === '/' || VOID_TAGS[node.tag];
        if (!selfClose) stack.push(node);
        i += m[0].length;
        continue;
      }
      var next = src.indexOf('<', i);
      var text = src.slice(i, next === -1 ? src.length : next);
      if (text.length) {
        stack[stack.length - 1].children.push({ tag: '#text', attrs: [], children: [], text: text });
      }
      i = next === -1 ? src.length : next;
    }
    return root.children;
  }

  function parseAttrs(raw) {
    var attrs = [];
    var re = /([\w:.@\-]+)(?:\s*=\s*"([^"]*)")?/g;
    var m;
    while ((m = re.exec(raw)) !== null) {
      attrs.push({ name: m[1], value: m[2] === undefined ? '' : m[2] });
    }
    return attrs;
  }

  function attrMap(node) {
    var map = {};
    for (var i = 0; i < node.attrs.length; i++) {
      map[node.attrs[i].name] = node.attrs[i].value;
    }
    return map;
  }

  /* ------------------------------------------------------------------ *
   * 4. 表达式求值（WXML 的 {{}} 子集）
   * ------------------------------------------------------------------ */
  var exprCache = {};
  var GLOBALS = {
    undefined: 1, NaN: 1, Infinity: 1, Math: 1, JSON: 1, String: 1, Number: 1,
    Boolean: 1, Array: 1, Object: 1, Date: 1, RegExp: 1, parseInt: 1,
    parseFloat: 1, isNaN: 1, encodeURIComponent: 1, decodeURIComponent: 1,
    true: 1, false: 1, null: 1
  };

  function evalExpr(code, scope) {
    var fn = exprCache[code];
    if (!fn) {
      try {
        fn = new Function('$s', 'with($s){ return (' + code + '); }');
      } catch (e) {
        fn = function () { return ''; };
      }
      exprCache[code] = fn;
    }
    try {
      var v = fn(scope);
      return v === undefined ? '' : v;
    } catch (e) {
      return '';
    }
  }

  function makeScope(parent, extra) {
    var s = Object.create(parent || null);
    if (extra) {
      for (var k in extra) s[k] = extra[k];
    }
    return s;
  }

  function scopeProxy(root) {
    return new Proxy(root, {
      has: function (t, k) {
        if (typeof k === 'string' && GLOBALS[k]) return false;
        return true;
      },
      get: function (t, k) {
        if (k === Symbol.unscopables) return undefined;
        if (typeof k === 'string' && GLOBALS[k] && !(k in t)) return undefined;
        return k in t ? t[k] : '';
      },
      set: function (t, k, v) { t[k] = v; return true; }
    });
  }

  function interpolate(str, scope) {
    if (str === undefined || str === null) return '';
    return String(str).replace(/\{\{([\s\S]*?)\}\}/g, function (_, expr) {
      var v = evalExpr(expr.trim(), scope);
      if (v === null || v === undefined || v === false) return '';
      return String(v);
    });
  }

  /**
   * WXML 条件真值判断，按 JS 语义：
   * 布尔直接取值；数字 0 为假；字符串非空即真（'false' 特判为假）。
   * 注意：wx:if="{{keyword}}" 传的是普通字符串，不能只认 'true'。
   */
  function truthy(v) {
    if (typeof v === 'boolean') return v;
    if (v === undefined || v === null) return false;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v.length > 0 && v !== 'false';
    if (Array.isArray(v)) return v.length > 0;
    return !!v;
  }

  /** 属性值可能是 '{{expr}}'，取值前先剥掉大括号 */
  function attrExpr(raw) {
    var s = String(raw === undefined || raw === null ? '' : raw).trim();
    if (s.charAt(0) === '{' && s.charAt(1) === '{') {
      var end = s.lastIndexOf('}}');
      if (end > 1) s = s.slice(2, end);
    }
    return s.trim();
  }

  /* ------------------------------------------------------------------ *
   * 5. 渲染
   * ------------------------------------------------------------------ */
  var TAG_MAP = {
    view: 'div', text: 'span', 'scroll-view': 'div', navigator: 'div',
    input: 'input', textarea: 'textarea', image: 'img', button: 'button',
    label: 'label', form: 'form', picker: 'div', switch: 'div', slider: 'div'
  };

  var EVENTS = {
    bindtap: 'click', catchtap: 'click', bindlongpress: 'contextmenu',
    bindinput: 'input', bindchange: 'change', bindconfirm: 'confirm',
    bindfocus: 'focus', bindblur: 'blur', bindtouchstart: 'touchstart',
    bindtouchend: 'touchend', bindtouchmove: 'touchmove'
  };

  function renderChildren(nodes, scope, page, parentEl) {
    var chainTaken = false;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];

      if (node.tag === '#text') {
        var t = document.createTextNode(interpolate(node.text, scope));
        parentEl.appendChild(t);
        continue;
      }

      var a = attrMap(node);

      // —— 条件渲染
      if (a['wx:if'] !== undefined) {
        chainTaken = truthy(evalExpr(attrExpr(a['wx:if']), scope));
        if (!chainTaken) continue;
      } else if (a['wx:elif'] !== undefined) {
        if (chainTaken) continue;
        chainTaken = truthy(evalExpr(attrExpr(a['wx:elif']), scope));
        if (!chainTaken) continue;
      } else if (a['wx:else'] !== undefined) {
        if (chainTaken) continue;
        chainTaken = true;
      } else {
        chainTaken = false;
      }

      // —— block 不产生元素
      if (node.tag === 'block') {
        renderChildren(node.children, scope, page, parentEl);
        continue;
      }

      // —— 列表渲染
      if (a['wx:for'] !== undefined) {
        var list = evalExpr(attrExpr(a['wx:for']), scope);
        if (!list || typeof list.length !== 'number') list = [];
        var itemName = a['wx:for-item'] || 'item';
        var idxName = a['wx:for-index'] || 'index';
        for (var k = 0; k < list.length; k++) {
          var itemScope = makeScope(scope, {});
          itemScope[itemName] = list[k];
          itemScope[idxName] = k;
          var clone = { tag: node.tag, attrs: [], children: node.children };
          for (var ai = 0; ai < node.attrs.length; ai++) {
            if (node.attrs[ai].name.indexOf('wx:for') !== 0) clone.attrs.push(node.attrs[ai]);
          }
          parentEl.appendChild(createEl(clone, itemScope, page));
        }
        continue;
      }

      parentEl.appendChild(createEl(node, scope, page));
    }
  }

  function createEl(node, scope, page) {
    var a = attrMap(node);
    var tag = TAG_MAP[node.tag] || 'div';
    var el = document.createElement(tag);

    if (a.class !== undefined) el.className = interpolate(a.class, scope);
    if (a.style !== undefined) el.setAttribute('style', toPx(interpolate(a.style, scope)));

    for (var k in a) {
      if (k.indexOf('data-') === 0) {
        var name = k.slice(5).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
        el.dataset[name] = interpolate(a[k], scope);
      }
    }

    if (a['placeholder-class'] !== undefined) {
      var pc = interpolate(a['placeholder-class'], scope).split(/\s+/);
      for (var pi = 0; pi < pc.length; pi++) if (pc[pi]) el.classList.add(pc[pi]);
    }

    bindEvents(el, a, page);

    if (a['hover-class']) {
      var hc = interpolate(a['hover-class'], scope);
      el.addEventListener('pointerdown', function () { el.classList.add(hc); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (evt) {
        el.addEventListener(evt, function () { el.classList.remove(hc); });
      });
    }

    if (tag === 'input' || tag === 'textarea') {
      var v = interpolate(a.value, scope);
      if (v !== '') el.value = v;
      if (a.placeholder !== undefined) el.placeholder = interpolate(a.placeholder, scope);
      if (a.maxlength !== undefined) el.maxLength = parseInt(a.maxlength, 10) || 140;
      if (a.disabled !== undefined) el.disabled = truthy(interpolate(a.disabled, scope));
      if (tag === 'textarea') {
        el.style.resize = 'none';
        el.style.width = '100%';
        el.style.height = 'auto';
        el.style.overflow = 'hidden';
      }
    }

    if (node.tag === 'scroll-view') {
      el.style.overflowY = 'auto';
      el.style.overflowX = 'hidden';
      el.style.webkitOverflowScrolling = 'touch';
    }

    renderChildren(node.children, scope, page, el);
    return el;
  }

  function bindEvents(el, a, page) {
    for (var name in EVENTS) {
      if (a[name] === undefined) continue;
      (function (attrName, domEvent, catchAll) {
        var fnName = a[attrName];
        el.addEventListener(domEvent, function (e) {
          if (catchAll) e.stopPropagation();
          var handler = page[fnName];
          if (typeof handler !== 'function') {
            console.warn('[预览] 未找到事件处理函数 ' + fnName);
            return;
          }
          handler.call(page, makeEvent(e, el, domEvent));
        });
      })(name, EVENTS[name], name.indexOf('catch') === 0);
    }
  }

  function makeEvent(e, el, type) {
    var detail = {};
    if (type === 'input' || type === 'change') detail.value = el.value;
    return {
      type: type,
      detail: detail,
      currentTarget: { dataset: copyDataset(el.dataset), id: el.id },
      target: { dataset: copyDataset(el.dataset), id: el.id },
      timeStamp: Date.now(),
      stopPropagation: function () {},
      preventDefault: function () {}
    };
  }

  function copyDataset(ds) {
    var out = {};
    for (var k in ds) out[k] = ds[k];
    return out;
  }

  function toPx(css) {
    return css.replace(/(\d*\.?\d+)rpx/g, function (_, n) {
      var v = parseFloat(n) * 0.5;
      return (Math.round(v * 100) / 100) + 'px';
    });
  }

  /* ------------------------------------------------------------------ *
   * 6. 路由与页面实例
   * ------------------------------------------------------------------ */
  var PAGES = window.__PREVIEW_PAGES__ || {};
  var routeStack = [];
  var tabInstances = {};
  var current = null;

  function parseUrl(url) {
    var qi = url.indexOf('?');
    var path = qi === -1 ? url : url.slice(0, qi);
    var query = {};
    if (qi !== -1) {
      var parts = url.slice(qi + 1).split('&');
      for (var i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        var kv = parts[i].split('=');
        query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      }
    }
    return { path: path.replace(/^\//, ''), query: query };
  }

  function makeInstance(route) {
    var p = route.path + '.js';
    if (!SRC[p]) { console.error('[预览] 缺少页面模块 ' + p); return null; }
    req('', './' + p);
    var cfg = pageConfigs[p];
    if (!cfg) { console.error('[预览] 页面未调用 Page()：' + p); return null; }

    var inst = {};
    for (var k in cfg) inst[k] = cfg[k];
    inst.data = JSON.parse(JSON.stringify(cfg.data || {}));
    inst.setData = function (obj, cb) {
      for (var key in obj) inst.data[key] = obj[key];
      scheduleRender();
      if (cb) cb();
    };
    inst.__route = route;
    // 调试用：暴露当前页面实例，方便在控制台/自检脚本里查看 data
    window.__previewPage = inst;
    return inst;
  }

  var renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    // 用 setTimeout 而不是 rAF：渲染不依赖浏览器出帧，headless / 后台标签页同样稳定
    setTimeout(function () {
      renderQueued = false;
      render();
    }, 0);
  }

  /* 自检用：同步强制刷新一次渲染，绕过 setTimeout 调度。
     有了它，端到端自检可以完全同步跑完，不依赖任何定时器轮询
     （Edge headless 的虚拟时间模式下，定时器轮询会挂死）。 */
  window.__previewFlush = function () {
    renderQueued = false;
    render();
  };

  function focusSnapshot(root) {
    var el = document.activeElement;
    if (!el || el === document.body || !root.contains(el)) return null;
    var path = [];
    var cur = el;
    while (cur && cur !== root) {
      var parent = cur.parentNode;
      if (!parent) return null;
      path.unshift(Array.prototype.indexOf.call(parent.children, cur));
      cur = parent;
    }
    return {
      path: path,
      start: el.selectionStart,
      end: el.selectionEnd
    };
  }

  function restoreFocus(root, snap) {
    if (!snap) return;
    var el = nodeAtPath(root, snap.path);
    if (!el) return;
    if (typeof el.focus === 'function') el.focus();
    try {
      if (snap.start !== null && snap.start !== undefined && el.setSelectionRange) {
        el.setSelectionRange(snap.start, snap.end);
      }
    } catch (e) { /* 非文本控件忽略 */ }
  }

  function nodeAtPath(root, path) {
    var cur = root;
    for (var i = 0; i < path.length; i++) {
      if (!cur.children || !cur.children[path[i]]) return null;
      cur = cur.children[path[i]];
    }
    return cur;
  }

  function render() {
    if (!current) return;
    var host = document.getElementById('screen');
    var snap = focusSnapshot(host);

    var page = current.instance;
    var wxml = SRC[current.route.path + '.wxml'];
    var ast = window.__PREVIEW_AST__[current.route.path];
    if (!ast) return;

    var scope = scopeProxy(makeScope(null, page.data));

    host.innerHTML = '';
    var tree = document.createElement('div');
    tree.className = 'page-root';
    tree.setAttribute('data-page', current.route.path);
    renderChildren(ast, scope, page, tree);
    host.appendChild(tree);

    restoreFocus(host, snap);
    updateDebug();
  }

  function enterRoute(route, isTab) {
    var inst;
    if (isTab && tabInstances[route.path]) {
      inst = tabInstances[route.path];
      inst.data = inst.data; // 保留状态
    } else {
      inst = makeInstance(route);
      if (!inst) return;
      if (isTab) tabInstances[route.path] = inst;
    }

    current = { route: route, instance: inst };

    var cfg = PAGES[route.path] || {};
    chrome.setTitle(cfg.title || 'My Acronym');
    chrome.setTabActive(cfg.tab || null);

    if (typeof inst.onLoad === 'function') {
      try { inst.onLoad(route.query); } catch (e) { console.error('[预览] onLoad 出错', e); }
    }
    if (typeof inst.onShow === 'function') {
      try { inst.onShow(); } catch (e) { console.error('[预览] onShow 出错', e); }
    }
    render();
  }

  var router = {
    push: function (url) {
      var r = parseUrl(url);
      routeStack.push(r);
      enterRoute(r, false);
    },
    back: function () {
      if (routeStack.length > 1) {
        routeStack.pop();
        var r = routeStack[routeStack.length - 1];
        current = null;
        enterRoute(r, true);
      } else {
        router.switchTab('/pages/index/index');
      }
    },
    switchTab: function (url) {
      var r = parseUrl(url);
      routeStack = [r];
      current = null;
      enterRoute(r, true);
    }
  };

  // 全局 getCurrentPages：utils/nav.js 的安全返回逻辑依赖它
  window.getCurrentPages = function () { return routeStack.slice(); };

  /* ------------------------------------------------------------------ *
   * 7. 外壳：导航栏 / tabBar / 调试面板
   * ------------------------------------------------------------------ */
  var chrome = {
    setTitle: function (title) {
      document.getElementById('nav-title').textContent = title || '';
    },
    setTabActive: function (tab) {
      var items = document.querySelectorAll('.tab-item');
      for (var i = 0; i < items.length; i++) {
        var on = items[i].getAttribute('data-tab') === tab;
        items[i].classList.toggle('on', on);
      }
      document.getElementById('tabbar').style.display = tab ? 'flex' : 'none';
    }
  };

  function updateDebug() {
    var box = document.getElementById('debug-body');
    if (!box) return;
    var keys = ['ma_builtin_v1', 'ma_user_v1', 'ma_fav_v1', 'ma_meta_v1', 'ma_profile_v1'];
    var html = '';
    for (var i = 0; i < keys.length; i++) {
      var raw = localStorage.getItem(keys[i]);
      var val = null;
      try { val = raw === null ? null : JSON.parse(raw); } catch (e) { val = raw; }
      var count = '';
      if (Array.isArray(val)) count = ' · ' + val.length + ' 项';
      html += '<div class="dbg-row"><span class="dbg-key">' + keys[i] + '</span>' +
        '<span class="dbg-val">' + (val === null ? '<em>未创建</em>' : count) + '</span></div>';
    }
    box.innerHTML = html;
  }

  /* ------------------------------------------------------------------ *
   * 8. 启动
   * ------------------------------------------------------------------ */
  function boot() {
    // 编译所有页面的 WXML
    window.__PREVIEW_AST__ = window.__PREVIEW_AST__ || {};
    for (var path in SRC) {
      if (path.slice(-5) === '.wxml') {
        window.__PREVIEW_AST__[path.slice(0, -5)] = parseWXML(SRC[path]);
      }
    }

    // App.onLaunch
    if (SRC['app.js']) {
      req('', './app.js');
      if (appConfig && typeof appConfig.onLaunch === 'function') {
        try { appConfig.onLaunch(); } catch (e) { console.error(e); }
      }
    }

    // tabBar
    var tabbar = document.getElementById('tabbar');
    tabbar.innerHTML = '';
    var tabs = [
      { tab: 'index', label: '首页', url: '/pages/index/index' },
      { tab: 'favorite', label: '收藏', url: '/pages/favorite/favorite' }
    ];
    tabs.forEach(function (t) {
      var el = makeEl('div', 'tab-item', t.label);
      el.setAttribute('data-tab', t.tab);
      el.addEventListener('click', function () { router.switchTab(t.url); });
      tabbar.appendChild(el);
    });

    router.switchTab('/pages/index/index');

    // 支持 #/pages/detail/detail?id=xxx 直接定位到某个页面
    var hash = (location.hash || '').replace(/^#/, '');
    if (hash && hash.charAt(0) === '/') {
      var r = parseUrl(hash);
      var meta = PAGES[r.path] || {};
      if (meta.tab) {
        router.switchTab(hash);
      } else {
        routeStack = [parseUrl('/pages/index/index'), r];
        current = null;
        enterRoute(r, false);
      }
    }

    // 调试面板
    var reset = document.getElementById('btn-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        localStorage.clear();
        location.reload();
      });
    }
    var reload = document.getElementById('btn-reload');
    if (reload) {
      reload.addEventListener('click', function () { location.reload(); });
    }
  }

  /* 调试/自检用：暴露路由与重载能力，便于同步驱动页面跳转 */
  window.__previewRouter = router;
  window.__previewReload = function () {
    localStorage.clear();
    location.reload();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
