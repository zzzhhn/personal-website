export const SITE = {
  name: "Haonan Zhong",
  title: "Haonan Zhong | Quantitative Finance × AI",
  description:
    "Personal portfolio of Haonan Zhong — CUHK-Shenzhen student exploring the intersection of quantitative finance and artificial intelligence.",
  url: "https://bobbyzhong.com",
  email: "123090894@link.cuhk.edu.cn",
  tagline: "Quantitative Finance × AI",
  phone: "(+86)13798309920",
} as const;

export const SOCIAL_LINKS = [
  {
    name: "GitHub",
    url: "https://github.com/zzzhhn",
    icon: "github",
  },
  {
    name: "LinkedIn",
    url: "https://linkedin.com/in/haonanzhong",
    icon: "linkedin",
  },
  {
    name: "Email",
    url: "mailto:123090894@link.cuhk.edu.cn",
    icon: "mail",
  },
] as const;

export const NAV_ITEMS = [
  { label: "About", href: "#about" },
  { label: "Experience", href: "#experience" },
  { label: "Projects", href: "#projects" },
  { label: "Contact", href: "#contact" },
] as const;

export const EDUCATION = {
  school: "香港中文大学（深圳）",
  major: "量化金融专业",
  period: "2023.9 – 至今",
} as const;
