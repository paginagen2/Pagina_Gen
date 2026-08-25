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
  'funcion_notificaciones',
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
assert.match(adminJs, /audienceCode[\s\S]*batch\.commit/, 'La zona no genera su código inicial');
assert.doesNotMatch(adminJs, /codigoComunicacionInicial/, 'La creación de zona todavía mezcla su código con administración de comunicación');
assert.match(adminJs, /function accessCodeData\([^)]*type[^)]*\)[\s\S]*tipo:\s*type/, 'El tipo del código de zona no se guarda correctamente');
assert.match(adminJs, /function revokeUserRole/, 'Falta la revocación de roles');
assert.match(adminJs, /último administrador/, 'Falta proteger al último administrador');
assert.match(adminHtml, /id="roles-perfiles-list"/, 'Falta la vista agrupada por rol');
assert.match(adminHtml, /id="perfiles-list"/, 'Falta la vista de perfiles');
assert.match(adminHtml, /id="funciones-list"/, 'Falta la lista separada de funciones');
assert.match(adminHtml, /id="comunicacion-admin-list"/, 'Falta separar la administración de comunicación');
assert.match(adminHtml, /id="desactivar-acceso-panel"/, 'Falta el flujo avanzado de desactivación');
assert.doesNotMatch(adminHtml, /id="acceso-tipo"/, 'El formulario todavía permite crear funciones manualmente');
assert.match(adminJs, /function prepareCodeForRole/, 'Falta crear códigos desde cada zona o función');
assert.match(adminJs, /funcion_comunicacion_\$\{zone\.id\}/, 'Las zonas existentes no derivan su función de comunicación');
assert.match(adminJs, /function assignRoleToUser/, 'Falta agregar roles desde los perfiles');
assert.match(adminJs, /escribí exactamente/, 'La desactivación no exige confirmar el nombre');
assert.match(authJs, /expanded\.has\('gen2'\)[\s\S]*expanded\.add\('gen'\)/, 'Gen2 no hereda Gen');
assert.match(authJs, /has-account-actions/, 'El menú no fuerza la visibilidad del acceso administrativo');
assert.match(read('aaglobal/sidebar.js'), /data-static-admin-link/, 'La barra no prepara el acceso administrativo');
assert.match(authJs, /role\.startsWith\('funcion_'\) && role !== 'funcion_correccion_letras'/, 'Los administradores parciales no muestran el acceso o Corrección Letras sigue habilitado');
assert.match(canalJs, /genExpandRoles/, 'Canal no aplica la herencia de Gen2');
assert.match(rules, /roles\.hasAny\(\['gen'\]\)[\s\S]*userRoles\(\)\.hasAny\(\['gen2'\]\)/, 'Firebase no aplica la herencia Gen2 → Gen');
assert.match(rules, /funcion_comunicacion_' \+ data\.zonaAdministradora/, 'Firebase no deriva el permiso de zona');
assert.match(rules, /canManage\('funcion_subida_multiple'\)/, 'Subida múltiple no tiene permiso independiente');
assert.match(adminJs, /notificaciones:\s*'funcion_notificaciones'/, 'Notificaciones no tiene un panel independiente');
assert.doesNotMatch(adminHtml, /data-section="lyrics"|id="lyrics-section"/, 'Corrección de letras todavía aparece en el administrador');
assert.doesNotMatch(adminJs, /lyrics:\s*'funcion_correccion_letras'|initLyricsCorrector/, 'Corrección de letras todavía conserva acceso o lógica administrativa');
assert.match(adminJs, /item\.id !== 'funcion_correccion_letras'/, 'La función antigua de Corrección Letras puede reaparecer desde Firebase');
assert.match(adminJs, /function openOnlyAssignedSection[\s\S]*allowedButtons\.length === 1[\s\S]*changeSection/, 'Un administrador de una sola sección no entra directamente a su panel');
assert.match(adminJs, /Boolean\(audio\.esPrincipal\) \|\| audio\.tipo === 'oficial'/, 'Una versión oficial no se marca como audio guía principal');
assert.match(adminJs, /ya tiene como audio guía principal[\s\S]*¿Querés reemplazarlo/, 'No se avisa antes de reemplazar el audio principal');
assert.match(rules, /notificaciones_pendientes[\s\S]*canManage\('funcion_notificaciones'\)/, 'Firebase no protege Notificaciones con su permiso propio');
assert.match(rules, /match \/recursos\/{resourceId}[\s\S]*allow create: if canManage\('funcion_subida_multiple'\)/, 'Subida múltiple no puede crear recursos');
assert.match(adminJs, /function validateBulkSongs[\s\S]*parseSongContent\(lyrics\)\.chords/, 'Subida múltiple no valida acordes de canciones');
assert.match(adminJs, /function normalizeBulkSong[\s\S]*idioma:/, 'Subida múltiple no normaliza el idioma de canciones');
assert.match(rules, /function activeFunction[\s\S]*data\.activa != false/, 'Firebase no respeta funciones desactivadas');

console.log('Roles verificados: jerarquía, funciones, zonas, perfiles y revocación.');
