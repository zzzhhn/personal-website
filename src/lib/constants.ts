export const SITE = {
  name: "Haonan Zhong",
  title: "Haonan Zhong | Quantitative Finance × AI",
  description:
    "Personal portfolio of Haonan Zhong — CUHK-Shenzhen student exploring the intersection of quantitative finance and artificial intelligence.",
  url: "https://haonanzhong.com",
  email: "123090894@link.cuhk.edu.cn",
  tagline: "Quantitative Finance × AI",
} as const;

export const SOCIAL_LINKS = [
  {
    name: "GitHub",
    url: "https://github.com/haonanzhong",
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
