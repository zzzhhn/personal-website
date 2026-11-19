import type { BufferGeometry } from 'three';
import type { Builder } from '../WorldStreetGeometry.ts';

export type FactorySourceContact = {
  id: string;
  firstIndex: number;
  indexCount: number;
  vertices: Float32Array;
  indices: Uint32Array;
};
export type FactorySourceRange = Pick<FactorySourceContact, 'id' | 'firstIndex' | 'indexCount'>;

/** Extract one contiguous part of the installed indexed colour batch. */
export function factorySourceContact(builder: Builder, id: string, firstVertex: number, firstIndex: number): FactorySourceContact {
  return {
    id, firstIndex, indexCount: builder.idx.length - firstIndex,
    vertices: Float32Array.from(builder.pos.slice(firstVertex * 3)),
    indices: Uint32Array.from(builder.idx.slice(firstIndex), index => index - firstVertex),
  };
}

/** A whole indexed part already in its installed factory coordinates. */
export function factoryGeometryContact(geometry: BufferGeometry, id: string): FactorySourceContact {
  const index = geometry.index!;
  return { id, firstIndex: 0, indexCount: index.count, vertices: geometry.attributes.position.array as Float32Array,
    indices: index.array as Uint32Array };
}
