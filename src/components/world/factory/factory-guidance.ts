import { factoryActions, FACTORY_MODULES, type FactoryGame } from './factory-game.ts';
import type { FactoryStationId } from './factory-layout.ts';
import type { FactoryOperation } from './factory-operation.ts';

/** Once a prototype works, guidance offers experiments rather than one mandatory
 * arrow. Options use the real action gates; they cannot bypass assembly or QA. */
export function factoryExperimentRoutes(game:FactoryGame,current:FactoryStationId):FactoryStationId[]{
  if(!game.trialAssembled||game.finalAssembled||game.pending)return [];
  const actions=factoryActions(game),routes:FactoryStationId[]=[];
  if(actions.some(a=>a.type==='test'&&a.mode==='single'))routes.push('test');
  if(actions.some(a=>a.type==='test'&&a.mode==='comparison'))routes.push('compare');
  if(actions.some(a=>a.type==='rework'&&a.module==='wheels'))routes.push('rework');
  if(actions.some(a=>a.type==='final-assemble'))routes.push('finish');
  return routes.filter(r=>r!==current);
}

/** Follow the actual batch and configuration, never the order in which panels opened. */
export function nextFactoryStation(game:FactoryGame):FactoryStationId|null {
  if(game.released)return null;
  if(!game.batchId)return FACTORY_MODULES.some(m=>game.materials[m].status==='source')?'raw':'batch';
  for(const m of FACTORY_MODULES){
    if(game.parts[m])continue;
    return game.materials[m].status==='routed'&&game.materials[m].line===m?m:'routing';
  }
  if(!game.trialAssembled)return 'assembly';
  const completed=game.trials.filter(t=>t.status==='completed'&&t.configuration.id===game.configuration?.id
    &&FACTORY_MODULES.every(m=>t.configuration.parts[m]===game.parts[m]?.id));
  if(!completed.some(t=>t.mode==='single'))return 'test';
  if(!completed.some(t=>t.mode==='comparison'))return 'compare';
  return game.report?'release':'finish';
}

/** Phase-specific cues do not send the player back to aiming while the hook is lowering. */
export function factoryHoistCue(op:FactoryOperation,aligned:boolean,zh:boolean){
  const extract=op.action.type==='extract';
  switch(op.phase){
    case 'fetch':return zh?'吊臂正沿桥架前往出料端。':'The bridge hoist is approaching the outfeed.';
    case 'pickup':return extract?(zh?'磁吊正在吸取，等待升起。':'Picking up. Wait for the hoist to rise.'):
      (zh?'夹爪正下降至部件接口。':'Lowering the gripper onto the part.');
    case 'lift':return zh?'已夹紧，部件正在升起。':'Grip secured. Lifting the part.';
    case 'drop':return zh?'正在放入筛选槽。':'Lowering into the sorting hopper.';
    case 'outfeed':return zh?'料块正送往编组槽，磁吊正在归位。':'The blank is travelling to staging while the magnet returns home.';
    case 'seat':return zh?'正在扣合部件。':'Seating the part in its fixture.';
    case 'retract':return zh?'部件已贴合，空夹爪正在收回。':'Part seated. Retracting the empty gripper.';
    case 'home':return zh?'装配完成，吊臂正在归位。':'Assembly complete. Parking the hoist.';
    case 'carry':return extract?(aligned?(zh?'已对准筛选槽，按 E 放下。':'Over the hopper. Press E to lower.'):
      (zh?'W A S D 搬运到筛选槽，圆环变绿后按 E 放下。':'Move to the hopper with W A S D. Press E when the ring turns green.')):
      aligned?(zh?'已接近夹具，按 E 对中并扣合。':'At the fixture. Press E to center and seat.'):
      (zh?'W A S D 搬运到夹具，圆环变绿后按 E 扣合。':'Move to the fixture with W A S D. Press E when the ring turns green.');
    default:return aligned?(extract?(zh?'已对准料块，按 E 吸取。':'Aligned. Press E to pick up.'):
      (zh?'已对准出料部件，按 E 夹取。':'Over the outfeed part. Press E to pick up.')):
      (zh?'W A S D 移动吊头，对准目标圆环。':'Move the hoist with W A S D to the target ring.');
  }
}
