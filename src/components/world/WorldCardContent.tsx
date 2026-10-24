import { Fragment, type ReactNode } from 'react';
import { PROJECT_MAINTENANCE_LABELS, PROJECT_MATURITY_LABELS } from '../../lib/projectStatus';
import { worldText } from './world-i18n';
import type { WorldCard } from './store';
import type { Lang, WorldContent, WorldProject } from './types';

/** Bilingual notes that districts may show as `kind: 'note'` cards (e.g. a plot sign). Interface words only:
 * any fact on a note must still come from the site sources. */
const notes = new Map<string, { title: { en: string; zh: string }; body: { en: string; zh: string } }>();
export function registerNote(id: string, note: { title: { en: string; zh: string }; body: { en: string; zh: string } }) { notes.set(id, note); return () => { if (notes.get(id) === note) notes.delete(id); }; }

export type CardView = { eyebrow: string; title: ReactNode; subtitle?: ReactNode; meta?: [string, string][]; body: ReactNode; links?: { href: string; label: string; external?: boolean }[]; accent: string; pager?: { page: number; count: number } };

/** `**bold**` and line breaks, the only markup the site's bilingual bio strings use. */
export function Rich({ text }: { text: string }) {
  return <>{text.split('\n').map((line, i, all) => <Fragment key={i}>{line.split(/(\*\*[^*]+\*\*)/).map((part, j) => part.startsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : part)}{i < all.length - 1 && <br />}</Fragment>)}</>;
}
const month = (iso?: string) => iso ? iso.slice(0, 7).replace('-', '.') : '';
const Chips = ({ items }: { items: string[] }) => <ul className='world-card-chips'>{items.map(i => <li key={i}>{i}</li>)}</ul>;
const Bullets = ({ items }: { items: string[] }) => <ul className='world-card-list'>{items.map((i, n) => <li key={n} style={{ animationDelay: `${.12 + n * .05}s` }}>{i}</li>)}</ul>;

export const coursePages = (p?: WorldProject) => p?.courses?.en.length ?? 0;

/** Resolve a store card into display content. Every fact comes from `content`, which world.astro copies from
 * EXPERIENCES / the projects collection / UI; this file only arranges it. Unknown ids return null. */
export function resolveCard(card: WorldCard, content: WorldContent, lang: Lang): CardView | null {
  const t = worldText[lang];
  if (card.kind === 'experience') {
    const list = content.experiences[lang], i = list.findIndex(e => e.startDate === card.id), e = list[i];
    if (!e) return null;
    return {
      accent: '#4E647D', eyebrow: `${t.cardKind.experience} · ${String(i + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}`,
      title: e.organization, subtitle: e.role,
      meta: [[t.period, `${month(e.startDate)} – ${e.endDate ? month(e.endDate) : t.present}`], ...(e.location ? [[t.location, e.location] as [string, string]] : [])],
      body: <>{e.highlights?.length ? <section><h4>{t.highlights}</h4><Bullets items={e.highlights} /></section> : null}{e.techStack?.length ? <section><h4>{t.stack}</h4><Chips items={e.techStack} /></section> : null}</>,
      links: [{ href: '/#experience', label: t.openOnSite }],
    };
  }
  if (card.kind === 'project') {
    const p = content.projects.find(x => x.slug === card.id);
    if (!p) return null;
    const zh = lang === 'zh', count = coursePages(p);
    const page = count ? (((card.page ?? 0) % count) + count) % count : 0;
    const course = count ? p.courses![lang][page] ?? p.courses!.en[page] : null;
    const status = [p.maturity && PROJECT_MATURITY_LABELS[p.maturity as keyof typeof PROJECT_MATURITY_LABELS]?.[lang], PROJECT_MAINTENANCE_LABELS[p.maintenance as keyof typeof PROJECT_MAINTENANCE_LABELS]?.[lang]].filter(Boolean) as string[];
    const highlights = (zh ? p.highlightsZh : p.highlights) ?? [];
    return {
      accent: '#2F8F86', eyebrow: `${t.cardKind.project}${status.length ? ' · ' + status.join(' · ') : ''}`,
      title: zh ? p.titleZh : p.title, subtitle: zh ? p.taglineZh : p.tagline,
      meta: p.date ? [[t.period, `${month(p.date)} – ${p.endDate ? month(p.endDate) : t.present}`]] : undefined,
      pager: count ? { page, count } : undefined,
      body: <>
        {course && <section className='world-card-board' key={page}>
          <span className='world-card-board-code'>{course.code}</span>
          <strong>{course.name}</strong>
          <p>{course.problem}</p><p className='world-card-board-answer'>{course.response}</p>
        </section>}
        <p className='world-card-lede'>{zh ? p.descriptionZh : p.description}</p>
        {highlights.length > 0 && <section><h4>{t.highlights}</h4><Bullets items={highlights} /></section>}
        {p.techStack?.length ? <section><h4>{t.stack}</h4><Chips items={p.techStack} /></section> : null}
      </>,
      links: [{ href: `/projects/${p.slug}`, label: t.openOnSite }, ...(p.links?.live ? [{ href: p.links.live, label: t.live, external: true }] : []), ...(p.links?.github ? [{ href: p.links.github, label: t.source, external: true }] : [])],
    };
  }
  if (card.kind === 'about') {
    const a = content.about; if (!a) return null;
    const base = { accent: '#E8803A', links: [{ href: card.id === 'identity' || card.id === 'skills' || card.id === 'interests' ? '/#about' : '/#education', label: t.openOnSite }] };
    const ed = a.education;
    switch (card.id) {
      case 'identity': return { ...base, eyebrow: `${t.cardKind.about} · ${a.sections.about[lang]}`, title: a.tagline[lang], subtitle: a.positioning[lang], body: <p className='world-card-lede'><Rich text={a.bio[0][lang]} /></p> };
      case 'education': return { ...base, eyebrow: `${t.cardKind.about} · ${a.sections.education[lang]}`, title: ed.school[lang], subtitle: ed.degree[lang],
        meta: [[t.period, ed.period[lang]], [t.expected, ed.expectedGrad[lang].replace(/^[^:：]+[:：]\s*/, '')]], body: <section><h4>{t.courses}</h4><Bullets items={ed.courses[lang]} /></section> };
      case 'awards': return { ...base, eyebrow: `${t.cardKind.about} · ${a.sections.education[lang]}`, title: a.sections.education[lang],
        body: <><section><Bullets items={ed.awards[lang].map(x => x.label)} /></section><section><h4>{a.sections.certificates[lang]}</h4><Bullets items={ed.certificates[lang]} /></section></> };
      case 'languages': return { ...base, eyebrow: `${t.cardKind.about} · ${a.sections.languages[lang]}`, title: a.sections.languages[lang],
        body: <dl className='world-card-pairs'>{ed.languages[lang].map(l => <Fragment key={l.name}><dt>{l.name}</dt><dd>{l.level}</dd></Fragment>)}</dl> };
      case 'skills': return { ...base, eyebrow: `${t.cardKind.about} · ${a.sections.about[lang]}`, title: a.tagline[lang],
        body: <>{a.techCategories[lang].map(c => <section key={c.label}><h4>{c.label}</h4><Chips items={c.items.filter(i => !i.endsWith(':'))} /></section>)}</> };
      case 'interests': return { ...base, eyebrow: `${t.cardKind.about} · ${a.sections.about[lang]}`, title: t.interests, body: <p className='world-card-lede'><Rich text={a.bio[a.interestsParagraph[lang]]?.[lang] ?? ''} /></p> };
      default: return null;
    }
  }
  const n = notes.get(card.id);
  return n ? { accent: '#8E6E55', eyebrow: t.cardKind.note, title: n.title[lang], body: <p className='world-card-lede'><Rich text={n.body[lang]} /></p> } : null;
}
