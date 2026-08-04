const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const adminJs = read('admin/admin.js');
const adminHtml = read('admin/admin.html');
const authJs = read('auth.js');
const canalJs = read('canal/canal.js');
const rules = read('firestore.rules');

[
  'funcion_comunicacion',
  'funcion_pasapalabra',
  'funcion_meditaciones',
  'funcion_biblioteca',
  'funcion_cancionero',
  'funcion_subida_multiple',
  'funcion_recursos',
  'funcion_frases',
  'funcion_pdv'
].forEach(role => assert.match(adminJs, new RegExp(role), `Falta el rol ${role}`));

assert.match(adminJs, /funcion_comunicacion_\$\{id\}/, 'La zona no genera su función de comunicación');
assert.match(adminJs, /audienceCode[\s\S]*communicationCode[\s\S]*batch\.commit/, 'La zona no genera ambos códigos');
assert.match(adminJs, /function revokeUserRole/, 'Falta la revocación de roles');
assert.match(adminJs, /último administrador/, 'Falta proteger al último administrador');
assert.match(adminHtml, /id="roles-perfiles-list"/, 'Falta la vista agrupada por rol');
assert.match(adminHtml, /id="perfiles-list"/, 'Falta la vista de perfiles');
assert.match(adminHtml, /id="funciones-list"/, 'Falta la lista separada de funciones');
assert.match(adminHtml, /id="desactivar-acceso-panel"/, 'Falta el flujo avanzado de desactivación');
assert.doesNotMatch(adminHtml, /id="acceso-tipo"/, 'El formulario todavía permite crear funciones manualmente');
assert.match(adminJs, /function prepareCodeForRole/, 'Falta crear códigos desde cada zona o función');
assert.match(adminJs, /funcion_comunicacion_\$\{zone\.id\}/, 'Las zonas existentes no derivan su función de comunicación');
assert.match(adminJs, /function assignRoleToUser/, 'Falta agregar roles desde los perfiles');
assert.match(adminJs, /escribí exactamente/, 'La desactivación no exige confirmar el nombre');
assert.match(authJs, /expanded\.has\('gen2'\)[\s\S]*expanded\.add\('gen'\)/, 'Gen2 no hereda Gen');
assert.match(canalJs, /genExpandRoles/, 'Canal no aplica la herencia de Gen2');
assert.match(rules, /roles\.hasAny\(\['gen'\]\)[\s\S]*userRoles\(\)\.hasAny\(\['gen2'\]\)/, 'Firebase no aplica la herencia Gen2 → Gen');
assert.match(rules, /funcion_comunicacion_' \+ data\.zonaAdministradora/, 'Firebase no deriva el permiso de zona');
assert.match(rules, /canManage\('funcion_subida_multiple'\)/, 'Subida múltiple no tiene permiso independiente');
assert.match(rules, /function activeFunction[\s\S]*data\.activa != false/, 'Firebase no respeta funciones desactivadas');

console.log('Roles verificados: jerarquía, funciones, zonas, perfiles y revocación.');
