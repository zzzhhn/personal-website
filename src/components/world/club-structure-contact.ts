export type ClubSourceKind = 'surface' | 'solid' | 'soft';
export type ClubSourceSpan = { kind: ClubSourceKind; firstVertex: number; vertexCount: number };

/** Describe the actual drawn ranges without splitting the original draw calls. */
export function clubStructureSource(name:string, spans:readonly ClubSourceSpan[], count:number) {
  if (!spans.length) return {};
  return {
    worldCollisionPartial: spans.reduce((total,span)=>total+span.vertexCount,0)!==count,
    worldCollisionSources: spans.map(({kind,firstVertex,vertexCount},i)=>({
      id:`djc-${name}-${i}`, firstVertex, vertexCount,
      collision: kind==='surface'?'solid':kind,
      ...(kind==='surface'||kind==='solid'?{surfaceId:`djc-${kind}-same-mesh`}:{}),
    })),
  };
}
