const axios = require('axios');
const dns = require('dns').promises;
const fs = require('fs').promises;
const net = require('net');
const path = require('path');
const sampleData = require('./sampleData');

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_RESOURCE_BYTES = 4 * 1024 * 1024;
const MAX_MANIFEST_URL_LENGTH = 8_192;
const MAX_REMOTE_REDIRECTS = 3;

function createPublicError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

class AddonManager {
  constructor() {
    const configuredFile = process.env.CUSTOM_ADDONS_FILE || './data/custom-addons.json';

    this.addons = new Map();
    this.manifests = new Map();
    this.customAddonsFile = path.isAbsolute(configuredFile)
      ? configuredFile
      : path.resolve(__dirname, '../..', configuredFile);
    this.repositoryURL = (process.env.ADDON_REPOSITORY_URL || '').trim();
    this.cache = new Map();
    this.cacheTTL = Number.parseInt(process.env.CACHE_TTL_MS, 10) || 3_600_000;
    this.initialized = false;
    this.initializing = null;
    this.builtInIds = new Set();
    this.saveQueue = Promise.resolve();
    this.saveSequence = 0;
  }

  async initialize() {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      this.addons.clear();
      this.manifests.clear();
      this.builtInIds.clear();
      this.loadBuiltInAddons();
      await this.loadCustomAddons();
      this.initialized = true;
      console.log(`Loaded ${this.addons.size} Cvm Turan add-ons`);
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  loadBuiltInAddons() {
    const builtInAddons = [
      {
        id: 'org.streamflix.catalog',
        name: 'Cvm Turan Offline Catalog',
        version: '1.1.0',
        description: 'A small offline fallback catalog used only when live metadata is unavailable.',
        resources: ['catalog', 'meta'],
        types: ['movie', 'series'],
        catalogs: [
          { type: 'movie', id: 'streamflix_movies', name: 'Movies' },
          { type: 'series', id: 'streamflix_series', name: 'Series' }
        ],
        _source: 'built-in'
      },
      {
        id: 'org.cvmturan.discovery',
        name: 'Cvm Turan Discovery',
        version: '1.0.0',
        description: 'Fresh popular movie and series metadata for the Cvm Turan home screen.',
        resources: ['catalog'],
        types: ['movie', 'series'],
        idPrefixes: ['tt'],
        catalogs: [
          { type: 'movie', id: 'top', name: 'Popular movies' },
          { type: 'series', id: 'top', name: 'Popular series' }
        ],
        manifestURL: 'https://cinemeta-catalogs.strem.io/top/manifest.json',
        _source: 'built-in'
      },
      {
        id: 'org.streamflix.open-samples',
        name: 'Cvm Turan Open Samples',
        version: '1.1.0',
        description: 'A short public CC0 sample used to test the player. It is never presented as the selected title.',
        resources: ['stream'],
        types: ['movie', 'series'],
        idPrefixes: [],
        _source: 'built-in'
      },
      {
        id: 'org.streamflix.cinemeta',
        name: 'Cinemeta Metadata',
        version: '1.0.0',
        description: 'Episode and title metadata used to resolve standard Stremio movie and series identifiers.',
        resources: ['meta'],
        types: ['movie', 'series'],
        idPrefixes: ['tt'],
        manifestURL: 'https://v3-cinemeta.strem.io/manifest.json',
        _source: 'built-in'
      }
    ];

    for (const addon of builtInAddons) {
      this.builtInIds.add(addon.id);
      this.addons.set(addon.id, addon);
      this.manifests.set(addon.id, this.normalizeManifest(addon));
    }
  }

  async loadCustomAddons() {
    try {
      const raw = await fs.readFile(this.customAddonsFile, 'utf8');
      const customAddons = JSON.parse(raw.replace(/^\uFEFF/, ''));

      if (!Array.isArray(customAddons)) {
        throw new Error('Custom add-on file must contain an array');
      }

      for (const candidate of customAddons) {
        try {
          const manifest = this.validateManifest(candidate);
          if (!candidate.manifestURL || this.builtInIds.has(manifest.id)) continue;
          const stored = {
            ...manifest,
            manifestURL: candidate.manifestURL,
            _source: 'custom'
          };
          this.addons.set(stored.id, stored);
          this.manifests.set(stored.id, this.normalizeManifest(stored));
        } catch (error) {
          console.warn('Skipped an invalid saved add-on:', error.message);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Could not load custom add-ons:', error.message);
      }
    }
  }

  normalizeManifest(addon) {
    const resources = Array.isArray(addon.resources)
      ? addon.resources
          .map((resource) => typeof resource === 'string' ? resource : resource?.name)
          .filter(Boolean)
      : [];

    const catalogs = Array.isArray(addon.catalogs)
      ? addon.catalogs
          .filter((catalog) => catalog && catalog.type && catalog.id)
          .map((catalog) => ({
            type: String(catalog.type),
            id: String(catalog.id),
            name: String(catalog.name || catalog.id),
            genres: Array.isArray(catalog.genres)
              ? catalog.genres.map(String).slice(0, 100)
              : [],
            extra: Array.isArray(catalog.extra)
              ? catalog.extra
                  .filter((entry) => entry && typeof entry.name === 'string')
                  .slice(0, 30)
                  .map((entry) => ({
                    name: String(entry.name).slice(0, 80),
                    isRequired: entry.isRequired === true,
                    options: Array.isArray(entry.options)
                      ? entry.options.map(String).slice(0, 100)
                      : []
                  }))
              : []
          }))
      : [];

    const behaviorHints = addon.behaviorHints && typeof addon.behaviorHints === 'object'
      ? addon.behaviorHints
      : {};

    return {
      id: String(addon.id),
      name: String(addon.name),
      version: String(addon.version || '1.0.0'),
      description: String(addon.description || ''),
      resources,
      types: Array.isArray(addon.types) ? addon.types.map(String) : [],
      idPrefixes: Array.isArray(addon.idPrefixes) ? addon.idPrefixes.map(String) : [],
      catalogs,
      logo: typeof addon.logo === 'string' ? addon.logo : null,
      behaviorHints: {
        configurable: behaviorHints.configurable === true,
        configurationRequired: behaviorHints.configurationRequired === true
      },
      manifestURL: addon.manifestURL || null,
      isBuiltIn: addon._source === 'built-in',
      isCustom: addon._source === 'custom',
      isRemovable: addon._source === 'custom'
    };
  }

  validateManifest(candidate) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw createPublicError('The URL did not return a JSON add-on manifest');
    }

    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';

    if (!/^[a-z0-9._-]{3,120}$/i.test(id)) {
      throw createPublicError('Manifest id must be 3-120 letters, numbers, dots, dashes, or underscores');
    }
    if (!name || name.length > 100) {
      throw createPublicError('Manifest name is required and must be 100 characters or fewer');
    }
    if (!Array.isArray(candidate.resources) || !Array.isArray(candidate.types)) {
      throw createPublicError('Manifest must include resources and types arrays');
    }

    return {
      ...candidate,
      id,
      name,
      version: String(candidate.version || '1.0.0').slice(0, 40),
      description: String(candidate.description || '').slice(0, 500),
      resources: candidate.resources.slice(0, 30),
      types: candidate.types.map(String).slice(0, 30),
      idPrefixes: Array.isArray(candidate.idPrefixes)
        ? candidate.idPrefixes.map(String).slice(0, 50)
        : [],
      catalogs: Array.isArray(candidate.catalogs) ? candidate.catalogs.slice(0, 100) : []
    };
  }

  getAddons() {
    return Array.from(this.addons.values());
  }

  getManifests() {
    return Array.from(this.manifests.values());
  }

  getManifest(id) {
    return this.manifests.get(id);
  }

  getAddon(id) {
    return this.addons.get(id);
  }

  async installAddon(manifestURL) {
    const normalizedURL = this.normalizeManifestURL(manifestURL);
    const safeURL = await this.validateRemoteURL(normalizedURL);
    const response = await this.fetchRemoteJSON(safeURL, {
      timeout: 10_000,
      maxBytes: MAX_MANIFEST_BYTES,
      errorPrefix: 'Could not fetch the manifest'
    });

    const manifest = this.validateManifest(response.data);
    if (this.builtInIds.has(manifest.id)) {
      throw createPublicError('That manifest id is reserved by Cvm Turan');
    }

    const stored = {
      ...manifest,
      manifestURL: response.finalURL,
      _source: 'custom'
    };

    const previousAddon = this.addons.get(stored.id);
    const previousManifest = this.manifests.get(stored.id);
    this.addons.set(stored.id, stored);
    this.manifests.set(stored.id, this.normalizeManifest(stored));
    try {
      await this.saveCustomAddons();
    } catch (error) {
      this.restoreMapEntry(this.addons, stored.id, previousAddon);
      this.restoreMapEntry(this.manifests, stored.id, previousManifest);
      throw createPublicError(
        `The manifest was valid, but Cvm Turan could not save it: ${error.message}`,
        500
      );
    }
    this.clearCache();

    return this.normalizeManifest(stored);
  }

  async uninstallAddon(id) {
    const addon = this.addons.get(id);
    if (!addon) return { removed: false, reason: 'not-found' };
    if (addon._source !== 'custom') return { removed: false, reason: 'built-in' };

    const previousManifest = this.manifests.get(id);
    this.addons.delete(id);
    this.manifests.delete(id);
    try {
      await this.saveCustomAddons();
    } catch (error) {
      this.addons.set(id, addon);
      if (previousManifest) this.manifests.set(id, previousManifest);
      throw createPublicError(
        `Cvm Turan could not save the updated add-on list: ${error.message}`,
        500
      );
    }
    this.clearCache();
    return { removed: true };
  }

  async saveCustomAddons() {
    const customAddons = Array.from(this.addons.values())
      .filter((addon) => addon._source === 'custom')
      .map(({ _source, ...addon }) => addon);
    const payload = `${JSON.stringify(customAddons, null, 2)}\n`;
    const task = this.saveQueue
      .catch(() => undefined)
      .then(() => this.writeCustomAddonsAtomically(payload));
    this.saveQueue = task;
    return task;
  }

  async writeCustomAddonsAtomically(payload) {
    await fs.mkdir(path.dirname(this.customAddonsFile), { recursive: true });
    this.saveSequence += 1;
    const temporaryFile = path.join(
      path.dirname(this.customAddonsFile),
      `.${path.basename(this.customAddonsFile)}.${process.pid}.${this.saveSequence}.tmp`
    );

    try {
      await fs.writeFile(temporaryFile, payload, { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temporaryFile, this.customAddonsFile);
    } catch (error) {
      await fs.unlink(temporaryFile).catch(() => undefined);
      throw error;
    }
  }

  restoreMapEntry(map, id, previousValue) {
    if (previousValue === undefined) map.delete(id);
    else map.set(id, previousValue);
  }

  normalizeManifestURL(value) {
    const raw = String(value || '').trim();
    if (/^stremio:\/\//i.test(raw)) {
      return `https://${raw.slice(raw.indexOf('://') + 3)}`;
    }
    return raw;
  }

  async refresh() {
    const customIds = Array.from(this.addons.values())
      .filter((addon) => addon._source === 'custom')
      .map((addon) => addon.id);

    for (const id of customIds) {
      this.addons.delete(id);
      this.manifests.delete(id);
    }

    await this.loadCustomAddons();
    this.clearCache();
    return this.getManifests();
  }

  getCatalogs(type) {
    const catalogs = [];
    for (const addon of this.addons.values()) {
      if (!addon.types?.includes(type) || !Array.isArray(addon.catalogs)) continue;
      for (const catalog of addon.catalogs) {
        if (catalog.type === type) {
          catalogs.push({
            ...catalog,
            addonId: addon.id,
            addonName: addon.name
          });
        }
      }
    }
    return catalogs;
  }

  async getCatalog(addonId, type, id, extra = {}) {
    return this.fetchAddonResource(addonId, 'catalog', type, id, extra, 15_000);
  }

  async getMeta(addonId, type, id) {
    return this.fetchAddonResource(addonId, 'meta', type, id, {}, 15_000);
  }

  async getStreams(addonId, type, id) {
    if (addonId === 'org.streamflix.open-samples') {
      const sample = sampleData.getStream();
      return {
        streams: [{
          ...sample,
          name: 'Player test · 540p',
          title: 'Flower · MDN CC0 sample',
          description: 'Short public CC0 sample for testing browser video playback.',
          source: 'Cvm Turan demo'
        }]
      };
    }

    return this.fetchAddonResource(addonId, 'stream', type, id, {}, 20_000);
  }

  async fetchAddonResource(addonId, resource, type, id, extra, timeout) {
    const cacheKey = `${resource}:${addonId}:${type}:${id}:${JSON.stringify(extra)}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const addon = this.addons.get(addonId);
    if (!addon || !addon.manifestURL) {
      throw createPublicError('Add-on is unavailable or does not provide a remote endpoint', 404);
    }

    const manifestURL = await this.validateRemoteURL(addon.manifestURL);
    const resourceURL = this.buildResourceURL(manifestURL, resource, type, id, extra);
    const safeResourceURL = await this.validateRemoteURL(resourceURL);
    const response = await this.fetchRemoteJSON(safeResourceURL, {
      timeout,
      maxBytes: MAX_RESOURCE_BYTES,
      errorPrefix: 'Add-on request failed'
    });
    this.setCache(cacheKey, response.data);
    return response.data;
  }

  async fetchRemoteJSON(startURL, { timeout, maxBytes, errorPrefix }) {
    let currentURL = await this.validateRemoteURL(startURL);

    for (let redirectCount = 0; redirectCount <= MAX_REMOTE_REDIRECTS; redirectCount += 1) {
      let response;
      try {
        response = await axios.get(currentURL, {
          timeout,
          maxContentLength: maxBytes,
          maxBodyLength: maxBytes,
          maxRedirects: 0,
          validateStatus: (status) => status >= 200 && status < 400,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Cvm-Turan/1.2'
          }
        });
      } catch (error) {
        throw createPublicError(`${errorPrefix}: ${error.message}`, 502);
      }

      if (response.status < 300) {
        return { data: response.data, finalURL: currentURL };
      }

      const location = response.headers?.location;
      if (!location) {
        throw createPublicError(`${errorPrefix}: redirect response did not include a destination`, 502);
      }
      if (redirectCount >= MAX_REMOTE_REDIRECTS) {
        throw createPublicError(`${errorPrefix}: too many redirects`, 502);
      }

      let nextURL;
      try {
        nextURL = new URL(location, currentURL).toString();
      } catch {
        throw createPublicError(`${errorPrefix}: redirect destination was invalid`, 502);
      }

      const currentProtocol = new URL(currentURL).protocol;
      const validatedNextURL = await this.validateRemoteURL(nextURL);
      if (currentProtocol === 'https:' && new URL(validatedNextURL).protocol !== 'https:') {
        throw createPublicError(`${errorPrefix}: an HTTPS redirect cannot downgrade to HTTP`, 400);
      }
      currentURL = validatedNextURL;
    }

    throw createPublicError(`${errorPrefix}: too many redirects`, 502);
  }

  buildResourceURL(manifestURL, resource, type, id, extra = {}) {
    const url = new URL(manifestURL);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/manifest\.json\/?$/i, '');

    const basePath = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(resource)}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
    const extraArgs = Object.entries(extra)
      .filter(([, value]) => value !== undefined && value !== null && String(value).length <= 300)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');

    url.pathname = resource === 'catalog' && extraArgs
      ? `${basePath}/${extraArgs}.json`
      : `${basePath}.json`;

    return url.toString();
  }

  async validateRemoteURL(value) {
    let url;
    try {
      url = new URL(String(value || '').trim());
    } catch {
      throw createPublicError('Enter a complete HTTPS manifest URL');
    }

    if (!['https:', 'http:'].includes(url.protocol)) {
      throw createPublicError('Only HTTP and HTTPS manifest URLs are supported');
    }
    if (url.username || url.password) {
      throw createPublicError('Manifest URLs cannot include a username or password');
    }
    if (url.toString().length > MAX_MANIFEST_URL_LENGTH) {
      throw createPublicError('Manifest URL is too long');
    }

    const allowPrivate = process.env.ALLOW_PRIVATE_ADDONS === 'true';
    if (!allowPrivate) {
      const hostname = url.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
        throw createPublicError('Local and private-network add-on URLs are blocked');
      }

      let addresses;
      try {
        addresses = net.isIP(hostname)
          ? [{ address: hostname }]
          : await dns.lookup(hostname, { all: true, verbatim: true });
      } catch {
        throw createPublicError('The manifest hostname could not be resolved');
      }

      if (!addresses.length || addresses.some(({ address }) => this.isPrivateAddress(address))) {
        throw createPublicError('Local, private, and reserved add-on addresses are blocked');
      }
    }

    return url.toString();
  }

  isPrivateAddress(address) {
    const normalized = String(address).toLowerCase();
    const version = net.isIP(normalized);

    if (version === 4) {
      const parts = normalized.split('.').map(Number);
      const [a, b] = parts;
      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 0) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224
      );
    }

    if (version === 6) {
      if (normalized === '::' || normalized === '::1') return true;
      if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
      if (/^fe[89ab]/.test(normalized)) return true;
      if (normalized.startsWith('::ffff:')) {
        return this.isPrivateAddress(normalized.slice(7));
      }
    }

    return false;
  }

  getFromCache(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.cacheTTL) return entry.data;
    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = new AddonManager();
