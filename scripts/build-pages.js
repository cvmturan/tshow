const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'public');
const output = path.join(root, 'dist');

fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });

const hlsSource = require.resolve('hls.js/dist/hls.min.js');
const hlsOutput = path.join(output, 'vendor', 'hls', 'hls.min.js');
fs.mkdirSync(path.dirname(hlsOutput), { recursive: true });
fs.copyFileSync(hlsSource, hlsOutput);

console.log(`Cloudflare Pages bundle created at ${output}`);
