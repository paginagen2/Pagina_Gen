// Módulo para la página Cancionero (mueve el script inline aquí)
import { probarConexion, DatabaseService } from '../aaglobal/firebase-config-cancionero.js';
import { isOfflineModeActive, getOfflineData } from '../aaglobal/app-features.js';

// Estado global
let canciones = [];
let cancionesFiltradas = [];
let unsubscribe = null;
let cancionesSeleccionadas = new Set();
let mostrandoTodas = false;
window.modoSeleccion = false; // Ahora global
let mostrandoArtista = false;
let artistaActual = '';

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
  await inicializar();
  inicializarEventListeners();
});

// Conexión y suscripción
async function inicializar() {
  // 1. Verificar si el Modo Offline está activo y hay datos
  if (isOfflineModeActive()) {
    const datosLocales = getOfflineData('canciones');
    if (datosLocales && datosLocales.length > 0) {
      console.log('📦 Usando datos offline para canciones');
      canciones = datosLocales;
      if (mostrandoArtista) {
        mostrarCancionesArtista(artistaActual);
      } else {
        aplicarFiltros();
      }
      actualizarTopArtistas();
      return;
    }
  }

  // 2. Si no hay modo offline o no hay datos, cargar de Firebase
  try {
    const conexionExitosa = await probarConexion();
    if (conexionExitosa) {
     unsubscribe = DatabaseService.onCancionesChange((cancionesActualizadas) => {
        canciones = cancionesActualizadas;
        if (mostrandoArtista) {
          mostrarCancionesArtista(artistaActual);
        } else {
          aplicarFiltros();
        }
        actualizarTopArtistas();
      });
    } else {
      mostrarToast('❌ Error conectando a Firebase', 'error');
    }
  } catch (error) {
    console.error('💥 Error en inicialización:', error);
    mostrarToast(`❌ Error: ${error.message}`, 'error');
  }
}

// Listeners UI
function inicializarEventListeners() {
  const searchInput = document.getElementById('searchInput');
  const categoriaBtns = document.querySelectorAll('.filter-pill[data-categoria]');
  const form = document.getElementById('formCancion');
  const overlay = document.getElementById('formOverlay');

  if (searchInput) searchInput.addEventListener('input', aplicarFiltros);

  categoriaBtns.forEach((btn) => {
    btn.addEventListener('click', function () {
      categoriaBtns.forEach((b) => b.classList.remove('active'));
      this.classList.add('active');
      aplicarFiltros();
    });
  });

  if (form) form.addEventListener('submit', guardarCancion);

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

// Filtros y render (corrige el bloque roto)
function aplicarFiltros() {
  const busqueda = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const categoriaActiva = document.querySelector('.filter-pill[data-categoria].active')?.dataset.categoria || 'todas';

  cancionesFiltradas = canciones.filter((cancion) => {
    const texto = `${cancion.titulo || ''} ${cancion.artista || ''} ${cancion.letra || ''}`.toLowerCase();
    const cumpleBusqueda = !busqueda || texto.includes(busqueda);
    const cumpleCategoria = categoriaActiva === 'todas' || cancion.categoria === categoriaActiva;
    return cumpleBusqueda && cumpleCategoria;
  });

  const titulo = document.getElementById('sectionTitle');
  const hayFiltros = !!busqueda || categoriaActiva !== 'todas';
  if (titulo) {
    titulo.textContent = hayFiltros
      ? `🔍 Resultados de búsqueda (${cancionesFiltradas.length})`
      : mostrandoTodas
      ? '📚 Todas las canciones'
      : '🏆 Top 5 más populares';
  }

  renderizarCanciones();
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

  const hayFiltros =
    (document.getElementById('searchInput')?.value || '') ||
    (document.querySelector('.filter-pill[data-categoria].active')?.dataset.categoria || 'todas') !== 'todas';

  const cancionesAMostrar =
    hayFiltros || mostrandoTodas
      ? cancionesFiltradas
      : [...cancionesFiltradas].sort((a, b) => (b.reproducciones || 0) - (a.reproducciones || 0)).slice(0, 5);

  cancionesAMostrar.forEach((cancion, index) => {
    const card = crearCancionCard(cancion, index + 1);
    container.appendChild(card);
  });
}

// Crear card con checkbox mejor posicionado
function crearCancionCard(cancion, ranking) {
  const card = document.createElement('div');
  card.className = 'cancion-card';
  if (cancionesSeleccionadas.has(cancion.id)) card.classList.add('selected');

  const previewLetra =
    (cancion.letra || '').replace(/\[([^\]]+)\]/g, '').substring(0, 80) +
    ((cancion.letra || '').length > 80 ? '...' : '');

  card.innerHTML = `
    <div class="cancion-content" onclick="event.stopPropagation(); if (window.modoSeleccion) { toggleSelection('${cancion.id}'); } else { abrirCancion('${cancion.id}'); }">
      <div class="cancion-header">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <span class="ranking-badge">#${ranking}</span>
            <h3 class="cancion-titulo">${cancion.titulo}</h3>
          </div>
          <div class="cancion-meta">
            <div class="meta-item">
              <span>👤</span>
              <span class="artista-link" onclick="event.stopPropagation(); abrirArtista('${cancion.artista || 'Desconocido'}')">${cancion.artista || 'Desconocido'}</span>
            </div>
            <div class="meta-item">
              <span>👁️</span>
              <span>${cancion.reproducciones || 0} vistas</span>
            </div>
          </div>
        </div>

        <div class="categoria-with-checkbox">
          <div class="selection-checkbox ${window.modoSeleccion ? 'visible' : ''}">
            <input type="checkbox" class="song-checkbox" data-id="${cancion.id}"
                   ${cancionesSeleccionadas.has(cancion.id) ? 'checked' : ''}
                   onchange="event.stopPropagation(); toggleSelection('${cancion.id}')">
          </div>
          <div class="cancion-categoria">
            <span>${getCategoriaIcon(cancion.categoria)}</span>
            <span>${getCategoriaTexto(cancion.categoria)}</span>
          </div>
        </div>
      </div>
      <div class="cancion-preview">${previewLetra}</div>
    </div>
  `;

  return card;
}

// Top artistas
function actualizarTopArtistas() {
  const artistasMap = new Map();
  canciones.forEach((cancion) => {
    const artista = cancion.artista || 'Desconocido';
    artistasMap.set(artista, (artistasMap.get(artista) || 0) + 1);
  });

  const topArtistas = Array.from(artistasMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const container = document.getElementById('artistasList');
  if (!container) return;

  if (topArtistas.length === 0) {
    container.innerHTML = '<div class="loading-text">No hay artistas aún</div>';
    return;
  }

  container.innerHTML = '';
  topArtistas.forEach(([artista, count], index) => {
    const item = document.createElement('div');
    item.className = 'artista-item';
    item.innerHTML = `
      <div class="artista-info">
        <div class="artista-rank">${index + 1}</div>
        <div class="artista-nombre artista-link" onclick="abrirArtista('${artista}')">${artista}</div>
      </div>
      <div class="artista-count">${count} canciones</div>
    `;
    container.appendChild(item);
  });
}

// Modo selección PDF
window.activarModoSeleccion = function () {
  window.modoSeleccion = true;
  document.body.classList.add('selection-mode');
  document.getElementById('pdfControls').style.display = 'block';
  document.getElementById('btnActivarPDF').style.display = 'none';
  renderizarCanciones();
  mostrarToast('✅ Modo selección activado. Elige las canciones para tu PDF', 'success');
};

window.cancelarSeleccion = function () {
  window.modoSeleccion = false;
  document.body.classList.remove('selection-mode');
  cancionesSeleccionadas.clear();
  document.getElementById('selectionCount').textContent = 0; // Reiniciar el contador visual a 0
  document.getElementById('pdfControls').style.display = 'none';
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

window.generarPDF = function () {
  if (cancionesSeleccionadas.size === 0) {
    mostrarToast('❌ Selecciona al menos una canción', 'error');
    return;
  }

  console.log('Canciones seleccionadas (IDs):', Array.from(cancionesSeleccionadas));
  console.log('Número de canciones seleccionadas:', cancionesSeleccionadas.size);

  const cancionesParaPDF = canciones
    .filter((c) => cancionesSeleccionadas.has(c.id))
    .sort((a, b) => a.titulo.localeCompare(b.titulo));

  console.log('Canciones a incluir en PDF (objetos):', cancionesParaPDF.map(c => c.titulo));

  try {
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
  artistaActual = nombreArtista;
  mostrandoArtista = true;
  document.querySelector('.cancionero-layout').style.display = 'none';
  const artistaSection = document.getElementById('artistaSection');
  artistaSection.style.display = 'block';
  document.getElementById('artistaTitulo').textContent = `🎤 ${nombreArtista}`;
  mostrarCancionesArtista(nombreArtista);
};

function mostrarCancionesArtista(nombreArtista) {
  const cancionesArtista = canciones
    .filter((c) => (c.artista || 'Desconocido') === nombreArtista)
    .sort((a, b) => (b.reproducciones || 0) - (a.reproducciones || 0));

  const container = document.getElementById('cancionesArtista');
  container.innerHTML = '';

  if (cancionesArtista.length === 0) {
    container.innerHTML = `
      <div class="loading-state">
        <div class="loading-icon">🎤</div>
        <p>Este artista no tiene canciones</p>
      </div>
    `;
    return;
  }

  cancionesArtista.forEach((cancion, index) => {
    const card = document.createElement('div');
    card.className = 'cancion-card';
    // Corrige el enlace de navegación
    card.onclick = () => (window.location.href = `cancion.html?id=${cancion.id}`);
    card.innerHTML = `
      <div class="cancion-content">
        <div class="cancion-header">
          <div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
              <span class="ranking-badge">#${index + 1}</span>
              <h3 class="cancion-titulo">${cancion.titulo}</h3>
            </div>
            <div class="cancion-meta">
              <div class="meta-item">
                <span>👁️</span>
                <span>${cancion.reproducciones || 0} vistas</span>
              </div>
            </div>
          </div>
          <div class="cancion-categoria">
            <span>${getCategoriaIcon(cancion.categoria)}</span>
            <span>${getCategoriaTexto(cancion.categoria)}</span>
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

window.volverAlMain = function () {
  mostrandoArtista = false;
  artistaActual = '';
  document.querySelector('.cancionero-layout').style.display = 'grid';
  document.getElementById('artistaSection').style.display = 'none';
  aplicarFiltros();
};

window.mostrarTodas = function () {
  if (mostrandoArtista) return;
  mostrandoTodas = !mostrandoTodas;
  const link = document.querySelector('.view-all-link');
  if (link) link.textContent = mostrandoTodas ? '← Mostrar top 5' : 'Ver todas →';
  aplicarFiltros();
};

// Helpers
function getCategoriaTexto(valor) {
  const categorias = { misa: 'Misa', gen: 'Gen', fogon: 'Fogón' };
  return categorias[valor] || valor;
}
function getCategoriaIcon(categoria) {
  const iconos = { misa: '⛪', gen: '❤️', fogon: '🔥' };
  return iconos[categoria] || '🎵';
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
  if (!modoSeleccion) window.location.href = `cancion.html?id=${id}`;
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

// Cleanup
window.addEventListener('beforeunload', () => {
  if (unsubscribe) unsubscribe();
});