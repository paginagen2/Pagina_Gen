const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const siteBase = 'https://pagina-gen.web.app/';

const sections = [
  { test: file => file.startsWith('cancionero/'), image: 'cancionero', description: 'Canciones y acordes para compartir.' },
  { test: file => file.startsWith('pdv/') || file === '_pdv-qa.html', image: 'pdv', description: 'Palabras de Vida para llevar el Evangelio a lo cotidiano.' },
  { test: file => file.startsWith('meditacion/'), image: 'meditacion', description: 'Meditaciones para detenerse, profundizar y vivir el presente.' },
  { test: file => file.startsWith('pasapalabra/'), image: 'pasapalabra', description: 'Una palabra y una reflexión para vivir el momento presente.' },
  { test: file => file.startsWith('gen_animadores/'), image: 'animadores', description: 'Dinámicas, juegos y recursos para animadores y encuentros.' },
  { test: file => file.startsWith('biblioteca/'), image: 'biblioteca', description: 'Materiales para leer, descubrir y compartir.' },
  { test: file => file.startsWith('canal/'), image: 'canal', description: 'Experiencias y comunicaciones de la comunidad Gen.' },
  { test: file => file.startsWith('introduccion/'), image: 'historia', description: 'Conocé la historia y la espiritualidad del Movimiento de los Focolares.' },
  { test: file => file.startsWith('links/'), image: 'contacto', description: 'Enlaces y formas de contactar y seguir a la comunidad Gen.' }
];

function findHtml(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '.git', '.codex-worktrees', 'android', 'ios'].includes(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return findHtml(absolute);
    return entry.isFile() && entry.name.endsWith('.html') ? [absolute] : [];
  });
}

function escapeAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

for (const absolute of findHtml(root)) {
  const relative = path.relative(root, absolute).replace(/\\/g, '/');
  const publicRelative = relative.replace(/^www\//, '');
  let html = fs.readFileSync(absolute, 'utf8');
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1].replace(/\s+/g, ' ').trim() || 'Gen 2';
  const section = sections.find(item => item.test(publicRelative)) || {
    image: 'general',
    description: 'Recursos del Movimiento Gen 2 para vivir y construir la unidad.'
  };
  const pageUrl = new URL(publicRelative === 'index.html' ? '' : publicRelative, siteBase).href;
  const imageUrl = new URL(`aadocumentos/imagenes/compartir/og-${section.image}.png`, siteBase).href;

  html = html
    .replace(/[ \t]*<meta\s+property="og:[^"]+"[^>]*>[ \t]*\r?\n?/gi, '')
    .replace(/[ \t]*<meta\s+name="twitter:[^"]+"[^>]*>[ \t]*\r?\n?/gi, '')
    .replace(/[ \t]*<!--\s*(?:Vista previa al compartir|Open Graph básico|VERSION 0\.1\.0|Imagen de previsualización 1200x630|Para Twitter|Imagen de previsualización para Twitter)\s*-->[ \t]*\r?\n?/gi, '');

  const metadata = `
  <!-- Vista previa al compartir -->
  <meta property="og:locale" content="es_AR">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Gen 2">
  <meta property="og:title" content="${escapeAttribute(title)}">
  <meta property="og:description" content="${escapeAttribute(section.description)}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:secure_url" content="${imageUrl}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeAttribute(title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttribute(title)}">
  <meta name="twitter:description" content="${escapeAttribute(section.description)}">
  <meta name="twitter:image" content="${imageUrl}">
`;

  html = html.replace(/[ \t]*\r?\n?<\/head>/i, `${metadata}</head>`);
  fs.writeFileSync(absolute, html, 'utf8');
  console.log(`${relative} -> og-${section.image}.png`);
}
