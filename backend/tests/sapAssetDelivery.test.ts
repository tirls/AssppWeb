import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ read: vi.fn(), cached: vi.fn(), prepare: vi.fn(), specs: [] as unknown[] }));
vi.mock('node:fs/promises', () => ({ readFile: mocks.read }));
vi.mock('../src/services/sapAssets.js', () => ({
  bundledSapAssetsDir: () => '/bundled',
  readCachedAsset: mocks.cached,
  ensureSapAssets: mocks.prepare,
  SAP_ASSET_SPECS: mocks.specs,
}));

const data = Buffer.from('verified SAP test data');
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.specs.splice(0, mocks.specs.length, {
    name: 'CoreFP', strippedSize: data.length,
    strippedSha256: createHash('sha256').update(data).digest('hex'),
  });
  mocks.read.mockRejectedValue(new Error('missing'));
  mocks.cached.mockResolvedValue(data);
});

describe('SAP resource delivery', () => {
  it('shares concurrent preparation and caches compressed responses', async () => {
    const { sapAssetResponse } = await import('../src/services/sapAssetDelivery.js');
    const first = sapAssetResponse('CoreFP', true);
    expect(sapAssetResponse('CoreFP', true)).toBe(first);
    expect(gunzipSync(await first)).toEqual(data);
    expect(await sapAssetResponse('CoreFP', true)).toBe(await first);
    expect(mocks.cached).toHaveBeenCalledTimes(1);
  });
  it('serves verified prebaked gzip without runtime extraction', async () => {
    const encoded = gzipSync(data);
    mocks.read.mockResolvedValue(encoded);
    const { sapAssetResponse } = await import('../src/services/sapAssetDelivery.js');
    expect(await sapAssetResponse('CoreFP', true)).toBe(encoded);
    expect(mocks.cached).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('rejects mismatched prebaked content and uses verified originals', async () => {
    mocks.read.mockResolvedValue(gzipSync(Buffer.from('tampered')));
    const { sapAssetResponse } = await import('../src/services/sapAssetDelivery.js');
    expect(gunzipSync(await sapAssetResponse('CoreFP', true))).toEqual(data);
    expect(mocks.cached).toHaveBeenCalledTimes(1);
  });
  it('recovers after failed preparation', async () => {
    mocks.cached.mockResolvedValue(null);
    mocks.prepare.mockRejectedValueOnce(new Error('offline'));
    const { sapAssetResponse } = await import('../src/services/sapAssetDelivery.js');
    await expect(sapAssetResponse('CoreFP', true)).rejects.toThrow('offline');
    mocks.cached.mockResolvedValue(data);
    expect(gunzipSync(await sapAssetResponse('CoreFP', true))).toEqual(data);
  });
  it('returns identity bytes unchanged', async () => {
    const { sapAssetResponse } = await import('../src/services/sapAssetDelivery.js');
    expect(await sapAssetResponse('CoreFP', false)).toBe(data);
  });
  it('rejects unknown names without filesystem access', async () => {
    const { sapAssetResponse } = await import('../src/services/sapAssetDelivery.js');
    await expect(sapAssetResponse('../secret', true)).rejects.toThrow('Unknown');
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.cached).not.toHaveBeenCalled();
  });
});
