const assert = require('node:assert/strict');
const {
  calculateDelta,
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
  sanitizePublicItem({ id: 'a', titulo: 'Pública', usuarioId: 'privado', creadoPor: 'privado' }),
  { id: 'a', titulo: 'Pública' }
);

console.log('Sincronización incremental verificada.');
