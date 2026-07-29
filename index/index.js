// No importar Firebase aquí, usar el global de firebase-config.js

// Variables del carrusel de fotos
let carruselData = [];
let carruselCurrentIndex = 0;
let carruselInterval = null;
const REMOTE_HOME_DATA_URL = 'https://raw.githubusercontent.com/paginagen2/Pagina_Gen/main/datos/inicio.json';
const LOCAL_HOME_DATA_URL = 'datos/inicio.json';

function homeDate(value) {
    if (!value) return null;
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function isNewsVisible(item, now = new Date()) {
    const expiry = homeDate(item?.fechaVencimiento);
    return !expiry || expiry > now;
}

// Inicialización
document.addEventListener('DOMContentLoaded', async function() {
    setCurrentDate();
    setupCarruselEventListeners();
    setupEventListeners();
    await loadDailyHomeData();
    try {
        if (window.firebaseReady) await window.firebaseReady;
        if (window.firebaseDb && window.firebaseUtils) await initializePage();
    } catch (error) {
        console.warn('No se pudo actualizar el Inicio desde Firebase:', error);
    }
});

window.addEventListener('gen:profile-updated', () => {
    if (window.firebaseDb && window.firebaseUtils) initializePage();
});

async function loadDailyHomeData() {
    const argentinaDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
    const sources = [
        `${LOCAL_HOME_DATA_URL}?fecha=${encodeURIComponent(argentinaDate)}`,
        `${REMOTE_HOME_DATA_URL}?fecha=${encodeURIComponent(argentinaDate)}`
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
    if (data.palabraDeVida?.href) setPdvDestination(data.palabraDeVida.href);

    const channelPreview = document.getElementById('canal-banner-preview');
    const latestNews = data.canal || data.novedades?.[0];
    if (channelPreview) {
        channelPreview.textContent = latestNews?.titulo || 'Abrí el canal para ver las novedades.';
    }
    updateChannelBanner(latestNews);

    document.documentElement.dataset.homeDataDate = data.fechaGeneracion || '';
    carruselData = Array.isArray(data.novedades) ? data.novedades.filter(item => isNewsVisible(item)) : [];
    carruselCurrentIndex = 0;
    renderizarCarrusel();
    iniciarCarruselAutomatico();
}

function setPdvDestination(href) {
    const previewContainer = document.getElementById('pdv-preview-container');
    if (!previewContainer || !href) return;

    previewContainer.href = href;
}

// Inicializar página
async function initializePage() {
    const db = window.firebaseDb;
    const roles = window.genAuthSession
        ? await window.genAuthSession.getRoles().catch(() => [])
        : [];
    cargarCarrusel(db, roles);
    cargarFraseAleatoria(db);
    cargarTituloPasapalabraHoy(db);
    cargarMeditacionHoy(db);
    cargarUltimaPdv(db);
    cargarCanalPreview(db);
}

async function cargarCanalPreview(db) {
    const text = document.getElementById('canal-banner-preview');
    const subtitle = document.getElementById('canal-subtitulo');
    if (!text) return;
    try {
        const publicaciones = await cargarPublicacionesGeneralesVisibles(db);
        const toDate = value => value?.toDate ? value.toDate() : new Date(value);
        const general = publicaciones.sort((a, b) => toDate(b.fechaPublicacion) - toDate(a.fechaPublicacion))[0];
        if (general) {
            subtitle.textContent = 'Canal General';
            text.textContent = general.titulo || general.resumen || 'Nueva publicación';
            updateChannelBanner(general);
        } else text.textContent = 'No hay novedades generales por el momento.';
    } catch (error) { console.warn('No se pudo cargar el resumen del canal:', error); text.textContent = 'Abrí el canal para ver las novedades.'; }
}

function updateChannelBanner(item) {
    if (!item) return;
    const link = document.getElementById('channel-banner-link');
    const date = document.getElementById('canal-preview-date');
    if (link) {
        link.href = item.href || (item.id ? `canal/canal.html#${encodeURIComponent(item.id)}` : 'canal/canal.html');
    }
    const rawDate = item.fechaPublicacion || item.createdAt;
    const parsedDate = rawDate?.toDate ? rawDate.toDate() : rawDate ? new Date(rawDate) : null;
    if (date && parsedDate && !Number.isNaN(parsedDate.getTime())) {
        date.dateTime = parsedDate.toISOString();
        date.textContent = parsedDate.toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }
}

async function cargarPublicacionesGeneralesVisibles(db, roles = []) {
    const { collection, query, where, orderBy, limit, getDocs } = window.firebaseUtils;
    const ref = collection(db, 'canal_publicaciones');
    const now = new Date();
    const requests = [
        getDocs(query(ref, where('estado', '==', 'publicada'), where('rolesDestinatarios', '==', []), orderBy('fechaPublicacion', 'desc'), limit(30))),
        getDocs(query(ref, where('estado', '==', 'programada'), where('rolesDestinatarios', '==', []), where('fechaPublicacion', '<=', now), orderBy('fechaPublicacion', 'desc'), limit(30)))
    ];
    for (let offset = 0; offset < roles.length; offset += 10) {
        const roleGroup = roles.slice(offset, offset + 10);
        requests.push(
            getDocs(query(ref, where('estado', '==', 'publicada'), where('rolesDestinatarios', 'array-contains-any', roleGroup), orderBy('fechaPublicacion', 'desc'), limit(30))),
            getDocs(query(ref, where('estado', '==', 'programada'), where('rolesDestinatarios', 'array-contains-any', roleGroup), where('fechaPublicacion', '<=', now), orderBy('fechaPublicacion', 'desc'), limit(30)))
        );
    }
    const results = await Promise.allSettled(requests);
    const unique = new Map();
    results.filter(result => result.status === 'fulfilled').forEach(result => result.value.docs.forEach(document => {
        unique.set(document.id, { id: document.id, ...document.data() });
    }));
    return [...unique.values()].filter(item => isNewsVisible(item, now));
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
        const { collection, query, where, orderBy, getDocs } = window.firebaseUtils;
        const pdvRef = collection(db, 'pdv');
        const now = new Date();
        const snapshot = await getDocs(query(
            pdvRef,
            where('fechaPublicacion', '<=', now),
            orderBy('fechaPublicacion', 'desc')
        ));
        const documents = snapshot.docs;
        
        console.log('📄 PdV encontrados:', documents.length);

        if (documents.length) {
            const ordered = documents
                .map(documentSnapshot => ({ id: documentSnapshot.id, ...documentSnapshot.data() }))
                .filter(item => item.version === 2)
                .filter(item => ['publicado', 'programado'].includes(item.estado))
                .filter(item => window.PdvModel
                    ? window.PdvModel.isAvailable(item, now)
                    : Boolean(homeDate(item.fechaPublicacion) && homeDate(item.fechaPublicacion) <= now))
                .sort((a, b) => String(b.periodo || '').localeCompare(String(a.periodo || '')));
            const ultimaPdv = ordered[0];
            if (!ultimaPdv) return;
            console.log('✅ Última PdV:', ultimaPdv);
            const urlSlug = ultimaPdv.id;

            const textoPdv = ultimaPdv.citaPrincipal || ultimaPdv.titulo || '';
            citaElement.textContent = textoPdv.trim().length >= 10
                ? textoPdv
                : 'Leé la Palabra de Vida de este mes';
            mesElement.textContent = ultimaPdv.mes || '';
            
            setPdvDestination(`pdv/pdv.html?id=${encodeURIComponent(urlSlug)}`);
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
async function cargarCarrusel(db, roles = []) {
    try {
        const { collection, query, orderBy, getDocs } = window.firebaseUtils;
        const [legacyResult, channelResult] = await Promise.allSettled([
            getDocs(query(collection(db, 'carrusel'), orderBy('createdAt', 'desc'))),
            cargarPublicacionesGeneralesVisibles(db, roles)
        ]);
        carruselData = legacyResult.status === 'fulfilled'
            ? legacyResult.value.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            : [];
        // Las generales se muestran a todos; las segmentadas solo llegan a
        // usuarios que tengan alguna de sus zonas o categorías.
        if (channelResult.status === 'fulfilled') {
            channelResult.value.filter(post => post.destacarEnCarrusel && isNewsVisible(post)).forEach(post => {
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
        kicker.textContent = item.etiquetaCarrusel || item.categoria || 'Novedad';
        content.appendChild(kicker);
        const eventDate = formatCarouselEventDate(item);
        if (eventDate) {
            const dateBadge = document.createElement('span');
            dateBadge.className = 'carrusel-event-date';
            dateBadge.textContent = `📅 ${eventDate}`;
            content.appendChild(dateBadge);
        }
        if (item.titulo) { const title = document.createElement('h3'); title.textContent = item.titulo; content.appendChild(title); }
        if (item.descripcion) { const description = document.createElement('p'); description.textContent = item.descripcion; content.appendChild(description); }
        if (destination) {
            const action = document.createElement('a');
            action.className = 'carrusel-action';
            action.href = destination;
            action.textContent = String(item.textoEnlace || 'Más información').trim().split(/\s+/).slice(0, 4).join(' ') || 'Más información';
            action.addEventListener('click', event => event.stopPropagation());
            content.appendChild(action);
        }
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

function formatCarouselEventDate(item) {
    if (!item.fechaEventoInicio) return '';
    const format = value => {
        const parts = String(value).split('-').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return '';
        return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('es-AR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };
    const start = format(item.fechaEventoInicio);
    const end = format(item.fechaEventoFin);
    if (!start) return '';
    return end ? `${start} — ${end}` : start;
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
