const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const debridManager = require('../core/debrid');

router.use((req, res, next) => {
  const expected = process.env.DEBRID_API_ACCESS_KEY;
  const provided = req.get('x-cvm-debrid-key') || '';
  if (!expected || expected.length < 24) {
    return res.status(403).json({ error: 'Debrid API access is disabled on this server.' });
  }
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  if (
    expectedBytes.length !== providedBytes.length ||
    !crypto.timingSafeEqual(expectedBytes, providedBytes)
  ) {
    return res.status(401).json({ error: 'Debrid API access denied.' });
  }
  return next();
});

router.get('/services', async (req, res) => {
  try {
    const services = {};
    for (const [key, config] of Object.entries(debridManager.services)) {
      services[key] = {
        name: config.name,
        configured: debridManager.isConfigured(key)
      };
    }
    res.json({ services, configured: debridManager.getConfiguredServices() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:service/user', async (req, res) => {
  try {
    const { service } = req.params;
    const data = await debridManager.getUserInfo(service);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:service/magnet', async (req, res) => {
  try {
    const { service } = req.params;
    const { magnet } = req.body;
    if (!magnet) return res.status(400).json({ error: 'magnet required' });
    const data = await debridManager.addMagnet(service, magnet);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:service/torrent', async (req, res) => {
  try {
    const { service } = req.params;
    // Handle file upload
    res.json({ error: 'Use multipart/form-data for torrent files' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:service/torrents', async (req, res) => {
  try {
    const { service } = req.params;
    const data = await debridManager.getTorrents(service);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:service/torrent/:id', async (req, res) => {
  try {
    const { service, id } = req.params;
    const data = await debridManager.getTorrentStatus(service, id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:service/torrent/:id/select', async (req, res) => {
  try {
    const { service, id } = req.params;
    const { files = 'all' } = req.body;
    const data = await debridManager.selectFiles(service, id, files);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:service/torrent/:id', async (req, res) => {
  try {
    const { service, id } = req.params;
    const data = await debridManager.deleteTorrent(service, id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:service/unrestrict', async (req, res) => {
  try {
    const { service } = req.params;
    const { link } = req.body;
    if (!link) return res.status(400).json({ error: 'link required' });
    const data = await debridManager.unrestrictLink(service, link);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:service/hosts', async (req, res) => {
  try {
    const { service } = req.params;
    const data = await debridManager.getAvailableHosts(service);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/configure', async (req, res) => {
  try {
    if (process.env.ALLOW_RUNTIME_DEBRID_CONFIG !== 'true') {
      return res.status(403).json({
        error: 'Runtime token configuration is disabled. Put your own token in the local .env file and restart TShow.'
      });
    }
    const { service, token } = req.body;
    if (!service || !token) return res.status(400).json({ error: 'service and token required' });
    if (!debridManager.setToken(service, token)) {
      return res.status(400).json({ error: 'Unknown service or invalid token' });
    }
    const configured = debridManager.isConfigured(service);
    res.json({ success: true, configured });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
