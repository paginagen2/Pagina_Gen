'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const hosting = config.hosting;
const ignored = new Set(hosting?.ignore || []);
const firestoreWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'publicar-web.yml'), 'utf8');
const downloadsPage = fs.readFileSync(path.join(root, 'descargas', 'descargas.html'), 'utf8');
const androidVersion = JSON.parse(fs.readFileSync(path.join(root, 'datos', 'android-version.json'), 'utf8'));

assert.equal(hosting?.public, '.', 'La configuración auxiliar debe apuntar a la raíz controlada.');
assert(ignored.has('descargas/Pagina-Gen.apk'), 'Firebase Hosting no debe intentar publicar el APK.');
assert(ignored.has('_apk-pruebas/**'), 'La carpeta de APK de prueba debe quedar excluida.');
assert(ignored.has('www/**'), 'La copia interna de Capacitor no debe publicarse en la web.');
assert.doesNotMatch(firestoreWorkflow, /deploy\s+--only\s+hosting/, 'La web debe publicarse solamente mediante GitHub Pages.');

const publicApk = path.join(root, 'descargas', 'Pagina-Gen.apk');
assert(fs.existsSync(publicApk), 'Falta el APK público de Android.');
for (const forbidden of ['android', 'ios', 'www', '_apk-pruebas', 'tmp']) {
  assert(!fs.existsSync(path.join(root, forbidden)), `La publicación web no debe contener ${forbidden}.`);
}

const publicApkUrl = 'https://paginagen2.github.io/Pagina_Gen/descargas/Pagina-Gen.apk';
assert(downloadsPage.includes(publicApkUrl), 'Descargas debe enlazar al APK de GitHub Pages.');
assert.equal(androidVersion.apkUrl, publicApkUrl, 'La versión pública debe usar el APK de GitHub Pages.');

console.log('Publicación verificada: GitHub Pages, un APK público y copias nativas excluidas.');
