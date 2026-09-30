import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzip, gunzip } from 'node:zlib';
import { bundledSapAssetsDir, ensureSapAssets, readCachedAsset, SAP_ASSET_SPECS } from './sapAssets.js';

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const responses = new Map<string, Promise<Buffer>>();

/** Share preparation of fixed, digest-pinned resources across requests. */
export function sapAssetResponse(name: string, compressed: boolean): Promise<Buffer> {
  const spec = SAP_ASSET_SPECS.find((candidate) => candidate.name === name);
  if (!spec) {
    return Promise.reject(new Error('Unknown SAP asset'));
  }
  const key = `${name}:${compressed}`;
  const existing = responses.get(key);
  if (existing) {
    return existing;
  }
  const pending = (async () => {
    if (compressed) {
      try {
        const encoded = await readFile(path.join(bundledSapAssetsDir(), `${name}.gz`));
        const decoded = await decompress(encoded);
        if (decoded.length === spec.strippedSize &&
            createHash('sha256').update(decoded).digest('hex') === spec.strippedSha256) {
          return encoded;
        }
      } catch {
        // Local installs may not have build-time compressed resources.
      }
      return compress(await sapAssetResponse(name, false), { level: 9 });
    }
    let data = await readCachedAsset(name);
    if (!data) {
      await ensureSapAssets();
      data = await readCachedAsset(name);
    }
    if (!data) {
      throw new Error('SAP asset unavailable');
    }
    return data;
  })().catch((error: unknown) => {
    responses.delete(key);
    throw error;
  });
  responses.set(key, pending);
  return pending;
}
