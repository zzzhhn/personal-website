import { ALPHA_STATIONS, alphaLocal } from './alpha-layout';
import { ALPHA_SHALLOWS, ALPHA_WATERWHEEL, ALPHA_CAVE_PATH } from './alpha-batch2-layout';

const copy = (zh: string, en: string) => ({ zh, en });
/** Paper-map suggestions, never a required order or a second completion store. */
export const ALPHA_TRAIL_STOPS = [
  { n: 1, name: copy('渡口小屋', 'Ferry lodge'), point: ALPHA_STATIONS.lodge,
    hint: copy('摇响门口铜铃，看看沙盘上的山路。出屋后沿山路去石滩，也可以先自由逛逛。', 'Ring the door bell and trace the mountain on the sand table. The uphill path leads to the shallows; explore at your own pace.') },
  { n: 2, name: copy('符文石滩', 'Rune shallows'), point: ALPHA_SHALLOWS.center,
    hint: copy('靠近石槽推拢符文石，试着拼出一座桥。旁边始终有可走的浅水便道，两条路都通向语法树。', 'Push the rune stones along their grooves to make a bridge. The shallow bypass stays open; both routes lead to the Grammar Tree.') },
  { n: 3, name: copy('语法树', 'Grammar tree'), point: ALPHA_STATIONS.tree,
    hint: copy('拉动树根钟绳，留意树枝的反应。接着可选水车或回声洞，两路最终都回到风口。', 'Pull the rope by the roots and watch the branches respond. Choose the waterwheel or the echo cave next; both paths rejoin at the wind slope.') },
  { n: 5, name: copy('三闸水车', 'Waterwheel'), point: ALPHA_WATERWHEEL.center,
    hint: copy('转动三道闸门，看轮斗能否稳稳提水。观察花和水幕的变化；不解机关也能沿原山路继续。', 'Turn the three sluices and help the buckets lift water steadily. Watch the flowers and curtain of water; the main trail remains open.') },
  { n: 6, name: copy('回声岩洞', 'Echo cave'), point: ALPHA_CAVE_PATH[0],
    hint: copy('取矿灯，敲铜磬，跟着回声和暖色矿环探索岔路。壁画侧室可以原路返回；通路出口接回风口山路。', 'Take a lamp, strike a chime and follow the echoes and warm rings. Return from the mural chamber by the same passage, or take the through-route toward the wind slope.') },
  { n: 7, name: copy('风口旗坡', 'Wind slope'), point: ALPHA_STATIONS.wind,
    hint: copy('扳动风闸，观察旗布和路牌怎样响应风。上山可乘旁边的缆车，也可以走盘山路。', 'Turn the wind gate and watch the flags and sign respond. Continue up by cable car or take the winding footpath.') },
  { n: 8, name: copy('四季缆车', 'Seasons cable'), point: ALPHA_STATIONS.cableUpper,
    hint: copy('在站台提示处按 E 乘坐。上站出站后沿山路去云上山顶，雪橇上站也在这段路旁。', 'Press E at the station prompt to ride. From the upper station, follow the path toward the cloud summit; the sled departure is beside this route.') },
  { n: 11, name: copy('云上山顶', 'Cloud summit'), point: ALPHA_STATIONS.summit,
    hint: copy('给石堆添一块石头，或从灯架取纸灯，带着走一段再放飞。想下山时沿来路找雪橇站或缆车站。', 'Add a stone to the cairn, or take a paper lantern, carry it and release it. Follow the approach path back to the sled or cable station to descend.') },
  { n: 12, name: copy('雪橇滑道', 'Sled trail'), point: ALPHA_STATIONS.sledLower,
    hint: copy('从山上站台登上雪橇滑回小屋附近。下车后可以继续逛山脚，或沿步道回渡口。', 'Board at the upper station for a descent to the lodge. After stepping off, explore the foothills or follow the path back to the ferry.') },
] as const;

export function nearestAlphaTrailStop(world: readonly number[]) {
  if (world.length < 3 || !world.slice(0, 3).every(Number.isFinite)) return 1;
  const p = alphaLocal(world);
  let closest: number = 1, distance = Infinity;
  for (const stop of ALPHA_TRAIL_STOPS) {
    // Full height matters: stacked summit and foothill paths are not adjacent.
    const d = Math.hypot(p[0] - stop.point[0], p[1] - stop.point[1], p[2] - stop.point[2]);
    if (d < distance) { distance = d; closest = stop.n; }
  }
  return closest;
}
