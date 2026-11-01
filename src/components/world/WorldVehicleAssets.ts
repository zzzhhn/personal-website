import { BufferAttribute, BufferGeometry, CanvasTexture, Color, Matrix4, Mesh, MeshStandardMaterial, Vector3, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VehicleId } from './types';
import HULLS from './WorldVehicleHulls.json' with { type: 'json' };
import { VEHICLE_AUTHORED_DOORS, VEHICLE_PASSAGE, VEHICLE_SEAT_ADJUSTMENT } from './WorldVehicleDoors';

/** L1 vehicle assets (DESIGN docs/world/vehicles). An id appears here only once its GLB and hull
 * entry exist; others keep the greybox look and legacy colliders. */
export const VEHICLE_ASSETS: Partial<Record<VehicleId, string>> = { offroad: 'G25', coupe: 'G26', van: 'G27' };
export type HullPart = { part: string; faces: number; points: number[] };
export type VehicleHullEntry = { bodyY: number; clip: number; wheelRadius: number; wheelWidth: number; hulls: HullPart[] };
export function vehicleHulls(id: VehicleId): VehicleHullEntry | null {
  const asset = VEHICLE_ASSETS[id];
  return asset ? ((HULLS as Record<string, VehicleHullEntry>)[asset] ?? null) : null;
}

/** Seats are separate closed boxes inside the shipped merged body, not separate nodes.
 * Transform only complete seat triangles inside their authored bounds. The floor,
 * body shell, dashboard and exterior retain their exact baked positions at both LODs. */
export function adaptVehicleSeats(id:VehicleId,source:BufferGeometry) {
  if(id==='coupe')return source;
  const seat=VEHICLE_AUTHORED_DOORS[id].seat,adjust=VEHICLE_SEAT_ADJUSTMENT[id],floor=VEHICLE_PASSAGE[id].floor;
  const result=source.index?source.toNonIndexed():source.clone(),position=result.getAttribute('position'),normal=result.getAttribute('normal');
  const counts={cushion:0,backrest:0,headrest:0,pedestal:0},eps=.0003;
  for(const side of [-1,1]){
    const z=side*seat[2],x=seat[0],y=seat[1],drop=adjust.top-y;
    const parts=[
      {name:'cushion' as const,min:[x-.25,y-.13,z-.22],max:[x+.25,y,z+.22],low:adjust.top-adjust.thickness,high:adjust.top},
      {name:'backrest' as const,min:[x-.30,y-.04,z-.22],max:[x-.23,y+.39,z+.22],low:floor+.005,high:y+.39+drop},
      {name:'headrest' as const,min:[x-.31,y+.34,z-.13],max:[x-.21,y+.49,z+.13],low:y+.34+drop,high:y+.49+drop},
      {name:'pedestal' as const,min:[x-.17,floor-.02,z-.14],max:[x+.14,y-.12,z+.14],low:floor,high:adjust.top-adjust.thickness},
    ];
    for(let i=0;i<position.count;i+=3){
      const part=parts.find(p=>[0,1,2].every(j=>[position.getX(i+j),position.getY(i+j),position.getZ(i+j)].every((v,k)=>v>=p.min[k]-eps&&v<=p.max[k]+eps)));
      if(!part)continue;
      const scale=(part.high-part.low)/(part.max[1]-part.min[1]);
      for(let j=0;j<3;j++){
        position.setY(i+j,part.low+(position.getY(i+j)-part.min[1])*scale);
        position.setX(i+j,position.getX(i+j)+adjust.shiftX);
        const reclined=part.name==='backrest'||part.name==='headrest';
        if(reclined){const px=x+adjust.shiftX-.25,py=adjust.top-.025,dx=position.getX(i+j)-px,dy=position.getY(i+j)-py,c=Math.cos(adjust.recline),s=Math.sin(adjust.recline);
          position.setX(i+j,px+dx*c-dy*s);position.setY(i+j,py+dx*s+dy*c);}
        if(normal){const n=new Vector3(normal.getX(i+j),normal.getY(i+j)/scale,normal.getZ(i+j)).normalize();if(reclined)n.applyAxisAngle(new Vector3(0,0,1),adjust.recline);normal.setXYZ(i+j,n.x,n.y,n.z);}
      }counts[part.name]++;
    }
  }
  position.needsUpdate=true;if(normal)normal.needsUpdate=true;result.computeBoundingSphere();
  result.userData.seatAdaptation={top:adjust.top,bottom:adjust.top-adjust.thickness,floor,shiftX:adjust.shiftX,recline:adjust.recline,triangles:counts};return result;
}

/** Material roles (ART-LOCK v3) -> per-vertex role index used by the shared vehicle shader. */
const ROLE_INDEX: Record<string, number> = { light_front: 1, light_brake: 2, light_reverse: 3, light_beacon: 4, glass: 5 };

function roleOf(material: Material): string {
  return String((material.userData as { materialRole?: string }).materialRole ?? 'paint');
}

/** Bake every mesh under `node` into one geometry in node-local space: colour, roughness/metalness
 * and role become vertex attributes, so a whole car body is a single draw call. */
export function bakeNode(node: Object3D): BufferGeometry {
  node.updateWorldMatrix(true, true);
  const inv = new Matrix4().copy(node.matrixWorld).invert();
  const parts: BufferGeometry[] = [];
  node.traverse(o => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const src = mesh.geometry;
    const groups = Array.isArray(mesh.material) && src.groups.length ? src.groups
      : [{ start: 0, count: src.index ? src.index.count : src.attributes.position.count, materialIndex: 0 }];
    for (const g of groups) {
      const m = materials[g.materialIndex ?? 0] as MeshStandardMaterial;
      const piece = new BufferGeometry();
      piece.setAttribute('position', src.attributes.position.clone());
      piece.setAttribute('normal', src.attributes.normal.clone());
      piece.setIndex(src.index ? Array.from(src.index.array.slice(g.start, g.start + g.count))
        : Array.from({ length: g.count }, (_, i) => g.start + i));
      const n = piece.attributes.position.count, c = (m.color ?? new Color(1, 1, 1));
      const color = new Float32Array(n * 3), rm = new Float32Array(n * 2), role = new Float32Array(n);
      const r = ROLE_INDEX[roleOf(m)] ?? 0;
      for (let i = 0; i < n; i++) { color.set([c.r, c.g, c.b], i * 3); rm.set([m.roughness ?? .8, m.metalness ?? 0], i * 2); role[i] = r; }
      piece.setAttribute('color', new BufferAttribute(color, 3));
      piece.setAttribute('aRM', new BufferAttribute(rm, 2));
      piece.setAttribute('aRole', new BufferAttribute(role, 1));
      piece.applyMatrix4(new Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
      parts.push(piece.toNonIndexed()); piece.dispose();
    }
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach(piece => piece.dispose());
  if (!merged) throw new Error(`[world-vehicles] could not merge ${node.name}`);
  merged.computeBoundingSphere();
  return merged;
}

export type VehicleGlow = { front: number; brake: number; reverse: number; beacon: number };
/** One material per car (per-car lamp uniforms), one shared shader program for all three. */
export function vehicleMaterial(): MeshStandardMaterial & { userData: { glow: { value: number[] } } } {
  const glow = { value: [0, 0, 0, 0] };
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: .8, metalness: 0 }) as MeshStandardMaterial & { userData: { glow: { value: number[] } } };
  m.userData.glow = glow;
  m.customProgramCacheKey = () => 'world-vehicle-v1';
  m.onBeforeCompile = shader => {
    shader.uniforms.uGlow = glow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRM;\nattribute float aRole;\nvarying vec2 vRM;\nvarying float vRole;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM;\nvRole = aRole;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uGlow;\nvarying vec2 vRM;\nvarying float vRole;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRM.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float k = vRole < .5 ? 0. : vRole < 1.5 ? uGlow.x : vRole < 2.5 ? uGlow.y : vRole < 3.5 ? uGlow.z : vRole < 4.5 ? uGlow.w : 0.;
        // keep hue under strong glow: scale by the colour normalised to its max channel
        totalEmissiveRadiance += vColor.rgb / max(max(vColor.r, vColor.g), max(vColor.b, 1e-3)) * k;`);
  };
  return m;
}

let spotTexture: CanvasTexture | null = null;
/** Soft headlight pool on the road (no light source, spec 5: emissive + ground decal). */
export function headlightTexture(): CanvasTexture {
  if (spotTexture) return spotTexture;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  for (const y of [40, 88]) {
    const grad = g.createRadialGradient(40, y, 4, 110, y, 130);
    grad.addColorStop(0, 'rgba(255,240,214,0.85)'); grad.addColorStop(.45, 'rgba(255,236,206,0.32)'); grad.addColorStop(1, 'rgba(255,236,206,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 128);
  }
  // Fade the texture boundary too: clipping the radial gradients at the canvas edge otherwise
  // leaves a visible rectangular headlight pool on dark road surfaces.
  g.globalCompositeOperation = 'destination-in';
  const along = g.createLinearGradient(0, 0, 256, 0);
  along.addColorStop(0, 'rgba(0,0,0,0)'); along.addColorStop(.1, 'rgba(0,0,0,1)');
  along.addColorStop(.55, 'rgba(0,0,0,1)'); along.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = along; g.fillRect(0, 0, 256, 128);
  const across = g.createLinearGradient(0, 0, 0, 128);
  across.addColorStop(0, 'rgba(0,0,0,0)'); across.addColorStop(.22, 'rgba(0,0,0,1)');
  across.addColorStop(.78, 'rgba(0,0,0,1)'); across.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = across; g.fillRect(0, 0, 256, 128);
  spotTexture = new CanvasTexture(c);
  return spotTexture;
}
export type { GLTF };
