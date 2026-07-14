// Lista de atributos disponibles para filtrado
const atributosDisponibles = [
  "Meditación", "Dios Amor", "Voluntad de Dios", "El hermano", "El mandamiento nuevo", 
  "La unidad", "Jesús Abandonado", "Jesús en medio", "Jesús Eucaristía", "La Palabra De Vida", 
  "María", "El Espíritu Santo", "La iglesia", "Revolución Arcoíris", "Rojo", "Anaranjado", 
  "Amarillo", "Verde", "Azul", "Índigo", "Violeta", "Diálogo", "Diálogo 1 (Dentro de la Iglesia Católica)", 
  "Diálogo 2 (Con las otras Iglesias Cristianas)", "Diálogo 3 (Con otras Religiones)", 
  "Diálogo 4 (Gente sin creencias)", "Fisionomía del Gen", "Estatutos", "Ciudad Nueva"
];

const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSf4VFqkTGE0K49b_pCy0Vm8oD5J3YsITs0c4CYa4zD32L92pw/viewform?usp=header";

// Base de datos local (estática)
const bibliotecaBase = [
  {
    id: 1,
    titulo: "Jesús en Medio",
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
    categoria: "documentos", 
    tipo: "PDF", 
    tamaño: "622 KB", 
    fecha: "29/12/1975", 
    descripcion: "Chiara responde una pregunta sobre Jesús en Medio y la Trinidad formada", 
    googleId: "1QORKKaLOTYackPQpGNxsgE0lfiOZ9zup", 
    atributos: ["Dios Amor", "Jesús en medio", "Meditación"]
  },
  {
    id: 5, 
    titulo: "Los instrumentos de la espiritualidad colectiva – Chiara Lubich", 
    autor: "Chiara Lubich", 
    categoria: "libros", 
    tipo: "PDF", 
    tamaño: "55,3 MB", 
    fecha: "24/02/1995", 
    descripcion: "Los instrumentos de la espiritualidad colectiva Chiara Lubich, son los puntos que nos llevan al cielo en comunidad.", 
    googleId: "1lqieDCMPLHxubfpUBvXTBwMINpcUvMj5", 
    atributos: ["Amarillo","El Hermano","El mandamiento nuevo","Estatutos","Jesús en medio","La Palabra de Vida"]
  },
];

// Variables globales
let bibliotecaCompleta = [...bibliotecaBase];
let bibliotecaFiltrada = [];
let categoriaActual = 'todos';
let atributosActivos = [];
let seBusco = false;
let seFiltro = false;
let filtrosTemasVisible = false;

// Paginación principal
const ARCHIVOS_POR_PAGINA = 12;
let paginaActual = 1;
let totalPaginas = 1;

// Visor de Libros (Meditaciones)
let libroActual = null;
let indicePaginaLibro = 0;
let modoVistaLibro = 'paginado'; // 'paginado' o 'continuo'

// Referencias Firebase (se inicializarán dinámicamente)
let db = null;

// --- ASIGNACIÓN DE FUNCIONES AL GLOBAL ---
// Lo hacemos fuera de DOMContentLoaded para que estén disponibles lo antes posible
window.toggleFiltrosTemas = toggleFiltrosTemas;
window.filtrarCategoria = filtrarCategoria;
window.buscarArchivos = buscarArchivos;
window.cambiarPagina = cambiarPagina;
window.abrirPreview = abrirPreview;
window.cerrarModal = cerrarModal;
window.limpiarFiltros = limpiarFiltros;
window.abrirLibro = abrirLibro;
window.cambiarPaginaLibro = cambiarPaginaLibro;
window.cerrarModalLibro = cerrarModalLibro;
window.abrirFormularioGoogle = abrirFormularioGoogle;
window.toggleModoVista = toggleModoVista;
window.descargarLibroPDF = descargarLibroPDF;
window.descargarLibroPDFDesdeFuera = descargarLibroPDFDesdeFuera;

window.onclick = function(event) {
    if (event.target.id === 'modalPreview') cerrarModal();
    if (event.target.id === 'modalLibro') cerrarModalLibro();
};

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Setup UI básica
    cargarFiltrosAtributos();
    inicializarEstadoFiltros();
    setupVisorInput();
    setupTeclado();
    
    // 2. Mostrar base de datos local inmediatamente
    aplicarFiltros();
    
    // 3. Intentar cargar libros desde Firebase en segundo plano
    try {
        await cargarLibrosDesdeFirebase();
        aplicarFiltros(); // Actualizar con los libros de Firebase
    } catch (e) {
        console.error("No se pudieron cargar los libros de Firebase:", e);
    }
});

async function cargarLibrosDesdeFirebase() {
    try {
        let meditaciones = [];

        await window.firebaseReady;
        db = window.firebaseDb;
        const { collection, getDocs } = window.firebaseUtils || {};

        if (!db || !collection || !getDocs) {
            throw new Error('Firebase no está disponible para cargar la biblioteca.');
        }

        const querySnapshot = await getDocs(collection(db, 'meditaciones'));
        querySnapshot.forEach(doc => meditaciones.push(doc.data()));
        
        // Agrupar por libro (el resto de la lógica sigue igual)
        const librosMap = {};
        meditaciones.forEach(med => {
            if (med.libro && med.libro.trim()) {
                const nombreLibro = med.libro.trim();
                if (!librosMap[nombreLibro]) {
                    librosMap[nombreLibro] = {
                        id: `fb_${nombreLibro.replace(/\s/g, '_')}`,
                        titulo: nombreLibro,
                        autor: med.autor || "Varios autores",
                        categoria: "libros",
                        tipo: "DIGITAL",
                        tamaño: "Variable",
                        fecha: "Actualizado",
                        descripcion: `Este no es el libro original sino que una transcripción no oficial del libro "${nombreLibro}"`, 
                        // No real change was requested in the block, so I am just ensuring it matches the original content style if needed, but the provided block was identical.
                        atributos: ["Meditación"],
                        paginas: []
                    };
                }
                librosMap[nombreLibro].paginas.push(med);
            }
        });
        
        // Limpiar bibliotecaCompleta de libros fb previos para evitar duplicados
        bibliotecaCompleta = bibliotecaCompleta.filter(a => !a.id.toString().startsWith('fb_'));
        
        // Ordenar páginas por número y agregar libros a la biblioteca
        Object.values(librosMap).forEach(libro => {
            libro.paginas.sort((a, b) => (parseInt(a.pagina) || 0) - (parseInt(b.pagina) || 0));
            bibliotecaCompleta.push(libro);
        });
        
        console.log("📚 Libros de Firebase cargados:", Object.keys(librosMap).length);
    } catch (error) {
        console.error("Error cargando libros de Firebase:", error);
        throw error;
    }
}




function setupVisorInput() {
    const input = document.getElementById('libroPaginaInput');
    if (input) {
        input.addEventListener('change', (e) => {
            let valor = parseInt(e.target.value);
            if (isNaN(valor)) return;
            
            if (valor < 1) valor = 1;
            if (valor > libroActual.paginas.length) valor = libroActual.paginas.length;
            
            indicePaginaLibro = valor - 1;
            actualizarPaginaLibro();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
        });
    }
}

function setupTeclado() {
    document.addEventListener('keydown', (e) => {
        const modalLibro = document.getElementById('modalLibro');
        if (modalLibro && modalLibro.style.display === 'flex') {
            if (e.key === 'ArrowLeft') cambiarPaginaLibro(-1);
            if (e.key === 'ArrowRight') cambiarPaginaLibro(1);
            if (e.key === 'Escape') cerrarModalLibro();
        }
    });
}

function inicializarEstadoFiltros() {
  const filtrosContainer = document.getElementById('filtrosAtributos');
  const toggleButton = document.getElementById('toggleFiltrosBtn');
  const toggleIcon = document.getElementById('toggleIcon');
  const toggleText = document.getElementById('toggleText');
  if (filtrosContainer) filtrosContainer.classList.add('collapsed');
  if (toggleIcon) toggleIcon.textContent = '▶';
  if (toggleText) toggleText.textContent = 'Mostrar filtros';
  toggleButton?.setAttribute('aria-expanded', 'false');
}

function toggleFiltrosTemas() {
  const filtrosContainer = document.getElementById('filtrosAtributos');
  const toggleButton = document.getElementById('toggleFiltrosBtn');
  const toggleIcon = document.getElementById('toggleIcon');
  const toggleText = document.getElementById('toggleText');
  filtrosTemasVisible = !filtrosTemasVisible;
  
  if (filtrosTemasVisible) {
    filtrosContainer.classList.remove('collapsed');
    toggleIcon.textContent = '▼';
    toggleText.textContent = 'Ocultar filtros';
    toggleButton?.setAttribute('aria-expanded', 'true');
  } else {
    filtrosContainer.classList.add('collapsed');
    toggleIcon.textContent = '▶';
    toggleText.textContent = 'Mostrar filtros';
    toggleButton?.setAttribute('aria-expanded', 'false');
  }
}

function cargarFiltrosAtributos() {
  const container = document.getElementById('filtrosAtributos');
  if (!container) return;
  container.innerHTML = '';
  atributosDisponibles.sort().forEach(atributo => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'atributo_btn';
    btn.setAttribute('data-atributo', atributo);
    btn.textContent = atributo;
    btn.onclick = () => toggleAtributo(atributo);
    container.appendChild(btn);
  });
}

function toggleAtributo(atributo) {
  const btn = document.querySelector(`[data-atributo="${atributo}"]`);
  if (atributosActivos.includes(atributo)) {
    atributosActivos = atributosActivos.filter(a => a !== atributo);
    btn.classList.remove('active');
  } else {
    atributosActivos.push(atributo);
    btn.classList.add('active');
  }
  seFiltro = true;
  paginaActual = 1;
  aplicarFiltros();
}

function filtrarCategoria(categoria) {
  categoriaActual = categoria;
  document.querySelectorAll('.filtro_btn').forEach(btn => btn.classList.remove('active'));
  const btnCat = document.querySelector(`[data-categoria="${categoria}"]`);
  if (btnCat) btnCat.classList.add('active');
  seFiltro = (categoria !== 'todos' || atributosActivos.length > 0);
  paginaActual = 1;
  aplicarFiltros();
}

function buscarArchivos() {
  const textoBusqueda = document.getElementById('busquedaInput').value.trim();
  seBusco = textoBusqueda.length > 0;
  paginaActual = 1;
  aplicarFiltros();
}

function aplicarFiltros() {
  const busquedaInput = document.getElementById('busquedaInput');
  const textoBusqueda = busquedaInput ? busquedaInput.value.toLowerCase() : '';
  
  bibliotecaFiltrada = bibliotecaCompleta.filter(archivo => {
    // Regla especial: Libros de Firebase solo se ven en categoría 'libros' o si se busca su título
    const esLibroFirebase = archivo.id.toString().startsWith('fb_');
    const coincideBusqueda = textoBusqueda !== '' && (
        (archivo.titulo && archivo.titulo.toLowerCase().includes(textoBusqueda)) || 
        (archivo.autor && archivo.autor.toLowerCase().includes(textoBusqueda))
    );

    if (esLibroFirebase) {
        if (categoriaActual !== 'libros' && !coincideBusqueda) return false;
    }

    const cumpleCategoria = categoriaActual === 'todos' || archivo.categoria.toLowerCase() === categoriaActual.toLowerCase();
    
    const cumpleAtributos = atributosActivos.length === 0 || 
      (archivo.atributos && atributosActivos.some(atributo => archivo.atributos.includes(atributo)));
    
    const cumpleBusquedaGeneral = textoBusqueda === '' ||
      (archivo.titulo && archivo.titulo.toLowerCase().includes(textoBusqueda)) || 
      (archivo.autor && archivo.autor.toLowerCase().includes(textoBusqueda)) ||
      (archivo.descripcion && archivo.descripcion.toLowerCase().includes(textoBusqueda)) ||
      (archivo.atributos && archivo.atributos.some(attr => attr.toLowerCase().includes(textoBusqueda)));
    
    return cumpleCategoria && cumpleAtributos && cumpleBusquedaGeneral;
  });
  
  totalPaginas = Math.ceil(bibliotecaFiltrada.length / ARCHIVOS_POR_PAGINA);
  if (totalPaginas === 0) totalPaginas = 1;
  if (paginaActual > totalPaginas) paginaActual = totalPaginas;
  
  cargarBiblioteca();
  actualizarContador();
  actualizarPaginacion();
}

function cargarBiblioteca() {
  const grid = document.getElementById('bibliotecaGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (bibliotecaFiltrada.length === 0) {
    grid.innerHTML = `<div class="sin_resultados"><h3>No se encontraron recursos</h3></div>`;
    return;
  }

  const inicioIndice = (paginaActual - 1) * ARCHIVOS_POR_PAGINA;
  const archivosPagina = bibliotecaFiltrada.slice(inicioIndice, inicioIndice + ARCHIVOS_POR_PAGINA);

  archivosPagina.forEach(archivo => {
    grid.appendChild(crearItemArchivo(archivo));
  });
}

function crearItemArchivo(archivo) {
  const item = document.createElement('div');
  item.className = 'archivo_item';
  
  const esLibroFirebase = archivo.id.toString().startsWith('fb_');
  // Botones de acción (igualamos estética para todos)
  const btnAccion = esLibroFirebase 
    ? `<button class="btn_preview" onclick="abrirLibro('${archivo.id}')">📖 Leer Libro</button>
       <button class="btn_descarga_directo" onclick="descargarLibroPDFDesdeFuera('${archivo.id}')">📥 Descargar</button>`
    : `<button class="btn_preview" onclick="abrirPreview('${archivo.googleId}', '${archivo.titulo}')">👁️ Vista previa</button>
       <a href="https://drive.google.com/uc?id=${archivo.googleId}&export=download" target="_blank" class="btn_descarga_directo">📥 Descargar</a>`;

  // Filtrar el atributo "Meditación"
  const atributosFiltrados = (archivo.atributos || []).filter(attr => attr !== "Meditación");

  item.innerHTML = `
    <div class="archivo_header">
      <h3 class="archivo_titulo">${archivo.titulo}</h3>
      <div class="archivo_tipo_badge">${archivo.tipo}</div>
    </div>
    <div class="archivo_meta">
      <div class="archivo_autor">por ${archivo.autor}</div>
    </div>
    <div class="archivo_descripcion">${archivo.descripcion}</div>
    <div class="archivo_atributos">${atributosFiltrados.map(attr => `<span class="atributo_tag">${attr}</span>`).join('')}</div>
    <div class="archivo_acciones">${btnAccion}</div>
  `;
  return item;
}

function actualizarContador() {
  const contador = document.getElementById('contadorResultados');
  if (!contador) return;
  if (!seBusco && !seFiltro) { contador.style.display = 'none'; return; }
  contador.style.display = 'block';
  const total = bibliotecaFiltrada.length;
  contador.innerHTML = `<span>${total} ${total === 1 ? 'Archivo encontrado' : 'Archivos encontrados'}</span>`;
}

function actualizarPaginacion() {
  const container = document.getElementById('paginacion');
  if (!container) return;
  container.style.display = totalPaginas <= 1 ? 'none' : 'flex';
  const pActual = document.getElementById('paginaActual');
  const pTotal = document.getElementById('totalPaginas');
  const btnAnt = document.getElementById('btnAnterior');
  const btnSig = document.getElementById('btnSiguiente');
  
  if (pActual) pActual.textContent = paginaActual;
  if (pTotal) pTotal.textContent = totalPaginas;
  if (btnAnt) btnAnt.disabled = paginaActual <= 1;
  if (btnSig) btnSig.disabled = paginaActual >= totalPaginas;
}

function cambiarPagina(direccion) {
  paginaActual += direccion;
  aplicarFiltros();
  const grid = document.getElementById('bibliotecaGrid');
  if (grid) grid.scrollIntoView({ behavior: 'smooth' });
}

// Lógica del Visor de Libros (Meditaciones)
function abrirLibro(id) {
    libroActual = bibliotecaCompleta.find(a => a.id === id);
    if (!libroActual) return;
    
    indicePaginaLibro = 0;
    modoVistaLibro = 'paginado'; // Siempre abrir en modo paginado por defecto
    
    const tituloEl = document.getElementById('libroTitulo');
    if (tituloEl) tituloEl.textContent = libroActual.titulo;
    
    const btnToggle = document.getElementById('btnToggleVista');
    if (btnToggle) btnToggle.textContent = "📖 Vista Continua";
    
    document.getElementById('paginaContenido').style.display = 'block';
    document.getElementById('vistaContinua').style.display = 'none';
    document.getElementById('libroFooter').style.display = 'flex';
    
    actualizarPaginaLibro();
    
    const modal = document.getElementById('modalLibro');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    // Listener para el input de página (buscar por número real)
    const inputPag = document.getElementById('libroPaginaInput');
    if (inputPag) {
        inputPag.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const valor = e.target.value.trim();
                if (!valor) return;
                
                const numBuscado = parseInt(valor);
                // Buscamos primero por el campo "pagina" real
                let idx = libroActual.paginas.findIndex(p => parseInt(p.pagina) === numBuscado);
                
                // Si no se encuentra por número de página real, intentamos por índice (1-based)
                if (idx === -1) {
                    const indiceInt = parseInt(valor) - 1;
                    if (indiceInt >= 0 && indiceInt < libroActual.paginas.length) {
                        idx = indiceInt;
                    }
                }

                if (idx !== -1) {
                    indicePaginaLibro = idx;
                    actualizarPaginaLibro();
                } else {
                    // Resetear al valor actual si no se encuentra
                    actualizarPaginaLibro();
                }
                e.target.blur();
            }
        };
    }
}

function actualizarPaginaLibro() {
    if (!libroActual) return;
    const pag = libroActual.paginas[indicePaginaLibro];
    const contenido = document.getElementById('paginaContenido');
    
    if (contenido) {
        // Limpiamos el contenido previo y aplicamos formato
        const contenidoHTML = pag.contenido.trim()
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\n/g, '<br>');
        
        contenido.innerHTML = `
            <div class="pagina_header">
                <h2>${pag.titulo}</h2>
                <div class="pagina_meta">
                    ${pag.autor || ""} ${pag.pagina ? ' — Pag. ' + pag.pagina : ""}
                </div>
            </div>
            <div class="texto_meditacion">${contenidoHTML}</div>
        `;
    }
    
    const inputPag = document.getElementById('libroPaginaInput');
    const totalPag = document.getElementById('libroTotalPaginas');
    const btnAnt = document.getElementById('libroAnterior');
    const btnSig = document.getElementById('libroSiguiente');

    // El contador de página muestra el número real (nube)
    if (inputPag) {
        inputPag.value = pag.pagina || (indicePaginaLibro + 1);
    }
    if (totalPag) totalPag.textContent = libroActual.paginas.length;
    
    if (btnAnt) btnAnt.disabled = indicePaginaLibro <= 0;
    if (btnSig) btnSig.disabled = indicePaginaLibro >= libroActual.paginas.length - 1;
    
    const body = document.getElementById('libroBody');
    if (body) body.scrollTop = 0;
}

function toggleModoVista() {
    if (!libroActual) return;
    
    const pagContenido = document.getElementById('paginaContenido');
    const vistaCont = document.getElementById('vistaContinua');
    const footer = document.getElementById('libroFooter');
    const btnToggle = document.getElementById('btnToggleVista');
    
    if (modoVistaLibro === 'paginado') {
        modoVistaLibro = 'continuo';
        btnToggle.textContent = "📑 Vista Paginada";
        pagContenido.style.display = 'none';
        vistaCont.style.display = 'flex';
        footer.style.display = 'none';
        renderizarVistaContinua();
    } else {
        modoVistaLibro = 'paginado';
        btnToggle.textContent = "📖 Vista Continua";
        pagContenido.style.display = 'block';
        vistaCont.style.display = 'none';
        footer.style.display = 'flex';
        actualizarPaginaLibro();
    }
}

function renderizarVistaContinua() {
    const container = document.getElementById('vistaContinua');
    if (!container || !libroActual) return;
    
    container.innerHTML = libroActual.paginas.map(pag => {
        const contenidoHTML = pag.contenido.trim()
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\n/g, '<br>');
            
        return `
            <div class="meditacion_separador">
                <div class="pagina_header">
                    <h2>${pag.titulo}</h2>
                    <div class="pagina_meta">
                        ${pag.autor || ""} ${pag.pagina ? ' — Pag. ' + pag.pagina : ""}
                    </div>
                </div>
                <div class="texto_meditacion">${contenidoHTML}</div>
            </div>
        `;
    }).join('');
    
    const body = document.getElementById('libroBody');
    if (body) body.scrollTop = 0;
}

function descargarLibroPDFDesdeFuera(id) {
    const libro = bibliotecaCompleta.find(a => a.id === id);
    if (!libro) return;
    
    // Guardar referencia temporal para que descargarLibroPDF la use
    const libroPrevio = libroActual;
    libroActual = libro;
    descargarLibroPDF();
    
    // Restaurar libro previo si lo había (por si el visor estaba abierto)
    setTimeout(() => {
        libroActual = libroPrevio;
    }, 500);
}

function descargarLibroPDF() {
    if (!libroActual) return;
    
    const btn = event?.target;
    const originalText = btn ? btn.textContent : null;
    if (btn) {
        btn.textContent = "⏳ Generando...";
        btn.disabled = true;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 25;
    const contentWidth = pageWidth - (margin * 2);

    // 1. PORTADA
    doc.setFont("times", "bold");
    doc.setFontSize(36);
    doc.setTextColor(0, 0, 0); // Negro
    
    // Centrar verticalmente a los 2/3 como pidió el usuario
    const titleLines = doc.splitTextToSize(libroActual.titulo.toUpperCase(), contentWidth);
    const titleY = (pageHeight * 2) / 5; 
    doc.text(titleLines, pageWidth / 2, titleY, { align: 'center' });

    // Autor en la portada
    const autorLibro = libroActual.autor || (libroActual.paginas[0] && libroActual.paginas[0].autor) || "Chiara Lubich";
    doc.setFont("times", "italic");
    doc.setFontSize(20);
    doc.text(autorLibro, pageWidth / 2, titleY + (titleLines.length * 12) + 10, { align: 'center' });

    // 2. CONTENIDO (Una meditación por página)
    libroActual.paginas.forEach((pag, index) => {
        doc.addPage();
        let y = 30;

        // Título de la meditación
        doc.setFont("times", "bold");
        doc.setFontSize(22);
        doc.setTextColor(169, 50, 38);
        const medTitleLines = doc.splitTextToSize(pag.titulo, contentWidth);
        doc.text(medTitleLines, margin, y);
        y += (medTitleLines.length * 10) + 5;

        // Línea separadora sutil
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, y, margin + 15, y);
        y += 10;

        // Texto de la meditación
        doc.setFont("times", "normal");
        doc.setFontSize(13);
        doc.setTextColor(0, 0, 0); // Negro puro
        
        // Limpiamos etiquetas <br> si existen y normalizamos saltos
        const textoLimpio = pag.contenido.replace(/<br>/g, '\n').trim();
        const lines = doc.splitTextToSize(textoLimpio, contentWidth);
        
        // Manejo de saltos de página automáticos dentro de una meditación larga
        lines.forEach(line => {
            if (y > pageHeight - 30) {
                // Pie de página antes de saltar
                doc.setFont("times", "italic");
                doc.setFontSize(10);
                doc.setTextColor(136, 136, 136);
                doc.text(`${pag.autor || "Chiara Lubich"} — Pag. ${pag.pagina || (index + 1)}`, pageWidth / 2, pageHeight - 15, { align: 'center' });
                
                doc.addPage();
                y = 30;
                doc.setFont("times", "normal");
                doc.setFontSize(13);
                doc.setTextColor(0, 0, 0);
            }
            doc.text(line, margin, y);
            y += 7;
        });

        // Pie de página final de la meditación
        doc.setFont("times", "italic");
        doc.setFontSize(10);
        doc.setTextColor(136, 136, 136);
        doc.text(`${pag.autor || "Chiara Lubich"} — Pag. ${pag.pagina || (index + 1)}`, pageWidth / 2, pageHeight - 15, { align: 'center' });
    });

    // Guardar
    doc.save(`${libroActual.titulo.replace(/\s+/g, '_')}.pdf`);
    
    if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function cambiarPaginaLibro(dir) {
    if (!libroActual) return;
    const nuevoIndice = indicePaginaLibro + dir;
    if (nuevoIndice >= 0 && nuevoIndice < libroActual.paginas.length) {
        indicePaginaLibro = nuevoIndice;
        actualizarPaginaLibro();
    }
}

function cerrarModalLibro() {
    const modal = document.getElementById('modalLibro');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Preview Estándar (PDF/Iframe)
function abrirPreview(googleId, titulo) {
  const modal = document.getElementById('modalPreview');
  const tit = document.getElementById('modalTitulo');
  const iframe = document.getElementById('modalIframe');
  const desc = document.getElementById('modalDescarga');
  
  if (tit) tit.textContent = titulo;
  if (iframe) iframe.src = `https://drive.google.com/file/d/${googleId}/preview`;
  if (desc) desc.href = `https://drive.google.com/uc?id=${googleId}&export=download`;
  
  if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
  }
}

function cerrarModal() {
  const modal = document.getElementById('modalPreview');
  const iframe = document.getElementById('modalIframe');
  if (modal) modal.style.display = 'none';
  if (iframe) iframe.src = '';
  document.body.style.overflow = 'auto';
}

function limpiarFiltros() {
  categoriaActual = 'todos';
  atributosActivos = [];
  document.querySelectorAll('.filtro_btn').forEach(btn => btn.classList.remove('active'));
  const btnTodos = document.querySelector('[data-categoria="todos"]');
  if (btnTodos) btnTodos.classList.add('active');
  document.querySelectorAll('.atributo_btn').forEach(btn => btn.classList.remove('active'));
  const bInput = document.getElementById('busquedaInput');
  if (bInput) bInput.value = '';
  seBusco = seFiltro = false;
  paginaActual = 1;
  aplicarFiltros();
}

function abrirFormularioGoogle() {
  window.open(GOOGLE_FORM_URL, '_blank');
}
