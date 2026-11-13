import type { FactoryAction } from './factory-game';
import type { FactoryStationId } from './factory-layout';
export const FACTORY_STATION_NAMES:Record<FactoryStationId,[string,string]>={
  raw:['磁吊取料','Magnetic intake'],batch:['编组托盘','Batch tray'],routing:['分流道岔','Line switch'],
  frame:['底盘压机','Frame press'],wheels:['轮组加工','Wheel line'],shell:['外壳成形','Shell forming'],
  assembly:['试装夹具','Assembly jig'],test:['单机试验','Test lane'],compare:['双机比较','Twin trial'],
  rework:['模块返工','Module return'],finish:['总装与终检','Finishing'],release:['出厂台','Dispatch'],
};
export const FACTORY_MODULE_NAMES={frame:['底盘','frame'],wheels:['轮组','wheels'],shell:['外壳','shell']} as const;
export const FACTORY_STATION_PURPOSE:Record<FactoryStationId,[string,string]>={
  raw:['造一台能陪你走动的机械伙伴。三种原料会变成底盘、轮组和外壳。','Build a companion that can walk with you. These blanks become its frame, wheels and shell.'],
  batch:['选一组取舍，先试跑再决定。轻快型目标速度更高；稳健型重心更低、抓地更强，目标速度较低。实际表现由路试决定。','Choose a trade-off, then test it. Nimble targets higher speed. Steady has a lower center of mass and more grip, with a lower target speed. The course decides the outcome.'],
  routing:['把同一批原料分送到三条加工线；选错了可以退回重排。','Send this batch to its three production lines. A wrong turn can be reversed.'],
  frame:['底盘承载伙伴的重量，也决定它在坡上怎样倾斜。','The frame carries the weight and affects how the companion leans on slopes.'],
  wheels:['轮宽、抓地和悬挂会影响颠簸时的表现，下一站可以实际试出来。','Wheel width, grip and suspension affect the ride. Try the difference on the course.'],
  shell:['外壳最后才扣合。先把能跑的底盘试好，返工时不用整台重做。','Fit the shell after testing the running chassis, so changes do not require a complete rebuild.'],
  assembly:['把轮组装到底盘上，先造出能动的试验机。接下来由你挑路试。','Fit the wheels to the frame. Then choose a course for your working prototype.'],
  test:['想看爬坡、颠簸，还是带载表现？可以换试验，也可以回去改轮组。','Try slopes, bumps or an added load. Change the test or return to change the wheels.'],
  compare:['两台机器走相同的路。观察哪里开始出现差别，再决定要不要改装。','Both machines face the same course. Look for where they differ before choosing what to change.'],
  rework:['只拆需要改的部件，其它保留。换轮组后要重新试跑，旧结果不能替新配置作证。','Keep the parts that work. A changed wheel configuration needs a fresh trial.'],
  finish:['满意了再扣合外壳，并亲手测试急停。产品卡记录的是你这台伙伴的试跑。','Fit the shell when satisfied and test the emergency stop. The card records this companion’s actual trials.'],
  release:['带走这次造出的伙伴，也可以换个配置再造一台来比较。','Release your companion, or build another configuration to compare.'],
};
export function factoryActionLabel(a:FactoryAction,zh:boolean){
  const m='module' in a?FACTORY_MODULE_NAMES[a.module][zh?0:1]:'';
  switch(a.type){
    case 'extract':return zh?`吊取${m}`:`Collect ${m}`;
    case 'group':return a.config==='nimble'?(zh?'轻快型 · 轻底盘、窄轮、较高目标速度':'Nimble · light frame, narrow wheels, higher target speed'):(zh?'稳健型 · 宽轮、低重心、较低目标速度':'Steady · wide wheels, lower center of mass and target speed');
    case 'route':return a.line?(zh?`${m}送往加工线`:`Route ${m}`):(zh?`退回${m}`:`Return ${m}`);
    case 'process':return zh?`加工${m}`:`Process ${m}`;
    case 'trial-assemble':return zh?'试装底盘与轮组':'Fit frame and wheels';
    case 'test':return {slope:zh?'试爬坡能力':'Try the slopes',rumble:zh?'试颠簸时的稳定性':'Try stability over bumps',load:zh?`带 ${a.conditions.loadKg} kg 再爬坡`:`Climb with ${a.conditions.loadKg} kg`}[a.conditions.testKind];
    case 'rework':return a.config?(a.config==='steady'?(zh?'换稳健型宽轮配置':'Switch to Steady wide-wheel setup'):(zh?'换轻快型窄轮配置':'Switch to Nimble narrow-wheel setup')):(zh?`返工${m}`:`Rework ${m}`);
    case 'final-assemble':return zh?'扣合外壳':'Fit the shell';
    case 'inspect':return zh?'检查并生成产品卡':'Inspect and print';
    case 'release':return zh?'放行机械伙伴':'Release companion';
  }
}
