const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = path => fs.readFileSync(path, 'utf8');
const publicHtml = read('biblioteca/biblioteca.html');
const publicJs = read('biblioteca/biblioteca-v2.js');
const publicCss = read('biblioteca/biblioteca-polish.css');
const adminHtml = read('admin/admin.html');
const adminJs = read('admin/admin.js');
const firestoreRules = read('firestore.rules');
const firebaseConfig = JSON.parse(read('firebase.json'));
const firebaseRuntime = read('aaglobal/firebase-config.js');

[
  'bibliotecaGrid', 'bibliotecaOrden', 'soloFavoritos', 'abrirAporte',
  'aporteForm', 'aporteGoogleForm', 'finalizarAporte', 'modalPreview', 'modalLibro'
].forEach(id => assert.match(publicHtml, new RegExp(`id="${id}"`), `Falta #${id} en Biblioteca`));

[
  'biblioteca-section', 'bib-form', 'bib-list', 'bib-link-recurso', 'bib-aportes-list', 'bib-google-form-url',
  'bib-progress'
].forEach(id => assert.match(adminHtml, new RegExp(`id="${id}"`), `Falta #${id} en Admin`));

assert.match(publicHtml, /biblioteca-v2\.js/, 'La Biblioteca no carga el controlador v2');
assert.doesNotMatch(publicHtml, /src="biblioteca\.js/, 'La Biblioteca todavía carga el controlador anterior');
assert.doesNotMatch(publicJs, /GOOGLE_FILE_FORM_URL\s*=\s*['"][^'"]*1FAIpQLSf4VFqkTGE0K49b_pCy0Vm8oD5J3YsITs0c4CYa4zD32L92pw/, 'La Biblioteca todavía usa el formulario viejo como formulario activo');
assert.match(publicJs, /q3zVNZubgbXKbYNNA/, 'Falta conectar el formulario nuevo');
assert.match(publicJs, /beforeunload/, 'Falta proteger el aporte al recargar o navegar');
assert.match(publicJs, /window\.confirm\(/, 'Falta confirmar el cierre de un aporte con progreso');
assert.match(publicJs, /contributionDirty/, 'Falta detectar progreso sin finalizar');
assert.match(publicHtml, /jspdf\.umd\.min\.js/, 'Falta el generador de PDF para libros digitales');
assert.match(publicJs, /function downloadDigitalBook/, 'Los libros digitales no se pueden descargar');
assert.match(publicJs, /textContent/, 'La interfaz pública debe renderizar texto de forma segura');
assert.match(publicJs, /where\('estado', '==', 'publicado'\)/, 'La consulta pública debe pedir solo publicados');
assert.match(publicCss, /repeat\(auto-fit,minmax\(min\(100%,360px\),1fr\)\)/, 'La grilla no se adapta al ancho disponible');
assert.match(publicCss, /\.archivo_acciones > \.btn_preview,[\s\S]*height: 42px;/, 'La acción principal no tiene la altura unificada');
assert.match(publicCss, /\.aporte_panel \{ position: fixed; inset: 0;/, 'El formulario de aportes no ocupa la pantalla');
assert.match(publicJs, /DEFAULT_LIBRARY_TOPICS/, 'Falta el catálogo maestro de temas');
assert.match(adminJs, /extractGoogleDriveId/, 'El administrador no reconoce enlaces de Drive');
assert.doesNotMatch(adminHtml, /bib-migrate-legacy/, 'La opción de migración todavía aparece en el administrador');
assert.doesNotMatch(adminJs, /migrateLegacyLibrary/, 'La lógica de migración anterior todavía está activa');
assert.doesNotMatch(adminJs, /uploadBytesResumable/, 'El administrador todavía depende de Firebase Storage');
assert.match(firestoreRules, /match \/biblioteca_recursos\//, 'Faltan reglas de recursos');
assert.match(firestoreRules, /match \/biblioteca_aportes\//, 'Faltan reglas de aportes');
assert.match(firestoreRules, /temaPropuesto/, 'Las reglas no validan propuestas de temas');
assert.match(firestoreRules, /match \/biblioteca_config\//, 'Faltan reglas de configuración');
assert.match(firestoreRules, /match \/biblioteca_eventos\//, 'Faltan reglas de métricas');
assert.equal(firebaseConfig.storage, undefined, 'Firebase no debe requerir Storage');
assert.doesNotMatch(firebaseRuntime, /firebase-storage\.js/, 'La configuración global todavía descarga Firebase Storage');

console.log('Biblioteca v2 verificada: Drive, administración, seguridad y métricas.');
