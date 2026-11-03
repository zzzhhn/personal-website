/** A metre-scale wood response for the marked crate pieces in the IBD static draw. */
export const IBD_STOCK_WOOD = /* glsl */`
float stockWoodHash(float x) {
  return fract(sin(x * 31.37 + 17.91) * 43758.5453);
}

float stockWoodNoise(vec2 p) {
  vec2 cell = floor(p), t = fract(p);
  t = t * t * (3. - 2. * t);
  float base = cell.x + 109. * cell.y;
  return mix(mix(stockWoodHash(base), stockWoodHash(base + 1.), t.x),
    mix(stockWoodHash(base + 109.), stockWoodHash(base + 110.), t.x), t.y);
}

float stockWoodFiltered(vec2 q) {
  float span = max(fwidth(q.x), fwidth(q.y));
  return mix(stockWoodNoise(q), .5, smoothstep(.36, 1.22, span));
}

vec4 stockWoodFinish(vec3 local, float role, float board, float baseRoughness) {
  vec3 p = local - vec3(14.5, 1.3, -23.);
  bool endGrain = role >= 10.;
  float axis = mod(role - 7., 3.);
  float along = axis == 0. ? p.x : axis == 1. ? p.y : p.z;
  // The transverse coordinate runs across the board on every exposed face.
  vec2 crossSection = axis == 0. ? p.yz : axis == 1. ? p.xz : p.xy;
  float crosswise = dot(crossSection, vec2(.85, .53));
  float grain, fibre, relief;
  if (endGrain) {
    vec2 centre = crossSection + vec2(.15 + .013 * board, -.21);
    float rings = length(centre * vec2(1., .77)) * 48.;
    float fade = 1. - smoothstep(.24, .85, fwidth(rings));
    grain = .5 + .5 * cos(rings * 6.283185 + stockWoodNoise(centre * 7.) * 2.) * fade;
    fibre = stockWoodFiltered(centre * 36. + board * .51);
    relief = 0.;
  } else {
    float bend = stockWoodNoise(vec2(along * 2.3 + board * 1.7, crosswise * 9.)) - .5;
    float bands = crosswise + bend * .041;
    grain = stockWoodFiltered(vec2(along * 1.9 + board * 2.31, bands * 35. + board * 11.));
    fibre = stockWoodFiltered(vec2(along * 6. + board * 1.87, bands * 122.));
    relief = (fibre - .5) * .00085;
  }
  float tint = endGrain ? .89 : .96;
  tint += .22 * (stockWoodHash(board + axis * 21.) - .5)
    + .39 * (grain - .5) + .20 * (fibre - .5);
  float rough = clamp(baseRoughness + (endGrain ? .09 : 0.) + .16 * (grain - .5), .6, .98);
  return vec4(tint, rough, 0., relief);
}
`;
