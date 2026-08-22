require('dotenv').config();

const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');

const tmdbRoutes = require('./src/api/tmdb');
const addonRoutes = require('./src/api/addons');
const debridRoutes = require('./src/api/debrid');
const streamRoutes = require('./src/api/streams');
const proxyRoutes = require('./src/api/proxy');
const transcodeRoutes = require('./src/api/transcode');
const addonManager = require('./src/core/addonManager');
const sampleData = require('./src/core/sampleData');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", 'https:', 'http:'],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        frameSrc: ["'self'", 'https://www.youtube-nocookie.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        mediaSrc: ["'self'", 'blob:', 'https:', 'http:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        upgradeInsecureRequests: null,
        workerSrc: ["'self'", 'blob:']
      }
    }
  }));
  app.use(compression());
  app.use(express.json({ limit: '256kb', type: 'application/json' }));

  app.use('/api/transcode', transcodeRoutes);
  app.use('/api/proxy', proxyRoutes);

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again shortly.' }
  });
  app.use('/api', limiter);

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.1.0',
      hostScope: 'local',
      addonsLoaded: addonManager.getManifests().length,
      tmdbConfigured: Boolean(process.env.TMDB_API_KEY)
    });
  });

  app.get('/api/sample/:type', (req, res) => {
    res.json(sampleData.getSample(req.params.type));
  });

  app.use('/api/tmdb', tmdbRoutes);
  app.use('/api/addons', addonRoutes);
  app.use('/api/debrid', debridRoutes);
  app.use('/api/streams', streamRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));

  app.use('/vendor/hls', express.static(path.join(__dirname, 'node_modules', 'hls.js', 'dist'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    etag: true
  }));

  app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true
  }));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.use((err, req, res, next) => {
    console.error('Server error:', err.message);
    if (res.headersSent) return next(err);
    return res.status(err.status || 500).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
  });

  return app;
}

const app = createApp();

async function startServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 3000);
  const host = options.host || process.env.HOST || '127.0.0.1';

  await addonManager.initialize();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const activePort = typeof address === 'object' ? address.port : port;
      console.log(`Cvm Turan is ready at http://${host}:${activePort}`);
      resolve(server);
    });
    server.once('error', reject);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Could not start Cvm Turan:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, createApp, startServer };
