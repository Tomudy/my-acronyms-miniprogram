const store = require('./utils/storage.js');

App({
  globalData: {
    // 存储是否已完成初始化
    storeReady: false,
    // 最近一次内置数据播种/合并的结果
    mergeInfo: null
  },

  onLaunch() {
    try {
      // 首次启动：播种内置词条；已初始化过：只做增量合并
      const info = store.init();
      this.globalData.storeReady = true;
      this.globalData.mergeInfo = info;
      if (info.seeded) {
        console.log('[My Acronym] 首次启动，已写入内置词条 ' + info.added + ' 条');
      } else if (info.added || info.updated || info.removed) {
        console.log('[My Acronym] 内置词条已合并更新：新增 ' + info.added +
          '，更新 ' + info.updated + '，移除 ' + info.removed);
      }
    } catch (e) {
      console.error('[My Acronym] 存储初始化失败：', e);
    }
  },

  onShow() {
    // 从后台回到前台时，确保存储处于可用状态
    if (!this.globalData.storeReady) {
      try {
        store.init();
        this.globalData.storeReady = true;
      } catch (e) {
        console.error('[My Acronym] 存储初始化失败：', e);
      }
    }
  }
});
