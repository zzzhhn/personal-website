export type Vec3 = [number, number, number];
export type VehicleId = 'offroad' | 'coupe' | 'van';
export type Lang = 'en' | 'zh';
export interface WorldExperience {
  organization: string;
  role: string;
  startDate: string;
}
export interface WorldContent {
  /** Ascending startDate order binds each language to the existing six slots. */
  experiences: Record<Lang, WorldExperience[]>;
  projects: { slug: string; title: string; titleZh: string; tagline: string; taglineZh: string; maintenance: string }[];
}
