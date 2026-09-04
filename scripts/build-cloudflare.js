const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'public');
const output = path.join(root, '.cloudflare-dist');
const hlsSource = path.join(root, 'node_modules', 'hls.js', 'dist', 'hls.min.js');
const hlsOutput = path.join(output, 'vendor', 'hls', 'hls.min.js');

if (!fs.existsSync(hlsSource)) {
  throw new Error('hls.js is not installed. Run pnpm install before building for Cloudflare.');
}

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });
fs.mkdirSync(path.dirname(hlsOutput), { recursive: true });
fs.copyFileSync(hlsSource, hlsOutput);

console.log('Prepared TShow static assets for Cloudflare.');

