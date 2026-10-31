/**
 * My Acronym —— 本地存储封装
 *
 * 键名设计（全部带 ma_ 前缀，统一版本号后缀 _v1）：
 *   ma_builtin_v1 : 内置词条快照（数组）。首次启动播种；后续启动仅做合并更新。
 *   ma_user_v1    : 用户自定义词条（数组）。内置词条绝不写入这里。
 *   ma_fav_v1     : 收藏的词条 id 数组（内置 + 自定义都走这一份）。
 *   ma_meta_v1    : 元信息 { version, seededAt, builtinCount }，用于判断是否需要合并。
 *
 * 合并逻辑（seedBuiltin）：
 *   1. 存储里没有 ma_builtin_v1 → 首次播种：整份内置数据写入。
 *   2. 存储里已有 → 只做增量合并：
 *      - 新增：内置里有、存储里没有的 id → 追加。
 *      - 更新：id 已存在但文案变了 → 用内置的新文案覆盖该条（只覆盖内容字段）。
 *      - 删除：内置里已移除的 id → 从快照中剔除。
 *      - 用户自定义词条（ma_user_v1）与收藏（ma_fav_v1）完全不参与合并，永不被覆盖。
 *
 * 全部读写都包了 try/catch，存储异常时降级为内存态，不影响页面渲染。
 */

const BUILTIN = require('../data/acronyms.js');

const KEYS = {
  builtin: 'ma_builtin_v1',
  user: 'ma_user_v1',
  fav: 'ma_fav_v1',
  meta: 'ma_meta_v1'
};

/* ------------------------------------------------------------------ *
 * 基础读写
 * ------------------------------------------------------------------ */

function getWx() {
  if (typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function') {
    return wx;
  }
  return null;
}

function read(key, fallback) {
  const w = getWx();
  if (!w) return fallback;
  try {
    const v = w.getStorageSync(key);
    if (v === '' || v === null || v === undefined) return fallback;
    return v;
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  const w = getWx();
  if (!w) {
    console.warn('[storage] 写入失败：当前环境无 wx storage（' + key + '）');
    return false;
  }
  try {
    w.setStorageSync(key, value);
    return true;
  } catch (e) {
    // 吞异常会让上层以为写成功了。这里必须留痕，否则「收藏没生效」无从查起
    console.warn('[storage] 写入失败：' + key, e);
    return false;
  }
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ------------------------------------------------------------------ *
 * 日期工具：统一 YYYY-MM-DD
 * ------------------------------------------------------------------ */

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function todayStr(date) {
  const d = date || new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function nowStamp() {
  const d = new Date();
  return todayStr(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

/* ------------------------------------------------------------------ *
 * 内置词条：首次播种 + 后续合并
 * ------------------------------------------------------------------ */

function normalize(item) {
  const src = item.source === 'custom' ? 'custom' : 'builtin';
  return {
    id: item.id,
    abbr: item.abbr || '',
    full: item.full || '',
    zh: item.zh || '',
    category: item.category || (src === 'builtin' ? '内置' : '自定义'),
    source: src,
    creator: item.creator || (src === 'custom' ? '匿名用户' : '内置词条'),
    createdAt: item.createdAt || BUILTIN.RELEASE_DATE,
    updatedAt: item.updatedAt || item.createdAt || BUILTIN.RELEASE_DATE
  };
}

/**
 * 播种 / 合并内置词条。
 * @returns {{seeded:boolean, added:number, updated:number, removed:number, version:number}}
 */
function seedBuiltin() {
  const version = BUILTIN.VERSION;
  const stored = read(KEYS.builtin, null);

  // —— 情况 1：首次启动，整份写入
  if (!Array.isArray(stored) || stored.length === 0) {
    const snapshot = BUILTIN.ITEMS.map(function (it) {
      return normalize({
        id: it.id,
        abbr: it.abbr,
        full: it.full,
        zh: it.zh,
        category: it.category,
        source: 'builtin',
        creator: it.creator,
        createdAt: it.createdAt,
        updatedAt: it.updatedAt
      });
    });
    write(KEYS.builtin, snapshot);
    write(KEYS.meta, {
      version: version,
      seededAt: todayStr(),
      builtinCount: snapshot.length
    });
    return { seeded: true, added: snapshot.length, updated: 0, removed: 0, version: version };
  }

  // —— 情况 2：已播种过，只做增量合并
  const map = {};
  stored.forEach(function (it) {
    if (it && it.id) map[it.id] = clone(it);
  });

  let added = 0;
  let updated = 0;

  BUILTIN.ITEMS.forEach(function (b) {
    const old = map[b.id];
    if (!old) {
      // 内置新增词条
      map[b.id] = normalize({
        id: b.id,
        abbr: b.abbr,
        full: b.full,
        zh: b.zh,
        category: b.category,
        source: 'builtin',
        creator: b.creator,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt
      });
      added++;
      return;
    }
    // 已有：只覆盖内容字段，保留原有 id / 时间戳
    const changed =
      old.abbr !== b.abbr || old.full !== b.full || old.zh !== b.zh || old.category !== b.category;
    if (changed) {
      map[b.id] = Object.assign({}, old, {
        abbr: b.abbr,
        full: b.full,
        zh: b.zh,
        category: b.category,
        source: 'builtin'
      });
      updated++;
    }
  });

  // 内置里已删除的词条 → 从快照剔除（用户数据与收藏不受影响）
  const builtinIds = {};
  BUILTIN.ITEMS.forEach(function (b) { builtinIds[b.id] = true; });
  let removed = 0;
  Object.keys(map).forEach(function (id) {
    if (!builtinIds[id]) {
      delete map[id];
      removed++;
    }
  });

  const merged = Object.keys(map).map(function (id) { return map[id]; });
  write(KEYS.builtin, merged);

  const meta = read(KEYS.meta, {}) || {};
  write(KEYS.meta, {
    version: version,
    seededAt: meta.seededAt || todayStr(),
    builtinCount: merged.length,
    lastMergeAt: nowStamp()
  });

  return { seeded: false, added: added, updated: updated, removed: removed, version: version };
}

/** 首次启动调用；已初始化过则只做合并。 */
function init() {
  const info = seedBuiltin();
  warnUnknownFav();
  return info;
}

/**
 * 诊断：收藏列表里是否存在「对不上任何词条」的脏 id。
 *
 * 这类 id 会让收藏页看起来是空的、星星也点不亮（因为 query 按 id 取不到对应词条），
 * 但界面上不会有任何错误提示。典型来源是旧版本遗留的 id 规则变更。
 * 只做一次性只读提示，不删除数据 —— 万一词条是稍后才加载进来的，删了就真没了。
 */
function warnUnknownFav() {
  try {
    const favIds = getFavIds();
    if (!favIds.length) return 0;
    const known = {};
    getAll().forEach(function (it) {
      if (it && it.id) known[it.id] = true;
    });
    const unknown = favIds.filter(function (id) { return !known[id]; });
    if (unknown.length) {
      console.warn(
        '[storage] 收藏列表里有 ' + unknown.length + ' 个 id 找不到对应词条，这些条目不会显示：' +
        unknown.join(', ')
      );
    }
    return unknown.length;
  } catch (e) {
    return 0;
  }
}

/** 供页面/测试用：返回对不上任何词条的收藏 id 列表 */
function getUnknownFavIds() {
  const favIds = getFavIds();
  if (!favIds.length) return [];
  const known = {};
  getAll().forEach(function (it) {
    if (it && it.id) known[it.id] = true;
  });
  return favIds.filter(function (id) { return !known[id]; });
}

/* ------------------------------------------------------------------ *
 * 读取
 * ------------------------------------------------------------------ */

function getBuiltinList() {
  const stored = read(KEYS.builtin, null);
  const list = Array.isArray(stored) && stored.length ? stored : BUILTIN.ITEMS;
  return list.map(normalize);
}

function getUserList() {
  const list = read(KEYS.user, []);
  if (!Array.isArray(list)) return [];
  return list.map(normalize);
}

/** 内置 + 用户，合并后的全量列表 */
function getAll() {
  return getBuiltinList().concat(getUserList());
}

/** 按 id 找一条（内置或自定义） */
function getById(id) {
  const all = getAll();
  for (let i = 0; i < all.length; i++) {
    if (all[i].id === id) return all[i];
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 用户自定义词条：增 / 改 / 删
 * ------------------------------------------------------------------ */

/**
 * 新增或更新一条自定义词条。
 * @param {{id?:string, abbr:string, full:string, zh:string, creator?:string}} payload
 * @returns {{ok:boolean, data?:object, err?:string}}
 */
function saveUser(payload) {
  const p = payload || {};
  const abbr = String(p.abbr || '').trim();
  const full = String(p.full || '').trim();
  const zh = String(p.zh || '').trim();
  // 创建者 = 用户填写的微信昵称；未授权 / 未填写 → 兜底文案
  const creator = String(p.creator || '').trim() || '匿名用户';

  if (!abbr) return { ok: false, err: 'empty_abbr' };
  if (!full) return { ok: false, err: 'empty_full' };
  if (!zh) return { ok: false, err: 'empty_zh' };

  const list = getUserList();
  const today = todayStr();

  // —— 更新
  if (p.id) {
    let index = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === p.id) { index = i; break; }
    }
    if (index < 0) return { ok: false, err: 'not_found' };
    const old = list[index];
    list[index] = Object.assign({}, old, {
      abbr: abbr,
      full: full,
      zh: zh,
      creator: creator,
      source: 'custom',
      updatedAt: today
    });
    write(KEYS.user, list);
    return { ok: true, data: list[index] };
  }

  // —— 新增
  const item = normalize({
    id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
    abbr: abbr,
    full: full,
    zh: zh,
    category: p.category || '自定义',
    source: 'custom',
    creator: creator,
    createdAt: today,
    updatedAt: today
  });
  list.unshift(item);
  write(KEYS.user, list);
  return { ok: true, data: item };
}

/**
 * 删除一条自定义词条（内置词条不可删除）。
 * @returns {{ok:boolean, err?:string}}
 */
function removeUser(id) {
  // 内置词条只读保护：命中内置 id 直接拒绝，不进入用户列表查找
  const builtinList = getBuiltinList();
  for (let i = 0; i < builtinList.length; i++) {
    if (builtinList[i].id === id) return { ok: false, err: 'builtin_protected' };
  }

  const list = getUserList();
  let index = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) { index = i; break; }
  }
  if (index < 0) return { ok: false, err: 'not_found' };
  if (list[index].source !== 'custom') return { ok: false, err: 'builtin_protected' };

  const removed = list.splice(index, 1)[0];
  write(KEYS.user, list);

  // 顺手清掉它的收藏状态，避免留下悬空 id
  if (isFav(id)) setFav(id, false);

  return { ok: true, data: removed };
}

/* ------------------------------------------------------------------ *
 * 收藏
 * ------------------------------------------------------------------ */

function getFavIds() {
  const ids = read(KEYS.fav, []);
  if (!Array.isArray(ids)) return [];
  return ids.filter(function (x) { return typeof x === 'string' && x; });
}

function isFav(id) {
  return getFavIds().indexOf(id) >= 0;
}

/** 把 id 规范成非空字符串；拿不到合法 id 返回 '' */
function normId(id) {
  if (typeof id === 'string') return id.trim();
  if (typeof id === 'number' && !isNaN(id)) return String(id);
  return '';
}

/**
 * 设置收藏状态；on 为 true 收藏，false 取消。
 *
 * @returns {boolean|null} 成功返回写入后的真实状态；**失败返回 null**。
 *
 * 为什么不能返回 !on 就完事：写失败时上层照样弹「已收藏」，用户看到 toast 成功、
 * 星星不变、收藏页空 —— 三个症状叠加，但代码里查不出任何错。
 * 所以这里做两件事：
 *   1. id 非法 / 环境无 storage → 直接 null，拒绝假装成功；
 *   2. 写完回读一次校验，不一致就重试，仍不一致返回 null。
 * 这样 toast 里说的「已收藏」一定是真的落盘了。
 */
function setFav(id, on) {
  const nid = normId(id);
  if (!nid) {
    console.warn('[storage] setFav: 词条 id 无效', id);
    return null;
  }

  const ids = getFavIds();
  const index = ids.indexOf(nid);
  if (on && index < 0) ids.push(nid);
  if (!on && index >= 0) ids.splice(index, 1);

  if (!write(KEYS.fav, ids)) return null;

  // 回读校验：Storage 可能静默丢弃写入（配额、模拟器限制、跨进程时序）
  if (isFav(nid) !== !!on) {
    console.warn('[storage] 收藏写入后回读不一致，重试一次：' + nid);
    if (!write(KEYS.fav, ids)) return null;
    if (isFav(nid) !== !!on) {
      console.warn('[storage] 收藏写入最终失败：' + nid);
      return null;
    }
  }
  return !!on;
}

/**
 * 切换收藏状态。
 * @returns {boolean|null} 切换后的真实状态；失败返回 null（不要当成 false 用）
 */
function toggleFav(id) {
  return setFav(id, !isFav(id));
}

/**
 * 只取收藏数量。
 * 首页只用这一个数字，走这条轻量路径即可 —— 不用为拿计数去拼 149 条的视图列表。
 */
function getFavCount() {
  return getFavIds().length;
}

/**
 * 首页统计区：已收录总数 / 分类数量 / 最近更新时间。
 * 全部取自真实数据（内置快照 + 自定义词条），不硬编码；
 * 新增 / 编辑 / 合并内置词条后，下次调用自动得到新值。
 * 日期为 YYYY-MM-DD（字符串比较即时间比较）。
 */
function getStats() {
  const all = getAll();
  const cats = {};
  let lastUpdated = '';
  all.forEach(function (it) {
    const c = String(it.category || '').trim();
    if (c) cats[c] = true;
    const u = String(it.updatedAt || '');
    if (u > lastUpdated) lastUpdated = u;
  });
  return {
    totalCount: all.length,
    categoryCount: Object.keys(cats).length,
    lastUpdated: lastUpdated
  };
}

/* ------------------------------------------------------------------ *
 * 查询：搜索 / 筛选 / 排序
 * ------------------------------------------------------------------ */

function matches(item, keyword) {
  if (!keyword) return true;
  const kw = keyword.toLowerCase();
  return (
    String(item.abbr || '').toLowerCase().indexOf(kw) >= 0 ||
    String(item.full || '').toLowerCase().indexOf(kw) >= 0 ||
    String(item.zh || '').toLowerCase().indexOf(kw) >= 0
  );
}

function sortList(list, by) {
  const arr = list.slice();
  if (by === 'time') {
    // 最近更新优先；同一天按创建时间 → 再按缩写
    arr.sort(function (a, b) {
      const ua = String(a.updatedAt || '') + ' ' + String(a.createdAt || '');
      const ub = String(b.updatedAt || '') + ' ' + String(b.createdAt || '');
      if (ua !== ub) return ua < ub ? 1 : -1;
      return String(a.abbr || '').toUpperCase() < String(b.abbr || '').toUpperCase() ? -1 : 1;
    });
    return arr;
  }
  // 默认按字母 A→Z
  arr.sort(function (a, b) {
    const x = String(a.abbr || '').toUpperCase();
    const y = String(b.abbr || '').toUpperCase();
    if (x !== y) return x < y ? -1 : 1;
    return String(a.full || '').localeCompare(String(b.full || ''));
  });
  return arr;
}

/**
 * 列表页主查询。
 * @param {{keyword?:string, onlyFav?:boolean, sortBy?:string}} options
 * @returns {{list:object[], total:number, favCount:number, builtinCount:number, customCount:number}}
 */
function query(options) {
  const opt = options || {};
  const keyword = String(opt.keyword || '').trim();
  const onlyFav = !!opt.onlyFav;
  const sortBy = opt.sortBy || 'letter';

  const all = getAll();
  const favIds = getFavIds();

  const builtinCount = all.filter(function (i) { return i.source === 'builtin'; }).length;
  const customCount = all.length - builtinCount;

  let list = all.filter(function (item) {
    if (onlyFav && favIds.indexOf(item.id) < 0) return false;
    return matches(item, keyword);
  });

  list = sortList(list, sortBy);

  // 附带展示用字段，WXML 里不做复杂计算
  const view = list.map(function (item) {
    const isCustom = item.source === 'custom';
    return Object.assign({}, item, {
      fav: favIds.indexOf(item.id) >= 0,
      sourceText: isCustom ? '自定义' : '内置',
      sourceClass: isCustom ? 'badge-custom' : 'badge-builtin',
      footText:
        isCustom
          ? (item.creator || '匿名用户') + ' · ' + item.updatedAt
          : (item.creator || '内置词条')
    });
  });

  return {
    list: view,
    total: view.length,
    favCount: favIds.length,
    builtinCount: builtinCount,
    customCount: customCount
  };
}

/** 收藏页：只取收藏的词条 */
function queryFav(sortBy) {
  const res = query({ keyword: '', onlyFav: true, sortBy: sortBy || 'letter' });
  return res;
}

module.exports = {
  KEYS: KEYS,
  init: init,
  seedBuiltin: seedBuiltin,
  getAll: getAll,
  getBuiltinList: getBuiltinList,
  getUserList: getUserList,
  getById: getById,
  saveUser: saveUser,
  removeUser: removeUser,
  getFavIds: getFavIds,
  isFav: isFav,
  setFav: setFav,
  toggleFav: toggleFav,
  getUnknownFavIds: getUnknownFavIds,
  getFavCount: getFavCount,
  getStats: getStats,
  query: query,
  queryFav: queryFav,
  todayStr: todayStr
};
