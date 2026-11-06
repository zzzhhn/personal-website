/** Physical mill coordinates on existing aSuv. No extra draws, textures or frame work. */
export const IBD_COIL_GLSL = /* glsl */`
varying vec2 vIbdCraftUv;
float ibdMillWave(float phase) {
  float fade = 1. - smoothstep(.2, .65, fwidth(phase));
  return sin(phase * 6.2831853) * fade;
}
vec3 ibdCoilFinish(vec2 uv, float code) {
  if (code < -2.5) {
    float grain = ibdMillWave(uv.y * 18. + .3 * sin(uv.x * 2.1));
    float broad = sin(uv.y * 5. + sin(uv.x * 1.7));
    return vec3(.92 + .07 * grain + .1 * broad, .82 + .07 * broad, .0004 * grain);
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
