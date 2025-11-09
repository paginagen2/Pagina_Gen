// Importar Firebase
import { DatabaseService } from '../aaglobal/firebase-config-cancionero.js';
// Variables globales
let cancionActual = null;
let tonoActual = 0;
let tamanoTexto = 2; // 0=pequeño, 1=normal, 2=grande, 3=extra-grande
let autoScrollActivo = false;
// Declarar velocidad de scroll y exponer a window
let velocidadScroll = (typeof window.velocidadScroll === 'number') ? window.velocidadScroll : 5;
window.velocidadScroll = velocidadScroll;
const FACTOR_PASO_PX = 0.05;
// Acumulador para pasos fraccionarios (evita que se “pare” con step < 1)
let acumuladoScroll = 0;

// Mapeo de acordes cromáticos para transposición
const acordesCromaticos = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎵 Cargando página de canción...');
    const urlParams = new URLSearchParams(window.location.search);
    const cancionId = urlParams.get('id');
    
    console.log('📋 ID de canción:', cancionId);
    
    if (cancionId) {
        cargarCancion(cancionId);
    } else {
        console.log('❌ No se proporcionó ID de canción');
        mostrarError();
    }
});

// Cargar canción desde Firebase
async function cargarCancion(id) {
    try {
        console.log('🔍 Buscando canción ID:', id);
        
        const canciones = await DatabaseService.getCanciones();
        console.log('📚 Canciones obtenidas:', canciones.length);
        
        cancionActual = canciones.find(c => c.id === id);
        
        if (cancionActual) {
            console.log('✅ Canción encontrada:', cancionActual.titulo);
            mostrarCancion();
            
            // Incrementar reproducciones
            await DatabaseService.incrementarReproducciones(id);
            console.log('👁️ Reproducciones incrementadas');
            
        } else {
            console.log('❌ Canción no encontrada en la lista');
            console.log('🔍 IDs disponibles:', canciones.map(c => c.id));
            mostrarError();
        }
        
    } catch (error) {
        console.error('💥 Error cargando canción:', error);
        mostrarError();
    }
}

// Mostrar información de la canción
function mostrarCancion() {
    try {
        console.log('🎨 Mostrando información de la canción...');
        
        // Actualizar título de la página
        document.title = `${cancionActual.titulo} - Cancionero Gen`;
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            pageTitle.textContent = `${cancionActual.titulo} - Cancionero Gen`;
        }
        
        // Información básica (IDs alineados al HTML)
        const elementos = {
        'headerTitulo': cancionActual.titulo,
        'headerArtista': cancionActual.artista || 'Desconocido',
        'cancionCategoria': getCategoriaTexto(cancionActual.categoria),
        'cancionVistas': (cancionActual.reproducciones || 0) + 1
        };
        Object.entries(elementos).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
        else console.warn(`⚠️ Elemento no encontrado: ${id}`);
        });
        
        mostrarLetraConAcordes();
        
        console.log('✅ Información mostrada correctamente');
        
    } catch (error) {
        console.error('💥 Error mostrando canción:', error);
        mostrarError();
    }
}

// Mostrar letra con acordes formateada
function mostrarLetraConAcordes() {
    const container = document.getElementById('letraContent');
    if (!container) {
        console.error('❌ Contenedor de letra no encontrado');
        return;
    }

    let letra = cancionActual.letra;

    // Transposición de tono si es necesario
    if (tonoActual !== 0) {
        letra = transponerLetra(letra, tonoActual);
    }

    // Convertir cifrado y renderizar acordes compactos
    const letraFormateada = letra.replace(/\[([^\]]+)\]/g, (match, acorde) => {
        const convertido = convertirAcordeACifrado(acorde, window.cifradoActual || 'american');
        return `<span class="acorde-compacto">${convertido}</span>`;
    });

    // Detectar secciones (Intro, Coro, etc.)
    const letraConSecciones = letraFormateada.replace(
        /^(Verso|Coro|Estribillo|Bridge|Intro|Outro|Pre-coro)(\s*\d*):/gim,
        '<div class="seccion-titulo" id="seccion-$1$2">$1$2</div>'
    );

    container.innerHTML = letraConSecciones;

    // Indicadores UI
    const tonos = ['-6', '-5', '-4', '-3', '-2', '-1', 'Original', '+1', '+2', '+3', '+4', '+5', '+6'];
    const tonoEl = document.getElementById('tonoActual');
    if (tonoEl) tonoEl.textContent = tonos[Math.max(-6, Math.min(6, tonoActual)) + 6];

    const velocidades = ['Muy lento', 'Lento', 'Lento+', 'Normal-', 'Normal', 'Normal+', 'Rápido-', 'Rápido', 'Rápido+', 'Muy rápido'];
    const velEl = document.getElementById('velocidadActual');
    if (velEl) velEl.textContent = velocidades[Math.max(1, Math.min(10, velocidadScroll)) - 1];

}


// Obtener texto de categoría con emoji
function getCategoriaTexto(categoria) {
    const categorias = {
        'misa': '⛪ Misa',
        'gen': '❤️ Gen',
        'fogon': '🔥 Fogón'
    };
    return categorias[categoria] || categoria;
}

// Funciones de control público (llamadas desde HTML)
window.cambiarTono = function(direccion) {
    tonoActual += direccion;
    
    // Limitar rango de transposición (-6 a +6 semitonos)
    if (tonoActual > 6) tonoActual = 6;
    if (tonoActual < -6) tonoActual = -6;
    
    mostrarLetraConAcordes();
    console.log(`🎵 Tono cambiado: ${tonoActual > 0 ? '+' : ''}${tonoActual}`);
};

window.cambiarTamano = function(direccion) {
    tamanoTexto += direccion;
    
    // Limitar rango de tamaños (0 a 3)
    if (tamanoTexto > 3) tamanoTexto = 3;
    if (tamanoTexto < 0) tamanoTexto = 0;
    
    const clases = ['texto-pequeno', 'texto-normal', 'texto-grande', 'texto-extra-grande'];
    const container = document.getElementById('letraContent');
    
    if (container) {
        // Remover clases anteriores
        clases.forEach(clase => container.classList.remove(clase));
        
        // Aplicar nueva clase de tamaño
        container.classList.add(clases[tamanoTexto]);
    }
    
    console.log(`📏 Tamaño cambiado: ${clases[tamanoTexto]}`);
};

window.toggleAutoScroll = function() {
    if (autoScrollActivo) {
        detenerAutoScroll();
    } else {
        iniciarAutoScroll();
    }
};

window.resetearConfiguracion = function() {
    console.log('🔄 Reseteando configuración...');
    
    // Resetear variables
    tonoActual = 0;
    tamanoTexto = 2;
    
    const scrollSpeedInput = document.getElementById('scrollSpeed');
    if (scrollSpeedInput) {
        scrollSpeedInput.value = 5;
    }
    
    // Detener auto-scroll
    detenerAutoScroll();
    
    // Actualizar letra
    mostrarLetraConAcordes();
    
    // Resetear tamaño de texto
    const container = document.getElementById('letraContent');
    if (container) {
        ['texto-pequeno', 'texto-normal', 'texto-grande', 'texto-extra-grande'].forEach(clase => {
            container.classList.remove(clase);
        });
        container.classList.add('texto-grande');
    }
    
    console.log('✅ Configuración reseteada');
};

window.imprimirCancion = function() {
    console.log('🖨️ Imprimiendo canción...');
    window.print();
};

// Función para mostrar información de acordes (expandible)
window.mostrarInfoAcorde = function(acorde) {
    console.log(`🎸 Info acorde: ${acorde}`);
};

// Mostrar modal de error
function mostrarError() {
    console.log('❌ Mostrando error de canción no encontrada');
    
    const container = document.getElementById('letraContent');
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 4rem; color: var(--text-muted);">
                <div style="font-size: 4rem; margin-bottom: 2rem;">❌</div>
                <h2 style="color: var(--text-light); margin-bottom: 1rem;">Canción no encontrada</h2>
                <p>La canción que buscas no existe o fue eliminada del cancionero.</p>
                <a href="cancionero.html" style="
                    background: var(--primary-color);
                    color: white;
                    padding: 12px 24px;
                    border-radius: 8px;
                    text-decoration: none;
                    display: inline-block;
                    margin-top: 2rem;
                    font-weight: 600;
                ">← Volver al cancionero</a>
            </div>
        `;
    }
    
    // Actualizar título también
    document.title = 'Canción no encontrada - Cancionero Gen';
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.textContent = 'Canción no encontrada - Cancionero Gen';
    }
    
    // Actualizar header info
    const elementos = {
        'cancionTitulo': 'Canción no encontrada',
        'cancionArtista': '-',
        'cancionCategoria': '-',
        'cancionVistas': '0'
    };
    
    Object.entries(elementos).forEach(([id, value]) => {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.textContent = value;
        }
    });
}

// Event listeners adicionales
document.addEventListener('keydown', function(e) {
    // Atajos de teclado
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case '+':
            case '=':
                e.preventDefault();
                cambiarTono(1);
                break;
            case '-':
                e.preventDefault();
                cambiarTono(-1);
                break;
            case '0':
                e.preventDefault();
                resetearConfiguracion();
                break;
        }
    }
    
    // Espaciadora para toggle auto-scroll
    if (e.key === ' ' && !e.target.matches('input, textarea, select')) {
        e.preventDefault();
        toggleAutoScroll();
    }
});

// Atajos de teclado básicos en el JS externo (si esta página lo usa):
document.addEventListener('keydown', function(e) {
    if (e.target.matches('input, textarea, select')) return;

    if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        window.toggleAutoScroll();
        return;
    }
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        window.scrollBy({ top: -60, behavior: 'auto' });
        return;
    }
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        window.scrollBy({ top: 60, behavior: 'auto' });
        return;
    }
    // Si esta página usa control de velocidad desde JS externo:
    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (typeof window.cambiarVelocidad === 'function') window.cambiarVelocidad(-1);
        return;
    }
    if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (typeof window.cambiarVelocidad === 'function') window.cambiarVelocidad(1);
        return;
    }
});

// Funciones de control público (llamadas desde HTML)
window.cambiarTono = function(direccion) {
    tonoActual += direccion;
    
    // Limitar rango de transposición (-6 a +6 semitonos)
    if (tonoActual > 6) tonoActual = 6;
    if (tonoActual < -6) tonoActual = -6;
    
    mostrarLetraConAcordes();
    console.log(`🎵 Tono cambiado: ${tonoActual > 0 ? '+' : ''}${tonoActual}`);
};

window.cambiarTamano = function(direccion) {
    tamanoTexto += direccion;
    
    // Limitar rango de tamaños (0 a 3)
    if (tamanoTexto > 3) tamanoTexto = 3;
    if (tamanoTexto < 0) tamanoTexto = 0;
    
    const clases = ['texto-pequeno', 'texto-normal', 'texto-grande', 'texto-extra-grande'];
    const container = document.getElementById('letraContent');
    
    if (container) {
        // Remover clases anteriores
        clases.forEach(clase => container.classList.remove(clase));
        
        // Aplicar nueva clase de tamaño
        container.classList.add(clases[tamanoTexto]);
    }
    
    console.log(`📏 Tamaño cambiado: ${clases[tamanoTexto]}`);
};

// Global scope (auto-scroll y velocidad dinámica)
window.toggleAutoScroll = function() {
    if (autoScrollActivo) {
        detenerAutoScroll();
    } else {
        iniciarAutoScroll();
    }
};

function iniciarAutoScroll() {
    const container = document.getElementById('letraContent');
    if (!container || autoScrollActivo) return;

    autoScrollActivo = true;
    acumuladoScroll = 0; // reset del acumulador

    // Calcular el paso en cada frame y acumular fracciones
    const tick = () => {
        // clamp al rango (1..10) y aplicar factor
        const stepFraccion = Math.max(1, Math.min(10, velocidadScroll)) * FACTOR_PASO_PX;

        // Acumula fracción y aplica solo píxeles enteros
        acumuladoScroll += stepFraccion;
        const pasoEntero = Math.floor(acumuladoScroll);
        if (pasoEntero > 0) {
            window.scrollBy(0, pasoEntero);
            acumuladoScroll -= pasoEntero;
        }

        if (autoScrollActivo) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const btn = document.getElementById('btnAutoScroll');
    if (btn) {
        btn.textContent = 'Auto Scroll: ON';
        btn.classList.add('active');
    }
}

function detenerAutoScroll() {
    if (!autoScrollActivo) return;
    autoScrollActivo = false;
    acumuladoScroll = 0; // limpiar acumulado al detener

    const btn = document.getElementById('btnAutoScroll');
    if (btn) {
        btn.textContent = 'Auto Scroll: OFF';
        btn.classList.remove('active');
    }
}


window.resetearConfiguracion = function() {
    console.log('🔄 Reseteando configuración...');
    detenerAutoScroll();

    const tonoEl = document.getElementById('tonoActual');
    if (tonoEl) tonoEl.textContent = 'Original';

    const velEl = document.getElementById('velocidadActual');
    const etiquetas = ['Muy lento', 'Lento', 'Lento+', 'Normal-', 'Normal', 'Normal+', 'Rápido-', 'Rápido', 'Rápido+', 'Muy rápido'];
    if (velEl) velEl.textContent = etiquetas[velocidadScroll - 1];

    mostrarLetraConAcordes();

    const scrollSpeedInput = document.getElementById('scrollSpeed');
    if (scrollSpeedInput) {
        scrollSpeedInput.value = 5;
    }
    
    // Detener auto-scroll
    detenerAutoScroll();
    
    // Actualizar letra
    mostrarLetraConAcordes();
    
    // Resetear tamaño de texto
    const container = document.getElementById('letraContent');
    if (container) {
        ['texto-pequeno', 'texto-normal', 'texto-grande', 'texto-extra-grande'].forEach(clase => {
            container.classList.remove(clase);
        });
        container.classList.add('texto-grande');
    }
    
    console.log('✅ Configuración reseteada');
};

window.imprimirCancion = function() {
    console.log('🖨️ Imprimiendo canción...');
    window.print();
};

// Función para mostrar información de acordes (expandible)
window.mostrarInfoAcorde = function(acorde) {
    console.log(`🎸 Info acorde: ${acorde}`);
};

// Transponer toda la letra
function transponerLetra(letra, semitonos) {
    return letra.replace(/\[([^\]]+)\]/g, (match, acorde) => {
        const acordeTranspuesto = transponerAcorde(acorde, semitonos);
        return `[${acordeTranspuesto}]`;
    });
}

function transponerAcorde(acorde, semitonos) {
  const original = acorde.trim();

  let m = original.match(/^(DO|RE|MI|FA|SOL|LA|SI)([#b])?/i);
  let estilo = 'spanish';
  let root = null;
  let accidental = '';
  let sufijo = '';

  if (m) {
    root = m[1].toUpperCase();
    accidental = m[2] || '';
    sufijo = original.slice(m[0].length);
  } else {
    m = original.match(/^(D|R|M|F|S|L)([#b])(O|E|I|A|OL|A|I)/i);
    if (m) {
      const mapaEsp = { D:'DO', R:'RE', M:'MI', F:'FA', S:'SOL', L:'LA' };
      root = mapaEsp[m[1].toUpperCase()];
      accidental = m[2];
      sufijo = original.slice(m[0].length);
      estilo = 'spanish';
    } else {
      m = original.match(/^([A-GH](?:#|b)?)/);
      if (!m) return original;
      root = m[1];
      sufijo = original.slice(root.length);
      estilo = /^[HB]/.test(root) ? 'european' : 'american';
    }
  }

  const toIndexSpanish = { DO:0, RE:2, MI:4, FA:5, SOL:7, LA:9, SI:11 };
  const namesSharps = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const namesFlats  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const spanishSharps = ['DO','DO#','RE','RE#','MI','FA','FA#','SOL','SOL#','LA','LA#','SI'];
  const spanishFlats  = ['DO','REb','RE','MIb','MI','FA','SOLb','SOL','LAb','LA','SIb','SI'];

  let idx;
  if (estilo === 'spanish') {
    idx = toIndexSpanish[root];
  } else {
    let rootCalc = root;
    if (rootCalc[0] === 'H') rootCalc = rootCalc.replace(/^H/, 'B'); // europeo H->B
    idx = namesSharps.indexOf(rootCalc);
    if (idx === -1) idx = namesFlats.indexOf(rootCalc);
    if (idx === -1) return original;
  }

  if (estilo === 'spanish') {
    if (accidental === '#') idx = (idx + 1) % 12;
    if (accidental === 'b') idx = (idx + 11) % 12;
  }

  const outIdx = (idx + semitonos + 12) % 12;

  let outRoot;
  if (estilo === 'spanish') {
    const preferFlats = accidental === 'b';
    outRoot = (preferFlats ? spanishFlats[outIdx] : spanishSharps[outIdx]);
  } else if (estilo === 'european') {
    const preferFlats = root.includes('b');
    let temp = (preferFlats ? namesFlats[outIdx] : namesSharps[outIdx]);
    if (temp === 'B') temp = 'H';
    if (temp === 'Bb') temp = 'B';
    outRoot = temp;
  } else {
    const preferFlats = root.includes('b');
    outRoot = (preferFlats ? namesFlats[outIdx] : namesSharps[outIdx]);
  }

  return outRoot + sufijo;
}

// Cambio de cifrado (botón C→Do)
window.cifradoActual = window.cifradoActual || 'american';
window.toggleCifrado = function () {
    window.cifradoActual = (window.cifradoActual === 'american') ? 'spanish' : 'american';
    const btn = document.getElementById('btnCifrado');
    if (btn) btn.textContent = (window.cifradoActual === 'american') ? 'C→Do' : 'Do→C';
    mostrarLetraConAcordes();
};

// Conversión de cifrado robusta (americano <-> español, soporta europeo H)
function convertirAcordeACifrado(acorde, cifradoDestino) {
    const original = acorde.trim();

    // Español estándar
    let m = original.match(/^(DO|RE|MI|FA|SOL|LA|SI)([#b])?(.*)$/i);
    if (m) {
        const rootEsp = m[1].toUpperCase();
        const accidental = m[2] || '';
        const sufijo = m[3] || '';
        if (cifradoDestino === 'spanish') return rootEsp + accidental + sufijo;
        const mapSA = { DO:'C', RE:'D', MI:'E', FA:'F', SOL:'G', LA:'A', SI:'B' };
        return (mapSA[rootEsp] || rootEsp) + accidental + sufijo;
    }

    // Español raro con accidental intercalado (D#O, SOLb...)
    m = original.match(/^(D|R|M|F|S|L)([#b])(O|E|I|A|OL|A|I)(.*)$/i);
    if (m) {
        const mapEsp = { D:'DO', R:'RE', M:'MI', F:'FA', S:'SOL', L:'LA' };
        const rootEsp = (mapEsp[m[1].toUpperCase()] || m[1].toUpperCase()) + m[2] + m[3].toUpperCase().replace('OL','OL');
        const sufijo = m[4] || '';
        if (cifradoDestino === 'spanish') return rootEsp + sufijo;
        const normalized = convertirAcordeACifrado(rootEsp, 'american');
        return normalized + sufijo;
    }

    // Americano/europeo (A–G/H)
    m = original.match(/^([A-GH](?:#|b)?)(.*)$/);
    if (m) {
        let root = m[1];
        const sufijo = m[2] || '';
        if (root[0] === 'H') root = root.replace(/^H/, 'B'); // europeo H -> B
        if (cifradoDestino === 'american') return root + sufijo;
        const mapAS = {
            'C':'DO','C#':'DO#','Db':'REb','D':'RE','D#':'RE#','Eb':'MIb','E':'MI',
            'F':'FA','F#':'FA#','Gb':'SOLb','G':'SOL','G#':'SOL#','Ab':'LAb',
            'A':'LA','A#':'LA#','Bb':'SIb','B':'SI'
        };
        return (mapAS[root] || root) + sufijo;
    }

    return original;
}

// Cleanup y logging
window.addEventListener('beforeunload', () => {
    console.log('👋 Saliendo de la página de canción');
});

console.log('🎸 Cancion.js cargado correctamente');

// Control de velocidad: botones +/- y actualización de label
window.cambiarVelocidad = function(direccion) {
    const min = 1, max = 10;
    const nueva = Math.max(min, Math.min(max, velocidadScroll + direccion));
    if (nueva === velocidadScroll) return;

    velocidadScroll = nueva;
    window.velocidadScroll = nueva;

    const etiquetas = ['Muy lento', 'Lento', 'Lento+', 'Normal-', 'Normal', 'Normal+', 'Rápido-', 'Rápido', 'Rápido+', 'Muy rápido'];
    const velEl = document.getElementById('velocidadActual');
    if (velEl) velEl.textContent = etiquetas[nueva - 1];
};
