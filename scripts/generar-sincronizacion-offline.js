const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(PROJECT_ROOT, 'datos', 'sincronizacion');
const MANIFEST_PATH = path.join(OUTPUT_ROOT, 'manifest.json');
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'pagina-gen';
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY
  || 'AIzaSyB7US5r--cM82usyzLqd-ckamgIdyewfKE';
const RUN_QUERY_URL = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/(default)/documents:runQuery?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`;
const SERVICE_ACCOUNT_VALUE = process.env.FIREBASE_SERVICE_ACCOUNT || '';
let adminDatabase = null;

if (SERVICE_ACCOUNT_VALUE) {
  const { initializeApp, cert, getApps } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(SERVICE_ACCOUNT_VALUE);
  } catch {
    serviceAccount = JSON.parse(Buffer.from(SERVICE_ACCOUNT_VALUE, 'base64').toString('utf8'));
  }
  if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
  adminDatabase = getFirestore();
}

const COLLECTIONS = {
  canciones: {
    source: 'canciones',
    include: item => item.estado === 'publicado'
  },
  meditaciones: {
    source: 'meditaciones',
    include: item => item.Publico === true
  },
  recursos: {
    source: 'recursos',
    include: item => item.estado === 'publicado'
  },
  biblioteca: {
    source: 'biblioteca_recursos',
    include: item => item.estado === 'publicado'
  },
  pasapalabra: {
    source: 'pasapalabra',
    include: item => item.estado === 'publicado'
  },
  pdv: {
    source: 'pdv',
    include: item => item.version === 2 && ['publicado', 'programado'].includes(item.estado)
  },
  canal: {
    source: 'canal_publicaciones',
    include: item => ['publicada', 'programada'].includes(item.estado)
      && Array.isArray(item.rolesDestinatarios)
      && item.rolesDestinatarios.length === 0
  }
};

const PRIVATE_FIELDS = new Set([
  'creadoPor',
  'actualizadoPor',
  'usuarioId',
  'email',
  'correo',
  'uid'
]);

function sanitizePublicItem(item) {
  return Object.fromEntries(Object.entries(item).filter(([key]) => !PRIVATE_FIELDS.has(key)));
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
    return Object.fromEntries(Object.entries(value.mapValue.fields || {})
      .map(([key, item]) => [key, decodeValue(item)]));
  }
  return undefined;
}

function decodeDocument(document) {
  return {
    id: document.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(document.fields || {})
      .map(([key, value]) => [key, decodeValue(value)]))
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

function revisionFor(items) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(stableValue(items)))
    .digest('hex')
    .slice(0, 16);
}

async function runCollectionQuery(collectionId) {
  if (adminDatabase) {
    const snapshot = await adminDatabase.collection(collectionId).get();
    return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
  }
  const response = await fetch(RUN_QUERY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: { from: [{ collectionId }] }
    }),
    signal: AbortSignal.timeout(45000)
  });
  if (!response.ok) {
    throw new Error(`Firestore rechazó ${collectionId} (${response.status}): ${await response.text()}`);
  }
  return (await response.json()).filter(row => row.document).map(row => decodeDocument(row.document));
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  JSON.parse(await fs.readFile(temporaryPath, 'utf8'));
  await fs.rename(temporaryPath, filePath);
}

function calculateDelta(previousItems, nextItems) {
  const previous = new Map(previousItems.map(item => [String(item.id), item]));
  const next = new Map(nextItems.map(item => [String(item.id), item]));
  const upserts = [];

  next.forEach((item, id) => {
    const before = previous.get(id);
    if (!before || JSON.stringify(stableValue(before)) !== JSON.stringify(stableValue(item))) {
      upserts.push(item);
    }
  });

  return {
    upserts,
    deletes: [...previous.keys()].filter(id => !next.has(id))
  };
}

async function generateCollection(name, definition, previousManifest) {
  const snapshotPath = path.join(OUTPUT_ROOT, `${name}.json`);
  const deltaPath = path.join(OUTPUT_ROOT, `${name}.delta.json`);
  const previousSnapshot = await readJson(snapshotPath, { items: [] });
  const items = (await runCollectionQuery(definition.source))
    .filter(definition.include)
    .map(sanitizePublicItem)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const revision = revisionFor(items);
  const previousRevision = previousManifest?.collections?.[name]?.revision || '';

  if (revision === previousRevision) {
    return previousManifest.collections[name];
  }

  const delta = calculateDelta(previousSnapshot.items || [], items);
  await writeJson(snapshotPath, {
    schemaVersion: 1,
    collection: name,
    revision,
    generatedAt: new Date().toISOString(),
    items
  });
  await writeJson(deltaPath, {
    schemaVersion: 1,
    collection: name,
    fromRevision: previousRevision,
    toRevision: revision,
    generatedAt: new Date().toISOString(),
    upserts: delta.upserts,
    deletes: delta.deletes
  });

  return {
    revision,
    previousRevision,
    count: items.length,
    snapshot: `datos/sincronizacion/${name}.json`,
    delta: `datos/sincronizacion/${name}.delta.json`
  };
}

async function main() {
  if (!adminDatabase) {
    throw new Error('Falta FIREBASE_SERVICE_ACCOUNT para generar todas las colecciones sin modificar reglas.');
  }
  const previousManifest = await readJson(MANIFEST_PATH, { schemaVersion: 1, collections: {} });
  const entries = await Promise.all(Object.entries(COLLECTIONS)
    .map(async ([name, definition]) => [
      name,
      await generateCollection(name, definition, previousManifest)
    ]));

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    collections: Object.fromEntries(entries)
  };
  await writeJson(MANIFEST_PATH, manifest);
  console.log(`Sincronización preparada para ${entries.length} colecciones.`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  calculateDelta,
  revisionFor,
  sanitizePublicItem,
  stableValue
};
