# Portfolio Closure Pass

Date: 2026-08-01

## Goal

Ship the approved Hero positioning, reduce mobile-only decorative work, disclose project maturity separately from maintenance, and add privacy-minimal interaction analytics. Remove public resume downloads and reduce Hero image transfer without degrading manual theme switching.

## Interaction decisions

- Mobile receives one dismissible desktop-experience hint. It never blocks navigation and stays dismissed locally after acknowledgement.
- Project cards expose two facts: delivery maturity and current maintenance. A reachable live URL is not treated as proof of active maintenance.
- Modal controls share a 44px minimum target, visible keyboard focus, consistent hover and pressed feedback, and the same radius and border vocabulary.
- Only six semantic event types are accepted by the server. Do Not Track and Global Privacy Control disable client collection.
- Analytics records event, project or section slug, language, theme, and coarse viewport class. It does not record IP addresses, user agents, URLs, free text, cookies, or persistent identifiers.

## Principles re-check

| Principle | Concrete application |
|---|---|
| Intent alignment | Hero states the professional thesis; project badges answer maturity and maintenance separately. |
| Cognitive load | Status is limited to two compact badges; the mobile recommendation appears once and is dismissible. |
| Status visibility | Maintenance is explicit instead of inferred from a Live link. |
| Forgiveness | The mobile hint can be dismissed immediately and does not alter navigation. |
| Affordance | Project controls share hover, pressed, focus, and 44px touch behavior. |
| Good design disappears | Theme image selection and idle preload operate without a loading UI or layout shift. |
| No manual required | Badge labels use plain professional language in both languages. |
| Respect time | Initial Hero loads one compressed theme image; the alternate warms during idle time. |
| Honesty | Accompany is a functional prototype and archived, not described as completed. |
| One primary action | The modal keeps Live visually primary while Details and GitHub remain secondary. |
| Traceability | Anonymous semantic events make interest measurable without profiling visitors. |

## Cross-cutting conventions audit

| Convention | Check |
|---|---|
| i18n | Hint and every status label have aligned English and Chinese copy. |
| Typography | Existing Geist and theme tokens are reused. |
| Layout | Hero geometry and project deck structure remain unchanged. |
| Navigation | No new route or mandatory redirect is introduced. |
| Theme | One responsive image follows the stored manual theme and preloads the alternate after load. |
| Input | Modal actions support pointer, touch, and visible keyboard focus. |
| Privacy | Event names and property values are server allowlisted; browser privacy signals are honored. |
| Deployment | Wrangler configuration is downloaded from the live Pages project before adding the Analytics Engine binding. |

Pages treats Analytics Engine bindings as non-inheritable. The binding is therefore declared at the top level for local development and repeated explicitly for `env.production` and `env.preview`.

## Acceptance

- Resume PDFs and original heavy profile images are absent from `dist`.
- Initial page load requests only the active theme profile image; the alternate may load after the window load event during idle time.
- Theme switching swaps to the matching image without changing its rendered geometry.
- At 390px, the hint is readable, dismissible, and does not create horizontal overflow.
- Project card and detail views show matching maturity and maintenance labels.
- `/api/events` rejects non-POST, cross-origin, oversized, malformed, or non-allowlisted events.
- Astro check, production build, Pages Function validation, and production-path smoke tests pass.
