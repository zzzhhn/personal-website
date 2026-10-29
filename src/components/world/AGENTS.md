# World visual calibration

For substantial new scenes or changes to their layout, modelling, materials or lighting, read [the visual calibration contract](../../../docs/world/phase-2-playground/visual-calibration-20261027/README.md) before implementing. Use the current user instruction over historical plans.

- Reference art comes before detailed modelling. Match the existing faceted world and character scale. Record the reference version and the user's actual approval scope; style approval does not automatically approve a new layout or ride.
- Run `node tools/world/check-visual-reference.mjs <manifest> --for-implementation` from the repository root before implementing a referenced redesign. Approval evidence comes from the human conversation, never a self-awarded aesthetic score. An explicit current instruction can update the manifest without asking again.
- First validate a playable spatial/ride sample, then build a representative art-and-lighting sample. Compare real daylight and midnight screenshots from the same frozen camera and exposure against the reference before propagating assets across the whole facility.
- Keep visual acceptance, gameplay, collision/camera safety and performance evidence separate. A passing build, test suite or beautiful generated image proves none of the other categories.
- Do not promote a visual redesign to the user's preview before these comparisons. Read the current manifest and human instructions for approval state; do not infer it from older handoff notes.
- Small correctness repairs that preserve the agreed visual direction do not need fresh concept art or new approval. Keep collaborators on explicitly owned files and record any deviation from the reference.

This is project workflow guidance, not an automated Git or CI enforcement hook. The checker validates assets and recorded approvals; it cannot certify taste, track connectivity, motion quality or performance.
