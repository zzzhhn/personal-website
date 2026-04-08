// ── Bilingual content aligned to EN and ZH resumes ──

export type Lang = "en" | "zh";

export const UI = {
  // ── Nav & Global ──
  nav: {
    about: { en: "About", zh: "关于" },
    experience: { en: "Experience", zh: "实习经历" },
    projects: { en: "Projects", zh: "项目" },
    contact: { en: "Contact", zh: "联系" },
  },
  sections: {
    education: { en: "Education & Awards", zh: "教育背景" },
    experience: { en: "Internship Experience", zh: "实习经历" },
    projects: { en: "Projects", zh: "项目经历" },
    campus: { en: "Campus Activities", zh: "校园经历" },
    contact: { en: "Get in Touch", zh: "联系方式" },
    about: { en: "About Me", zh: "关于我" },
    certificates: { en: "Certificates", zh: "证书" },
    languages: { en: "Languages", zh: "语言能力" },
  },

  // ── Hero ──
  hero: {
    tagline: {
      en: "Quantitative Finance × AI",
      zh: "量化金融 × 人工智能",
    },
    resume: { en: "Resume", zh: "简历" },
  },

  // ── About ──
  about: {
    bio: {
      en: "I'm an undergraduate at the Chinese University of Hong Kong, Shenzhen, majoring in Quantitative Finance. My work spans AI-driven evaluation systems, venture capital analysis, and quantitative alpha research. From building end-to-end video evaluation pipelines to developing automated agent assessment frameworks, I focus on creating systematic, data-driven solutions at the intersection of finance and technology.",
      zh: "我是香港中文大学（深圳）量化金融专业本科生。我的工作横跨 AI 驱动的评测系统、风险投资分析和量化 Alpha 研究。从搭建端到端的视频评测流水线到开发自动化 Agent 评估框架，我专注于在金融与科技交汇处构建系统化、数据驱动的解决方案。",
    },
    techCategories: {
      en: [
        { label: "Programming", items: ["Python", "SQL", "JavaScript", "CSS", "STATA", "MATLAB", "LaTeX"] },
        { label: "Office", items: ["Microsoft Word", "Microsoft Excel", "Microsoft PowerPoint", "Microsoft Outlook", "Google Workspace"] },
        { label: "AI & Agent", items: ["Claude Code", "Harness Engineering", "Continual Learning", "Auto-research", "OpenClaw"] },
        { label: "Data & ML", items: ["NumPy", "Pandas", "matplotlib", "Scikit-learn", "TensorFlow", "PyTorch"] },
        { label: "Finance", items: ["Wind", "Choice", "iFind", "PitchBook"] },
      ],
      zh: [
        { label: "编程", items: ["Python", "SQL", "JavaScript", "CSS", "STATA", "MATLAB", "LaTeX"] },
        { label: "办公", items: ["Microsoft Word", "Microsoft Excel", "Microsoft PowerPoint", "Microsoft Outlook", "Google Workspace"] },
        { label: "AI & Agent", items: ["Claude Code", "Harness Engineering", "Continual Learning", "Auto-research", "OpenClaw"] },
        { label: "数据 & 机器学习", items: ["NumPy", "Pandas", "matplotlib", "Scikit-learn", "TensorFlow", "PyTorch"] },
        { label: "金融", items: ["万得", "东方财富 Choice", "同花顺 iFind", "PitchBook"] },
      ],
    },
  },

  // ── Education ──
  education: {
    school: {
      en: "The Chinese University of Hong Kong, Shenzhen (CUHKSZ)",
      zh: "香港中文大学（深圳）",
    },
    degree: {
      en: "Bachelor of Business Administration, Stream: Quantitative Finance",
      zh: "量化金融专业",
    },
    period: { en: "Sep 2023 – Present", zh: "2023.9 – 至今" },
    expectedGrad: { en: "Expected: May 2027", zh: "预计毕业：2027年5月" },
    awards: {
      en: [
        { label: "2024 Shaw Spirit Award", image: "shaw-spirit-2024" },
        { label: "2025 Shaw Service Award", image: "shaw-service-2025" },
        { label: "2024-25 Dean's List (School of Data Science)", image: "deans-list-2024" },
        { label: "2024-25 Campus Culture Development Award", image: "campus-culture-2024" },
      ],
      zh: [
        { label: "2024 逸夫书院「逸夫精神奖」", image: "shaw-spirit-2024" },
        { label: "2025 逸夫书院「逸夫服务奖」", image: "shaw-service-2025" },
        { label: "2024-25 Dean's List（数据科学学院）", image: "deans-list-2024" },
        { label: "2024-25 校园文化贡献奖", image: "campus-culture-2024" },
      ],
    },
    certificates: {
      en: [
        "WorldQuant BRAIN Challenge Top 0.05%",
        "J.P.Morgan Chase & Co. Quantitative Research Completion Certificate",
        "2025 Deloitte Digital Camp Certificate of Participation",
      ],
      zh: [
        "WorldQuant BRAIN Challenge Top 0.05%",
        "JPMorgan Chase & Co. Quantitative Research Completion Certificate",
        "2025 德勤数字化精英挑战赛参赛证书",
      ],
    },
    languages: {
      en: [
        { name: "Putonghua", level: "Native" },
        { name: "English", level: "Proficient; TOEFL 106, CET4 660, English courses all A range" },
        { name: "Japanese", level: "Basic" },
        { name: "Spanish", level: "Basic, CEFR: B1" },
      ],
      zh: [
        { name: "普通话", level: "母语" },
        { name: "英语", level: "熟练；托福 106，大学英语四级 660 分，英语相关课程均 A range" },
        { name: "日语", level: "基础" },
        { name: "西班牙语", level: "基础，CEFR: B1" },
      ],
    },
    courses: {
      en: [
        "Stochastic Process",
        "Fixed Income Securities Analysis",
        "Futures and Options",
        "Data Structure",
        "Machine Learning",
        "Investment Analysis and Portfolio Management",
      ],
      zh: [
        "随机过程",
        "固定收益证券分析",
        "期货与期权",
        "数据结构",
        "机器学习",
        "投资分析与投资组合管理",
      ],
    },
  },

  // ── Contact ──
  contact: {
    description: {
      en: "I'm always open to discussing new projects, research opportunities, or interesting ideas at the intersection of finance and AI.",
      zh: "欢迎就新项目、研究机会或金融与 AI 交叉领域的有趣想法与我交流。",
    },
  },

  // ── Footer ──
  footer: {
    disclaimer: {
      en: "Information on this site may not reflect the most recent updates. For the latest details, please contact me at",
      zh: "本站信息可能未及时更新。如需最新信息，请通过以下邮箱联系我：",
    },
  },

  // ── Campus ──
  campus: [
    {
      role: { en: "Operation & Management", zh: "组织者 & 运营" },
      org: {
        en: "AceSeed+ (Job-description online sharing community)",
        zh: "求职信息分享社群 AceSeed+",
      },
      period: { en: "Sep 2025 – Present", zh: "2025.09 – 至今" },
      items: {
        en: [
          { label: "Community Management", text: "Oversee a community of 3,000+ members; design and automate JD distribution processes to improve information dissemination and community engagement." },
          { label: "Event Planning", text: "Organize 3-4 recruitment-related activities per month, focusing on professional skills, career development, and industry insights to drive community growth." },
          { label: "Cross-team Collaboration", text: "Collaborate with CPDO, CDC, and other external teams to establish long-term partnerships." },
          { label: "Achievements", text: "Successfully increased weekly user acquisition by 50+ new users, executed 10+ major events with 100+ attendees each, and established a highly efficient JD automation workflow." },
        ],
        zh: [
          { label: "社群运营", text: "管理 3000+ 成员，设计并自动化 JD 转发流程，提升信息传递效率和社群活跃度" },
          { label: "活动策划", text: "每月策划 3-4 场求职相关活动，涉及行业分享、求职技巧等多个主题，促进社群用户增长" },
          { label: "跨组织合作", text: "与 CPDO、CDC 等校内外求职招聘组织建立长期合作关系，推动资源整合与信息共享" },
          { label: "成果", text: "每周吸引 50+ 新成员，成功策划并组织 10+ 场主题活动，场均报名人数 100+；建立了高效的 JD 自动转发 workflow" },
        ],
      },
    },
    {
      role: { en: "Vice Chairman & Member of Liaison Department", zh: "副主席 & 外联部干事" },
      org: {
        en: "Shaw College Resident Student Association (SCRSA)",
        zh: "逸夫书院宿生会",
      },
      period: { en: "Jan 2024 – Present", zh: "2024.01 – 至今" },
      items: {
        en: [
          { label: "Event Planning", text: "Led the planning of a \"Chinese Traditional Culture Escape Room\" event, managing the entire workflow from event design and procurement to on-site execution." },
          { label: "Team Management", text: "Authored a ~20,000-word event proposal and created standardized planning documentation to ensure sustainability of future events." },
          { label: "Execution & Oversight", text: "Managed recruitment, task delegation, and on-site supervision to ensure smooth event operations and enhance participant experience." },
          { label: "Achievements", text: "Attracted 400+ registrations; event WeChat article reached 4,000+ reads with ~20% engagement conversion; received 50+ positive feedback responses, setting a new school record for participation in similar events." },
        ],
        zh: [
          { label: "组织策划", text: "主策划「国风主题密室探险」活动，负责活动流程设计、物资采购、现场执行等全流程" },
          { label: "团队管理", text: "编写近 2 万字策划案，创建活动策划标准流程文档，确保后续活动可持续性" },
          { label: "执行监督", text: "负责人员招募、分工、现场监督，确保活动顺利进行，提升参与者体验" },
          { label: "成果", text: "活动报名人数 400+，公众号推文获 4000+ 阅读量，约转化 20% 为点赞+转发数据；活动后获 50+ 条正向反馈，打破校内同类活动参与人数记录" },
        ],
      },
    },
  ],
} as const;

// ── Experiences (bilingual) ──
export const EXPERIENCES = {
  en: [
    {
      role: "Data Engineer — VLM Evaluation",
      organization: "Video Rebirth",
      location: "Hong Kong, China",
      startDate: "2026-02-01",
      type: "internship",
      highlights: [
        "Reproduced and built evaluation pipelines for text-to-video generation models, focusing on key dimensions including generation quality, instruction following, and semantic consistency",
        "Independently completed the full workflow from methodology understanding and environment setup to experiment execution within the first two and a half weeks, delivering a complete evaluation output",
        "Led the development of core evaluation modules for text-to-video tasks, including data processing, metric decomposition, and result analysis, and promoted reusable, low-cost evaluation workflow engineering",
        "Rapidly tracked and adapted state-of-the-art evaluation methods from leading video-generation papers, bridging research paradigms with business-oriented model benchmarking and iteration infrastructure",
      ],
      techStack: ["Python", "Data Pipeline", "ML Evaluation"],
    },
    {
      role: "Product Manager — Agent Evaluation",
      organization: "ByteDance",
      location: "Shenzhen, Guangdong",
      startDate: "2025-12-01",
      endDate: "2026-02-01",
      type: "internship",
      highlights: [
        "Built an automated evaluation data-processing pipeline for R&D agents; independently developed Python scripts to parse user prompt intent at a scale of 100M+ tokens per day",
        "Independently designed a three-level intent taxonomy covering coding, knowledge, general-purpose, and 15+ fine-grained scenarios; continuously facilitated evaluation process by using Human-in-the-loop, harness engineering and other techniques",
        "Conducted falsification experiments on 8+ core cases for anomalies in open-ended QA scenarios and generated high-confidence attribution conclusions",
      ],
      techStack: ["Python", "Data Analysis", "Prompt Engineering"],
    },
    {
      role: "Venture Capital Assistant",
      organization: "MoE Capital",
      location: "Silicon Valley, California (Remote)",
      startDate: "2025-11-01",
      endDate: "2026-03-01",
      type: "internship",
      highlights: [
        "Conducted primary-market screening via PitchBook and independently wrote the historical financing section of investment memos by integrating data on funding rounds, investor structure, and valuation trends",
        "Researched the MCP managed services space and produced in-depth competitive analysis by extracting unstructured information from social media, company websites, and third-party reviews",
        "Designed and built an automated audio-processing workflow with multimodal LLMs for GP meetings and expert interviews, improving meeting-note generation efficiency by 50%+",
      ],
      techStack: ["LLM", "Research", "Competitive Analysis"],
    },
    {
      role: "Research Consultant",
      organization: "WorldQuant",
      location: "Remote",
      startDate: "2025-08-01",
      endDate: "2025-11-01",
      type: "internship",
      highlights: [
        "Relying on the BRAIN platform and focusing on the TOP 3000 Universe of US stocks, using price and volume data as inputs, along with timing and cross-sectional operators such as ts_rank, ts_decay_linear, and rank, 100+ Alphas covering short-term reversals, momentum, and fundamental value were constructed",
        "To address the issue of transaction cost erosion caused by high Turnover during backtesting, ts_decay_linear attenuation smoothing and group_neutralize industry neutralization were introduced, significantly enhancing the RankIC stability (ICIR) and reducing the turnover rate by approximately 15%",
      ],
      techStack: ["Python", "Quantitative Modeling", "Research"],
    },
    {
      role: "Investment Banking Analyst",
      organization: "SDIC Securities",
      location: "Shenzhen, Guangdong",
      startDate: "2025-05-01",
      endDate: "2025-08-01",
      type: "internship",
      highlights: [
        "Participated in the IPO project for a home hardware enterprise; updated 200+ key data points in the project initiation report, extracted industry benchmarks from 10+ peer companies via Wind and Choice, and collaborated with the project team to implement 2 optimization proposals",
        "Managed classification and organization of confirmation letters spanning 3 years; built reply tracking spreadsheets using Excel (VLOOKUP, pivot tables) to streamline workflows, processing hundreds of thousands of records and producing 30+ business, financial, and legal working papers, reducing the analysis cycle by ~30%",
        "Authored a valuation report for a GPU-sector technology company; applied P/E and P/S models to project 5-year forward valuations based on 10,000+ historical data points, and independently completed two chapters of financial projections in the project initiation report",
      ],
      techStack: ["Excel", "Financial Modeling", "Data Analysis"],
    },
  ],
  zh: [
    {
      role: "Data Engineer – 视频模型评测",
      organization: "Video Rebirth",
      location: "中国 – 香港",
      startDate: "2026-02-01",
      type: "internship",
      highlights: [
        "聚焦文生视频模型评测方向，围绕生成质量、指令遵循、语义一致性等核心维度，独立复现并跑通业界前沿论文中的主流评测流程",
        "在入职两周半内完成从方案理解、环境配置到实验执行的全流程落地，形成完整评测产出",
        "针对文生视频任务的数据处理、指标拆解与结果分析需求，自主推进评测方案工程化，实现低成本、高可复用的评测流程工具化",
        "快速跟进视频生成领域和相关 SOTA 评测方法，对论文中的评测范式进行拆解、复现与适配，打通研究方法向业务评测链路的迁移路径",
      ],
      techStack: ["Python", "数据管线", "ML 评测"],
    },
    {
      role: "产品经理 – Agent 评测",
      organization: "字节跳动",
      location: "广东 – 深圳",
      startDate: "2025-12-01",
      endDate: "2026-02-01",
      type: "internship",
      highlights: [
        "针对研发 Agent 构建自动化数据提取和处理体系，利用 Python 独立编写分析脚本，实现日均万亿级别 Token 规模的用户 Prompt 意图解析，通过 API 调用强模型打标，实现 95% 以上的自动化打标覆盖率",
        "独立设计 3 级意图分类树（涵盖代码、知识、通用等 15+ 细分场景），通过 Human-in-the-loop、few-shots 等机制持续优化提示词，将人机一致率从初始的 60% 提升至 90% 以上",
        "负责包含 AI 编程模式指标分析，通过复用 Aime 评测工作流，将报告产出周期缩短 40%",
      ],
      techStack: ["Python", "数据分析", "Prompt Engineering"],
    },
    {
      role: "风险投资",
      organization: "MoE Capital",
      location: "加利福尼亚 – 硅谷（远程）",
      startDate: "2025-10-01",
      endDate: "2025-12-01",
      type: "internship",
      highlights: [
        "熟练运用 PitchBook 平台进行一级市场扫描，深度检索并整合目标公司的融资轮次、投资者构成及估值走向，独立完成投资备忘录中往期融资历史模块的撰写",
        "针对 MCP 管理服务赛道进行专项调研，通过多渠道信息提取产出深度竞对分析报告",
        "针对 GP 的会议与专家访谈场景，利用多模态大语言模型设计并搭建自动化录音处理工作流，将纪要产出效率提升 50% 以上",
      ],
      techStack: ["LLM", "行业研究", "竞对分析"],
    },
    {
      role: "研究顾问",
      organization: "WorldQuant 世坤",
      location: "远程",
      startDate: "2025-07-01",
      endDate: "2025-10-01",
      type: "internship",
      highlights: [
        "依托 BRAIN 平台，聚焦美股 TOP 3000 Universe，利用价量数据与基本面数据为输入，采用 ts_rank、ts_decay_linear、rank 等时序与截面算子，系统性构建了涵盖短期反转、动量及基本面价值等多类信号的 Alpha，最终产出 100+ 个通过平台检验的高质因子",
        "针对回测中高 Turnover 导致的交易成本侵蚀问题，引入 ts_decay_linear 衰减平滑与 group_neutralize 行业中性化，提升因子回测通过率约 15%",
      ],
      techStack: ["Python", "量化建模", "行业研究"],
    },
    {
      role: "投行部 – 股权承做",
      organization: "国投证券",
      location: "广东 – 深圳",
      startDate: "2025-05-01",
      endDate: "2025-08-01",
      type: "internship",
      highlights: [
        "参与家居五金企业上市项目，更新立项报告关键数据 200+ 项，通过 Wind、Choice 等数据库提取 10+ 家同行业指标支撑行业分析，拆解 3 类核心业务模块并与项目组合作落地 2 项优化方案",
        "负责近 3 年函证分类整理，用 Excel（VLOOKUP、数据透视图等）建立回函控制表并优化数据处理流程，共处理数十万条数据、制作 30+ 业务、财务、法律底稿表格，缩短分析周期近 30%",
        "撰写某 GPU 领域科技企业估值报告，运用市盈率、市销率模型完成未来 5 年估值预测，基于 10000+ 条历史数据预判未来业务增长，独立完成立项报告中两章财务预测相关内容",
      ],
      techStack: ["Excel", "财务建模", "数据分析"],
    },
  ],
} as const;

// ── Workflow types ──
export type WFNodeType = "process" | "decision";

export interface WFNode {
  id: string;
  label: { en: string; zh: string };
  type: WFNodeType;
  col: number;
  row: number;
}

export interface WFEdge {
  from: string;
  to: string;
  label?: { en: string; zh: string };
  dashed?: boolean;
}

export interface WorkflowData {
  nodes: WFNode[];
  edges: WFEdge[];
  cols: number;
  rows: number;
  direction?: "vertical" | "horizontal"; // default "vertical"
}

// ── Workflow data — one per experience, matches EXPERIENCES order ──
export const WORKFLOWS: WorkflowData[] = [
  // ① Video Rebirth — 视频模型评测工程师 (3×6, fork+feedback)
  {
    cols: 3, rows: 6,
    nodes: [
      { id: "scope", label: { en: "Evaluation Scoping", zh: "评测目标调研" }, type: "process", col: 1, row: 0 },
      { id: "framework", label: { en: "Framework Design", zh: "评测体系设计" }, type: "process", col: 1, row: 1 },
      { id: "data", label: { en: "Data Pipeline", zh: "数据管线搭建" }, type: "process", col: 0, row: 2 },
      { id: "metric", label: { en: "Metric Development", zh: "评测指标开发" }, type: "process", col: 2, row: 2 },
      { id: "run", label: { en: "Evaluation Run", zh: "评测执行" }, type: "process", col: 1, row: 3 },
      { id: "analysis", label: { en: "Analysis", zh: "结果分析" }, type: "process", col: 1, row: 4 },
      { id: "report", label: { en: "Report", zh: "评测报告" }, type: "process", col: 1, row: 5 },
    ],
    edges: [
      { from: "scope", to: "framework" },
      { from: "framework", to: "data" },
      { from: "framework", to: "metric" },
      { from: "data", to: "run" },
      { from: "metric", to: "run" },
      { from: "run", to: "analysis" },
      { from: "analysis", to: "report" },
      { from: "analysis", to: "framework", dashed: true, label: { en: "Iterate", zh: "迭代" } },
    ],
  },
  // ② ByteDance — Agent 评测 PM (7×3 horizontal, fork+decision+feedback)
  {
    cols: 7, rows: 3, direction: "horizontal",
    nodes: [
      { id: "req", label: { en: "Requirement Analysis", zh: "需求拆解" }, type: "process", col: 0, row: 1 },
      { id: "taxonomy", label: { en: "Intent Taxonomy", zh: "意图分类" }, type: "process", col: 1, row: 1 },
      { id: "datapipe", label: { en: "Data Pipeline", zh: "数据管线" }, type: "process", col: 2, row: 0 },
      { id: "annospec", label: { en: "Annotation Std", zh: "标注规范" }, type: "process", col: 2, row: 2 },
      { id: "autolabel", label: { en: "Auto-labeling", zh: "自动打标" }, type: "process", col: 3, row: 1 },
      { id: "humanqa", label: { en: "Human QA", zh: "人工校验" }, type: "process", col: 4, row: 1 },
      { id: "qcheck", label: { en: "Pass?", zh: "达标？" }, type: "decision", col: 5, row: 1 },
      { id: "report", label: { en: "Report", zh: "归因报告" }, type: "process", col: 6, row: 1 },
    ],
    edges: [
      { from: "req", to: "taxonomy" },
      { from: "taxonomy", to: "datapipe" },
      { from: "taxonomy", to: "annospec" },
      { from: "datapipe", to: "autolabel" },
      { from: "annospec", to: "autolabel" },
      { from: "autolabel", to: "humanqa" },
      { from: "humanqa", to: "qcheck" },
      { from: "qcheck", to: "report", label: { en: "Pass", zh: "通过" } },
      { from: "qcheck", to: "autolabel", dashed: true, label: { en: "Fail", zh: "不通过" } },
    ],
  },
  // ③ MoE Capital — 风险投资 (3×6, 3-way fork)
  {
    cols: 3, rows: 6,
    nodes: [
      { id: "scan", label: { en: "Market Scanning", zh: "赛道扫描" }, type: "process", col: 1, row: 0 },
      { id: "screen", label: { en: "Target Screening", zh: "标的筛选" }, type: "process", col: 1, row: 1 },
      { id: "bizdd", label: { en: "Business DD", zh: "商业尽调" }, type: "process", col: 0, row: 2 },
      { id: "findd", label: { en: "Financial DD", zh: "财务尽调" }, type: "process", col: 1, row: 2 },
      { id: "techdd", label: { en: "Technical DD", zh: "技术尽调" }, type: "process", col: 2, row: 2 },
      { id: "comp", label: { en: "Competitive Analysis", zh: "竞对分析" }, type: "process", col: 1, row: 3 },
      { id: "memo", label: { en: "Investment Memo", zh: "投资备忘录" }, type: "process", col: 1, row: 4 },
      { id: "ic", label: { en: "IC Presentation", zh: "投委会汇报" }, type: "process", col: 1, row: 5 },
    ],
    edges: [
      { from: "scan", to: "screen" },
      { from: "screen", to: "bizdd" },
      { from: "screen", to: "findd" },
      { from: "screen", to: "techdd" },
      { from: "bizdd", to: "comp" },
      { from: "findd", to: "comp" },
      { from: "techdd", to: "comp" },
      { from: "comp", to: "memo" },
      { from: "memo", to: "ic" },
    ],
  },
  // ④ WorldQuant — 量化因子研究 (7×1 horizontal, decision+feedback loop)
  {
    cols: 7, rows: 1, direction: "horizontal",
    nodes: [
      { id: "hypo", label: { en: "Hypothesis", zh: "因子假设" }, type: "process", col: 0, row: 0 },
      { id: "dataproc", label: { en: "Data Cleaning", zh: "数据清洗" }, type: "process", col: 1, row: 0 },
      { id: "construct", label: { en: "Construct", zh: "因子构建" }, type: "process", col: 2, row: 0 },
      { id: "backtest", label: { en: "Backtest", zh: "回测验证" }, type: "process", col: 3, row: 0 },
      { id: "decision", label: { en: "Pass?", zh: "达标？" }, type: "decision", col: 4, row: 0 },
      { id: "optimize", label: { en: "Optimize", zh: "优化" }, type: "process", col: 5, row: 0 },
      { id: "registry", label: { en: "Registry", zh: "入库" }, type: "process", col: 6, row: 0 },
    ],
    edges: [
      { from: "hypo", to: "dataproc" },
      { from: "dataproc", to: "construct" },
      { from: "construct", to: "backtest" },
      { from: "backtest", to: "decision" },
      { from: "decision", to: "optimize", label: { en: "Pass", zh: "通过" } },
      { from: "decision", to: "hypo", dashed: true, label: { en: "Fail", zh: "迭代" } },
      { from: "optimize", to: "registry" },
    ],
  },
  // ⑤ SDIC Securities — 投行承做 (3×5, fork+join)
  {
    cols: 3, rows: 5,
    nodes: [
      { id: "init", label: { en: "Project Initiation", zh: "项目立项" }, type: "process", col: 1, row: 0 },
      { id: "industry", label: { en: "Industry Analysis", zh: "行业分析" }, type: "process", col: 0, row: 1 },
      { id: "financial", label: { en: "Financial Workpapers", zh: "财务底稿" }, type: "process", col: 2, row: 1 },
      { id: "valuation", label: { en: "Valuation Modeling", zh: "估值建模" }, type: "process", col: 1, row: 2 },
      { id: "report", label: { en: "Report Drafting", zh: "报告撰写" }, type: "process", col: 1, row: 3 },
      { id: "review", label: { en: "Internal Review", zh: "内核审核" }, type: "process", col: 1, row: 4 },
    ],
    edges: [
      { from: "init", to: "industry" },
      { from: "init", to: "financial" },
      { from: "industry", to: "valuation" },
      { from: "financial", to: "valuation" },
      { from: "valuation", to: "report" },
      { from: "report", to: "review" },
    ],
  },
];
