import type { Interactable } from '../../WorldInteract';
import type { Vec3 } from '../../types';
import type { TransportRoute } from '../../rides/ride-contract';
import { transportNames } from './transport-status';

export function transportStation(
  route: TransportRoute, source: 0 | 1, position: Vec3,
  parkedAt: () => 0 | 1, available: () => boolean, board: () => void, call: () => void,
): Interactable | null {
  if (route.kind === 'sled' && source === 1) return null;
  const name = transportNames[route.kind];
  const boardLabel = { zh: '搭乘' + name.zh, en: 'Board the ' + name.en };
  const callLabel = { zh: '呼叫' + name.zh, en: 'Call the ' + name.en };
  return {
    id: route.id + '-board-' + source, kind: 'board', position, radius: 2.1,
    get label() { return parkedAt() === source ? boardLabel : callLabel; },
    enabled: available,
    onInteract() {
      if (!available()) return;
      if (parkedAt() === source) board();
      else call();
    },
  };
}
