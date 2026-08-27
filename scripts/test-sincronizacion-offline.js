const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  calculateDelta,
  mergeIncrementalSnapshot,
  revisionFor,
  sanitizePublicItem
} = require('./generar-sincronizacion-offline');

const previous = [
  { id: 'a', titulo: 'Anterior' },
  { id: 'b', titulo: 'Se elimina' },
  { id: 'c', titulo: 'Sin cambios' }
];
const next = [
  { id: 'a', titulo: 'Corregida' },
  { id: 'c', titulo: 'Sin cambios' },
  { id: 'd', titulo: 'Nueva' }
];

const delta = calculateDelta(previous, next);
assert.deepEqual(delta.deletes, ['b']);
assert.deepEqual(delta.upserts.map(item => item.id), ['a', 'd']);
assert.equal(revisionFor(next), revisionFor([...next].map(item => ({ titulo: item.titulo, id: item.id }))));
assert.notEqual(revisionFor(previous), revisionFor(next));
assert.deepEqual(
  mergeIncrementalSnapshot(previous, [
    { id: 'a', titulo: 'Corregida', estado: 'publicado', _offlineActualizadoEn: 'x' },
    { id: 'b', _offlineDeleted: true },
    { id: 'd', titulo: 'Nueva', estado: 'publicado' }
  ], item => item.estado === 'publicado'),
  [
    { id: 'a', titulo: 'Corregida', estado: 'publicado' },
    { id: 'c', titulo: 'Sin cambios' },
    { id: 'd', titulo: 'Nueva', estado: 'publicado' }
  ]
);
assert.deepEqual(
  sanitizePublicItem({ id: 'a', titulo: 'Pública', usuarioId: 'privado', creadoPor: 'privado', creadoPorNombre: 'Perfil privado' }),
  { id: 'a', titulo: 'Pública' }
);

const offlineManager = fs.readFileSync(path.join(__dirname, '..', 'aaglobal', 'offline-manager.js'), 'utf8');
assert.match(offlineManager, /SYNC_CHECK_INTERVAL\s*=\s*30\s*\*\s*60\s*\*\s*1000/);
assert.match(offlineManager, /DEFAULT_CACHE_FRESHNESS\s*=\s*6\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
assert.match(offlineManager, /INCREMENTAL_SYNC_ENABLED\s*=\s*false/);
assert.match(offlineManager, /window\.Capacitor\?\.isNativePlatform\?\.\(\)\s*\?\s*publicSyncRoot\s*:\s*root/);
assert.match(offlineManager, /https:\/\/paginagen2\.github\.io\/Pagina_Gen\//);
assert.match(offlineManager, /setInterval\([\s\S]*syncUsedSections\(\)[\s\S]*SYNC_CHECK_INTERVAL/);
assert.match(offlineManager, /visibilitychange[\s\S]*document\.hidden[\s\S]*syncUsedSections\(\)/);
assert.match(offlineManager, /if \(!required\.size\) return/);
assert.match(offlineManager, /DOMContentLoaded[\s\S]*markSectionUsed\(\)[\s\S]*syncUsedSections\(\)/);

console.log('Sincronización incremental verificada.');
