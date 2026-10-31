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
ok(data.ITEMS.every((i) => i.abbr && i.full && i.zh), '每条都有缩写/英文原词/中文释义');
ok(data.ITEMS.every((i) => i.source === 'builtin'), '内置词条 source 均为 builtin');
const cats = {};
data.ITEMS.forEach((i) => { cats[i.category] = (cats[i.category] || 0) + 1; });
ok(cats['IT'] > 0 && cats['商务'] > 0 && cats['日常'] > 0,
  '覆盖 IT/商务/日常三类（' + JSON.stringify(cats) + '）');

/* —— 一对多：唯一键是 (缩写, 行业)，同一缩写允许多个含义 —— */
const meaningKeys = data.ITEMS.map((i) => i.abbr.toUpperCase() + '@' + i.industry);
ok(new Set(meaningKeys).size === meaningKeys.length, '(缩写, 行业) 组合唯一：不存在同行业重复含义');
ok(data.DROPPED_DUP.length === 0,
  '没有条目被静默去重丢弃（' + JSON.stringify(data.DROPPED_DUP) + '）');
const okIndustry = data.ITEMS.every((i) => /^[a-z]+$/.test(i.industry));
ok(okIndustry, '行业 key 都是小写英文（参与 id 生成，不能有中文或空格）');
const abbrSet = new Set(data.ITEMS.map((i) => i.abbr.toUpperCase()));
ok(abbrSet.size < data.ITEMS.length,
  '存在「同一缩写多个含义」的条目（缩写 ' + abbrSet.size + ' 个 / 含义 ' + data.ITEMS.length + ' 条）');
const dupAbbrs = Object.keys(data.MEANING_COUNT).filter((k) => data.MEANING_COUNT[k] > 1);
ok(dupAbbrs.length > 0, '多义缩写至少有 1 个：' + dupAbbrs.join(', '));
ok(data.ITEMS.every((i) => i.id === 'b_' + i.abbr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '__' + i.industry),
  'id 均为 b_<缩写slug>__<行业key>');
ok(data.ITEMS.every((i) => i.legacyId && i.legacyId !== i.id),
  '每条内置都带可回溯的 legacyId（用于迁移旧收藏）');

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
// 用一个内置没有的缩写。注意：现在同一缩写可以存在多个含义，但**同一行业只能有一个**
const created = store.saveUser({ abbr: 'ZZQ', full: 'Zzz Queens', zh: '占位词条', creator: '' });
ok(created.ok === true, '新增自定义词条成功');
eq(created.data.industry, 'general', '未指定行业时兜底为通用');
eq(created.data.creator, '匿名用户', '未填写微信昵称时创建者兜底为「匿名用户」');
ok(/^\d{4}-\d{2}-\d{2}$/.test(created.data.createdAt), '创建时间为 YYYY-MM-DD：' + created.data.createdAt);
ok(/^\d{4}-\d{2}-\d{2}$/.test(created.data.updatedAt), '修改时间为 YYYY-MM-DD：' + created.data.updatedAt);
eq(created.data.source, 'custom', 'source 标记为 custom');

eq(store.saveUser({ abbr: '', full: 'x', zh: 'y' }).ok, false, '缩写为空时拒绝保存');
eq(store.saveUser({ abbr: 'A', full: '', zh: 'y' }).ok, false, '英文原词为空时拒绝保存');
eq(store.saveUser({ abbr: 'A', full: 'b', zh: '' }).ok, false, '中文释义为空时拒绝保存');

const edited = store.saveUser({
  id: created.data.id,
  abbr: 'ZZQ2',
  full: 'Zzz Queens 2',
  zh: '占位词条（改）',
  creator: '涛哥'
});
ok(edited.ok === true, '编辑自定义词条成功');
eq(edited.data.abbr, 'ZZQ2', '缩写已更新');
eq(edited.data.creator, '涛哥', '创建者已更新');
eq(edited.data.createdAt, created.data.createdAt, '创建时间保持不变');
ok(/^\d{4}-\d{2}-\d{2}$/.test(edited.data.updatedAt), '修改时间已刷新');

eq(store.removeUser('b_api__it').ok, false, '内置词条不可删除');
eq(store.removeUser('b_api__it').err, 'builtin_protected', '内置词条删除返回 builtin_protected');
ok(store.removeUser(created.data.id).ok === true, '自定义词条可删除');
eq(store.getUserList().length, 0, '删除后用户列表为空');

/* ================= 4. 收藏 ================= */
section('【4】收藏功能');
ok(store.toggleFav('b_api__it') === true, '收藏内置词条');
ok(store.isFav('b_api__it') === true, '收藏状态已记录');
ok(store.toggleFav('b_api__it') === false, '取消收藏');
ok(store.isFav('b_api__it') === false, '取消收藏状态已记录');
store.setFav('b_api__it', true);
store.setFav('b_lol__general', true);
eq(store.getFavIds().length, 2, '收藏列表长度正确');

/* —— 收藏失败必须显式返回 null（这是「点了没反应」那类 bug 的根因防线）—— */
const favBefore = store.getFavIds().join(',');
ok(store.setFav('', true) === null, '空 id 收藏返回 null（不假装成功）');
ok(store.setFav(undefined, true) === null, 'undefined id 收藏返回 null');
ok(store.setFav(null, false) === null, 'null id 取消收藏返回 null');
ok(store.setFav({}, true) === null, '对象 id 收藏返回 null');
ok(store.toggleFav('') === null, '空 id 切换收藏返回 null');
eq(store.getFavIds().join(','), favBefore, '非法 id 不会污染收藏列表');
ok(store.setFav('b_api__it', true) === true, '合法 id 重复收藏仍返回 true（幂等）');
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
  Object.assign({}, x, { zh: x.id === 'b_api__it' ? '旧释义' : x.zh }));
mem['ma_builtin_v1'] = trimmed;
mem['ma_meta_v1'] = { version: 0, seededAt: '2026-01-01', builtinCount: trimmed.length };

delete require.cache[require.resolve(STORE)];
const store3 = require(STORE);
const merge = store3.seedBuiltin();
ok(merge.seeded === false, '已播种过则不重复整份写入');
eq(merge.added, 3, '缺失的内置词条被补齐');
eq(merge.updated, 1, '文案变化的内置词条被更新');
eq(store3.getBuiltinList().length, data.ITEMS.length, '合并后内置词条数量恢复');
const apiItem = store3.getById('b_api__it');
eq(apiItem.zh, '应用程序编程接口', '内置文案已被新版本覆盖');
eq(store3.getUserList().length, 1, '合并过程不影响用户数据');
ok(store3.isFav(savedUser.data.id) === true, '合并过程不影响收藏');
ok(store3.getById('b_api__it').source === 'builtin', '内置词条仍为只读来源');

/* ================= 8. 统计信息 getStats ================= */
section('【8】统计信息（首页统计区数据源）');
const stats = store3.getStats();
eq(stats.meaningCount, data.ITEMS.length + 1, '含义总数 = 内置 + 自定义（' + stats.meaningCount + '）');
eq(stats.totalCount, stats.meaningCount, 'totalCount 保持为同义别名，老调用方不会取到 undefined');
ok(stats.abbrCount < stats.meaningCount,
  '缩写数 < 含义数（多义条目被正确区分：' + stats.abbrCount + ' vs ' + stats.meaningCount + '）');
ok(stats.industryCount >= 5, '行业数取自真实数据（' + stats.industryCount + '）');
ok(/^\d{4}-\d{2}-\d{2}$/.test(stats.lastUpdated), '最近更新为 YYYY-MM-DD：' + stats.lastUpdated);
// 自定义词条的修改时间最新 → lastUpdated 跟随它
const userItem = store3.getUserList()[0];
eq(stats.lastUpdated >= userItem.updatedAt, true, '最近更新不早于任何词条的修改时间');

/* ================= 9. 一对多：去重规则与查询 ================= */
section('【9】同一缩写的多个含义');
const s9 = fresh();

// 同一缩写换行业 → 允许共存
const m1 = s9.saveUser({ abbr: 'DUP', full: 'Data Upload Protocol', zh: '数据上传协议', industry: 'it' });
const m2 = s9.saveUser({ abbr: 'DUP', full: 'Duplicate', zh: '重复', industry: 'general' });
ok(m1.ok === true && m2.ok === true, '同一缩写在不同行业下可以共存');
ok(m1.data.id !== m2.data.id, '两个含义有各自独立的 id');

// 同一缩写同一行业 → 拒绝
const conflict = s9.saveUser({ abbr: 'DUP', full: 'Something Else', zh: '别的含义', industry: 'it' });
ok(conflict.ok === false, '同一缩写 + 同一行业被拒绝');
eq(conflict.err, 'dup_industry', '冲突时返回 dup_industry');
ok(conflict.conflict && conflict.conflict.id === m1.data.id, '冲突信息里带上了已存在的那条，便于提示用户');

// 内置多义词也不能被自定义重复占用
const bizDup = s9.saveUser({ abbr: 'PR', full: 'Purchase Request', zh: '采购申请', industry: 'it' });
ok(bizDup.ok === false && bizDup.err === 'dup_industry', '撞上内置词条同样按 dup_industry 处理');
const bizOk = s9.saveUser({ abbr: 'PR', full: 'Purchase Requisition', zh: '采购申请单', industry: 'finance' });
ok(bizOk.ok === true, '换到空闲行业则可以保存');

// 编辑自身不冲突，改到别人行业才冲突
ok(s9.saveUser({ id: m1.data.id, abbr: 'DUP', full: '改了', zh: '改了', industry: 'it' }).ok === true,
  '编辑自身不算冲突');
ok(s9.saveUser({ id: m1.data.id, abbr: 'DUP', full: '改了', zh: '改了', industry: 'general' }).err === 'dup_industry',
  '编辑时改到已占用的行业会被拦住');

// 非法行业值必须被归一化，不能进 id
ok(s9.saveUser({ abbr: 'BAD', full: 'Bad', zh: '非法行业', industry: '乱写一通' }).data.industry === 'general',
  '非法行业 key 被归一化为 general');

// 查询：多义返回多条，且带上行业展示字段
const apiRows = s9.query({ keyword: 'API', sortBy: 'letter' }).list;
ok(apiRows.length === 2, '搜 API 返回 IT 与医药两条含义（实际 ' + apiRows.length + ' 条）');
ok(apiRows.every((i) => i.industryText), '每条都带行业展示名：' + apiRows.map((i) => i.industryText).join(' / '));
ok(apiRows.every((i) => i.multi === true && i.otherCount === 1), '标记了「还有 1 个含义」');
ok(s9.query({ keyword: '原料药' }).list.length === 1, '行业说明也能被搜到（说明字段纳入搜索）');
ok(s9.query({ keyword: '金融' }).list.some((i) => i.abbr === 'ATM'), '搜「金融」能命中金融行业的含义');

// 同源聚合查询
const prMeanings = s9.getMeanings('PR');
ok(prMeanings.length === 3, 'PR 共 3 个含义（内置 IT + 内置公关 + 自定义 finance）');
ok(s9.getMeanings('API', s9.getById('b_api__it').id).length === 1, '排除自己后只剩另一个含义');

// 收藏落在「某个含义」上：同缩写可以只收藏其中一个
s9.setFav('b_api__medical', true);
const favList = s9.queryFav('letter').list;
eq(favList.length, 1, '收藏的是具体含义，不是整个缩写');
eq(favList[0].id, 'b_api__medical', '收藏列表中保留的是被收藏的那一条');

/* ================= 10. 存量收藏 id 迁移 ================= */
section('【10】旧 id 收藏迁移');
// 模拟老版本设备：快照是旧 id，收藏里也是旧 id（含重复项和一个脏 id）
const memOld = {};
global.wx = {
  getStorageSync: (k) => (k in memOld ? memOld[k] : ''),
  setStorageSync: (k, v) => { memOld[k] = JSON.parse(JSON.stringify(v)); },
  removeStorageSync: (k) => { delete memOld[k]; },
  showToast: () => {}
};
memOld['ma_builtin_v1'] = [{
  id: 'b_api', abbr: 'API', full: 'Application Programming Interface', zh: '应用程序编程接口',
  category: 'IT', source: 'builtin', creator: '内置词条', createdAt: '2026-01-01', updatedAt: '2026-01-01'
}];
memOld['ma_fav_v1'] = ['b_api', 'b_pr', 'b_api', 'b_not_exist'];
memOld['ma_meta_v1'] = { version: 1, seededAt: '2026-10-01', builtinCount: 1 };
delete require.cache[require.resolve(STORE)];
const oldStore = require(STORE);
const migInfo = oldStore.init();
eq(migInfo.migrated, 3, '旧 id 收藏被迁移（去重后 3 个有效项中的 3 个命中旧规则）');
ok(oldStore.isFav('b_api__it') === true, 'b_api → b_api__it 迁移成功');
ok(oldStore.isFav('b_pr__it') === true, 'b_pr → b_pr__it 落到主含义');
ok(oldStore.getFavIds().indexOf('b_api') < 0, '迁移后不再残留旧 id');
eq(oldStore.getFavIds().length, 3, '重复的旧 id 被去重（脏 id 仍保留，不做擅自删除）');
ok(migInfo.migratedAmbiguous >= 1, '被告知有 N 个多义缩写落到主含义（' + migInfo.migratedAmbiguous + '）');
eq(oldStore.queryFav('letter').list.length, 2, '迁移后收藏页能显示 2 条（脏 id 那条不显示）');

// 二次 init 不会再迁移
const again = oldStore.init();
eq(again.migrated, 0, '第二次启动不重复迁移');
eq(oldStore.getFavIds().join(','), 'b_api__it,b_pr__it,b_not_exist', '重复迁移不会打乱收藏列表');

console.log('\n──────────────────────────────');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('──────────────────────────────');
process.exit(fail === 0 ? 0 : 1);
