export type Vec3 = [number, number, number];
export type VehicleId = 'offroad' | 'coupe' | 'van';
export type Lang = 'en' | 'zh';
export interface WorldContent {
  experiences: { id: string; organization: string; role: string; startDate: string }[];
  projects: { slug: string; title: string; titleZh: string; tagline: string; taglineZh: string; maintenance: string }[];
}
