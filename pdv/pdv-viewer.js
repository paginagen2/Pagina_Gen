/**
 * PDV Viewer - Carga dinámica de Palabra de Vida desde Firebase
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Esperar a que Firebase esté listo
    if (!window.firebaseDb) {
        console.log('⏳ Esperando a Firebase...');
        const checkFirebase = setInterval(() => {
            if (window.firebaseDb) {
                clearInterval(checkFirebase);
                inicializarVisor();
            }
        }, 100);
    } else {
        inicializarVisor();
    }
});

async function inicializarVisor() {
    const params = new URLSearchParams(window.location.search);
    const pdvId = params.get('id');

    if (!pdvId) {
        mostrarError('No se especificó una Palabra de Vida.');
        return;
    }

    try {
        const db = window.firebaseDb;
        const { collection, query, where, getDocs, doc, getDoc } = window.firebaseUtils;

        let pdvData = null;

        // Intentar buscar por urlSlug primero
        const pdvRef = collection(db, 'pdv'); // Colección se llama 'pdv', no 'palabrasDeVida'
        const q = query(pdvRef, where('urlSlug', '==', pdvId));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            pdvData = querySnapshot.docs[0].data();
        } else {
            // Si no hay slug, intentar por ID de documento
            const docRef = doc(db, 'pdv', pdvId); // Colección se llama 'pdv', no 'palabrasDeVida'
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                pdvData = docSnap.data();
            }
        }

        if (pdvData) {
            renderizarPdv(pdvData);
        } else {
            mostrarError('La Palabra de Vida solicitada no existe.');
        }
    } catch (error) {
        console.error('Error al cargar la Palabra de Vida:', error);
        mostrarError('Hubo un error al cargar el contenido.');
    }
}

// Función global para manejar errores de audio externo
window.handleAudioError = function(audioElement) {
    const audioSection = audioElement.closest('.audio-section');
    if (audioSection) {
        const fallbackMsg = audioSection.querySelector('.audio-fallback-msg');
        if (fallbackMsg) {
            fallbackMsg.style.display = 'block';
            audioElement.style.display = 'none';
        }
    }
};

function renderizarPdv(data) {
    const container = document.getElementById('pdv-container');
    
    // Formatear contenido con saltos de línea
    const contenidoHTML = data.contenidoPrincipal ? data.contenidoPrincipal.split('\n').map(p => `<p>${p}</p>`).join('') : '';
    const reflexionHTML = data.reflexion ? data.reflexion.split('\n').map(p => `<p>${p}</p>`).join('') : '';

    // Actualizar título de la página
    document.title = `Palabra de Vida ${data.mes || ''} - Gen 2`;

    container.innerHTML = `
      <!-- Header -->
      <div class="palabra-header">
        <h1>Palabra de Vida</h1>
        <p class="fecha-mes">${data.mes || ''}</p>
      </div>

      <!-- Cita Principal -->
      <div class="cita-principal">
        <blockquote id="cita-texto">
          ${formatearCita(data.titulo)}
        </blockquote>
        <cite id="cita-referencia">${data.referencia || ''}</cite>
      </div>

      <!-- Audio Section -->
      ${data.audioUrl ? `
      <div class="audio-section">
        <h3>Escuchar Palabra de Vida</h3>
        <audio controls class="audio-player" onerror="window.handleAudioError(this)">
          <source src="${data.audioUrl}" type="audio/mpeg">
          Tu navegador no soporta el elemento de audio.
        </audio>
        <div class="audio-fallback-msg" style="display: none; color: #fff; margin-top: 10px;">
          <p>El reproductor no pudo cargar el audio automáticamente.</p>
          <a href="${data.audioUrl}" target="_blank" class="audio-fallback-link">Abrir audio en pestaña nueva ↗</a>
        </div>
      </div>
      ` : ''}

      <!-- Contenido -->
      <div class="palabra-contenido">
        
        <div class="desarrollo">
          ${contenidoHTML}
        </div>

        ${data.citaRepetida ? `
        <div class="cita-repetida">
          <em>${data.citaRepetida}</em>
        </div>
        ` : ''}

        <div class="testimonio">
          <h4>Experiencia</h4>
          ${reflexionHTML}
        </div>

        <!-- Autor -->
        <div class="autor">
          <p>${data.autor || 'Equipo de la Palabra de Vida'}</p>
        </div>
      </div>
    `;
}

function formatearCita(texto) {
    if (!texto) return '';
    // Reemplazar comillas latinas, puntos seguidos y otros separadores para mejorar la visualización
    return texto
        .replace(/\. /g, '.<br>')
        .replace(/«|»/g, '') // Quitamos las comillas ya que blockquote se encarga del estilo
        .replace(/; /g, ';<br>')
        .trim();
}

function mostrarError(mensaje) {
    const container = document.getElementById('pdv-container');
    container.innerHTML = `
        <div style="text-align: center; color: white; margin-top: 50px;">
            <h2>Lo sentimos</h2>
            <p>${mensaje}</p>
            <br>
            <a href="../index.html" style="color: var(--primary-color); text-decoration: none;">Volver al inicio</a>
        </div>
    `;
}
