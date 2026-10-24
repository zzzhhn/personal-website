import { useEffect, useRef } from 'react';
import { useInteractable, type Interactable } from './WorldInteract';
import { registerNote } from './WorldCardContent';
import { useWorldStore, type WorldCard } from './store';
import type { Vec3 } from './types';

/** QA-only fixtures for the ui session (`?qa=1&uitest=1`): a few interactables beside the camp spawn that open each
 * card kind, so prompts / cards can be tested before the district sessions register their real objects. Never
 * mounted on the normal entry. Positions sit north of the fire, clear of the benches' line of sight. */
const FIXTURES: { id: string; at: Vec3; label: { en: string; zh: string }; card: WorldCard }[] = [
  { id: 'uitest-identity', at: [-46, 5.3, 37.2], label: { en: 'Tent · Who I am', zh: '帐篷 · 我是谁' }, card: { kind: 'about', id: 'identity' } },
  { id: 'uitest-education', at: [-46.9, 5.3, 38.3], label: { en: 'Desk · Education', zh: '书桌 · 教育' }, card: { kind: 'about', id: 'education' } },
  { id: 'uitest-languages', at: [-45.1, 5.3, 38.5], label: { en: 'Flags · Languages', zh: '小旗 · 语言' }, card: { kind: 'about', id: 'languages' } },
  { id: 'uitest-board', at: [-38, 5.3, 37.2], label: { en: 'Blackboard · Interactive Learning', zh: '黑板 · 交互式课程' }, card: { kind: 'project', id: 'interactive-learning-platforms', page: 0 } },
  { id: 'uitest-hunyuan', at: [-42, 5.3, 40.5], label: { en: 'Board · Latest internship', zh: '展板 · 最新实习' }, card: { kind: 'experience', id: '2026-09-24' } },
  { id: 'uitest-note', at: [-36.5, 5.3, 39.6], label: { en: 'Sign · Note', zh: '牌子 · 便签' }, card: { kind: 'note', id: 'uitest-note' } },
];

function Fixture({ f }: { f: typeof FIXTURES[number] }) {
  // The board owns its page (PRD 3.3: each press turns it); E on an open card closes it first (WorldActors), so the
  // next press opens the card on the following page. District sessions should keep the page on the object the same way.
  const page = useRef(-1);
  const item: Interactable = { id: f.id, position: f.at, radius: 2.4, kind: 'board', label: f.label,
    onInteract: () => {
      if (f.card.kind === 'project') { page.current++; useWorldStore.setState({ card: { ...f.card, page: page.current } }); }
      else useWorldStore.setState({ card: f.card });
    } };
  useInteractable(item);
  return null;
}

export default function WorldUiTest() {
  useEffect(() => registerNote('uitest-note', { title: { en: 'Test note', zh: '测试便签' }, body: { en: 'A QA fixture for the note card layout.', zh: '用于检查便签卡片版式的测试物。' } }), []);
  return <>{FIXTURES.map(f => <Fixture key={f.id} f={f} />)}</>;
}
