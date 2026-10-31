/**
 * 从事件里稳健地取词条 id。
 *
 * 为什么要单独抽一层：收藏按钮过去只依赖 `dataset.id`，
 * 一旦这个值取不到（不同基础库的 dataset 行为差异、事件被复用了旧节点等），
 * 页面会把 undefined 当 id 写进收藏列表 —— getFavIds 会过滤掉非字符串，
 * 结果就是：toast 说「已收藏」，星星不变，收藏页空。三个症状全是「静默失败」。
 *
 * 这里做两级兜底：
 *   1. data-id 能在当前列表里找到对应词条 → 用它（正常路径）；
 *   2. 找不到 → 用 data-index 回当前列表按位置取（列表是本 foremost 数据源）；
 *   3. 都不行 → 返回空字符串，由页面显式报错，而不是假装成功。
 *
 * @param {object[]} list 当前渲染用的列表
 * @param {object} dataset 事件的 currentTarget.dataset
 * @returns {string} 词条 id；取不到时返回 ''
 */
function resolveId(list, dataset) {
  const ds = dataset || {};
  const arr = Array.isArray(list) ? list : [];

  const raw = ds.id === undefined || ds.id === null ? '' : String(ds.id);
  if (raw) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].id === raw) return raw;
    }
  }

  const idx = Number(ds.index);
  if (ds.index !== undefined && ds.index !== '' && !isNaN(idx) && arr[idx] && arr[idx].id) {
    return String(arr[idx].id);
  }

  return raw;
}

module.exports = {
  resolveId: resolveId
};
