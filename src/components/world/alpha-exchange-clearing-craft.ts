import type { ExchangeGalleryCraftAPI } from './alpha-exchange-gallery-craft';

/** Fitted furniture behind the existing press. The rear aisle begins at z=-28;
 * all cabinet faces stay in front of it and clear of the east stair and gallery. */
export const EXCHANGE_CLEARING_LAMPS = [[10.8,3.94,-27.18],[12.6,3.94,-27.18]] as const;

export function buildExchangeClearingCraft({box,chamfer,rod}: ExchangeGalleryCraftAPI) {
  // Structural boards have their own thickness. Cabinet openings remain real
  // recesses; the press and moving stamp are not buried inside a decorative box.
  box([11.7,2.28,-27.76],[3.5,3.66,.1],'#5a4634','solid');
  for(const x of [9.98,13.42])box([x,2.28,-27.46],[.12,3.66,.66],'#72583c','solid');
  box([11.7,.55,-27.46],[3.56,.2,.68],'#5a4634','solid');
  chamfer([11.7,4.13,-27.46],[3.56,.18,.69],'#9a7952','solid',0,.024);
  for(const y of [1.33,2.75,3.44])box([11.7,y,-27.44],[3.32,.09,.59],'#9a7952','solid');
  // Doors hide the bottom storage; joinery, recessed fields and brass pulls are
  // shallow visual details within the case, not extra invisible blockers.
  for(const x of [10.8,12.6]) {
    box([x,.99,-27.18],[1.58,.58,.065],'#684e38','solid');
    box([x,.99,-27.136],[1.32,.39,.025],'#5a4634','visual');
    for(const dx of [-.72,.72])box([x+dx,.99,-27.125],[.065,.52,.045],'#9a7952','visual');
    for(const y of [.75,1.23])box([x,y,-27.125],[1.5,.055,.045],'#9a7952','visual');
    box([x,1.11,-27.092],[.28,.045,.035],'#b8975a','visual');
    // Differently filled pigeonholes make the storage legible from the floor.
    for(let row=0;row<2;row++) {
      const y=2.8+row*.69;
      box([x,y+.26,-27.42],[.055,.51,.55],'#72583c','visual');
      for(const side of [-1,1]) {
        const cx=x+side*.4;
        for(let sheet=0;sheet<2+(row+(side+1)/2)%3;sheet++) {
          box([cx,y+.05+sheet*.065,-27.38],[.58,.045,.38],'#d3c8aa','visual');
          box([cx,y+.073+sheet*.065,-27.38],[.6,.008,.4],row?'#536359':'#72583c','visual');
        }
        box([cx,y-.008,-27.125],[.23,.075,.025],'#b8975a','visual');
      }
    }
  }
  // The existing counter gains a framed front and a continuous foot rail.
  for(const x of [10.65,11.7,12.75]) {
    box([x,.84,-25.852],[.93,.59,.035],'#72583c','visual');
    box([x,.84,-25.829],[.75,.42,.018],'#5a4634','visual');
  }
  for(const y of [.5,1.17])box([11.7,y,-25.82],[3.17,.055,.045],'#9a7952','visual');
  rod([10.2,.63,-25.74],[13.2,.63,-25.74],.027,'#b8975a','visual');
  for(const x of [10.3,13.1])rod([x,.63,-25.86],[x,.63,-25.74],.022,'#b8975a','visual');
  // Compact ledger and paper guide sit to the left, beyond the flywheel sweep.
  for(let i=0;i<3;i++) {
    box([10.33,1.325+i*.055,-26.65],[.34,.045,.55],'#d3c8aa','visual');
    box([10.33,1.35+i*.055,-26.65],[.37,.012,.58],i===2?'#536359':'#72583c','visual');
  }
  // Static hoods and vertex-baked wash share the hall's existing material/night
  // channel. They introduce no light, frame callback, texture or shadow pass.
  for(const [x,y,z] of EXCHANGE_CLEARING_LAMPS) {
    chamfer([x,y,z],[1.42,.13,.29],'#536359','visual',0,.02);
    box([x,y-.072,z+.015],[1.18,.012,.22],'#efd8a8','visual',0,[0,.72,1]);
  }
}
