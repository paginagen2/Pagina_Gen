// Lista de atributos disponibles para filtrado
const atributosDisponibles = [
  "Meditación", "Dios Amor", "Voluntad de Dios", "El hermano", "El mandamiento nuevo", 
  "La unidad", "Jesús Abandonado", "Jesús en medio", "Jesús Eucaristía", "La Palabra De Vida", 
  "María", "El Espíritu Santo", "La iglesia", "Revolución Arcoíris", "Rojo", "Anaranjado", 
  "Amarillo", "Verde", "Azul", "Índigo", "Violeta", "Dialogo", "Dialogo 1 (Dentro de la Iglesia Católica)", 
  "Dialogo 2 (Con las otras Iglesias Cristianas)", "Dialogo 3 (Con otras Religiones)", 
  "Dialogo 4 (Gente Sin Creencias)", "Fisionomía Del Gen", "Estatutos", "Ciudad Nueva"
];

// URL del Google Form
const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSf4VFqkTGE0K49b_pCy0Vm8oD5J3YsITs0c4CYa4zD32L92pw/viewform?usp=header";

// Base de datos de la biblioteca
const biblioteca = [
  {
    id: 1,
    titulo: "Jesus en Medio",
    autor: "Chiara Lubich", 
    categoria: "documentos",
    tipo: "PDF",
    tamaño: "774 KB",
    fecha: "19/12/2001",
    descripcion: "Chiara responde una pregunta de una gen sobre la presencia de Jesús en medio",
    googleId: "1Rum2UAjuAcP4JU18yzPy0-eEWZ4ypzqp",
    atributos: ["Jesús en medio", "Meditación", "La unidad"]
  },
  {
    id: 2,
    titulo: "La fuente de Dios, el hermano",
    autor: "Chiara Lubich", 
    categoria: "documentos",
    tipo: "PDF",
    tamaño: "103 KB",
    fecha: "09/07/1974",
    descripcion: "Si se acercan a un hermano, amándolo, esta actitud los lleva a Dios y se sienten felices.",
    googleId: "1M4AXDOQ05qv9x0ZYULCjUUUnG49_hAKT",
    atributos: ["El hermano", "Meditación", "Dios Amor"]
  },
  {
    id: 3,
    titulo: "Origen de la Revolución Arcoíris",
    autor: "Chiara Lubich", 
    categoria: "documentos",
    tipo: "PDF",
    tamaño: "136 KB",
    fecha: "x",
    descripcion: "Ustedes dicen: ¿Pero cómo, a quién y cómo se le ocurrió esta idea del arco iris?",
    googleId: "1aK0VuTogwatLrN5_RJTV2vFkqhuRBwN9",
    atributos: ["Revolución Arcoíris", "Meditación", "Dios Amor"]
  },
  {
    id: 4,
    titulo: "El Misterio de la Unidad",
    autor: "Chiara Lubich", 
    categoria: "Documentos", 
    tipo: "PDF", 
    tamaño: "622 KB", 
    fecha: "29/12/1975", 
    descripcion: "Chiara responde una pregunta sobre Jesús en Medio y la Trinidad formada", 
    googleId: "1x7akVyKN2zc8TuavYlljHnVCPwvtLrfA", 
    atributos: ["Dios Amor", "Jesús en medio", "Meditación"]
  },

];

// Variables globales
let categoriaActual = 'todos';
let atributosActivos = [];
let bibliotecaFiltrada = [...biblioteca];
let filtrosTemasVisible = false; // 🔧 CAMBIO 1: Filtros ocultos por defecto

// Configuración de paginación
const ARCHIVOS_POR_PAGINA = 12;
let paginaActual = 1;
let totalPaginas = 1;

// 🔧 CAMBIO 2: Variables para detectar si se ha filtrado o buscado
let seBusco = false;
let seFiltro = false;

// Inicializar cuando carga la página
document.addEventListener('DOMContentLoaded', function() {
  cargarFiltrosAtributos();
  aplicarFiltros();
  // 🔧 CAMBIO 3: Inicializar filtros colapsados
  inicializarEstadoFiltros();
});

// 🔧 CAMBIO 4: Función para inicializar el estado de filtros colapsados
function inicializarEstadoFiltros() {
  const filtrosContainer = document.getElementById('filtrosAtributos');
  const toggleIcon = document.getElementById('toggleIcon');
  const toggleText = document.getElementById('toggleText');
  
  // Inicializar como colapsado
  filtrosContainer.classList.add('collapsed');
  toggleIcon.textContent = '▶';
  toggleText.textContent = 'Mostrar filtros';
}

// Toggle para mostrar/ocultar filtros por temas
function toggleFiltrosTemas() {
  const filtrosContainer = document.getElementById('filtrosAtributos');
  const toggleIcon = document.getElementById('toggleIcon');
  const toggleText = document.getElementById('toggleText');
  
  filtrosTemasVisible = !filtrosTemasVisible;
  
  if (filtrosTemasVisible) {
    filtrosContainer.classList.remove('collapsed');
    toggleIcon.textContent = '▼';
    toggleText.textContent = 'Ocultar filtros';
  } else {
    filtrosContainer.classList.add('collapsed');
    toggleIcon.textContent = '▶';
    toggleText.textContent = 'Mostrar filtros';
  }
}

// Abrir Google Forms para enviar archivo
function abrirFormularioGoogle() {
  window.open(GOOGLE_FORM_URL, '_blank', 'noopener,noreferrer');
}

// Cargar filtros de atributos dinámicamente
function cargarFiltrosAtributos() {
  const container = document.getElementById('filtrosAtributos');
  
  atributosDisponibles.sort().forEach(atributo => {
    const btn = document.createElement('button');
    btn.className = 'atributo_btn';
    btn.setAttribute('data-atributo', atributo);
    btn.textContent = atributo;
    btn.onclick = () => toggleAtributo(atributo);
    container.appendChild(btn);
  });
}

// Toggle atributo (permite múltiple selección)
function toggleAtributo(atributo) {
  const btn = document.querySelector(`[data-atributo="${atributo}"]`);
  
  if (atributosActivos.includes(atributo)) {
    atributosActivos = atributosActivos.filter(a => a !== atributo);
    btn.classList.remove('active');
  } else {
    atributosActivos.push(atributo);
    btn.classList.add('active');
  }
  
  // 🔧 CAMBIO 5: Marcar que se filtró
  seFiltro = true;
  
  paginaActual = 1;
  aplicarFiltros();
}

// Filtrar por categoría
function filtrarCategoria(categoria) {
  categoriaActual = categoria;
  
  document.querySelectorAll('.filtro_btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-categoria="${categoria}"]`).classList.add('active');
  
  // 🔧 CAMBIO 6: Marcar que se filtró si no es "todos"
  if (categoria !== 'todos') {
    seFiltro = true;
  } else {
    // Si vuelve a "todos", resetear
    seFiltro = atributosActivos.length > 0;
  }
  
  paginaActual = 1;
  aplicarFiltros();
}

// Buscar archivos
function buscarArchivos() {
  const textoBusqueda = document.getElementById('busquedaInput').value.trim();
  
  // 🔧 CAMBIO 7: Marcar que se buscó si hay texto
  seBusco = textoBusqueda.length > 0;
  
  paginaActual = 1;
  aplicarFiltros();
}

// Aplicar todos los filtros
function aplicarFiltros() {
  const textoBusqueda = document.getElementById('busquedaInput').value.toLowerCase();
  
  bibliotecaFiltrada = biblioteca.filter(archivo => {
    const cumpleCategoria = categoriaActual === 'todos' || archivo.categoria === categoriaActual;
    
    const cumpleAtributos = atributosActivos.length === 0 || 
      atributosActivos.some(atributo => archivo.atributos.includes(atributo));
    
    const cumpleBusqueda = textoBusqueda === '' ||
      archivo.titulo.toLowerCase().includes(textoBusqueda) || 
      archivo.autor.toLowerCase().includes(textoBusqueda) ||
      archivo.descripcion.toLowerCase().includes(textoBusqueda) ||
      archivo.atributos.some(attr => attr.toLowerCase().includes(textoBusqueda));
    
    return cumpleCategoria && cumpleAtributos && cumpleBusqueda;
  });
  
  totalPaginas = Math.ceil(bibliotecaFiltrada.length / ARCHIVOS_POR_PAGINA);
  if (totalPaginas === 0) totalPaginas = 1;
  
  if (paginaActual > totalPaginas) paginaActual = totalPaginas;
  if (paginaActual < 1) paginaActual = 1;
  
  cargarBiblioteca();
  actualizarContador();
  actualizarPaginacion();
}

// Cargar y mostrar archivos de la página actual
function cargarBiblioteca() {
  const grid = document.getElementById('bibliotecaGrid');
  grid.innerHTML = '';

  if (bibliotecaFiltrada.length === 0) {
    const sinResultados = document.createElement('div');
    sinResultados.className = 'sin_resultados';
    sinResultados.innerHTML = `
      <div class="sin_resultados_icono">📭</div>
      <h3>No se encontraron recursos</h3>
      <p>Intenta con otros términos de búsqueda o cambia los filtros.</p>
    `;
    grid.appendChild(sinResultados);
    return;
  }

  const inicioIndice = (paginaActual - 1) * ARCHIVOS_POR_PAGINA;
  const finIndice = inicioIndice + ARCHIVOS_POR_PAGINA;
  const archivosPagina = bibliotecaFiltrada.slice(inicioIndice, finIndice);

  archivosPagina.forEach(archivo => {
    const item = crearItemArchivo(archivo);
    grid.appendChild(item);
  });
}

// Crear item para cada archivo
function crearItemArchivo(archivo) {
  const item = document.createElement('div');
  item.className = 'archivo_item';
  
  const atributosHtml = archivo.atributos.map(attr => 
    `<span class="atributo_tag">${attr}</span>`
  ).join('');
  
  item.innerHTML = `
    <div class="archivo_header">
      <h3 class="archivo_titulo">${archivo.titulo}</h3>
      <div class="archivo_tipo_badge">${archivo.tipo}</div>
    </div>
    
    <div class="archivo_meta">
      <div class="archivo_autor">por ${archivo.autor}</div>
      <div class="archivo_info_item">
        <span>Fecha:</span>
        <span>${archivo.fecha}</span>
      </div>
      <div class="archivo_info_item">
        <span>Tamaño:</span>
        <span>${archivo.tamaño}</span>
      </div>
    </div>
    
    <div class="archivo_descripcion">${archivo.descripcion}</div>
    
    <div class="archivo_atributos">
      ${atributosHtml}
    </div>
    
    <div class="archivo_acciones">
      <button class="btn_preview" onclick="abrirPreview('${archivo.googleId}', '${archivo.titulo}')">
        👁️ Vista previa
      </button>
      <a href="https://drive.google.com/uc?id=${archivo.googleId}&export=download" 
         target="_blank" class="btn_descarga_directo">
        📥 Descargar
      </a>
    </div>
  `;
  
  return item;
}

// 🔧 CAMBIO 8: Actualizar contador solo si se filtró o buscó
function actualizarContador() {
  const contador = document.getElementById('contadorResultados');
  const total = bibliotecaFiltrada.length;
  
  // 🔧 Solo mostrar contador si se ha filtrado o buscado algo
  if (!seBusco && !seFiltro) {
    contador.style.display = 'none';
    return;
  }
  
  contador.style.display = 'block';
  
  if (total === 0) {
    contador.innerHTML = '<span>No se encontraron recursos</span>';
  } else if (total === 1) {
    contador.innerHTML = '<span>1 Archivo encontrado</span>';
  } else {
    contador.innerHTML = `<span>${total} Archivos encontrados</span>`;
  }
}

// Actualizar controles de paginación
function actualizarPaginacion() {
  const paginacionContainer = document.getElementById('paginacion');
  const btnAnterior = document.getElementById('btnAnterior');
  const btnSiguiente = document.getElementById('btnSiguiente');
  const paginaActualSpan = document.getElementById('paginaActual');
  const totalPaginasSpan = document.getElementById('totalPaginas');
  
  if (totalPaginas <= 1) {
    paginacionContainer.style.display = 'none';
    return;
  } else {
    paginacionContainer.style.display = 'flex';
  }
  
  paginaActualSpan.textContent = paginaActual;
  totalPaginasSpan.textContent = totalPaginas;
  
  btnAnterior.disabled = paginaActual <= 1;
  btnSiguiente.disabled = paginaActual >= totalPaginas;
}

// Cambiar página
function cambiarPagina(direccion) {
  const nuevaPagina = paginaActual + direccion;
  
  if (nuevaPagina >= 1 && nuevaPagina <= totalPaginas) {
    paginaActual = nuevaPagina;
    cargarBiblioteca();
    actualizarPaginacion();
    
    document.getElementById('bibliotecaGrid').scrollIntoView({ 
      behavior: 'smooth',
      block: 'start'
    });
  }
}

// Abrir vista previa
function abrirPreview(googleId, titulo) {
  const modal = document.getElementById('modalPreview');
  const modalTitulo = document.getElementById('modalTitulo');
  const modalIframe = document.getElementById('modalIframe');
  const modalDescarga = document.getElementById('modalDescarga');
  
  modalTitulo.textContent = titulo;
  modalIframe.src = `https://drive.google.com/file/d/${googleId}/preview`;
  modalDescarga.href = `https://drive.google.com/uc?id=${googleId}&export=download`;
  
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

// Cerrar modal
function cerrarModal() {
  const modal = document.getElementById('modalPreview');
  const modalIframe = document.getElementById('modalIframe');
  
  modal.style.display = 'none';
  modalIframe.src = '';
  document.body.style.overflow = 'auto';
}

// Cerrar modal al hacer clic fuera
window.onclick = function(event) {
  const modal = document.getElementById('modalPreview');
  if (event.target === modal) {
    cerrarModal();
  }
}

// Cerrar modal con tecla Escape
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    cerrarModal();
  }
});

// 🔧 CAMBIO 9: Función para limpiar todos los filtros
function limpiarFiltros() {
  // Resetear categoría
  categoriaActual = 'todos';
  document.querySelectorAll('.filtro_btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector('[data-categoria="todos"]').classList.add('active');
  
  // Resetear atributos
  atributosActivos = [];
  document.querySelectorAll('.atributo_btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Resetear búsqueda
  document.getElementById('busquedaInput').value = '';
  
  // Resetear flags
  seBusco = false;
  seFiltro = false;
  
  paginaActual = 1;
  aplicarFiltros();
}

// Funciones globales para HTML
window.toggleFiltrosTemas = toggleFiltrosTemas;
window.abrirFormularioGoogle = abrirFormularioGoogle;
window.filtrarCategoria = filtrarCategoria;
window.buscarArchivos = buscarArchivos;
window.cambiarPagina = cambiarPagina;
window.abrirPreview = abrirPreview;
window.cerrarModal = cerrarModal;
window.limpiarFiltros = limpiarFiltros; // 🔧 Nueva función

console.log('✅ Biblioteca.js con estado inicial optimizado');