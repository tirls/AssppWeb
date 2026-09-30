import express from 'express';
import request from 'supertest';
import { gzipSync } from 'node:zlib';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ response: vi.fn() }));
vi.mock('../src/services/sapAssetDelivery.js', () => ({ sapAssetResponse: mocks.response }));
vi.mock('../src/services/sapAssets.js', () => ({
  SAP_ASSET_SPECS: [{ name: 'CoreFP', strippedSha256: 'test-digest' }],
  ensureSapAssets: vi.fn(), sapAssetsState: () => ({ status: 'ready' }),
}));
import router from '../src/routes/sapAssets.js';
const app = express();
app.use('/api', router);

beforeEach(() => {
  mocks.response.mockReset();
  mocks.response.mockImplementation(async (_name: string, compressed: boolean) =>
    compressed ? gzipSync(Buffer.from('asset')) : Buffer.from('asset'));
});

it('honors gzip quality zero and varies identity responses', async () => {
  const res = await request(app).get('/api/sap-assets/CoreFP').set('Accept-Encoding', 'gzip;q=0, identity');
  expect(res.status).toBe(200);
  expect(mocks.response).toHaveBeenCalledWith('CoreFP', false);
  expect(res.headers['content-encoding']).toBeUndefined();
  expect(res.headers.vary).toContain('Accept-Encoding');
});
it('serves gzip with a representation-independent weak ETag', async () => {
  const res = await request(app).get('/api/sap-assets/CoreFP').set('Accept-Encoding', 'gzip');
  expect(res.status).toBe(200);
  expect(res.headers['content-encoding']).toBe('gzip');
  expect(res.headers.etag).toBe('W/"test-digest"');
  expect(res.body).toEqual(Buffer.from('asset'));
});
it('returns 503 when preparation fails', async () => {
  mocks.response.mockRejectedValue(new Error('unavailable'));
  const res = await request(app).get('/api/sap-assets/CoreFP');
  expect(res.status).toBe(503);
});
it('rejects unknown resource names', async () => {
  expect((await request(app).get('/api/sap-assets/unknown')).status).toBe(404);
  expect(mocks.response).not.toHaveBeenCalled();
});
