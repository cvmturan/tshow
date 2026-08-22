const express = require('express');
const router = express.Router();
const addonManager = require('../core/addonManager');

router.get('/', async (req, res) => {
  try {
    const addons = addonManager.getManifests();
    res.json({ addons, count: addons.length });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/manifests', async (req, res) => {
  try {
    const manifests = addonManager.getManifests();
    res.json({ manifests, count: manifests.length });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/manifest/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const manifest = addonManager.getManifest(id);
    if (!manifest) return res.status(404).json({ error: 'Addon not found' });
    res.json(manifest);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/catalogs/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const catalogs = addonManager.getCatalogs(type);
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
    const data = await addonManager.getCatalog(addonId, type, id, extra);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/meta/:addonId/:type/:id', async (req, res) => {
  try {
    const { addonId, type, id } = req.params;
    const data = await addonManager.getMeta(addonId, type, id);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.get('/streams/:addonId/:type/:id', async (req, res) => {
  try {
    const { addonId, type, id } = req.params;
    const data = await addonManager.getStreams(addonId, type, id);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/install', async (req, res) => {
  try {
    const { manifestURL } = req.body;
    if (!manifestURL) return res.status(400).json({ error: 'manifestURL required' });
    const manifest = await addonManager.installAddon(manifestURL);
    res.json({ success: true, manifest });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await addonManager.uninstallAddon(id);
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

router.post('/refresh', async (req, res) => {
  try {
    const addons = await addonManager.refresh();
    res.json({ success: true, addons, count: addons.length });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
