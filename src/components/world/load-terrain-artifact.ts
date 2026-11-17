import { decodeTerrainArtifact, installTerrainArtifact, type TerrainVariant } from './terrain-artifact';

export interface TerrainArtifactEntry { url: string; bytes: number; rawBytes: number; sha256: string }
/** Fetch and validate before importing scene modules, some of which precompute placements. */
export async function loadTerrainArtifact(variant: TerrainVariant, entry: TerrainArtifactEntry, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`${entry.url}?v=${entry.sha256}`);
  if (!response.ok) throw new Error(`Terrain download failed (${response.status})`);
  const compressed = await response.arrayBuffer();
  if (compressed.byteLength !== entry.bytes) throw new Error('Terrain download length mismatch');
  const digest = await crypto.subtle.digest('SHA-256', compressed);
  const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  if (hash !== entry.sha256) throw new Error('Terrain download checksum mismatch');
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const raw = await new Response(stream).arrayBuffer();
  if (raw.byteLength !== entry.rawBytes) throw new Error('Terrain decompression length mismatch');
  const artifact = decodeTerrainArtifact(raw, variant);
  installTerrainArtifact(artifact);
  return artifact;
}
