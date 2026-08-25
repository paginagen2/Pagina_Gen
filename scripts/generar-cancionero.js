const fs = require('node:fs/promises');
const path = require('node:path');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'datos', 'cancionero');
const PAGE_SIZE = 15;
const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT || '';

function serviceAccount() {
  if (!serviceAccountValue) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT para generar el cancionero diario.');
  try { return JSON.parse(serviceAccountValue); }
  catch { return JSON.parse(Buffer.from(serviceAccountValue, 'base64').toString('utf8')); }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value)}\n`, 'utf8');
  JSON.parse(await fs.readFile(temporary, 'utf8'));
  await fs.rename(temporary, file);
}

function compact(song) {
  return {
    id: song.id,
    titulo: song.titulo || 'Sin título',
    artista: song.artista || 'Desconocido',
    categoria: ['misa', 'gen', 'fogon'].includes(song.categoria) ? song.categoria : 'gen',
    tono: song.tono || song.tonalidad || '',
    likesCount: Number(song.likesCount || 0),
    reproducciones: Number(song.reproducciones || 0)
  };
}

async function mapLimited(items, limit, mapper) {
  const result = new Array(items.length); let cursor = 0;
  async function worker() { while (cursor < items.length) { const index = cursor++; result[index] = await mapper(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return result;
}

async function main() {
  if (!getApps().length) initializeApp({ credential: cert(serviceAccount()) });
  const db = getFirestore();
  const snapshot = await db.collection('canciones').where('estado', 'in', ['publicado', 'publicada']).get();
  const songs = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
  const counted = await mapLimited(songs, 6, async song => ({
    ...song,
    likesCount: (await db.collection('canciones').doc(song.id).collection('likes').count().get()).data().count
  }));
  const ordered = counted.map(compact).sort((a, b) => b.likesCount - a.likesCount || b.reproducciones - a.reproducciones || a.titulo.localeCompare(b.titulo, 'es'));
  const categories = ['todas', 'misa', 'gen', 'fogon']; const categorySummary = {};
  for (const category of categories) {
    const items = category === 'todas' ? ordered : ordered.filter(song => song.categoria === category);
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    categorySummary[category] = { total: items.length, paginas: pages };
    for (let page = 1; page <= pages; page += 1) {
      await writeJson(path.join(OUTPUT, category, `${page}.json`), {
        categoria: category, pagina: page, total: items.length, hayMas: page < pages,
        canciones: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      });
    }
  }
  const artists = new Map();
  ordered.forEach(song => { const current = artists.get(song.artista) || { nombre: song.artista, likesCount: 0, cancionesCount: 0 }; current.likesCount += song.likesCount; current.cancionesCount += 1; artists.set(song.artista, current); });
  const artistList = [...artists.values()].sort((a, b) => b.likesCount - a.likesCount || b.cancionesCount - a.cancionesCount || a.nombre.localeCompare(b.nombre, 'es'));
  await writeJson(path.join(OUTPUT, 'buscar.json'), { canciones: ordered });
  await writeJson(path.join(OUTPUT, 'artistas.json'), { artistas: artistList });
  await writeJson(path.join(OUTPUT, 'inicio.json'), {
    schemaVersion: 1, fechaGeneracion: new Date().toISOString().slice(0, 10), generadoEn: new Date().toISOString(),
    destacados: ordered.slice(0, 6), artistas: artistList.slice(0, 5), categorias: categorySummary
  });
  console.log(`Cancionero diario generado: ${ordered.length} canciones y ${artistList.length} artistas.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
