/**
 * My Acronym —— 页面交互模拟自测（纯 Node）
 * 运行：node tests/pages.js
 *
 * 用内存 Storage + wx 桩加载真实页面代码，模拟：
 *   列表页：首次渲染、实时搜索、仅看收藏、排序、收藏切换
 *   详情页：新增、自定义词条编辑、内置只读保护、删除
 *   收藏页：收藏列表与取消收藏
 */

const path = require('path');

/* ---------- wx 桩 ---------- */
const mem = {};
global.wx = {
  getStorageSync(key) {
    return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : '';
  },
  setStorageSync(key, value) {
    mem[key] = JSON.parse(JSON.stringify(value));
  },
  removeStorageSync(key) { delete mem[key]; },
  showToast(opts) { global.__lastToast = opts.title; },
  showModal(opts) {
    global.__lastModal = opts;
    if (global.__confirmModal) opts.success && opts.success({ confirm: true });
  },
  navigateTo(opts) { global.__lastNav = opts.url; },
  navigateBack() { global.__backCount = (global.__backCount || 0) + 1; },
  setNavigationBarTitle(opts) { global.__navTitle = opts.title; },
  switchTab(opts) { global.__lastSwitch = opts.url; }
};

let captured = null;
global.Page = (opts) => { captured = opts; };
global.App = () => {};
global.getApp = () => ({ globalData: {} });
// 页面栈桩：默认模拟「从其他页 navigateTo 进入」（有上级）；
// 特定用例里会临时改为空数组模拟「从 tabBar 直接进入」
global.getCurrentPages = () => [1, 2];

const ROOT = path.join(__dirname, '..');

function loadPage(rel) {
  captured = null;
  delete require.cache[require.resolve(path.join(ROOT, rel + '.js'))];
  require(path.join(ROOT, rel + '.js'));
  if (!captured) throw new Error('页面未注册 Page(): ' + rel);
  const inst = Object.assign({}, captured);
  inst.data = JSON.parse(JSON.stringify(captured.data));
  inst.setData = function (obj, cb) {
    Object.assign(inst.data, obj);
    if (cb) cb();
  };
  return inst;
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

Object.keys(mem).forEach((k) => delete mem[k]);

/* ================= 首页（收藏计数） ================= */
section('【首页】收藏计数 / 搜索入口 / 新增入口');
const index = loadPage('pages/index/index');
index.onLoad();

eq(index.data.favCount, 0, '首次进入收藏数为 0');
eq(index.data.hasFav, false, '0 时 hasFav 为 false（展示空状态）');
ok(index.data.list === undefined, '首页不再持有任何列表数据');

// —— 统计展示区（数据取自真实存储，不硬编码）
eq(index.data.stats.abbrCount, 149, '统计区：缩写数 = 149（多义条目只算一个缩写）');
eq(index.data.stats.meaningCount, 154, '统计区：含义数 = 154（同一缩写的多个含义各算一条）');
ok(/^\d{4}-\d{2}-\d{2}$/.test(index.data.stats.lastUpdated),
  '统计区：最近更新时间为 YYYY-MM-DD：' + index.data.stats.lastUpdated);

// —— 计数随收藏实时变化（模拟从搜索页/详情页收藏后返回）
const store = require(path.join(ROOT, 'utils/storage.js'));
store.toggleFav('b_api__it');
index.onShow();
eq(index.data.favCount, 1, '收藏 1 条后首页计数变为 1');
eq(index.data.hasFav, true, 'hasFav 变为 true');
store.toggleFav('b_5g__it');
index.onShow();
eq(index.data.favCount, 2, '再收藏 1 条后计数变为 2');
store.toggleFav('b_api__it');
index.onShow();
eq(index.data.favCount, 1, '取消收藏后计数回到 1');
store.toggleFav('b_5g__it');
index.onShow();
eq(index.data.favCount, 0, '全部取消后计数回到 0');
eq(index.data.hasFav, false, '回到 0 时重新展示空状态');

// —— 两个入口
index.onSearchTap();
eq(global.__lastNav, '/pages/search/search', '点搜索框进入搜索页');
index.onAdd();
eq(global.__lastNav, '/pages/detail/detail?mode=add', '点 ＋ 进入新增页');

/* ================= 搜索页 ================= */
section('【搜索页】渲染 / 搜索 / 排序 / 收藏');
const search = loadPage('pages/search/search');
search.onLoad({});

ok(search.data.list.length >= 60, '首屏加载全部内置词条（' + search.data.list.length + ' 条）');
eq(search.data.total, search.data.list.length, '统计数与列表长度一致');
const abbrOrder = search.data.list.map((i) => i.abbr.toUpperCase());
ok(
  abbrOrder.join(',') === abbrOrder.slice().sort().join(','),
  '默认按字母升序排列（数字在字母前，5G → A/P → API）'
);
ok(search.data.list.every((i) => i.sourceText && i.sourceClass), '列表项带来源展示字段');

// —— 带关键词进入
const searchKw = loadPage('pages/search/search');
searchKw.onLoad({ keyword: 'kpi' });
eq(searchKw.data.keyword, 'kpi', '从首页带入的关键词已回填');
ok(searchKw.data.list.length >= 1, '带关键词进入直接出结果（' + searchKw.data.list.length + ' 条）');

// —— 实时搜索
search.onSearchInput({ detail: { value: 'api' } });
eq(search.data.keyword, 'api', '搜索关键词已写入 data');
ok(search.data.list.length > 0, '搜索 "api" 有结果（' + search.data.list.length + ' 条）');
ok(
  search.data.list.every((i) =>
    i.abbr.toLowerCase().indexOf('api') >= 0 ||
    i.full.toLowerCase().indexOf('api') >= 0 ||
    i.zh.toLowerCase().indexOf('api') >= 0),
  '搜索结果三字段均命中'
);
search.onSearchInput({ detail: { value: '应用程序' } });
ok(search.data.list.length >= 1, '中文释义可搜（' + search.data.list.length + ' 条）');
search.onSearchInput({ detail: { value: 'APPLICATION' } });
ok(search.data.list.length >= 1, '英文原词可搜（大小写不敏感）');
search.onSearchInput({ detail: { value: 'zzz-nothing' } });
eq(search.data.list.length, 0, '无匹配时列表为空');
eq(search.data.emptyType, 'search', '无匹配时进入搜索空状态');
eq(search.data.emptyAction, '清除搜索', '空状态提供「清除搜索」');

search.onClearSearch();
eq(search.data.keyword, '', '清除搜索后关键词为空');
ok(search.data.list.length >= 60, '清除搜索后恢复全量列表');

// —— 收藏切换
const firstId = search.data.list[0].id;
search.onToggleFav({ currentTarget: { dataset: { id: firstId } } });
ok(search.data.list[0].fav === true, '点击后列表项变为已收藏');
eq(global.__lastToast, '已收藏', '收藏有 toast 反馈');
eq(search.data.favCount, 1, '收藏数同步为 1');
search.onToggleFav({ currentTarget: { dataset: { id: firstId } } });
ok(search.data.list[0].fav === false, '再次点击取消收藏');
eq(search.data.favCount, 0, '收藏数同步回 0');

// —— 只给 data-index（模拟 dataset.id 取不到的环境差异），仍然要能收藏到正确的词条
const fallbackId = search.data.list[3].id;
global.__lastToast = '';
search.onToggleFav({ currentTarget: { dataset: { index: 3 } } });
ok(search.data.list[3].fav === true, '没有 data-id 时按 data-index 兜底收藏成功');
eq(global.__lastToast, '已收藏', '兜底路径的 toast 反馈正常');
ok(search.data.favCount === 1, '兜底路径收藏数正确');
search.onToggleFav({ currentTarget: { dataset: { index: 3 } } });
eq(search.data.favCount, 0, '兜底路径也能正常取消');

// —— id 与 index 都取不到时，必须报错，绝不能假装成功（这是「点了没反应」的根因防线）
global.__lastToast = '';
const favBefore = search.data.favCount;
search.onToggleFav({ currentTarget: { dataset: {} } });
eq(search.data.favCount, favBefore, '取不到 id 时收藏数不变');
eq(global.__lastToast, '收藏失败：未取到词条标识', '取不到 id 时明确报错，不再谎称「已收藏」');

// —— 传入不存在的 id 时，也不能污染收藏列表
global.__lastToast = '';
search.onToggleFav({ currentTarget: { dataset: { id: 'b_not_exist' } } });
eq(global.__lastToast, '已收藏', '未知 id 仍按用户意图写入（收藏不因列表差异丢失）');
ok(store.getFavIds().indexOf('b_not_exist') >= 0, '未知 id 写入成功');
search.onToggleFav({ currentTarget: { dataset: { id: 'b_not_exist' } } });
ok(store.getFavIds().indexOf('b_not_exist') < 0, '未知 id 也能正常取消');

// —— 排序
search.onSort({ currentTarget: { dataset: { by: 'time' } } });
eq(search.data.sortBy, 'time', '切换到按时间排序');
const times = search.data.list.map((i) => i.updatedAt);
ok(times.join(',') === times.slice().sort().reverse().join(','), '时间排序为最近在前');
search.onSort({ currentTarget: { dataset: { by: 'letter' } } });
eq(search.data.sortBy, 'letter', '切回按字母排序');

// —— 跳转详情 / 返回
search.onItemTap({ currentTarget: { dataset: { id: 'b_api__it' } } });
ok(global.__lastNav.indexOf('/pages/detail/detail?id=b_api__it') >= 0, '点击词条进入详情页：' + global.__lastNav);
global.__backCount = 0;
search.onBack();
eq(global.__backCount, 1, '点「取消」返回上一页');

/* ================= 详情页 ================= */
section('【详情页】内置只读 / 新增 / 编辑 / 删除');

// —— 内置词条只读
const dView = loadPage('pages/detail/detail');
dView.onLoad({ mode: 'view', id: 'b_api__it' });
eq(dView.data.abbr, 'API', '内置词条内容加载正确');
eq(dView.data.isBuiltin, true, '标记为内置');
eq(dView.data.canEdit, false, '内置词条不可编辑');
eq(dView.data.sourceText, '内置', '来源显示为内置');
ok(/^\d{4}-\d{2}-\d{2}$/.test(dView.data.createdAt), '内置词条带创建时间：' + dView.data.createdAt);

// —— 内置词条不能被删除（UI 上按钮不渲染，逻辑上再兜一层）
global.__confirmModal = false;
dView.onDelete();
eq(global.__lastToast, '内置词条不可删除', '内置词条点删除被拦截并提示');
ok(!global.__lastModal, '内置词条删除不会进入确认流程');

// —— 新增
const dAdd = loadPage('pages/detail/detail');
dAdd.onLoad({ mode: 'add' });
eq(dAdd.data.creator, '', '新增时创建者留空，等待用户点输入框填入微信昵称');
eq(dAdd.data.canEdit, true, '新增时可编辑');
dAdd.onAbbrInput({ detail: { value: 'MY' } });
dAdd.onFullInput({ detail: { value: 'My Acronym' } });
dAdd.onZhInput({ detail: { value: '我的缩写本' } });
dAdd.onSave();
eq(global.__lastToast, '已添加', '新增成功有反馈');
const userList = mem['ma_user_v1'];
eq(userList.length, 1, '自定义词条已写入存储');
eq(userList[0].abbr, 'MY', '缩写已保存');
eq(userList[0].creator, '匿名用户', '未填写昵称时创建者兜底为「匿名用户」');
ok(/^\d{4}-\d{2}-\d{2}$/.test(userList[0].createdAt), '创建时间格式正确：' + userList[0].createdAt);
ok(/^\d{4}-\d{2}-\d{2}$/.test(userList[0].updatedAt), '修改时间格式正确：' + userList[0].updatedAt);
eq(userList[0].source, 'custom', '来源标记为 custom');

// —— 必填校验
const dBad = loadPage('pages/detail/detail');
dBad.onLoad({ mode: 'add' });
dBad.onSave();
eq(global.__lastToast, '请填写缩写', '缩写为空时提示');

// —— 取消入口：空表单直接返回，不弹确认
global.__backCount = 0;
global.__lastModal = null;
const dCancel = loadPage('pages/detail/detail');
dCancel.onLoad({ mode: 'add' });
dCancel.onCancel();
eq(global.__backCount, 1, '未填写内容时点「取消」直接返回上一页');
ok(!global.__lastModal, '空表单取消不弹确认框');

// —— 取消入口：有未保存输入时先确认，确认后才离开
global.__backCount = 0;
global.__lastModal = null;
const dCancel2 = loadPage('pages/detail/detail');
dCancel2.onLoad({ mode: 'add' });
dCancel2.onAbbrInput({ detail: { value: 'X' } });
dCancel2.onCancel();
ok(global.__lastModal && global.__lastModal.title === '放弃编辑',
  '有未保存输入时点「取消」弹出放弃确认');
eq(global.__lastModal.content.indexOf('尚未保存') >= 0, true, '确认框提示内容包含「尚未保存」');
eq(global.__backCount, 0, '用户确认前不离开页面');
global.__lastModal.success({ confirm: true });
eq(global.__backCount, 1, '确认放弃后返回上一页');
// 选择「继续编辑」则留在本页
global.__backCount = 0;
const dCancel3 = loadPage('pages/detail/detail');
dCancel3.onLoad({ mode: 'add' });
dCancel3.onAbbrInput({ detail: { value: 'Y' } });
dCancel3.onCancel();
global.__lastModal.success({ confirm: false });
eq(global.__backCount, 0, '选择「继续编辑」时不返回');

// —— 新增词条后统计区同步变化（真实数据源刷新）
const idxStats = loadPage('pages/index/index');
idxStats.onLoad();
eq(idxStats.data.stats.meaningCount, 155, '新增 1 条后含义数变为 155');
eq(idxStats.data.stats.abbrCount, 150, '新增 1 条后缩写数变为 150');
eq(idxStats.data.stats.industryCount >= 5, true,
  '行业数量取自真实数据（' + idxStats.data.stats.industryCount + '）');
eq(idxStats.data.stats.lastUpdated, store.todayStr(),
  '最近更新时间随自定义词条的修改时间变化：' + idxStats.data.stats.lastUpdated);

/* ================= 收藏页 ================= */
section('【收藏页】收藏列表 / 取消收藏');
// 先在搜索页收藏两条
const idx2 = loadPage('pages/search/search');
idx2.onLoad({});
idx2.onToggleFav({ currentTarget: { dataset: { id: 'b_api__it' } } });
idx2.onToggleFav({ currentTarget: { dataset: { id: userList[0].id } } });

const fav = loadPage('pages/favorite/favorite');
fav.onLoad();
eq(fav.data.list.length, 2, '收藏页展示 2 条');
ok(fav.data.list.every((i) => i.fav === true), '收藏项均为已收藏状态');
ok(fav.data.list.some((i) => i.sourceText === '自定义'), '自定义词条也能被收藏');

fav.onSort({ currentTarget: { dataset: { by: 'time' } } });
eq(fav.data.sortBy, 'time', '收藏页支持排序切换');

// —— 返回入口：有上级页面（从详情页等返回）时返回上一页
global.__backCount = 0;
fav.onBack();
eq(global.__backCount, 1, '有上级页面时点「返回」返回上一页');

// —— 返回入口：从 tabBar 直接进入（无上级）时安全切回首页
global.getCurrentPages = () => []; // 模拟无页面栈
global.__backCount = 0;
global.__lastSwitch = '';
fav.onBack();
eq(global.__lastSwitch, '/pages/index/index', '无上级页面时「返回」切回首页');
eq(global.__backCount, 0, '无上级时不调用 navigateBack');
global.getCurrentPages = () => [1, 2]; // 还原

fav.onToggleFav({ currentTarget: { dataset: { id: 'b_api__it' } } });
eq(fav.data.list.length, 1, '取消收藏后条目移除');
eq(global.__lastToast, '已取消收藏', '取消收藏有反馈');
eq(mem['ma_fav_v1'].length, 1, '收藏存储同步减少');

// 取消最后一条（此时剩下的是自定义词条）
const remainId = fav.data.list[0].id;
fav.onToggleFav({ currentTarget: { dataset: { id: remainId } } });
eq(fav.data.list.length, 0, '全部取消后收藏页为空');
eq(fav.data.emptyTitle, '还没有收藏任何词条', '收藏为空提示语正确');

/* ================= 编辑与删除 ================= */
section('【详情页】编辑 / 删除自定义词条');
const dEdit = loadPage('pages/detail/detail');
dEdit.onLoad({ mode: 'view', id: userList[0].id });
eq(dEdit.data.canEdit, true, '自定义词条可编辑');
eq(dEdit.data.abbr, 'MY', '编辑页回填原值');
dEdit.onAbbrInput({ detail: { value: 'MY2' } });
dEdit.onCreatorInput({ detail: { value: '涛哥' } });
dEdit.onSave();
eq(global.__lastToast, '已保存', '编辑成功有反馈');
const after = mem['ma_user_v1'][0];
eq(after.abbr, 'MY2', '缩写已更新');
eq(after.creator, '涛哥', '创建者已更新');
eq(after.createdAt, userList[0].createdAt, '创建时间保持不变');

// 删除（先给这条加个收藏，验证删除时会一并清掉收藏状态）
const idx3 = loadPage('pages/search/search');
idx3.onLoad({});
idx3.onToggleFav({ currentTarget: { dataset: { id: userList[0].id } } });
eq(mem['ma_fav_v1'].length, 1, '删除前该词条处于收藏状态');

global.__confirmModal = true;
const dDel = loadPage('pages/detail/detail');
dDel.onLoad({ mode: 'view', id: userList[0].id });
dDel.onDelete();
eq(global.__lastToast, '已删除', '删除成功有反馈');
eq(mem['ma_user_v1'].length, 0, '自定义词条已从存储移除');
eq(mem['ma_fav_v1'].length, 0, '删除时同步清掉该词的收藏');

/* ================= 创建者：微信昵称 ================= */
section('【创建者】微信昵称 / 兜底文案 / 缓存');
const profile = require(path.join(ROOT, 'utils/profile.js'));

// 上一段编辑保存时填过「涛哥」→ 已被缓存，新增页应自动带出
const dNick1 = loadPage('pages/detail/detail');
dNick1.onLoad({ mode: 'add' });
eq(dNick1.data.creator, '涛哥', '新增页自动带出上次用过的微信昵称');

// 填写新昵称并保存
dNick1.onAbbrInput({ detail: { value: 'NK' } });
dNick1.onFullInput({ detail: { value: 'Nick Name' } });
dNick1.onZhInput({ detail: { value: '昵称' } });
dNick1.onCreatorInput({ detail: { value: '张小明' } });
dNick1.onSave();
eq(global.__lastToast, '已添加', '带昵称新增成功');
const nickItem = mem['ma_user_v1'].filter((x) => x.abbr === 'NK')[0];
eq(nickItem.creator, '张小明', '创建者保存为微信昵称（不是 openid / 用户 ID / 手机号）');
eq(profile.getNickname(), '张小明', '昵称已缓存，供下次新增带出');

// 展示层：详情回填 + 列表行
const dNickView = loadPage('pages/detail/detail');
dNickView.onLoad({ mode: 'view', id: nickItem.id });
eq(dNickView.data.creator, '张小明', '详情页展示创建者昵称');
const nickRow = store.query({ keyword: 'NK' }).list[0];
ok(nickRow.footText.indexOf('张小明') === 0, '列表中展示创建者昵称：' + nickRow.footText);

// 未授权 / 未填写 → 兜底，且不覆盖已缓存的昵称
const dNick2 = loadPage('pages/detail/detail');
dNick2.onLoad({ mode: 'add' });
eq(dNick2.data.creator, '张小明', '再次新增时仍自动带出缓存昵称');
dNick2.onAbbrInput({ detail: { value: 'ANON' } });
dNick2.onFullInput({ detail: { value: 'Anonymous' } });
dNick2.onZhInput({ detail: { value: '匿名词条' } });
dNick2.setData({ creator: '' }); // 模拟用户未授权、昵称获取失败
dNick2.onSave();
const anon = mem['ma_user_v1'].filter((x) => x.abbr === 'ANON')[0];
eq(anon.creator, '匿名用户', '未填写/未授权时创建者兜底为「匿名用户」');
eq(profile.getNickname(), '张小明', '兜底文案不会覆盖已缓存的真实昵称');

/* ================= 一对多：行业选择 / 其他含义 / 重复提示 ================= */
section('【一对多】行业选择 / 其他含义 / 冲突提示');

// —— 内置多义词详情页：显示行业 + 其他含义
const dMulti = loadPage('pages/detail/detail');
dMulti.onLoad({ mode: 'view', id: 'b_api__it' });
eq(dMulti.data.industry, 'it', '详情页回填行业 key');
eq(dMulti.data.industryName, 'IT / 互联网', '详情页展示行业名');
ok(dMulti.data.others.length === 1, '列出同缩写的其他含义（' + dMulti.data.others.length + ' 条）');
eq(dMulti.data.others[0].id, 'b_api__medical', '另一个含义是医药行业的 API');
dMulti.onOtherTap({ currentTarget: { dataset: { id: 'b_api__medical' } } });
ok(global.__lastNav.indexOf('detail?id=b_api__medical') >= 0, '点另一个含义跳到它的详情页');

const dMedical = loadPage('pages/detail/detail');
dMedical.onLoad({ mode: 'view', id: 'b_api__medical' });
ok(dMedical.data.note.indexOf('活性成分') > 0, '只读模式能看到说明文字：' + dMedical.data.note);
eq(dMedical.data.others[0].industryText, 'IT / 互联网', '反向也能看到 IT 含义');

// —— 新增页：行业胶囊选择
const dInd = loadPage('pages/detail/detail');
dInd.onLoad({ mode: 'add' });
ok(dInd.data.industryOptions.length >= 10, '新增页给出行业选项（' + dInd.data.industryOptions.length + ' 个）');
eq(dInd.data.industry, 'general', '默认行业为「通用」');
dInd.onIndustryPick({ currentTarget: { dataset: { key: 'finance' } } });
eq(dInd.data.industry, 'finance', '点胶囊切换行业');
eq(dInd.data.industryName, '金融 / 财税', '行业展示名同步刷新');
eq(dInd.isDirty(), true, '换行业后表单算已修改（会被「放弃编辑」拦截）');

// —— 说明与来源
dInd.onAbbrInput({ detail: { value: 'ROI2' } });
dInd.onFullInput({ detail: { value: 'Return On Input' } });
dInd.onZhInput({ detail: { value: '投入回报' } });
dInd.onNoteInput({ detail: { value: '财务部口径' } });
dInd.onRefInput({ detail: { value: '公司术语表 v2' } });
dInd.onSave();
eq(global.__lastToast, '已添加', '带行业/说明/来源的新增成功');
const savedRow = mem['ma_user_v1'].filter((x) => x.abbr === 'ROI2')[0];
eq(savedRow.industry, 'finance', '行业已保存');
eq(savedRow.note, '财务部口径', '说明已保存');
eq(savedRow.sourceRef, '公司术语表 v2', '来源已保存（字段不与 source 冲突）');

// —— 重复：(缩写, 行业) 撞车要弹提示，而不是默默写进去
const dDup = loadPage('pages/detail/detail');
dDup.onLoad({ mode: 'add' });
global.__lastModal = null;
dDup.onIndustryPick({ currentTarget: { dataset: { key: 'finance' } } });
dDup.onAbbrInput({ detail: { value: 'ROI2' } });
dDup.onFullInput({ detail: { value: 'Another Version' } });
dDup.onZhInput({ detail: { value: '另一个版本' } });
dDup.onSave();
ok(global.__lastModal && global.__lastModal.title === '已经有一条相同含义',
  '同缩写 + 同行业保存时弹出冲突提示');
ok(global.__lastModal.content.indexOf('投入回报') > 0, '提示里说明了已存在的那一条是什么');
eq(mem['ma_user_v1'].filter((x) => x.abbr === 'ROI2').length, 1, '冲突时没有写入第二条');

console.log('\n──────────────────────────────');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('──────────────────────────────');
process.exit(fail === 0 ? 0 : 1);
