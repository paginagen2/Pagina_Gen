const fs = require('node:fs/promises');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'datos', 'inicio.json');
const ANDROID_VERSION_PATH = path.join(PROJECT_ROOT, 'datos', 'android-version.json');
const PASAPALABRA_DATA_DIR = path.join(PROJECT_ROOT, 'datos', 'pasapalabra');
const PASAPALABRA_PAGE_SIZE = 6;
const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'pagina-gen';
// La API key web identifica el proyecto; no es una credencial administrativa.
// El acceso sigue limitado por firestore.rules.
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY
  || 'AIzaSyB7US5r--cM82usyzLqd-ckamgIdyewfKE';
const RUN_QUERY_URL = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/(default)/documents:runQuery?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`;
const ANDROID_CONFIG_URL = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/(default)/documents/configuracion_publica/android?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`;
const LEGACY_FIREBASE_APK_URL = 'https://pagina-gen.web.app/descargas/Pagina-Gen.apk';
const PUBLIC_APK_URL = 'https://paginagen2.github.io/Pagina_Gen/descargas/Pagina-Gen.apk';

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

function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: String(value) };
}

function decodeValue(value = {}) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decodeValue(item)]));
  }
  return undefined;
}

function decodeDocument(document) {
  const id = document.name.split('/').pop();
  const data = Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decodeValue(value)]));
  return { id, ...data };
}

function fieldFilter(fieldPath, op, value) {
  return { fieldFilter: { field: { fieldPath }, op, value: encodeValue(value) } };
}

function whereAll(...filters) {
  const active = filters.filter(Boolean);
  if (active.length === 1) return active[0];
  return { compositeFilter: { op: 'AND', filters: active } };
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function runQuery(collectionId, { where, orderBy = [], limit } = {}) {
  const structuredQuery = {
    from: [{ collectionId }],
    ...(where ? { where } : {}),
    ...(orderBy.length ? {
      orderBy: orderBy.map(([fieldPath, direction = 'ASCENDING']) => ({
        field: { fieldPath },
        direction
      }))
    } : {}),
    ...(limit ? { limit } : {})
  };

  const retryDelays = [0, 2000, 8000];
  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt]) await wait(retryDelays[attempt]);

    const response = await fetch(RUN_QUERY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ structuredQuery }),
      signal: AbortSignal.timeout(30000)
    });

    if (response.ok) {
      const rows = await response.json();
      return rows.filter(row => row.document).map(row => decodeDocument(row.document));
    }

    const details = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === retryDelays.length - 1) {
      throw new Error(`Firestore rechazó la consulta de ${collectionId} (${response.status}): ${details}`);
    }
    console.warn(`Firestore limitó ${collectionId}; reintento ${attempt + 2} de ${retryDelays.length}.`);
  }
}

function timestampValue(value) {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function pasapalabraDateValue(value) {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return 0;
  return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function compactPasapalabra(item) {
  return {
    id: item.id,
    titulo: item.titulo || 'Sin título',
    fecha: item.fecha || '',
    reflexion: item.reflexion || ''
  };
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

function compactNews(item) {
  return {
    id: item.id,
    titulo: item.titulo || 'Novedad Gen',
    descripcion: item.descripcion || item.resumen || '',
    fotoUrl: item.fotoUrl || item.imagenUrl || '',
    href: item.fromChannel ? `canal/publicacion.html?id=${encodeURIComponent(item.id)}` : (item.href || item.enlace || ''),
    textoEnlace: item.textoEnlace || 'Más información',
    etiquetaCarrusel: item.etiquetaCarrusel || item.categoria || 'Novedad',
    fechaEventoInicio: item.fechaEventoInicio || '',
    fechaEventoFin: item.fechaEventoFin || '',
    fechaVencimiento: item.fechaVencimiento || null
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  JSON.parse(await fs.readFile(temporaryPath, 'utf8'));
  await fs.rename(temporaryPath, filePath);
}

function normalizeAndroidVersion(value) {
  const configuredApkUrl = String(value?.apkUrl || '');
  const normalized = {
    versionCode: Number(value?.versionCode),
    versionName: String(value?.versionName || ''),
    minimumVersionCode: Number(value?.minimumVersionCode),
    apkUrl: configuredApkUrl === LEGACY_FIREBASE_APK_URL ? PUBLIC_APK_URL : configuredApkUrl,
    titulo: String(value?.titulo || 'Actualizá Gen 2'),
    descripcion: String(value?.descripcion || 'Hay una nueva versión disponible.'),
    textoEnlace: String(value?.textoEnlace || 'Descargar actualización')
  };
  if (!Number.isInteger(normalized.versionCode)
      || !Number.isInteger(normalized.minimumVersionCode)
      || normalized.minimumVersionCode > normalized.versionCode
      || !normalized.apkUrl.startsWith('https://')) {
    throw new Error('La configuración de Android es inválida');
  }
  return normalized;
}

async function loadAndroidVersion() {
  try {
    const response = await fetch(ANDROID_CONFIG_URL, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Firestore respondió ${response.status}`);
    return normalizeAndroidVersion(decodeDocument(await response.json()));
  } catch (error) {
    console.warn(`No se pudo leer la versión Android desde Firestore; se usará el respaldo local: ${error.message}`);
    return normalizeAndroidVersion(JSON.parse(await fs.readFile(ANDROID_VERSION_PATH, 'utf8')));
  }
}

async function main() {
  const date = argentinaDateParts();
  const now = new Date();
  const androidVersion = await loadAndroidVersion();

  const [
    phrases,
    meditations,
    pasapalabrasPublicados,
    pdvs
  ] = await Promise.all([
    runQuery('frases', { limit: 100 }),
    runQuery('meditaciones', {
      // La colección también contiene material interno. Solicitar solamente
      // documentos públicos permite que las reglas validen toda la consulta.
      where: fieldFilter('Publico', 'EQUAL', true),
      limit: 500
    }),
    runQuery('pasapalabra', {
      where: fieldFilter('estado', 'EQUAL', 'publicado')
    }),
    runQuery('pdv', {
      // La consulta debe demostrar las mismas condiciones exigidas por
      // firestore.rules. El índice version + fechaPublicacion ya está
      // declarado en firestore.indexes.json.
      where: whereAll(
        fieldFilter('version', 'EQUAL', 2),
        fieldFilter('fechaPublicacion', 'LESS_THAN_OR_EQUAL', now)
      ),
      orderBy: [['fechaPublicacion', 'DESCENDING']],
      limit: 12
    })
  ]);

  const activePhrases = phrases.filter(item => item.activa !== false);
  const phraseIndex = activePhrases.length ? Number(date.iso.replaceAll('-', '')) % activePhrases.length : 0;
  const phrase = activePhrases[phraseIndex] || null;
  const meditation = selectDailyMeditation(meditations, date);
  const pasapalabra = pasapalabrasPublicados.find(item => item.fecha === date.firestore) || null;
  const historialPasapalabra = pasapalabrasPublicados
    .sort((a, b) => pasapalabraDateValue(b.fecha) - pasapalabraDateValue(a.fecha)
      || String(b.id).localeCompare(String(a.id)))
    .map(compactPasapalabra);
  const pdv = pdvs
    .filter(item => item.version === 2)
    .filter(item => ['publicado', 'programado'].includes(item.estado))
    .filter(item => timestampValue(item.fechaPublicacion) <= now.getTime())
    .sort((a, b) => String(b.periodo || '').localeCompare(String(a.periodo || ''))
      || timestampValue(b.fechaPublicacion) - timestampValue(a.fechaPublicacion))[0] || null;
  const output = {
    schemaVersion: 1,
    fechaGeneracion: date.iso,
    generadoEn: now.toISOString(),
    android: androidVersion,
    frase: phrase?.frase || 'Que todos sean uno',
    pasapalabra: pasapalabra ? {
      id: pasapalabra.id,
      titulo: pasapalabra.titulo || 'Pasapalabra del día',
      fecha: pasapalabra.fecha,
      href: 'pasapalabra/pasapalabra_de_hoy.html'
    } : null,
    meditacion: meditation ? {
      id: meditation.id,
      titulo: meditation.titulo || 'Reflexión para hoy',
      href: 'meditacion/meditacion_diaria.html'
    } : null,
    palabraDeVida: pdv ? {
      id: pdv.id,
      mes: pdv.mes || 'Sin fecha disponible',
      cita: pdv.citaPrincipal || pdv.titulo || 'Leé la Palabra de Vida de este mes',
      href: `pdv/pdv.html?id=${encodeURIComponent(pdv.id)}`
    } : null,
    canal: null,
    novedades: []
  };

  await writeJson(OUTPUT_PATH, output);
  await writeJson(path.join(PASAPALABRA_DATA_DIR, 'hoy.json'), {
    schemaVersion: 1,
    fecha: date.iso,
    generadoEn: now.toISOString(),
    pasapalabra: pasapalabra ? compactPasapalabra(pasapalabra) : null
  });

  const totalPaginas = Math.max(1, Math.ceil(historialPasapalabra.length / PASAPALABRA_PAGE_SIZE));
  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    const inicio = (pagina - 1) * PASAPALABRA_PAGE_SIZE;
    await writeJson(path.join(PASAPALABRA_DATA_DIR, 'paginas', `${pagina}.json`), {
      schemaVersion: 1,
      pagina,
      tamanioPagina: PASAPALABRA_PAGE_SIZE,
      total: historialPasapalabra.length,
      siguientePagina: pagina < totalPaginas ? pagina + 1 : null,
      items: historialPasapalabra.slice(inicio, inicio + PASAPALABRA_PAGE_SIZE)
    });
  }
  console.log(`Inicio diario generado para ${date.iso}.`);
  console.log(`Pasapalabra generado en ${totalPaginas} página(s) de hasta ${PASAPALABRA_PAGE_SIZE} elementos.`);
  console.log(`Lecturas del proceso diario: ${phrases.length + meditations.length + pasapalabrasPublicados.length + pdvs.length}.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
