# My Acronym

常用英文缩写 / 简写速查小程序。原生微信小程序框架，不依赖任何第三方 UI 库，无需后端服务。

## 功能

| 需求 | 实现位置 |
| --- | --- |
| 149 条内置词条（IT 63 / 商务 38 / 日常 48），含缩写、英文原词、中文释义、来源 | `data/acronyms.js` |
| 自定义词条新增 / 编辑 / 删除，记录创建者与创建·修改时间（YYYY-MM-DD） | `pages/detail/detail.js` |
| 内置词条只读，UI 不渲染删除按钮，逻辑层二次拦截 | `utils/storage.js` `removeUser()` |
| 首页极简：只展示「已收藏 N 个缩写」计数（0 时为空状态），不显示任何列表 | `pages/index/index.js` |
| 顶部实时搜索（搜索结果页），缩写 / 英文原词 / 中文释义三字段匹配，不区分大小写 | `pages/search/search.js` `onSearchInput` |
| 收藏 / 取消收藏，A→Z 与按时间两种排序 | `utils/storage.js` `query()` |
| `wx.setStorageSync` / `wx.getStorageSync` 本地持久化，退出重进数据全保留 | `utils/storage.js` |

## 目录结构

```
my-acronym-miniprogram/
├── app.js                    # 小程序入口：启动时初始化存储（播种/合并内置词条）
├── app.json                  # 页面注册、窗口配置、tabBar（首页 / 收藏）
├── app.wxss                  # 全局样式与设计变量
├── project.config.json       # 项目配置（appid 需自行填写）
├── sitemap.json
├── data/
│   └── acronyms.js           # 内置词条数据源（含 VERSION 与 RELEASE_DATE）
├── utils/
│   └── storage.js            # 存储封装 + 查询/筛选/排序
├── pages/
│   ├── index/                # 首页：搜索入口 + 收藏计数（极简，无列表）
│   │   ├── index.js / .json / .wxml / .wxss
│   ├── search/               # 搜索结果页：实时搜索 + 排序 + 词条列表
│   │   ├── search.js / .json / .wxml / .wxss
│   ├── detail/               # 详情页：查看 / 新增 / 编辑 / 删除
│   │   ├── detail.js / .json / .wxml / .wxss
│   └── favorite/             # 收藏页：收藏列表 + 取消收藏
│       ├── favorite.js / .json / .wxml / .wxss
└── tests/                    # 纯 Node 自测（不参与小程序打包）
    ├── run.js                # 数据层：播种、合并、增删改查、收藏、持久化
    ├── pages.js              # 页面交互模拟：真实页面代码 + wx 桩
    └── lint.js               # 静态自检：语法 / JSON / 事件绑定 / 数据字段
```

## 运行

1. 用微信开发者工具「导入项目」，选择本目录。
2. **AppID 怎么填**：
   - `project.config.json` 里 `appid` 目前是空字符串 `""`，
     导入时会弹窗问「AppID 为空」，选 **「使用测试号」** 就能直接进项目，
     模拟器、预览二维码、真机调试都能用，不需要先去注册。
   - 想用自己的 AppID：微信公众平台 → 开发管理 → 开发设置 → AppID，
     复制后填进 `project.config.json` 的 `appid` 字段（工具里也可以直接改，
     会回写到 `project.private.config.json`）。
   - ⚠️ **不要填 `touristappid`（游客模式）**：只能模拟器预览，扫不了真机预览码。
   - ⚠️ **不能复用「小橙接龙」的 AppID** `wxc925c213bfde630e` ——
     一个小程序 AppID 只能对应一个小程序。
3. 编译即可运行，无需后端、无需网络。

自测（可选，需要 Node）：

```bash
node tests/run.js    # 数据层 58 项
node tests/lint.js   # 静态自检 98 项
node tests/pages.js  # 页面交互模拟 98 项
```

---

## 本地存储的键名设计

所有键统一 `ma_` 前缀 + `_v1` 版本后缀，**内置数据与用户数据分键存放，互不覆盖**：

| 键名 | 内容 | 说明 |
| --- | --- | --- |
| `ma_builtin_v1` | 内置词条快照（数组） | 首次启动整份写入；后续启动只做增量合并 |
| `ma_user_v1` | 用户自定义词条（数组） | 只存 `source: 'custom'` 的条目，内置词条绝不写进来 |
| `ma_fav_v1` | 收藏的词条 id 数组 | 内置与自定义词条共用一份收藏表 |
| `ma_meta_v1` | `{ version, seededAt, builtinCount, lastMergeAt }` | 记录内置数据版本与播种时间 |

**为什么要把收藏单独存一份？** 收藏是「用户状态」，而不是「词条内容」。
内置词条文案升级时需要覆盖内容，但绝不能把用户的收藏状态一起冲掉。
把 id 单独存一份，内容表怎么合并都影响不到它。

### 收藏：写失败必须看得见

`store.setFav(id, on)` / `store.toggleFav(id)` 的返回值约定：

| 返回值 | 含义 |
| --- | --- |
| `true` | 已收藏，**且回读校验通过** |
| `false` | 已取消收藏，**且回读校验通过** |
| `null` | 写失败（id 非法 / 环境无 Storage / 写入后回读不一致） |

页面据此决定提示文案：只有拿到 `true/false` 才会弹「已收藏 / 已取消收藏」，
拿到 `null` 会弹「收藏失败：未取到词条标识」或「收藏失败：本地存储写入异常」，
并在 Console 打出 `[storage]` / `[My Acronym]` 警告。

> 之所以要这么严：**写失败时如果还弹「已收藏」，用户看到的就是「提示成功、星星不变、
> 收藏页空」——三个症状全是静默失败，不靠日志根本查不出。**
> 现在 toast 说的每一句话都是真的。

另外，`utils/item-id.js` 负责从事件里取词条 id：优先 `data-id`，
取不到就用 `data-index` 回列表按位置取，两者都取不到才报错。
收藏按钮因此同时带 `data-id` 和 `data-index` 两个属性。

**为什么内置数据要落一份快照，而不是每次直接读 `data/acronyms.js`？**
快照让「内置数据」和「用户数据」处于同一种存储形态，合并逻辑才能统一处理；
同时内置词条一旦被用户「另存为自定义」，两边互不影响。

### 单条词条的数据结构

```js
{
  id: 'b_api',                  // 内置：'b_' + 缩写 slug；自定义：'c_' + 时间戳随机串
  abbr: 'API',
  full: 'Application Programming Interface',
  zh: '应用程序编程接口',
  category: 'IT',              // 内置分类 / 自定义固定为「自定义」
  source: 'builtin',           // 'builtin' 内置（只读） | 'custom' 自定义（可增删改）
  creator: '内置词条',          // 自定义词条默认「我」，可改
  createdAt: '2026-01-01',     // YYYY-MM-DD
  updatedAt: '2026-01-01'      // YYYY-MM-DD，编辑时刷新，createdAt 不变
}
```

---

## 内置 / 用户数据的合并逻辑

入口：`store.init()` → `store.seedBuiltin()`，在 `App.onLaunch` 和每个列表页 `onLoad` 中都会调用一次。

### 情况一：首次启动（`ma_builtin_v1` 不存在或为空）

整份内置数据写入 `ma_builtin_v1`，同时记录 `ma_meta_v1`。
用户数据与收藏此时为空，不做任何事。

### 情况二：已初始化过（`ma_builtin_v1` 已有数据）

**只做增量合并，不整份覆盖**，逐条按 id 比对：

| 差异 | 处理 |
| --- | --- |
| 内置有、存储没有（新增词条） | 追加进 `ma_builtin_v1` |
| 两侧都有，但文案变了（`abbr`/`full`/`zh`/`category`） | 用内置的新文案覆盖该条，**保留原 id 与时间戳** |
| 存储有、内置已删除 | 从快照中剔除 |
| 两侧完全一致 | 原样保留 |

**三条红线：**

1. `ma_user_v1` 完全不参与合并 —— 用户自己建的词条永远不会被内置数据覆盖或删除。
2. `ma_fav_v1` 完全不参与合并 —— 收藏状态不受内置数据升级影响。
3. 合并只覆盖**内容字段**，不覆盖 `id` / `createdAt` / `updatedAt` —— 词条 id 稳定，
   收藏和编辑记录才不会错位。

### 后续新增内置词条的操作

只需改 `data/acronyms.js`：加一行数据、把 `VERSION` 加一。
下次启动 `seedBuiltin()` 会自动把新词条合并进已有快照，**用户数据和收藏原样保留**。

### 数据流总览

```
App.onLaunch
      │
      ▼
 store.init() ──► seedBuiltin()
      │                ├─ 首次？整份写入 ma_builtin_v1
      │                └─ 已存在？按 id 增量合并 ma_builtin_v1
      │                        （不碰 ma_user_v1 / ma_fav_v1）
      ▼
 store.query({keyword, onlyFav, sortBy})
      │            ├─ getBuiltinList()  ← ma_builtin_v1
      │            ├─ getUserList()     ← ma_user_v1
      │            └─ getFavIds()       ← ma_fav_v1
      ▼
   搜索页 / 收藏页渲染（首页只读 getFavCount() 取计数）
```

## 界面说明

- **首页**：极简，不展示任何词条列表 —— 顶部搜索入口（点击进搜索页）、
  搜索框正下方一排统计小卡片（已收录缩写总数 / 分类数量 / 最近更新时间，
  全部取自真实存储 `store.getStats()`，无硬编码）、
  居中的「已收藏 N 个缩写」计数（0 时显示「还没有收藏缩写」空状态）、
  右下角 ＋ 新增按钮。计数与统计都在 `onShow` 刷新，数据变化后返回立即更新。
- **搜索结果页**：顶部搜索框（输入即过滤，进入时自动聚焦）+ 取消 + A→Z / 最近更新排序；
  卡片展示缩写、英文原词、中文释义、来源徽章；右侧 ☆ 点一下收藏。
  关键词为空时展示全部词条（相当于「浏览全部」）；
  空状态分两种：搜索无结果、暂无数据，各配对应操作按钮。
- **详情页**：同一个页面承载「查看 / 新增 / 编辑」。
  内置词条输入框全部置灰并显示只读提示，底部只有收藏按钮；
  自定义词条可改四个字段，底部是「删除 / 保存修改」。
- **收藏页**：只显示收藏项，点 ☆ 取消收藏，支持两种排序。
- 尺寸全部用 `rpx`（750rpx = 屏幕宽度），自动适配不同机型；
  卡片、按钮都有 `hover-class` 按压反馈，收藏/保存/删除均有 toast 提示。
