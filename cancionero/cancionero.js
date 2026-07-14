import { DatabaseService } from '../aaglobal/firebase-config-cancionero.js?v=20260713-speed1';

const DATA_ROOT = '../datos/cancionero';
let canciones = [];
let cancionesFiltradas = [];
let cancionesSeleccionadas = new Set();
let cancionesConocidas = new Map();
let indiceBusqueda = null;
let temporizadorBusqueda = null;
let vistaActual = 'destacados';
let categoriaActual = 'todas';
let paginaActual = 0;
let hayMasCanciones = false;
window.modoSeleccion = false;
let mostrandoTodosArtistas = false;
let artistasOrdenados = [];
let artistasCompletosCargados = false;

document.addEventListener('DOMContentLoaded', async () => {
  inicializarEventListeners();
  await inicializar();
});

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

function registrarCanciones(lista) {
  lista.forEach((cancion) => cancionesConocidas.set(cancion.id, cancion));
}

async function cargarCategoria(categoria, reiniciar = true) {
  const pagina = reiniciar ? 1 : paginaActual + 1;
  mostrarEstadoCanciones('Cargando canciones...');
  try {
    const datos = await cargarJson(`${DATA_ROOT}/${categoria}/${pagina}.json`);
    const nuevas = Array.isArray(datos.canciones) ? datos.canciones : [];
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
  const form = document.getElementById('formCancion');
  const overlay = document.getElementById('formOverlay');
  const artistsViewAll = document.getElementById('artistsViewAll');

  if (searchInput) searchInput.addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(ejecutarBusqueda, 250);
  });

  categoriaBtns.forEach((btn) => {
    btn.addEventListener('click', async function () {
      categoriaBtns.forEach((b) => b.classList.remove('active'));
      this.classList.add('active');
      if (searchInput) searchInput.value = '';
      await cargarCategoria(this.dataset.categoria, true);
    });
  });

  if (form) form.addEventListener('submit', guardarCancion);
  if (artistsViewAll) artistsViewAll.addEventListener('click', () => window.mostrarTodosArtistas());

  // Confirmar cierre con Escape cuando el formulario está visible
  document.addEventListener('keydown', function (e) {
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
}

function aplicarFiltros() {
  cancionesFiltradas = [...canciones];

  const titulo = document.getElementById('sectionTitle');
  if (titulo) {
    titulo.textContent = vistaActual === 'destacados'
      ? 'Canciones destacadas'
      : `${getCategoriaTexto(categoriaActual === 'todas' ? 'todas' : categoriaActual)} (${cancionesFiltradas.length})`;
  }

  renderizarCanciones();
  actualizarBotonCanciones();
}

async function ejecutarBusqueda() {
  const searchInput = document.getElementById('searchInput');
  const busqueda = (searchInput?.value || '').toLowerCase().trim();
  if (!busqueda) {
    vistaActual = paginaActual > 0 ? 'categoria' : 'destacados';
    aplicarFiltros();
    return;
  }

  try {
    if (!indiceBusqueda) {
      const datos = await cargarJson(`${DATA_ROOT}/buscar.json`);
      indiceBusqueda = datos.canciones || [];
      registrarCanciones(indiceBusqueda);
    }
    const categoria = document.querySelector('.filter-pill[data-categoria].active')?.dataset.categoria || 'todas';
    cancionesFiltradas = indiceBusqueda.filter((cancion) => {
      const texto = `${cancion.titulo || ''} ${cancion.artista || ''}`.toLowerCase();
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
  button.hidden = vistaActual === 'busqueda' || (vistaActual === 'categoria' && !hayMasCanciones);
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
        <div class="loading-icon">🔍</div>
        <p>No se encontraron canciones</p>
      </div>
    `;
    return;
  }

  cancionesFiltradas.forEach((cancion, index) => {
    const card = crearCancionCard(cancion, index + 1);
    container.appendChild(card);
  });
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
          <svg class="favorite-icon" aria-hidden="true"><use href="#i-heart"/></svg>
        </div>
      </div>
    </div>
  `;

  card.querySelector('.cancion-content')?.addEventListener('click', () => {
    if (window.modoSeleccion) toggleSelection(cancion.id);
    else abrirCancion(cancion.id);
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

  return card;
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

window.generarPDF = async function () {
  if (cancionesSeleccionadas.size === 0) {
    mostrarToast('❌ Selecciona al menos una canción', 'error');
    return;
  }

  try {
    mostrarToast('Preparando las canciones seleccionadas...', 'success');
    const cancionesParaPDF = (await Promise.all(
      Array.from(cancionesSeleccionadas).map((id) => DatabaseService.getCancionPorId(id))
    )).filter(Boolean).sort((a, b) => (a.titulo || '').localeCompare(b.titulo || '', 'es'));

    if (cancionesParaPDF.length === 0) throw new Error('No se encontraron las canciones seleccionadas');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    const margin = 20;
    let esPrimera = true;

    cancionesParaPDF.forEach((cancion) => {
      if (!esPrimera) pdf.addPage();
      esPrimera = false;

      let y = 20;
      pdf.setFontSize(18);
      pdf.setFont(undefined, 'bold');
      pdf.text((cancion.titulo || '').toUpperCase(), margin, y);

      y += 12;
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'normal');
      const info = `${cancion.artista || 'Desconocido'} • ${getCategoriaTexto(cancion.categoria)}`;
      pdf.text(info, margin, y);

      y += 20;
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(11);
      const letra = cancion.letra || '';
      const lines = pdf.splitTextToSize(letra, pdf.internal.pageSize.width - 2 * margin);
      lines.forEach((line) => {
        if (y > pdf.internal.pageSize.height - 30) {
          pdf.addPage();
          y = 20;
        }
        pdf.text(line, margin, y);
        y += 6;
      });
    });

    pdf.save(`cancionero-gen-${cancionesSeleccionadas.size}-canciones.pdf`);
    mostrarToast(`📄 PDF generado con ${cancionesSeleccionadas.size} canciones`, 'success');
    cancelarSeleccion();
  } catch (error) {
    console.error('Error generando PDF:', error);
    mostrarToast('❌ Error al generar PDF', 'error');
  }
};

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

// Guardar canción
async function guardarCancion(e) {
  e.preventDefault();
  try {
    const cancionData = {
      titulo: document.getElementById('titulo').value.trim(),
      artista: document.getElementById('artista').value.trim(),
      categoria: document.getElementById('categoria').value,
      letra: document.getElementById('letra').value.trim(),
    };
    if (!cancionData.titulo || !cancionData.categoria || !cancionData.letra) {
      mostrarToast('❌ Completa todos los campos obligatorios', 'error');
      return;
    }
    await DatabaseService.agregarCancion(cancionData);
    mostrarToast('✅ Canción guardada correctamente', 'success');
    ocultarFormulario();
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
