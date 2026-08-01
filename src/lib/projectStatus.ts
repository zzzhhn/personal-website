export type ProjectMaturity =
  | "stable-release"
  | "functional-prototype"
  | "research-preview"
  | "completed-case-study";

export type ProjectMaintenance =
  | "actively-maintained"
  | "completed"
  | "archived";

export const PROJECT_MATURITY_LABELS: Record<
  ProjectMaturity,
  { en: string; zh: string }
> = {
  "stable-release": { en: "Stable release", zh: "稳定版本" },
  "functional-prototype": { en: "Functional prototype", zh: "功能原型" },
  "research-preview": { en: "Research preview", zh: "研究预览" },
  "completed-case-study": { en: "Completed case study", zh: "完结作品" },
};

export const PROJECT_MAINTENANCE_LABELS: Record<
  ProjectMaintenance,
  { en: string; zh: string }
> = {
  "actively-maintained": { en: "Actively maintained", zh: "持续维护" },
  completed: { en: "Completed", zh: "已完结" },
  archived: { en: "Archived", zh: "已归档" },
};
