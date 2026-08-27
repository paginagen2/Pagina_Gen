'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexSource = fs.readFileSync(path.join(root, 'index', 'index.js'), 'utf8');
const authSource = fs.readFileSync(path.join(root, 'auth.js'), 'utf8');

assert.match(indexSource, /addEventListener\('gen:profile-updated'/,
  'El Inicio debe reaccionar cuando se cargan o cambian las zonas del perfil.');
assert.match(indexSource, /refreshIndexChannel\(roles, \{ force: true \}\)/,
  'El carrusel debe actualizarse forzosamente al recibir el perfil.');
assert.match(indexSource, /refreshVersion !== channelRefreshVersion/,
  'Una consulta anterior no debe sobrescribir el carrusel de la audiencia actual.');
assert.match(indexSource, /rolesDestinatarios', 'array-contains-any'/,
  'Las comunicaciones zonales deben consultarse mediante los roles del usuario.');
assert.match(indexSource, /Canal de tus zonas/,
  'El Inicio debe identificar una comunicación zonal.');
assert.match(authSource, /onSnapshot[\s\S]*gen:profile-updated/,
  'Los cambios de zonas en el perfil deben notificarse al Inicio sin recargar la página.');

console.log('Carrusel segmentado por zonas verificado.');
