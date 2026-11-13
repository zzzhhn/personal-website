import { useEffect,useMemo } from 'react';
import { Float32BufferAttribute,BufferGeometry,Color,TextureLoader,RepeatWrapping,SRGBColorSpace } from 'three';
import { RigidBody,TrimeshCollider } from '@react-three/rapier';
import { alphaTerrainData,alphaPathDistance,alphaRadial,alphaNoise } from './alpha-terrain';
import { alphaMaterial } from './alpha-materials';
export default function AlphaTerrain(){
 const d=useMemo(()=>alphaTerrainData(),[]),textures=useMemo(()=>{const l=new TextureLoader();return ['grass_albedo.jpg','dirt_albedo.jpg','grass_nr.png','dirt_nr.png'].map((f,i)=>{const t=l.load('/assets/world/terrain/'+f);t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=4;if(i<2)t.colorSpace=SRGBColorSpace;return t;}).concat(['6f361f0d505ca603a6f05e5a.png','bcf66369ea932720bda81136.jpg','345303abbf4a10e5bd821ac7.png'].map((f,i)=>{const t=l.load('/assets/world/nature-camp-craft/textures/'+f);t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=4;if(i===0)t.colorSpace=SRGBColorSpace;return t;}));},[]),m=useMemo(()=>alphaMaterial('ground',textures),[textures]);
 const chunks=useMemo(()=>{const full=new BufferGeometry();full.setAttribute('position',new Float32BufferAttribute(d.positions,3));full.setIndex(Array.from(d.indices));full.computeVertexNormals();
 const normals=full.getAttribute('normal'),colors=new Float32Array(d.positions.length),mix=new Float32Array(d.positions.length),c=new Color(),grass=new Color('#73854d'),rock=new Color('#87908d'),sand=new Color('#c0a078'),snow=new Color('#d7e3e1'),path=new Color('#b49a73');
 for(let i=0;i<d.positions.length/3;i++){const x=d.positions[i*3],y=d.positions[i*3+1],z=d.positions[i*3+2],n=normals.getY(i);c.copy(rock).lerp(grass,Math.max(0,Math.min(1,(n-.82)*7)));if(y<4)c.lerp(sand,.72);if(y>62)c.lerp(snow,Math.min(1,(y-62)/9)*Math.max(.2,n));const dist=alphaPathDistance(x,z);if(dist<2.6)c.lerp(y>70?snow:path,1-Math.max(0,dist-1.7)/.9);mix[i*3]=Math.max(0,Math.min(1,(2.8-dist)/1.1));mix[i*3+1]=Math.max(0,Math.min(1,(y-62)/9));mix[i*3+2]=n;c.multiplyScalar(.95+alphaNoise(x,z)*.05);c.toArray(colors,i*3);}
 full.setAttribute('color',new Float32BufferAttribute(colors,3));full.setAttribute('alphaGround',new Float32BufferAttribute(mix,3));
 const ix=[[],[],[],[]] as number[][];for(let i=0;i<d.indices.length;i+=3){const a=d.indices[i],x=d.positions[a*3],z=d.positions[a*3+2];ix[(x>0?1:0)+(z>0?2:0)].push(d.indices[i],d.indices[i+1],d.indices[i+2]);}
 const out=ix.map(index=>{const g=new BufferGeometry();for(const name of Object.keys(full.attributes))g.setAttribute(name,full.getAttribute(name));g.setIndex(index);g.computeBoundingSphere();return g;});full.dispose();return out;},[d]);
 useEffect(()=>()=>{chunks.forEach(g=>g.dispose());m.dispose();textures.forEach(t=>t.dispose());},[chunks,m,textures]);
 return <group name="alpha-terrain-patch"><RigidBody type="fixed" colliders={false} userData={{surface:true}}><TrimeshCollider args={[d.positions,d.surface]} friction={.95}/></RigidBody><RigidBody type="fixed" colliders={false} userData={{solid:true}}><TrimeshCollider args={[d.positions,d.solid]}/></RigidBody>{chunks.map((g,i)=><mesh key={i} name={`alpha-ground-chunk-${i}`} geometry={g} material={m} receiveShadow />)}</group>;
}
