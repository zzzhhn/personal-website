import { BUILDINGS } from './layout';
import { useWorldStore } from './store';
import { experienceMonth } from './world-i18n';
import type { WorldContent } from './types';

/** A DOM-only preview keeps live proximity/language updates outside Physics. */
export default function WorldExperienceSummary({ experiences }: { experiences: WorldContent['experiences'] }) {
  const position = useWorldStore(s => s.position);
  const lang = useWorldStore(s => s.lang);
  let closest = -1;
  let distance = 10;
  BUILDINGS.forEach((building, index) => {
    const x = building.position[0] + building.size[0] / 2 + 5;
    const d = Math.hypot(position[0] - x, position[2] - building.position[2]);
    if (d < distance) { closest = index; distance = d; }
  });
  const experience = experiences[lang][closest];
  return <aside className="world-experience" role="status" aria-live="polite" aria-atomic="true">
    {experience && <div key={`${closest}-${lang}`}>
      <span>{experienceMonth(experience.startDate)} · {experience.organization}</span>
      <p>{experience.role}</p>
    </div>}
  </aside>;
}
