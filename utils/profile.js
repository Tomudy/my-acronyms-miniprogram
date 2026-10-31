/**
 * 创建者身份：微信昵称
 *
 * ⚠️ 平台限制（必须知道）：
 *   微信自 2022-10-25 起回收了 wx.getUserProfile / wx.getUserInfo 的真实数据，
 *   基础库 2.27.1+ 调用这两个接口只返回匿名数据 —— **无法静默获取当前登录用户的昵称**。
 *   官方唯一合规途径是「头像昵称填写能力」：页面里放 <input type="nickname">，
 *   用户点一下输入框，微信弹出面板填入自己的昵称，开发者从 bindinput 取值。
 *
 * 本模块只负责缓存：把用户上次填过的昵称存在本地（ma_profile_v1），
 * 这样下次新增词条时能自动带出，不必每次都点一下。
 * 存的是昵称明文，不含 openid / 手机号等标识（平台也不给）。
 *
 * 注意：本地缓存，换设备不通用 —— 新设备上首次新增仍需要用户点一下输入框。
 */

const KEY = 'ma_profile_v1';

function read() {
  try {
    if (typeof wx === 'undefined' || !wx || typeof wx.getStorageSync !== 'function') return {};
    const v = wx.getStorageSync(KEY);
    if (!v || typeof v !== 'object') return {};
    return v;
  } catch (e) {
    return {};
  }
}

function write(obj) {
  try {
    if (typeof wx === 'undefined' || !wx || typeof wx.setStorageSync !== 'function') return false;
    wx.setStorageSync(KEY, obj);
    return true;
  } catch (e) {
    return false;
  }
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** 上次填过的微信昵称；没有则为空字符串（由展示层决定兜底文案） */
function getNickname() {
  const p = read();
  return typeof p.nickname === 'string' ? p.nickname : '';
}

/** 记住昵称，供下次新增自动带出。空值不写入，避免覆盖已有缓存 */
function setNickname(nickname) {
  const nick = String(nickname || '').trim();
  if (!nick) return false;
  write({ nickname: nick, updatedAt: todayStr() });
  return true;
}

module.exports = {
  KEY: KEY,
  getNickname: getNickname,
  setNickname: setNickname
};
