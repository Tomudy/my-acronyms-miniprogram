const store = require('../../utils/storage.js');
const nav = require('../../utils/nav.js');
const profile = require('../../utils/profile.js');

/** 行业选项：内置字典 + 「通用」兜底，chip 形式展示，不依赖原生 picker */
function industryOptions() {
  return (store.INDUSTRIES || []).map(function (d) {
    return { key: d.key, name: d.name };
  });
}

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
    // 行业 / 场景：一对多的关键字段，唯一键是 (缩写, 行业)
    industry: 'general',
    industryName: '通用',
    industryOptions: [],
    // 说明与来源（可选）
    note: '',
    sourceRef: '',
    // 同一个缩写的其他含义（查看模式展示）
    others: [],
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
    this.setData({ mode: mode, id: id, industryOptions: industryOptions() });

    if (mode === 'add') {
      // 新增：创建者优先用本机缓存的微信昵称（没有则留空，由 placeholder 引导填写），
      // 时间由保存时自动写入。
      // 注：微信已回收 getUserProfile/getUserInfo，无法静默读取昵称，
      // 只能靠 <input type="nickname"> 让用户点一下填入。
      this.setData({
        navTitle: '新增词条',
        creator: profile.getNickname(),
        // 新增默认「通用」，用户可以换成其他行业；同一个缩写换个行业就能再存一条含义
        industry: 'general',
        industryName: store.industryName('general'),
        note: '',
        sourceRef: '',
        others: [],
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
      industry: item.industry,
      industryName: store.industryName(item.industry),
      note: item.note || '',
      sourceRef: item.sourceRef || '',
      // 同一个缩写还有哪些行业的含义 —— 让用户知道眼前只是其中一种
      others: store.getMeanings(item.abbr, item.id).map(function (o) {
        return {
          id: o.id,
          full: o.full,
          zh: o.zh,
          industry: o.industry,
          industryText: store.industryName(o.industry),
          sourceText: o.source === 'custom' ? '自定义' : '内置'
        };
      }),
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
      creator: String(this.data.creator || '').trim(),
      industry: String(this.data.industry || '').trim(),
      note: String(this.data.note || '').trim(),
      sourceRef: String(this.data.sourceRef || '').trim()
    };
  },

  /** 表单是否有未保存的修改 */
  isDirty() {
    const cur = this.snapshot();
    const old = this._initial || {
      abbr: '', full: '', zh: '', creator: '',
      industry: 'general', note: '', sourceRef: ''
    };
    return (
      cur.abbr !== old.abbr ||
      cur.full !== old.full ||
      cur.zh !== old.zh ||
      cur.creator !== old.creator ||
      cur.industry !== old.industry ||
      cur.note !== old.note ||
      cur.sourceRef !== old.sourceRef
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

  /** 选行业：同一缩写换一个行业就可以存另一条含义 */
  onIndustryPick(e) {
    if (!this.data.canEdit) return;
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.industry) return;
    this.setData({ industry: key, industryName: store.industryName(key) });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  onRefInput(e) {
    this.setData({ sourceRef: e.detail.value });
  },

  /** 查看同一个缩写的另一个含义 */
  onOtherTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id + '&mode=view' });
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
      creator: creator,
      industry: this.data.industry,
      note: this.data.note,
      sourceRef: this.data.sourceRef
    });

    if (!res.ok) {
      // 「同缩写 + 同行业已存在」要说清楚是哪一条、什么行业，让用户决定是改还是换行业
      if (res.err === 'dup_industry') {
        const c = res.conflict || {};
        wx.showModal({
          title: '已经有一条相同含义',
          content:
            '「' + abbr + '」在「' + (c.industryName || '该行业') + '」下已有：' +
            (c.full || '') + (c.zh ? '（' + c.zh + '）' : '') +
            '\n\n要换个行业再存，还是去编辑那一条？',
          confirmText: '换个行业',
          cancelText: '知道了',
          showCancel: true
        });
        return;
      }
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
