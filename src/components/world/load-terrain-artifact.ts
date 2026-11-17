import { decodeTerrainArtifact, installTerrainArtifact, type TerrainVariant } from './terrain-artifact';

export interface TerrainArtifactEntry { url: string; bytes: number; rawBytes: number; sha256: string; rawSha256: string }
/** Fetch and validate before importing scene modules, some of which precompute placements. */
export async function loadTerrainArtifact(variant: TerrainVariant, entry: TerrainArtifactEntry, fetcher: typeof fetch = fetch) {
  const artifact = decodeTerrainArtifact(await downloadTerrainArtifact(entry, fetcher), variant);
  installTerrainArtifact(artifact);
  return artifact;
}

/** Shared transport validation for independently authored terrain regions. */
export async function downloadTerrainArtifact(entry: TerrainArtifactEntry, fetcher: typeof fetch = fetch): Promise<ArrayBuffer> {
  const response = await fetcher(`${entry.url}?v=${entry.sha256}`);
  if (!response.ok) throw new Error(`Terrain download failed (${response.status})`);
  const received = await response.arrayBuffer();
  const hash = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    n => n.toString(16).padStart(2, '0')).join('');
  let raw: ArrayBuffer;
  if (received.byteLength === entry.bytes && await hash(received) === entry.sha256) {
    const stream = new Blob([received]).stream().pipeThrough(new DecompressionStream('gzip'));
    raw = await new Response(stream).arrayBuffer();
  } else if (received.byteLength === entry.rawBytes) {
    // Fetch already decodes HTTP Content-Encoding, including preview servers' .gz responses.
    // Check the decoded artifact itself; compressed Content-Length is not the body length here.
    raw = received;
  } else {
    throw new Error(received.byteLength === entry.bytes ? 'Terrain download checksum mismatch' : 'Terrain download length mismatch');
  }
  if (raw.byteLength !== entry.rawBytes) throw new Error('Terrain decompression length mismatch');
  if (await hash(raw) !== entry.rawSha256) throw new Error('Terrain decoded checksum mismatch');
  return raw;
}
