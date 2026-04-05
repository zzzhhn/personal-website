# Plan: Build Personal Portfolio Website (Apple-style)

## Context

Haonan Zhong (CUHK-Shenzhen) — Apple-aesthetic, glassmorphism personal website to showcase Quant Finance × AI experience. Design spec at `/Users/a22309/Desktop/Side-projects/Plans/痛点2-Apple风格个人网站方案.md`.

**Goal**: Production-ready static bilingual (EN/ZH) portfolio site with Astro 5 + React Islands, deploy-ready on Cloudflare Pages or Vercel.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Astro 5.x (static output) | Zero JS by default, Islands for interactivity |
| Interactive UI | React 19 (Islands only) | Framer Motion ecosystem, `client:visible` hydration |
| Styling | Tailwind CSS 4 (via `@tailwindcss/vite`) | Astro 5.2+ native Vite plugin, no config file needed |
| Animation | Framer Motion 12 + CSS transitions | React Islands animations + scroll-triggered fade-ins |
| Font | Geist Sans (self-hosted, woff2) | Free, closest to Apple SF Pro |
| Content | `src/lib/i18n.ts` (bilingual) + Astro Content Collections (projects) | i18n for resume data, MDX for project detail pages |
| Deploy | Cloudflare Pages (primary) / Vercel (backup) | Free tier, global CDN, fast Asia TTFB |

---

## Architecture

### Directory Structure (Actual)

```
personal-website/
├── astro.config.mjs           # Astro 5 + React + MDX + Sitemap + Tailwind Vite plugin
├── tsconfig.json
├── package.json
├── status.json                # Side-project tracker
├── plans/plan.md              # This file
├── logs/                      # Checkpoint & session logs
├── public/
│   ├── fonts/                 # Geist Sans woff2 (3 weights: regular, medium, semibold)
│   ├── images/
│   │   ├── projects/          # Project thumbnails
│   │   └── profile.jpg        # Profile photo (fade-to-background mask)
│   ├── resume.pdf             # Chinese resume
│   └── favicon.svg
└── src/
    ├── content.config.ts      # Astro 5 glob loader schemas (projects, experiences, about)
    ├── content/
    │   ├── projects/*.mdx     # Project detail content
    │   ├── experiences/*.md   # Legacy (superseded by i18n.ts for bilingual)
    │   └── about/bio.md       # Legacy (superseded by i18n.ts)
    ├── layouts/
    │   └── BaseLayout.astro   # HTML shell, theme/lang init, font preload, ClientRouter
    ├── pages/
    │   ├── index.astro        # Home — composes all sections
    │   └── projects/[slug].astro  # Project detail pages
    ├── components/
    │   ├── astro/             # Zero-JS Astro components
    │   │   ├── Header.astro   # Nav + ThemeToggle + LangToggle (desktop & mobile)
    │   │   ├── Footer.astro   # Bilingual disclaimer + copyright
    │   │   ├── Hero.astro     # Name, photo (CSS mask fade), tagline, resume CTA
    │   │   ├── About.astro    # Bio + tech categories (bilingual)
    │   │   ├── Education.astro # School, awards, certificates, languages (bilingual)
    │   │   ├── Campus.astro   # Campus activities (bilingual)
    │   │   ├── Contact.astro  # Email CTA + social links (bilingual)
    │   │   ├── ThemeToggle.astro  # Dark/light toggle (event delegation, <style is:global>)
    │   │   ├── LangToggle.astro   # EN/ZH toggle (event delegation, localStorage)
    │   │   └── SectionHeading.astro  # Reusable heading (single-lang, legacy)
    │   └── react/             # Interactive React Islands
    │       ├── ExperienceTimeline.tsx  # Bilingual timeline container
    │       ├── TimelineCard.tsx        # Expand/collapse card with Framer Motion
    │       ├── ProjectGrid.tsx         # Project cards grid
    │       ├── ProjectCard.tsx         # Hover effects, status badge
    │       └── ScrollReveal.tsx        # Reusable fade-in wrapper
    ├── styles/
    │   ├── global.css         # Tailwind imports, oklch theme tokens, glass utilities, bilingual CSS
    │   └── fonts.css          # @font-face declarations
    └── lib/
        ├── constants.ts       # SITE metadata, SOCIAL_LINKS, NAV_ITEMS, EDUCATION
        └── i18n.ts            # ★ Central bilingual content: UI strings + EXPERIENCES data
```

### Component Architecture

| Component | Type | Hydration | Key Feature |
|-----------|------|-----------|-------------|
| Header | Astro | `<script is:inline>` | Event delegation for mobile menu, theme & lang toggles |
| Hero | Astro | None | CSS `mask-image` gradient for photo fade effect |
| About, Education, Campus, Contact, Footer | Astro | None | Bilingual via `data-lang` spans |
| ThemeToggle | Astro | `<script is:inline>` | `<style is:global>` to avoid Astro CSS scoping |
| LangToggle | Astro | `<script is:inline>` | Toggles `data-site-lang` on `<html>`, persists to localStorage |
| ExperienceTimeline + TimelineCard | React | `client:visible` | Framer Motion staggered entrance, expand/collapse, bilingual |
| ProjectGrid + ProjectCard | React | `client:visible` | Hover effects, status badges |

### Bilingual System Design

**Approach**: CSS show/hide (not JS state management).

1. Both EN and ZH content rendered in HTML at build time via `<span data-lang="en">` / `<span data-lang="zh">`
2. CSS rules in `global.css` toggle visibility:
   ```css
   [data-site-lang="en"] [data-lang="zh"] { display: none !important; }
   [data-site-lang="zh"] [data-lang="en"] { display: none !important; }
   ```
3. Blocking `<script is:inline>` in `<head>` reads `localStorage` and sets `data-site-lang` before first paint — zero FOUC
4. `LangToggle.astro` button toggles the attribute and saves preference

**Why CSS-only**: Works without hydration, survives Astro View Transitions, zero JS framework dependency, instant switching.

**Data source**: `src/lib/i18n.ts` exports `UI` (all UI strings) and `EXPERIENCES` (parallel EN/ZH arrays). EN data from English resume, ZH data from Chinese resume, aligned in granularity.

### Design System

**Theme**: Dark-first, CSS Custom Properties via `[data-theme]`

- Dark mode = default (glassmorphism looks best on dark backgrounds)
- Light mode = `[data-theme="light"]` override
- All colors as oklch CSS custom properties
- No FOUC: inline script reads localStorage before first paint

**Glassmorphism**: `.glass` utility with `backdrop-filter: blur(20px) saturate(1.4)`

**Typography**: Geist Sans, 3 weights (400/500/600), self-hosted woff2

| Element | Desktop | Mobile |
|---------|---------|--------|
| Hero h1 | 4.5rem (-0.03em tracking) | 2.5rem |
| Section heading | 2.25rem | 1.5rem |
| Body | 1.125rem | 1rem |

---

## Milestones

### Milestone 1: Scaffold + Design Tokens + Shell ✅
- [x] Astro 5 project scaffold with React + Tailwind + MDX + Sitemap
- [x] `global.css` with oklch theme tokens, glass utilities
- [x] `fonts.css` with Geist Sans @font-face (3 weights)
- [x] `BaseLayout.astro` with theme init script, font preload
- [x] `Header.astro` with nav + `ThemeToggle.astro`
- [x] `Footer.astro` with copyright

### Milestone 2: Content + Static Sections ✅
- [x] `content.config.ts` with Astro 5 glob loader schemas
- [x] `constants.ts` with site metadata and social links
- [x] Hero section with profile photo (CSS mask fade effect)
- [x] About section with bio + tech categories
- [x] Education section with school, awards, certificates, languages
- [x] Campus activities section
- [x] Contact section with email CTA + social links

### Milestone 3: React Islands (Timeline + Projects) ✅
- [x] `ExperienceTimeline.tsx` with Framer Motion staggered entrance
- [x] `TimelineCard.tsx` with expand/collapse for tech stack
- [x] `ProjectGrid.tsx` + `ProjectCard.tsx` with hover effects
- [x] Wired Islands into `index.astro` with `client:visible`
- [x] Content populated from actual resumes (no placeholder data)

### Milestone 4: Bilingual System ✅
- [x] `i18n.ts` with all bilingual content from both resumes
- [x] `LangToggle.astro` component (event delegation, localStorage)
- [x] Bilingual CSS show/hide rules in `global.css`
- [x] Language init in `BaseLayout.astro` (blocking script)
- [x] All Astro components updated with `data-lang` spans
- [x] React components updated to accept bilingual props
- [x] `index.astro` wired to pass bilingual experience data
- [x] Build passes: 3 pages, 36 bilingual pairs, zero errors

### Milestone 5: Project Detail Pages + SEO 🔲
- [ ] Build `projects/[slug].astro` rendering MDX content (exists but needs polish)
- [ ] Build/enhance `SEO.astro` (OG tags, meta description, canonical URL)
- [ ] Add View Transitions via `<ClientRouter />` (already in BaseLayout)
- [ ] Sitemap via `@astrojs/sitemap` (already configured)
- [ ] Add bilingual support to project detail pages (if needed)

### Milestone 6: Polish + Deploy 🔲
- [ ] Responsive audit (mobile-first)
- [ ] Lighthouse audit (target: 95+ all categories)
- [ ] Add favicon, OG image
- [ ] Add English resume PDF alongside Chinese one
- [ ] Clean up legacy content files (experiences/*.md, about/bio.md)
- [ ] Deploy to Cloudflare Pages (or Vercel)
- [ ] Final audit: Code Reviewer + Security Engineer + Reality Checker

---

## Key Decisions Made

| Decision | Rationale |
|----------|-----------|
| Bilingual data in `i18n.ts` instead of content collections | Content collections are per-file; bilingual alignment requires parallel structure that's easier to maintain in a single TS file |
| CSS show/hide for language switching | Zero-JS, works with SSG, survives View Transitions, instant switching |
| Event delegation for toggles | Astro may render Header twice (desktop + mobile); `getElementById` breaks with duplicates |
| `<style is:global>` for ThemeToggle | Astro scoped CSS can't match selectors that cross component boundaries (`[data-theme]` is on `<html>`) |
| Profile photo with CSS `mask-image` | Smooth fade-to-background effect without image editing |

---

## Milestone 7: Design Language Evolution 🔲

> Based on senior design review of `design-proposals.html` (7 proposals).
> Status: **Awaiting user approval** before implementation.

### Design Review Summary

| # | Proposal | Verdict | Priority | Effort |
|---|----------|---------|----------|--------|
| 01 | Serif Display Typography | **ADOPT** | P0 | Medium |
| 02 | Warm+Cool Dual Color System | **ADOPT** (with restraint) | P0 | Low |
| 03 | Hero CTA Hierarchy | **ADOPT** (modified) | P0 | Medium |
| 04 | Section Heading Variation | **ADOPT** | P1 | Medium |
| 05 | Card Language Diversity | **ADOPT** | P1 | Medium |
| 06 | Micro-interactions | **PARTIAL ADOPT** | P2 | High |
| 07 | Timeline & Nav Redesign | **ADOPT** | P2 | High |

### Detailed Review

#### 01 — Serif Display Font: ADOPT

**Diagnosis is correct.** Geist Sans alone cannot carry both the "finance authority" and "tech precision" signals your positioning requires. A serif display face for headings immediately elevates the site from "nice dev portfolio" to "branded personal identity."

**Recommendation**: Instrument Serif (Google Fonts, self-host as woff2). Three-layer type system:
- **Display (Serif)**: Hero name, section headings — `font-weight: 400`, `letter-spacing: -0.02em`
- **Body (Sans)**: Geist Sans stays — paragraph text, card content, UI labels
- **Data (Mono)**: JetBrains Mono or Geist Mono — dates, status badges, tech tags, metadata

**Caveat**: Must self-host (not CDN) to maintain perf. Test Chinese character fallback — serif + 宋体 vs serif + 黑体 pairing needs manual verification. Consider `font-display: swap` for serif only since it's display-size and flash is acceptable.

**Files to change**: `fonts.css` (add @font-face), `global.css` (typography tokens), `Hero.astro` (name), all `SectionHeading` usages, `TimelineCard.tsx` (if role title uses serif).

#### 02 — Dual Color System: ADOPT with restraint

**Diagnosis is correct.** Single accent blue across the entire site creates visual flatness. The semantic color mapping (blue=action, amber=in-progress, teal=completed) is the right framework.

**Recommendation**: Add two oklch tokens:
```css
--color-accent-warm: oklch(0.75 0.14 55);   /* amber — "in progress", "dynamic" */
--color-accent-teal: oklch(0.72 0.12 165);   /* teal — "completed", "verified" */
```

**Where to apply** (sparingly):
- Status badges: "In Progress" = amber, "Completed" = teal (already partially there)
- Timeline dots: colored by experience type (aligns with Proposal 07)
- Section heading accent elements: alternate blue/teal/amber across sections
- Hero particle mouse-glow in light mode could use warm amber instead of cool blue

**Where NOT to apply**: Don't create gradient strips between sections, don't make every interactive element multicolored. The power of the dual system is in its selective deployment.

#### 03 — Hero CTA Hierarchy: ADOPT (modified)

**Diagnosis is correct.** 5 equal-weight stacked glass buttons is poor information architecture — no clear primary action.

**My modification**: The proposal suggests "1 primary + 3 ghost buttons inline." I'd go further:

- **1 primary CTA**: "Download Resume" — solid fill, accent color, pill shape
- **3 icon-only buttons**: GitHub / LinkedIn / Email — small circular icon buttons, subtle border, horizontal row beneath the primary CTA
- **Remove**: The detail text under each button (e.g., "github.com/zzzhhn") — this info exists in Contact section
- **Layout**: Switch from vertical stack (300px+ height) to compact horizontal arrangement (~80px height), freeing vertical space for a 1-line bio summary or the tagline to breathe

**Why not ghost buttons with text labels**: At hero scale, even ghost buttons with text compete with the primary CTA. Icon-only secondary actions are standard (see: stripe.com, linear.app personal landing pages).

**Files to change**: `Hero.astro` (HTML + CSS restructure), remove glass-hover from CTAs.

#### 04 — Section Heading Variation: ADOPT

**Diagnosis is correct.** 6× identical centered-sans-heading-with-blue-bar creates visual fatigue on a long scroll.

**Recommendation**: Define 3 heading variants:
- **Editorial** (serif display + mono label): For narrative sections — About, Education
- **Numbered + Line** (number + title + gradient line): For list sections — Experience, Projects
- **Minimal centered** (current style): For short sections — Campus, Contact

Add section numbering (`01 / 02 / 03 ...`) — creates editorial magazine quality and subtle wayfinding.

**Implementation**: Create a `SectionHeading` variant system via props (`variant="editorial" | "numbered" | "minimal"`), or just hardcode per section since there are only 6.

**Files to change**: `SectionHeading.astro` (or inline per section), `global.css` (heading variant styles).

#### 05 — Card Language Diversity: ADOPT

**Diagnosis is correct.** When every container uses `.glass`, glass becomes the default and loses its "premium" signal. This is the visual equivalent of "if everything is bold, nothing is bold."

**Recommended card vocabulary**:
| Card Type | Style | Used For |
|-----------|-------|----------|
| Glass | `backdrop-filter + border + specular` | Header, Hero CTA only |
| Solid | `bg-card + border` | Project cards (main content deserves visual weight) |
| Outline | `transparent bg + border` | Tech categories, awards, certificates |
| Accent-border | `bg-card + left 3px accent border` | Timeline entries |

**Principle**: Visual weight correlates with content importance. Glass = floating/ambient, Solid = grounded/important, Outline = lightweight/informational, Accent-border = sequential/guided.

**Files to change**: `global.css` (new card utility classes), `Education.astro`, `About.astro`, `TimelineCard.tsx`, `ProjectCard.tsx`.

#### 06 — Micro-interactions: PARTIAL ADOPT

**Cherry-pick the high-impact items, skip the decorative ones.**

| Sub-feature | Verdict | Why |
|------------|---------|-----|
| Cursor proximity glow (Raycast-style border) | **ADOPT** | High impact, ~30 lines of JS, works with existing glass system |
| Staggered scroll reveals | **ADOPT** | Already have `--stagger-index` in CSS, just needs wiring |
| Magnetic buttons | **SKIP** | Feels gimmicky on a professional portfolio; risks "overdesigned" perception |
| Nav underline grow animation | **DEFER** | Nice-to-have but low priority |
| Gradient overlay sweep on card hover | **DEFER** | Complex to implement well; diminishing returns |

**Cursor proximity glow implementation**: Single `mousemove` listener on document, calculate distance to each `.glass` / `.card` element, set `--glow-opacity` CSS custom property. Border color transitions from `var(--color-border-subtle)` to `var(--color-accent-primary)` based on distance. ~30 lines, no library needed.

#### 07 — Timeline & Nav: ADOPT

**Timeline redesign**:
- Date as independent left column (mono font, right-aligned) — 3-column layout: `date | dot | card`
- Colored dots by experience type, using Proposal 02's color tokens
- This requires changes to `ExperienceTimeline.tsx` + `TimelineCard.tsx`
- Bilingual dates should stay numeric (`2026.02`) so no i18n change needed

**Nav scroll spy**:
- `IntersectionObserver` on each `<section>`, update active nav item
- Add pill background to active nav link
- Pure JS in `Header.astro` `<script is:inline>` (no React needed)
- Logo "HZ" → "HZ." in mono weight for better small-size legibility (drop gradient clip)

### Implementation Phases

**Phase A (P0 — Foundation changes)**:
1. Self-host Instrument Serif font (woff2) → `fonts.css` + `BaseLayout.astro` preload
2. Add oklch color tokens for warm + teal accents → `global.css`
3. Apply serif font to Hero name + section headings
4. Restructure Hero CTA to 1 primary + 3 icon buttons
5. `pnpm build` verification

**Phase B (P1 — Visual vocabulary)**:
1. Create 3 section heading variants + add numbering
2. Implement card vocabulary (glass/solid/outline/accent-border)
3. Reassign card styles per section (Education=outline, Projects=solid, Timeline=accent-border)
4. `pnpm build` verification

**Phase C (P2 — Interactions & layout)**:
1. Add cursor proximity glow (document-level mousemove listener)
2. Wire staggered scroll reveals with animation-delay
3. Redesign timeline layout (date column + colored dots)
4. Add nav scroll spy with IntersectionObserver
5. Update logo "HZ" → "HZ." mono style
6. `pnpm build` + visual regression check

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `backdrop-filter` performance on mobile | Reduce blur radius on mobile, add `will-change: transform` |
| Framer Motion bundle too large | Tree-shake: `import { motion } from 'framer-motion'` only |
| Bilingual content drift (EN/ZH out of sync) | Single `i18n.ts` file with parallel arrays, easy to diff |
| Legacy content files causing confusion | Clean up in Milestone 6; they're unused but still exist |

---

## Verification Plan

After each milestone:
1. `pnpm build` — zero errors
2. `pnpm preview` — visual check in browser
3. Bilingual check: toggle EN↔ZH, verify all sections switch
4. After Milestone 6: Lighthouse CI — all scores 95+

Final audit: dispatch Code Reviewer + Security Engineer + Reality Checker agents in parallel.
