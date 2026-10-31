/**
 * My Acronym —— 静态自检（纯 Node）
 * 运行：node tests/lint.js
 *
 * 检查项：
 *   1. 所有 .js 文件语法可解析
 *   2. 所有 .json 文件可解析，且 app.json 里声明的页面目录真实存在
 *   3. WXML 里绑定的事件处理函数在对应页面 JS 中确实存在
 *   4. WXML 模板里引用的数据字段在页面 data 中确实存在
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0;
let fail = 0;
const problems = [];

function ok(cond, label) {
  if (cond) { pass++; }
  else { fail++; problems.push(label); }
}

function walk(dir, out) {
  out = out || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name === 'node_modules' || d.name === '.git') return;
      walk(full, out);
    } else {
      out.push(full);
    }
  });
  return out;
}

const files = walk(ROOT);

/* ---------- 1. JS 语法 ---------- */
files.filter((f) => f.endsWith('.js')).forEach((f) => {
  const code = fs.readFileSync(f, 'utf8');
  try {
    new vm.Script(code, { filename: f });
    ok(true, '');
  } catch (e) {
    ok(false, 'JS 语法错误 ' + path.relative(ROOT, f) + ' → ' + e.message);
  }
});

/* ---------- 2. JSON ---------- */
const jsonFiles = files.filter((f) => f.endsWith('.json'));
jsonFiles.forEach((f) => {
  try {
    JSON.parse(fs.readFileSync(f, 'utf8'));
    ok(true, '');
  } catch (e) {
    ok(false, 'JSON 解析失败 ' + path.relative(ROOT, f) + ' → ' + e.message);
  }
});

const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
appJson.pages.forEach((p) => {
  ['js', 'json', 'wxml', 'wxss'].forEach((ext) => {
    const f = path.join(ROOT, p + '.' + ext);
    ok(fs.existsSync(f), '页面文件缺失 ' + p + '.' + ext);
  });
});
(appJson.tabBar && appJson.tabBar.list || []).forEach((t) => {
  ok(appJson.pages.indexOf(t.pagePath) >= 0, 'tabBar 页面未在 pages 中声明 ' + t.pagePath);
});

/* ---------- 3 & 4. WXML 与页面 JS 对账 ---------- */
// 直接读 app.json，新增页面不用改这里
const PAGES = appJson.pages;

PAGES.forEach((p) => {
  const jsPath = path.join(ROOT, p + '.js');
  const wxmlPath = path.join(ROOT, p + '.wxml');

  // 用真实的 CommonJS 加载 + 全局桩，捕获 Page() 注册的配置
  let captured = null;
  const wxMock = {
    getStorageSync: () => '',
    setStorageSync: () => {},
    showToast: () => {},
    showModal: () => {},
    navigateTo: () => {},
    navigateBack: () => {},
    setNavigationBarTitle: () => {}
  };
  const saved = {
    wx: global.wx,
    Page: global.Page,
    App: global.App,
    getApp: global.getApp
  };
  global.wx = wxMock;
  global.Page = (opts) => { captured = opts; };
  global.App = () => {};
  global.getApp = () => ({ globalData: {} });

  try {
    require(jsPath);
  } catch (e) {
    ok(false, '加载页面失败 ' + p + '.js → ' + e.message);
  } finally {
    global.wx = saved.wx;
    global.Page = saved.Page;
    global.App = saved.App;
    global.getApp = saved.getApp;
  }

  ok(captured !== null, '页面未导出 Page 配置 ' + p);
  if (!captured) return;

  const dataKeys = new Set(Object.keys(captured.data || {}));
  const methodNames = new Set(Object.keys(captured).filter((k) => typeof captured[k] === 'function'));

  const wxml = fs.readFileSync(wxmlPath, 'utf8');

  // —— 事件处理函数是否都存在
  const handlerRe = /(?:bind|catch|capture-bind|capture-catch)[:a-z-]*\s*=\s*"([^"]+)"/g;
  let m;
  const handlers = new Set();
  while ((m = handlerRe.exec(wxml)) !== null) {
    handlers.add(m[1]);
  }
  handlers.forEach((h) => {
    ok(methodNames.has(h), 'WXML 事件 ' + h + ' 在 ' + p + '.js 中未定义');
  });

  // —— 模板里引用的数据字段是否存在
  // 收集 wx:for 的循环变量
  const loopVars = new Set(['item', 'index', 'value', 'idx']);
  const forRe = /wx:for\s*=\s*"\{[^{}]*\}\s*(?:wx:for-item\s*=\s*"([^"]+)")?/g;
  while ((m = forRe.exec(wxml)) !== null) {
    if (m[1]) loopVars.add(m[1]);
  }

  const exprRe = /\{\{([\s\S]*?)\}\}/g;
  const used = new Set();
  while ((m = exprRe.exec(wxml)) !== null) {
    const expr = m[1]
      .replace(/'[^']*'/g, "''")
      .replace(/"[^"]*"/g, '""')
      // 去掉成员访问（item.abbr → item），只保留根标识符
      .replace(/\.[A-Za-z_$][A-Za-z0-9_$]*/g, '');
    const idRe = /[A-Za-z_$][A-Za-z0-9_$]*/g;
    let idm;
    while ((idm = idRe.exec(expr)) !== null) {
      used.add(idm[0]);
    }
  }
  const KEYWORDS = ['true', 'false', 'null', 'undefined'];
  used.forEach((key) => {
    if (KEYWORDS.indexOf(key) >= 0) return;
    if (loopVars.has(key)) return;
    ok(
      dataKeys.has(key),
      'WXML 引用了未定义的数据字段 "' + key + '"（' + p + '.wxml）'
    );
  });
});

/* ---------- 输出 ---------- */
console.log('静态自检：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) {
  console.log('\n问题清单：');
  problems.forEach((p) => console.log('  ✗ ' + p));
  process.exit(1);
}
console.log('✓ JS 语法 / JSON 格式 / 页面文件 / 事件绑定 / 数据字段 全部通过');
