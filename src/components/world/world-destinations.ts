/**
 * Featured places for first-visit wayfinding. Coordinates are read from the
 * shared layout contracts, never retyped. Copy describes play and place only;
 * portfolio facts stay in content cards.
 */
import { FACTORY, factoryLocal, type FactoryPoint, type FactoryStationId } from './factory/factory-layout';
import { FACTORY_WALK_NODES, factoryWalkingRoute } from './factory/factory-navigation';
import { INTENT_COASTER, IBD_YARD } from './attractions/attraction-layout';
import { ALPHA_MINE_ORIGIN } from './alpha-mine-layout';
import { CLUB } from './djc-club-layout';
import { ALPHA_MAINLAND_APPROACH } from './alpha-island/alpha-layout';

export type DestinationId = 'alpha' | 'factory' | 'coaster' | 'yard' | 'mine' | 'club';
type Copy = { zh: string; en: string };
export interface WorldDestination { id: DestinationId; at: [number, number]; name: Copy; detail: Copy }

/** The pier's boarding approach; the vessel itself berths at the dock head (z 109-112). */
const FERRY_BOARDING = ALPHA_MAINLAND_APPROACH[2];

export const WORLD_DESTINATIONS: readonly WorldDestination[] = [
  { id: 'alpha', at: [FERRY_BOARDING[0], FERRY_BOARDING[2]],
    name: { zh: '山岛渡口', en: 'Island ferry' },
    detail: { zh: '乘渡船上岛 · 海侧步道、水车、岩洞与山顶雪橇', en: 'Ferry across · coastal path, waterwheel, echo cave and summit sled' } },
  { id: 'factory', at: [FACTORY.entrance[0], FACTORY.entrance[2]],
    name: { zh: '机械伙伴工厂', en: 'Companion Works' },
    detail: { zh: '亲手取料、路试对比、返工与打印产品卡', en: 'Collect parts, compare trials, rework and print a product card' } },
  { id: 'coaster', at: [INTENT_COASTER.entrance[0], INTENT_COASTER.entrance[2]],
    name: { zh: '意图过山车', en: 'Intent Coaster' },
    detail: { zh: '分流工坊解谜 · 座舱视角过山车', en: 'Routing workshop puzzles · ride in the cabin view' } },
  { id: 'yard', at: [IBD_YARD.entrance[0], IBD_YARD.entrance[2]],
    name: { zh: '物资清点场', en: 'Inventory Yard' },
    detail: { zh: '钢卷与五金实测 · 吊装核验', en: 'Measure coils and hardware · hoist and verify' } },
  { id: 'mine', at: [ALPHA_MINE_ORIGIN[0], ALPHA_MINE_ORIGIN[2]],
    name: { zh: 'WorldQuant 因子矿场', en: 'WorldQuant factor quarry' },
    detail: { zh: '探测矿脉 · 投池回测对比', en: 'Probe the seams · backtest in the pool' } },
  { id: 'club', at: [CLUB.entrance[0], CLUB.entrance[2]],
    name: { zh: 'DJC 海边 Club', en: 'DJC Beach Club' },
    detail: { zh: '海边舞池 · 接管混音台', en: 'Seaside dance floor · take over the decks' } },
];
/** First-visit shortlist: the three largest hands-on experiences. */
export const FIRST_VISIT_DESTINATIONS: readonly DestinationId[] = ['alpha', 'factory', 'coaster'];
export const destination = (id: DestinationId) => WORLD_DESTINATIONS.find(d => d.id === id)!;
/** A waypoint "is" a destination when it sits on the same arrival point. */
export const destinationAt = (waypoint: readonly number[] | null) =>
  waypoint ? WORLD_DESTINATIONS.find(d => Math.hypot(d.at[0] - waypoint[0], d.at[1] - waypoint[1]) < 1)?.id ?? null : null;
/** Map anchor for the mainland ferry label (same boarding point as the destination). */
export const FERRY_MAP_MARK: [number, number] = [FERRY_BOARDING[0], FERRY_BOARDING[2]];

/** Walking route from where the visitor stands to a station. It joins the
 * surveyed aisle graph at the nearest node; the first leg walks to that node
 * when the visitor is not already on it. Returns [] when no route exists. */
export function factoryGuideRoute(x: number, z: number, to: FactoryStationId): FactoryPoint[] {
  const local = factoryLocal([x, FACTORY.floorY, z]);
  let from = 'entrance', best = Infinity;
  for (const [key, p] of Object.entries(FACTORY_WALK_NODES)) {
    const d = Math.hypot(p[0] - local[0], p[2] - local[2]);
    if (d < best) { best = d; from = key; }
  }
  const node = FACTORY_WALK_NODES[from];
  if (from === to) return best <= 1.8 ? [] : [[local[0], node[1], local[2]], [...node]];
  // The graph search accepts any node key; its signature only names the public start points.
  const route = factoryWalkingRoute(from as FactoryStationId | 'entrance', to);
  if (!route.length || best <= 1.8) return route;
  return [[local[0], node[1], local[2]], ...route];
}
