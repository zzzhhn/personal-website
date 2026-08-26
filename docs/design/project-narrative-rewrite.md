# Project Narrative Rewrite

Date: 2026-08-26

## Outcome

Rebuild the bilingual narrative for all six portfolio projects so the card, modal, and full-detail route communicate product judgment, end-to-end ownership, engineering depth, evidence, and current scope. Correct stale or unsupported claims before improving tone.

## Governance gate

1. **Added, removed, or inferred requirements:** no new product feature was added. The implementation introduces a shared narrative structure and corrects claims that conflict with current source repositories.
2. **Intended user-visible outcome:** recruiters, business leaders, engineering leaders, and independent builders should understand why each product matters, what Haonan owned, how it works, and where its verified boundary sits.
3. **Material ambiguity:** EvalForge had two repositories. The dashboard repository is used for product claims because its implementation matches the website; the public GitHub link is corrected accordingly. Interactive Learning Platforms has no unified local canonical repository, so the copy describes the four verified source applications without implying a single production codebase.

## Evidence standard

- Current source code, package metadata, tests, and repository state outrank prior website copy and planning documents.
- Plans, configured deployment targets, synthetic diagnostics, and local tests are not presented as user adoption, production scale, business impact, or independent security review.
- Quantitative facts appear only when they clarify system scope or design. Code-line totals and unverified latency figures are removed because they do not communicate product value.
- Maturity and maintenance badges remain the explicit status authority.
- Each project ends with a current-scope paragraph to prevent ambitious product language from becoming an implicit deployment or impact claim.

## Narrative architecture

### Card

- The tagline states the product thesis or user value, not the technology stack.
- Technology capsules use common industry terms and exact framework names.

### Modal

- The description explains product category, end-to-end system, and differentiating control mechanism.
- Highlights follow a product → ownership → technical depth → quality/reliability sequence.
- The shared heading is `Product & engineering highlights` / `产品与工程亮点`.

### Full detail

Each bilingual project route follows a consistent reading hierarchy:

1. Product thesis.
2. What I owned / 我的核心职责.
3. Project-specific system or decision layers.
4. Reliability, trust, delivery, or performance decisions.
5. Current scope / 当前边界.

## ATS and recruiter readability

The site is not treated as an ATS submission. Its content is nevertheless written so verified terms can be reused in a résumé, LinkedIn profile, or application form without translation loss.

- Use exact, common terms in context: Role-Based Access Control (RBAC), Music Information Retrieval (MIR), Bring Your Own Key (BYOK), Web Audio API, Applicant Tracking System (ATS), and framework versions where verified.
- Place skills inside accomplishment statements rather than creating a keyword dump.
- Pair tools with judgment and outcomes, for example `Glicko-2` with snapshot-consistent Arena evaluation or `AST validation` with controlled LLM execution.
- Avoid unsupported leadership verbs, revenue, adoption, performance, or scale claims.
- Preserve human readability and distinct project voice instead of forcing every paragraph into repetitive résumé bullets.

This follows the U.S. Department of Labor guidance to use job-relevant keywords inside achievement statements, include both full terms and abbreviations, and avoid relying only on a skills section: <https://www.dol.gov/sites/dolgov/files/VETS/files/ResumeEssentials_PG_Interactive_Feb2026.pdf>.

## Principles re-check

| Principle | Concrete application |
|---|---|
| Intent alignment | Cards answer why the project matters; modals answer what was built; detail routes answer how and why. |
| Cognitive load | Every project uses the same five-level reading hierarchy while retaining project-specific content. |
| Status visibility | Existing maturity and maintenance badges remain visible and each detail route states its scope. |
| Forgiveness | No interaction behavior changes; users can still close the modal or return from a detail page. |
| Affordance | `完整详情` continues to lead to the deeper evidence layer rather than repeating the modal. |
| Good design disappears | Copy hierarchy carries the experience without adding another UI pattern or decorative component. |
| No manual required | Product thesis and ownership appear before implementation details. |
| Respect time | Card and modal copy are concise; deeper technical evidence is reserved for the detail route. |
| Honesty | Stale versions, unverified latency, production-grade language, and implemented-integration overclaims are removed. |
| One primary action | Live remains primary in the modal, while Details remains the route for evidence and context. |
| Traceability | Important claims are grounded in current local source and repository evidence gathered in this work record. |

## Cross-cutting conventions audit

| Convention | Check |
|---|---|
| i18n | Frontmatter, highlights, headings, body copy, scope, and modal label have aligned English and Chinese versions. |
| Typography | Existing project card, modal, and prose styles remain unchanged. |
| Layout | No deck geometry, modal sizing, route wrapper, or navigation behavior changes. |
| Theme | Copy changes are theme-independent and preserve existing tokens. |
| Input | Pointer, keyboard, focus trap, close, and back navigation behavior remain unchanged. |
| Semantics | Project details retain semantic `h1`, `h2`, paragraphs, lists, and tables for browser and search parsing. |
| ATS reuse | Verified full terms, abbreviations, tools, and domain concepts appear naturally inside achievements. |
| Disclosure | Internal infrastructure, credentials, private taxonomies, user data, and unverified impact metrics remain excluded. |

## Acceptance

- All six project cards state a distinct product thesis in both languages.
- All six modals show aligned descriptions and product/engineering highlights.
- All six detail routes render one English and one Chinese narrative with explicit ownership and scope.
- Alpha uses Next.js 14 and 66 static operators; unsupported latency and dashboard-count claims are absent.
- EvalForge links to `evalforge-dashboard` and does not merge the separate Python framework into the dashboard product.
- Accompany does not present the optional 3D viewer or production readiness as the core value.
- Hepai uses 42 golden cases and does not claim implemented QQ Music integration or default beatmatching.
- Learning-platform copy does not claim zero dependencies, complete offline behavior, full bilingual coverage, or code-line volume as impact.
- DJC describes capability-aware recording without claiming universal Safari/Chromium success.
- Astro content validation, production build, desktop/mobile cards, modal copy, bilingual detail routes, and production URLs pass.
