import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { BoxGeometry, CylinderGeometry, RingGeometry, Group, Mesh, MeshStandardMaterial, CanvasTexture, SRGBColorSpace, PlaneGeometry } from 'three';
import { useWorldStore } from '../store';
import { night } from '../WorldNight';
import { createFactoryMaterial } from './factory-lighting';
import { buildFactoryCompanion } from './factory-companion';
import { FACTORY_MODULES, type FactoryModule } from './factory-game';
import { factoryActor, factoryControl, useFactoryStore, tickFactoryInspection } from './factory-store';
import { FACTORY_RAW_PICK, FACTORY_RAW_HALF_HEIGHT, FACTORY_MAGNET_HALF_HEIGHT, factoryToolAligned, FACTORY_LINE_Z, FACTORY_ASSEMBLY_PICK, FACTORY_ASSEMBLY_IDLE, FACTORY_CONVEYOR_TOP } from './factory-operation';
import { buildFactoryGantry } from './factory-gantry';
import { FACTORY_PALETTE } from './factory-geometry';
import { FACTORY } from './factory-layout';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../actor-physics';
import { buildFactoryAssemblyHoist } from './factory-assembly-hoist';
import { buildFactoryCarrier } from './factory-carrier';
import { factoryBatchPosition, factoryRoutingPath, factoryIntakePath, sampleFactoryRoute } from './factory-routing';
import type { FactoryPoint } from './factory-layout';
import { createFactoryFollower, stepFactoryFollower, type FactoryFollowerInput } from './factory-follower';

const LINE=FACTORY_LINE_Z;
/** Moving tools and actual separable companion modules, limited to the active facility. */
export default function WorldFactoryMechanisms(){
  const {world,rapier}=useRapier();
  const kind=useFactoryStore(s=>s.game.configuration?.kind??'nimble');
  const configId=useFactoryStore(s=>s.game.configuration?.id??null);
  const geometry=useMemo(()=>({raw:[new BoxGeometry(.62,.2,.72),new BoxGeometry(.52,.3,.52),new BoxGeometry(.58,.12,.7)],
    press:new BoxGeometry(3.8,.32,3.2),piston:new CylinderGeometry(.15,.15,1.4,12),guard:new BoxGeometry(3.9,.14,.12),
    magnet:new CylinderGeometry(.34,.42,.22,12),ring:new RingGeometry(.7,.78,32)}),[]);
  useEffect(()=>()=>{geometry.raw.forEach(g=>g.dispose());Object.values(geometry).forEach(g=>{if(!Array.isArray(g))g.dispose();});},[geometry]);
  const gantry=useMemo(()=>buildFactoryGantry(FACTORY_PALETTE),[]);
  useEffect(()=>()=>gantry.dispose(),[gantry]);
  const assemblyHoist=useMemo(()=>buildFactoryAssemblyHoist(FACTORY_PALETTE),[]);
  useEffect(()=>()=>assemblyHoist.dispose(),[assemblyHoist]);
  const follower=useMemo(()=>createFactoryFollower(useFactoryStore.getState().game.released),[configId]);
  const followInput=useMemo(()=>{
    const shape=new rapier.Ball(.5),from={x:0,y:0,z:0},travel={x:0,y:0,z:0},rotation={x:0,y:0,z:0,w:1};
    const input:FactoryFollowerInput={released:false,playerFootpoint:[0,0,0],movementClear(a,b){
      from.x=a[0]+FACTORY.origin[0];from.y=a[1]+FACTORY.origin[1]+.65;from.z=a[2]+FACTORY.origin[2];
      travel.x=b[0]-a[0];travel.y=b[1]-a[1];travel.z=b[2]-a[2];
      return !world.castShape(from,rotation,travel,shape,.005,1,true,rapier.QueryFilterFlags.EXCLUDE_SENSORS);
    }};return input;
  },[world,rapier]);
  const magnet=useRef<Group>(null),target=useRef<Mesh>(null);
  const routing=useMemo(()=>({position:[0,0,0] as FactoryPoint,
    paths:Object.fromEntries(FACTORY_MODULES.map(module=>[module,Object.fromEntries(FACTORY_MODULES.map(line=>[line,factoryRoutingPath(module,line)]))])) as Record<FactoryModule,Record<FactoryModule,FactoryPoint[]>>,
    intake:Object.fromEntries(FACTORY_MODULES.map(module=>[module,factoryIntakePath(module)])) as Record<FactoryModule,FactoryPoint[]>,
    batch:Object.fromEntries(FACTORY_MODULES.map(module=>[module,factoryBatchPosition(module)])) as Record<FactoryModule,FactoryPoint>}),[]);
  const raw=useRef<Array<Mesh|null>>([]),press=useRef<Array<Group|null>>([]),guard=useRef<Array<Mesh|null>>([]);
  const carriers=useMemo(()=>{
    const material=createFactoryMaterial(false,night);
    const meshes=FACTORY_MODULES.map(module=>{
      const carrier=buildFactoryCarrier(module,FACTORY_PALETTE),mesh=new Mesh(carrier.geometry,material);
      mesh.name=`factory-carrier-${module}`;mesh.castShadow=true;mesh.receiveShadow=true;
      return mesh;
    });return {meshes,material};
  },[]);
  useEffect(()=>()=>{carriers.meshes.forEach(mesh=>mesh.geometry.dispose());carriers.material.dispose();},[carriers]);
  const data=useMemo(()=>{
    const model=buildFactoryCompanion({configuration:kind,shell:true}),wheelGroup=model.wheelModule;
    model.group.remove(wheelGroup,model.shell);
    return {model,parts:{frame:model.group,wheels:wheelGroup,shell:model.shell},
      steel:createFactoryMaterial(false,night,{color:'#667875',rough:.58,metal:.4}),
      amber:createFactoryMaterial(false,night,{color:'#dba649',rough:.57,metal:.12}),
      lamp:new MeshStandardMaterial({color:'#8ad1b3',emissive:'#447762',emissiveIntensity:.4,roughness:.7})};
  },[kind]);
  useEffect(()=>()=>{data.model.dispose();data.steel.dispose();data.amber.dispose();data.lamp.dispose();},[data]);
  const plate=useMemo(()=>{
    if(!configId)return null;
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const c=canvas.getContext('2d')!;c.fillStyle='#ddd4bf';c.fillRect(0,0,512,128);c.fillStyle='#263b3c';c.font='bold 30px monospace';
    c.fillText('VR / COMPANION',16,45);c.font='24px monospace';c.fillText(configId.slice(-26),16,92);
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
    const mesh=new Mesh(new PlaneGeometry(.38,.095),new MeshStandardMaterial({map:texture,roughness:.7}));
    mesh.position.set(0,.38,-.407);mesh.rotation.y=Math.PI;mesh.userData.configurationId=configId;
    data.model.shell.add(mesh);return {mesh,texture};
  },[configId,data]);
  useEffect(()=>()=>{if(plate){data.model.shell.remove(plate.mesh);plate.texture.dispose();plate.mesh.geometry.dispose();plate.mesh.material.dispose();}},[plate,data]);
  useFrame((_,delta)=>{
    const {game}=useFactoryStore.getState(),op=factoryControl.operation,w=useWorldStore.getState();
    const foot=followInput.playerFootpoint as number[];
    foot[0]=factoryActor.position[0]-FACTORY.origin[0];
    foot[1]=factoryActor.position[1]-FACTORY.origin[1]-PLAYER_HALF_HEIGHT-PLAYER_RADIUS;
    foot[2]=factoryActor.position[2]-FACTORY.origin[2];
    followInput.released=game.released;followInput.paused=w.paused||w.poolInspect;followInput.hidden=document.hidden;
    followInput.operating=!!w.factoryStation||!factoryActor.available;
    stepFactoryFollower(follower,followInput,delta);
    const extraction=op?.action.type==='extract'?op:null;
    const rawTool=extraction?.tool??[-37,3.4,-19];
    if(magnet.current)magnet.current.position.set(rawTool[0],rawTool[1],rawTool[2]);
    gantry.update(rawTool);
    const assembly=op&&(op.action.type==='trial-assemble'||op.action.type==='final-assemble')?op:null;
    assemblyHoist.update(assembly?.tool??FACTORY_ASSEMBLY_IDLE,assembly?.assemblyModule??'shell');
    if(target.current){
      target.current.visible=!!assembly||!!extraction&&extraction.phase!=='outfeed';
      const operation=extraction??assembly;
      if(operation){target.current.position.set(operation.target[0],operation.target[1]+.19,operation.target[2]);
        data.lamp.color.set(factoryToolAligned(operation)?'#b7edc8':'#dba649');}
    }
    FACTORY_MODULES.forEach((module,i)=>{
      const mesh=raw.current[i],material=game.materials[module],part=data.parts[module];
      const processing=op?.action.type==='process'&&op.action.module===module?op:null;
      if(mesh){
        mesh.visible=!game.parts[module]&&processing?.phase!=='outfeed';
        if(extraction?.action.type==='extract'&&extraction.action.module===module&&extraction.attached){
          mesh.position.set(extraction.tool[0],extraction.tool[1]-FACTORY_MAGNET_HALF_HEIGHT-FACTORY_RAW_HALF_HEIGHT[module],extraction.tool[2]);
        }else if(extraction?.action.type==='extract'&&extraction.action.module===module&&extraction.phase==='outfeed'){
          sampleFactoryRoute(routing.intake[module],extraction.progress,routing.position);mesh.position.set(...routing.position);
        }else if(material.status==='source')mesh.position.set(...FACTORY_RAW_PICK[module]);
        else if(material.status==='routed')mesh.position.set(-27,FACTORY_CONVEYOR_TOP+FACTORY_RAW_HALF_HEIGHT[module],LINE[material.line??module]);
        else mesh.position.set(...routing.batch[module]);
        if(op?.action.type==='route'&&op.action.module===module&&op.phase==='cycle'){
          const line=op.action.line??material.line??module;
          sampleFactoryRoute(routing.paths[module][line],op.action.line?op.progress:1-op.progress,routing.position);
          mesh.position.set(...routing.position);
        }
      }
      // The ram underside meets the actual raw top, independently for each blank.
      const ramContact=FACTORY_CONVEYOR_TOP+FACTORY_RAW_HALF_HEIGHT[module]*2+.16;
      if(press.current[i])press.current[i]!.position.y=3.6-(processing?.stroke??0)*(3.6-ramContact);
      if(guard.current[i])guard.current[i]!.position.y=3.8-(processing?.guard??0)*1.9;
      const produced=!!game.parts[module]||processing?.phase==='outfeed';
      const carrier=carriers.meshes[i];
      carrier.visible=produced;carrier.position.set(...FACTORY_ASSEMBLY_PICK[module]);
      if(processing?.phase==='outfeed')carrier.position.x=-27+47*processing.progress;
      part.visible=produced&&!(game.pending?.action.type==='test')&&!game.released;
      part.rotation.set(0,0,0);
      part.position.set(...FACTORY_ASSEMBLY_PICK[module]);
      if(processing?.phase==='outfeed')part.position.x=-27+47*processing.progress;
      const retained=game.configurations.at(-1)?.parts[module]===game.parts[module]?.id&&!!game.parts[module];
      if((game.trialAssembled||retained)&&module!=='shell')part.position.set(24,1.14,-4);
      if(game.finalAssembled)part.position.set(24,1.14,-4);
      if(assembly){
        const current=assembly.assemblyModule;
        if(module===current&&assembly.attached)part.position.set(assembly.tool[0],assembly.tool[1],assembly.tool[2]);
        const seat=assembly.assemblyModules.indexOf(module);
        if(seat>=0&&seat<assembly.seated)part.position.set(24,1.14,-4);
      }
      if(game.released){part.visible=true;part.position.set(...follower.position);part.rotation.set(follower.pitch,follower.yaw,0,'YXZ');}
      if(op?.action.type==='rework'&&op.action.module===module&&op.phase==='cycle'){
        part.position.set(24-48*op.progress,1.4+Math.sin(op.progress*Math.PI)*2,-4-18*op.progress);
      }
      if(op?.action.type==='release'&&op.phase==='cycle'){
        const t=op.progress;
        if(t<.2)part.position.set(24,1.14+(3.5-1.14)*t/.2,-4);
        else if(t<.8){const f=(t-.2)/.6;part.position.set(24+13*f,3.5,-4+28*f);}
        else part.position.set(37,3.5-(3.5-.675)*(t-.8)/.2,24);
        if(module==='shell')assemblyHoist.update([part.position.x,part.position.y,part.position.z],'shell');
      }
    });
    if(game.released)data.model.wheels.forEach(wheel=>{wheel.rotation.x=follower.wheelDistance/(wheel.userData.radius as number);});
    const inspection=factoryControl.inspection;
    if(inspection&&!w.paused&&!w.poolInspect&&!document.hidden){
      const dt=Math.min(delta,.05),before=data.model.wheels[0].rotation.x;
      if(inspection.motor)data.model.wheels.forEach(wheel=>{wheel.rotation.x+=dt*8;});
      const gap=(module:FactoryModule)=>Math.hypot(data.parts[module].position.x-24,data.parts[module].position.y-1.14,data.parts[module].position.z+4);
      tickFactoryInspection({frameGap:gap('frame'),wheelGap:gap('wheels'),shellGap:gap('shell'),wheelCount:data.model.wheels.filter(wheel=>wheel.visible&&wheel.parent===data.parts.wheels).length,
        wheelSpeed:dt>0?(data.model.wheels[0].rotation.x-before)/dt:0,labelId:plate?.mesh.userData.configurationId??null},dt);
    }
  });
  return <group name="factory-live-mechanisms" dispose={null}>
    <primitive object={gantry.group}/>
    <primitive object={assemblyHoist.group}/>
    {FACTORY_MODULES.map((module,i)=><group key={module}>
      <mesh ref={m=>{raw.current[i]=m;}} material={data.steel} geometry={geometry.raw[i]} castShadow/>
      <group ref={g=>{press.current[i]=g;}} position={[-27,3.6,LINE[module]]}>
        <mesh material={data.steel} geometry={geometry.press} castShadow/>
        <mesh position={[0,.8,0]} material={data.steel} geometry={geometry.piston}/>
      </group>
      <mesh ref={m=>{guard.current[i]=m;}} position={[-27,3.8,LINE[module]-2.15]} material={data.amber} geometry={geometry.guard} castShadow/>
      <primitive object={data.parts[module]}/>
      <primitive object={carriers.meshes[i]}/>
    </group>)}
    <group ref={magnet}>
      <mesh material={data.amber} geometry={geometry.magnet} castShadow/>
    </group>
    <mesh ref={target} rotation={[-Math.PI/2,0,0]} material={data.lamp} geometry={geometry.ring}/>
  </group>;
}
