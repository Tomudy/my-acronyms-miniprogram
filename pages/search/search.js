const store = require('../../utils/storage.js');
const itemId = require('../../utils/item-id.js');

/** 收藏失败的两种情形要分清楚：取不到 id ≠ 写入失败，排查时指向完全不同 */
function favFailToast(id) {
  wx.showToast({
    title: id ? '收藏失败：本地存储写入异常' : '收藏失败：未取到词条标识',
    icon: 'none',
    duration: 1800
  });
}

/**
 * 搜索结果页
 *
 * 首页只留「收藏计数 + 搜索入口 + ＋ 新增」，词条列表全部搬到这里。
 * 关键词为空时展示全部词条（相当于「浏览全部」），所以词典功能并没有丢。
 */
Page({
  data: {
    keyword: '',
    sortBy: 'letter',
    autoFocus: true,
    scrollTop: 0,
    list: [],
    total: 0,
    favCount: 0,
    // 空状态：'' 有结果 / search 搜索无结果 / none 无数据
    emptyType: '',
    emptyTitle: '',
    emptyDesc: '',
    emptyGlyph: '?',
    emptyAction: ''
  },

  onLoad(query) {
    // 双保险：即使 App.onLaunch 没跑到，这里也会补一次初始化
    store.init();
    const kw = (query && query.keyword) || '';
    this.setData({ keyword: kw });
    this.refresh(kw);
  },

  onShow() {
    // 从详情页返回时刷新，保证编辑/收藏/删除立刻生效
    this.refresh();
  },

  /** 重新读取数据并刷新视图 */
  refresh(keywordOverride) {
    const keyword =
      keywordOverride !== undefined ? keywordOverride : this.data.keyword;
    const res = store.query({
      keyword: keyword,
      onlyFav: false,
      sortBy: this.data.sortBy
    });

    const empty = this.buildEmptyState(res.list.length, keyword);

    this.setData({
      list: res.list,
      total: res.total,
      favCount: res.favCount,
      emptyType: empty.type,
      emptyTitle: empty.title,
      emptyDesc: empty.desc,
      emptyGlyph: empty.glyph,
      emptyAction: empty.action
    });
  },

  /** 根据「有无结果 + 有无关键词」决定空状态文案 */
  buildEmptyState(count, keyword) {
    if (count > 0) {
      return { type: '', title: '', desc: '', glyph: '?', action: '' };
    }
    if (keyword) {
      return {
        type: 'search',
        title: '没有找到匹配的词条',
        desc: '换个关键词试试，缩写 / 英文原词 / 中文释义都能搜',
        glyph: '?',
        action: '清除搜索'
      };
    }
    return {
      type: 'none',
      title: '暂无词条',
      desc: '回首页点右下角 ＋ 添加一条自己的缩写',
      glyph: '＋',
      action: '新增词条'
    };
  },

  /* ---------------- 交互 ---------------- */

  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({ keyword: keyword });
    this.refresh(keyword);
    this.scrollToTop();
  },

  onClearSearch() {
    this.setData({ keyword: '' });
    this.refresh('');
    this.scrollToTop();
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
    // toggleFav 返回 null 代表「没写进去」，这时绝不能按成功处理
    const now = store.toggleFav(id);
    if (now === null) {
      console.warn('[My Acronym] 收藏失败', { id: id, dataset: ds });
      favFailToast(id);
      return;
    }
    this.refresh();
    wx.showToast({
      title: now ? '已收藏' : '已取消收藏',
      icon: 'none',
      duration: 1200
    });
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/detail/detail?id=' + id + '&mode=view'
    });
  },

  onAdd() {
    wx.navigateTo({ url: '/pages/detail/detail?mode=add' });
  },

  onBack() {
    wx.navigateBack();
  },

  onEmptyAction() {
    if (this.data.emptyType === 'search') {
      this.onClearSearch();
    } else {
      this.onAdd();
    }
  },

  /** 搜索时把列表滚回顶部 */
  scrollToTop() {
    this.setData({ scrollTop: 999999 });
    setTimeout(() => {
      this.setData({ scrollTop: 0 });
    }, 0);
  }
});
