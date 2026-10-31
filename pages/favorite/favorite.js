const store = require('../../utils/storage.js');
const nav = require('../../utils/nav.js');
const itemId = require('../../utils/item-id.js');

Page({
  data: {
    sortBy: 'letter',
    list: [],
    total: 0,
    emptyTitle: '',
    emptyDesc: '',
    emptyGlyph: '☆'
  },

  onLoad() {
    store.init();
    this.refresh();
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const res = store.queryFav(this.data.sortBy);
    const empty = res.list.length === 0;
    this.setData({
      list: res.list,
      total: res.total,
      emptyTitle: empty ? '还没有收藏任何词条' : '',
      emptyDesc: empty
        ? '搜索到想要的缩写后点一下 ☆，它就会出现在这里'
        : '',
      emptyGlyph: '☆'
    });
  },

  onSort(e) {
    const by = e.currentTarget.dataset.by;
    if (!by || by === this.data.sortBy) return;
    this.setData({ sortBy: by });
    this.refresh();
  },

  onToggleFav(e) {
    const ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    const id = itemId.resolveId(this.data.list, ds);
    // null = 没写进去；此时既不要弹「已取消」，也不要把条目从列表里去掉
    if (store.setFav(id, false) === null) {
      console.warn('[My Acronym] 取消收藏失败', { id: id, dataset: ds });
      wx.showToast({
        title: id ? '取消失败：本地存储写入异常' : '取消失败：未取到词条标识',
        icon: 'none',
        duration: 1800
      });
      return;
    }
    this.refresh();
    wx.showToast({ title: '已取消收藏', icon: 'none', duration: 1200 });
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/detail/detail?id=' + id + '&mode=view'
    });
  },

  onGoSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  /** 左上角返回：从详情页等返回本页时有上级；从底部 tab 直接进入时切回首页 */
  onBack() {
    nav.back();
  }
});
