# Hero Positioning and Mobile Motion Pass

Date: 2026-08-01

## Goal

Add one stable professional positioning sentence to the Hero without adding another card or competing CTA. On mobile and coarse-pointer devices, remove decorative canvases and pointer-following effects while preserving content, language switching, theme switching, navigation, and intentional tap actions.

## Information hierarchy

1. Name
2. Stable professional positioning sentence
3. Animated domain signals
4. Personal voice
5. Skill chips and social links

The sentence uses a restrained accent rule rather than a glass container. This keeps it visually anchored while avoiding another surface in an already expressive Hero.

## Mobile motion boundary

Disabled at `max-width: 768px`, on coarse pointers, or when reduced motion is requested:

- Hero name pointer wave
- Hero particle canvas and its animation loop
- Global click-spark canvas and its animation loop
- About variable-proximity pointer tracking and continuous RAF loop
- Campus card pointer tilt

Preserved:

- Static content and typography
- Theme and language switching
- Navigation and project interaction
- Typewriter copy, which does not track the pointer
- CSS ambient background, which is substantially cheaper than the canvases

## UI/UX principles re-check

| Principle | Concrete application |
|---|---|
| Intent alignment | The stable sentence answers what Bobby builds before dynamic details appear. |
| Cognitive load | One sentence is added; no new card, badge group, or CTA is introduced. |
| Status visibility | The change does not introduce asynchronous product state. |
| Forgiveness | Existing language and theme controls remain reversible. |
| Affordance | Static positioning copy does not look interactive. |
| Good design disappears | The accent rule supports reading instead of becoming a new visual feature. |
| No manual required | The professional thesis is readable immediately without decoding the chips. |
| Respect time | Mobile canvases and pointer RAF loops do not initialize. |
| Honesty | The sentence describes demonstrated work across experience and projects. |
| One primary action | No additional competing action is added in this pass. |
| Traceability | The wording is stored in the bilingual UI data rather than duplicated in markup. |

## Cross-cutting conventions audit

| Convention | Check |
|---|---|
| i18n | `UI.hero.positioning` contains aligned English and Chinese copy. |
| Typography | Uses existing Hero font and color tokens. |
| Layout | Remains inside `.hero-content-side`; mobile switches the side rule to a top rule. |
| Navigation | No navigation behavior changes. |
| Theme | Uses theme-aware accent and text tokens. |
| Input | Fine-pointer effects are removed from coarse-pointer devices. |
| Reduced motion | The same paths are disabled when reduced motion is requested. |

## Acceptance

- Desktop light and dark Hero preserve the current profile-image composition.
- The English sentence fits without awkward orphaning at 1440px.
- The Chinese sentence fits without clipping or overlap.
- At 390px, both decorative canvases are absent from the DOM.
- At 390px, VariableProximityText registers no pointer tracking RAF loop.
- Type check and production build pass.
