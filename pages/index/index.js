const store = require('../../utils/storage.js');

/**
 * 首页
 *
 * 极简 + 商务风：不展示任何词条列表或搜索结果。
 * 顶部搜索入口（跳 pages/search），搜索框正下方一排统计小卡片
 * （总数 / 分类数 / 最近更新，全部取自真实存储数据），
 * 中部为收藏计数，右下角 ＋ 新增。
 * 所有数字在 onShow 里刷新 —— 从搜索页 / 详情页收藏、新增或删除后返回，立刻跟着变。
 */
Page({
  data: {
    favCount: 0,
    hasFav: false,
    stats: {
      totalCount: 0,
      categoryCount: 0,
      lastUpdated: ''
    }
  },

  onLoad() {
    // 双保险：即使 App.onLaunch 没跑到，这里也会补一次初始化
    store.init();
    this.refresh();
  },

  onShow() {
    this.refresh();
  },

  /** 收藏计数 + 统计区数据，都走真实数据源 */
  refresh() {
    const favCount = store.getFavCount();
    this.setData({
      favCount: favCount,
      hasFav: favCount > 0,
      stats: store.getStats()
    });
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/detail/detail?mode=add' });
  }
});
