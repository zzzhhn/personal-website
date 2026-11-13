import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { Builder, cbox, bar, type Surf } from '../WorldStreetGeometry.ts';

export const FACTORY_ASSEMBLY_RAIL = { x: [17, 39], z: [-25, 27], top: 10.2 } as const;
type Palette = Record<'teal'|'amber'|'steel'|'silver'|'cream', Surf>;
export type FactoryGrip = 'frame'|'wheels'|'shell';
const GRIP = {
  frame: { height: .64, halfWidth: .235, depth: .62, jaw: .3 },
  wheels: { height: .38, halfWidth: .355, depth: .82, jaw: .28 },
  shell: { height: .75, halfWidth: .28, depth: .7, jaw: .32 },
};

/** Complete moving bridge, trolley and suspended gripper. Coordinates refer to
 * the part's contact plane; the lifting head sits above each module's geometry.
 * No geometry allocation or React state update occurs while travelling. */
export function buildFactoryAssemblyHoist(p: Palette) {
  const group = new Group(), bridge = new Group(), trolley = new Group(), gripper = new Group();
  group.name = 'factory-assembly-hoist'; bridge.name = 'assembly-moving-bridge';
  trolley.name = 'assembly-trolley'; gripper.name = 'assembly-module-gripper';
  group.add(bridge, trolley, gripper);
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .3 });
  const steel = new MeshStandardMaterial({ color: '#596966', roughness: .48, metalness: .5 });
  const geometries: Array<ReturnType<Builder['build']>> = [];
  const attach = (parent: Group, b: Builder) => {
    const geometry = b.build(); geometries.push(geometry);
    const mesh = new Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
  };
  const b = new Builder();
  for (const z of [-.43,.43]) {
    cbox(b, [28,10.65,z], [22,.35,.14], p.amber, .025);
    for (const y of [10.43,10.87]) cbox(b,[28,y,z],[22,.09,.32],p.amber,.015);
  }
  for (const x of FACTORY_ASSEMBLY_RAIL.x) {
    cbox(b,[x,10.64,0],[.65,.2,1.6],p.teal,.04);
    for (const z of [-.6,.6]) bar(b,[x-.2,10.38,z],[x+.2,10.38,z],.18,p.steel,12);
    cbox(b,[x,10.85,0],[.5,.3,.6],p.cream,.04);
  }
  attach(bridge,b);
  const c = new Builder();
  cbox(c,[0,11.18,0],[1.2,.18,1.35],p.teal,.04);
  for (const x of [-.4,.4]) for (const z of [-.43,.43])
    bar(c,[x,11.05,z-.09],[x,11.05,z+.09],.135,p.steel,10);
  cbox(c,[0,11.44,0],[.8,.34,.9],p.cream,.045);
  for (const x of [-.38,.38]) cbox(c,[x,10.52,0],[.1,1.2,.6],p.teal,.02);
  bar(c,[-.4,10.15,0],[.4,10.15,0],.24,p.steel,12);
  cbox(c,[.58,10.18,0],[.3,.4,.45],p.cream,.03);
  attach(trolley,c);
  const h = new Builder();
  cbox(h,[0,0,0],[.84,.14,.94],p.amber,.025);
  cbox(h,[0,.14,0],[.4,.15,.44],p.teal,.02);
  attach(gripper,h);
  const jawGeometry = new BoxGeometry(.06,1,1), ropeGeometry = new CylinderGeometry(.025,.025,1,6);
  geometries.push(jawGeometry,ropeGeometry);
  const jaws = [-1,1].map(() => {const m=new Mesh(jawGeometry,steel);m.castShadow=true;gripper.add(m);return m;});
  const ropes = [-1,1].map(() => {const m=new Mesh(ropeGeometry,steel);group.add(m);return m;});
  let disposed=false;
  function update(part: readonly number[], grip: FactoryGrip = 'shell') {
    if(disposed)return;
    const [x,y,z]=part, spec=GRIP[grip], head=y+spec.height;
    bridge.position.z=z; trolley.position.set(x,0,z); gripper.position.set(x,head,z);
    jaws.forEach((m,i)=>{m.position.set((i?1:-1)*spec.halfWidth,-.07-spec.jaw/2,0);m.scale.set(1,spec.jaw,spec.depth);});
    const bottom=head+.215,top=9.98;
    ropes.forEach((m,i)=>{m.position.set(x+(i?1:-1)*.14,(top+bottom)/2,z);m.scale.y=Math.max(.01,top-bottom);});
  }
  update([28,3.4,-4]);
  return { group,update,dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());material.dispose();steel.dispose();} };
}
