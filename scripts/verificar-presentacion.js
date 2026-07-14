const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['.git', 'node_modules', 'www', 'android', '.codex-worktrees']);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (ignored.has(entry.name)) return [];
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const pages = walk(root).filter(file => file.endsWith('.html'));
for (const file of pages) {
  const relative = path.relative(root, file);
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /<title(?:\s[^>]*)?>[^<]+<\/title>/i, `${relative}: falta título`);
  assert.match(html, /<meta\s+name=["']description["'][^>]+>/i, `${relative}: falta descripción`);
  assert.match(html, /<meta\s+property=["']og:image["'][^>]+>/i, `${relative}: falta imagen para compartir`);
  assert.match(html, /aaglobal\/site-polish\.css/i, `${relative}: falta la base visual común`);
  assert.match(html, /data-gen-sidebar/i, `${relative}: falta el menú compartido`);
}

console.log(`Presentación verificada en ${pages.length} páginas.`);
