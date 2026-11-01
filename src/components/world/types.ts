export type Vec3 = [number, number, number];
export type VehicleId = 'offroad' | 'coupe' | 'van';
export type Lang = 'en' | 'zh';
/** Bilingual string pair (site convention: `{ en, zh }`). */
export interface Bi { en: string; zh: string }
export interface WorldExperience {
  organization: string;
  role: string;
  startDate: string;
  /** Card fields (ui session); copied from `EXPERIENCES` in src/lib/i18n.ts, never retyped. */
  endDate?: string;
  location?: string;
  type?: string;
  highlights?: string[];
  techStack?: string[];
}
export interface WorldProject {
  slug: string; title: string; titleZh: string; tagline: string; taglineZh: string; maintenance: string;
  /** Card fields (ui session); from the projects content collection. Dates are ISO yyyy-mm-dd. */
  description?: string; descriptionZh?: string;
  highlights?: string[]; highlightsZh?: string[];
  techStack?: string[];
  maturity?: string;
  date?: string; endDate?: string;
  links?: { live?: string; github?: string };
  /** Course pages (Interactive Learning blackboard): rows of the project's own MDX course table, per language. */
  courses?: Record<Lang, { code: string; name: string; problem: string; response: string }[]>;
}
/** About-camp card sources, copied from `UI` in src/lib/i18n.ts (hero, about, education, sections). */
export interface WorldAbout {
  tagline: Bi;
  positioning: Bi;
  bio: Bi[];
  techCategories: Record<Lang, { label: string; items: string[] }[]>;
  education: {
    school: Bi; degree: Bi; period: Bi; expectedGrad: Bi;
    awards: Record<Lang, { label: string }[]>;
    certificates: Record<Lang, string[]>;
    languages: Record<Lang, { name: string; level: string }[]>;
    courses: Record<Lang, string[]>;
  };
  /** Index of the `bio` paragraph that talks about free time, per language (the site keeps hobbies inside the bio). */
  interestsParagraph: Record<Lang, number>;
  sections: Record<'about' | 'education' | 'experience' | 'projects' | 'certificates' | 'languages', Bi>;
}
export interface WorldContent {
  /** Ascending startDate order binds each language to the existing six slots. */
  experiences: Record<Lang, WorldExperience[]>;
  projects: WorldProject[];
  about?: WorldAbout;
}
