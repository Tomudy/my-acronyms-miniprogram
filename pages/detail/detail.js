const store = require('../../utils/storage.js');
const nav = require('../../utils/nav.js');
const profile = require('../../utils/profile.js');

Page({
  data: {
    // add | view | edit
    mode: 'add',
    id: '',
    abbr: '',
    full: '',
    zh: '',
    creator: '',
    createdAt: '',
    updatedAt: '',
    category: '',
    // 内置词条 → 只读；自定义词条 → 可增删改
    isBuiltin: true,
    canEdit: false,
    isNew: true,
    fav: false,
    navTitle: '新增词条',
    sourceText: '自定义',
    sourceClass: 'badge-custom'
  },

  onLoad(options) {
    const mode = options && options.mode ? options.mode : 'view';
    const id = options && options.id ? options.id : '';
    this.setData({ mode: mode, id: id });

    if (mode === 'add') {
      // 新增：创建者优先用本机缓存的微信昵称（没有则留空，由 placeholder 引导填写），
      // 时间由保存时自动写入。
      // 注：微信已回收 getUserProfile/getUserInfo，无法静默读取昵称，
      // 只能靠 <input type="nickname"> 让用户点一下填入。
      this.setData({
        navTitle: '新增词条',
        creator: profile.getNickname(),
        isNew: true,
        canEdit: true,
        isBuiltin: false,
        sourceText: '自定义',
        sourceClass: 'badge-custom'
      });
      wx.setNavigationBarTitle({ title: '新增词条' });
      this._initial = this.snapshot();
      return;
    }

    // 查看 / 编辑：从存储读取
    const item = store.getById(id);
    if (!item) {
      wx.showToast({ title: '词条不存在或已删除', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    const isBuiltin = item.source === 'builtin';
    this.setData({
      navTitle: item.abbr,
      id: item.id,
      abbr: item.abbr,
      full: item.full,
      zh: item.zh,
      creator: item.creator,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      category: item.category,
      isBuiltin: isBuiltin,
      canEdit: !isBuiltin,
      isNew: false,
      fav: store.isFav(item.id),
      sourceText: isBuiltin ? '内置' : '自定义',
      sourceClass: isBuiltin ? 'badge-builtin' : 'badge-custom'
    });
    wx.setNavigationBarTitle({ title: item.abbr });
    this._initial = this.snapshot();
  },

  /* ---------------- 取消 / 返回 ---------------- */

  /** 当前表单快照（用于脏数据比较） */
  snapshot() {
    return {
      abbr: String(this.data.abbr || '').trim(),
      full: String(this.data.full || '').trim(),
      zh: String(this.data.zh || '').trim(),
      creator: String(this.data.creator || '').trim()
    };
  },

  /** 表单是否有未保存的修改 */
  isDirty() {
    const cur = this.snapshot();
    const old = this._initial || { abbr: '', full: '', zh: '', creator: '' };
    return (
      cur.abbr !== old.abbr ||
      cur.full !== old.full ||
      cur.zh !== old.zh ||
      cur.creator !== old.creator
    );
  },

  /** 顶部「取消」：有未保存输入时先确认再放弃 */
  onCancel() {
    if (!this.data.canEdit || !this.isDirty()) {
      nav.back();
      return;
    }
    wx.showModal({
      title: '放弃编辑',
      content: '已填写的内容尚未保存，确定放弃吗？',
      confirmText: '放弃',
      confirmColor: '#B4483C',
      cancelText: '继续编辑',
      success: (res) => {
        if (res.confirm) nav.back();
      }
    });
  },

  /* ---------------- 表单输入 ---------------- */

  onAbbrInput(e) {
    this.setData({ abbr: e.detail.value });
  },
  onFullInput(e) {
    this.setData({ full: e.detail.value });
  },
  onZhInput(e) {
    this.setData({ zh: e.detail.value });
  },
  onCreatorInput(e) {
    this.setData({ creator: e.detail.value });
  },

  /* ---------------- 操作 ---------------- */

  onSave() {
    if (!this.data.canEdit) {
      wx.showToast({ title: '内置词条不可编辑', icon: 'none' });
      return;
    }

    const abbr = String(this.data.abbr || '').trim();
    const full = String(this.data.full || '').trim();
    const zh = String(this.data.zh || '').trim();

    if (!abbr) { wx.showToast({ title: '请填写缩写', icon: 'none' }); return; }
    if (!full) { wx.showToast({ title: '请填写英文原词', icon: 'none' }); return; }
    if (!zh) { wx.showToast({ title: '请填写中文释义', icon: 'none' }); return; }

    // 创建者：用户填写的微信昵称；留空则由 storage 兜底为「匿名用户」
    const creator = String(this.data.creator || '').trim();

    const res = store.saveUser({
      id: this.data.isNew ? '' : this.data.id,
      abbr: abbr,
      full: full,
      zh: zh,
      creator: creator
    });

    if (!res.ok) {
      const msg = res.err === 'not_found' ? '词条不存在或已删除' : '保存失败，请重试';
      wx.showToast({ title: msg, icon: 'none' });
      return;
    }

    // 记住这次用的昵称，下次新增自动带出（空值不覆盖已有缓存）
    if (creator) profile.setNickname(creator);

    wx.showToast({ title: this.data.isNew ? '已添加' : '已保存', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 600);
  },

  onDelete() {
    if (!this.data.canEdit) {
      wx.showToast({ title: '内置词条不可删除', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除词条',
      content: '确定删除「' + this.data.abbr + '」吗？删除后不可恢复。',
      confirmText: '删除',
      confirmColor: '#E04343',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm) return;
        const del = store.removeUser(this.data.id);
        if (!del.ok) {
          wx.showToast({ title: '删除失败：内置词条不可删除', icon: 'none' });
          return;
        }
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 600);
      }
    });
  },

  onToggleFav() {
    // toggleFav 返回 null = 没写进去，此时不能更新按钮状态，也不要谎称成功
    const now = store.toggleFav(this.data.id);
    if (now === null) {
      console.warn('[My Acronym] 详情页收藏失败', { id: this.data.id });
      wx.showToast({
        title: '操作失败：本地存储写入异常',
        icon: 'none',
        duration: 1800
      });
      return;
    }
    this.setData({ fav: now });
    wx.showToast({ title: now ? '已收藏' : '已取消收藏', icon: 'none', duration: 1200 });
  }
});
