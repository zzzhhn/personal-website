/** Geometry allocation for the approved IBD v1 detail pass.
 * The reserve-workspace set allows 75k for two additional real sampling cartons.
 * Static geometry was 44,461 after the shed/store pass and is 46,141 with
 * the shaped cab; the static ceiling is unchanged. Only one inspection rig deploys
 * at a time. The expanded visible representative fixture measures about 72k.
 * These are authored mesh bounds, not a rendered-scene or FPS measurement.
 */
export const IBD_GEOMETRY_BUDGET = { static: 48_000, representative: 75_000 } as const;
