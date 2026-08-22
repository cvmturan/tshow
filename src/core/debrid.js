const axios = require('axios');

class DebridManager {
  constructor() {
    this.services = {
      realdebrid: {
        name: 'Real-Debrid',
        baseURL: 'https://api.real-debrid.com/rest/1.0',
        authHeader: 'Authorization',
        tokenPrefix: 'Bearer ',
        endpoints: {
          user: '/user',
          torrents: '/torrents',
          addMagnet: '/torrents/addMagnet',
          addTorrent: '/torrents/addTorrent',
          selectFiles: '/torrents/selectFiles/{id}',
          deleteTorrent: '/torrents/delete/{id}',
          availableHosts: '/hosts',
          unrestrictLink: '/unrestrict/link'
        }
      },
      alldebrid: {
        name: 'AllDebrid',
        baseURL: 'https://api.alldebrid.com/v4',
        authParam: 'apikey',
        endpoints: {
          user: '/user',
          uploadMagnet: '/magnet/upload',
          status: '/magnet/status',
          unlock: '/link/unlock',
          history: '/user/history'
        }
      },
      premiumize: {
        name: 'Premiumize',
        baseURL: 'https://www.premiumize.me/api',
        authHeader: 'Authorization',
        tokenPrefix: 'Bearer ',
        endpoints: {
          user: '/account/info',
          torrents: '/transfer/list',
          addMagnet: '/transfer/create',
          addTorrent: '/transfer/create',
          browse: '/folder/list',
          delete: '/transfer/delete',
          streaming: '/item/details'
        }
      },
      torbox: {
        name: 'TorBox',
        baseURL: 'https://api.torbox.app/v1/api',
        authHeader: 'Authorization',
        tokenPrefix: 'Bearer ',
        endpoints: {
          user: '/user/me',
          torrents: '/torrents/mylist',
          addMagnet: '/torrents/createtorrent',
          addTorrent: '/torrents/createtorrent',
          control: '/torrents/controltorrent',
          delete: '/torrents/deletetorrent',
          download: '/torrents/requestdl',
          availableHosts: '/webdl/hosters'
        }
      }
    };

    this.tokens = {};
    this.loadTokensFromEnv();
  }

  loadTokensFromEnv() {
    const mappings = {
      realdebrid: process.env.REALDEBRID_API_TOKEN,
      alldebrid: process.env.ALLDEBRID_API_TOKEN,
      premiumize: process.env.PREMIUMIZE_API_TOKEN,
      torbox: process.env.TORBOX_API_TOKEN
    };

    for (const [service, token] of Object.entries(mappings)) {
      if (token && !token.startsWith('your_')) this.tokens[service] = token.trim();
    }
  }

  setToken(service, token) {
    if (!this.services[service] || typeof token !== 'string' || !token.trim()) return false;
    this.tokens[service] = token.trim();
    return true;
  }

  getToken(service) {
    return this.tokens[service];
  }

  isConfigured(service) {
    return Boolean(this.tokens[service]);
  }

  getConfiguredServices() {
    return Object.keys(this.services).filter((service) => this.isConfigured(service));
  }

  getServiceConfig(service) {
    return this.services[service] || null;
  }

  async makeRequest(service, endpoint, method = 'GET', data = null, params = {}, requestOptions = {}) {
    const config = this.services[service];
    if (!config) throw new Error(`Unknown service: ${service}`);
    if (!this.tokens[service]) throw new Error(`${config.name} is not configured`);
    if (!endpoint) throw new Error(`${config.name} does not support this operation`);

    const headers = { ...(requestOptions.headers || {}) };
    const safeParams = { ...params };
    const token = this.tokens[service];

    if (config.authHeader) {
      headers[config.authHeader] = `${config.tokenPrefix || ''}${token}`;
    }
    if (config.authParam) {
      safeParams[config.authParam] = token;
    }

    try {
      const response = await axios({
        method,
        url: `${config.baseURL}${endpoint}`,
        data,
        params: safeParams,
        headers,
        timeout: 30_000,
        maxRedirects: 0
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error(`Authentication failed for ${config.name}`);
      }
      throw new Error(`${config.name} API error: ${error.message}`);
    }
  }

  async getUserInfo(service) {
    const config = this.requireService(service);
    return this.makeRequest(service, config.endpoints.user);
  }

  async addMagnet(service, magnet) {
    const config = this.requireService(service);
    if (service === 'realdebrid') {
      return this.makeRequest(service, config.endpoints.addMagnet, 'POST', { magnet });
    }
    if (service === 'alldebrid') {
      return this.makeRequest(service, config.endpoints.uploadMagnet, 'POST', null, { magnets: magnet });
    }
    if (service === 'premiumize') {
      return this.makeRequest(service, config.endpoints.addMagnet, 'POST', { src: magnet });
    }
    if (service === 'torbox') {
      return this.makeRequest(service, config.endpoints.addMagnet, 'POST', { magnet });
    }
    throw new Error('This service does not support magnet submission');
  }

  async addTorrent(service, torrentFile) {
    const config = this.requireService(service);
    if (!['realdebrid', 'premiumize', 'torbox'].includes(service)) {
      throw new Error('This service does not support torrent-file submission');
    }
    return this.makeRequest(
      service,
      config.endpoints.addTorrent,
      'POST',
      torrentFile,
      {},
      { headers: { 'Content-Type': 'application/x-bittorrent' } }
    );
  }

  async getTorrents(service) {
    const config = this.requireService(service);
    return this.makeRequest(service, config.endpoints.torrents);
  }

  async getTorrentStatus(service, id) {
    const config = this.requireService(service);
    if (service === 'realdebrid') {
      return this.makeRequest(service, `/torrents/info/${encodeURIComponent(id)}`);
    }
    if (service === 'alldebrid') {
      return this.makeRequest(service, config.endpoints.status, 'GET', null, { id });
    }
    if (service === 'torbox') {
      return this.makeRequest(service, config.endpoints.torrents, 'GET', null, { id });
    }
    return this.makeRequest(service, config.endpoints.torrents);
  }

  async selectFiles(service, id, files = 'all') {
    const config = this.requireService(service);
    if (service === 'realdebrid') {
      const endpoint = config.endpoints.selectFiles.replace('{id}', encodeURIComponent(id));
      return this.makeRequest(service, endpoint, 'POST', { files });
    }
    if (service === 'premiumize') {
      return this.makeRequest(service, '/transfer/select', 'POST', { id, files });
    }
    throw new Error('This service does not support file selection');
  }

  async deleteTorrent(service, id) {
    const config = this.requireService(service);
    if (service === 'realdebrid') {
      const endpoint = config.endpoints.deleteTorrent.replace('{id}', encodeURIComponent(id));
      return this.makeRequest(service, endpoint, 'DELETE');
    }
    if (service === 'premiumize') {
      return this.makeRequest(service, config.endpoints.delete, 'POST', { id });
    }
    if (service === 'torbox') {
      return this.makeRequest(service, config.endpoints.delete, 'POST', { torrent_id: id });
    }
    throw new Error('This service does not support deletion');
  }

  async unrestrictLink(service, link) {
    const config = this.requireService(service);
    if (service === 'realdebrid') {
      return this.makeRequest(service, config.endpoints.unrestrictLink, 'POST', { link });
    }
    if (service === 'alldebrid') {
      return this.makeRequest(service, config.endpoints.unlock, 'GET', null, { link });
    }
    if (service === 'premiumize') {
      return this.makeRequest(service, config.endpoints.streaming, 'POST', { src: link });
    }
    if (service === 'torbox') {
      return this.makeRequest(service, config.endpoints.download, 'GET', null, { token: link });
    }
    throw new Error('This service does not support link unrestriction');
  }

  async getAvailableHosts(service) {
    const config = this.requireService(service);
    return this.makeRequest(service, config.endpoints.availableHosts);
  }

  requireService(service) {
    const config = this.services[service];
    if (!config) throw new Error(`Unknown service: ${service}`);
    return config;
  }
}

module.exports = new DebridManager();

