/**
 * My Acronym —— 内置词条数据
 *
 * 数据结构（每条一行，按顺序）：[缩写, 完整英文原词, 中文释义, 一级分类, 行业?, 说明?]
 *   一级分类 category：IT / 商务 / 日常 / 医疗健康 ……（粗粒度，首页「分类数量」按它统计）
 *   行业 industry  ：行业 / 场景 key（见下方 INDUSTRIES），缺省时按 category 推导
 *   说明 note      ：可选的用法备注，补充说明字段
 *
 * 一对多：同一个缩写在不同行业下可以有多条不同含义（例如 API 在 IT 是「应用程序编程接口」，
 * 在医药是「活性药物成分」）。因此：
 * - **一条记录 = 一个含义**，不是「一个缩写一个条目」；
 * - 唯一性约束是 (缩写, 行业)，而不是单独的缩写；
 * - id = b_ + 缩写 slug + '__' + 行业 key，保证同一缩写的多个含义各有稳定 id。
 *
 * legacyId 是改造前的旧 id（b_ + 缩写 slug）。id 规则变更会让存量收藏里的旧 id 全部失效，
 * 迁移逻辑靠它把旧 id 换成新 id —— 详见 utils/storage.js 的 migrateFavIds()。
 *
 * VERSION 用于记录数据版本；utils/storage.js 的合并策略是「每次启动做增量合并」，
 * 版本号只作为元信息，不参与是否合并的判断。
 */

const VERSION = 2;
const RELEASE_DATE = '2026-01-01';

/**
 * 行业 / 场景字典。
 * key 参与 id 生成，必须是纯英文小写（slug 规则限制），改动 key 等于换 id —— 不要随便动。
 * name 用于界面展示；custom 表示是否允许用户把它作为自填行业。
 */
const INDUSTRIES = [
  { key: 'general', name: '通用', desc: '跨行业通用的含义' },
  { key: 'it', name: 'IT / 互联网', desc: '软件开发、网络与信息技术' },
  { key: 'business', name: '商业 / 职场', desc: '企业经营与办公协作' },
  { key: 'finance', name: '金融 / 财税', desc: '银行、证券、会计与财务' },
  { key: 'legal', name: '法务 / 合规', desc: '合同、法务审阅与合规' },
  { key: 'medical', name: '医疗健康', desc: '临床、医药与公共卫生' },
  { key: 'marketing', name: '市场营销 / 公关', desc: '品牌、投放与公关传播' },
  { key: 'hr', name: '人力资源', desc: '招聘、薪酬与组织管理' },
  { key: 'logistics', name: '物流 / 供应链', desc: '仓储运输与供应链' },
  { key: 'manufacturing', name: '制造业', desc: '生产制造与质量管理' },
  { key: 'design', name: '设计 / 创意', desc: '视觉设计、音视频与设计工具' },
  { key: 'sports', name: '体育竞技', desc: '赛事、训练与竞技术语' },
  { key: 'edu', name: '教育', desc: '教学、考试与学术研究' },
  { key: 'other', name: '其他', desc: '以上都不合适时的兜底' }
];

/** 未显式写行业时，按一级分类推导的默认行业 key */
const CATEGORY_INDUSTRY = {
  IT: 'it',
  商务: 'business',
  日常: 'general',
  医疗健康: 'medical'
};

const RAW = [
  // ============ IT / 技术 ============
  ['API', 'Application Programming Interface', '应用程序编程接口', 'IT'],
  ['SDK', 'Software Development Kit', '软件开发工具包', 'IT'],
  ['IDE', 'Integrated Development Environment', '集成开发环境', 'IT'],
  ['UI', 'User Interface', '用户界面', 'IT'],
  ['UX', 'User Experience', '用户体验', 'IT'],
  ['OS', 'Operating System', '操作系统', 'IT'],
  ['CPU', 'Central Processing Unit', '中央处理器', 'IT'],
  ['RAM', 'Random Access Memory', '随机存取存储器', 'IT'],
  ['SSD', 'Solid State Drive', '固态硬盘', 'IT'],
  ['HDD', 'Hard Disk Drive', '机械硬盘', 'IT'],
  ['USB', 'Universal Serial Bus', '通用串行总线', 'IT'],
  ['LAN', 'Local Area Network', '局域网', 'IT'],
  ['WAN', 'Wide Area Network', '广域网', 'IT'],
  ['VPN', 'Virtual Private Network', '虚拟专用网络', 'IT'],
  ['DNS', 'Domain Name System', '域名系统', 'IT'],
  ['HTTP', 'Hypertext Transfer Protocol', '超文本传输协议', 'IT'],
  ['HTTPS', 'Hypertext Transfer Protocol Secure', '加密超文本传输协议', 'IT'],
  ['URL', 'Uniform Resource Locator', '统一资源定位符', 'IT'],
  ['HTML', 'HyperText Markup Language', '超文本标记语言', 'IT'],
  ['CSS', 'Cascading Style Sheets', '层叠样式表', 'IT'],
  ['SQL', 'Structured Query Language', '结构化查询语言', 'IT'],
  ['FTP', 'File Transfer Protocol', '文件传输协议', 'IT'],
  ['SMTP', 'Simple Mail Transfer Protocol', '简单邮件传输协议', 'IT'],
  ['IMAP', 'Internet Message Access Protocol', '互联网消息访问协议', 'IT'],
  ['GUI', 'Graphical User Interface', '图形用户界面', 'IT'],
  ['CLI', 'Command-Line Interface', '命令行界面', 'IT'],
  ['PDF', 'Portable Document Format', '便携式文档格式', 'IT'],
  ['PNG', 'Portable Network Graphics', '便携式网络图形', 'IT'],
  ['JPG', 'Joint Photographic Experts Group', '联合图像专家组图片格式', 'IT'],
  ['AI', 'Artificial Intelligence', '人工智能', 'IT'],
  ['ML', 'Machine Learning', '机器学习', 'IT'],
  ['NLP', 'Natural Language Processing', '自然语言处理', 'IT'],
  ['LLM', 'Large Language Model', '大语言模型', 'IT'],
  ['RAG', 'Retrieval-Augmented Generation', '检索增强生成', 'IT'],
  ['SaaS', 'Software as a Service', '软件即服务', 'IT'],
  ['PaaS', 'Platform as a Service', '平台即服务', 'IT'],
  ['IaaS', 'Infrastructure as a Service', '基础设施即服务', 'IT'],
  ['CDN', 'Content Delivery Network', '内容分发网络', 'IT'],
  ['CMS', 'Content Management System', '内容管理系统', 'IT'],
  ['CRM', 'Customer Relationship Management', '客户关系管理', 'IT'],
  ['MVP', 'Minimum Viable Product', '最小可行产品', 'IT'],
  ['QA', 'Quality Assurance', '质量保证（测试）', 'IT'],
  ['CI/CD', 'Continuous Integration and Continuous Deployment', '持续集成与持续交付', 'IT'],
  ['PR', 'Pull Request', '代码合并请求', 'IT'],
  ['Repo', 'Repository', '代码仓库', 'IT'],
  ['JWT', 'JSON Web Token', 'JSON Web 令牌', 'IT'],
  ['OAuth', 'Open Authorization', '开放授权协议', 'IT'],
  ['SSH', 'Secure Shell', '安全远程登录协议', 'IT'],
  ['SSL', 'Secure Sockets Layer', '安全套接字层', 'IT'],
  ['ETL', 'Extract Transform Load', '数据抽取、转换与加载', 'IT'],
  ['BI', 'Business Intelligence', '商业智能', 'IT'],
  ['QPS', 'Queries Per Second', '每秒查询数', 'IT'],
  ['TB', 'Terabyte', '太字节', 'IT'],
  ['GB', 'Gigabyte', '吉字节', 'IT'],
  ['VR', 'Virtual Reality', '虚拟现实', 'IT'],
  ['AR', 'Augmented Reality', '增强现实', 'IT'],
  ['IoT', 'Internet of Things', '物联网', 'IT'],
  ['5G', 'Fifth-Generation Mobile Network', '第五代移动通信网络', 'IT'],
  ['Git', 'Distributed Version Control System', '分布式版本控制系统', 'IT'],
  ['Debug', 'Debugging', '调试', 'IT'],
  ['Stack', 'Technology Stack', '技术栈', 'IT'],
  ['UGC', 'User-Generated Content', '用户生成内容', 'IT'],
  ['FAQ', 'Frequently Asked Questions', '常见问题解答', 'IT'],

  // ============ 商务 / 职场 ============
  ['B2B', 'Business to Business', '企业对企业', '商务'],
  ['B2C', 'Business to Consumer', '企业对消费者', '商务'],
  ['B2B2C', 'Business to Business to Consumer', '企业对企业对消费者', '商务'],
  ['KPI', 'Key Performance Indicator', '关键绩效指标', '商务'],
  ['OKR', 'Objectives and Key Results', '目标与关键结果', '商务'],
  ['ROI', 'Return on Investment', '投资回报率', '商务'],
  ['GMV', 'Gross Merchandise Volume', '商品交易总额', '商务'],
  ['CTR', 'Click-Through Rate', '点击率', '商务'],
  ['CPC', 'Cost Per Click', '单次点击成本', '商务'],
  ['CPM', 'Cost Per Mille', '千次展示成本', '商务'],
  ['SEO', 'Search Engine Optimization', '搜索引擎优化', '商务'],
  ['ERP', 'Enterprise Resource Planning', '企业资源计划', '商务'],
  ['SWOT', 'Strengths Weaknesses Opportunities Threats', '优势劣势机会威胁分析', '商务'],
  ['NDA', 'Non-Disclosure Agreement', '保密协议', '商务'],
  ['SLA', 'Service Level Agreement', '服务等级协议', '商务'],
  ['T&C', 'Terms and Conditions', '条款与条件', '商务'],
  ['HR', 'Human Resources', '人力资源', '商务'],
  ['CEO', 'Chief Executive Officer', '首席执行官', '商务'],
  ['CFO', 'Chief Financial Officer', '首席财务官', '商务'],
  ['CMO', 'Chief Marketing Officer', '首席市场官', '商务'],
  ['CTO', 'Chief Technology Officer', '首席技术官', '商务'],
  ['COO', 'Chief Operating Officer', '首席运营官', '商务'],
  ['P&L', 'Profit and Loss', '损益表', '商务'],
  ['A/R', 'Accounts Receivable', '应收账款', '商务'],
  ['A/P', 'Accounts Payable', '应付账款', '商务'],
  ['PO', 'Purchase Order', '采购订单', '商务'],
  ['SOP', 'Standard Operating Procedure', '标准作业流程', '商务'],
  ['MoM', 'Month over Month', '环比', '商务'],
  ['YoY', 'Year over Year', '同比', '商务'],
  ['KOL', 'Key Opinion Leader', '关键意见领袖', '商务'],
  ['DTC', 'Direct to Consumer', '直接面向消费者', '商务'],
  ['NPS', 'Net Promoter Score', '净推荐值', '商务'],
  ['CSAT', 'Customer Satisfaction Score', '客户满意度', '商务'],
  ['SKU', 'Stock Keeping Unit', '库存单位', '商务'],
  ['FY', 'Fiscal Year', '财年', '商务'],
  ['WIP', 'Work in Progress', '进行中的工作', '商务'],
  ['P2P', 'Peer to Peer', '点对点（对等）', '商务'],
  ['B2G', 'Business to Government', '企业对政府', '商务'],

  // ============ 日常聊天 ============
  ['LOL', 'Laugh Out Loud', '哈哈大笑', '日常'],
  ['LMAO', 'Laughing My Ass Off', '笑死我了', '日常'],
  ['OMG', 'Oh My God', '天啊／我的天', '日常'],
  ['WTF', 'What The Heck', '搞什么鬼', '日常'],
  ['IMO', 'In My Opinion', '在我看来', '日常'],
  ['IMHO', 'In My Humble Opinion', '依我浅见', '日常'],
  ['AFAIK', 'As Far As I Know', '据我所知', '日常'],
  ['TBH', 'To Be Honest', '说实话', '日常'],
  ['BTW', 'By The Way', '顺便说一句', '日常'],
  ['TTYL', 'Talk To You Later', '回头聊', '日常'],
  ['BRB', 'Be Right Back', '马上回来', '日常'],
  ['OMW', 'On My Way', '在路上', '日常'],
  ['LMK', 'Let Me Know', '告诉我', '日常'],
  ['IDK', "I Don't Know", '我不知道', '日常'],
  ['N/A', 'Not Applicable', '不适用／暂无', '日常'],
  ['AKA', 'Also Known As', '又称', '日常'],
  ['DIY', 'Do It Yourself', '自己动手', '日常'],
  ['PS', 'Postscript', '附言／补充说明', '日常'],
  ['TGIF', "Thank God It's Friday", '感谢老天是星期五', '日常'],
  ['TFW', 'That Feel When', '当我感到……的时候', '日常'],
  ['FOMO', 'Fear of Missing Out', '错失恐惧感', '日常'],
  ['YOLO', 'You Only Live Once', '及时行乐', '日常'],
  ['ATM', 'At The Moment', '此刻／当下', '日常'],
  ['TBD', 'To Be Determined', '待定', '日常'],
  ['HTH', 'Hope That Helps', '希望有帮助', '日常'],
  ['RSVP', 'Please Respond', '请回复（是否参加）', '日常'],
  ['FYI', 'For Your Information', '供你参考', '日常'],
  ['ASAP', 'As Soon As Possible', '尽快', '日常'],
  ['ETA', 'Estimated Time of Arrival', '预计到达时间', '日常'],
  ['TL;DR', "Too Long; Didn't Read", '太长不看（摘要）', '日常'],
  ['AMA', 'Ask Me Anything', '问我任何问题', '日常'],
  ['YMMV', 'Your Mileage May Vary', '因人而异', '日常'],
  ['D2D', 'Door to Door', '上门服务', '日常'],
  ['GL', 'Good Luck', '祝你好运', '日常'],
  ['GG', 'Good Game', '干得漂亮', '日常'],
  ['NV', 'Nevermind', '算了／没事', '日常'],
  ['WB', 'Welcome Back', '欢迎回来', '日常'],
  ['BFF', 'Best Friends Forever', '一辈子的好朋友', '日常'],
  ['JK', 'Just Kidding', '开玩笑的', '日常'],
  ['HBD', 'Happy Birthday', '生日快乐', '日常'],
  ['XO', 'Hugs and Kisses', '拥抱与亲吻', '日常'],
  ['PTO', 'Paid Time Off', '带薪休假', '日常'],
  ['WFH', 'Work From Home', '居家办公', '日常'],
  ['CC', 'Carbon Copy', '抄送', '日常'],
  ['BCC', 'Blind Carbon Copy', '密送', '日常'],
  ['RE', 'Reply', '回复（邮件前缀）', '日常'],
  ['FWD', 'Forward', '转发（邮件前缀）', '日常'],
  ['ATTN', 'Attention', '收件人／请注意', '日常'],

  // ============ 同一个缩写，不同行业的含义 ============
  // 这些条目的缩写上面已经出现过，靠不同的 industry 共存 —— 唯一键是 (缩写, 行业)。
  ['API', 'Active Pharmaceutical Ingredient', '活性药物成分（原料药）', '医疗健康', 'medical',
    '医药研发与注册语境下的 API，指制剂中起药效的活性成分'],
  ['ATM', 'Automated Teller Machine', '自动柜员机', '商务', 'finance',
    '金融场景指自助取款机；网络聊天里的 ATM 是 At The Moment（此刻）'],
  ['PS', 'Adobe Photoshop', 'Photoshop 图像处理软件', 'IT', 'design',
    '设计软件语境；邮件末尾的 PS 是 Postscript（附言）'],
  ['PR', 'Public Relations', '公共关系', '商务', 'marketing',
    '公关 / 传播语境；研发语境的 PR 是 Pull Request（代码合并请求）'],
  ['MVP', 'Most Valuable Player', '最有价值球员', '日常', 'sports',
    '体育赛事语境；产品语境的 MVP 是 Minimum Viable Product（最小可行产品）']
];

/** 缩写 → slug，例如 'CI/CD' → 'ci-cd' */
function slugify(abbr) {
  return String(abbr)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 行业 key 白名单；不在名单里的一律退回 'other'，保证 key 干净、id 可预测 */
const INDUSTRY_KEYS = {};
INDUSTRIES.forEach(function (d) { INDUSTRY_KEYS[d.key] = d; });

function industryOf(row) {
  const raw = String(row[4] || '').trim();
  if (raw && INDUSTRY_KEYS[raw]) return raw;
  const category = String(row[3] || '').trim();
  return CATEGORY_INDUSTRY[category] || 'other';
}

/**
 * 防御性去重：**唯一键是 (缩写, 行业)**，不是单独的缩写。
 * 过去按缩写去重会把第二个含义直接丢掉（还不报错），这正是「一对多」被锁死的地方。
 * 一旦同一缩写 + 同一行业出现两条，仍然要剔除后一条 —— id 会冲突，必须兜住。
 */
const _seen = {};
const _dropped = [];
const ITEMS = RAW.filter(function (row) {
  const abbr = String(row[0] || '').trim();
  if (!abbr) return false;
  const key = abbr.toUpperCase() + '@' + industryOf(row);
  if (_seen[key]) {
    _dropped.push(abbr + ' @ ' + industryOf(row));
    return false;
  }
  _seen[key] = true;
  return true;
}).map(function (row, index) {
  const abbr = String(row[0] || '').trim();
  const industry = industryOf(row);
  const note = String(row[5] || '').trim();
  return {
    // 复合主键：同一缩写的不同含义各有一条 id
    id: 'b_' + slugify(abbr) + '__' + industry,
    // 旧 id（只有缩写）—— 迁移存量收藏时用，见 utils/storage.js
    legacyId: 'b_' + slugify(abbr),
    abbr: abbr,
    full: String(row[1] || '').trim(),
    zh: String(row[2] || '').trim(),
    category: String(row[3] || '其他').trim(),
    industry: industry,
    note: note,
    source: 'builtin',
    creator: '内置词条',
    createdAt: RELEASE_DATE,
    updatedAt: RELEASE_DATE,
    order: index
  };
});

/** 同一缩写共有几个含义，供列表/详情展示「这个词还有 N 个含义」 */
const MEANING_COUNT = {};
ITEMS.forEach(function (it) {
  const key = it.abbr.toUpperCase();
  MEANING_COUNT[key] = (MEANING_COUNT[key] || 0) + 1;
});

module.exports = {
  VERSION: VERSION,
  RELEASE_DATE: RELEASE_DATE,
  INDUSTRIES: INDUSTRIES,
  CATEGORY_INDUSTRY: CATEGORY_INDUSTRY,
  MEANING_COUNT: MEANING_COUNT,
  DROPPED_DUP: _dropped,
  ITEMS: ITEMS,
  // 兼容两种引用写法
  items: ITEMS,
  list: ITEMS
};
