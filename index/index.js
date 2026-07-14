// No importar Firebase aquí, usar el global de firebase-config.js

// Variables del carrusel de fotos
let carruselData = [];
let carruselCurrentIndex = 0;
let carruselInterval = null;
const REMOTE_HOME_DATA_URL = 'https://raw.githubusercontent.com/paginagen2/Pagina_Gen_2/main/datos/inicio.json';
const LOCAL_HOME_DATA_URL = 'datos/inicio.json';

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    setCurrentDate();
    setupCarruselEventListeners();
    setupEventListeners();
    loadDailyHomeData();
});

async function loadDailyHomeData() {
    const argentinaDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
    const sources = [
        `${REMOTE_HOME_DATA_URL}?fecha=${encodeURIComponent(argentinaDate)}`,
        LOCAL_HOME_DATA_URL
    ];

    for (const source of sources) {
        try {
            const response = await fetch(source, { cache: 'no-store' });
            if (!response.ok) throw new Error(`No se pudo leer inicio.json (${response.status})`);
            const data = await response.json();
            if (!data || data.schemaVersion !== 1) throw new Error('El formato de inicio.json no es válido');
            applyDailyHomeData(data);
            return;
        } catch (error) {
            console.warn(`No se pudo cargar el resumen diario desde ${source}:`, error);
        }
    }

    carruselData = [];
    renderizarCarrusel();
}

function applyDailyHomeData(data) {
    const heroPhrase = document.querySelector('.hero-banner p');
    if (heroPhrase && data.frase) heroPhrase.textContent = data.frase;

    const pasapalabraTitle = document.querySelector('.pasapalabra-title');
    const pasapalabraDate = document.getElementById('fechaHoy');
    if (pasapalabraTitle) pasapalabraTitle.textContent = data.pasapalabra?.titulo || 'No hay Pasapalabra publicado para hoy';
    if (pasapalabraDate && data.pasapalabra?.fecha) pasapalabraDate.textContent = formatearFechaLegible(data.pasapalabra.fecha);

    const meditationTitle = document.querySelector('.meditacion-title');
    const meditationDate = document.getElementById('fechaMeditacion');
    if (meditationTitle) meditationTitle.textContent = data.meditacion?.titulo || 'No hay meditación disponible';
    if (meditationDate && data.fechaGeneracion) {
        meditationDate.textContent = new Date(`${data.fechaGeneracion}T12:00:00`).toLocaleDateString('es-AR', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    const pdvContainer = document.getElementById('pdv-preview-container');
    const pdvQuote = document.getElementById('pdv-cita-index');
    const pdvMonth = document.getElementById('pdv-mes-index');
    if (pdvQuote) pdvQuote.textContent = data.palabraDeVida?.cita || 'Leé la Palabra de Vida de este mes';
    if (pdvMonth) pdvMonth.textContent = data.palabraDeVida?.mes || 'Sin fecha disponible';
    if (pdvContainer && data.palabraDeVida?.href) {
        pdvContainer.onclick = () => { window.location.href = data.palabraDeVida.href; };
    }

    const channelPreview = document.getElementById('canal-preview-text');
    if (channelPreview) {
        channelPreview.textContent = data.novedades?.[0]?.titulo || 'Abrí el canal para ver las novedades.';
    }

    document.documentElement.dataset.homeDataDate = data.fechaGeneracion || '';
    carruselData = Array.isArray(data.novedades) ? data.novedades : [];
    carruselCurrentIndex = 0;
    renderizarCarrusel();
    iniciarCarruselAutomatico();
}

// Inicializar página
function initializePage() {
    const db = window.firebaseDb;
    cargarCarrusel(db);
    cargarFraseAleatoria(db);
    cargarTituloPasapalabraHoy(db);
    cargarMeditacionHoy(db);
    cargarUltimaPdv(db);
    cargarCanalPreview(db);
}

async function cargarCanalPreview(db) {
    const text = document.getElementById('canal-preview-text');
    const subtitle = document.getElementById('canal-subtitulo');
    if (!text) return;
    try {
        const publicaciones = await cargarPublicacionesGeneralesVisibles(db);
        const toDate = value => value?.toDate ? value.toDate() : new Date(value);
        const general = publicaciones.sort((a, b) => toDate(b.fechaPublicacion) - toDate(a.fechaPublicacion))[0];
        if (general) {
            subtitle.textContent = 'Canal General';
            text.textContent = general.titulo || general.resumen || 'Nueva publicación';
        } else text.textContent = 'No hay novedades generales por el momento.';
    } catch (error) { console.warn('No se pudo cargar el resumen del canal:', error); text.textContent = 'Abrí el canal para ver las novedades.'; }
}

async function cargarPublicacionesGeneralesVisibles(db) {
    const { collection, query, where, orderBy, limit, getDocs } = window.firebaseUtils;
    const ref = collection(db, 'canal_publicaciones');
    const now = new Date();
    const results = await Promise.all([
        getDocs(query(ref, where('estado', '==', 'publicada'), where('rolesDestinatarios', '==', []), orderBy('fechaPublicacion', 'desc'), limit(30))),
        getDocs(query(ref, where('estado', '==', 'programada'), where('rolesDestinatarios', '==', []), where('fechaPublicacion', '<=', now), orderBy('fechaPublicacion', 'desc'), limit(30)))
    ]);
    const unique = new Map();
    results.forEach(snapshot => snapshot.docs.forEach(document => {
        unique.set(document.id, { id: document.id, ...document.data() });
    }));
    return [...unique.values()];
}

function mostrarErrorDeCarga() {
    const slidesContainer = document.getElementById('carrusel-slides');
    if (slidesContainer && !slidesContainer.children.length) {
        slidesContainer.innerHTML = '<p class="carrusel-placeholder">No se pudo actualizar el carrusel. Podés seguir navegando.</p>';
    }
}

// Cargar la última Palabra de Vida desde Firebase
async function cargarUltimaPdv(db) {
    const previewContainer = document.getElementById('pdv-preview-container');
    const citaElement = document.getElementById('pdv-cita-index');
    const mesElement = document.getElementById('pdv-mes-index');
    console.log('📖 Buscando última PdV...', { previewContainer, citaElement, mesElement });

    if (!citaElement || !mesElement) {
        console.warn('⚠️ No se encontraron elementos de PdV');
        return;
    }

    try {
        const { collection, query, orderBy, limit, getDocs } = window.firebaseUtils;
        
        const pdvRef = collection(db, 'pdv'); // Colección se llama 'pdv', no 'palabrasDeVida'
        const q = query(pdvRef, orderBy('fecha', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        
        console.log('📄 PdV encontrados:', querySnapshot.size);

        if (!querySnapshot.empty) {
            const ultimaPdv = querySnapshot.docs[0].data();
            console.log('✅ Última PdV:', ultimaPdv);
            const urlSlug = ultimaPdv.urlSlug || querySnapshot.docs[0].id;

            const textoPdv = ultimaPdv.citaPrincipal || ultimaPdv.titulo || '';
            citaElement.textContent = textoPdv.trim().length >= 10
                ? textoPdv
                : 'Leé la Palabra de Vida de este mes';
            mesElement.textContent = ultimaPdv.mes || '';
            
            if (previewContainer) {
                previewContainer.onclick = () => {
                    window.location.href = `pdv/pdv.html?id=${urlSlug}`;
                };
            }
        } else {
            console.log('❌ No hay PdV en la colección');
        }
    } catch (error) {
        console.error('❌ Error al cargar la última Palabra de Vida:', error);
    }
}

// Configurar fecha actual en pasapalabra
function setCurrentDate() {
    const dateElement = document.getElementById('fechaHoy');
    if (dateElement) {
        const today = new Date();
        const options = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric'
        };
        dateElement.textContent = today.toLocaleDateString('es-ES', options);
    }
}

// Cargar frase aleatoria desde Firebase
async function cargarFraseAleatoria(db) {
    const fraseElement = document.querySelector('.hero-banner p');
    console.log('🎯 Buscando frase aleatoria...', { fraseElement });
    
    if (!fraseElement) {
        console.warn('⚠️ No se encontró .hero-banner p');
        return;
    }
    
    const { collection, getDocs } = window.firebaseUtils;
    
    try {
        const querySnapshot = await getDocs(collection(db, 'frases'));
        console.log('📄 Frases encontradas:', querySnapshot.size);
        
        const frases = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.activa !== false) {
                frases.push(data);
            }
        });
        
        console.log('📜 Frases activas:', frases);
        
        if (frases.length > 0) {
            const fraseAleatoria = frases[Math.floor(Math.random() * frases.length)];
            console.log('✅ Frase aleatoria seleccionada:', fraseAleatoria);
            fraseElement.textContent = fraseAleatoria.frase || 'Jóvenes comprometidos en construir un mundo más unido';
        } else {
            fraseElement.textContent = 'Jóvenes comprometidos en construir un mundo más unido';
        }
    } catch (error) {
        console.error('❌ Error al cargar frase:', error);
        fraseElement.textContent = 'Jóvenes comprometidos en construir un mundo más unido';
    }
}

// Funciones auxiliares para pasapalabra
function parseFecha(fechaStr) {
    if (!fechaStr) return null;
    const partes = fechaStr.split('/');
    if (partes.length === 3) {
        const dia = parseInt(partes[0], 10);
        const mes = parseInt(partes[1], 10) - 1;
        const anio = parseInt(partes[2], 10);
        return new Date(anio, mes, dia);
    }
    return null;
}

function obtenerFechaHoy() {
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const anio = hoy.getFullYear();
    return `${dia}/${mes}/${anio}`;
}

function formatearFechaLegible(fechaStr) {
    const meses = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    
    const partes = fechaStr.split('/');
    if (partes.length === 3) {
        const dia = parseInt(partes[0], 10);
        const mes = parseInt(partes[1], 10) - 1;
        const anio = partes[2];
        return `${dia} de ${meses[mes]} de ${anio}`;
    }
    return fechaStr;
}

// Cargar título del pasapalabra de hoy
async function cargarTituloPasapalabraHoy(db) {
    const tituloElement = document.querySelector('.pasapalabra-title');
    console.log('🎯 Buscando pasapalabra...', { tituloElement });
    if (!tituloElement) {
        console.warn('⚠️ No se encontró .pasapalabra-title');
        return;
    }
    
    const { collection, query, where, getDocs } = window.firebaseUtils;
    
    try {
        const fechaHoy = obtenerFechaHoy();
        console.log('📅 Fecha de hoy para pasapalabra:', fechaHoy);
        
        const q = query(
            collection(db, 'pasapalabra'),
            where('estado', '==', 'publicado')
        );
        
        const querySnapshot = await getDocs(q);
        console.log('📄 Pasapalabras encontrados:', querySnapshot.size);
        
        let pasapalabraEncontrado = null;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            console.log('📄 Revisando pasapalabra:', data);
            if (data.fecha === fechaHoy) {
                pasapalabraEncontrado = data;
            }
        });

        if (pasapalabraEncontrado) {
            console.log('✅ Pasapalabra encontrado:', pasapalabraEncontrado);
            tituloElement.textContent = pasapalabraEncontrado.titulo || '...';
            // No hay elemento .pasapalabra-date en el HTML, así que lo omitimos
        } else {
            console.log('❌ No se encontró pasapalabra para hoy');
            tituloElement.textContent = '...';
        }
    } catch (error) {
        console.error('❌ Error al cargar pasapalabra de hoy:', error);
        tituloElement.textContent = 'Error al cargar';
    }
}

// Cargar meditación de hoy
async function cargarMeditacionHoy(db) {
    const tituloElement = document.querySelector('.meditacion-title');
    const fechaElement = document.getElementById('fechaMeditacion');
    console.log('🧘 Buscando meditación...', { tituloElement, fechaElement });
    
    if (!tituloElement) {
        console.warn('⚠️ No se encontró .meditacion-title');
        return;
    }
    
    const { collection, getDocs } = window.firebaseUtils;
    
    try {
        const querySnapshot = await getDocs(collection(db, 'meditaciones'));
        console.log('📄 Meditaciones encontradas:', querySnapshot.size);
        
        const meditaciones = [];
        
        querySnapshot.forEach((doc) => {
            meditaciones.push({ id: doc.id, ...doc.data() });
        });
        
        console.log('🧘 Meditaciones:', meditaciones);
        
        if (meditaciones.length > 0) {
            const hoy = new Date();
            const fechaBase = new Date(2024, 0, 1);
            const msPorDia = 24 * 60 * 60 * 1000;
            const diasTranscurridos = Math.floor((hoy - fechaBase) / msPorDia);

            // Determinar ciclo actual e índice
            const numeroDeCiclo = Math.floor(diasTranscurridos / meditaciones.length);
            const indiceEnCiclo = diasTranscurridos % meditaciones.length;

            // Asignar orden dinámico por ciclo
            const meditacionesConOrden = meditaciones.map(med => {
                let hash = 0;
                const semilla = med.id + numeroDeCiclo;
                for (let i = 0; i < semilla.length; i++) {
                    hash = ((hash << 5) - hash) + semilla.charCodeAt(i);
                    hash |= 0; 
                }
                return { ...med, ordenAleatorio: hash };
            });

            // Ordenar por el hash del ciclo
            meditacionesConOrden.sort((a, b) => a.ordenAleatorio - b.ordenAleatorio);

            const meditacionHoy = meditacionesConOrden[indiceEnCiclo];
            console.log('✅ Meditación de hoy:', meditacionHoy);
            
            tituloElement.textContent = meditacionHoy.titulo || 'Reflexión para hoy';
            if (fechaElement) {
                fechaElement.textContent = formatearFechaLegible(obtenerFechaHoy());
            }
        } else {
            tituloElement.textContent = 'Sin meditaciones registradas';
        }
    } catch (error) {
        console.error('❌ Error al cargar meditación:', error);
        tituloElement.textContent = 'Error al cargar';
    }
}

// Event listeners
function setupEventListeners() {
    setupThemeDetection();
}

// Detectar tema del sistema
function setupThemeDetection() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    updateTheme(mediaQuery.matches);
    mediaQuery.addEventListener('change', (e) => {
        updateTheme(e.matches);
    });
}

// Actualizar tema
function updateTheme(isDark) {
    if (isDark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}

// Limpiar intervalos al salir de la página
window.addEventListener('beforeunload', () => {
    if (carruselInterval) clearInterval(carruselInterval);
});

// Funciones del carrusel de fotos
async function cargarCarrusel(db) {
    try {
        const { collection, query, orderBy, getDocs } = window.firebaseUtils;
        const [legacyResult, channelResult] = await Promise.allSettled([
            getDocs(query(collection(db, 'carrusel'), orderBy('createdAt', 'desc'))),
            cargarPublicacionesGeneralesVisibles(db)
        ]);
        carruselData = legacyResult.status === 'fulfilled'
            ? legacyResult.value.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            : [];
        // El carrusel de Inicio es público: solo muestra actividades generales.
        // Las publicaciones de zona se ven filtradas dentro del Canal.
        if (channelResult.status === 'fulfilled') {
            channelResult.value.filter(post => post.destacarEnCarrusel).forEach(post => {
                carruselData.unshift({ ...post, fotoUrl: post.imagenUrl, descripcion: post.resumen, href: `canal/canal.html#${post.id}` });
            });
        }

        renderizarCarrusel();
        iniciarCarruselAutomatico();
    } catch (error) {
        console.error('❌ Error al cargar carrusel:', error);
        const slidesContainer = document.getElementById('carrusel-slides');
        if (slidesContainer) {
            slidesContainer.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--text-muted);">No hay fotos para mostrar</p>';
        }
    }
}

function renderizarCarrusel() {
    const slidesContainer = document.getElementById('carrusel-slides');
    const dotsContainer = document.getElementById('carrusel-dots');

    if (carruselData.length === 0) {
        slidesContainer.innerHTML = '<div class="carrusel-empty"><strong>Próximamente</strong><span>Las novedades de la comunidad aparecerán en este espacio.</span></div>';
        dotsContainer.innerHTML = '';
        document.getElementById('carrusel-prev')?.setAttribute('hidden', '');
        document.getElementById('carrusel-next')?.setAttribute('hidden', '');
        return;
    }

    document.getElementById('carrusel-prev')?.removeAttribute('hidden');
    document.getElementById('carrusel-next')?.removeAttribute('hidden');

    slidesContainer.replaceChildren(...carruselData.map((item, index) => {
        const slide = document.createElement('div');
        slide.className = `carrusel-slide ${item.fotoUrl ? '' : 'sin-imagen'}`;
        const destination = safeCarouselUrl(item.href);
        if (destination) {
            slide.style.cursor = 'pointer';
            slide.tabIndex = 0;
            slide.setAttribute('role', 'link');
            const open = () => { window.location.href = destination; };
            slide.addEventListener('click', open);
            slide.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
            });
        }

        const picture = safeCarouselUrl(item.fotoUrl);
        if (picture) {
            const media = document.createElement('div');
            media.className = 'carrusel-media';
            const image = document.createElement('img');
            image.src = picture;
            image.alt = item.titulo || '';
            image.loading = index === 0 ? 'eager' : 'lazy';
            image.decoding = 'async';
            media.appendChild(image);
            slide.appendChild(media);
        } else slide.classList.add('sin-imagen');

        const content = document.createElement('div');
        content.className = 'carrusel-slide-content';
        const kicker = document.createElement('span');
        kicker.className = 'news-kicker';
        kicker.textContent = 'Comunicación';
        content.appendChild(kicker);
        if (item.titulo) { const title = document.createElement('h3'); title.textContent = item.titulo; content.appendChild(title); }
        if (item.descripcion) { const description = document.createElement('p'); description.textContent = item.descripcion; content.appendChild(description); }
        slide.appendChild(content);
        return slide;
    }));

    slidesContainer.querySelectorAll('.carrusel-slide img').forEach(image => {
        image.addEventListener('error', () => {
            const slide = image.closest('.carrusel-slide');
            image.closest('.carrusel-media')?.remove();
            slide?.classList.add('sin-imagen');
        }, { once: true });
    });

    // Renderizar dots
    dotsContainer.innerHTML = carruselData.map((_, index) => `
        <button type="button" class="carrusel-dot ${index === carruselCurrentIndex ? 'active' : ''}" aria-label="Ver novedad ${index + 1}" onclick="goToCarruselSlide(${index})"></button>
    `).join('');

    actualizarCarruselPosition();
}

function safeCarouselUrl(value) {
    if (!value) return '';
    try {
        const url = new URL(value, document.baseURI);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_) {
        return '';
    }
}

function actualizarCarruselPosition() {
    const slidesContainer = document.getElementById('carrusel-slides');
    if (slidesContainer) {
        slidesContainer.style.transform = `translateX(-${carruselCurrentIndex * 100}%)`;
    }

    // Actualizar dots
    const dots = document.querySelectorAll('.carrusel-dot');
    dots.forEach((dot, index) => {
        if (index === carruselCurrentIndex) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
}

function changeCarruselSlide(direction) {
    if (carruselData.length === 0) return;

    carruselCurrentIndex = (carruselCurrentIndex + direction + carruselData.length) % carruselData.length;
    actualizarCarruselPosition();
    reiniciarCarruselAutomatico();
}

function goToCarruselSlide(index) {
    if (carruselData.length === 0 || index < 0 || index >= carruselData.length) return;

    carruselCurrentIndex = index;
    actualizarCarruselPosition();
    reiniciarCarruselAutomatico();
}

function iniciarCarruselAutomatico() {
    if (carruselInterval) clearInterval(carruselInterval);
    if (carruselData.length > 1) {
        carruselInterval = setInterval(() => {
            changeCarruselSlide(1);
        }, 5000);
    }
}

function reiniciarCarruselAutomatico() {
    iniciarCarruselAutomatico();
}

function setupCarruselEventListeners() {
    const prevBtn = document.getElementById('carrusel-prev');
    const nextBtn = document.getElementById('carrusel-next');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => changeCarruselSlide(-1));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => changeCarruselSlide(1));
    }
}

// Funciones globales para HTML
window.goToCarruselSlide = goToCarruselSlide;

console.log('✅ Index optimizado cargado correctamente');
