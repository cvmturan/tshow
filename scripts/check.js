const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const targets = [
  path.join(root, 'server.js'),
  path.join(root, 'src'),
  path.join(root, 'public', 'js'),
  path.join(root, 'tests')
];

function collectJavaScript(target) {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return target.endsWith('.js') ? [target] : [];

  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return [];
    return collectJavaScript(path.join(target, entry.name));
  });
}

const files = targets.flatMap(collectJavaScript);
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    failed = true;
    process.stderr.write(result.stderr || `Syntax check failed: ${file}\n`);
  }
}

for (const jsonFile of ['package.json']) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, jsonFile), 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    failed = true;
    process.stderr.write(`Invalid JSON in ${jsonFile}: ${error.message}\n`);
  }
}

for (const required of [
  'public/index.html',
  'public/css/main.css',
  'public/js/app.js',
  'public/assets/favicon.svg'
]) {
  if (!fs.existsSync(path.join(root, required))) {
    failed = true;
    process.stderr.write(`Missing required file: ${required}\n`);
  }
}

if (failed) process.exit(1);
console.log(`Checked ${files.length} JavaScript files and the required project assets.`);
