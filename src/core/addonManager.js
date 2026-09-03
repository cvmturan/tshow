const axios = require('axios');
const dns = require('dns').promises;
const net = require('net');
const sampleData = require('./sampleData');
const tvmaze = require('./tvmaze');

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_RESOURCE_BYTES = 4 * 1024 * 1024;
const MAX_MANIFEST_URL_LENGTH = 8_192;
const MAX_REMOTE_REDIRECTS = 3;
const MAX_CLIENT_ADDONS = 20;
const MAX_CLIENT_SESSIONS = 500;
const MAX_SEARCH_CATALOGS = 12;
const CLIENT_ID_PATTERN = /^[a-f0-9]{32}$/;

function createPublicError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

class AddonManager {
  constructor() {
    this.addons = new Map();
    this.manifests = new Map();
    this.clientSessions = new Map();
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
      this.initialized = true;
      console.log(`Loaded ${this.addons.size} TShow add-ons`);
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
        name: 'TShow Offline Catalog',
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
        name: 'TShow Discovery',
        version: '1.0.0',
        description: 'Fresh popular movie and series metadata for the TShow home screen.',
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
        name: 'TShow Open Samples',
        version: '1.1.0',
        description: 'A short public CC0 sample used to test the player. It is never presented as the selected title.',
        resources: ['stream'],
        types: ['movie', 'series'],
        idPrefixes: [],
        _source: 'built-in'
      },
      {
        id: 'org.streamflix.cinemeta',
        name: 'Cinemeta Search & Metadata',
        version: '1.1.0',
        description: 'Permanent official movie and series search, posters, title details, episodes, and trailers.',
        resources: ['catalog', 'meta'],
        types: ['movie', 'series'],
        idPrefixes: ['tt'],
        catalogs: [
          { type: 'movie', id: 'top', name: 'Movie search', extra: [{ name: 'search' }] },
          { type: 'series', id: 'top', name: 'Series search', extra: [{ name: 'search' }] }
        ],
        manifestURL: 'https://v3-cinemeta.strem.io/manifest.json',
        _source: 'built-in'
      },
      {
        id: 'org.cvmturan.tvmaze',
        name: 'TVmaze Series Search',
        version: '1.0.0',
        description: 'Permanent free and legal series search with posters and episode metadata from TVmaze.',
        resources: ['catalog', 'meta'],
        types: ['series'],
        idPrefixes: ['tt', 'tvmaze:'],
        catalogs: [
          { type: 'series', id: 'search', name: 'TVmaze search', extra: [{ name: 'search', isRequired: true }] }
        ],
        _source: 'built-in'
      }
    ];

    for (const addon of builtInAddons) {
      this.builtInIds.add(addon.id);
      this.addons.set(addon.id, addon);
      this.manifests.set(addon.id, this.normalizeManifest(addon));
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

    const resources = candidate.resources.map((resource) =>
      typeof resource === 'string' ? resource : resource?.name
    ).filter((resource) => typeof resource === 'string')
      .map((resource) => resource.slice(0, 80))
      .slice(0, 30);
    const catalogs = Array.isArray(candidate.catalogs)
      ? candidate.catalogs.filter((catalog) => catalog && catalog.type && catalog.id)
          .slice(0, 100)
          .map((catalog) => ({
            type: String(catalog.type).slice(0, 40),
            id: String(catalog.id).slice(0, 120),
            name: String(catalog.name || catalog.id).slice(0, 120),
            genres: Array.isArray(catalog.genres)
              ? catalog.genres.map(String).map((value) => value.slice(0, 80)).slice(0, 100)
              : [],
            extra: Array.isArray(catalog.extra)
              ? catalog.extra.filter((entry) => entry && typeof entry.name === 'string')
                  .slice(0, 30)
                  .map((entry) => ({
                    name: entry.name.slice(0, 80),
                    isRequired: entry.isRequired === true,
                    options: Array.isArray(entry.options)
                      ? entry.options.map(String).map((value) => value.slice(0, 120)).slice(0, 100)
                      : []
                  }))
              : []
          }))
      : [];
    const behaviorHints = candidate.behaviorHints && typeof candidate.behaviorHints === 'object'
      ? candidate.behaviorHints
      : {};

    return {
      id,
      name,
      version: String(candidate.version || '1.0.0').slice(0, 40),
      description: String(candidate.description || '').slice(0, 500),
      resources,
      types: candidate.types.map(String).map((value) => value.slice(0, 40)).slice(0, 30),
      idPrefixes: Array.isArray(candidate.idPrefixes)
        ? candidate.idPrefixes.map(String).map((value) => value.slice(0, 80)).slice(0, 50)
        : [],
      catalogs,
      logo: typeof candidate.logo === 'string' ? candidate.logo.slice(0, 4000) : null,
      behaviorHints: {
        configurable: behaviorHints.configurable === true,
        configurationRequired: behaviorHints.configurationRequired === true
      }
    };
  }

  normalizeClientId(value) {
    const clientId = String(value || '').trim().toLowerCase();
    return CLIENT_ID_PATTERN.test(clientId) ? clientId : null;
  }

  requireClientId(value) {
    const clientId = this.normalizeClientId(value);
    if (!clientId) throw createPublicError('A valid browser add-on ID is required');
    return clientId;
  }

  getClientSession(clientId, create = false) {
    const key = this.normalizeClientId(clientId);
    if (!key) return null;
    let session = this.clientSessions.get(key);
    if (!session && create) {
      if (this.clientSessions.size >= MAX_CLIENT_SESSIONS) {
        const oldest = [...this.clientSessions.entries()]
          .sort((left, right) => left[1].lastAccess - right[1].lastAccess)[0];
        if (oldest) this.clientSessions.delete(oldest[0]);
      }
      session = { addons: new Map(), manifests: new Map(), lastAccess: Date.now() };
      this.clientSessions.set(key, session);
    }
    if (session) session.lastAccess = Date.now();
    return session;
  }

  getAddons(clientId) {
    const custom = this.getClientSession(clientId)?.addons || new Map();
    return [...this.addons.values(), ...custom.values()];
  }

  getAddonIds(clientId) {
    return this.getAddons(clientId).map((addon) => addon.id);
  }

  getManifests(clientId) {
    const custom = this.getClientSession(clientId)?.manifests || new Map();
    return [...this.manifests.values(), ...custom.values()];
  }

  getManifest(id, clientId) {
    return this.manifests.get(id) || this.getClientSession(clientId)?.manifests.get(id);
  }

  getAddon(id, clientId) {
    return this.addons.get(id) || this.getClientSession(clientId)?.addons.get(id);
  }

  async fetchAddonManifest(manifestURL) {
    const normalizedURL = this.normalizeManifestURL(manifestURL);
    const safeURL = await this.validateRemoteURL(normalizedURL);
    const response = await this.fetchRemoteJSON(safeURL, {
      timeout: 10_000,
      maxBytes: MAX_MANIFEST_BYTES,
      errorPrefix: 'Could not fetch the manifest'
    });

    const manifest = this.validateManifest(response.data);
    if (this.builtInIds.has(manifest.id)) {
      throw createPublicError('That manifest id is reserved by TShow');
    }

    return {
      ...manifest,
      manifestURL: response.finalURL,
      _source: 'custom'
    };
  }

  async installAddon(manifestURL, clientId) {
    const key = this.requireClientId(clientId);
    const session = this.getClientSession(key, true);
    const stored = await this.fetchAddonManifest(manifestURL);

    if (!session.addons.has(stored.id) && session.addons.size >= MAX_CLIENT_ADDONS) {
      throw createPublicError(`A browser can install up to ${MAX_CLIENT_ADDONS} add-ons`);
    }

    session.addons.set(stored.id, stored);
    session.manifests.set(stored.id, this.normalizeManifest(stored));
    this.clearCache();

    return this.normalizeManifest(stored);
  }

  async syncAddons(manifestURLs, clientId) {
    const key = this.requireClientId(clientId);
    if (!Array.isArray(manifestURLs)) {
      throw createPublicError('manifestURLs must be an array');
    }
    const urls = [...new Set(manifestURLs
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean))];
    if (urls.length > MAX_CLIENT_ADDONS) {
      throw createPublicError(`A browser can restore up to ${MAX_CLIENT_ADDONS} add-ons`);
    }

    const session = this.getClientSession(key, true);
    const addons = new Map();
    const manifests = new Map();
    const errors = [];

    for (const manifestURL of urls) {
      try {
        const stored = await this.fetchAddonManifest(manifestURL);
        addons.set(stored.id, stored);
        manifests.set(stored.id, this.normalizeManifest(stored));
      } catch (error) {
        errors.push({ manifestURL, error: error.message });
      }
    }

    session.addons = addons;
    session.manifests = manifests;
    session.lastAccess = Date.now();
    this.clearCache();
    return { addons: this.getManifests(key), errors };
  }

  async uninstallAddon(id, clientId) {
    const session = this.getClientSession(clientId);
    const addon = session?.addons.get(id);
    if (!addon) return { removed: false, reason: 'not-found' };

    session.addons.delete(id);
    session.manifests.delete(id);
    this.clearCache();
    return { removed: true };
  }

  normalizeManifestURL(value) {
    const raw = String(value || '').trim();
    if (/^stremio:\/\//i.test(raw)) {
      return `https://${raw.slice(raw.indexOf('://') + 3)}`;
    }
    return raw;
  }

  async refresh(clientId) {
    const urls = [...(this.getClientSession(clientId)?.addons.values() || [])]
      .map((addon) => addon.manifestURL);
    return this.syncAddons(urls, clientId);
  }

  getCatalogs(type, clientId) {
    const catalogs = [];
    for (const addon of this.getAddons(clientId)) {
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

  async getCatalog(addonId, type, id, extra = {}, clientId) {
    if (addonId === 'org.cvmturan.tvmaze') {
      if (type !== 'series' || id !== 'search' || !String(extra.search || '').trim()) {
        throw createPublicError('TVmaze search requires a series search query');
      }
      try {
        return await tvmaze.search(extra.search);
      } catch (error) {
        throw createPublicError(`TVmaze search failed: ${error.message}`, 502);
      }
    }
    return this.fetchAddonResource(addonId, 'catalog', type, id, extra, 15_000, clientId);
  }

  async getMeta(addonId, type, id, clientId) {
    if (addonId === 'org.cvmturan.tvmaze') {
      if (type !== 'series') throw createPublicError('TVmaze provides series metadata only');
      try {
        return await tvmaze.getMeta(id);
      } catch (error) {
        throw createPublicError(`TVmaze metadata request failed: ${error.message}`, 502);
      }
    }
    return this.fetchAddonResource(addonId, 'meta', type, id, {}, 15_000, clientId);
  }

  async searchCatalogs(query, clientId) {
    const search = String(query || '').trim();
    if (search.length < 2) throw createPublicError('Enter at least two characters to search');
    if (search.length > 120) throw createPublicError('Search query is too long');

    const descriptors = [];
    for (const addon of this.getAddons(clientId)) {
      if (!addon.resources?.some((resource) =>
        (typeof resource === 'string' ? resource : resource?.name) === 'catalog'
      )) continue;

      for (const type of ['movie', 'series']) {
        const searchable = (addon.catalogs || []).filter((catalog) =>
          catalog.type === type &&
          (catalog.extra || []).some((entry) => entry?.name === 'search')
        );
        if (!searchable.length) continue;
        const catalog = searchable.find((entry) => /search/i.test(entry.id)) || searchable[0];
        descriptors.push({
          addon: { id: addon.id, name: addon.name },
          catalog: { id: catalog.id, name: catalog.name || 'Search' },
          type
        });
      }
    }

    descriptors.sort((left, right) => {
      const priority = (id) => id === 'org.streamflix.cinemeta'
        ? 0
        : id === 'org.cvmturan.tvmaze'
          ? 1
          : 2;
      return priority(left.addon.id) - priority(right.addon.id);
    });

    const selected = descriptors.slice(0, MAX_SEARCH_CATALOGS);
    const settled = await Promise.all(
      selected.map((descriptor) => this.searchCatalog(descriptor, search, clientId))
    );
    return {
      groups: settled.filter((entry) => entry.data),
      errors: settled.filter((entry) => entry.error),
      providers: [...new Set(settled.filter((entry) => entry.data).map((entry) => entry.addon.name))]
    };
  }

  async searchCatalog(descriptor, search, clientId) {
    let timer;
    const request = this.getCatalog(
      descriptor.addon.id,
      descriptor.type,
      descriptor.catalog.id,
      { search },
      clientId
    ).then((data) => ({ ...descriptor, data }))
      .catch((error) => ({ ...descriptor, error: error.message }));
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ ...descriptor, error: 'Search provider timed out' }), 8_000);
    });
    try {
      return await Promise.race([request, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async getStreams(addonId, type, id, clientId) {
    if (addonId === 'org.streamflix.open-samples') {
      const sample = sampleData.getStream();
      return {
        streams: [{
          ...sample,
          name: 'Player test · 540p',
          title: 'Flower · MDN CC0 sample',
          description: 'Short public CC0 sample for testing browser video playback.',
          source: 'TShow demo'
        }]
      };
    }

    return this.fetchAddonResource(addonId, 'stream', type, id, {}, 20_000, clientId);
  }

  async fetchAddonResource(addonId, resource, type, id, extra, timeout, clientId) {
    const cacheKey = `${clientId || 'public'}:${resource}:${addonId}:${type}:${id}:${JSON.stringify(extra)}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const addon = this.getAddon(addonId, clientId);
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
