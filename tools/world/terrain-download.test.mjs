import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { downloadTerrainArtifact } from '../../src/components/world/load-terrain-artifact.ts';

const raw = Buffer.from('Built world surface data. '.repeat(300));
const compressed = gzipSync(raw);
const sha = data => createHash('sha256').update(data).digest('hex');
const entry = { url:'/terrain.bin.gz', bytes:compressed.length, rawBytes:raw.length,
  sha256:sha(compressed), rawSha256:sha(raw) };

test('real HTTP fetch supports opaque gzip and automatically decoded Content-Encoding gzip', async () => {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Length', compressed.length);
    if (request.url.startsWith('/encoded')) response.setHeader('Content-Encoding', 'gzip');
    response.end(compressed);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    for (const route of ['opaque', 'encoded']) {
      const url = `http://127.0.0.1:${server.address().port}/${route}.bin.gz`;
      const received = await downloadTerrainArtifact({...entry,url});
      assert.deepEqual(Buffer.from(received), raw, route);
    }
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('decoded transport still rejects corruption, truncation and missing raw integrity metadata', async () => {
  const corrupt = Buffer.from(raw); corrupt[0] ^= 1;
  await assert.rejects(downloadTerrainArtifact(entry, async () => new Response(corrupt)), /checksum mismatch/);
  await assert.rejects(downloadTerrainArtifact(entry, async () => new Response(raw.subarray(0,-1))), /length mismatch/);
  await assert.rejects(downloadTerrainArtifact({...entry,rawSha256:undefined}, async () => new Response(raw)), /checksum mismatch/);
});

test('opaque transport checks both compressed and decoded integrity', async () => {
  const corrupt = Buffer.from(compressed); corrupt[10] ^= 1;
  await assert.rejects(downloadTerrainArtifact(entry, async () => new Response(corrupt)), /checksum mismatch/);
  await assert.rejects(downloadTerrainArtifact({...entry,rawSha256:'0'.repeat(64)}, async () => new Response(compressed)), /checksum mismatch/);
  await assert.rejects(downloadTerrainArtifact({...entry,rawBytes:1}, async () => new Response(compressed)), /decompression length mismatch/);
  await assert.rejects(downloadTerrainArtifact(entry, async () => new Response(null,{status:404})), /download failed/);
});
