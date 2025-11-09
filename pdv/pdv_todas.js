// ===================================
// PALABRA DE VIDA - JAVASCRIPT SIMPLIFICADO
// ===================================

// Base de datos de palabras de vida
const palabrasHistoricas = {
    'septiembre-2025': {
        titulo: 'Palabra de Vida',
        fecha: 'Septiembre 2025',
        cita: 'Alégrense conmigo, porque encontré la oveja que se me había perdido.',
        referencia: '(Lc 15, 6)'
    },
    'agosto-2025': {
        titulo: 'Palabra de Vida',
        fecha: 'Agosto 2025',
        cita: 'Vengan a mí todos los que están cansados y agobiados, que yo los aliviaré.',
        referencia: '(Mt 11, 28)'
    },
    'julio-2025': {
        titulo: 'Palabra de Vida',
        fecha: 'Julio 2025',
        cita: 'Hagan todo lo que él les diga.',
        referencia: '(Jn 2, 5)'
    },
    'junio-2025': {
        titulo: 'Palabra de Vida',
        fecha: 'Junio 2025',
        cita: 'Mi paz les doy; no se la doy como la da el mundo.',
        referencia: '(Jn 14, 27)'
    }
};

// ===================================
// INICIALIZACIÓN
// ===================================
document.addEventListener('DOMContentLoaded', function() {
    initializePalabraDeVida();
    
    // Configurar dark mode
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
});

function initializePalabraDeVida() {
    console.log('✅ Palabra de Vida inicializada');
    
    // Agregar efectos de hover a la navegación
    addNavigationEffects();
}

// ===================================
// NAVEGACIÓN ENTRE PALABRAS
// ===================================
function cargarPalabra(palabraId) {
    const palabra = palabrasHistoricas[palabraId];
    
    if (!palabra) {
        showNotification('❌ Palabra de vida no disponible', 'error');
        return;
    }
    
    // Mostrar loading
    showLoading();
    
    // Simular carga
    setTimeout(() => {
        updatePalabraContent(palabra);
        hideLoading();
        showNotification('✅ Palabra de vida cargada', 'success');
        
        // Scroll al top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 800);
}

function updatePalabraContent(palabra) {
    // Actualizar header
    const titleElement = document.querySelector('.palabra-header h1');
    const dateElement = document.querySelector('.fecha-mes');
    
    if (titleElement) titleElement.textContent = palabra.titulo;
    if (dateElement) dateElement.textContent = palabra.fecha;
}

// ===================================
// EFECTOS VISUALES
// ===================================
function addNavigationEffects() {
    // Efectos para navegación de palabras
    document.querySelectorAll('.palabra-nav-item').forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateX(12px) scale(1.02)';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateX(0) scale(1)';
        });
    });
}

// ===================================
// UTILIDADES
// ===================================
function showLoading() {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loadingOverlay';
    loadingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 3000;
        backdrop-filter: blur(3px);
    `;
    
    loadingOverlay.innerHTML = `
        <div style="text-align: center; color: white;">
            <div style="width: 50px; height: 50px; border: 4px solid rgba(43, 128, 226, 0.3); border-radius: 50%; border-top-color: #2b80e2; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div>
            <p style="font-size: 1.1rem; margin: 0;">Cargando Palabra de Vida...</p>
        </div>
    `;
    
    document.body.appendChild(loadingOverlay);
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            loadingOverlay.remove();
        }, 300);
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 2rem;
        right: 2rem;
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        color: var(--text-light);
        padding: 1rem 1.5rem;
        border-radius: 12px;
        z-index: 4000;
        max-width: 350px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        backdrop-filter: blur(10px);
        transform: translateX(400px);
        transition: transform 0.3s ease;
    `;
    
    // Colores según el tipo
    const colors = {
        success: '#3287cd',
        error: '#FF6B6B',
        warning: '#FFB347',
        info: '#2b80e2'
    };
    
    notification.style.borderLeftColor = colors[type] || colors.info;
    notification.style.borderLeftWidth = '4px';
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);
    
    setTimeout(() => {
        notification.style.transform = 'translateX(400px)';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Agregar CSS para animación de loading
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Hacer funciones globales accesibles
window.cargarPalabra = cargarPalabra;

console.log('✅ Palabra de Vida cargada correctamente');