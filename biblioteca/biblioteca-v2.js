// Biblioteca Digital v2: catálogo unificado, búsqueda, favoritos, aportes y nube.
// Reemplazar por el nuevo formulario de Google cuando esté creado.
// Debe contener únicamente la carga del archivo (y, si se desea, el código de referencia).
const GOOGLE_FILE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfjjD_05ualjVeWFGaLyoXUbLcveEGmujC2A8M9pF9roSXyLA/viewform?embedded=true';
const GOOGLE_FILE_FORM_SHORT_URL = 'https://forms.gle/q3zVNZubgbXKbYNNA';
const LEGACY_GOOGLE_FORM_ID = '1FAIpQLSf4VFqkTGE0K49b_pCy0Vm8oD5J3YsITs0c4CYa4zD32L92pw';
const DEFAULT_LIBRARY_TOPICS = [
  'Meditación', 'Dios Amor', 'Voluntad de Dios', 'El hermano', 'El mandamiento nuevo',
  'La unidad', 'Jesús Abandonado', 'Jesús en medio', 'Jesús Eucaristía', 'La Palabra de Vida',
  'María', 'El Espíritu Santo', 'La Iglesia', 'Revolución Arcoíris', 'Rojo', 'Anaranjado',
  'Amarillo', 'Verde', 'Azul', 'Índigo', 'Violeta', 'Diálogo',
  'Diálogo 1 · Dentro de la Iglesia Católica', 'Diálogo 2 · Otras Iglesias Cristianas',
  'Diálogo 3 · Otras Religiones', 'Diálogo 4 · Personas sin creencias',
  'Fisionomía del Gen', 'Estatutos', 'Ciudad Nueva'
];

const state = {
  db: null, utils: null, auth: null, resources: [], filtered: [], category: 'todos',
  topics: new Set(), query: '', sort: 'relevancia', page: 1, pageSize: 12,
  currentBook: null, bookPage: 0,
  googleFileFormUrl: GOOGLE_FILE_FORM_URL,
  contributionDirty: false,
  contributionCompleted: false,
  pendingContribution: null,
  showMeditations: false,
  metricFlushTimer: null,
  metricFlushInProgress: false,
  availableTopics: [...DEFAULT_LIBRARY_TOPICS],
  favorites: new Set(JSON.parse(localStorage.getItem('gen_biblioteca_favoritos') || '[]'))
};
const $ = (selector, root = document) => root.querySelector(selector);
const normalize = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const resourceTopics = item => Array.isArray(item.temas) ? item.temas : (Array.isArray(item.atributos) ? item.atributos : []);
const isBook = item => Array.isArray(item.paginas);
const driveIdFromLink = value => {
  const raw = String(value || '').trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return raw;
  const path = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (path) return path[1];
  try { return new URL(raw).searchParams.get('id') || ''; } catch { return ''; }
};
const googleIdFor = item => driveIdFromLink(item.googleId) || driveIdFromLink(item.linkRecurso || item.driveUrl);
const fileUrl = item => item.linkRecurso || item.driveUrl || item.downloadURL || item.archivoUrl || (googleIdFor(item) ? `https://drive.google.com/file/d/${encodeURIComponent(googleIdFor(item))}/view` : '');
const downloadUrlFor = item => item.downloadURL || (googleIdFor(item) ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(googleIdFor(item))}` : fileUrl(item));
const previewUrl = item => item.previewURL || (googleIdFor(item) ? `https://drive.google.com/file/d/${encodeURIComponent(googleIdFor(item))}/preview` : fileUrl(item));
const externalGoogleFormUrl = value => {
  try {
    const url = new URL(value);
    url.searchParams.delete('embedded');
    return url.toString();
  } catch {
    return value;
  }
};

function create(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function formatBytes(bytes) {
  if (!Number(bytes)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** power)).toFixed(power ? 1 : 0)} ${units[power]}`;
}

document.addEventListener('DOMContentLoaded', init);
async function init() {
  bindControls();
  state.resources = [];
  applyFilters();
  try {
    await window.firebaseReady;
    state.db = window.firebaseDb; state.utils = window.firebaseUtils; state.auth = window.firebaseAuth;
    await loadCloudResources();
    await Promise.all([loadDigitalBooks(), loadContributionConfig(), loadLibraryTopics()]);
    setTimeout(() => flushMetricBuffer(), 1200);
  } catch (error) {
    console.warn('Biblioteca en modo local:', error);
    showNotice('Mostramos el catálogo disponible. Algunos contenidos en la nube podrían tardar.');
  }
  buildTopicFilters(); applyFilters(); openFromUrl();
}

function bindControls() {
  document.querySelectorAll('.filtro_btn').forEach(button => button.addEventListener('click', () => {
    state.category = button.dataset.categoria;
    document.querySelectorAll('.filtro_btn').forEach(item => item.classList.toggle('active', item === button));
    $('#mostrarMeditacionesControl').hidden = state.category !== 'todos';
    state.page = 1; applyFilters();
  }));
  $('#mostrarMeditaciones')?.addEventListener('change', event => {
    state.showMeditations = event.target.checked;
    state.page = 1;
    applyFilters();
  });
  $('#busquedaInput')?.addEventListener('input', event => {
    state.query = event.target.value; state.page = 1; applyFilters();
    clearTimeout(state.searchTimer);
    if (state.query.trim().length >= 3) state.searchTimer = setTimeout(() => trackEvent('busqueda', '', state.query.trim().slice(0, 80)), 1200);
  });
  $('#bibliotecaOrden')?.addEventListener('change', event => { state.sort = event.target.value; applyFilters(); });
  $('#soloFavoritos')?.addEventListener('change', applyFilters);
  $('#btnAnterior')?.addEventListener('click', () => changePage(-1));
  $('#btnSiguiente')?.addEventListener('click', () => changePage(1));
  $('#toggleFiltrosBtn')?.addEventListener('click', toggleTopics);
  $('#modalPreview .modal_cerrar')?.addEventListener('click', closePreview);
  $('#modalLibro .modal_cerrar')?.addEventListener('click', closeBook);
  $('#libroAnterior')?.addEventListener('click', () => changeBookPage(-1));
  $('#libroSiguiente')?.addEventListener('click', () => changeBookPage(1));
  $('#btnToggleVista')?.addEventListener('click', toggleBookMode);
  $('#libroDescargaPdf')?.addEventListener('click', event => downloadDigitalBook(state.currentBook, event.currentTarget));
  $('#libroPaginaInput')?.addEventListener('change', event => {
    if (!state.currentBook) return;
    const requested = Number(event.target.value);
    const exact = state.currentBook.paginas.findIndex(page => Number(page.pagina) === requested);
    const index = exact >= 0 ? exact : requested - 1;
    if (index >= 0 && index < state.currentBook.paginas.length) state.bookPage = index;
    renderBookPage();
  });
  $('#abrirAporte')?.addEventListener('click', toggleContributionPanel);
  $('#cerrarAporte')?.addEventListener('click', requestCloseContributionPanel);
  $('#aporteForm')?.addEventListener('submit', saveContributionMetadata);
  $('#aporteForm')?.addEventListener('input', markContributionDirty);
  $('#aporteForm')?.addEventListener('change', markContributionDirty);
  $('#nuevoAporte')?.addEventListener('click', startAnotherContribution);
  $('#finalizarAporte')?.addEventListener('click', finishContribution);
  $('#aportePanel')?.addEventListener('click', event => {
    if (event.target.id === 'aportePanel') requestCloseContributionPanel();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closePreview(); closeBook(); } });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('#aportePanel')?.hidden) requestCloseContributionPanel();
  });
  window.addEventListener('beforeunload', event => {
    if (!hasContributionProgress()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  [$('#modalPreview'), $('#modalLibro')].forEach(modal => modal?.addEventListener('click', event => {
    if (event.target === modal) modal.id === 'modalPreview' ? closePreview() : closeBook();
  }));
}

async function loadCloudResources() {
  const guardados = await window.GenOffline?.getCollection('biblioteca-catalogo').catch(() => null);
  if (guardados?.items && !navigator.onLine) {
    state.resources = guardados.items;
    return;
  }
  const revisionSnapshot = await state.utils.getDoc(
    state.utils.doc(state.db, 'biblioteca_config', 'catalogo')
  ).catch(() => null);
  const revisionData = revisionSnapshot?.exists() ? revisionSnapshot.data() : {};
  const remoteRevision = Number(revisionData.revision) || 0;
  const cachedRevision = Number(guardados?.revision) || 0;
  if (remoteRevision && guardados?.items && cachedRevision === remoteRevision) {
    state.resources = guardados.items;
    return;
  }
  const changes = Array.isArray(revisionData.cambios)
    ? revisionData.cambios.filter(change => Number(change.revision) > cachedRevision)
    : [];
  const canApplyDelta = Boolean(
    cachedRevision
    && guardados?.items
    && changes.length
    && cachedRevision >= Number(revisionData.revisionBase || 0)
  );
  if (canApplyDelta) {
    const latestById = new Map();
    changes.forEach(change => latestById.set(String(change.id), change));
    const resourcesById = new Map(guardados.items.map(item => [String(item.id), item]));
    for (const change of latestById.values()) {
      resourcesById.delete(String(change.id));
      if (change.action !== 'delete') {
        try {
          const resourceSnapshot = await state.utils.getDoc(state.utils.doc(state.db, 'biblioteca_recursos', change.id));
          if (resourceSnapshot.exists() && resourceSnapshot.data().estado === 'publicado') {
            resourcesById.set(String(change.id), { id: resourceSnapshot.id, ...resourceSnapshot.data(), origen: 'firebase' });
          }
        } catch {
          // Un recurso en borrador o archivado deja de ser legible y se retira de la caché pública.
        }
      }
    }
    state.resources = [...resourcesById.values()];
    await window.GenOffline?.replaceCollection('biblioteca-catalogo', state.resources, { revision: remoteRevision }).catch(() => {});
    return;
  }
  const publicQuery = state.utils.query(
    state.utils.collection(state.db, 'biblioteca_recursos'),
    state.utils.where('estado', '==', 'publicado')
  );
  const snapshot = await state.utils.getDocs(publicQuery);
  const cloud = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), origen: 'firebase' }));
  state.resources = cloud;
  await window.GenOffline?.replaceCollection('biblioteca-catalogo', cloud, { revision: remoteRevision }).catch(() => {});
}
async function loadDigitalBooks() {
  const meditacionesGuardadas = await window.GenOffline?.getCollection('meditaciones').catch(() => null);
  if (meditacionesGuardadas?.items?.length && !navigator.onLine) {
    appendDigitalBooks(meditacionesGuardadas.items);
    return;
  }
  const revisionSnapshot = await state.utils.getDoc(
    state.utils.doc(state.db, 'biblioteca_config', 'meditaciones')
  ).catch(() => null);
  const revisionData = revisionSnapshot?.exists() ? revisionSnapshot.data() : {};
  const remoteRevision = Number(revisionData.revision) || 0;
  const cachedRevision = Number(meditacionesGuardadas?.revision) || 0;
  if (
    remoteRevision
    && meditacionesGuardadas?.items?.length
    && cachedRevision === remoteRevision
  ) {
    appendDigitalBooks(meditacionesGuardadas.items);
    return;
  }
  const changes = Array.isArray(revisionData.cambios)
    ? revisionData.cambios.filter(change => Number(change.revision) > cachedRevision)
    : [];
  const canApplyDelta = Boolean(
    cachedRevision
    && meditacionesGuardadas?.items
    && changes.length
    && cachedRevision >= Number(revisionData.revisionBase || 0)
  );
  if (canApplyDelta) {
    const latestById = new Map();
    changes.forEach(change => latestById.set(String(change.id), change));
    const pagesById = new Map(meditacionesGuardadas.items.map(page => [String(page.id), page]));
    for (const change of latestById.values()) {
      pagesById.delete(String(change.id));
      if (change.action !== 'delete') {
        try {
          const pageSnapshot = await state.utils.getDoc(state.utils.doc(state.db, 'meditaciones', change.id));
          if (pageSnapshot.exists()) {
            const page = { id: pageSnapshot.id, ...pageSnapshot.data() };
            if (page.Publico === true && (!page.estado || ['publicado', 'publicada'].includes(page.estado))) {
              pagesById.set(String(page.id), page);
            }
          }
        } catch {
          // Una meditación que pasó a borrador deja de ser legible públicamente y se quita de la caché.
        }
      }
    }
    const updatedPages = [...pagesById.values()];
    await window.GenOffline?.replaceCollection('meditaciones', updatedPages, { revision: remoteRevision }).catch(() => {});
    appendDigitalBooks(updatedPages);
    return;
  }
  const publicQuery = state.utils.query(
    state.utils.collection(state.db, 'meditaciones'),
    state.utils.where('Publico', '==', true)
  );
  const snapshot = await state.utils.getDocs(publicQuery);
  const pages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  await window.GenOffline?.replaceCollection('meditaciones', pages, { revision: remoteRevision }).catch(() => {});
  appendDigitalBooks(pages);
}
function appendDigitalBooks(pages) {
  const books = new Map();
  const publicPages = pages.filter(page =>
    page.Publico === true
    && (!page.estado || ['publicado', 'publicada'].includes(page.estado))
  );
  const meditations = publicPages.map(page => ({
    id: `meditacion-${page.id}`,
    titulo: page.titulo || 'Meditación',
    autor: page.autor || 'Autor no indicado',
    categoria: 'meditaciones',
    tipo: 'DIGITAL',
    descripcion: page.descripcion || String(page.contenido || '').slice(0, 180),
    temas: Array.isArray(page.temas) && page.temas.length ? page.temas : ['Meditación'],
    estado: 'publicado',
    paginas: [page],
    origen: 'meditaciones'
  }));
  state.resources.push(...meditations);
  publicPages.forEach(page => {
    if (!page.libro) return;
    const key = normalize(page.libro);
    if (!books.has(key)) books.set(key, {
      id: `libro-${key.replace(/\s+/g, '-')}`, titulo: page.libro.trim(), autor: page.autor || 'Varios autores',
      categoria: 'libros', tipo: 'DIGITAL', descripcion: `Edición digital de “${page.libro.trim()}”.`,
      temas: ['Meditación'], estado: 'publicado', paginas: [], origen: 'meditaciones'
    });
    books.get(key).paginas.push(page);
  });
  books.forEach(book => book.paginas.sort((a, b) => (Number(a.pagina) || 0) - (Number(b.pagina) || 0)));
  state.resources.push(...books.values());
}
async function loadContributionConfig() {
  const snapshot = await state.utils.getDoc(state.utils.doc(state.db, 'biblioteca_config', 'aportes'));
  if (snapshot.exists() && snapshot.data().googleFormUrl && !snapshot.data().googleFormUrl.includes(LEGACY_GOOGLE_FORM_ID)) {
    const configuredUrl = snapshot.data().googleFormUrl;
    state.googleFileFormUrl = configuredUrl.startsWith(GOOGLE_FILE_FORM_SHORT_URL)
      ? GOOGLE_FILE_FORM_URL
      : configuredUrl;
  }
}
async function loadLibraryTopics() {
  const snapshot = await state.utils.getDoc(state.utils.doc(state.db, 'biblioteca_config', 'temas'));
  const configured = snapshot.exists() && Array.isArray(snapshot.data().temas) ? snapshot.data().temas : [];
  const unique = new Map();
  (configured.length ? configured : DEFAULT_LIBRARY_TOPICS).forEach(topic => unique.set(normalize(topic), String(topic).trim()));
  state.availableTopics = [...unique.values()].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
}

function score(item, query) {
  if (!query) return 0;
  const q = normalize(query); const title = normalize(item.titulo);
  const haystack = normalize([item.titulo, item.autor, item.descripcion, ...resourceTopics(item), item.searchText].join(' '));
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  return q.split(/\s+/).filter(Boolean).reduce((total, token) => total + (haystack.includes(token) ? 10 : 0), 0);
}
function applyFilters() {
  const activeTopics = [...state.topics]; const favoritesOnly = $('#soloFavoritos')?.checked;
  state.filtered = state.resources.filter(item => {
    if (state.category === 'todos' && item.categoria === 'meditaciones' && !state.showMeditations) return false;
    if (state.category !== 'todos' && item.categoria !== state.category) return false;
    if (favoritesOnly && !state.favorites.has(item.id)) return false;
    if (activeTopics.length && !activeTopics.every(topic => resourceTopics(item).some(value => normalize(value) === normalize(topic)))) return false;
    return !state.query || score(item, state.query) > 0;
  });
  state.filtered.sort((a, b) => {
    if (state.sort === 'titulo') return String(a.titulo).localeCompare(String(b.titulo), 'es');
    if (state.sort === 'autor') return String(a.autor).localeCompare(String(b.autor), 'es');
    if (state.sort === 'recientes') return String(b.fechaPublicacion || b.fecha || '').localeCompare(String(a.fechaPublicacion || a.fecha || ''));
    return score(b, state.query) - score(a, state.query) || String(a.titulo).localeCompare(String(b.titulo), 'es');
  });
  render();
}
function render() {
  const grid = $('#bibliotecaGrid'); grid.replaceChildren();
  const pages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
  state.page = Math.min(state.page, pages);
  const visible = state.filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  if (!visible.length) {
    const empty = create('div', 'sin_resultados');
    const emptyIcon = create('div', 'sin_resultados_icono');
    emptyIcon.innerHTML = '<svg aria-hidden="true"><use href="../aadocumentos/svg/iconos-gen.svg?v=20260730-7#sin-resultados"></use></svg>';
    empty.append(emptyIcon, create('h3', '', 'No encontramos recursos con esos filtros.'));
    const clear = create('button', 'btn_preview', 'Limpiar filtros'); clear.addEventListener('click', clearFilters);
    empty.append(clear); grid.append(empty);
  } else visible.forEach(item => grid.append(renderCard(item)));
  $('#contadorResultados').textContent = `${state.filtered.length} ${state.filtered.length === 1 ? 'recurso' : 'recursos'}`;
  $('#paginacion').style.display = pages > 1 ? 'flex' : 'none';
  $('#paginaActual').textContent = state.page; $('#totalPaginas').textContent = pages;
  $('#btnAnterior').disabled = state.page <= 1; $('#btnSiguiente').disabled = state.page >= pages;
}
function renderCard(item) {
  const card = create('article', 'archivo_item'); const header = create('div', 'archivo_header');
  header.append(create('h3', 'archivo_titulo', item.titulo || 'Sin título'), create('div', 'archivo_tipo_badge', item.tipo || item.formato || item.categoria));
  const tags = create('div', 'archivo_atributos');
  resourceTopics(item).filter(topic => normalize(topic) !== 'meditacion').slice(0, 5).forEach(topic => tags.append(create('span', 'atributo_tag', topic)));
  const meta = create('div', 'archivo_meta');
  const details = [item.tamano || formatBytes(item.tamanoBytes), item.anio || (item.fecha ? String(item.fecha).slice(0, 4) : '')].filter(Boolean);
  if (details.length) meta.append(create('span', 'archivo_datos', details.join(' · ')));
  const actions = create('div', 'archivo_acciones');
  const view = create('button', 'btn_preview', isBook(item) ? '📖 Leer' : '👁 Vista previa');
  view.addEventListener('click', () => isBook(item) ? openBook(item) : openPreview(item));
  const favorite = create('button', 'btn_favorito', state.favorites.has(item.id) ? '★ Guardado' : '☆ Guardar');
  favorite.setAttribute('aria-pressed', String(state.favorites.has(item.id))); favorite.addEventListener('click', () => toggleFavorite(item.id));
  const secondary = create('div', 'archivo_acciones_secundarias');
  favorite.title = state.favorites.has(item.id) ? 'Quitar de guardados' : 'Guardar para después';
  secondary.append(favorite);
  if (isBook(item)) {
    const download = create('button', 'btn_descarga_directo', 'Descargar');
    download.type = 'button';
    download.title = 'Descargar el libro completo en PDF';
    download.addEventListener('click', () => downloadDigitalBook(item, download));
    secondary.append(download);
  } else if (fileUrl(item)) {
    const download = create('a', 'btn_descarga_directo', 'Descargar');
    download.href = downloadUrlFor(item); download.target = '_blank'; download.rel = 'noopener';
    download.title = 'Abrir o descargar el recurso';
    download.addEventListener('click', () => trackEvent('descarga', item.id)); secondary.append(download);
  }
  const share = create('button', 'btn_compartir', 'Compartir'); share.title = 'Compartir enlace';
  share.addEventListener('click', () => shareResource(item)); secondary.append(share);
  actions.append(view, secondary);
  card.append(header, create('div', 'archivo_autor', item.autor ? `por ${item.autor}` : 'Autor no indicado'), create('div', 'archivo_descripcion', item.descripcion || 'Sin descripción.'), meta, tags, actions);
  return card;
}

function buildTopicFilters() {
  const all = new Map();
  [...state.availableTopics, ...state.resources.flatMap(resourceTopics)].forEach(topic => {
    const key = normalize(topic);
    if (key && !all.has(key)) all.set(key, topic);
  });
  const container = $('#filtrosAtributos'); container.replaceChildren();
  [...all.values()].sort((a, b) => a.localeCompare(b, 'es')).forEach(topic => {
    const button = create('button', 'atributo_btn', topic);
    button.addEventListener('click', () => {
      state.topics.has(topic) ? state.topics.delete(topic) : state.topics.add(topic);
      button.classList.toggle('active', state.topics.has(topic)); state.page = 1; applyFilters();
    });
    container.append(button);
  });
  container.classList.add('collapsed');
  renderContributionTopics();
}

function renderContributionTopics() {
  const container = $('#aporteTemasOpciones');
  if (!container) return;
  container.replaceChildren();
  state.availableTopics.forEach((topic, index) => {
    const label = create('label', 'aporte_tema_chip');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.name = 'aporte-tema'; input.value = topic; input.id = `aporte-tema-${index}`;
    label.append(input, create('span', '', topic));
    container.append(label);
  });
}
function toggleTopics() {
  const expanded = $('#filtrosAtributos').classList.toggle('collapsed') === false;
  $('#toggleFiltrosBtn').setAttribute('aria-expanded', String(expanded));
  $('#toggleText').textContent = expanded ? 'Ocultar filtros' : 'Mostrar filtros';
  $('#toggleIcon').textContent = expanded ? '▼' : '▶';
}
function clearFilters() {
  state.category = 'todos'; state.query = ''; state.topics.clear(); state.page = 1; state.showMeditations = false;
  $('#busquedaInput').value = ''; if ($('#soloFavoritos')) $('#soloFavoritos').checked = false;
  if ($('#mostrarMeditaciones')) $('#mostrarMeditaciones').checked = false;
  if ($('#mostrarMeditacionesControl')) $('#mostrarMeditacionesControl').hidden = false;
  document.querySelectorAll('.filtro_btn').forEach(button => button.classList.toggle('active', button.dataset.categoria === 'todos'));
  document.querySelectorAll('.atributo_btn').forEach(button => button.classList.remove('active')); applyFilters();
}
function changePage(delta) { state.page += delta; render(); $('#bibliotecaGrid').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function toggleFavorite(id) {
  state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
  localStorage.setItem('gen_biblioteca_favoritos', JSON.stringify([...state.favorites])); applyFilters();
}
async function shareResource(item) {
  const url = new URL(location.href); url.searchParams.set('recurso', item.id);
  try {
    if (navigator.share) await navigator.share({ title: item.titulo, text: item.descripcion || '', url: url.href });
    else { await navigator.clipboard.writeText(url.href); showNotice('Enlace copiado.'); }
    trackEvent('compartir', item.id);
  } catch (error) { if (error.name !== 'AbortError') showNotice('No pudimos compartir el enlace.'); }
}

function openPreview(item) {
  trackEvent('apertura', item.id);
  const modal = $('#modalPreview'); $('#modalTitulo').textContent = item.titulo;
  const body = $('.modal_body', modal); body.replaceChildren();
  const target = fileUrl(item);
  const type = normalize(item.tipo || item.formato || item.contentType); let viewer;
  const isDrive = Boolean(googleIdFor(item));
  if (!isDrive && (type.includes('audio') || String(item.contentType).startsWith('audio/'))) {
    viewer = create('audio', 'biblioteca_media'); viewer.controls = true; viewer.src = target;
  } else if (!isDrive && (type.includes('video') || String(item.contentType).startsWith('video/'))) {
    viewer = create('video', 'biblioteca_media'); viewer.controls = true; viewer.src = target;
  } else {
    viewer = create('iframe', 'biblioteca_preview_frame'); viewer.id = 'modalIframe';
    viewer.src = previewUrl(item); viewer.title = `Vista previa de ${item.titulo}`;
    viewer.allow = 'autoplay'; viewer.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
  }
  body.append(viewer);
  const download = $('#modalDescarga'); download.href = target || '#'; download.hidden = !target;
  $('#modalAyuda').textContent = isDrive
    ? 'La vista depende de los permisos de Drive. Si no carga, abrí el recurso directamente.'
    : 'Si este sitio no permite la vista integrada, abrí el recurso directamente.';
  modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; setResourceUrl(item.id);
}
function closePreview() {
  const modal = $('#modalPreview'); if (!modal || modal.style.display !== 'flex') return;
  modal.style.display = 'none'; $('.modal_body', modal)?.replaceChildren(); document.body.style.overflow = ''; clearResourceUrl();
}
function openBook(book) {
  trackEvent('apertura', book.id);
  state.currentBook = book; state.bookPage = 0; $('#libroTitulo').textContent = book.titulo;
  $('#vistaContinua').style.display = 'none'; $('#paginaContenido').style.display = 'block'; $('#libroFooter').style.display = 'flex';
  renderBookPage(); $('#modalLibro').style.display = 'flex'; document.body.style.overflow = 'hidden'; setResourceUrl(book.id);
}
function renderBookPage() {
  const page = state.currentBook?.paginas[state.bookPage]; if (!page) return;
  const container = $('#paginaContenido'); container.replaceChildren(); const header = create('div', 'pagina_header');
  header.append(create('h2', '', page.titulo || state.currentBook.titulo), create('div', 'pagina_meta', [page.autor, page.pagina ? `Pág. ${page.pagina}` : ''].filter(Boolean).join(' — ')));
  const text = create('div', 'texto_meditacion');
  String(page.contenido || '').split(/\n/).forEach((line, index) => { if (index) text.append(document.createElement('br')); text.append(document.createTextNode(line)); });
  container.append(header, text); $('#libroPaginaInput').value = page.pagina || state.bookPage + 1;
  $('#libroTotalPaginas').textContent = state.currentBook.paginas.length;
  $('#libroAnterior').disabled = state.bookPage === 0; $('#libroSiguiente').disabled = state.bookPage >= state.currentBook.paginas.length - 1;
}
function changeBookPage(delta) {
  const next = state.bookPage + delta;
  if (next >= 0 && next < state.currentBook.paginas.length) { state.bookPage = next; renderBookPage(); }
}
function toggleBookMode() {
  const continuous = $('#vistaContinua').style.display === 'none';
  $('#vistaContinua').style.display = continuous ? 'flex' : 'none'; $('#paginaContenido').style.display = continuous ? 'none' : 'block';
  $('#libroFooter').style.display = continuous ? 'none' : 'flex'; $('#btnToggleVista').textContent = continuous ? '📄 Vista paginada' : '📖 Vista continua';
  if (!continuous) return renderBookPage();
  const container = $('#vistaContinua'); container.replaceChildren();
  state.currentBook.paginas.forEach(page => {
    const section = create('section', 'meditacion_separador');
    section.append(create('h2', '', page.titulo || state.currentBook.titulo), create('div', 'pagina_meta', [page.autor, page.pagina ? `Pág. ${page.pagina}` : ''].filter(Boolean).join(' — ')), create('p', 'texto_meditacion', page.contenido || ''));
    container.append(section);
  });
}
function safeFileName(value) {
  return String(value || 'libro')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .trim().replace(/\s+/g, '_').slice(0, 90) || 'libro';
}
function downloadDigitalBook(book, button) {
  if (!book?.paginas?.length) return showNotice('Este libro todavía no tiene páginas para descargar.');
  if (!window.jspdf?.jsPDF) return showNotice('No se pudo cargar el generador de PDF. Revisá tu conexión e intentá nuevamente.');
  const originalText = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Generando…'; }
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const margin = 23;
    const contentWidth = width - (margin * 2);
    const titleLines = doc.splitTextToSize(String(book.titulo || 'Libro').toUpperCase(), contentWidth);
    doc.setFont('times', 'bold'); doc.setFontSize(30); doc.setTextColor(25, 25, 25);
    doc.text(titleLines, width / 2, height * .38, { align: 'center' });
    doc.setFont('times', 'italic'); doc.setFontSize(17);
    doc.text(book.autor || book.paginas[0]?.autor || 'Autor no indicado', width / 2, (height * .38) + (titleLines.length * 11) + 8, { align: 'center' });
    book.paginas.forEach((page, index) => {
      doc.addPage();
      let y = 27;
      doc.setFont('times', 'bold'); doc.setFontSize(20); doc.setTextColor(115, 68, 210);
      const heading = doc.splitTextToSize(page.titulo || book.titulo, contentWidth);
      doc.text(heading, margin, y); y += (heading.length * 9) + 7;
      doc.setDrawColor(190, 190, 200); doc.line(margin, y, margin + 18, y); y += 9;
      doc.setFont('times', 'normal'); doc.setFontSize(12); doc.setTextColor(20, 20, 20);
      const lines = doc.splitTextToSize(String(page.contenido || '').replace(/<br\s*\/?>/gi, '\n').trim(), contentWidth);
      lines.forEach(line => {
        if (y > height - 24) {
          doc.addPage(); y = 27;
          doc.setFont('times', 'normal'); doc.setFontSize(12); doc.setTextColor(20, 20, 20);
        }
        doc.text(line, margin, y); y += 6.4;
      });
      doc.setFont('times', 'italic'); doc.setFontSize(9); doc.setTextColor(120, 120, 130);
      doc.text(`${page.autor || book.autor || ''} · Pág. ${page.pagina || index + 1}`, width / 2, height - 12, { align: 'center' });
    });
    doc.save(`${safeFileName(book.titulo)}.pdf`);
    trackEvent('descarga', book.id);
    showNotice('PDF generado correctamente.');
  } catch (error) {
    console.error('No se pudo generar el libro:', error);
    showNotice('No se pudo generar el PDF. Intentá nuevamente.');
  } finally {
    if (button) { button.disabled = false; button.textContent = originalText; }
  }
}
function closeBook() {
  if ($('#modalLibro')?.style.display !== 'flex') return;
  $('#modalLibro').style.display = 'none'; document.body.style.overflow = ''; state.currentBook = null; clearResourceUrl();
}
function setResourceUrl(id) { const url = new URL(location.href); url.searchParams.set('recurso', id); history.pushState({}, '', url); }
function clearResourceUrl() { const url = new URL(location.href); url.searchParams.delete('recurso'); history.replaceState({}, '', url); }
function openFromUrl() {
  const id = new URL(location.href).searchParams.get('recurso'); const item = state.resources.find(resource => resource.id === id);
  if (item) isBook(item) ? openBook(item) : openPreview(item);
}

function toggleContributionPanel() {
  const panel = $('#aportePanel');
  panel.hidden ? openContributionPanel() : requestCloseContributionPanel();
}
function openContributionPanel() {
  $('#aportePanel').hidden = false;
  $('#abrirAporte').setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  $('#aporteTitulo')?.focus();
}
function closeContributionPanel() {
  $('#aportePanel').hidden = true;
  $('#abrirAporte').setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}
function markContributionDirty() {
  state.contributionDirty = true;
  state.contributionCompleted = false;
}
function hasContributionProgress() {
  return state.contributionDirty && !state.contributionCompleted;
}
function requestCloseContributionPanel() {
  if (hasContributionProgress() && !window.confirm('¿Querés salir? Se perderá el progreso de este aporte.')) return;
  closeContributionPanel();
  resetContributionForm();
}
function resetContributionForm({ keepPanel = true } = {}) {
  $('#aporteForm').reset();
  $('#aporteForm').hidden = false;
  $('#aporteArchivoPaso').hidden = true;
  $('#aporteGoogleForm').removeAttribute('href');
  $('#aporteEstado').textContent = '';
  document.querySelectorAll('input[name="aporte-tema"]').forEach(input => { input.checked = false; });
  $('#aporteTemaNuevo').value = '';
  state.pendingContribution = null;
  state.contributionDirty = false;
  state.contributionCompleted = false;
  if (keepPanel) $('#aporteTitulo').focus();
}
function startAnotherContribution() {
  if (hasContributionProgress() && !window.confirm('¿Ya terminaste de adjuntar el archivo? Si continuás, se iniciará un aporte nuevo.')) return;
  resetContributionForm();
}
async function finishContribution() {
  const user = state.auth?.currentUser;
  if (!user || !state.pendingContribution) {
    showNotice('No encontramos una ficha lista para enviar.');
    return;
  }
  const button = $('#finalizarAporte');
  button.disabled = true;
  button.textContent = 'Enviando ficha…';
  try {
    await state.utils.addDoc(state.utils.collection(state.db, 'biblioteca_aportes'), {
      ...state.pendingContribution,
      creadoPor: user.uid,
      creadoEn: new Date()
    });
    state.contributionCompleted = true;
    state.contributionDirty = false;
    closeContributionPanel();
    resetContributionForm({ keepPanel: false });
    showNotice('Aporte enviado. El equipo revisará la ficha y el archivo.');
  } catch (error) {
    console.error(error);
    $('#aporteEstado').textContent = `El archivo no se perdió, pero no pudimos enviar la ficha: ${error.message}`;
    button.disabled = false;
  } finally {
    button.textContent = 'Enviar ficha y finalizar';
  }
}
async function saveContributionMetadata(event) {
  event.preventDefault();
  const user = state.auth?.currentUser;
  if (!user) {
    showNotice('Iniciá sesión para enviar un aporte.');
    window.genOpenAuthModal?.();
    return;
  }
  const button = $('#btnGuardarAporte'); button.disabled = true;
  const code = `BIB-${Date.now().toString(36).toUpperCase()}`;
  try {
    state.pendingContribution = {
      codigo: code,
      titulo: $('#aporteTitulo').value.trim(),
      autor: $('#aporteAutor').value.trim(),
      categoria: $('#aporteCategoria').value,
      anio: Number($('#aporteAnio').value) || null,
      idioma: $('#aporteIdioma').value,
      tipo: $('#aporteTipo').value,
      temas: [...document.querySelectorAll('input[name="aporte-tema"]:checked')].map(input => input.value),
      temaPropuesto: $('#aporteTemaNuevo').value.trim(),
      descripcion: $('#aporteDescripcion').value.trim(),
      estado: 'pendiente'
    };
    $('#aporteForm').hidden = true;
    $('#aporteArchivoPaso').hidden = false;
    state.contributionDirty = true;
    if (state.googleFileFormUrl) {
      $('#aporteGoogleForm').hidden = false;
      $('#aporteGoogleForm').href = externalGoogleFormUrl(state.googleFileFormUrl);
      $('#aporteEstado').textContent = '';
    } else {
      $('#aporteGoogleForm').hidden = true;
      $('#aporteGoogleForm').removeAttribute('href');
      $('#aporteEstado').textContent = 'El formulario de archivo todavía no está configurado. La ficha no fue enviada.';
    }
  } catch (error) {
    console.error(error);
    state.pendingContribution = null;
    $('#aporteEstado').textContent = `No se pudo preparar la ficha: ${error.message}`;
  } finally { button.disabled = false; }
}
function showNotice(message) {
  let notice = $('#bibliotecaAviso');
  if (!notice) { notice = create('div', 'biblioteca_aviso'); notice.id = 'bibliotecaAviso'; notice.setAttribute('role', 'status'); document.body.append(notice); }
  notice.textContent = message; notice.classList.add('visible'); clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => notice.classList.remove('visible'), 4000);
}

const METRIC_BUFFER_PREFIX = 'gen_biblioteca_metricas_v2_';
const METRIC_BATCH_SIZE = 20;
const metricFieldByType = { apertura: 'aperturas', descarga: 'descargas', compartir: 'compartidos', busqueda: 'busquedas' };

function metricSessionId() {
  const key = 'gen_biblioteca_metric_session';
  let id = sessionStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
  return id;
}
function emptyMetricBuffer(uid) {
  return { uid, aperturas: 0, descargas: 0, compartidos: 0, busquedas: 0, total: 0, recursos: [], sessionId: metricSessionId() };
}
function readMetricBuffer(uid) {
  try {
    const saved = JSON.parse(localStorage.getItem(`${METRIC_BUFFER_PREFIX}${uid}`) || 'null');
    return saved?.uid === uid ? { ...emptyMetricBuffer(uid), ...saved } : emptyMetricBuffer(uid);
  } catch { return emptyMetricBuffer(uid); }
}
function persistMetricBuffer(buffer) {
  localStorage.setItem(`${METRIC_BUFFER_PREFIX}${buffer.uid}`, JSON.stringify(buffer));
}
function metricAlreadyCounted(key) {
  const storageKey = 'gen_biblioteca_metric_seen';
  try {
    const seen = new Set(JSON.parse(sessionStorage.getItem(storageKey) || '[]'));
    if (seen.has(key)) return true;
    seen.add(key);
    sessionStorage.setItem(storageKey, JSON.stringify([...seen].slice(-250)));
    return false;
  } catch { return false; }
}
function trackEvent(type, resourceId = '', queryText = '') {
  const user = state.auth?.currentUser;
  if (!user || !state.db || !state.utils) return;
  const field = metricFieldByType[type];
  if (!field) return;
  const dedupeValue = type === 'busqueda' ? normalize(queryText).slice(0, 80) : String(resourceId || 'general');
  if (metricAlreadyCounted(`${type}:${dedupeValue}`)) return;
  const buffer = readMetricBuffer(user.uid);
  buffer[field] += 1;
  buffer.total += 1;
  if (resourceId && !buffer.recursos.includes(resourceId) && buffer.recursos.length < 30) buffer.recursos.push(resourceId);
  persistMetricBuffer(buffer);
  if (buffer.total >= METRIC_BATCH_SIZE) flushMetricBuffer();
  else {
    clearTimeout(state.metricFlushTimer);
    state.metricFlushTimer = setTimeout(() => flushMetricBuffer(), 180000);
  }
}
async function flushMetricBuffer() {
  const user = state.auth?.currentUser;
  if (!user || state.metricFlushInProgress || !state.db || !state.utils) return;
  const buffer = readMetricBuffer(user.uid);
  if (!buffer.total) return;
  state.metricFlushInProgress = true;
  persistMetricBuffer(emptyMetricBuffer(user.uid));
  try {
    await state.utils.addDoc(state.utils.collection(state.db, 'biblioteca_metricas'), {
      aperturas: buffer.aperturas,
      descargas: buffer.descargas,
      compartidos: buffer.compartidos,
      busquedas: buffer.busquedas,
      total: buffer.total,
      recursos: buffer.recursos.slice(0, 30),
      sessionId: String(buffer.sessionId || '').slice(0, 80),
      fecha: new Date().toISOString().slice(0, 10),
      creadoPor: user.uid,
      creadoEn: new Date()
    });
  } catch (error) {
    const pending = readMetricBuffer(user.uid);
    ['aperturas', 'descargas', 'compartidos', 'busquedas', 'total'].forEach(field => { pending[field] += Number(buffer[field]) || 0; });
    pending.recursos = [...new Set([...buffer.recursos, ...pending.recursos])].slice(0, 30);
    persistMetricBuffer(pending);
    console.debug('Métricas de Biblioteca pendientes para el próximo intento:', error.message);
  } finally {
    state.metricFlushInProgress = false;
  }
}

window.filtrarCategoria = category => document.querySelector(`.filtro_btn[data-categoria="${category}"]`)?.click();
window.buscarArchivos = () => { state.query = $('#busquedaInput')?.value || ''; applyFilters(); };
window.toggleFiltrosTemas = toggleTopics; window.cambiarPagina = changePage; window.cerrarModal = closePreview;
window.cerrarModalLibro = closeBook; window.cambiarPaginaLibro = changeBookPage; window.toggleModoVista = toggleBookMode;
window.abrirFormularioGoogle = openContributionPanel;
window.descargarLibroPDF = () => downloadDigitalBook(state.currentBook, $('#libroDescargaPdf'));
