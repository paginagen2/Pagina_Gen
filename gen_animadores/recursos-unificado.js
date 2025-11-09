// Variables globales unificadas
let firebaseDb = null;
let collection, getDocs, addDoc, query, where, doc, updateDoc;
let todosLosRecursos = [];
let currentPage = '';

// Configuración por página
const pageConfig = {
    'gen-animadores': {
        categoria: 'all',
        containerId: null,
        showPreview: true
    },
    'dinamicas-grupales': {
        categoria: 'dinamicas',
        containerId: 'dinamicasList',
        searchId: 'searchDinamicas',
        icon: '👥',
        headerClass: 'dinamicas'
    },
    'juegos-encuentros': {
        categoria: 'juegos',
        containerId: 'juegosList',
        searchId: 'searchJuegos',
        icon: '🎲',
        headerClass: 'juegos'
    },
    'reflexiones-guiadas': {
        categoria: 'reflexiones',
        containerId: 'reflexionesList',
        searchId: 'searchReflexiones',
        icon: '🤔',
        headerClass: 'reflexiones'
    },
    'recursos-retiros': {
        categoria: 'retiros',
        containerId: 'retirosList',
        searchId: 'searchRetiros',
        icon: '⛰️',
        headerClass: 'retiros'
    }
};

// Inicialización unificada
document.addEventListener('DOMContentLoaded', function() {
    detectarPagina();
    detectarTema();
    configurarEventos();
    inicializarFirebase();
});

// Detectar qué página estamos visitando
function detectarPagina() {
    const url = window.location.pathname;
    if (url.includes('gen-animadores.html') || url.endsWith('gen-animadores')) {
        currentPage = 'gen-animadores';
    } else if (url.includes('dinamicas-grupales')) {
        currentPage = 'dinamicas-grupales';
    } else if (url.includes('juegos-encuentros')) {
        currentPage = 'juegos-encuentros';
    } else if (url.includes('reflexiones-guiadas')) {
        currentPage = 'reflexiones-guiadas';
    } else if (url.includes('recursos-retiros')) {
        currentPage = 'recursos-retiros';
    }
    console.log(`📄 Página detectada: ${currentPage}`);
}

// Inicializar Firebase de forma silenciosa
async function inicializarFirebase() {
    try {
        console.log('🔄 Esperando Firebase...');
        
        // Esperar a que Firebase esté disponible (máximo 5 segundos)
        firebaseDb = await esperarFirebase();
        
        // Usar las funciones globales que ya están disponibles
        if (window.firebaseUtils) {
            collection = window.firebaseUtils.collection;
            getDocs = window.firebaseUtils.getDocs;
            addDoc = window.firebaseUtils.addDoc;
            query = window.firebaseUtils.query;
            where = window.firebaseUtils.where;
            doc = window.firebaseUtils.doc;
            updateDoc = window.firebaseUtils.updateDoc;
            
            console.log('✅ Funciones Firebase cargadas para gen-animadores');
        } else {
            throw new Error('firebaseUtils no disponible');
        }
        
        // Cargar contenido según la página
        await cargarContenidoPorPagina();
        
    } catch (error) {
        console.error('❌ Error con Firebase:', error);
        mostrarContenidoLocal();
    }
}

// Esperar Firebase de forma más robusta
function esperarFirebase() {
    return new Promise((resolve, reject) => {
        if (window.firebaseDb) {
            console.log('✅ Firebase ya disponible');
            resolve(window.firebaseDb);
            return;
        }
        
        let intentos = 0;
        const maxIntentos = 50; // 5 segundos
        
        const check = () => {
            console.log(`🔍 Buscando Firebase... intento ${intentos + 1}/${maxIntentos}`);
            
            if (window.firebaseDb) {
                console.log('✅ Firebase encontrado!');
                resolve(window.firebaseDb);
            } else if (intentos++ >= maxIntentos) {
                console.error('❌ Firebase no disponible después de 5 segundos');
                reject(new Error('Firebase no disponible - timeout'));
            } else {
                setTimeout(check, 100);
            }
        };
        
        check();
    });
}

// Esperar Firebase de forma eficiente
function esperarFirebase() {
    return new Promise((resolve, reject) => {
        if (window.firebaseDb) {
            resolve(window.firebaseDb);
            return;
        }
        
        let intentos = 0;
        const check = () => {
            if (window.firebaseDb) {
                resolve(window.firebaseDb);
            } else if (intentos++ > 30) { // 3 segundos máximo
                reject(new Error('Firebase no disponible'));
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// Cargar contenido según la página actual
async function cargarContenidoPorPagina() {
    const config = pageConfig[currentPage];
    if (!config) return;

    if (currentPage === 'gen-animadores') {
        await cargarRecursosParaHome();
    } else {
        mostrarLoading(config.containerId);
        await cargarRecursosPorCategoria(config.categoria, config.containerId, config);
    }
}

// Cargar recursos para la página principal (gen-animadores) - SIN ÍNDICES
async function cargarRecursosParaHome() {
    try {
        const categorias = ['dinamicas', 'juegos', 'reflexiones', 'retiros'];
        const recursos = {};
        
        for (const categoria of categorias) {
            console.log(`🔄 Cargando ${categoria}...`);
            
            const recursosRef = collection(firebaseDb, 'recursos');
            // Consulta simple sin orderBy para evitar índices
            const q = query(
                recursosRef,
                where('categoria', '==', categoria),
                where('estado', '==', 'publicado')
            );
            
            const querySnapshot = await getDocs(q);
            recursos[categoria] = [];
            
            querySnapshot.forEach((docSnap) => {
                recursos[categoria].push({
                    id: docSnap.id,
                    ...docSnap.data()
                });
            });
            
            // Ordenar manualmente en el cliente
            recursos[categoria].sort((a, b) => {
                if (a.fechaCreacion && b.fechaCreacion) {
                    const fechaA = a.fechaCreacion.toDate ? a.fechaCreacion.toDate() : new Date(a.fechaCreacion);
                    const fechaB = b.fechaCreacion.toDate ? b.fechaCreacion.toDate() : new Date(b.fechaCreacion);
                    return fechaB - fechaA;
                }
                return 0;
            });
            
            console.log(`✅ ${categoria}: ${recursos[categoria].length} recursos`);
        }
        
        // Actualizar previews y contadores
        Object.keys(recursos).forEach(categoria => {
            actualizarPreview(categoria, recursos[categoria]);
            actualizarContador(categoria, recursos[categoria].length);
        });
        
        console.log('✅ Todos los recursos cargados para home');
        
    } catch (error) {
        console.error('❌ Error cargando recursos para home:', error);
        mostrarRecursosLocalesHome();
    }
}

// Cargar recursos por categoría para páginas específicas - SIN ÍNDICES
async function cargarRecursosPorCategoria(categoria, containerId, config) {
    try {
        console.log(`🔄 Cargando ${categoria} para página específica...`);
        
        const recursosRef = collection(firebaseDb, 'recursos');
        // Consulta simple sin orderBy
        const q = query(
            recursosRef,
            where('categoria', '==', categoria),
            where('estado', '==', 'publicado')
        );
        
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.size === 0) {
            console.log(`📭 No hay ${categoria} publicados`);
            mostrarSinDatos(containerId, categoria);
            return;
        }
        
        todosLosRecursos = [];
        querySnapshot.forEach((docSnap) => {
            todosLosRecursos.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });
        
        // Ordenar manualmente en el cliente
        todosLosRecursos.sort((a, b) => {
            if (a.fechaCreacion && b.fechaCreacion) {
                const fechaA = a.fechaCreacion.toDate ? a.fechaCreacion.toDate() : new Date(a.fechaCreacion);
                const fechaB = b.fechaCreacion.toDate ? b.fechaCreacion.toDate() : new Date(b.fechaCreacion);
                return fechaB - fechaA;
            }
            return 0;
        });
        
        mostrarRecursos(todosLosRecursos, containerId, config);
        console.log(`✅ ${todosLosRecursos.length} recursos de ${categoria} cargados`);
        
    } catch (error) {
        console.error(`❌ Error cargando ${categoria}:`, error);
        mostrarError(containerId, `Error cargando ${categoria}`);
    }
}

// Mostrar contenido local cuando falla Firebase
function mostrarContenidoLocal() {
    console.log('📦 Usando contenido local');
    if (currentPage === 'gen-animadores') {
        mostrarRecursosLocalesHome();
    } else {
        const config = pageConfig[currentPage];
        if (config) {
            mostrarSinDatos(config.containerId, config.categoria);
        }
    }
}

// Mostrar recursos en las páginas específicas
function mostrarRecursos(recursos, containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const cards = recursos.map((recurso, index) => `
        <div class="recurso-detail-card" data-index="${index}">
            <div class="card-header ${config.headerClass}">
                <div class="card-icon">${config.icon}</div>
                <h3>${recurso.titulo}</h3>
            </div>
            <div class="card-content">
                <p>${recurso.descripcion}</p>
                <div class="recurso-meta">
                    <span class="duracion">⏱️ ${recurso.duracion}</span>
                    <span class="participantes">👥 ${recurso.participantes}</span>
                    <span class="firebase-badge">🔥 Firebase</span>
                </div>
                <div class="recurso-detail-item" onclick="abrirRecurso(${index})">
                    <h4>🎯 Objetivo</h4>
                    <p>${recurso.objetivo}</p>
                </div>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = cards;
}

// Actualizar preview para gen-animadores
function actualizarPreview(categoria, recursos) {
    const container = document.getElementById(`preview-${categoria}`);
    if (!container || recursos.length === 0) {
        if (container) {
            container.innerHTML = '<div class="loading">No hay recursos disponibles</div>';
        }
        return;
    }

    const previewItem = recursos[0]; // Solo mostrar 1 recurso
    container.innerHTML = `
        <div class="recurso-item" onclick="irAPagina('${categoria}')">
            <h4>${previewItem.titulo}</h4>
            <p>${previewItem.descripcion}</p>
            <span class="duracion">⏱️ ${previewItem.duracion}</span>
            <span class="firebase-badge">🔥</span>
        </div>
    `;
}

// Función para ir a páginas específicas desde preview
function irAPagina(categoria) {
    const paginas = {
        'dinamicas': 'dinamicas-grupales.html',
        'juegos': 'juegos-encuentros.html',
        'reflexiones': 'reflexiones-guiadas.html',
        'retiros': 'recursos-retiros.html'
    };
    
    if (paginas[categoria]) {
        window.location.href = paginas[categoria];
    }
}

// Actualizar contador para gen-animadores
function actualizarContador(categoria, count) {
    const counter = document.getElementById(`count-${categoria}`);
    if (counter) {
        counter.textContent = `${count} recursos`;
        if (count > 0) {
            counter.style.background = 'rgba(255, 140, 0, 0.2)';
            counter.style.border = '1px solid #FF8C00';
        }
    }
}

// Configurar eventos globales
function configurarEventos() {
    // Configurar búsqueda según la página
    const config = pageConfig[currentPage];
    if (config && config.searchId) {
        const searchInput = document.getElementById(config.searchId);
        if (searchInput) {
            searchInput.addEventListener('input', buscarRecursosAvanzado);
        }
    }
    
    // Configurar formulario para gen-animadores
    if (currentPage === 'gen-animadores') {
        const form = document.getElementById('formNuevaDinamica');
        if (form) {
            form.addEventListener('submit', guardarNuevaDinamica);
        }
    }
    
    // Event listeners globales
    document.addEventListener('click', function(event) {
        const modal = document.getElementById('modalRecurso');
        if (event.target === modal) cerrarModal();
        
        const modalAgregar = document.getElementById('modalAgregar');
        if (event.target === modalAgregar) cerrarModalAgregar();
    });
    
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            cerrarModal();
            cerrarModalAgregar();
        }
    });
}

// Búsqueda avanzada unificada
function buscarRecursosAvanzado() {
    const config = pageConfig[currentPage];
    if (!config || !config.searchId) return;
    
    const searchInput = document.getElementById(config.searchId);
    if (!searchInput || todosLosRecursos.length === 0) return;
    
    const query = searchInput.value.toLowerCase().trim();
    
    if (query === '') {
        mostrarRecursos(todosLosRecursos, config.containerId, config);
        return;
    }
    
    const recursosFiltrados = todosLosRecursos.filter(recurso => {
        const camposBusqueda = [
            recurso.titulo || '',
            recurso.descripcion || '',
            recurso.objetivo || '',
            recurso.duracion || '',
            recurso.participantes || '',
            recurso.autor || ''
        ];
        
        if (recurso.materiales && Array.isArray(recurso.materiales)) {
            camposBusqueda.push(...recurso.materiales);
        }
        
        if (recurso.pasos && Array.isArray(recurso.pasos)) {
            camposBusqueda.push(...recurso.pasos);
        }
        
        const textoCompleto = camposBusqueda.join(' ').toLowerCase();
        return textoCompleto.includes(query);
    });
    
    if (recursosFiltrados.length === 0) {
        mostrarSinResultados(config.containerId, query);
    } else {
        mostrarRecursos(recursosFiltrados, config.containerId, config);
    }
}

// Abrir recurso (unificado)
function abrirRecurso(index) {
    const recurso = todosLosRecursos[index];
    
    if (!recurso) {
        mostrarNotificacion('Recurso no encontrado', 'error');
        return;
    }
    
    mostrarModalRecurso(recurso);
}

// Modal unificado
function mostrarModalRecurso(recurso) {
    const modal = document.getElementById('modalRecurso');
    const contenido = document.getElementById('contenidoRecurso');
    
    if (!modal || !contenido) return;
    
    let programaHtml = '';
    if (recurso.programa && typeof recurso.programa === 'object') {
        programaHtml = `
            <div class="modal-section">
                <h3>📅 Programa detallado</h3>
                ${Object.entries(recurso.programa).map(([dia, actividades]) => `
                    <div class="programa-dia">
                        <h4>${dia}:</h4>
                        <ul>
                            ${Array.isArray(actividades) ? actividades.map(actividad => `<li>${actividad}</li>`).join('') : `<li>${actividades}</li>`}
                        </ul>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    contenido.innerHTML = `
        <div class="modal-body">
            <h2>${recurso.titulo} <span class="firebase-indicator">🔥</span></h2>
            
            <div class="modal-section destacado">
                <p class="descripcion">${recurso.descripcion}</p>
                
                <div class="meta-grid">
                    <div class="meta-item">
                        <strong>⏱️ Duración:</strong><br>
                        <span>${recurso.duracion}</span>
                    </div>
                    <div class="meta-item">
                        <strong>👥 Participantes:</strong><br>
                        <span>${recurso.participantes}</span>
                    </div>
                </div>
                
                <div class="objetivo">
                    <strong>🎯 Objetivo:</strong><br>
                    <span>${recurso.objetivo}</span>
                </div>
            </div>
            
            <div class="modal-section">
                <h3>📋 Materiales necesarios</h3>
                <ul>
                    ${(recurso.materiales || []).map(material => `<li>${material}</li>`).join('') || '<li>No especificados</li>'}
                </ul>
            </div>
            
            ${programaHtml}
            
            <div class="modal-section">
                <h3>👣 ${recurso.categoria === 'retiros' ? 'Organización y pasos' : recurso.categoria === 'reflexiones' ? 'Guía de reflexión' : 'Pasos a seguir'}</h3>
                <ol>
                    ${(recurso.pasos || []).map(paso => `<li>${paso}</li>`).join('') || '<li>No especificados</li>'}
                </ol>
            </div>
            
            <div class="modal-footer">
                <p>👤 ${recurso.autor || 'Anónimo'} | 📅 ${formatearFecha(recurso.fechaCreacion)}</p>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Guardar nueva dinámica (para gen-animadores)
async function guardarNuevaDinamica(e) {
    e.preventDefault();
    
    if (!firebaseDb) {
        mostrarNotificacion('Firebase no está disponible', 'error');
        return;
    }

    const form = document.getElementById('formNuevaDinamica');
    const loading = document.getElementById('loadingAgregar');
    
    try {
        form.style.display = 'none';
        loading.style.display = 'block';
        
        const formData = new FormData(form);
        const nuevoDato = {
            categoria: formData.get('categoria'),
            titulo: formData.get('titulo'),
            descripcion: formData.get('descripcion'),
            duracion: formData.get('duracion'),
            participantes: formData.get('participantes'),
            objetivo: formData.get('objetivo'),
            materiales: formData.get('materiales').split('\n').filter(m => m.trim()),
            pasos: formData.get('pasos').split('\n').filter(p => p.trim()),
            autor: formData.get('autor'),
            email: formData.get('email'),
            fechaCreacion: new Date(),
            estado: 'pendiente',
            usuarioId: formData.get('usuarioId') || 'anonimo'
        };
        
        if (!nuevoDato.titulo || !nuevoDato.descripcion || !nuevoDato.autor || !nuevoDato.email) {
            throw new Error('Completa todos los campos requeridos');
        }
        
        // Añadir estado "pendiente" al nuevo recurso
nuevoDato.estado = "pendiente";
nuevoDato.usuarioId = auth.currentUser ? auth.currentUser.uid : "anonimo";
nuevoDato.fechaCreacion = new Date();
const docRef = await addDoc(collection(firebaseDb, 'recursos'), nuevoDato);
        
        mostrarNotificacion('🎉 ¡Recurso enviado! Será revisado antes de publicarse.', 'success');
        cerrarModalAgregar();
        
    } catch (error) {
        console.error('❌ Error guardando:', error);
        mostrarNotificacion('❌ Error al guardar: ' + error.message, 'error');
        form.style.display = 'grid';
        loading.style.display = 'none';
    }
}

// Funciones de UI
function mostrarLoading(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="loading-state">
                <div class="loading-icon">🔄</div>
                <h3>Cargando recursos...</h3>
            </div>
        `;
    }
}

function mostrarSinDatos(containerId, categoria) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No hay ${categoria} publicados</h3>
                <p>Aún no se han publicado recursos en esta categoría</p>
                <div class="empty-actions">
                    <a href="gen-animadores.html" class="btn-primary">➕ Agregar recurso</a>
                </div>
            </div>
        `;
    }
}

function mostrarSinResultados(containerId, query) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <h3>No se encontraron resultados</h3>
                <p>No hay recursos que coincidan con "<strong>${query}</strong>"</p>
                <button onclick="limpiarBusqueda()" class="btn-primary">🔄 Mostrar todos</button>
            </div>
        `;
    }
}

function mostrarError(containerId, mensaje) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">❌</div>
                <h3>Error</h3>
                <p>${mensaje}</p>
                <button onclick="location.reload()" class="btn-primary">🔄 Recargar página</button>
            </div>
        `;
    }
}

function mostrarRecursosLocalesHome() {
    console.log('📦 Mostrando recursos locales para home');
    // Datos locales de respaldo para gen-animadores
    const recursosLocales = {
        dinamicas: [{
            titulo: '🤝 Círculo de Confianza',
            descripcion: 'Dinámica para generar confianza y apertura en el grupo',
            duracion: '15-20 min'
        }],
        juegos: [{
            titulo: '🤲 Juegos Cooperativos',
            descripcion: 'Actividades donde todos ganan trabajando juntos',
            duracion: '20-30 min'
        }],
        reflexiones: [{
            titulo: '🪞 ¿Quién soy yo?',
            descripcion: 'Reflexión sobre la identidad y vocación personal',
            duracion: '30-40 min'
        }],
        retiros: [{
            titulo: '🏕️ Retiro de Fin de Semana',
            descripcion: 'Programa completo para 2 días y 1 noche',
            duracion: '48 horas'
        }]
    };
    
    Object.keys(recursosLocales).forEach(categoria => {
        actualizarPreview(categoria, recursosLocales[categoria]);
        actualizarContador(categoria, recursosLocales[categoria].length);
    });
}

// Funciones de modal
function mostrarFormularioAgregar() {
    if (!firebaseDb) {
        mostrarNotificacion('Firebase no disponible', 'error');
        return;
    }
    
    const modal = document.getElementById('modalAgregar');
    const form = document.getElementById('formNuevaDinamica');
    const loading = document.getElementById('loadingAgregar');
    
    form.reset();
    form.style.display = 'grid';
    loading.style.display = 'none';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function cerrarModal() {
    const modal = document.getElementById('modalRecurso');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

function cerrarModalAgregar() {
    const modal = document.getElementById('modalAgregar');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

function limpiarBusqueda() {
    const config = pageConfig[currentPage];
    if (config && config.searchId) {
        const searchInput = document.getElementById(config.searchId);
        if (searchInput) {
            searchInput.value = '';
            mostrarRecursos(todosLosRecursos, config.containerId, config);
        }
    }
}

// Funciones utilitarias
function formatearFecha(fecha) {
    if (!fecha) return 'Sin fecha';
    try {
        const date = fecha.toDate ? fecha.toDate() : new Date(fecha);
        return date.toLocaleDateString('es-ES');
    } catch (error) {
        return 'Fecha inválida';
    }
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const colores = { success: '#4CAF50', error: '#F44336', warning: '#FF9800', info: '#2196F3' };
    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.style.background = colores[tipo];
    notif.textContent = mensaje;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 4000);
}

function detectarTema() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
    }
    
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
        if (event.matches) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    });
}

// Funciones globales para compatibilidad
window.abrirRecurso = abrirRecurso;
window.cerrarModal = cerrarModal;
window.mostrarFormularioAgregar = mostrarFormularioAgregar;
window.cerrarModalAgregar = cerrarModalAgregar;
window.limpiarBusqueda = limpiarBusqueda;
window.buscarDinamicas = buscarRecursosAvanzado;
window.buscarJuegos = buscarRecursosAvanzado;
window.buscarReflexiones = buscarRecursosAvanzado;
window.buscarRetiros = buscarRecursosAvanzado;
window.irAPagina = irAPagina;

console.log('✅ Sistema de recursos unificado cargado');