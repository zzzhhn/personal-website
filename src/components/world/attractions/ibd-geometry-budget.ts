/** Authored geometry allocation for the accepted three sheds/racks and the
 * single near beam + directional storage-crate sample (2026-11-03).
 * The actual production static draw measures 48,175 triangles. The existing
 * four-carton/one-rig fixture, conservatively retaining the separate 2,200-face
 * legacy equipment fallback, measures 75,813. These are measured source bounds,
 * not loaded-GLB scene totals, GPU cost or an FPS guarantee. Any family expansion
 * must be remeasured; these limits cover only the accepted single samples.
 */
export const IBD_GEOMETRY_BUDGET = { static: 48_500, representative: 76_000 } as const;
