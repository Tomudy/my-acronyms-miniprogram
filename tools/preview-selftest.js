/* ==========================================================================
 * My Acronym —— 预览端到端自检
 *
 * 只有当地址栏带 #selftest 时才运行。在真实 DOM 上模拟用户操作，
 * 验证「WXML → DOM → 真实页面 JS → 真实 storage」这条链路是否通。
 *
 * 全同步执行：路由与事件分发都是同步的，渲染用 window.__previewFlush() 强制刷，
 * 不依赖任何定时器轮询（Edge headless 的虚拟时间模式下，定时器轮询会挂死浏览器）。
 *
 * 结果写进页面底部的 <pre id="selftest-result">，并同步到 document.title。
 * ========================================================================== */
(function () {
  if ((location.hash || '').indexOf('selftest') < 0) return;

  /* —— 在任何东西启动之前先把存储清干净（本脚本在 runtime 之后、
        DOMContentLoaded 之前执行，此时 boot() 还没跑） —— */
  ['ma_builtin_v1', 'ma_user_v1', 'ma_fav_v1', 'ma_meta_v1', 'ma_profile_v1'].forEach(function (k) {
    localStorage.removeItem(k);
  });

  var log = [];
  function check(name, cond, extra) {
    log.push((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? '   [' + extra + ']' : ''));
  }

  /* 每次交互后同步刷新渲染，等价于小程序 setData 后的界面更新 */
  function flush() { if (window.__previewFlush) window.__previewFlush(); }
  function q(sel) { return document.querySelector(sel); }
  function qa(sel) { return document.querySelectorAll(sel); }
  function cards() { return qa('.card-item').length; }
  function text(sel) { var el = q(sel); return el ? el.textContent.trim() : ''; }
  function setInput(el, value) {
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    flush();
  }
  function click(sel) {
    var el = typeof sel === 'string' ? q(sel) : sel;
    if (!el) return false;
    el.click();
    flush();
    return true;
  }
  /* 按缩写定位卡片：'MY' 这种关键词会子串命中多条，不能默认点第一张 */
  function cardByAbbr(abbr) {
    var list = qa('.card-item');
    for (var i = 0; i < list.length; i++) {
      var a = list[i].querySelector('.abbr');
      if (a && a.textContent.trim() === abbr) return list[i];
    }
    return null;
  }
  function back() {
    if (window.__previewRouter) window.__previewRouter.back();
    flush();
  }
  function favIds() {
    try { return JSON.parse(localStorage.getItem('ma_fav_v1') || '[]'); } catch (e) { return []; }
  }
  function userList() {
    try { return JSON.parse(localStorage.getItem('ma_user_v1') || '[]'); } catch (e) { return []; }
  }

  function scenario() {
    flush();

    /* ========== 1. 首页：统计展示区 + 收藏计数 ========== */
    check('首屏不渲染任何词条卡片', cards() === 0, '实际 ' + cards());
    check('首屏不渲染列表容器', !q('.list-wrap') && !q('.list'));
    check('0 时显示收藏空状态', text('.stat-empty') === '还没有收藏缩写', text('.stat-empty'));

    /* 统计展示区（搜索框正下方，真实数据源） */
    var snums = qa('.stat-card-num');
    var slabels = qa('.stat-card-label');
    check('统计区渲染 3 张卡片', qa('.stat-card').length === 3, '实际 ' + qa('.stat-card').length);
    check('统计区：已收录缩写总数 = 149', text('.stat-card-num') === '149', text('.stat-card-num'));
    check('统计区：分类数量 = 3', snums.length > 1 && snums[1].textContent === '3',
      snums.length > 1 ? snums[1].textContent : '(无)');
    check('统计区：最近更新为 YYYY-MM-DD',
      snums.length > 2 && /^\d{4}-\d{2}-\d{2}$/.test(snums[2].textContent),
      snums.length > 2 ? snums[2].textContent : '(无)');
    check('统计区：三项标签齐全',
      slabels.length === 3 && slabels[0].textContent === '已收录缩写' &&
      slabels[1].textContent === '分类数量' && slabels[2].textContent === '最近更新',
      slabels.length + ' 个标签');

    /* 点搜索框进搜索页 */
    click('.search-box');
    check('点搜索框进入搜索页', !!q('.search-input'), '当前页 ' + text('#nav-title'));
    check('搜索页展示全部词条', cards() === 149, '实际 ' + cards());

    /* 在搜索页收藏一条，返回首页看计数 */
    check('收藏按钮同时带 data-id 和 data-index 兜底',
      q('.card-item .fav') && q('.card-item .fav').dataset.id && q('.card-item .fav').dataset.index !== undefined,
      JSON.stringify(q('.card-item .fav') ? Object.assign({}, q('.card-item .fav').dataset) : null));
    click('.card-item .fav');
    check('搜索页点 ☆ 写入收藏', favIds().length === 1, 'ma_fav_v1 = ' + favIds().length);
    check('星星变为实心', text('.card-item .fav-star') === '★', text('.card-item .fav-star'));
    back();
    check('返回首页后计数为 1', text('.stat-num') === '1', text('.stat-num'));
    check('计数文案为「已收藏 1 个缩写」',
      text('.stat-line').replace(/\s+/g, '') === '已收藏1个缩写',
      text('.stat-line'));
    check('非 0 时不显示空状态', !q('.stat-empty'));

    /* 再收藏一条 → 计数变 2；取消 → 回到 0 空状态 */
    click('.search-box');
    var stars = qa('.card-item .fav');
    stars[1].click();
    flush();
    back();
    check('再收藏一条后计数为 2', text('.stat-num') === '2', text('.stat-num'));
    click('.search-box');
    qa('.card-item .fav')[0].click();
    flush();
    qa('.card-item .fav')[1].click();
    flush();
    back();
    // 0 时数字节点不渲染（改显示空状态），所以看存储 + 节点是否存在
    check('全部取消后收藏存储清空', favIds().length === 0, 'ma_fav_v1 = ' + favIds().length);
    check('全部取消后不再显示数字', !q('.stat-num'), text('.stat-num') || '(无，符合预期)');
    check('回到 0 时重新显示空状态', text('.stat-empty') === '还没有收藏缩写', text('.stat-empty'));

    /* ========== 2. 搜索页：搜索 / 排序 / 收藏 ========== */
    click('.search-box');
    var input = q('.search-input');
    setInput(input, 'api');
    check('搜索 "api" 后只剩 1 张卡片', cards() === 1, '实际 ' + cards());
    check('搜索结果为 API', text('.card-item .abbr') === 'API', text('.card-item .abbr'));

    setInput(input, '应用程序');
    check('按中文释义可搜到', cards() >= 1 && text('.card-item .abbr') === 'API',
      '命中 ' + cards() + ' 条，首条 ' + text('.card-item .abbr'));
    setInput(input, 'APPLICATION');
    check('按英文原词可搜到（大小写不敏感）', cards() >= 1, '实际 ' + cards());

    setInput(input, 'zzz-not-exist');
    check('无匹配时列表为空', cards() === 0, '实际 ' + cards());
    check('显示空状态文案', text('.empty-title') === '没有找到匹配的词条', text('.empty-title'));
    check('有关键词时显示清除按钮', !!q('.ico-clear'));
    click('.ico-clear');
    check('清除搜索后恢复 149 张卡片', cards() === 149, '实际 ' + cards());

    var sorts = qa('.sort');
    click(sorts[1]);
    check('切到「最近更新」排序', qa('.sort')[1].className.indexOf('sort-on') >= 0,
      qa('.sort')[1].className);
    click(qa('.sort')[0]);
    check('切回「A → Z」排序', qa('.sort')[0].className.indexOf('sort-on') >= 0);

    /* ========== 3. 详情页（内置只读） ========== */
    click('.card-item');
    check('点击卡片进入详情页', !!q('.hero-abbr'), text('.hero-abbr'));
    check('导航标题为词条缩写', text('#nav-title') === q('.hero-abbr').textContent.trim(),
      text('#nav-title'));
    check('内置词条字段为只读态', qa('.field-locked').length === 4,
      '只读字段 ' + qa('.field-locked').length + '/4');
    check('内置词条不渲染删除按钮', !q('.footer-del'));
    back();
    check('从详情页返回搜索页', !!q('.search-input'));

    /* ========== 4. 新增自定义词条 ========== */
    back();
    check('返回首页', !!q('.fab'));
    click('.fab');
    check('点击 ＋ 进入新增页', text('.hero-abbr') === '新词条', text('.hero-abbr'));

    /* 取消入口：空表单直接返回，不弹确认 */
    click('.nav-back');
    check('空表单点「取消」直接返回首页', !!q('.fab'), text('#nav-title'));

    /* 取消入口：有未保存输入时先弹放弃确认 */
    click('.fab');
    check('再次进入新增页', text('.hero-abbr') === '新词条', text('.hero-abbr'));
    setInput(qa('.field-input')[0], 'MY');
    click('.nav-back');
    check('有未保存输入时弹出放弃确认', !!q('.wx-modal-mask.show'));
    click('.wx-modal-cancel');
    // 留在新增页的判据：底部仍有「添加词条」按钮（注意此时大标题已变成输入的缩写）
    check('选择「继续编辑」留在新增页',
      text('.footer-save') === '添加词条' &&
      q('.wx-modal-mask').className.indexOf('show') < 0,
      '大标题=' + text('.hero-abbr') + '，按钮=' + text('.footer-save'));
    click('.nav-back');
    check('再次取消仍弹确认框', !!q('.wx-modal-mask.show'));
    click('.wx-modal-confirm');
    check('确认放弃后返回首页', !!q('.fab'), text('#nav-title'));
    check('确认后弹窗已关闭', q('.wx-modal-mask') && q('.wx-modal-mask').className.indexOf('show') < 0);

    /* 正常新增流程 */
    click('.fab');
    check('第三次进入新增页', text('.hero-abbr') === '新词条', text('.hero-abbr'));
    setInput(qa('.field-input')[0], 'MY');
    setInput(qa('.field-textarea')[0], 'My Acronym');
    setInput(qa('.field-textarea')[1], '我的缩写本');
    /* 创建者：微信昵称填写（第 2 个 field-input 是创建者输入框） */
    setInput(qa('.field-input')[1], '涛哥');
    click('.footer-save');

    var users = userList();
    check('自定义词条已写入存储', users.length === 1, 'ma_user_v1 = ' + users.length);
    check('缩写已保存', users.length === 1 && users[0].abbr === 'MY',
      users.length ? users[0].abbr : '');
    check('英文原词已保存', users.length === 1 && users[0].full === 'My Acronym');
    check('创建者保存为填写的微信昵称', users.length === 1 && users[0].creator === '涛哥',
      users.length ? users[0].creator : '(无)');
    check('创建时间为 YYYY-MM-DD',
      users.length === 1 && /^\d{4}-\d{2}-\d{2}$/.test(users[0].createdAt),
      users.length ? users[0].createdAt : '');

    /* ========== 5. 收藏 tab ========== */
    back();
    /* 新增词条后，首页统计区应实时更新（onShow 刷新） */
    check('新增后首页统计总数 = 150', text('.stat-card-num') === '150', text('.stat-card-num'));
    check('新增后分类数量 = 4', qa('.stat-card-num')[1].textContent === '4',
      qa('.stat-card-num')[1].textContent);
    click('.search-box');
    setInput(q('.search-input'), 'MY');
    var myCard = cardByAbbr('MY');
    check('能搜到刚新增的自定义词条', !!myCard,
      '命中 ' + cards() + ' 条，首条 ' + text('.card-item .abbr'));
    if (myCard) { myCard.querySelector('.fav').click(); flush(); }
    check('自定义词条可收藏', favIds().indexOf((userList()[0] || {}).id) >= 0,
      'ma_fav_v1 = ' + JSON.stringify(favIds()));
    back();

    var tabs = qa('.tab-item');
    if (tabs.length) {
      click(tabs[1]);
      check('收藏 tab 标题正确', text('#nav-title') === '我的收藏', text('#nav-title'));
      check('收藏 tab 展示收藏项', cards() === 1, '实际 ' + cards());
      click('.card-item .fav');
      check('取消收藏后收藏页为空', cards() === 0, '实际 ' + cards());
      check('显示收藏空状态', text('.empty-title') === '还没有收藏任何词条', text('.empty-title'));
      /* 返回入口：从 tabBar 直接进入（无上级）→ 安全切回首页 */
      check('收藏页左上角有「返回」入口', !!q('.nav-back'));
      click('.nav-back');
      check('无上级页面时点「返回」回到首页', !!q('.fab'), text('#nav-title'));
    }
  }

  function report() {
    var box = document.createElement('pre');
    box.id = 'selftest-result';
    box.textContent = log.join('\n');
    box.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;' +
      'background:#fff;color:#1f2329;font:12px/1.7 ui-monospace,Menlo,Consolas,monospace;' +
      'padding:16px;overflow:auto;white-space:pre-wrap';
    document.body.appendChild(box);
    var failed = log.filter(function (l) { return l.indexOf('FAIL') === 0; }).length;
    document.title = (failed ? 'SELFTEST FAILED ' : 'SELFTEST PASSED ') +
      (log.length - failed) + '/' + log.length;
  }

  document.addEventListener('DOMContentLoaded', function () {
    try {
      scenario();
    } catch (e) {
      log.push('FAIL  运行异常 — ' + (e && e.message ? e.message : e));
      if (e && e.stack) log.push(e.stack);
    }
    report();
  });
})();
