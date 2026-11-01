import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { BUILDINGS } from './layout';
import { experienceMonth } from './world-i18n';
import type { WorldExperience } from './types';

/** Numeric greybox signs use the browser's local font, with no font downloads.
 * Both languages have date-aligned slots, so these textures never depend on
 * live language/position updates or cause physics bodies to rerender. */
export default function WorldYears({ experiences }: { experiences: WorldExperience[] }) {
  const textures = useMemo(() => experiences.map(experience => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#263B48';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#E6DCCB';
      context.font = '600 52px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(experienceMonth(experience.startDate), 128, 50);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }), [experiences]);
  useEffect(() => () => textures.forEach(texture => texture.dispose()), [textures]);
  return <group name="source-experience-years">
    {BUILDINGS.map((building, index) => <mesh key={building.id} name={`year-${building.id}`}
      position={[building.position[0] + building.size[0] / 2 + 5.27, 3.25, building.position[2]]}
      rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[1.6, 0.6]} />
      <meshBasicMaterial map={textures[index]} toneMapped={false} />
    </mesh>)}
  </group>;
}
