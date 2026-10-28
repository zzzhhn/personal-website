import { Box3, BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three';
import type { TypedArray } from 'three';
import type { createCoasterStructure } from './coaster-geometry';

export type CoasterStructure = ReturnType<typeof createCoasterStructure>;
type Attribute = { array: TypedArray; itemSize: number; normalized: boolean };
type GeometryPacket = {
  attributes: Record<string, Attribute>; index: Attribute | null;
  sphere: { center: number[]; radius: number } | null;
  box: { min: number[]; max: number[] } | null;
};
export type CoasterStructurePacket = Omit<CoasterStructure, 'steel' | 'glow'> & {
  steel: GeometryPacket; glow: GeometryPacket;
};

/** Only the immutable, non-interleaved batches produced by this park travel here.
 * Transfer the buffers, including physical hulls, rather than cloning megabytes. */
export function packCoasterStructure(structure: CoasterStructure) {
  const buffers = new Set<ArrayBuffer>();
  const attribute = (a: BufferAttribute): Attribute => {
    buffers.add(a.array.buffer as ArrayBuffer);
    return { array: a.array, itemSize: a.itemSize, normalized: a.normalized };
  };
  const geometry = (g: BufferGeometry): GeometryPacket => ({
    attributes: Object.fromEntries(Object.entries(g.attributes).map(([name, a]) => {
      if (!(a instanceof BufferAttribute)) throw new Error('Unexpected interleaved coaster geometry');
      return [name, attribute(a)];
    })),
    index: g.index ? attribute(g.index) : null,
    sphere: g.boundingSphere ? { center: g.boundingSphere.center.toArray(), radius: g.boundingSphere.radius } : null,
    box: g.boundingBox ? { min: g.boundingBox.min.toArray(), max: g.boundingBox.max.toArray() } : null,
  });
  const packet: CoasterStructurePacket = { ...structure, steel: geometry(structure.steel), glow: geometry(structure.glow) };
  for (const c of structure.colliders) if (c.hull) buffers.add(c.hull.buffer as ArrayBuffer);
  buffers.add(structure.relief.vertices.buffer as ArrayBuffer);
  buffers.add(structure.relief.indices.buffer as ArrayBuffer);
  return { packet, transfer: [...buffers] };
}

export function unpackCoasterStructure(packet: CoasterStructurePacket): CoasterStructure {
  const geometry = (p: GeometryPacket) => {
    const g = new BufferGeometry();
    for (const [name, a] of Object.entries(p.attributes)) g.setAttribute(name, new BufferAttribute(a.array, a.itemSize, a.normalized));
    if (p.index) g.setIndex(new BufferAttribute(p.index.array, p.index.itemSize, p.index.normalized));
    if (p.sphere) g.boundingSphere = new Sphere(new Vector3().fromArray(p.sphere.center), p.sphere.radius);
    if (p.box) g.boundingBox = new Box3(new Vector3().fromArray(p.box.min), new Vector3().fromArray(p.box.max));
    return g;
  };
  return { ...packet, steel: geometry(packet.steel), glow: geometry(packet.glow) };
}
