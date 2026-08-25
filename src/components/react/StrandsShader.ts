export const STRANDS_VERTEX = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

export const STRANDS_FRAGMENT = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec4 uWorld;
uniform vec3 uColors[3];
uniform float uSpeed;
uniform float uAmplitude;
uniform float uThickness;
uniform float uGlow;
uniform float uDpr;

out vec4 fragColor;

const float BLUE[7] = float[7](0.12, 0.62, 0.18, 0.68, 0.15, 0.58, 0.22);
const float GREEN[7] = float[7](0.52, 0.18, 0.58, 0.12, 0.55, 0.22, 0.48);
const float AMBER[7] = float[7](0.85, 0.38, 0.78, 0.42, 0.82, 0.35, 0.80);

float anchorAt(int strand, int index) {
  if (strand == 0) return BLUE[index];
  if (strand == 1) return GREEN[index];
  return AMBER[index];
}

float curveX(int strand, float y) {
  float position = clamp(y, 0.0, 0.99999) * 6.0;
  int index = int(floor(position));
  float t = fract(position);
  float eased = t * t * (3.0 - 2.0 * t);
  return mix(anchorAt(strand, index), anchorAt(strand, min(index + 1, 6)), eased);
}

void main() {
  float screenY = 1.0 - gl_FragCoord.y / uResolution.y;
  float worldY = uWorld.x + screenY * uWorld.w;
  float localY = worldY - uWorld.y;
  float rootHeight = max(uWorld.z, 1.0);
  float normalizedY = localY / rootHeight;

  if (normalizedY < 0.0 || normalizedY > 1.0) {
    fragColor = vec4(0.0);
    return;
  }

  float scrollStart = uWorld.y - uWorld.w * 0.8;
  float scrollEnd = uWorld.y + rootHeight - uWorld.w;
  float progress = clamp((uWorld.x - scrollStart) / max(scrollEnd - scrollStart, 1.0), 0.0, 1.0);
  float x = gl_FragCoord.x / uResolution.x;
  vec3 color = vec3(0.0);
  float alpha = 0.0;

  for (int strand = 0; strand < 3; strand++) {
    float stagger = float(strand) * 0.04;
    float strandProgress = clamp((progress - stagger) / (1.0 - stagger), 0.0, 1.0);
    float head = strandProgress;
    float reveal = 1.0 - smoothstep(head - 0.014, head + 0.003, normalizedY);

    float phase = float(strand) * 2.1;
    float wave = sin(localY * 0.0045 + uTime * uSpeed * (1.0 + float(strand) * 0.16) + phase);
    wave += 0.42 * sin(localY * 0.009 - uTime * uSpeed * 0.63 + phase * 1.7);
    float center = curveX(strand, normalizedY) + wave * 0.0065 * uAmplitude;
    float distancePx = abs(x - center) * uResolution.x;

    float coreWidth = (1.15 + float(2 - strand) * 0.28) * uDpr * uThickness;
    float core = 1.0 - smoothstep(coreWidth * 0.35, coreWidth * 1.55, distancePx);
    float filament = 1.0 - smoothstep(0.25 * uDpr, 0.9 * uDpr, abs(distancePx - coreWidth * 1.8));
    float halo = exp(-distancePx / (8.5 * uDpr)) * 0.48;
    float energy = (core + filament * 0.42 + halo) * reveal;

    color += uColors[strand] * energy;
    alpha = max(alpha, clamp(energy, 0.0, 1.0));
  }

  color = 1.0 - exp(-color * uGlow);
  fragColor = vec4(color, alpha * 0.9);
}
`;
