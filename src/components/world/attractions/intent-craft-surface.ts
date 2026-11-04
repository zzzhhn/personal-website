import { BufferAttribute, type BufferGeometry } from 'three';

export const INTENT_CRAFT = { roofSheet: 1, flashing: 2, roller: 3, powderCoat: 4, worktop: 5,
  entryFascia: 6, bedrock: 7, coping: 8, carrierCoat: 9, lookoutMetal: 10, carrierMetal: 11, runningSteel: 12, structuralCoat: 13, galvanized: 14, concreteBase: 15, rubber: 16, courtyardPaving: 17, mineralCladding: 18, matteSoffit: 19, tunnelRoof: 20, lookoutPaving: 21 } as const;
export const INTENT_CRAFT_ATTRIBUTE = 'intentCraftSurface';
const craftRoles = new WeakMap<BufferGeometry, number>();

/** A byte per vertex, zero for untouched parts. Never changes geometry or contacts. */
export function markIntentCraft(geometry: BufferGeometry, surface: number) {
  craftRoles.set(geometry, surface);
}

const trackSurfaceRoles = {
  runningSteel: INTENT_CRAFT.runningSteel,
  spineCoat: INTENT_CRAFT.structuralCoat,
  tieCoat: INTENT_CRAFT.structuralCoat,
  railSeat: INTENT_CRAFT.galvanized,
  supportCoat: INTENT_CRAFT.structuralCoat,
  connectionSteel: INTENT_CRAFT.galvanized,
  grout: INTENT_CRAFT.concreteBase,
} as const;

/** The short-span generator calls this after adding the final, non-indexed part. */
export const COASTER_TRACK_CRAFT = {
  mark(geometry: BufferGeometry, surface: keyof typeof trackSurfaceRoles) {
    markIntentCraft(geometry, trackSurfaceRoles[surface]);
  },
};

const structureRoles = {
  runningSteel: INTENT_CRAFT.runningSteel,
  structuralCoat: INTENT_CRAFT.structuralCoat,
  galvanized: INTENT_CRAFT.galvanized,
  concreteBase: INTENT_CRAFT.concreteBase,
} as const;

function roleFor(part: BufferGeometry) {
  const role: unknown = part.userData.coasterCraftRole;
  return craftRoles.get(part) ?? (typeof role === 'string' && Object.hasOwn(structureRoles, role)
    ? structureRoles[role as keyof typeof structureRoles] : 0);
}

export function attachIntentCraftBatch(parts: readonly BufferGeometry[]) {
  if (!parts.some(roleFor)) return;
  for (const part of parts) {
    const tag = new Uint8Array(part.getAttribute('position').count);
    tag.fill(roleFor(part));
    part.setAttribute(INTENT_CRAFT_ATTRIBUTE, new BufferAttribute(tag, 1));
  }
}

/** These static parts are already in metre coordinates. The roof runs along Z;
 * the intake rollers run along X, so their brush lines vary across the YZ section.
 * Explicit source roles avoid guessing material from a shared palette colour. */
export const INTENT_CRAFT_VERTEX = `
attribute float ${INTENT_CRAFT_ATTRIBUTE};
varying float vIntentCraft;
varying vec3 vIntentCraftPoint;
varying vec3 vIntentCraftNormal;
`;
export const INTENT_CRAFT_FRAGMENT = `
varying float vIntentCraft;
varying vec3 vIntentCraftPoint;
varying vec3 vIntentCraftNormal;
struct IntentFinish { vec3 pigment; float roughness; float metalness; };
float intentMineralHash(vec2 cell) { return fract(sin(dot(cell, vec2(41.7, 289.1))) * 21321.137); }
float intentMineral(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(intentMineralHash(cell), intentMineralHash(cell + vec2(1, 0)), f.x),
    mix(intentMineralHash(cell + vec2(0, 1)), intentMineralHash(cell + vec2(1, 1)), f.x), f.y);
}
IntentFinish intentFinish(vec3 pigment, float rough, float metal) {
  vec3 p = vIntentCraftPoint;
  vec3 n = normalize(vIntentCraftNormal);
  if (vIntentCraft > 20.5 && vIntentCraft < 21.5) {
    if (n.y < 0.7) return IntentFinish(pigment, rough, metal);
    // The horizontal approach shares the deck projection. For a slope, the
    // tangential projection of world up points along the actual incline.
    vec3 run = p.y > 8.5 ? vec3(0.0, 0.0, -1.0) : normalize(vec3(29.0, 0.0, -6.0));
    if (n.y < 0.999) run = normalize(vec3(0.0, 1.0, 0.0) - n * n.y);
    vec3 across = normalize(cross(run, n));
    vec3 fromLanding = p - vec3(105.0, 9.08, -175.0);
    vec2 panel = vec2(dot(fromLanding, run), dot(fromLanding, across)) / vec2(1.8, 1.3);
    vec2 edge = min(fract(panel), 1.0 - fract(panel));
    vec2 footprint = fwidth(panel);
    vec2 seam = 1.0 - smoothstep(vec2(0.012), vec2(0.023) + footprint, edge);
    float visible = 1.0 - smoothstep(0.08, 0.32, max(footprint.x, footprint.y));
    float variation = intentMineralHash(floor(panel));
    float layer = mix(1.0, mix(0.92, 1.08, variation) - 0.27 * max(seam.x, seam.y), visible);
    return IntentFinish(pigment * layer, 0.94, 0.0);
  }
  if (vIntentCraft > 19.5 && vIntentCraft < 20.5) {
    if (n.y < -0.45) return IntentFinish(pigment * vec3(0.88, 0.91, 0.93), 0.90, 0.0);
    return IntentFinish(pigment, 0.53, 0.15);
  }
  if (vIntentCraft > 18.5 && vIntentCraft < 19.5) return IntentFinish(pigment, 0.9, 0.0);
  if (vIntentCraft > 17.5 && vIntentCraft < 18.5) {
    vec2 face = abs(n.x) > abs(n.z) ? p.zy : p.xy;
    float mineral = intentMineral(face * 1.8);
    return IntentFinish(pigment * mix(0.94, 1.04, mineral), 0.88, 0.0);
  }
  if (vIntentCraft > 16.5 && vIntentCraft < 17.5) {
    vec2 panel = (p.xz - vec2(21.5, -139.0)) / vec2(2.5, 2.25);
    vec2 edge = min(fract(panel), 1.0 - fract(panel));
    vec2 seam = 1.0 - smoothstep(vec2(0.004), vec2(0.014) + fwidth(panel), edge);
    float variation = intentMineralHash(floor(panel));
    vec3 paving = pigment * mix(0.94, 1.05, variation);
    return IntentFinish(paving * (1.0 - 0.25 * max(seam.x, seam.y)), 0.91, 0.0);
  }
  if (vIntentCraft > 15.5 && vIntentCraft < 16.5) return IntentFinish(pigment, 0.93, 0.0);
  if (vIntentCraft > 11.5 && vIntentCraft < 15.5) {
    if (vIntentCraft < 12.5) return IntentFinish(mix(pigment, vec3(0.38, 0.42, 0.44), 0.46), 0.30, 0.63);
    if (vIntentCraft < 13.5) return IntentFinish(pigment, 0.63, 0.06);
    if (vIntentCraft < 14.5) return IntentFinish(mix(pigment, vec3(0.36, 0.40, 0.42), 0.44), 0.46, 0.48);
    return IntentFinish(pigment, 0.88, 0.0);
  }
  if (vIntentCraft < 0.5) return IntentFinish(pigment, rough, metal);
  if (vIntentCraft < 1.5) {
    // Painted liner under the folded roof takes the existing warm station light
    // without returning a sharp specular streak into the approach camera.
    if (n.y < -0.65) return IntentFinish(pigment * 0.82, 0.91, 0.0);
    // Formed blue-gray sheet and a folded lower lip, within the existing profile.
    float panel = (p.x - 39.0) / 1.5;
    float joint = abs(fract(panel + 0.5) - 0.5);
    float seam = 1.0 - smoothstep(0.014, 0.030 + fwidth(panel), joint);
    float lip = (1.0 - smoothstep(7.36, 7.40, p.y)) * (1.0 - smoothstep(0.4, 0.8, abs(n.y)));
    vec3 sheet = mix(pigment, vec3(0.135, 0.222, 0.282), 0.67) * (1.0 - 0.24 * seam);
    return IntentFinish(mix(sheet, vec3(0.30, 0.34, 0.35), lip * 0.78), mix(0.54, 0.32, lip), mix(0.12, 0.61, lip));
  }
  if (vIntentCraft < 2.5 || vIntentCraft > 9.5) return IntentFinish(pigment, 0.34, 0.52);
  if (vIntentCraft < 3.5) {
    // Restrained brushed steel; the frequency fades before subpixel aliasing.
    float brush = (p.y + 0.31 * p.z) * 105.0;
    float strand = sin(brush) * (1.0 - smoothstep(0.8, 2.2, fwidth(brush)));
    vec3 steel = mix(pigment, vec3(0.51, 0.55, 0.57), 0.76);
    return IntentFinish(steel * (1.0 + 0.032 * strand), 0.31 + 0.034 * strand, 0.64);
  }
  if (vIntentCraft < 4.5) return IntentFinish(pigment * vec3(0.95, 1.04, 1.07), 0.76, 0.02);
  if (vIntentCraft < 5.5) return IntentFinish(pigment * 0.92, 0.46, 0.37);
  // Gate fascia in front of the station roof: coated field and a returned lip.
  // Keep the existing sign atlas, volume and opening completely unchanged.
  if (vIntentCraft < 6.5) {
    float returned = max(1.0 - smoothstep(6.92, 6.96, p.y), smoothstep(7.92, 7.97, p.y));
    vec3 coat = mix(pigment, vec3(0.10, 0.165, 0.205), 0.82);
    return IntentFinish(mix(coat, vec3(0.23, 0.29, 0.31), returned * 0.83), mix(0.55, 0.37, returned), mix(0.08, 0.5, returned));
  }
  if (vIntentCraft < 7.5) {
    vec2 mineralPlane = vec2(p.x + p.y * 0.62, p.z - p.y * 0.73);
    float grain = intentMineral(mineralPlane * 1.25);
    vec3 stone = mix(pigment, vec3(0.32, 0.295, 0.263), 0.29);
    return IntentFinish(stone * (0.88 + 0.22 * grain), 0.87 + 0.08 * grain, 0.0);
  }
  if (vIntentCraft < 8.5) return IntentFinish(mix(pigment, vec3(0.40, 0.36, 0.29), 0.26), 0.72, 0.0);
  return IntentFinish(mix(pigment, vec3(0.085, 0.145, 0.178), 0.65), 0.52, 0.12);
}
`;
