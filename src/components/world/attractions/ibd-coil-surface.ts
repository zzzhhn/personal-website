/** Physical mill coordinates on existing aSuv. No extra draws, textures or frame work. */
export const IBD_COIL_GLSL = /* glsl */`
varying vec2 vIbdCraftUv;
float ibdMillWave(float phase) {
  float fade = 1. - smoothstep(.2, .65, fwidth(phase));
  return sin(phase * 6.2831853) * fade;
}
float ibdTimberNoise(vec2 p) {
  vec2 cell=floor(p), f=fract(p);f=f*f*(3.-2.*f);
  vec4 n=fract(sin(vec4(dot(cell,vec2(127.1,311.7)),dot(cell+vec2(1,0),vec2(127.1,311.7)),
    dot(cell+vec2(0,1),vec2(127.1,311.7)),dot(cell+vec2(1,1),vec2(127.1,311.7))))*43758.5453);
  return mix(mix(n.x,n.y,f.x),mix(n.z,n.w,f.x),f.y);
}
vec3 ibdCoilFinish(vec2 uv, float code) {
  if (code < -3.5) {
    // Raised chequer plate in metres, filtered before it becomes subpixel.
    vec2 q = uv / .16;
    float tile = mod(floor(q.x) + floor(q.y), 2.);
    vec2 d = abs(fract(q) - .5);
    float ridge = 1. - smoothstep(.075, .13, tile < .5 ? d.x : d.y);
    ridge *= 1. - smoothstep(.28, .36, tile < .5 ? d.y : d.x);
    ridge *= 1. - smoothstep(.2, .7, max(fwidth(q.x), fwidth(q.y)));
    return vec3(.94 + .10*ridge, .54 - .08*ridge, .0018*ridge);
  }
  if (code < -2.5) {
    vec2 grainUv=uv*vec2(1.5,38.);
    float grain=ibdTimberNoise(grainUv)-.5;
    float fibre=(ibdTimberNoise(uv*vec2(4.,145.))-.5)
      *(1.-smoothstep(.4,1.2,max(fwidth(uv.x*4.),fwidth(uv.y*145.))));
    float variation=ibdTimberNoise(uv*vec2(.22,2.))- .5;
    return vec3(.96+.32*grain+.13*fibre+.08*variation,.83+.1*grain,.00065*fibre);
  }
  if (code > -1.5) {
    float r = length(uv);
    // A single tightly wound strip, with an irregular sheared edge. The seam
    // has no jump at atan's branch cut: its contribution is exactly one turn.
    float phase = (r - .65) * 35.2 - atan(uv.y, uv.x) / 6.2831853;
    float layers = ibdMillWave(phase);
    float mottling = sin(uv.x * 5.3 + sin(uv.y * 3.1)) * sin(uv.y * 6.7);
    return vec3(.96 + .034 * layers + .035 * mottling,
      .39 + .055 * layers + .025 * mottling, .00028 * layers);
  }
  float grain = ibdMillWave(uv.x * 95. + .3 * sin(uv.y * 4.));
  float broad = sin(uv.x * 5.8 + .5 * sin(uv.y * 2.3));
  return vec3(.98 + .025 * grain + .04 * broad, .35 + .05 * broad + .025 * grain, .00012 * grain);
}
vec3 ibdMillNormal(vec3 eye, vec3 n, float height, float direction) {
  vec3 dx = dFdx(eye), dy = dFdy(eye);
  vec3 rx = cross(dy, n), ry = cross(n, dx);
  float determinant = dot(dx, rx) * direction;
  vec3 gradient = sign(determinant) * (dFdx(height) * rx + dFdy(height) * ry);
  return normalize(abs(determinant) * n - gradient);
}
`;
