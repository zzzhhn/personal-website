/** Full IBD asset-family allocation (2026-11-06).
 * Production static draw: 94,231 triangles; four-carton/one-rig authored
 * fixture including the 2,200-triangle legacy equipment fallback: 123,437.
 * Covers all warehouse cases, truck wheels/chassis, roller supports, planted
 * beds, railings and the existing three-shed structure. Native GLB instances
 * and shadow submissions are counted separately in runtime measurements.
 * These source bounds do not imply a frame-rate guarantee.
 */
export const IBD_GEOMETRY_BUDGET = { static: 95_000, representative: 124_000 } as const;
