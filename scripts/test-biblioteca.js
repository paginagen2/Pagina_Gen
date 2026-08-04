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
  'bibliotecaGrid', 'bibliotecaOrden', 'soloFavoritos', 'mostrarMeditaciones', 'abrirAporte',
  'aporteForm', 'aporteAnio', 'aporteIdioma', 'aporteTipo', 'aporteGoogleForm',
  'finalizarAporte', 'modalPreview', 'modalLibro'
].forEach(id => assert.match(publicHtml, new RegExp(`id="${id}"`), `Falta #${id} en Biblioteca`));

[
  'biblioteca-section', 'bib-form', 'bib-list', 'bib-link-recurso', 'bib-tamano-numero',
  'bib-tamano-unidad', 'bib-aportes-list', 'bib-google-form-url',
  'bib-progress'
].forEach(id => assert.match(adminHtml, new RegExp(`id="${id}"`), `Falta #${id} en Admin`));

assert.match(publicHtml, /biblioteca-v2\.js/, 'La Biblioteca no carga el controlador v2');
assert.match(publicHtml, /biblioteca-v2\.js\?v=20260804-pagina-anterior/, 'La Biblioteca puede seguir usando un controlador anterior desde caché');
assert.match(publicHtml, /id="soloFavoritos"[\s\S]{0,300}id="mostrarMeditaciones"/, 'Mostrar meditaciones no está junto a Solo guardados');
assert.doesNotMatch(publicHtml, /onclick="(?:toggleModoVista|cambiarPaginaLibro)/, 'El visor conserva controles antiguos que bloquean sus botones');
assert.match(publicJs, /state\.bookContinuous = !state\.bookContinuous/, 'La vista continua no mantiene un estado confiable');
assert.doesNotMatch(publicJs, /requested - 1/, 'El visor todavía interpreta el número real como una posición correlativa');
assert.match(publicJs, /const finalPage = \[\.\.\.state\.currentBook\.paginas\]\.reverse\(\)\.find/, 'El visor no muestra como total la página real de la última meditación');
assert.match(publicJs, /pageNumber <= requested && pageNumber > closestPage/, 'El visor no retrocede hasta la meditación anterior cuando una página no existe');
assert.doesNotMatch(publicHtml, /src="biblioteca\.js/, 'La Biblioteca todavía carga el controlador anterior');
assert.doesNotMatch(publicJs, /GOOGLE_FILE_FORM_URL\s*=\s*['"][^'"]*1FAIpQLSf4VFqkTGE0K49b_pCy0Vm8oD5J3YsITs0c4CYa4zD32L92pw/, 'La Biblioteca todavía usa el formulario viejo como formulario activo');
assert.match(publicJs, /1FAIpQLSfjjD_05ualjVeWFGaLyoXUbLcveEGmujC2A8M9pF9roSXyLA\/viewform\?embedded=true/, 'Falta conectar la URL embebible del formulario nuevo');
assert.match(publicJs, /beforeunload/, 'Falta proteger el aporte al recargar o navegar');
assert.match(publicJs, /window\.confirm\(/, 'Falta confirmar el cierre de un aporte con progreso');
assert.match(publicJs, /contributionDirty/, 'Falta detectar progreso sin finalizar');
assert.match(publicJs, /pendingContribution/, 'La ficha no se mantiene pendiente hasta confirmar el archivo');
assert.doesNotMatch(publicHtml, /aporteArchivoConfirmado/, 'La confirmación redundante de archivo todavía aparece');
assert.match(publicHtml, /Adjuntar archivo en Google Forms/, 'Falta el acceso externo para adjuntar el archivo');
assert.doesNotMatch(publicHtml, /<iframe id="aporteGoogleForm"/, 'Google Forms todavía intenta cargarse embebido');
assert.match(publicJs, /driveIdFromLink\(item\.googleId\)/, 'Los IDs de Drive guardados no se normalizan');
assert.match(publicHtml, /jspdf\.umd\.min\.js/, 'Falta el generador de PDF para libros digitales');
assert.match(publicJs, /function downloadDigitalBook/, 'Los libros digitales no se pueden descargar');
assert.match(publicJs, /textContent/, 'La interfaz pública debe renderizar texto de forma segura');
assert.match(publicJs, /where\('estado', '==', 'publicado'\)/, 'La consulta pública debe pedir solo publicados');
assert.match(publicJs, /page\.Publico === true/, 'Las meditaciones no públicas todavía pueden formar libros');
assert.match(publicHtml, /data-categoria="meditaciones"/, 'Falta la categoría Meditaciones');
assert.match(publicJs, /categoria:\s*'meditaciones'/, 'Las meditaciones públicas no se agregan individualmente');
assert.match(publicJs, /showMeditations/, 'Falta ocultar las meditaciones en Todos por defecto');
assert.match(publicJs, /await loadCloudResources\(\);/, 'La carga paralela todavía puede borrar las meditaciones');
assert.match(publicJs, /remoteRevision/, 'La carga de meditaciones no usa una revisión de caché');
assert.match(adminJs, /registerMeditationLibraryChange/, 'El Admin no registra cambios incrementales de meditaciones');
assert.match(publicJs, /canApplyDelta/, 'La Biblioteca no actualiza la caché de meditaciones incrementalmente');
assert.match(publicJs, /METRIC_BATCH_SIZE\s*=\s*20/, 'Las métricas no se agrupan antes de escribir en Firebase');
assert.match(publicJs, /biblioteca_metricas/, 'Las métricas agrupadas no se envían a su colección');
assert.match(adminJs, /registerBibliotecaCatalogChange/, 'El Admin no registra cambios incrementales del catálogo');
assert.match(adminJs, /ensureBibliotecaCacheRevisions/, 'El Admin no inicializa las versiones de caché');
assert.match(publicJs, /biblioteca-catalogo[\s\S]*revisionData/, 'El catálogo no comprueba su versión antes de consultar recursos');
assert.doesNotMatch(adminJs, /migrateLegacyMeditationVisibility/, 'El Admin todavía publica meditaciones antiguas automáticamente');
assert.doesNotMatch(publicJs, /const LEGACY_RESOURCES/, 'Los recursos históricos todavía pueden ignorar el estado del Admin');
assert.match(publicJs, /state\.resources = cloud;/, 'El catálogo público no depende únicamente de los recursos publicados');
assert.match(publicCss, /repeat\(auto-fit,minmax\(min\(100%,360px\),1fr\)\)/, 'La grilla no se adapta al ancho disponible');
assert.match(publicCss, /\.archivo_acciones > \.btn_preview,[\s\S]*height: 42px;/, 'La acción principal no tiene la altura unificada');
assert.match(publicCss, /\.aporte_panel \{ position: fixed; inset: 0;/, 'El formulario de aportes no ocupa la pantalla');
assert.match(publicJs, /DEFAULT_LIBRARY_TOPICS/, 'Falta el catálogo maestro de temas');
assert.match(adminJs, /extractGoogleDriveId/, 'El administrador no reconoce enlaces de Drive');
assert.match(adminHtml, /115QmX7BX51iepsdZmG_2-quSlu3VfzIVKNdLgPnu52X8xBdInLKA60U05XKvmHTYxMFiesNv/, 'Falta el acceso directo a la carpeta de Drive');
assert.match(adminJs, /bibParseVisibleSize/, 'El tamaño visible no se normaliza');
assert.doesNotMatch(adminHtml, /bib-migrate-legacy/, 'La opción de migración todavía aparece en el administrador');
assert.doesNotMatch(adminJs, /migrateLegacyLibrary/, 'La lógica de migración anterior todavía está activa');
assert.doesNotMatch(adminJs, /uploadBytesResumable/, 'El administrador todavía depende de Firebase Storage');
assert.match(firestoreRules, /match \/biblioteca_recursos\//, 'Faltan reglas de recursos');
assert.match(firestoreRules, /match \/biblioteca_aportes\//, 'Faltan reglas de aportes');
assert.match(firestoreRules, /temaPropuesto/, 'Las reglas no validan propuestas de temas');
assert.match(firestoreRules, /match \/biblioteca_config\//, 'Faltan reglas de configuración');
assert.match(firestoreRules, /match \/biblioteca_eventos\//, 'Faltan reglas de métricas');
assert.match(firestoreRules, /match \/biblioteca_metricas\//, 'Faltan reglas para métricas agrupadas');
assert.equal(firebaseConfig.storage, undefined, 'Firebase no debe requerir Storage');
assert.doesNotMatch(firebaseRuntime, /firebase-storage\.js/, 'La configuración global todavía descarga Firebase Storage');

console.log('Biblioteca v2 verificada: Drive, administración, seguridad y métricas.');
