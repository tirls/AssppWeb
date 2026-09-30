import { Router } from 'express';
import { SAP_ASSET_SPECS, ensureSapAssets, sapAssetsState } from '../services/sapAssets.js';
import { sapAssetResponse } from '../services/sapAssetDelivery.js';

const router = Router();

router.get('/sap-assets/status', (_req, res) => {
  res.json(sapAssetsState());
});

router.post('/sap-assets/prepare', (_req, res) => {
  const preparation = ensureSapAssets();
  void preparation.catch(() => undefined);
  res.json(sapAssetsState());
});

router.get('/sap-assets/:name', async (req, res) => {
  const name = req.params.name;
  const spec = SAP_ASSET_SPECS.find((candidate) => candidate.name === name);
  if (!spec) {
    res.status(404).json({ error: 'Unknown SAP asset' });
    return;
  }
  const compressed = req.acceptsEncodings('gzip', 'identity') === 'gzip';
  try {
    const data = await sapAssetResponse(name, compressed);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('ETag', `W/"${spec.strippedSha256}"`);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.vary('Accept-Encoding');
    if (compressed) {
      res.setHeader('Content-Encoding', 'gzip');
    }
    res.send(data);
  } catch (error) {
    res.status(503).json({
      error: error instanceof Error ? error.message : 'SAP asset unavailable',
    });
  }
});

export default router;
