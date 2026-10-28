/** Geometry allocation for the approved IBD v1 detail pass.
 * The representative set keeps its original 70k ceiling (9056654).
 * Static geometry was 44,461 after the shed/store pass and is 46,141 with
 * the shaped cab; reserve 22k for the existing moving/inspection sample set.
 * These are authored mesh bounds, not a rendered-scene or FPS measurement.
 */
export const IBD_GEOMETRY_BUDGET = { static: 48_000, representative: 70_000 } as const;
