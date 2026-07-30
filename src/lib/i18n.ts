// ── Bilingual content aligned to EN and ZH resumes ──

export type Lang = "en" | "zh";

export const UI = {
  // ── Nav & Global ──
  nav: {
    about: { en: "About", zh: "关于" },
    education: { en: "Education", zh: "教育" },
    experience: { en: "Experience", zh: "实习经历" },
    projects: { en: "Projects", zh: "项目" },
    contact: { en: "Contact", zh: "联系" },
  },
  sections: {
    education: { en: "Education & Awards", zh: "教育背景" },
    experience: { en: "Internship Experience", zh: "实习经历" },
    projects: { en: "Projects", zh: "项目经历" },
    campus: { en: "Activities", zh: "活动经历" },
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
    bio: [
      {
        en: "Hey there, I'm Bobby👋 An undergraduate studying **Quantitative Finance** at the Chinese University of Hong Kong, Shenzhen.\nI love building things with the help of **LLMs**, and keeping track of popular **agents'** updates.",
        zh: "你好👋我叫钟昊楠，你可以叫我 Bobby。\n我是 2023 级香港中文大学（深圳）本科生，就读**量化金融**专业。\n我喜欢**多元化**的背景，与 Agent 协作是我生活的驱动力之一。",
      },
      {
        en: "In my free time, I genuinely enjoy **singing** and sharing my discoveries with friends.\n\nMeantime, I go to gym from time to time, but those muscles literally do not grow.",
        zh: "我有过一段时间的**职业探索**，过往经历包括投行、Quant Research、VC、产品经理；\n目前发现自己对**大模型评测**相关领域很感兴趣，知识库和方法论沉淀中……\n同时也在高强度和 Claude Code & Codex 一同搭建个人项目，尝试将想法落地为实践。",
      },
      {
        en: "I try my best to work well with **Claude Code & Codex**. The collaboration is not always smooth, but I keep getting better at it.\n\nWelcome to my personal website! Scroll down for more info.",
        zh: "我相信**万卷书**和**万里路**同等重要，\n空闲时间喜欢唱歌、健身、主持、烹饪、旅行。\n欢迎来到我的个人网站！愿君徐徐下览，或有可观者。",
      },
    ],
    techCategories: {
      en: [
        { label: "Programming", items: ["Vibe Coding:", "Python", "SQL", "JavaScript", "CSS", "STATA", "MATLAB"] },
        { label: "Office", items: ["Microsoft Word", "Microsoft Excel", "Microsoft PowerPoint", "Microsoft Outlook", "Google Workspace", "WPS"] },
        { label: "AI & Agent", items: ["Claude Code & Codex", "Harness Engineering", "Continual Learning", "Evaluation"] },
        { label: "Data & ML", items: ["NumPy", "Pandas", "matplotlib", "Scikit-learn", "TensorFlow", "PyTorch"] },
        { label: "Finance", items: ["Wind", "Choice", "iFind", "PitchBook"] },
      ],
      zh: [
        { label: "编程", items: ["Vibe Coding:", "Python", "SQL", "JavaScript", "CSS", "STATA", "MATLAB"] },
        { label: "办公", items: ["Microsoft Word", "Microsoft Excel", "Microsoft PowerPoint", "Microsoft Outlook", "Google Workspace", "WPS"] },
        { label: "AI & Agent", items: ["Claude Code & Codex", "Harness Engineering", "Continual Learning", "Evaluation"] },
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
      role: { en: "Volunteer Teacher", zh: "志愿教师" },
      org: {
        en: "Shaw College Bali Service-Learning Program",
        zh: "逸夫书院巴厘岛支教项目",
      },
      period: { en: "Jun 2026", zh: "2026.06" },
      items: {
        en: [
          { label: "Teaching", text: "Taught Chinese and English classes to local primary-school students in Bali during a week-long service-learning program (Jun 21–26, 2026)." },
          { label: "Cross-cultural Communication", text: "Designed lessons for students with no shared first language, adapting pacing and materials on the spot to keep classes engaging across the language barrier." },
        ],
        zh: [
          { label: "支教教学", text: "参与逸夫书院组织的巴厘岛支教项目（2026.6.21–6.26），为当地小学生讲授中文与英文课程" },
          { label: "跨文化沟通", text: "面向无共同母语的学生设计课程，现场调整节奏与教学材料，让课堂跨越语言障碍保持吸引力" },
        ],
      },
    },
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
        "Owned the end-to-end architecture and delivery of the company's video evaluation platform (Next.js + PostgreSQL + Prisma), spanning annotator assignment, Arena-style model comparisons, self-service package creation, and a permission-aware RBAC model",
        "Established a disciplined local → staging → production release path and migrated staging to Alibaba Cloud ACK; sustained production usage across 35+ users, 24+ evaluation packages, and 21,000+ evaluation items with zero P0 incidents",
        "Engineered an automated collection pipeline across 8+ video-model families, unifying prompt dispatch, asynchronous generation monitoring, validation, and OSS ingestion to produce 5,600+ evaluation videos",
        "Re-architected evaluation asset governance through a zero-loss OSS migration, credential-vault hardening with AES-256-GCM controls and reveal-rate limiting, and standardized archival for new datasets",
        "Developed reusable evaluation methodology assets, including a VQA-derived eight-subdimension rubric, a 120-prompt first/last-frame suite across three new dimensions, and a competitive intelligence base covering seven World Model companies",
      ],
      techStack: ["Next.js", "PostgreSQL", "Kubernetes", "Python", "ML Evaluation"],
    },
    {
      role: "Product Manager — Agent Evaluation (AIME)",
      organization: "ByteDance",
      location: "Shenzhen, Guangdong",
      startDate: "2025-12-01",
      endDate: "2026-02-01",
      type: "internship",
      highlights: [
        "Owned end-to-end evaluation of AIME Ask mode, modeling user-demand distributions from production interactions to define priority scenarios, target answer quality, and measurable performance baselines for product, algorithm, and engineering teams",
        "Built a Python evaluation pipeline combining rule-based signals, semantic clustering and prototype matching, strong-model labeling, and human-in-the-loop calibration; designed a three-level intent taxonomy across 15+ scenarios with checkpointing, retry, and recovery mechanisms, achieving 95%+ automated coverage and raising human-model agreement from 60% to 90%+",
        "Developed a multidimensional evaluation system spanning intent and output-format classification, LLM-as-a-Judge analysis for accuracy, completeness, and relevance, plus refusal and negative-feedback diagnostics; analyzed 8,000+ production interactions to isolate structural gaps in software engineering, complex instruction following, and long-context tasks",
        "Designed a falsifiable A/B attribution framework for anomalous copy and feedback metrics, triangulating segmented behavioral data with qualitative cases to rule out denominator inflation and clarification-follow-up hypotheses; identified one-shot completion and feedback-compression dynamics, then reduced reporting turnaround by 40% through a reusable workflow",
      ],
      techStack: ["Python", "Data Analysis", "Prompt Engineering"],
    },
    {
      role: "Venture Capital Assistant",
      organization: "MoE Capital",
      location: "Silicon Valley, California (Remote)",
      startDate: "2025-11-01",
      type: "internship",
      highlights: [
        "Conducted primary-market diligence in PitchBook, synthesizing financing history, investor composition, and valuation trajectories into investment-memo analysis",
        "Owned thematic research on MCP managed services, converting fragmented signals from company disclosures, social platforms, and third-party reviews into a decision-ready competitive landscape",
        "Designed a multimodal-LLM audio workflow for GP meetings and expert interviews, improving meeting-note production efficiency by 50%+",
        "Own public-sentiment monitoring and standardized Investor Catchup Q&A deliverables, supported by a self-built LLM transcription and synthesis workflow",
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
        "Built and validated 100+ BRAIN Alphas for the U.S. TOP 3000 universe, translating reversal, momentum, and fundamental-value hypotheses into executable FASTEXPR signals across price-volume and accounting data; ranked in the global top 0.05%",
        "Established a robustness-oriented evaluation discipline spanning Rank IC, ICIR, turnover, and self-correlation; combined decay smoothing, industry neutralization, and targeted parameter tuning to reduce cost-sensitive churn and lift backtest pass rates by approximately 15%",
        "Productized the research process inside Alpha Agent as a scheduled, human-governed factor-mining engine: seed from proven Alphas and live BRAIN fields, generate parser-valid candidates, apply LLM financial-logic screening and targeted retries, run BRAIN simulations, gate on official/local self-correlation, portfolio marginal contribution, and factor-family saturation, then persist every outcome for review and one-click submission",
      ],
      techStack: ["Python", "WorldQuant BRAIN", "FASTEXPR", "Agentic Research"],
    },
    {
      role: "Investment Banking Analyst",
      organization: "SDIC Securities",
      location: "Shenzhen, Guangdong",
      startDate: "2025-05-01",
      endDate: "2025-08-01",
      type: "internship",
      highlights: [
        "Supported the IPO workstream for a home-hardware company, combining Wind and Choice peer benchmarking with business-model analysis to strengthen project-initiation materials and optimization recommendations",
        "Re-engineered three years of confirmation tracking with Excel-based controls and structured working papers, shortening the analysis cycle by approximately 30%",
        "Authored a valuation report for a GPU-sector technology company, applying P/E and P/S frameworks to a five-year outlook and independently completing two financial-projection chapters of the project-initiation report",
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
        "主导公司视频评测平台从架构设计到生产交付（Next.js + PostgreSQL + Prisma），覆盖标注任务分配、Arena 双模型对战、XLSX prompt suite 自助建包及权限解耦的 RBAC 体系",
        "建立 local → stg 回归 → prod 的标准化发布链路，并推动 stg 迁移至阿里云 ACK；平台稳定支撑 35+ 用户、24+ 评测包与 21,000+ 评测条目，保持零 P0 事故",
        "搭建覆盖 8+ 视频模型家族的自动化采集 pipeline，统一 prompt 分发、异步生成监控、结果校验与 OSS 入库，累计产出 5,600+ 评测视频",
        "重构评测资产治理体系，零丢失完成 OSS 结构化迁移，并通过 AES-256-GCM 审计、凭证泄露限流及数据集自动归档强化安全与可追溯性",
        "构建可复用的评测方法论资产，包括基于 VQA benchmark 的八子维度评分体系、覆盖三个新增维度的 120 条首尾帧 prompt suite，以及七家 World Model 公司的竞品知识库",
      ],
      techStack: ["Next.js", "PostgreSQL", "Kubernetes", "Python", "ML 评测"],
    },
    {
      role: "产品经理 – Agent 评测（AIME）",
      organization: "字节跳动",
      location: "广东 – 深圳",
      startDate: "2025-12-01",
      endDate: "2026-02-01",
      type: "internship",
      highlights: [
        "负责 AIME Ask 模式端到端效果评测，从线上真实交互中建模用户需求分布，定义重点场景、理想回答与效果水位，并向产品、算法和工程团队输出可量化的现状判断与迭代优先级",
        "独立开发 Python 自动化评测 pipeline，融合规则判定、语义聚类与原型匹配、强模型打标及 Human-in-the-loop 校准；构建覆盖 15+ 细分场景的三级意图体系与 checkpoint、失败重试和错误恢复机制，实现 95%+ 自动化覆盖率，并将人机一致率由 60% 提升至 90%+",
        "基于 8,000+ 条线上真实交互搭建多维评估体系，贯通意图与输出格式识别、准确性/完整性/相关性 LLM Judge、拒答与负反馈分析；定位软件工程、复杂指令遵循和长上下文任务的结构性短板，形成可执行的专项优化建议",
        "针对豆包编程实验中复制与正负反馈指标的异常联动，设计可证伪的 A/B 分层归因框架，结合行为指标与典型案例排除“非代码消息分母膨胀”“澄清式追问增加”等替代假说，识别高完成度一次性交付与反馈收缩机制；复用该工作流将报告交付周期缩短 40%",
      ],
      techStack: ["Python", "数据分析", "Prompt Engineering"],
    },
    {
      role: "风险投资",
      organization: "MoE Capital",
      location: "加利福尼亚 – 硅谷（远程）",
      startDate: "2025-11-01",
      type: "internship",
      highlights: [
        "依托 PitchBook 开展一级市场尽调，系统整合融资轮次、投资者结构与估值演变，形成可直接纳入投资备忘录的融资历史分析",
        "主导 MCP 管理服务赛道专题研究，将公司披露、社媒动态与第三方评价等分散信息转化为面向投资决策的竞争格局判断",
        "面向 GP 会议与专家访谈搭建多模态 LLM 音频处理工作流，将纪要产出效率提升 50% 以上",
        "负责舆情监控与标准化 Investor Catchup 会议 Q&A 交付，并以自建 LLM 转录整理工作流提升信息归纳的一致性与时效性",
      ],
      techStack: ["LLM", "行业研究", "竞对分析"],
    },
    {
      role: "研究顾问",
      organization: "WorldQuant 世坤",
      location: "远程",
      startDate: "2025-08-01",
      endDate: "2025-11-01",
      type: "internship",
      highlights: [
        "依托 BRAIN 平台面向美股 TOP 3000 Universe 研发并验证 100+ 个 Alpha，将反转、动量与基本面价值假设转化为融合价量及财务数据的可执行 FASTEXPR 信号，个人排名进入全球前 0.05%",
        "建立覆盖 Rank IC、ICIR、Turnover 与自相关的稳健性评估框架，结合衰减平滑、行业中性化及定向参数调优，降低交易成本敏感型换手并将回测通过率提升约 15%",
        "将研究方法工程化并并入 Alpha Agent，构建定时运行且由人工决策的自动挖因子引擎：以既有有效 Alpha 与真实 BRAIN 字段为种子，贯通候选生成、LLM 金融逻辑筛选、定向重试、BRAIN 仿真、官方与本地双重自相关、组合边际贡献及因子族拥挤度门控，完整沉淀各类结果供复核与一键提交",
      ],
      techStack: ["Python", "WorldQuant BRAIN", "FASTEXPR", "Agentic Research"],
    },
    {
      role: "投行部 – 股权承做",
      organization: "国投证券",
      location: "广东 – 深圳",
      startDate: "2025-05-01",
      endDate: "2025-08-01",
      type: "internship",
      highlights: [
        "参与家居五金企业上市项目，结合 Wind、Choice 同业基准与业务模式拆解，完善立项材料、行业分析及项目优化建议",
        "重构近三年函证管理流程，以 Excel 控制表和标准化底稿提升回函追踪与数据处理效率，将分析周期缩短近 30%",
        "独立撰写 GPU 领域科技企业估值报告，运用市盈率与市销率框架完成五年估值展望，并交付立项报告中的两章财务预测内容",
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
  variant?:
    | "diagram"
    | "alpha-loop"
    | "evaluation-lab"
    | "evaluation-router"
    | "deal-room"
    | "underwriting-ledger";
  center?: {
    label: { en: string; zh: string };
    meta: { en: string; zh: string };
  };
  outcomes?: Array<{
    label: { en: string; zh: string };
    tone: "pass" | "flag" | "out";
  }>;
}

// ── Workflow data — one per experience, matches EXPERIENCES order ──
export const WORKFLOWS: WorkflowData[] = [
  // ① Video Rebirth — 视频模型评测工程师 (3×6, fork+feedback)
  {
    cols: 3, rows: 6, variant: "evaluation-lab",
    center: {
      label: { en: "EVALUATION LAB", zh: "视频评测实验室" },
      meta: { en: "Model × Data × Metric", zh: "模型 × 数据 × 指标" },
    },
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
    cols: 7, rows: 3, direction: "horizontal", variant: "evaluation-router",
    center: {
      label: { en: "AIME EVALUATION ROUTER", zh: "AIME 评测路由器" },
      meta: { en: "Auto-label × Human QA", zh: "自动打标 × 人工校验" },
    },
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
    cols: 3, rows: 6, variant: "deal-room",
    center: {
      label: { en: "DEAL ROOM", zh: "投资决策室" },
      meta: { en: "Three-track diligence", zh: "三线并行尽调" },
    },
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
  // ④ WorldQuant — Alpha Foundry orbital loop
  {
    cols: 3, rows: 2, variant: "alpha-loop",
    center: {
      label: { en: "ALPHA FOUNDRY", zh: "自动挖因子引擎" },
      meta: { en: "Scheduled · Human-governed", zh: "定时运行 · 人工决策" },
    },
    outcomes: [
      { label: { en: "PASS", zh: "通过" }, tone: "pass" },
      { label: { en: "FLAG", zh: "存疑" }, tone: "flag" },
      { label: { en: "OUT", zh: "淘汰" }, tone: "out" },
    ],
    nodes: [
      { id: "seed", label: { en: "Proven Alphas + Fields", zh: "有效 Alpha + 字段" }, type: "process", col: 0, row: 0 },
      { id: "forge", label: { en: "Candidate Forge", zh: "候选生成" }, type: "process", col: 1, row: 0 },
      { id: "logic", label: { en: "Logic Screen", zh: "金融逻辑筛选" }, type: "process", col: 2, row: 0 },
      { id: "simulate", label: { en: "BRAIN Simulation", zh: "BRAIN 仿真" }, type: "process", col: 2, row: 1 },
      { id: "gates", label: { en: "Diversity Gates", zh: "多重稳健性门控" }, type: "decision", col: 1, row: 1 },
      { id: "review", label: { en: "Review + Registry", zh: "复核 + 结果沉淀" }, type: "process", col: 0, row: 1 },
    ],
    edges: [
      { from: "seed", to: "forge" },
      { from: "forge", to: "logic" },
      { from: "logic", to: "simulate" },
      { from: "simulate", to: "gates" },
      { from: "gates", to: "review" },
      { from: "review", to: "seed", dashed: true, label: { en: "Evolve", zh: "自进化" } },
    ],
  },
  // ⑤ SDIC Securities — 投行承做 (3×5, fork+join)
  {
    cols: 3, rows: 5, variant: "underwriting-ledger",
    center: {
      label: { en: "UNDERWRITING LEDGER", zh: "股权承做台账" },
      meta: { en: "Traceable review path", zh: "可追溯审核路径" },
    },
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
