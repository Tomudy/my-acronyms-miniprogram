/**
 * 页面退出路径的工具封装。
 *
 * 为什么不直接 wx.navigateBack()：
 *   - tabBar 页（如收藏页）从底部 tab 直接进入时没有上级页面，navigateBack 无效；
 *   - 预览页通过 #/pages/... 深链直达某页时，页面栈里也可能只有它自己。
 * 所以统一走 back()：有上级就返回上一页，没有就切回首页 tab。
 */

function back(fallbackUrl) {
  let pages = [];
  try {
    if (typeof getCurrentPages === 'function') {
      pages = getCurrentPages() || [];
    }
  } catch (e) {
    pages = [];
  }
  if (pages.length > 1) {
    wx.navigateBack();
    return;
  }
  wx.switchTab({ url: fallbackUrl || '/pages/index/index' });
}

module.exports = {
  back: back
};
