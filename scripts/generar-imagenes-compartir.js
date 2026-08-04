const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const spritePath = path.join(root, 'aadocumentos', 'svg', 'iconos-gen.svg');
const outputDir = path.join(root, 'aadocumentos', 'imagenes', 'compartir');
const sprite = fs.readFileSync(spritePath, 'utf8');

const cards = {
  general: {
    title: 'Gen 2',
    subtitle: 'Recursos para vivir la unidad',
    icon: 'inicio'
  },
  cancionero: {
    title: 'Cancionero',
    subtitle: 'Canciones y acordes para compartir',
    icon: 'musica'
  },
  pdv: {
    title: 'Palabra de Vida',
    subtitle: 'La Palabra vivida cada mes',
    icon: 'pdv'
  },
  meditacion: {
    title: 'Meditación diaria',
    subtitle: 'Un momento para detenerse y profundizar',
    icon: 'meditacion'
  },
  pasapalabra: {
    title: 'Pasapalabra',
    subtitle: 'Una palabra para vivir el presente',
    icon: 'pasapalabra'
  },
  animadores: {
    title: 'Gen Animadores',
    subtitle: 'Recursos para encuentros y comunidades',
    icon: 'animadores'
  },
  biblioteca: {
    title: 'Biblioteca',
    subtitle: 'Materiales para leer, descubrir y compartir',
    icon: 'biblioteca'
  },
  canal: {
    title: 'Canal Gen',
    subtitle: 'Experiencias y comunicación',
    icon: 'canal'
  },
  historia: {
    title: 'Nuestra historia',
    subtitle: 'El Movimiento y su espiritualidad',
    icon: 'historia'
  },
  contacto: {
    title: 'Contacto',
    subtitle: 'Enlaces y formas de encontrarnos',
    icon: 'contacto'
  }
};

function escapeXml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  }[character]));
}

function getIcon(id) {
  const match = sprite.match(new RegExp(`<symbol\\s+id="${id}"\\s+viewBox="([^"]+)"[^>]*>([\\s\\S]*?)<\\/symbol>`));
  if (!match) throw new Error(`No se encontró el icono ${id}`);
  return { viewBox: match[1], content: match[2] };
}

function cardSvg(card) {
  const icon = getIcon(card.icon);
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#090d12"/>
      <stop offset="0.58" stop-color="#14111f"/>
      <stop offset="1" stop-color="#2a1550"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#8d5cf6" stop-opacity=".33"/>
      <stop offset="1" stop-color="#8d5cf6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" rx="0" fill="url(#background)"/>
  <circle cx="950" cy="300" r="315" fill="url(#glow)"/>
  <path d="M0 562H1200" stroke="#8d5cf6" stroke-opacity=".45" stroke-width="2"/>
  <g font-family="Arial, Helvetica, sans-serif">
    <text x="82" y="105" fill="#ffffff" font-size="48" font-weight="700">G2</text>
    <text x="82" y="310" fill="#ffffff" font-size="76" font-weight="700">${escapeXml(card.title)}</text>
    <text x="86" y="374" fill="#cbb7f7" font-size="31" font-weight="400">${escapeXml(card.subtitle)}</text>
    <text x="84" y="592" fill="#a991da" font-size="24" letter-spacing="2">PÁGINA GEN</text>
  </g>
  <circle cx="953" cy="300" r="158" fill="#251842" stroke="#7445c7" stroke-width="3"/>
  <svg x="848" y="195" width="210" height="210" viewBox="${icon.viewBox}" fill="none" stroke="#d4baff" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">
    ${icon.content}
  </svg>
</svg>`;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const [name, card] of Object.entries(cards)) {
    const target = path.join(outputDir, `og-${name}.png`);
    await sharp(Buffer.from(cardSvg(card))).png({ compressionLevel: 9 }).toFile(target);
    console.log(path.relative(root, target));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
