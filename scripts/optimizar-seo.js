const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const origin = 'https://pagina-gen.web.app';
const excludedDirectories = new Set(['.git', '.codex-worktrees', 'node_modules', 'android', 'ios', 'www', 'docs', 'scripts', 'tmp', '_apk-pruebas']);
const noindex = new Set([
  '404.html',
  '_pdv-qa.html',
  'admin/admin.html',
  'cancionero/favoritos.html',
  'cancionero/playlist.html',
  'cancionero/subir-audio.html',
  // Son plantillas que necesitan un parámetro para representar contenido único.
  'cancionero/cancion.html',
  'cancionero/artista.html',
  'canal/publicacion.html',
  'pdv/pdv.html',
  'perfil/notificaciones.html',
  'perfil/perfil.html',
  'perfil/sin-conexion.html',
  'perfil/sin-conexion-no-disponible.html'
]);

function htmlFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.html') ? [absolute] : [];
  });
}

function relativeUrl(relative) {
  return relative === 'index.html' ? `${origin}/` : `${origin}/${relative}`;
}

function replaceOrInsert(html, pattern, tag) {
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace(/<\/head>/i, `  ${tag}\n</head>`);
}

const indexed = [];
for (const absolute of htmlFiles(root)) {
  const relative = path.relative(root, absolute).replace(/\\/g, '/');
  const isNoindex = noindex.has(relative);
  const canonical = relative === 'pdv/pdv.html'
    ? `${origin}/pdv/pdv_todas.html`
    : relativeUrl(relative);
  let html = fs.readFileSync(absolute, 'utf8');

  html = replaceOrInsert(
    html,
    /\s*<link\s+rel=["']canonical["'][^>]*>\s*/i,
    `<link rel="canonical" href="${canonical}">`
  );
  if (isNoindex) {
    html = replaceOrInsert(
      html,
      /\s*<meta\s+name=["']robots["'][^>]*>\s*/i,
      '<meta name="robots" content="noindex, nofollow">'
    );
  }

  if (relative === 'index.html' && !/application\/ld\+json/i.test(html)) {
    const schema = `  <script type="application/ld+json">\n    {"@context":"https://schema.org","@type":"WebSite","name":"Gen 2","url":"${origin}/","inLanguage":"es-AR","description":"Recursos del Movimiento Gen 2 para vivir la unidad."}\n  </script>\n`;
    html = html.replace(/<\/head>/i, `${schema}</head>`);
  }

  fs.writeFileSync(absolute, html, 'utf8');
  if (!isNoindex) indexed.push({ relative, absolute });
}

const urls = indexed
  .sort((a, b) => a.relative.localeCompare(b.relative))
  .map(({ relative, absolute }) => {
    const lastmod = fs.statSync(absolute).mtime.toISOString().slice(0, 10);
    const priority = relative === 'index.html' ? '1.0' : '0.7';
    return `  <url><loc>${relativeUrl(relative)}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority></url>`;
  });
fs.writeFileSync(path.join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`, 'utf8');
console.log(`SEO actualizado: ${indexed.length} URLs indexables y ${noindex.size} páginas excluidas.`);
