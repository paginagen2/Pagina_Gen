const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function listHtmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.codex-worktrees' || entry.name === 'www' || entry.name === 'android') return [];
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listHtmlFiles(fullPath) : (entry.name.endsWith('.html') ? [fullPath] : []);
  });
}

function findSidebarElement(html) {
  const startPattern = /<(aside|div)\b[^>]*class=["'][^"']*\bsidebar\b[^"']*["'][^>]*>/gi;
  const match = startPattern.exec(html);
  if (!match) return null;

  const tagName = match[1].toLowerCase();
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tagPattern.lastIndex = match.index;
  let depth = 0;
  let tagMatch;

  while ((tagMatch = tagPattern.exec(html))) {
    const isClosing = tagMatch[0].startsWith('</');
    depth += isClosing ? -1 : 1;
    if (depth === 0) return { start: match.index, end: tagPattern.lastIndex };
  }

  throw new Error(`No se encontró el cierre del sidebar iniciado en ${match.index}`);
}

const changed = [];
for (const file of listHtmlFiles(root)) {
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('data-gen-sidebar')) continue;

  const sidebar = findSidebarElement(html);
  if (!sidebar) continue;

  const relativeDirectory = path.relative(path.dirname(file), root).replace(/\\/g, '/');
  const prefix = relativeDirectory ? `${relativeDirectory}/` : '';
  const replacement = `<aside class="sidebar home-sidebar site-sidebar" data-gen-sidebar aria-label="Navegación principal"></aside>\n  <script src="${prefix}aaglobal/sidebar.js"></script>`;
  html = `${html.slice(0, sidebar.start)}${replacement}${html.slice(sidebar.end)}`;

  if (!html.includes('aaglobal/sidebar.css')) {
    html = html.replace('</head>', `  <link rel="stylesheet" href="${prefix}aaglobal/sidebar.css">\n</head>`);
  }

  fs.writeFileSync(file, html, 'utf8');
  changed.push(path.relative(root, file).replace(/\\/g, '/'));
}

console.log(`Sidebars migrados: ${changed.length}`);
changed.forEach(file => console.log(file));
