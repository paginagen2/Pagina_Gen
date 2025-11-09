// Variables globales
let firebaseDb = null;
let collection, getDocs, query, where;
let todosLosJuegos = [];

// Inicialización rápida
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎲 Iniciando juegos para encuentros...');
    detectarTema();
    configurarBusqueda();
    inicializarRapido();
});

// Inicialización rápida sin diagnósticos
async function inicializarRapido() {
    try {
        mostrarLoading();
        firebaseDb = await esperarFirebase();
        
        const { collection: col, getDocs: get, query: q, where: w } = 
            await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');
        
        collection = col;
        getDocs = get;
        query = q;
        where = w;
        
        await cargarJuegos();
        
    } catch (error) {
        console.error('❌ Error:', error);
        mostrarError('Error conectando con Firebase');
    }
}

// Esperar Firebase
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
            } else if (intentos++ > 30) {
                reject(new Error('Firebase no disponible'));
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// Cargar juegos desde Firebase
async function cargarJuegos() {
    try {
        const recursosRef = collection(firebaseDb, 'recursos');
        const q = query(
            recursosRef,
            where('categoria', '==', 'juegos'),
            where('estado', '==', 'publicado')
        );
        
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.size === 0) {
            mostrarSinDatos();
            return;
        }
        
        todosLosJuegos = [];
        querySnapshot.forEach((doc) => {
            todosLosJuegos.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Ordenar por fecha
        todosLosJuegos.sort((a, b) => {
            if (a.fechaCreacion && b.fechaCreacion) {
                const fechaA = a.fechaCreacion.toDate ? a.fechaCreacion.toDate() : new Date(a.fechaCreacion);
                const fechaB = b.fechaCreacion.toDate ? b.fechaCreacion.toDate() : new Date(b.fechaCreacion);
                return fechaB - fechaA;
            }
            return 0;
        });
        
        mostrarJuegos(todosLosJuegos);
        mostrarNotificacion(`✅ ${todosLosJuegos.length} juegos cargados`, 'success');
        
    } catch (error) {
        console.error('❌ Error cargando juegos:', error);
        mostrarError('Error cargando juegos');
    }
}

// Mostrar loading
function mostrarLoading() {
    const container = document.getElementById('juegosList');
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                <div style="font-size: 2.5rem; margin-bottom: 1rem; animation: pulse 1.5s infinite;">🔄</div>
                <h3>Cargando juegos...</h3>
            </div>
        `;
    }
}

// Mostrar juegos
function mostrarJuegos(juegos) {
    const container = document.getElementById('juegosList');
    
    const cards = juegos.map((juego, index) => `
        <div class="recurso-detail-card" data-index="${index}">
            <div class="card-header juegos">
                <div class="card-icon">🎲</div>
                <h3>${juego.titulo}</h3>
            </div>
            <div class="card-content">
                <p>${juego.descripcion}</p>
                <div class="recurso-meta">
                    <span class="duracion">⏱️ ${juego.duracion}</span>
                    <span class="participantes">👥 ${juego.participantes}</span>
                    <span style="background: rgba(255, 140, 0, 0.2); color: #FF8C00; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.8rem;">🔥 Firebase</span>
                </div>
                <div class="recurso-detail-item" onclick="abrirJuego(${index})">
                    <h4>🎯 Objetivo</h4>
                    <p>${juego.objetivo}</p>
                </div>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = cards;
}

// Configurar búsqueda
function configurarBusqueda() {
    const searchInput = document.getElementById('searchJuegos');
    if (searchInput) {
        searchInput.addEventListener('input', buscarJuegosAvanzado);
        console.log('✅ Búsqueda de juegos configurada');
    }
}

// Búsqueda avanzada
function buscarJuegosAvanzado() {
    const searchInput = document.getElementById('searchJuegos');
    if (!searchInput || todosLosJuegos.length === 0) return;
    
    const query = searchInput.value.toLowerCase().trim();
    
    if (query === '') {
        mostrarJuegos(todosLosJuegos);
        return;
    }
    
    const juegosFiltrados = todosLosJuegos.filter(juego => {
        const camposBusqueda = [
            juego.titulo || '',
            juego.descripcion || '',
            juego.objetivo || '',
            juego.duracion || '',
            juego.participantes || '',
            juego.autor || ''
        ];
        
        if (juego.materiales && Array.isArray(juego.materiales)) {
            camposBusqueda.push(...juego.materiales);
        }
        
        if (juego.pasos && Array.isArray(juego.pasos)) {
            camposBusqueda.push(...juego.pasos);
        }
        
        const textoCompleto = camposBusqueda.join(' ').toLowerCase();
        return textoCompleto.includes(query);
    });
    
    if (juegosFiltrados.length === 0) {
        mostrarSinResultados(query);
    } else {
        mostrarJuegos(juegosFiltrados);
    }
    
    console.log(`🔍 Búsqueda "${query}": ${juegosFiltrados.length} resultados`);
}

function buscarJuegos() {
    buscarJuegosAvanzado();
}

// Mostrar sin resultados
function mostrarSinResultados(query) {
    const container = document.getElementById('juegosList');
    container.innerHTML = `
        <div style="text-align: center; padding: 4rem; color: var(--text-muted);">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
            <h3>No se encontraron resultados</h3>
            <p>No hay juegos que coincidan con "<strong>${query}</strong>"</p>
            <button onclick="limpiarBusqueda()" style="margin-top: 1rem; padding: 0.8rem 1.5rem; background: var(--primary-color); color: white; border: none; border-radius: 8px; cursor: pointer;">
                🔄 Mostrar todos los juegos
            </button>
        </div>
    `;
}

function limpiarBusqueda() {
    const searchInput = document.getElementById('searchJuegos');
    if (searchInput) {
        searchInput.value = '';
    }
    mostrarJuegos(todosLosJuegos);
}

// Mostrar sin datos
function mostrarSinDatos() {
    const container = document.getElementById('juegosList');
    container.innerHTML = `
        <div style="text-align: center; padding: 4rem; color: var(--text-muted);">
            <div style="font-size: 3rem; margin-bottom: 1rem;">📭</div>
            <h3>No hay juegos publicados</h3>
            <p>Aún no se han publicado juegos en Firebase</p>
            <div style="margin-top: 2rem;">
                <a href="gen-animadores.html" style="padding: 0.8rem 1.5rem; background: var(--primary-color); color: white; border: none; border-radius: 8px; text-decoration: none; display: inline-block; margin-right: 1rem;">
                    ➕ Agregar juego
                </a>
                <a href="admin-recursos.html" style="padding: 0.8rem 1.5rem; background: var(--secondary-color); color: white; border: none; border-radius: 8px; text-decoration: none; display: inline-block;">
                    ⚙️ Administrar
                </a>
            </div>
        </div>
    `;
}

function mostrarError(mensaje) {
    const container = document.getElementById('juegosList');
    container.innerHTML = `
        <div style="text-align: center; color: var(--danger-color); padding: 4rem;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">❌</div>
            <h3>Error</h3>
            <p style="margin: 1rem 0;">${mensaje}</p>
            <button onclick="location.reload()" style="padding: 0.8rem 1.5rem; background: var(--primary-color); color: white; border: none; border-radius: 8px; cursor: pointer;">
                🔄 Recargar página
            </button>
        </div>
    `;
}

function abrirJuego(index) {
    if (!todosLosJuegos[index]) {
        mostrarNotificacion('Error: juego no encontrado', 'error');
        return;
    }
    
    const juego = todosLosJuegos[index];
    mostrarModalJuego(juego);
}

function mostrarModalJuego(juego) {
    const modal = document.getElementById('modalRecurso');
    const contenido = document.getElementById('contenidoRecurso');
    
    if (!modal || !contenido) return;
    
    contenido.innerHTML = `
        <div style="padding: 2rem;">
            <h2 style="color: var(--primary-color); margin-bottom: 1rem; font-size: 2rem;">
                ${juego.titulo} <span style="font-size: 1rem; color: #FF8C00;">🔥</span>
            </h2>
            
            <div style="background: #0f0f0f; padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem;">
                <p style="color: var(--text-muted); font-size: 1.1rem; margin-bottom: 1rem;">
                    ${juego.descripcion}
                </p>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                    <div>
                        <strong style="color: var(--accent-color);">⏱️ Duración:</strong><br>
                        <span style="color: var(--text-muted);">${juego.duracion}</span>
                    </div>
                    <div>
                        <strong style="color: var(--accent-color);">👥 Participantes:</strong><br>
                        <span style="color: var(--text-muted);">${juego.participantes}</span>
                    </div>
                </div>
                
                <div style="margin-bottom: 1.5rem;">
                    <strong style="color: var(--accent-color);">🎯 Objetivo:</strong><br>
                    <span style="color: var(--text-muted);">${juego.objetivo}</span>
                </div>
            </div>
            
            <div style="background: var(--card-bg); padding: 1.5rem; border-radius: 12px; margin-bottom: 2rem;">
                <h3 style="color: var(--primary-color); margin-bottom: 1rem;">📋 Materiales necesarios</h3>
                <ul style="color: var(--text-muted); margin-left: 1.5rem;">
                    ${(juego.materiales || []).map(material => `<li style="margin-bottom: 0.5rem;">${material}</li>`).join('') || '<li>No especificados</li>'}
                </ul>
            </div>
            
            <div style="background: var(--card-bg); padding: 1.5rem; border-radius: 12px;">
                <h3 style="color: var(--primary-color); margin-bottom: 1rem;">👣 Instrucciones</h3>
                <ol style="color: var(--text-muted); margin-left: 1.5rem;">
                    ${(juego.pasos || []).map(paso => `<li style="margin-bottom: 1rem; line-height: 1.5;">${paso}</li>`).join('') || '<li>No especificadas</li>'}
                </ol>
            </div>
            
            <div style="text-align: center; margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                <p style="color: var(--text-muted); font-style: italic;">
                    👤 ${juego.autor || 'Anónimo'} | 📅 ${formatearFecha(juego.fechaCreacion)}
                </p>
            </div>
        </div>
    `;
    
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
    notif.style.cssText = `
        position: fixed; top: 20px; right: 20px; background: ${colores[tipo]};
        color: white; padding: 1rem; border-radius: 8px; z-index: 10000;
    `;
    notif.textContent = mensaje;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 4000);
}

function detectarTema() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
    }
}

document.addEventListener('click', function(event) {
    const modal = document.getElementById('modalRecurso');
    if (event.target === modal) cerrarModal();
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') cerrarModal();
});

// Funciones globales
window.abrirJuego = abrirJuego;
window.cerrarModal = cerrarModal;
window.buscarJuegos = buscarJuegos;
window.limpiarBusqueda = limpiarBusqueda;

console.log('🎲 Juegos para encuentros cargados');