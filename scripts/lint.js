const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'data' || entry.name === 'logs') continue;
      walk(full, files);
    } else if (entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

const roots = [path.join(__dirname, '..', 'src'), path.join(__dirname, '..', 'scripts')];
const files = roots.flatMap((r) => walk(r));
let failed = 0;

for (const file of files) {
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
    console.log(`✓ ${path.relative(path.join(__dirname, '..'), file)}`);
  } catch (err) {
    failed += 1;
    console.error(`✗ ${path.relative(path.join(__dirname, '..'), file)}`);
    console.error(err.stderr ? err.stderr.toString() : err.message);
  }
}

console.log(`\n${files.length - failed}/${files.length} Dateien ok.`);
process.exit(failed ? 1 : 0);
