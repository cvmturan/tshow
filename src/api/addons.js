const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const addonManager = require('../core/addonManager');

const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many add-on changes. Please try again shortly.' }
});

function clientId(req) {
  return addonManager.normalizeClientId(req.get('x-cvm-client-id'));
}

router.get('/', async (req, res) => {
  try {
    const addons = addonManager.getManifests(clientId(req));
    res.json({ addons, count: addons.length });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/manifests', async (req, res) => {
  try {
    const manifests = addonManager.getManifests(clientId(req));
    res.json({ manifests, count: manifests.length });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const result = await addonManager.searchCatalogs(req.query.query, clientId(req));
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/manifest/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const manifest = addonManager.getManifest(id, clientId(req));
    if (!manifest) return res.status(404).json({ error: 'Addon not found' });
    res.json(manifest);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/catalogs/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const catalogs = addonManager.getCatalogs(type, clientId(req));
    res.json({ catalogs, count: catalogs.length });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/catalog/:addonId/:type/:id', async (req, res) => {
  try {
    const { addonId, type, id } = req.params;
    const extra = { ...req.query };
    if (extra.page) extra.page = parseInt(extra.page);
    if (extra.skip) extra.skip = parseInt(extra.skip);
    if (extra.search) extra.search = extra.search.toString();
    if (extra.genre) extra.genre = extra.genre.toString();
    const data = await addonManager.getCatalog(addonId, type, id, extra, clientId(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/meta/:addonId/:type/:id', async (req, res) => {
  try {
    const { addonId, type, id } = req.params;
    const data = await addonManager.getMeta(addonId, type, id, clientId(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/streams/:addonId/:type/:id', async (req, res) => {
  try {
    const { addonId, type, id } = req.params;
    const data = await addonManager.getStreams(addonId, type, id, clientId(req));
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/install', mutationLimiter, async (req, res) => {
  try {
    const { manifestURL } = req.body;
    if (!manifestURL) return res.status(400).json({ error: 'manifestURL required' });
    const manifest = await addonManager.installAddon(manifestURL, clientId(req));
    res.json({ success: true, manifest });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.delete('/:id', mutationLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await addonManager.uninstallAddon(id, clientId(req));
    if (!result.removed && result.reason === 'not-found') {
      return res.status(404).json({ error: 'Add-on not found' });
    }
    if (!result.removed && result.reason === 'built-in') {
      return res.status(400).json({ error: 'Built-in add-ons cannot be removed' });
    }
    res.json({ success: true, removed: id });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/refresh', mutationLimiter, async (req, res) => {
  try {
    const result = await addonManager.refresh(clientId(req));
    res.json({ success: true, ...result, count: result.addons.length });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/sync', mutationLimiter, async (req, res) => {
  try {
    const result = await addonManager.syncAddons(req.body.manifestURLs, clientId(req));
    res.json({ success: true, ...result, count: result.addons.length });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
