import { DatabaseService } from '../aaglobal/firebase-config-cancionero.js?v=20260730-online-catalog';
import { parseSongContent } from './song-content.js?v=20260819-1';

const DATA_ROOT = '../datos/cancionero';
let canciones = [];
let cancionesFiltradas = [];
let cancionesSeleccionadas = new Set();
let cancionesConocidas = new Map();
let indiceBusqueda = null;
let cancionesExtra = null;
let temporizadorBusqueda = null;
let vistaActual = 'destacados';
let categoriaActual = 'todas';
let paginaActual = 0;
let hayMasCanciones = false;
window.modoSeleccion = false;
let mostrandoTodosArtistas = false;
let artistasOrdenados = [];
let artistasCompletosCargados = false;
let usuarioFavoritos = null;
const favoritosIds = new Set();
const favoritosConsultados = new Set();
let favoritosPerfilCargados = false;
let versionCargaFavoritos = 0;
let soloFavoritos = false;
let cancionesFavoritas = [];
let pdfDraftSongs = [];
let pdfLastFocus = null;
let pdfPickerCategory = 'todas';
let pdfPickerSearchTimer = null;
const publicacionesRecientesCache = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  inicializarEventListeners();
  restaurarBorradorAporte();
  inicializarFavoritos();
  await inicializar();
  await prepararPDFDesdeLista();
});

function restaurarBorradorAporte() {
  if (new URLSearchParams(location.search).get('editarAporte') !== '1') return;
  let draft;
  try { draft = JSON.parse(sessionStorage.getItem('gen_song_submission_draft') || 'null'); } catch { draft = null; }
  if (!draft) return;
  document.getElementById('titulo').value = draft.titulo || '';
  document.getElementById('artista').value = draft.artista || '';
  document.getElementById('categoria').value = draft.categoria || '';
  document.getElementById('tonoPropuesto').value = draft.tono || '';
  document.getElementById('idiomaPropuesto').value = draft.idioma || 'Español';
  document.getElementById('letra').value = draft.letra || '';
  mostrarFormulario();
  history.replaceState(null, '', 'cancionero.html');
}

async function prepararPDFDesdeLista() {
  if (new URLSearchParams(location.search).get('crearPDF') !== 'lista') return;
  let draft;
  try { draft = JSON.parse(sessionStorage.getItem('songbook_pdf_playlist') || 'null'); } catch { draft = null; }
  sessionStorage.removeItem('songbook_pdf_playlist');
  if (!Array.isArray(draft?.ids) || !draft.ids.length) return;
  cancionesSeleccionadas = new Set(draft.ids.map(String));
  try {
    pdfDraftSongs = (await Promise.all(draft.ids.map((id) => DatabaseService.getCancionPorId(id)))).filter(Boolean);
    if (!pdfDraftSongs.length) throw new Error('Lista vacía');
    abrirConstructorPDF();
    document.getElementById('pdfDocumentTitle').value = draft.nombre || 'Cancionero Gen';
    document.getElementById('pdfFilename').value = limpiarNombreArchivo(draft.nombre || 'cancionero-gen');
    actualizarResumenPDF();
    history.replaceState(null, '', 'cancionero.html');
  } catch (error) {
    console.error('No se pudo preparar el PDF desde la lista:', error);
    mostrarToast('No pudimos abrir esa lista en el creador de PDF', 'error');
  }
}

async function inicializar() {
  try {
    const portada = await cargarJson(`${DATA_ROOT}/inicio.json`);
    canciones = Array.isArray(portada.destacados) ? portada.destacados : [];
    registrarCanciones(canciones);
    establecerArtistas(portada.artistas || [], false);
    vistaActual = 'destacados';
    aplicarFiltros();
  } catch (error) {
    console.warn('No se encontró el resumen del cancionero; se usa una consulta limitada.', error);
    try {
      canciones = await DatabaseService.getCancionesLimitadas(15);
      registrarCanciones(canciones);
      vistaActual = 'categoria';
      paginaActual = 1;
      aplicarFiltros();
      actualizarTopArtistas();
    } catch (fallbackError) {
      console.error('No se pudo cargar el cancionero:', fallbackError);
      mostrarEstadoCanciones('No pudimos cargar las canciones.');
    }
  }
}
async function cargarJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`No se pudo cargar ${url}`);
  return response.json();
}

async function cargarCancionesExtra() {
  if (cancionesExtra) return cancionesExtra;
  try {
    const data = await cargarJson(`${DATA_ROOT}/extras.json`);
    cancionesExtra = Array.isArray(data.canciones) ? data.canciones : [];
  } catch {
    cancionesExtra = [];
  }
  registrarCanciones(cancionesExtra);
  return cancionesExtra;
}

function registrarCanciones(lista) {
  lista.forEach((cancion) => cancionesConocidas.set(cancion.id, cancion));
}

function combinarCanciones(...listas) {
  const unicas = new Map();
  listas.flat().forEach((cancion) => {
    if (cancion?.id) unicas.set(String(cancion.id), cancion);
  });
  return [...unicas.values()];
}

function normalizarBusqueda(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

async function cargarPublicacionesRecientes(categoria) {
  const key = categoria || 'todas';
  if (!publicacionesRecientesCache.has(key)) {
    publicacionesRecientesCache.set(key, DatabaseService.getCancionesLimitadas(15, key).catch((error) => {
      publicacionesRecientesCache.delete(key);
      throw error;
    }));
  }
  return publicacionesRecientesCache.get(key);
}

async function cargarCategoria(categoria, reiniciar = true) {
  const pagina = reiniciar ? 1 : paginaActual + 1;
  mostrarEstadoCanciones('Cargando canciones...');
  try {
    const datos = await cargarJson(`${DATA_ROOT}/${categoria}/${pagina}.json`);
    const extras = reiniciar ? await cargarCancionesExtra() : [];
    const nuevasBase = Array.isArray(datos.canciones) ? datos.canciones : [];
    const publicadasOnline = reiniciar
      ? await cargarPublicacionesRecientes(categoria).catch((error) => {
          console.warn('No se pudieron sumar las publicaciones recientes:', error);
          return [];
        })
      : [];
    const nuevas = combinarCanciones(
      publicadasOnline,
      nuevasBase,
      extras.filter((song) => categoria === 'todas' || song.categoria === categoria)
    );
    canciones = reiniciar ? nuevas : [...canciones, ...nuevas];
    registrarCanciones(nuevas);
    categoriaActual = categoria;
    paginaActual = pagina;
    hayMasCanciones = Boolean(datos.hayMas);
    vistaActual = 'categoria';
    aplicarFiltros();
  } catch (error) {
    console.warn('La página estática no está disponible; se usa Firebase limitado.', error);
    if (!reiniciar) {
      hayMasCanciones = false;
      actualizarBotonCanciones();
      return;
    }
    try {
      canciones = await DatabaseService.getCancionesLimitadas(15, categoria);
      registrarCanciones(canciones);
      categoriaActual = categoria;
      paginaActual = 1;
      hayMasCanciones = false;
      vistaActual = 'categoria';
      aplicarFiltros();
    } catch (fallbackError) {
      console.error('No se pudo cargar la categoría:', fallbackError);
      mostrarEstadoCanciones('No pudimos cargar estas canciones.');
    }
  }
}

// Listeners UI
function inicializarEventListeners() {
  const searchInput = document.getElementById('searchInput');
  const categoriaBtns = document.querySelectorAll('.filter-pill[data-categoria]');
  const favoriteFilter = document.getElementById('favoriteFilter');
  const form = document.getElementById('formCancion');
  const overlay = document.getElementById('formOverlay');
  const contributionOverlay = document.getElementById('contributionOverlay');
  const artistsViewAll = document.getElementById('artistsViewAll');
  inicializarConstructorPDF();

  if (searchInput) searchInput.addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(ejecutarBusqueda, 250);
  });

  categoriaBtns.forEach((btn) => {
    btn.addEventListener('click', async function () {
      categoriaBtns.forEach((b) => b.classList.remove('active'));
      this.classList.add('active');
      if (searchInput) searchInput.value = '';
      categoriaActual = this.dataset.categoria;
      if (soloFavoritos) aplicarFiltros();
      else await cargarCategoria(categoriaActual, true);
    });
  });
  if (favoriteFilter) favoriteFilter.addEventListener('click', alternarFiltroFavoritos);

  if (form) form.addEventListener('submit', guardarCancion);
  if (artistsViewAll) artistsViewAll.addEventListener('click', () => window.mostrarTodosArtistas());

  // Confirmar cierre con Escape cuando el formulario está visible
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && contributionOverlay && !contributionOverlay.hidden) {
      ocultarMenuAportes();
      return;
    }
    if (e.key === 'Escape' && overlay && overlay.style.display === 'flex') {
      const confirmar = window.confirm('¿Cerrar el formulario? Se perderá lo escrito.');
      if (confirmar) ocultarFormulario();
    }
  });

  // Confirmar cierre al hacer click fuera (backdrop)
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        const confirmar = window.confirm('¿Cerrar el formulario? Se perderá lo escrito.');
        if (confirmar) ocultarFormulario();
      }
    });
  }
  contributionOverlay?.addEventListener('click', (event) => {
    if (event.target === contributionOverlay) ocultarMenuAportes();
  });
}

function aplicarFiltros() {
  const searchInput = document.getElementById('searchInput');
  const busqueda = normalizarBusqueda(searchInput?.value);
  const origen = soloFavoritos ? cancionesFavoritas : canciones;
  cancionesFiltradas = origen.filter((cancion) => {
    const coincideCategoria = categoriaActual === 'todas' || cancion.categoria === categoriaActual;
    const texto = normalizarBusqueda(`${cancion.titulo || ''} ${cancion.artista || ''}`);
    return coincideCategoria && (!busqueda || texto.includes(busqueda));
  });

  const titulo = document.getElementById('sectionTitle');
  if (titulo) {
    if (soloFavoritos) {
      const categoria = categoriaActual === 'todas' ? '' : ` · ${getCategoriaTexto(categoriaActual)}`;
      titulo.textContent = `Mis favoritos${categoria} (${cancionesFiltradas.length})`;
    } else {
      titulo.textContent = vistaActual === 'destacados'
        ? 'Canciones destacadas'
        : `${getCategoriaTexto(categoriaActual === 'todas' ? 'todas' : categoriaActual)} (${cancionesFiltradas.length})`;
    }
  }

  renderizarCanciones();
  actualizarBotonCanciones();
}

async function ejecutarBusqueda() {
  const searchInput = document.getElementById('searchInput');
  const busqueda = normalizarBusqueda(searchInput?.value);
  if (soloFavoritos) {
    vistaActual = 'favoritos';
    aplicarFiltros();
    return;
  }
  if (!busqueda) {
    vistaActual = paginaActual > 0 ? 'categoria' : 'destacados';
    aplicarFiltros();
    return;
  }

  try {
    if (!indiceBusqueda) {
      const datos = await cargarJson(`${DATA_ROOT}/buscar.json`);
      const extras = await cargarCancionesExtra();
      indiceBusqueda = combinarCanciones(datos.canciones || [], extras);
      registrarCanciones(indiceBusqueda);
    }
    const categoria = document.querySelector('.filter-pill[data-categoria].active')?.dataset.categoria || 'todas';
    const publicadasOnline = await cargarPublicacionesRecientes(categoria).catch((error) => {
      console.warn('No se pudieron consultar las publicaciones recientes:', error);
      return [];
    });
    registrarCanciones(publicadasOnline);
    const indiceCompleto = combinarCanciones(publicadasOnline, indiceBusqueda);
    cancionesFiltradas = indiceCompleto.filter((cancion) => {
      const texto = normalizarBusqueda(`${cancion.titulo || ''} ${cancion.artista || ''}`);
      return texto.includes(busqueda) && (categoria === 'todas' || cancion.categoria === categoria);
    });
    vistaActual = 'busqueda';
    document.getElementById('sectionTitle').textContent = `Resultados (${cancionesFiltradas.length})`;
    renderizarCanciones();
    actualizarBotonCanciones();
  } catch (error) {
    console.error('No se pudo cargar el índice de búsqueda:', error);
    mostrarToast('No se pudo realizar la búsqueda', 'error');
  }
}

function actualizarBotonCanciones() {
  const button = document.querySelector('.top-canciones .view-all-link');
  if (!button) return;
  button.hidden = soloFavoritos || vistaActual === 'busqueda' || (vistaActual === 'categoria' && !hayMasCanciones);
  if (vistaActual === 'destacados') button.innerHTML = 'Ver todas <span>›</span>';
  else if (hayMasCanciones) button.innerHTML = 'Ver 15 más <span>›</span>';
}

function mostrarEstadoCanciones(mensaje) {
  const container = document.getElementById('cancionesGrid');
  if (container) container.innerHTML = `<div class="loading-state"><span class="loading-disc">♪</span><p>${escaparHTML(mensaje)}</p></div>`;
}

// Renderizar canciones (Top 5 / todas)
function renderizarCanciones() {
  const container = document.getElementById('cancionesGrid');
  if (!container) return;
  container.innerHTML = '';

  if (cancionesFiltradas.length === 0) {
    container.innerHTML = `
      <div class="loading-state">
        <div class="loading-icon"><svg aria-hidden="true"><use href="../aadocumentos/svg/iconos-gen.svg?v=20260730-7#${soloFavoritos ? 'experiencia' : 'sin-resultados'}"></use></svg></div>
        <p>${soloFavoritos ? 'No tienes favoritos para este filtro' : 'No se encontraron canciones'}</p>
      </div>
    `;
    return;
  }

  cancionesFiltradas.forEach((cancion, index) => {
    const card = crearCancionCard(cancion, index + 1);
    container.appendChild(card);
  });
  void actualizarFavoritosVisibles();
}

// Crear card con checkbox mejor posicionado
function crearCancionCard(cancion, ranking) {
  const card = document.createElement('div');
  card.className = 'cancion-card';
  if (cancionesSeleccionadas.has(cancion.id)) card.classList.add('selected');

  const titulo = escaparHTML(cancion.titulo || 'Sin título');
  const artista = escaparHTML(cancion.artista || 'Desconocido');
  const id = escaparAtributo(cancion.id || '');
  const categoria = ['misa', 'gen', 'fogon'].includes(cancion.categoria) ? cancion.categoria : 'gen';
  const variante = hashTexto(`${cancion.titulo || ''}${cancion.artista || ''}`) % 6;
  const tono = escaparHTML(cancion.tono || cancion.tonalidad || '');

  card.innerHTML = `
    <div class="selection-checkbox ${window.modoSeleccion ? 'visible' : ''}">
      <input type="checkbox" class="song-checkbox" data-id="${id}" ${cancionesSeleccionadas.has(cancion.id) ? 'checked' : ''} aria-label="Seleccionar ${titulo}">
    </div>
    <div class="cancion-content">
      <div class="song-thumb" data-variant="${variante}">${getMiniaturaIcon(categoria)}</div>
      <div class="song-info">
        <div class="song-title-row">
          <span class="ranking-badge">#${ranking}</span>
          <h3 class="cancion-titulo">${titulo}</h3>
          <button type="button" class="artista-link" data-artist="${escaparAtributo(cancion.artista || 'Desconocido')}">${artista}</button>
        </div>
        <div class="song-card-footer">
          <span class="cancion-categoria" data-categoria="${categoria}">${getCategoriaTexto(categoria)}</span>
          ${tono ? `<span class="song-key">${tono}</span>` : ''}
          <button type="button" class="favorite-button" data-song-id="${id}" aria-pressed="false" aria-label="Agregar ${titulo} a favoritos" title="Agregar a favoritos">
            <svg class="favorite-icon" aria-hidden="true"><use href="#i-heart"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  const songContent = card.querySelector('.cancion-content');
  songContent?.setAttribute('role', 'link');
  songContent?.setAttribute('tabindex', '0');
  songContent?.setAttribute('aria-label', `Abrir ${cancion.titulo || 'canción'} de ${cancion.artista || 'artista desconocido'}`);
  const activarCancion = () => {
    if (window.modoSeleccion) toggleSelection(cancion.id);
    else abrirCancion(cancion.id);
  };
  songContent?.addEventListener('click', activarCancion);
  songContent?.addEventListener('keydown', (event) => {
    if (event.target !== songContent) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    activarCancion();
  });
  card.querySelector('.artista-link')?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (window.modoSeleccion) toggleSelection(cancion.id);
    else abrirArtista(cancion.artista || 'Desconocido');
  });
  card.querySelector('.song-checkbox')?.addEventListener('change', (event) => {
    event.stopPropagation();
    toggleSelection(cancion.id);
  });
  card.querySelector('.favorite-button')?.addEventListener('click', (event) => {
    event.stopPropagation();
    void alternarFavorito(cancion, event.currentTarget);
  });

  return card;
}

function inicializarFavoritos() {
  const utils = window.firebaseUtils;
  const auth = window.firebaseAuth;
  if (!utils?.onAuthStateChanged || !auth) {
    window.addEventListener('gen:auth-changed', (event) => cambiarUsuarioFavoritos(event.detail?.user || null));
    return;
  }
  utils.onAuthStateChanged(auth, cambiarUsuarioFavoritos);
}

async function cambiarUsuarioFavoritos(user) {
  const cargaActual = ++versionCargaFavoritos;
  usuarioFavoritos = user || null;
  const toolFavorites = document.getElementById('toolFavorites');
  const favoriteFilter = document.getElementById('favoriteFilter');
  if (toolFavorites) toolFavorites.hidden = !usuarioFavoritos;
  if (favoriteFilter) favoriteFilter.hidden = !usuarioFavoritos;
  favoritosIds.clear();
  favoritosConsultados.clear();
  favoritosPerfilCargados = false;
  cancionesFavoritas = [];
  document.querySelectorAll('.favorite-button').forEach((button) => {
    actualizarBotonFavorito(button, false);
    if (usuarioFavoritos) button.setAttribute('aria-busy', 'true');
  });
  if (usuarioFavoritos) {
    try {
      const favoritas = await DatabaseService.getFavoritosUsuario(usuarioFavoritos.uid);
      if (cargaActual !== versionCargaFavoritos || usuarioFavoritos?.uid !== user.uid) return;
      cancionesFavoritas = favoritas;
      favoritas.forEach((cancion) => {
        const id = String(cancion.id || '');
        if (!id) return;
        favoritosIds.add(id);
        favoritosConsultados.add(id);
      });
      favoritosPerfilCargados = true;
      document.querySelectorAll('.favorite-button').forEach((button) => {
        actualizarBotonFavorito(button, favoritosIds.has(String(button.dataset.songId || '')));
        button.removeAttribute('aria-busy');
      });
    } catch (error) {
      console.warn('No se pudo precargar la colección de favoritos:', error);
      document.querySelectorAll('.favorite-button').forEach((button) => button.removeAttribute('aria-busy'));
    }
    void actualizarFavoritosVisibles();
  } else if (soloFavoritos) {
    soloFavoritos = false;
    cancionesFavoritas = [];
    actualizarEstadoFiltroFavoritos();
    void cargarCategoria(categoriaActual, true);
  }
}

function actualizarEstadoFiltroFavoritos() {
  const button = document.getElementById('favoriteFilter');
  if (!button) return;
  button.classList.toggle('active', soloFavoritos);
  button.setAttribute('aria-pressed', String(soloFavoritos));
}

async function alternarFiltroFavoritos() {
  const button = document.getElementById('favoriteFilter');
  const user = usuarioFavoritos || window.firebaseAuth?.currentUser;
  if (!user) {
    if (typeof window.genOpenAuthModal === 'function') window.genOpenAuthModal();
    return;
  }
  if (button?.getAttribute('aria-busy') === 'true') return;
  if (soloFavoritos) {
    soloFavoritos = false;
    vistaActual = 'categoria';
    actualizarEstadoFiltroFavoritos();
    await cargarCategoria(categoriaActual, true);
    return;
  }
  button?.setAttribute('aria-busy', 'true');
  mostrarEstadoCanciones('Cargando tus favoritos...');
  try {
    cancionesFavoritas = favoritosPerfilCargados
      ? cancionesFavoritas
      : await DatabaseService.getFavoritosUsuario(user.uid);
    if (window.firebaseAuth?.currentUser?.uid !== user.uid) return;
    registrarCanciones(cancionesFavoritas);
    cancionesFavoritas.forEach((cancion) => {
      const id = String(cancion.id);
      favoritosIds.add(id);
      favoritosConsultados.add(id);
    });
    favoritosPerfilCargados = true;
    soloFavoritos = true;
    vistaActual = 'favoritos';
    actualizarEstadoFiltroFavoritos();
    aplicarFiltros();
  } catch (error) {
    console.error('No se pudo activar el filtro de favoritos:', error);
    mostrarToast('No pudimos cargar tus favoritos', 'error');
    aplicarFiltros();
  } finally {
    button?.removeAttribute('aria-busy');
  }
}

window.abrirMisFavoritos = function abrirMisFavoritos() {
  const user = usuarioFavoritos || window.firebaseAuth?.currentUser;
  if (!user) {
    if (typeof window.genOpenAuthModal === 'function') window.genOpenAuthModal();
    else document.getElementById('auth-btn')?.click();
    return;
  }
  window.location.href = 'playlist.html#favoritos';
};

window.abrirMisPlaylists = function abrirMisPlaylists() {
  window.location.href = 'playlist.html';
};

async function actualizarFavoritosVisibles() {
  const user = usuarioFavoritos || window.firebaseAuth?.currentUser;
  const buttons = [...document.querySelectorAll('.favorite-button')];
  if (!user) {
    buttons.forEach((button) => actualizarBotonFavorito(button, false));
    return;
  }
  usuarioFavoritos = user;
  // Las tarjetas del filtro se vuelven a crear; reutilizamos el estado ya
  // consultado antes de decidir qué canciones necesitan una nueva lectura.
  buttons.forEach((button) => {
    const id = String(button.dataset.songId || '');
    if (favoritosConsultados.has(id)) actualizarBotonFavorito(button, favoritosIds.has(id));
  });
  if (favoritosPerfilCargados) {
    buttons.forEach((button) => actualizarBotonFavorito(button, favoritosIds.has(String(button.dataset.songId || ''))));
    return;
  }
  const pending = buttons.filter((button) => !favoritosConsultados.has(String(button.dataset.songId || '')));
  await Promise.all(pending.map(async (button) => {
    const id = button.dataset.songId;
    button.setAttribute('aria-busy', 'true');
    try {
      const active = await DatabaseService.getEstadoFavorito(id, user.uid);
      if (window.firebaseAuth?.currentUser?.uid !== user.uid) return;
      favoritosConsultados.add(id);
      if (active) favoritosIds.add(id);
      else favoritosIds.delete(id);
      actualizarBotonesFavorito(id);
    } catch (error) {
      console.error(`No se pudo consultar el favorito ${id}:`, error);
    } finally {
      button.removeAttribute('aria-busy');
    }
  }));
}

function actualizarBotonFavorito(button, active) {
  const title = button.closest('.cancion-card')?.querySelector('.cancion-titulo')?.textContent || 'esta canción';
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? `Quitar ${title} de favoritos` : `Agregar ${title} a favoritos`);
  button.title = active ? 'Quitar de favoritos' : 'Agregar a favoritos';
}

function actualizarBotonesFavorito(songId) {
  document.querySelectorAll('.favorite-button').forEach((button) => {
    if (button.dataset.songId === String(songId)) actualizarBotonFavorito(button, favoritosIds.has(String(songId)));
  });
}

async function alternarFavorito(cancion, button) {
  const user = usuarioFavoritos || window.firebaseAuth?.currentUser;
  if (!user) {
    if (typeof window.genOpenAuthModal === 'function') window.genOpenAuthModal();
    else document.getElementById('auth-btn')?.click();
    mostrarToast('Iniciá sesión para agregar canciones a favoritos', 'error');
    return;
  }
  const id = String(cancion.id);
  if (button.disabled) return;
  button.disabled = true;
  try {
    if (!favoritosConsultados.has(id)) {
      const active = await DatabaseService.getEstadoFavorito(id, user.uid);
      favoritosConsultados.add(id);
      if (active) favoritosIds.add(id);
    }
    const active = !favoritosIds.has(id);
    await DatabaseService.setFavoritoCancion(id, user.uid, active);
    if (active) favoritosIds.add(id);
    else favoritosIds.delete(id);
    favoritosConsultados.add(id);
    if (active && !cancionesFavoritas.some((favorita) => String(favorita.id) === id)) cancionesFavoritas.unshift(cancion);
    if (!active) cancionesFavoritas = cancionesFavoritas.filter((favorita) => String(favorita.id) !== id);
    actualizarBotonesFavorito(id);
    mostrarToast(active ? 'Agregada a favoritos' : 'Quitada de favoritos', 'success');
    if (soloFavoritos && !active) {
      cancionesFavoritas = cancionesFavoritas.filter((favorita) => String(favorita.id) !== id);
      aplicarFiltros();
    }
    window.dispatchEvent(new CustomEvent('gen:favorite-changed', { detail: { songId: id, active } }));
  } catch (error) {
    console.error('No se pudo actualizar el favorito:', error);
    mostrarToast('No pudimos actualizar tus favoritos', 'error');
  } finally {
    button.disabled = false;
  }
}

// Top artistas
function actualizarTopArtistas() {
  const artistasMap = new Map();
  canciones.forEach((cancion) => {
    const artista = cancion.artista || 'Desconocido';
    const datos = artistasMap.get(artista) || { canciones: 0, likes: 0 };
    datos.canciones += 1;
    datos.likes += Number(cancion.likesCount || 0);
    artistasMap.set(artista, datos);
  });

  artistasOrdenados = Array.from(artistasMap.entries()).sort((a, b) =>
    b[1].likes - a[1].likes || b[1].canciones - a[1].canciones || a[0].localeCompare(b[0], 'es')
  );
  renderizarArtistas();
}

function establecerArtistas(artistas, completos) {
  artistasOrdenados = artistas.map((artista) => [
    artista.nombre || artista.artista || 'Desconocido',
    {
      canciones: Number(artista.cancionesCount || artista.canciones || 0),
      likes: Number(artista.likesCount || artista.likes || 0)
    }
  ]);
  artistasCompletosCargados = completos;
  renderizarArtistas();
}

function renderizarArtistas() {
  const container = document.getElementById('artistasList');
  if (!container) return;

  if (artistasOrdenados.length === 0) {
    container.innerHTML = '<div class="loading-text">No hay artistas aún</div>';
    return;
  }

  container.innerHTML = '';
  const artistasAMostrar = mostrandoTodosArtistas ? artistasOrdenados : artistasOrdenados.slice(0, 5);
  artistasAMostrar.forEach(([artista, datos]) => {
    const item = document.createElement('div');
    item.className = 'artista-item';
    item.tabIndex = 0;
    item.setAttribute('role', 'link');
    item.innerHTML = `
      <div class="artista-avatar" aria-hidden="true">${obtenerIniciales(artista)}</div>
      <div class="artista-nombre">${escaparHTML(artista)}</div>
      <div class="artista-count">${datos.canciones} canciones</div>
    `;
    item.addEventListener('click', () => abrirArtista(artista));
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') abrirArtista(artista);
    });
    container.appendChild(item);
  });

  if (!mostrandoTodosArtistas && artistasOrdenados.length > 5) {
    const more = document.createElement('div');
    more.className = 'artista-item more-artists';
    more.tabIndex = 0;
    more.setAttribute('role', 'button');
    more.innerHTML = '<div class="artista-avatar" aria-hidden="true">•••</div><div class="artista-nombre">Ver más</div>';
    more.addEventListener('click', () => window.mostrarTodosArtistas());
    more.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') window.mostrarTodosArtistas();
    });
    container.appendChild(more);
  }
}

window.mostrarTodosArtistas = async function () {
  if (!mostrandoTodosArtistas && !artistasCompletosCargados) {
    try {
      const data = await cargarJson(`${DATA_ROOT}/artistas.json`);
      establecerArtistas(data.artistas || [], true);
    } catch (error) {
      console.error('No se pudo cargar la lista de artistas:', error);
      mostrarToast('No se pudieron cargar todos los artistas', 'error');
      return;
    }
  }
  mostrandoTodosArtistas = !mostrandoTodosArtistas;
  const button = document.getElementById('artistsViewAll');
  if (button) button.innerHTML = mostrandoTodosArtistas ? 'Mostrar destacados <span>‹</span>' : 'Ver todos <span>›</span>';
  renderizarArtistas();
};

// Modo selección PDF
window.activarModoSeleccion = function () {
  window.modoSeleccion = true;
  document.body.classList.add('selection-mode');
  document.getElementById('pdfControls').hidden = false;
  document.getElementById('btnActivarPDF').style.display = 'none';
  renderizarCanciones();
  mostrarToast('✅ Modo selección activado. Elige las canciones para tu PDF', 'success');
};

window.cancelarSeleccion = function () {
  window.modoSeleccion = false;
  document.body.classList.remove('selection-mode');
  cancionesSeleccionadas.clear();
  document.getElementById('selectionCount').textContent = 0; // Reiniciar el contador visual a 0
  document.getElementById('pdfControls').hidden = true;
  document.getElementById('btnActivarPDF').style.display = 'flex';
  renderizarCanciones();
};

window.toggleSelection = function (cancionId) {
  const checkbox = document.querySelector(`input[data-id="${cancionId}"]`);
  const card = checkbox?.closest('.cancion-card');

  // Determinar el nuevo estado de selección
  const isCurrentlySelected = cancionesSeleccionadas.has(cancionId);
  if (isCurrentlySelected) {
    cancionesSeleccionadas.delete(cancionId);
    card?.classList.remove('selected');
    if (checkbox) checkbox.checked = false; // Actualizar el estado visual del checkbox
  } else {
    cancionesSeleccionadas.add(cancionId);
    card?.classList.add('selected');
    if (checkbox) checkbox.checked = true; // Actualizar el estado visual del checkbox
  }
  document.getElementById('selectionCount').textContent = cancionesSeleccionadas.size;
};

function inicializarConstructorPDF() {
  const modal = document.getElementById('pdfBuilderModal');
  if (!modal || modal.dataset.ready === 'true') return;
  modal.dataset.ready = 'true';
  document.getElementById('pdfBuilderClose')?.addEventListener('click', cerrarConstructorPDF);
  document.getElementById('pdfBuilderCancel')?.addEventListener('click', cerrarConstructorPDF);
  document.getElementById('pdfBuilderBackdrop')?.addEventListener('click', cerrarConstructorPDF);
  document.getElementById('pdfBuilderGenerate')?.addEventListener('click', generarPDFConfigurado);
  document.getElementById('pdfAddSongButton')?.addEventListener('click', abrirSelectorCancionesPDF);
  document.getElementById('pdfSongPickerClose')?.addEventListener('click', cerrarSelectorCancionesPDF);
  document.getElementById('pdfSongPickerSearch')?.addEventListener('input', () => {
    clearTimeout(pdfPickerSearchTimer);
    pdfPickerSearchTimer = setTimeout(renderizarSelectorCancionesPDF, 120);
  });
  document.querySelectorAll('#pdfSongPickerFilters button').forEach((button) => {
    button.addEventListener('click', () => {
      pdfPickerCategory = button.dataset.category;
      document.querySelectorAll('#pdfSongPickerFilters button').forEach((item) => item.classList.toggle('active', item === button));
      renderizarSelectorCancionesPDF();
    });
  });
  modal.querySelectorAll('input').forEach((input) => input.addEventListener('change', () => { actualizarResumenPDF(); guardarPreferenciasPDF(); }));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      if (!document.getElementById('pdfSongPicker')?.hidden) cerrarSelectorCancionesPDF();
      else cerrarConstructorPDF();
    }
  });
}

function guardarPreferenciasPDF() {
  const mode = document.querySelector('input[name="pdfContentMode"]:checked')?.value || 'chords';
  localStorage.setItem('songbook_pdf_preferences', JSON.stringify({
    mode,
    cover: Boolean(document.getElementById('pdfIncludeCover')?.checked),
    index: Boolean(document.getElementById('pdfIncludeIndex')?.checked),
    newPage: Boolean(document.getElementById('pdfSongNewPage')?.checked)
  }));
}

function cargarPreferenciasPDF() {
  try {
    const saved = JSON.parse(localStorage.getItem('songbook_pdf_preferences') || '{}');
    document.querySelector(`input[name="pdfContentMode"][value="${saved.mode === 'lyrics' ? 'lyrics' : 'chords'}"]`)?.click();
    if (typeof saved.cover === 'boolean') document.getElementById('pdfIncludeCover').checked = saved.cover;
    if (typeof saved.index === 'boolean') document.getElementById('pdfIncludeIndex').checked = saved.index;
    if (typeof saved.newPage === 'boolean') document.getElementById('pdfSongNewPage').checked = saved.newPage;
  } catch { /* Se usan los valores recomendados. */ }
}

window.generarPDF = async function () {
  if (cancionesSeleccionadas.size === 0) {
    mostrarToast('Selecciona al menos una canción', 'error');
    return;
  }
  try {
    mostrarToast('Preparando las canciones seleccionadas...', 'success');
    pdfDraftSongs = (await Promise.all(
      Array.from(cancionesSeleccionadas).map((id) => DatabaseService.getCancionPorId(id))
    )).filter(Boolean);
    if (pdfDraftSongs.length === 0) throw new Error('No se encontraron las canciones seleccionadas');
    abrirConstructorPDF();
  } catch (error) {
    console.error('Error preparando el PDF:', error);
    mostrarToast('No pudimos preparar el cancionero', 'error');
  }
};

function abrirConstructorPDF() {
  const modal = document.getElementById('pdfBuilderModal');
  const backdrop = document.getElementById('pdfBuilderBackdrop');
  pdfLastFocus = document.activeElement;
  cargarPreferenciasPDF();
  document.getElementById('pdfFilename').value = `cancionero-gen-${new Date().toISOString().slice(0, 10)}`;
  renderizarOrdenPDF();
  actualizarResumenPDF();
  backdrop.hidden = false;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  document.getElementById('pdfDocumentTitle')?.focus();
}

function cerrarConstructorPDF() {
  cerrarSelectorCancionesPDF();
  document.getElementById('pdfBuilderModal').hidden = true;
  document.getElementById('pdfBuilderBackdrop').hidden = true;
  document.body.style.overflow = '';
  pdfLastFocus?.focus?.();
}

async function abrirSelectorCancionesPDF() {
  const picker = document.getElementById('pdfSongPicker');
  const button = document.getElementById('pdfAddSongButton');
  picker.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  document.getElementById('pdfSongPickerResults').innerHTML = '<div class="pdf-picker-state">Cargando canciones...</div>';
  try {
    if (!indiceBusqueda) {
      const datos = await cargarJson(`${DATA_ROOT}/buscar.json`);
      const extras = await cargarCancionesExtra();
      const base = Array.isArray(datos.canciones) ? datos.canciones : [];
      indiceBusqueda = [...base, ...extras.filter((song) =>
        !base.some((item) => String(item.id) === String(song.id))
      )];
      registrarCanciones(indiceBusqueda);
    }
    renderizarSelectorCancionesPDF();
    document.getElementById('pdfSongPickerSearch')?.focus();
  } catch (error) {
    console.error('No se pudo abrir el selector de canciones:', error);
    document.getElementById('pdfSongPickerResults').innerHTML = '<div class="pdf-picker-state">No pudimos cargar las canciones.</div>';
  }
}

function cerrarSelectorCancionesPDF() {
  const picker = document.getElementById('pdfSongPicker');
  if (!picker) return;
  picker.hidden = true;
  document.getElementById('pdfAddSongButton')?.setAttribute('aria-expanded', 'false');
}

function renderizarSelectorCancionesPDF() {
  const container = document.getElementById('pdfSongPickerResults');
  if (!container || !indiceBusqueda) return;
  const query = normalizarBusqueda(document.getElementById('pdfSongPickerSearch')?.value);
  const selectedIds = new Set(pdfDraftSongs.map((song) => String(song.id)));
  const results = indiceBusqueda.filter((song) => {
    const matchesCategory = pdfPickerCategory === 'todas' || song.categoria === pdfPickerCategory;
    const searchable = normalizarBusqueda(`${song.titulo || ''} ${song.artista || ''}`);
    return matchesCategory && (!query || searchable.includes(query));
  }).slice(0, 30);

  if (!results.length) {
    container.innerHTML = '<div class="pdf-picker-state">No encontramos canciones con esos filtros.</div>';
    return;
  }
  container.innerHTML = '';
  results.forEach((song) => {
    const isSelected = selectedIds.has(String(song.id));
    const row = document.createElement('article');
    row.className = 'pdf-picker-result';
    row.innerHTML = `
      <span class="pdf-picker-result-copy">
        <strong>${escaparHTML(song.titulo || 'Sin título')}</strong>
        <small>${escaparHTML(song.artista || 'Desconocido')} · ${escaparHTML(getCategoriaTexto(song.categoria))}</small>
      </span>
      <button type="button" ${isSelected ? 'disabled' : ''}>${isSelected ? 'Agregada' : 'Agregar'}</button>
    `;
    row.querySelector('button').addEventListener('click', () => agregarCancionAlPDF(song, row));
    container.appendChild(row);
  });
}

async function agregarCancionAlPDF(songSummary, row) {
  const button = row.querySelector('button');
  if (pdfDraftSongs.some((song) => String(song.id) === String(songSummary.id))) return;
  button.disabled = true;
  button.textContent = 'Agregando...';
  try {
    const knownSong = cancionesConocidas.get(songSummary.id);
    const fullSong = knownSong?.letra ? knownSong : await DatabaseService.getCancionPorId(songSummary.id);
    if (!fullSong) throw new Error('Canción no encontrada');
    pdfDraftSongs.push(fullSong);
    cancionesSeleccionadas.add(String(fullSong.id));
    renderizarOrdenPDF();
    actualizarResumenPDF();
    renderizarSelectorCancionesPDF();
  } catch (error) {
    console.error('No se pudo agregar la canción al PDF:', error);
    button.disabled = false;
    button.textContent = 'Reintentar';
    mostrarToast('No pudimos agregar esa canción', 'error');
  }
}

function renderizarOrdenPDF() {
  const container = document.getElementById('pdfSongOrder');
  document.getElementById('pdfSongCount').textContent = `${pdfDraftSongs.length} ${pdfDraftSongs.length === 1 ? 'canción' : 'canciones'}`;
  container.innerHTML = '';
  pdfDraftSongs.forEach((song, index) => {
    const item = document.createElement('div');
    item.className = 'pdf-order-item';
    item.draggable = true;
    item.dataset.songId = song.id;
    item.innerHTML = `
      <span class="pdf-drag-handle" aria-hidden="true">••</span>
      <span class="pdf-order-number">${index + 1}</span>
      <span class="pdf-order-copy"><strong>${escaparHTML(song.titulo || 'Sin título')}</strong><small>${escaparHTML(song.artista || 'Desconocido')}</small></span>
      <span class="pdf-order-actions">
        <button type="button" data-action="up" aria-label="Subir ${escaparAtributo(song.titulo || 'canción')}" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" data-action="down" aria-label="Bajar ${escaparAtributo(song.titulo || 'canción')}" ${index === pdfDraftSongs.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="pdf-remove-song" data-action="remove" aria-label="Quitar ${escaparAtributo(song.titulo || 'canción')}">×</button>
      </span>
    `;
    item.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'remove') pdfDraftSongs.splice(index, 1);
      else {
        const target = action === 'up' ? index - 1 : index + 1;
        [pdfDraftSongs[index], pdfDraftSongs[target]] = [pdfDraftSongs[target], pdfDraftSongs[index]];
      }
      renderizarOrdenPDF();
      actualizarResumenPDF();
      renderizarSelectorCancionesPDF();
    }));
    item.addEventListener('dragstart', (event) => {
      item.classList.add('dragging');
      event.dataTransfer.setData('text/plain', String(index));
      event.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
    item.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });
    item.addEventListener('drop', (event) => {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData('text/plain'));
      if (!Number.isInteger(from) || from === index) return;
      const [moved] = pdfDraftSongs.splice(from, 1);
      pdfDraftSongs.splice(index, 0, moved);
      renderizarOrdenPDF();
    });
    container.appendChild(item);
  });
}

function actualizarResumenPDF() {
  const mode = document.querySelector('input[name="pdfContentMode"]:checked')?.value;
  const parts = [
    `${pdfDraftSongs.length} ${pdfDraftSongs.length === 1 ? 'canción' : 'canciones'}`,
    mode === 'lyrics' ? 'solo letra' : 'letra y acordes'
  ];
  if (document.getElementById('pdfIncludeCover')?.checked) parts.push('portada');
  if (document.getElementById('pdfIncludeIndex')?.checked) parts.push('índice');
  document.getElementById('pdfSummary').textContent =
    `${parts.join(' · ')}. Los versos y estribillos no se cortarán mientras entren completos en una página.`;
  document.getElementById('pdfBuilderGenerate').disabled = pdfDraftSongs.length === 0;
}

function limpiarNombreArchivo(value) {
  return String(value || 'cancionero-gen')
    .replace(/\.pdf$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'cancionero-gen';
}

function quitarAcordes(text) {
  return parseSongContent(text).blocks
    .filter(block => block.type !== 'tab')
    .map(block => block.type === 'blank' ? '' : block.text || '')
    .join('\n');
}

function limitesDeSegmentos(text, maxChars) {
  const ranges = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const space = text.lastIndexOf(' ', end);
      if (space > start + Math.floor(maxChars * .55)) end = space + 1;
    }
    ranges.push([start, end]);
    start = end;
  }
  return ranges.length ? ranges : [[0, 0]];
}

function prepararUnidadPDF(sourceLine, includeChords, maxChars) {
  const source = String(sourceLine || '').replace(/\t/g, '    ');
  if (!includeChords) {
    const lyric = quitarAcordes(source);
    return limitesDeSegmentos(lyric, maxChars).map(([start, end]) => [
      { text: lyric.slice(start, end).trimEnd(), chord: false }
    ]);
  }
  let lyric = '';
  let chordRow = '';
  let cursor = 0;
  let match;
  const chordPattern = /\[([^\]\r\n]+)\]/g;
  while ((match = chordPattern.exec(source))) {
    lyric += source.slice(cursor, match.index);
    const position = lyric.length;
    if (chordRow.length < position) chordRow = chordRow.padEnd(position, ' ');
    if (chordRow.length > position && chordRow.slice(position).trim()) chordRow += ' ';
    chordRow = chordRow.padEnd(position, ' ') + match[1];
    cursor = match.index + match[0].length;
  }
  lyric += source.slice(cursor);
  if (!chordRow) {
    return limitesDeSegmentos(lyric, maxChars).map(([start, end]) => [
      { text: lyric.slice(start, end).trimEnd(), chord: false }
    ]);
  }
  const guide = lyric.length ? lyric : chordRow;
  return limitesDeSegmentos(guide, maxChars).map(([start, end]) => {
    const chord = chordRow.slice(start, end).trimEnd();
    const text = lyric.slice(start, end).trimEnd();
    return [
      ...(chord.trim() ? [{ text: chord, chord: true }] : []),
      ...(text || !chord.trim() ? [{ text, chord: false }] : [])
    ];
  });
}

function prepararBloquesPDF(text, includeChords, maxChars) {
  const parsed = parseSongContent(text);
  const blocks = [];
  let current = [];
  const flush = () => {
    if (current.length) blocks.push(current);
    current = [];
  };
  parsed.blocks.forEach(block => {
    if (block.type === 'blank') return flush();
    if (block.type === 'tab') {
      flush();
      if (!includeChords) return;
      const innerColumns = Math.max(18, maxChars - 3);
      const width = Math.max(block.width, 1);
      for (let start = 0; start < width; start += innerColumns) {
        const size = Math.min(innerColumns, width - start);
        const unit = [];
        if (block.header) {
          const heading = `  ${block.header.padEnd(width + 2).slice(start + 2, start + 2 + size)}`.trimEnd();
          if (heading.trim()) unit.push({ text: heading, chord: true });
        }
        block.strings.forEach(string => {
          const content = string.content.padEnd(width, '-').slice(start, start + size).padEnd(size, '-');
          unit.push({ text: `${string.name}|${content}|`, chord: false });
        });
        blocks.push([unit]);
      }
      return;
    }
    if (!includeChords || !block.chords?.length) {
      limitesDeSegmentos(block.text || '', maxChars).forEach(([start, end]) => {
        current.push([{ text: (block.text || '').slice(start, end).trimEnd(), chord: false }]);
      });
      return;
    }
    let chordRow = '';
    block.chords.forEach(chord => {
      if (chordRow.length < chord.position) chordRow = chordRow.padEnd(chord.position, ' ');
      chordRow = `${chordRow.slice(0, chord.position)}${chord.raw}${chordRow.slice(chord.position + chord.raw.length)}`;
    });
    const guide = (block.text || '').length ? block.text : chordRow;
    limitesDeSegmentos(guide, maxChars).forEach(([start, end]) => {
      const chord = chordRow.slice(start, end).trimEnd();
      const lyric = (block.text || '').slice(start, end).trimEnd();
      current.push([
        ...(chord.trim() ? [{ text: chord, chord: true }] : []),
        ...(lyric || !chord.trim() ? [{ text: lyric, chord: false }] : [])
      ]);
    });
  });
  flush();
  return blocks;
}

function dibujarPortadaPDF(pdf, title, subtitle) {
  const width = pdf.internal.pageSize.width;
  const height = pdf.internal.pageSize.height;
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, width, height, 'F');
  pdf.setDrawColor(116, 73, 170);
  pdf.setLineWidth(.8);
  pdf.line(28, 58, width - 28, 58);
  pdf.setTextColor(105, 58, 157);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('GEN 2', width / 2, 48, { align: 'center' });
  pdf.setTextColor(32, 27, 38);
  pdf.setFontSize(31);
  const titleLines = pdf.splitTextToSize(title || 'Cancionero Gen', width - 50);
  pdf.text(titleLines, width / 2, 105, { align: 'center' });
  if (subtitle) {
    pdf.setTextColor(91, 83, 99);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(14);
    pdf.text(pdf.splitTextToSize(subtitle, width - 62), width / 2, 138, { align: 'center' });
  }
  pdf.setTextColor(112, 105, 118);
  pdf.setFontSize(10);
  pdf.text(new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(new Date()), width / 2, height - 32, { align: 'center' });
}

function dibujarEncabezadoCancion(pdf, song, margin, y) {
  pdf.setTextColor(34, 24, 48);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  const titleLines = pdf.splitTextToSize(String(song.titulo || 'Sin título').toUpperCase(), pdf.internal.pageSize.width - margin * 2);
  pdf.text(titleLines, margin, y);
  y += titleLines.length * 7 + 3;
  pdf.setTextColor(104, 93, 116);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(`${song.artista || 'Desconocido'} - ${getCategoriaTexto(song.categoria)}`, margin, y);
  return y + 11;
}

async function generarPDFConfigurado() {
  if (!pdfDraftSongs.length) return;
  const generateButton = document.getElementById('pdfBuilderGenerate');
  generateButton.disabled = true;
  generateButton.textContent = 'Generando...';
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const includeCover = document.getElementById('pdfIncludeCover').checked;
    const includeIndex = document.getElementById('pdfIncludeIndex').checked;
    const eachSongNewPage = document.getElementById('pdfSongNewPage').checked;
    const includeChords = document.querySelector('input[name="pdfContentMode"]:checked')?.value !== 'lyrics';
    const documentTitle = document.getElementById('pdfDocumentTitle').value.trim() || 'Cancionero Gen';
    const subtitle = document.getElementById('pdfDocumentSubtitle').value.trim();
    const filename = limpiarNombreArchivo(document.getElementById('pdfFilename').value);
    const margin = 18;
    const top = 18;
    const bottom = 18;
    const pageHeight = pdf.internal.pageSize.height;
    const contentBottom = pageHeight - bottom - 8;
    const contentWidth = pdf.internal.pageSize.width - margin * 2;
    const lineHeight = 5.2;
    const blockGap = 3.4;
    let pageUsed = false;
    const indexPages = [];

    if (includeCover) {
      dibujarPortadaPDF(pdf, documentTitle, subtitle);
      pageUsed = true;
    }
    if (includeIndex) {
      const rowsPerPage = 31;
      const count = Math.max(1, Math.ceil(pdfDraftSongs.length / rowsPerPage));
      for (let page = 0; page < count; page += 1) {
        if (pageUsed) pdf.addPage();
        pageUsed = true;
        indexPages.push(pdf.getNumberOfPages());
      }
    }
    if (pageUsed) pdf.addPage();

    let y = top;
    let firstSong = true;
    const songStartPages = [];
    const addContentPage = () => {
      pdf.addPage();
      y = top;
    };

    for (const song of pdfDraftSongs) {
      if (!firstSong && eachSongNewPage) addContentPage();
      const minimumHeaderSpace = 34;
      if (y > contentBottom - minimumHeaderSpace) addContentPage();
      songStartPages.push(pdf.getNumberOfPages());
      y = dibujarEncabezadoCancion(pdf, song, margin, y);
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(10.5);
      const charWidth = Math.max(.1, pdf.getTextWidth('M'));
      const maxChars = Math.max(24, Math.floor(contentWidth / charWidth));
      const sourceText = includeChords ? song.letra || '' : quitarAcordes(song.letra || '');
      const blocks = prepararBloquesPDF(sourceText, includeChords, maxChars);
      const usableBlockHeight = contentBottom - top;

      for (const block of blocks) {
        const blockHeight = block.reduce((height, unit) => height + unit.length * lineHeight, 0);
        const remaining = contentBottom - y;
        if (blockHeight <= usableBlockHeight && blockHeight > remaining) addContentPage();
        for (const unit of block) {
          const unitHeight = unit.length * lineHeight;
          if (unitHeight > contentBottom - y) addContentPage();
          for (const line of unit) {
            pdf.setFont('courier', line.chord ? 'bold' : 'normal');
            pdf.setTextColor(line.chord ? 112 : 35, line.chord ? 61 : 35, line.chord ? 168 : 35);
            pdf.text(line.text || ' ', margin, y);
            y += lineHeight;
          }
        }
        y += blockGap;
      }
      y += 8;
      firstSong = false;
    }

    if (includeIndex) {
      const rowsPerPage = 31;
      indexPages.forEach((pageNumber, indexPage) => {
        pdf.setPage(pageNumber);
        pdf.setTextColor(42, 28, 57);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(22);
        pdf.text(indexPage === 0 ? 'Índice de canciones' : 'Índice de canciones (continuación)', margin, 24);
        pdf.setDrawColor(165, 112, 235);
        pdf.line(margin, 30, pdf.internal.pageSize.width - margin, 30);
        let indexY = 40;
        pdfDraftSongs.slice(indexPage * rowsPerPage, (indexPage + 1) * rowsPerPage).forEach((song, localIndex) => {
          const absoluteIndex = indexPage * rowsPerPage + localIndex;
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.setTextColor(50, 44, 56);
          const label = `${absoluteIndex + 1}. ${song.titulo || 'Sin título'}`;
          pdf.text(pdf.splitTextToSize(label, 135)[0], margin, indexY);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(116, 106, 125);
          pdf.text(String(songStartPages[absoluteIndex]), pdf.internal.pageSize.width - margin, indexY, { align: 'right' });
          indexY += 7.2;
        });
      });
    }

    const totalPages = pdf.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      if (includeCover && page === 1) continue;
      pdf.setPage(page);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(145, 137, 151);
      pdf.text(`Gen 2 - ${page} / ${totalPages}`, pdf.internal.pageSize.width - margin, pageHeight - 8, { align: 'right' });
    }

    pdf.setProperties({ title: documentTitle, subject: 'Cancionero Gen', creator: 'Gen 2' });
    pdf.save(`${filename}.pdf`);
    cerrarConstructorPDF();
    mostrarToast(`PDF generado con ${pdfDraftSongs.length} canciones`, 'success');
    cancelarSeleccion();
  } catch (error) {
    console.error('Error generando PDF:', error);
    mostrarToast('No pudimos generar el PDF', 'error');
  } finally {
    generateButton.disabled = pdfDraftSongs.length === 0;
    generateButton.textContent = 'Generar y descargar PDF';
  }
}

// Artistas
window.abrirArtista = function (nombreArtista) {
  window.location.href = `artista.html?artista=${encodeURIComponent(nombreArtista)}`;
};

window.mostrarTodas = async function () {
  if (vistaActual === 'destacados') await cargarCategoria('todas', true);
  else if (vistaActual === 'categoria' && hayMasCanciones) await cargarCategoria(categoriaActual, false);
};

// Helpers
function getCategoriaTexto(valor) {
  const categorias = { todas: 'Todas las canciones', misa: 'Misa', gen: 'Gen', fogon: 'Fogón' };
  return categorias[valor] || valor;
}
function getCategoriaIcon(categoria) {
  const iconos = { misa: '⛪', gen: '✦', fogon: '△' };
  return iconos[categoria] || '♪';
}

function getMiniaturaIcon(categoria) {
  const iconos = { misa: 'i-church', gen: 'i-users', fogon: 'i-fire' };
  return `<svg aria-hidden="true"><use href="#${iconos[categoria] || 'i-music'}"/></svg>`;
}

function hashTexto(texto) {
  return Array.from(texto).reduce((total, caracter) => ((total << 5) - total + caracter.charCodeAt(0)) >>> 0, 0);
}

function obtenerIniciales(nombre) {
  return escaparHTML(nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase() || '?');
}

function escaparHTML(valor) {
  return String(valor).replace(/[&<>'"]/g, (caracter) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[caracter]));
}

function escaparAtributo(valor) {
  return escaparHTML(valor).replace(/`/g, '&#96;');
}

// Formulario
window.mostrarMenuAportes = function () {
  document.getElementById('contributionOverlay').hidden = false;
  document.body.style.overflow = 'hidden';
};

window.ocultarMenuAportes = function () {
  document.getElementById('contributionOverlay').hidden = true;
  document.body.style.overflow = '';
};

window.abrirAporteCancion = function () {
  const user = window.firebaseAuth?.currentUser;
  if (!user) {
    ocultarMenuAportes();
    if (typeof window.genOpenAuthModal === 'function') window.genOpenAuthModal();
    else document.getElementById('auth-btn')?.click();
    mostrarToast('Iniciá sesión para enviar una canción', 'error');
    return;
  }
  ocultarMenuAportes();
  mostrarFormulario();
};

window.mostrarFormulario = function () {
  const overlay = document.getElementById('formOverlay');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('titulo')?.focus(), 100);
};

window.ocultarFormulario = function () {
  const overlay = document.getElementById('formOverlay');
  overlay.style.display = 'none';
  document.body.style.overflow = 'auto';
  document.getElementById('formCancion')?.reset();
};

window.abrirCancion = function (id) {
  if (!window.modoSeleccion) window.location.href = `cancion.html?id=${id}`;
};

window.abrirAcordes = function () {
  window.location.href = 'acordes.html';
};

// Preparar la vista previa antes de guardar la canción
async function guardarCancion(e) {
  e.preventDefault();
  try {
    const user = window.firebaseAuth?.currentUser;
    if (!user) {
      if (typeof window.genOpenAuthModal === 'function') window.genOpenAuthModal();
      throw new Error('Iniciá sesión para enviar una canción.');
    }
    const cancionData = {
      titulo: document.getElementById('titulo').value.trim(),
      artista: document.getElementById('artista').value.trim(),
      categoria: document.getElementById('categoria').value,
      letra: document.getElementById('letra').value.trim(),
      tono: document.getElementById('tonoPropuesto').value.trim(),
      idioma: document.getElementById('idiomaPropuesto').value,
      usuarioId: user.uid,
      creadoPorNombre: String(user.displayName || user.email?.split('@')[0] || 'Perfil sin nombre').slice(0, 120)
    };
    if (!cancionData.titulo || !cancionData.categoria || !cancionData.letra) {
      mostrarToast('❌ Completa todos los campos obligatorios', 'error');
      return;
    }
    const parsed = parseSongContent(cancionData.letra);
    if (!parsed.chords.length) {
      mostrarToast('❌ No encontramos acordes. Pegá también las líneas de acordes de la canción.', 'error');
      return;
    }
    sessionStorage.setItem('gen_song_submission_draft', JSON.stringify(cancionData));
    window.location.href = 'cancion.html?preview=1';
  } catch (error) {
    console.error('❌ Error guardando canción:', error);
    mostrarToast(`❌ Error: ${error.message}`, 'error');
  }
}

// Toast
function mostrarToast(mensaje, tipo = 'success') {
  const toast = document.getElementById('statusToast');
  const toastElement = document.getElementById('toast');
  const icon = document.getElementById('toastIcon');
  const message = document.getElementById('toastMessage');
  if (!toast || !toastElement) return;

  icon.textContent = tipo === 'success' ? '✅' : '❌';
  message.textContent = mensaje;
  toastElement.className = `toast ${tipo}`;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}
