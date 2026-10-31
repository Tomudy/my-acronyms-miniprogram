/**
 * My Acronym —— 数据层自测（纯 Node，无需微信开发者工具）
 * 运行：node tests/run.js
 *
 * 用内存 Storage 模拟 wx.getStorageSync / wx.setStorageSync，
 * 覆盖：内置播种、合并更新、用户增改删、收藏、搜索与排序、持久化。
 */

const path = require('path');

/* ---------- wx mock ---------- */
const mem = {};
global.wx = {
  getStorageSync(key) {
    return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : '';
  },
  setStorageSync(key, value) {
    mem[key] = JSON.parse(JSON.stringify(value));
  },
  removeStorageSync(key) {
    delete mem[key];
  },
  getStorageInfoSync() {
    return { keys: Object.keys(mem) };
  }
};

const STORE = path.join(__dirname, '..', 'utils', 'storage.js');
const DATA = path.join(__dirname, '..', 'data', 'acronyms.js');

function fresh() {
  // 清缓存 + 清存储，模拟「冷启动」
  delete require.cache[require.resolve(STORE)];
  delete require.cache[require.resolve(DATA)];
  Object.keys(mem).forEach((k) => delete mem[k]);
  return require(STORE);
}

let pass = 0;
let fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label); }
}
function eq(a, b, label) {
  ok(a === b, label + '  (期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a) + ')');
}
function section(t) { console.log('\n' + t); }

/* ================= 1. 内置数据 ================= */
section('【1】内置词条数据');
const data = require(DATA);
ok(data.ITEMS.length >= 60, '内置词条不少于 60 条（实际 ' + data.ITEMS.length + ' 条）');
ok(new Set(data.ITEMS.map((i) => i.id)).size === data.ITEMS.length, 'id 全部唯一');
ok(new Set(data.ITEMS.map((i) => i.abbr)).size === data.ITEMS.length, '缩写全部唯一');
ok(data.ITEMS.every((i) => i.abbr && i.full && i.zh), '每条都有缩写/英文原词/中文释义');
ok(data.ITEMS.every((i) => i.source === 'builtin'), '内置词条 source 均为 builtin');
const cats = {};
data.ITEMS.forEach((i) => { cats[i.category] = (cats[i.category] || 0) + 1; });
ok(cats['IT'] > 0 && cats['商务'] > 0 && cats['日常'] > 0,
  '覆盖 IT/商务/日常三类（' + JSON.stringify(cats) + '）');

/* ================= 2. 首次播种 ================= */
section('【2】首次启动播种内置数据');
let store = fresh();
const seed1 = store.init();
ok(seed1.seeded === true, '首次启动执行播种');
eq(store.getBuiltinList().length, data.ITEMS.length, '内置词条全部写入存储');
eq(store.getUserList().length, 0, '用户数据初始为空');
eq(store.getFavIds().length, 0, '收藏初始为空');
ok(mem['ma_builtin_v1'] !== undefined, 'ma_builtin_v1 已写入');
ok(mem['ma_meta_v1'] !== undefined, 'ma_meta_v1 已写入');

/* ================= 3. 用户自定义：增 / 改 / 删 ================= */
section('【3】自定义词条增改删');
const created = store.saveUser({ abbr: 'TBD', full: 'To Be Determined', zh: '待定', creator: '' });
ok(created.ok === true, '新增自定义词条成功');
eq(created.data.creator, '匿名用户', '未填写微信昵称时创建者兜底为「匿名用户」');
ok(/^\d{4}-\d{2}-\d{2}$/.test(created.data.createdAt), '创建时间为 YYYY-MM-DD：' + created.data.createdAt);
ok(/^\d{4}-\d{2}-\d{2}$/.test(created.data.updatedAt), '修改时间为 YYYY-MM-DD：' + created.data.updatedAt);
eq(created.data.source, 'custom', 'source 标记为 custom');

eq(store.saveUser({ abbr: '', full: 'x', zh: 'y' }).ok, false, '缩写为空时拒绝保存');
eq(store.saveUser({ abbr: 'A', full: '', zh: 'y' }).ok, false, '英文原词为空时拒绝保存');
eq(store.saveUser({ abbr: 'A', full: 'b', zh: '' }).ok, false, '中文释义为空时拒绝保存');

const edited = store.saveUser({
  id: created.data.id,
  abbr: 'TBD2',
  full: 'To Be Decided',
  zh: '待定（改）',
  creator: '涛哥'
});
ok(edited.ok === true, '编辑自定义词条成功');
eq(edited.data.abbr, 'TBD2', '缩写已更新');
eq(edited.data.creator, '涛哥', '创建者已更新');
eq(edited.data.createdAt, created.data.createdAt, '创建时间保持不变');
ok(/^\d{4}-\d{2}-\d{2}$/.test(edited.data.updatedAt), '修改时间已刷新');

eq(store.removeUser('b_api').ok, false, '内置词条不可删除');
eq(store.removeUser('b_api').err, 'builtin_protected', '内置词条删除返回 builtin_protected');
ok(store.removeUser(created.data.id).ok === true, '自定义词条可删除');
eq(store.getUserList().length, 0, '删除后用户列表为空');

/* ================= 4. 收藏 ================= */
section('【4】收藏功能');
ok(store.toggleFav('b_api') === true, '收藏内置词条');
ok(store.isFav('b_api') === true, '收藏状态已记录');
ok(store.toggleFav('b_api') === false, '取消收藏');
ok(store.isFav('b_api') === false, '取消收藏状态已记录');
store.setFav('b_api', true);
store.setFav('b_lol', true);
eq(store.getFavIds().length, 2, '收藏列表长度正确');

/* —— 收藏失败必须显式返回 null（这是「点了没反应」那类 bug 的根因防线）—— */
const favBefore = store.getFavIds().join(',');
ok(store.setFav('', true) === null, '空 id 收藏返回 null（不假装成功）');
ok(store.setFav(undefined, true) === null, 'undefined id 收藏返回 null');
ok(store.setFav(null, false) === null, 'null id 取消收藏返回 null');
ok(store.setFav({}, true) === null, '对象 id 收藏返回 null');
ok(store.toggleFav('') === null, '空 id 切换收藏返回 null');
eq(store.getFavIds().join(','), favBefore, '非法 id 不会污染收藏列表');
ok(store.setFav('b_api', true) === true, '合法 id 重复收藏仍返回 true（幂等）');
eq(store.getFavIds().length, 2, '重复收藏不会产生重复 id');

/* id 为数字时按字符串规范化，避免类型不一致导致的匹配失败（写完立刻收回，不影响后续用例） */
ok(store.setFav(12345, true) === true, '数字 id 被规范化为字符串后写入');
ok(store.isFav('12345') === true, '数字 id 写入后可用字符串形式查到');
ok(store.setFav('12345', false) === false, '数字 id 同样可以取消');
eq(store.getFavIds().length, 2, '临时用例已回收，收藏数量回到 2');

/* ================= 5. 搜索 / 筛选 / 排序 ================= */
section('【5】搜索、筛选与排序');
let res = store.query({ keyword: 'api' });
ok(res.list.length > 0 && res.list.every((i) =>
  i.abbr.toLowerCase().includes('api') ||
  i.full.toLowerCase().includes('api') ||
  i.zh.toLowerCase().includes('api')), '缩写/英文/中文三字段均可匹配，且不区分大小写');

res = store.query({ keyword: 'APPLICATION PROGRAMMING' });
ok(res.list.length >= 1, '按英文原词片段可搜到');
res = store.query({ keyword: '应用程序' });
ok(res.list.length >= 1, '按中文释义可搜到');
eq(store.query({ keyword: 'zzzz-not-exist' }).list.length, 0, '无匹配时返回空列表');

res = store.query({ keyword: '', onlyFav: true });
eq(res.list.length, 2, '「仅看收藏」筛选生效');
res = store.query({ keyword: '', sortBy: 'letter' });
const abbrs = res.list.map((i) => i.abbr.toUpperCase());
ok(abbrs.join(',') === abbrs.slice().sort().join(','), '按字母排序为 A→Z');
res = store.query({ keyword: '', sortBy: 'time' });
const times = res.list.map((i) => i.updatedAt);
ok(times.join(',') === times.slice().sort().reverse().join(','), '按时间排序为最近在前');

/* ================= 6. 持久化（重进小程序） ================= */
section('【6】退出重进后数据保留');
const savedUser = store.saveUser({ abbr: 'MY', full: 'My Acronym', zh: '我的缩写', creator: '我' });
store.setFav(savedUser.data.id, true);
store.saveUser({ id: savedUser.data.id, abbr: 'MY2', full: 'My Acronym 2', zh: '改过了' });

// 模拟退出重进：重载模块（不清 Storage）
delete require.cache[require.resolve(STORE)];
const store2 = require(STORE);
eq(store2.getUserList().length, 1, '重启后自定义词条仍在');
eq(store2.getUserList()[0].abbr, 'MY2', '重启后编辑结果保留');
eq(store2.getUserList()[0].updatedAt, savedUser.data.updatedAt, '重启后修改时间保留');
ok(store2.isFav(savedUser.data.id) === true, '重启后收藏状态保留');
eq(store2.getFavIds().length, 3, '重启后收藏数量保留（含内置收藏）');

/* ================= 7. 合并更新策略 ================= */
section('【7】内置数据合并更新');
// 模拟旧版本存储：少一条、文案旧
const snapshot = mem['ma_builtin_v1'];
const trimmed = snapshot.slice(0, snapshot.length - 3).map((x) =>
  Object.assign({}, x, { zh: x.id === 'b_api' ? '旧释义' : x.zh }));
mem['ma_builtin_v1'] = trimmed;
mem['ma_meta_v1'] = { version: 0, seededAt: '2026-01-01', builtinCount: trimmed.length };

delete require.cache[require.resolve(STORE)];
const store3 = require(STORE);
const merge = store3.seedBuiltin();
ok(merge.seeded === false, '已播种过则不重复整份写入');
eq(merge.added, 3, '缺失的内置词条被补齐');
eq(merge.updated, 1, '文案变化的内置词条被更新');
eq(store3.getBuiltinList().length, data.ITEMS.length, '合并后内置词条数量恢复');
const apiItem = store3.getById('b_api');
eq(apiItem.zh, '应用程序编程接口', '内置文案已被新版本覆盖');
eq(store3.getUserList().length, 1, '合并过程不影响用户数据');
ok(store3.isFav(savedUser.data.id) === true, '合并过程不影响收藏');
ok(store3.getById('b_api').source === 'builtin', '内置词条仍为只读来源');

/* ================= 8. 统计信息 getStats ================= */
section('【8】统计信息（首页统计区数据源）');
const stats = store3.getStats();
eq(stats.totalCount, data.ITEMS.length + 1, '总数 = 内置 + 自定义（' + stats.totalCount + '）');
eq(stats.categoryCount, 4, '分类数 = 内置 3 类 + 自定义 1 类');
ok(/^\d{4}-\d{2}-\d{2}$/.test(stats.lastUpdated), '最近更新为 YYYY-MM-DD：' + stats.lastUpdated);
// 自定义词条的修改时间最新 → lastUpdated 跟随它
const userItem = store3.getUserList()[0];
eq(stats.lastUpdated >= userItem.updatedAt, true, '最近更新不早于任何词条的修改时间');

console.log('\n──────────────────────────────');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('──────────────────────────────');
process.exit(fail === 0 ? 0 : 1);
