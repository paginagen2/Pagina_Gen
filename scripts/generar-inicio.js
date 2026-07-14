const fs = require('node:fs/promises');
const path = require('node:path');
const { cert, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'datos', 'inicio.json');
const SONGBOOK_OUTPUT_DIR = path.join(PROJECT_ROOT, 'datos', 'cancionero');
const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const SONGBOOK_PAGE_SIZE = 15;

function argentinaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});

  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    firestore: `${parts.day}/${parts.month}/${parts.year}`
  };
}

function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function serializeDocument(document) {
  return { id: document.id, ...document.data() };
}

function selectDailyMeditation(meditations, date) {
  if (!meditations.length) return null;
  const start = new Date('2024-01-01T00:00:00-03:00');
  const current = new Date(`${date.iso}T00:00:00-03:00`);
  const elapsedDays = Math.floor((current - start) / 86400000);
  const cycle = Math.floor(elapsedDays / meditations.length);
  const index = ((elapsedDays % meditations.length) + meditations.length) % meditations.length;

  const ordered = meditations.map(meditation => {
    let hash = 0;
    const seed = `${meditation.id}${cycle}`;
    for (let position = 0; position < seed.length; position += 1) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(position);
      hash |= 0;
    }
    return { ...meditation, dailyOrder: hash };
  }).sort((a, b) => a.dailyOrder - b.dailyOrder);

  return ordered[index];
}

function publicChannelPost(post, now) {
  const roles = Array.isArray(post.rolesDestinatarios) ? post.rolesDestinatarios : [];
  const publicationTime = timestampValue(post.fechaPublicacion);
  return roles.length === 0
    && (post.estado === 'publicada' || (post.estado === 'programada' && publicationTime <= now));
}

function compactNews(item) {
  return {
    id: item.id,
    titulo: item.titulo || 'Novedad Gen',
    descripcion: item.descripcion || item.resumen || '',
    fotoUrl: item.fotoUrl || item.imagenUrl || '',
    href: item.href || item.enlace || (item.fromChannel ? `canal/canal.html#${item.id}` : '')
  };
}

function compactSong(document, likesCount = null) {
  const song = serializeDocument(document);
  return {
    id: song.id,
    titulo: song.titulo || 'Sin título',
    artista: song.artista || 'Desconocido',
    categoria: song.categoria || 'gen',
    tono: song.tono || song.tonalidad || '',
    likesCount: likesCount == null ? Number(song.likesCount || 0) : Number(likesCount),
    reproducciones: Number(song.reproducciones || 0)
  };
}

function songRanking(a, b) {
  return b.likesCount - a.likesCount
    || b.reproducciones - a.reproducciones
    || a.titulo.localeCompare(b.titulo, 'es');
}

function buildArtists(songs) {
  const artists = new Map();
  songs.forEach(song => {
    const current = artists.get(song.artista) || { nombre: song.artista, likesCount: 0, cancionesCount: 0 };
    current.likesCount += song.likesCount;
    current.cancionesCount += 1;
    artists.set(song.artista, current);
  });
  return Array.from(artists.values()).sort((a, b) =>
    b.likesCount - a.likesCount
    || b.cancionesCount - a.cancionesCount
    || a.nombre.localeCompare(b.nombre, 'es')
  );
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  JSON.parse(await fs.readFile(temporaryPath, 'utf8'));
  await fs.rename(temporaryPath, filePath);
}

async function generateSongbookFiles(songs, generatedAt, date) {
  const resolvedOutput = path.resolve(SONGBOOK_OUTPUT_DIR);
  const resolvedDataRoot = path.resolve(PROJECT_ROOT, 'datos');
  if (!resolvedOutput.startsWith(`${resolvedDataRoot}${path.sep}`)) {
    throw new Error('La carpeta generada del cancionero quedó fuera de datos/.');
  }

  await fs.rm(resolvedOutput, { recursive: true, force: true });
  await fs.mkdir(resolvedOutput, { recursive: true });

  const orderedSongs = [...songs].sort(songRanking);
  const artists = buildArtists(orderedSongs);
  const categories = {
    todas: orderedSongs,
    misa: orderedSongs.filter(song => song.categoria === 'misa'),
    gen: orderedSongs.filter(song => song.categoria === 'gen'),
    fogon: orderedSongs.filter(song => song.categoria === 'fogon')
  };

  const categoryManifest = {};
  for (const [category, categorySongs] of Object.entries(categories)) {
    const pageCount = Math.max(1, Math.ceil(categorySongs.length / SONGBOOK_PAGE_SIZE));
    categoryManifest[category] = { total: categorySongs.length, paginas: pageCount };
    for (let page = 1; page <= pageCount; page += 1) {
      const start = (page - 1) * SONGBOOK_PAGE_SIZE;
      await writeJson(path.join(resolvedOutput, category, `${page}.json`), {
        categoria: category,
        pagina: page,
        total: categorySongs.length,
        hayMas: page < pageCount,
        canciones: categorySongs.slice(start, start + SONGBOOK_PAGE_SIZE)
      });
    }
  }

  await writeJson(path.join(resolvedOutput, 'buscar.json'), { canciones: orderedSongs });
  await writeJson(path.join(resolvedOutput, 'artistas.json'), { artistas });
  await writeJson(path.join(resolvedOutput, 'inicio.json'), {
    schemaVersion: 1,
    fechaGeneracion: date.iso,
    generadoEn: generatedAt,
    destacados: orderedSongs.slice(0, 6),
    artistas: artists.slice(0, 5),
    categorias: categoryManifest
  });
}

async function main() {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountRaw) throw new Error('Falta el secreto FIREBASE_SERVICE_ACCOUNT.');

  const serviceAccount = JSON.parse(serviceAccountRaw);
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();
  const date = argentinaDateParts();
  const now = Date.now();

  const [phrasesSnapshot, meditationsSnapshot, pasapalabraSnapshot, pdvSnapshot, carouselSnapshot, channelSnapshot, songsSnapshot] = await Promise.all([
    db.collection('frases').get(),
    db.collection('meditaciones').get(),
    db.collection('pasapalabra').where('estado', '==', 'publicado').get(),
    db.collection('pdv').get(),
    db.collection('carrusel').orderBy('createdAt', 'desc').limit(5).get(),
    db.collection('canal_publicaciones').get(),
    db.collection('canciones').where('estado', '==', 'publicado').get()
  ]);

  const phrases = phrasesSnapshot.docs.map(serializeDocument).filter(item => item.activa !== false);
  const meditations = meditationsSnapshot.docs.map(serializeDocument);
  const pasapalabras = pasapalabraSnapshot.docs.map(serializeDocument);
  const pdvs = pdvSnapshot.docs.map(serializeDocument).sort((a, b) =>
    timestampValue(b.fecha || b.fechaCreacion) - timestampValue(a.fecha || a.fechaCreacion));
  const carousel = carouselSnapshot.docs.map(serializeDocument);
  const channel = channelSnapshot.docs.map(serializeDocument)
    .filter(post => publicChannelPost(post, now))
    .sort((a, b) => timestampValue(b.fechaPublicacion) - timestampValue(a.fechaPublicacion));

  const compactSongs = await Promise.all(songsSnapshot.docs.map(async document => {
    const likesAggregate = await document.ref.collection('likes').count().get();
    return compactSong(document, likesAggregate.data().count);
  }));

  const phraseIndex = phrases.length ? Number(date.iso.replaceAll('-', '')) % phrases.length : 0;
  const phrase = phrases[phraseIndex] || null;
  const meditation = selectDailyMeditation(meditations, date);
  const pasapalabra = pasapalabras.find(item => item.fecha === date.firestore) || null;
  const pdv = pdvs[0] || null;

  const news = [
    ...channel.filter(item => item.destacarEnCarrusel).map(item => ({ ...item, fromChannel: true })),
    ...carousel
  ].slice(0, 5).map(compactNews);

  const generatedAt = new Date().toISOString();
  const output = {
    schemaVersion: 1,
    fechaGeneracion: date.iso,
    generadoEn: generatedAt,
    frase: phrase?.frase || 'Que todos sean uno',
    pasapalabra: pasapalabra ? {
      id: pasapalabra.id,
      titulo: pasapalabra.titulo || 'Pasapalabra del día',
      fecha: pasapalabra.fecha,
      href: `pasapalabra/pasapalabra_de_hoy.html`
    } : null,
    meditacion: meditation ? {
      id: meditation.id,
      titulo: meditation.titulo || 'Reflexión para hoy',
      href: `meditacion/meditacion_diaria.html`
    } : null,
    palabraDeVida: pdv ? {
      id: pdv.id,
      mes: pdv.mes || 'Sin fecha disponible',
      cita: pdv.citaPrincipal || pdv.titulo || 'Leé la Palabra de Vida de este mes',
      href: `pdv/pdv.html?id=${encodeURIComponent(pdv.urlSlug || pdv.id)}`
    } : null,
    novedades: news
  };

  await writeJson(OUTPUT_PATH, output);
  await generateSongbookFiles(compactSongs, generatedAt, date);
  console.log(`Inicio diario generado para ${date.iso}: ${OUTPUT_PATH}`);
  console.log(`Cancionero liviano generado: ${SONGBOOK_OUTPUT_DIR}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
