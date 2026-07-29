const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['.git', 'node_modules', 'www', 'android', '.codex-worktrees']);
const baseUrl = 'https://pagina-gen.web.app/';
const previewImage = `${baseUrl}aadocumentos/imagenes/og-image.jpg`;

const descriptions = [
  [/gen_animadores/, 'Dinámicas, juegos, reflexiones y propuestas para preparar encuentros juveniles con sentido.'],
  [/biblioteca/, 'Libros, documentos, audios y videos para la formación y la vida espiritual.'],
  [/pasapalabra/, 'Una reflexión breve para iluminar y vivir cada día.'],
  [/meditacion/, 'Meditaciones para hacer una pausa, escuchar y profundizar la vida espiritual.'],
  [/pdv/, 'Palabras de Vida para llevar el Evangelio a lo cotidiano.'],
  [/cancionero/, 'Canciones y acordes para encuentros, celebraciones y momentos compartidos.'],
  [/introduccion/, 'Historia, espiritualidad y protagonistas del Movimiento de los Focolares.'],
  [/links/, 'Canales de contacto y ayuda de Gen 2.'],
  [/canal/, 'Experiencias y novedades de la comunidad Gen 2.'],
  [/descargas/, 'Recursos de Gen 2 disponibles para usar sin conexión.'],
  [/admin/, 'Herramientas de administración de Gen 2.']
];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (ignored.has(entry.name)) return [];
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function escapeAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

let changed = 0;
for (const file of walk(root).filter(file => file.endsWith('.html'))) {
  const relative = path.relative(root, file).replace(/\\/g, '/');
  let html = fs.readFileSync(file, 'utf8');
  const title = html.match(/<title(?:\s[^>]*)?>([^<]+)<\/title>/i)?.[1]?.trim() || 'Gen 2';
  const description = descriptions.find(([pattern]) => pattern.test(relative))?.[1]
    || 'Recursos, espiritualidad y vida compartida de la comunidad Gen 2.';
  const depth = relative.split('/').length - 1;
  const rootPrefix = depth ? '../'.repeat(depth) : '';

  if (!html.includes('aaglobal/site-polish.css')) {
    const link = `  <link rel="stylesheet" href="${rootPrefix}aaglobal/site-polish.css">`;
    html = html.replace(/(<link[^>]+aaglobal\/sidebar\.css[^>]*>)/i, `$1\n${link}`);
  }

  if (!/<meta\s+name=["']description["']/i.test(html)) {
    html = html.replace(/(<title(?:\s[^>]*)?>[^<]+<\/title>)/i, `$1\n  <meta name="description" content="${escapeAttribute(description)}">`);
  }

  if (!/<meta\s+property=["']og:title["']/i.test(html)) {
    const social = [
      `  <meta property="og:type" content="website">`,
      `  <meta property="og:title" content="${escapeAttribute(title)}">`,
      `  <meta property="og:description" content="${escapeAttribute(description)}">`,
      `  <meta property="og:image" content="${previewImage}">`,
      `  <meta name="twitter:card" content="summary_large_image">`,
      `  <meta name="twitter:title" content="${escapeAttribute(title)}">`,
      `  <meta name="twitter:description" content="${escapeAttribute(description)}">`,
      `  <meta name="twitter:image" content="${previewImage}">`
    ].join('\n');
    html = html.replace(/(<meta\s+name=["']description["'][^>]*>)/i, `$1\n${social}`);
  }

  if (html !== fs.readFileSync(file, 'utf8')) {
    fs.writeFileSync(file, html, 'utf8');
    changed += 1;
  }
}

console.log(`Presentación unificada en ${changed} páginas.`);
