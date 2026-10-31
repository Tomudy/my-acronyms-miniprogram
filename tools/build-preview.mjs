/**
 * My Acronym —— 预览页构建脚本
 *
 * 运行：node tools/build-preview.mjs
 *
 * 把真实源码打包成一个自包含的 preview.html：
 *   - app.wxss + 各页面 wxss（rpx → px，页面样式按页隔离）
 *   - 真实 WXML（运行时编译成 DOM，不是手抄的静态图）
 *   - 真实页面 JS + utils/storage.js（事件、搜索、收藏、增删改全部真跑）
 *   - wx API 用浏览器能力模拟，存储落到 localStorage（键名与小程序一致）
 *
 * 改了 wxml / wxss / js 之后重跑一次即可同步。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'preview.html');

/* ------------------------------------------------------------------ *
 * 读取源码
 * ------------------------------------------------------------------ */
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const PAGES = [
  { path: 'pages/index/index', title: 'My Acronym', tab: 'index' },
  { path: 'pages/search/search', title: '搜索', tab: null },
  { path: 'pages/detail/detail', title: '词条详情', tab: null },
  { path: 'pages/favorite/favorite', title: '我的收藏', tab: 'favorite' }
];

const modules = { 'app.js': read('app.js') };
/* 自动收录 data/ 与 utils/ 下的所有 js，避免新增工具模块后忘记登记
   （曾因此拿不到 utils/nav.js，页面报 nav.back is not a function） */
for (const dir of ['data', 'utils']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    if (f.slice(-3) === '.js') modules[dir + '/' + f] = read(dir + '/' + f);
  }
}
for (const p of PAGES) {
  modules[p.path + '.js'] = read(p.path + '.js');
  modules[p.path + '.wxml'] = read(p.path + '.wxml');
}

/* ------------------------------------------------------------------ *
 * WXSS → 预览 CSS
 * ------------------------------------------------------------------ */
const RPX = 0.5; // 750rpx = 375px（iPhone 逻辑宽度）

function rpx2px(css) {
  return css.replace(/(\d*\.?\d+)rpx/g, (_, n) => {
    const v = Math.round(parseFloat(n) * RPX * 100) / 100;
    return v + 'px';
  });
}

function vh2percent(css) {
  return css.replace(/\b100vh\b/g, '100%');
}

/** page 选择器 → .page-root（预览里页根容器） */
function pageSelector(css) {
  return css.replace(/^[ \t]*page[ \t]*\{/gm, '.page-root {');
}

/** position:fixed → absolute：预览里定位基准是 #screen（等同小程序页面视口） */
function fixedToAbsolute(css) {
  return css.replace(/position:\s*fixed/g, 'position: absolute');
}

/** 选��里的 placeholder-class 转成 ::placeholder */
function placeholderRule(css) {
  return css.replace(/([^{}]+)\{/g, (m, sel) => {
    const s = sel.trim();
    if (!s) return m;
    if (/^\.[\w-]*ph$/.test(s)) return s + '::placeholder {';
    return s + ' {';
  });
}

/** 页面样式按页隔离，避免 index / favorite 的同名类互相覆盖 */
function scopeCss(css, pagePath) {
  const attr = '[data-page="' + pagePath + '"]';
  return css.replace(/([^{}]+)\{/g, (m, sel) => {
    const s = sel.trim();
    if (!s) return m;
    const parts = s.split(',').map((p) => {
      const t = p.trim();
      if (t === '.page-root') return '.page-root' + attr;
      return attr + ' ' + t;
    });
    return parts.join(', ') + ' {';
  });
}

function convert(css, pagePath) {
  let out = rpx2px(css);
  out = vh2percent(out);
  out = pageSelector(out);
  out = fixedToAbsolute(out);
  out = placeholderRule(out);
  if (pagePath) out = scopeCss(out, pagePath);
  return out;
}

/* ------------------------------------------------------------------ *
 * 外壳样式
 * ------------------------------------------------------------------ */
const SHELL_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: #eef0f3;
  color: #1f2329;
  font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  padding: 28px 20px 40px;
}
.wrap { display: flex; gap: 34px; justify-content: center; align-items: flex-start; flex-wrap: wrap; }
.phone-col { flex: none; }
.phone {
  width: 375px; height: 780px;
  background: #fff;
  border: 1px solid #d8dce2;
  border-radius: 26px;
  overflow: hidden;
  display: flex; flex-direction: column;
  position: relative;
  box-shadow: 0 12px 40px rgba(31,35,41,.12);
}
.nav {
  flex: none; height: 44px; background: #fff; border-bottom: 1px solid #edeff2;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 600; color: #1f2329;
}
#screen { flex: 1; overflow-y: auto; overflow-x: hidden; position: relative; background: #f4f5f7; }
.page-root { height: 100%; }
/* 浏览器默认样式复位，对齐小程序原生控件 */
input, textarea {
  border: none; outline: none; background: transparent; padding: 0;
  font-family: inherit; color: inherit;
}
input:focus, textarea:focus { outline: none; }
textarea { display: block; }
.list-wrap { scrollbar-width: none; -ms-overflow-style: none; }
/* 小程序原生页面不显示滚动条，预览里所有滚动容器一并隐藏 */
#screen, .page-root, .list-wrap { scrollbar-width: none; -ms-overflow-style: none; }
#screen::-webkit-scrollbar, .page-root::-webkit-scrollbar,
.list-wrap::-webkit-scrollbar, #screen *::-webkit-scrollbar { width: 0; height: 0; display: none; }
.tabbar {
  flex: none; height: 50px; background: #fff; border-top: 1px solid #edeff2;
  display: none; align-items: center;
}
.tab-item {
  flex: 1; text-align: center; font-size: 12px; color: #8b93a3;
  cursor: pointer; user-select: none; line-height: 50px;
}
.tab-item.on { color: #3b6cf0; }
.phone-cap { text-align: center; font-size: 12px; color: #8b93a3; margin-top: 12px; }

/* toast */
.wx-toast {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%) scale(.9);
  background: rgba(0,0,0,.76); color: #fff; border-radius: 10px;
  padding: 18px 20px; font-size: 14px; text-align: center;
  opacity: 0; pointer-events: none; transition: opacity .18s, transform .18s;
  max-width: 70%; z-index: 40;
}
.wx-toast.show { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.wx-toast-icon {
  width: 34px; height: 34px; border-radius: 50%; background: #fff;
  color: #07c160; font-size: 22px; line-height: 34px; margin: 0 auto 8px;
}
.wx-toast-text { word-break: break-all; }

/* modal */
.wx-modal-mask {
  position: absolute; inset: 0; background: rgba(0,0,0,.5);
  display: none; align-items: center; justify-content: center; z-index: 50;
}
.wx-modal-mask.show { display: flex; }
.wx-modal {
  width: 280px; background: #fff; border-radius: 12px; overflow: hidden;
  text-align: center; padding-top: 24px;
}
.wx-modal-title { font-size: 16px; font-weight: 600; padding: 0 20px 10px; }
.wx-modal-content { font-size: 14px; color: #646a73; padding: 0 20px 20px; line-height: 1.55; }
.wx-modal-btns { display: flex; border-top: 1px solid #edeff2; }
.wx-modal-btn {
  flex: 1; background: none; border: none; padding: 13px 0; font-size: 16px;
  cursor: pointer; font-family: inherit;
}
.wx-modal-cancel { color: #646a73; border-right: 1px solid #edeff2; }
.wx-modal-confirm { color: #3b6cf0; font-weight: 600; }

/* 侧栏 */
.side { width: 330px; max-width: 100%; }
.side h1 { font-size: 19px; margin: 0 0 6px; font-weight: 600; }
.side .lead { font-size: 13px; color: #646a73; margin: 0 0 16px; line-height: 1.65; }
.side h2 { font-size: 14px; margin: 22px 0 8px; font-weight: 600; }
.side ul { margin: 0; padding-left: 18px; font-size: 13px; color: #4a505a; line-height: 1.9; }
.side code {
  background: #e6e9ed; border-radius: 4px; padding: 1px 5px;
  font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px;
}
.panel {
  background: #fff; border: 1px solid #e3e6ea; border-radius: 12px; padding: 14px 16px;
  margin-top: 10px;
}
.dbg-row {
  display: flex; justify-content: space-between; font-size: 12px;
  padding: 6px 0; border-bottom: 1px dashed #eef0f3;
}
.dbg-row:last-child { border-bottom: none; }
.dbg-key { font-family: ui-monospace, Menlo, Consolas, monospace; color: #4a505a; }
.dbg-val { color: #8b93a3; font-size: 11.5px; }
.dbg-val em { color: #b4bac4; font-style: normal; }
.side button {
  font-family: inherit; font-size: 13px; padding: 7px 14px; margin: 12px 8px 0 0;
  border: 1px solid #d8dce2; background: #fff; border-radius: 8px; cursor: pointer; color: #4a505a;
}
.side button:hover { background: #f2f3f5; }
`;

/* ------------------------------------------------------------------ *
 * 组装
 * ------------------------------------------------------------------ */
let css = SHELL_CSS + '\n';
css += '/* ===== app.wxss ===== */\n' + convert(read('app.wxss'), null) + '\n';
for (const p of PAGES) {
  const wxssPath = path.join(ROOT, p.path + '.wxss');
  if (fs.existsSync(wxssPath)) {
    css += '/* ===== ' + p.path + '.wxss ===== */\n' + convert(read(p.path + '.wxss'), p.path) + '\n';
  }
}

const runtime = read('tools/preview-runtime.js');
const selftest = read('tools/preview-selftest.js');

const pageMeta = {};
for (const p of PAGES) {
  pageMeta[p.path] = { title: p.title, tab: p.tab };
}

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Acronym · 预览</title>
<style>
${css}</style>
</head>
<body>
<div class="wrap">
  <div class="phone-col">
    <div class="phone">
      <div class="nav"><span id="nav-title">My Acronym</span></div>
      <div id="screen"></div>
      <div class="tabbar" id="tabbar"></div>
      <div class="wx-toast" id="toast"></div>
      <div class="wx-modal-mask" id="modal-mask"><div class="wx-modal" id="modal-box"></div></div>
    </div>
    <div class="phone-cap">375 × 780　·　1rpx = 0.5px</div>
  </div>

  <div class="side">
    <h1>My Acronym 预览</h1>
    <p class="lead">
      这一页跑的是<strong>真实源码</strong>：真实 WXML 编译成 DOM，真实页面 JS 处理事件，
      真实 <code>utils/storage.js</code> 管数据。搜索、收藏、增删改的行为和小程序里一致。
    </p>

    <h2>可以试什么</h2>
    <ul>
      <li>商务风首页：搜索框下方统计区（已收录 / 分类 / 最近更新），数字取自真实存储</li>
      <li>首页收藏计数：收藏/取消后返回实时变化；0 时是空状态</li>
      <li>点顶部搜索框 → 进搜索页，输入即时过滤（缩写 / 英文原词 / 中文释义，不区分大小写）</li>
      <li>点卡片右侧 ☆ → 收藏/取消，toast 提示；A→Z / 最近更新 → 排序</li>
      <li>点卡片 → 进详情页；内置词条只读，自定义词条可改可删</li>
      <li>右下角 ＋ → 新增词条；左上角「取消」可退出（未保存会先确认）</li>
      <li>收藏页左上角「返回」→ 有上级返回上级，无上级切回首页</li>
    </ul>

    <h2>本地存储</h2>
    <p class="lead" style="margin-bottom:4px">
      落在浏览器 localStorage，<strong>键名和小程序完全一致</strong>，刷新不丢。
    </p>
    <div class="panel"><div id="debug-body"></div></div>
    <button id="btn-reload">刷新页面</button>
    <button id="btn-reset">清空存储并重载</button>
  </div>
</div>

<script>
window.__PREVIEW_MODULES__ = ${JSON.stringify(modules)};
window.__PREVIEW_PAGES__ = ${JSON.stringify(pageMeta)};
</script>
<script>
${runtime}
</script>
<script>
${selftest}
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');

const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log('已生成 ' + path.relative(ROOT, OUT) + '（' + kb + ' KB）');
console.log('内联模块 ' + Object.keys(modules).length + ' 个，页面 ' + PAGES.length + ' 个');
