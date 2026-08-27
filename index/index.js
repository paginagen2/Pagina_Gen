// No importar Firebase aquí, usar el global de firebase-config.js

// Variables del carrusel de fotos
let carruselData = [];
let carruselCurrentIndex = 0;
let carruselInterval = null;
let carruselPointerInside = false;
let carruselFocusInside = false;
let channelRefreshVersion = 0;
let channelAudienceKey = '';
const carruselReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
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

function channelPublicationUrl(item = {}) {
    return item.id ? `canal/publicacion.html?id=${encodeURIComponent(item.id)}` : (item.href || 'canal/canal.html');
}

// Inicialización
document.addEventListener('DOMContentLoaded', async function() {
    setCurrentDate();
    setupCarruselEventListeners();
    setupEventListeners();
    let loadedCurrentContent = await loadDailyHomeData();
    if (!loadedCurrentContent) loadedCurrentContent = await loadHomeFromStaticCatalogs();
    // Si el resumen o los catálogos ya resolvieron el contenido diario, no
    // repetir esas lecturas en Firebase ni permitir que un error lo reemplace.
    await loadHomeFromFirebase({ refreshDailyContent: !loadedCurrentContent });
});

window.addEventListener('gen:android-update', event => {
    applyAndroidUpdateNews(event.detail);
});

window.addEventListener('gen:profile-updated', event => {
    const roles = window.genExpandRoles
        ? window.genExpandRoles(event.detail?.roles || [])
        : (event.detail?.roles || []);
    refreshIndexChannel(roles, { force: true });
});

window.addEventListener('gen:auth-changed', event => {
    if (!event.detail?.user) refreshIndexChannel([], { force: true });
});

async function loadHomeFromFirebase({ refreshDailyContent = true } = {}) {
    try {
        if (window.firebaseReady) await window.firebaseReady;
        if (window.firebaseDb && window.firebaseUtils) await initializePage({ refreshDailyContent });
    } catch (error) {
        console.warn('No se pudo actualizar el Inicio desde Firebase:', error);
    }
}

async function loadDailyHomeData() {
    const argentinaDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
    const localSource = {
        name: 'daily-local',
        url: `${LOCAL_HOME_DATA_URL}?fecha=${encodeURIComponent(argentinaDate)}`
    };
    const remoteSource = {
        name: 'daily-remote',
        url: `${REMOTE_HOME_DATA_URL}?fecha=${encodeURIComponent(argentinaDate)}`
    };
    const isNativeApp = Boolean(window.Capacitor?.isNativePlatform?.());
    const sources = isNativeApp ? [remoteSource, localSource] : [localSource, remoteSource];

    for (const source of sources) {
        try {
            let response = await fetch(source.url, { cache: 'no-store' });
            if (!response.ok) throw new Error(`No se pudo leer inicio.json (${response.status})`);
            let data = await response.json();
            if (!data || data.schemaVersion !== 1) throw new Error('El formato de inicio.json no es válido');
            // Algunos WebView de Android pueden conservar temporalmente la
            // respuesta de raw.githubusercontent.com pese a no-store. Si la
            // copia remota está fechada para otro día, reintentamos una sola
            // vez con una URL única antes de pasar a los catálogos.
            if (source.name === 'daily-remote' && data.fechaGeneracion !== argentinaDate) {
                const separator = source.url.includes('?') ? '&' : '?';
                response = await fetch(`${source.url}${separator}actualizar=${Date.now()}`, { cache: 'no-store' });
                if (response.ok) data = await response.json();
            }
            if (data.fechaGeneracion === argentinaDate) {
                applyDailyHomeData(data);
                document.documentElement.dataset.homeDataSource = source.name;
                return true;
            }
            console.warn(`Se descartó el resumen de ${source.url}: corresponde a ${data.fechaGeneracion || 'otra fecha'}.`);
        } catch (error) {
            console.warn(`No se pudo cargar el resumen diario desde ${source.url}:`, error);
        }
    }
    return false;
}

function argentinaToday() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
    }, {});
    return {
        iso: `${parts.year}-${parts.month}-${parts.day}`,
        firestore: `${parts.day}/${parts.month}/${parts.year}`
    };
}

function catalogDate(value) {
    if (value && typeof value === 'object' && Number.isFinite(Number(value._seconds))) {
        return new Date(Number(value._seconds) * 1000);
    }
    return homeDate(value);
}

function selectCatalogMeditation(items, today) {
    if (!items.length) return null;
    const start = new Date('2024-01-01T00:00:00-03:00');
    const current = new Date(`${today.iso}T00:00:00-03:00`);
    const elapsedDays = Math.floor((current - start) / 86400000);
    const cycle = Math.floor(elapsedDays / items.length);
    const index = ((elapsedDays % items.length) + items.length) % items.length;
    return items.map(item => {
        let hash = 0;
        const seed = `${item.id}${cycle}`;
        for (let position = 0; position < seed.length; position += 1) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(position);
            hash |= 0;
        }
        return { ...item, dailyOrder: hash };
    }).sort((a, b) => a.dailyOrder - b.dailyOrder)[index];
}

async function loadExactCurrentPasapalabra(dateValue) {
    try {
        if (window.firebaseReady) await window.firebaseReady;
        if (!window.firebaseDb || !window.firebaseUtils) return null;
        const { collection, query, where, limit, getDocs } = window.firebaseUtils;
        const snapshot = await getDocs(query(
            collection(window.firebaseDb, 'pasapalabra'),
            where('estado', '==', 'publicado'),
            where('fecha', '==', dateValue),
            limit(1)
        ));
        const documentSnapshot = snapshot.docs[0];
        return documentSnapshot ? { id: documentSnapshot.id, ...documentSnapshot.data() } : null;
    } catch (error) {
        console.warn('No se pudo consultar el Pasapalabra exacto del día:', error);
        return null;
    }
}

async function loadHomeFromStaticCatalogs() {
    const paths = ['meditaciones', 'pasapalabra', 'pdv'];
    try {
        const catalogs = await Promise.all(paths.map(async name => {
            const response = await fetch(`datos/sincronizacion/${name}.json`, { cache: 'no-store' });
            if (!response.ok) throw new Error(`${name}: ${response.status}`);
            const data = await response.json();
            if (data.schemaVersion !== 1 || !Array.isArray(data.items)) throw new Error(`${name}: formato inválido`);
            return data.items;
        }));
        const [meditations, pasapalabras, pdvs] = catalogs;
        const today = argentinaToday();
        const now = new Date();
        const meditation = selectCatalogMeditation(meditations.filter(item => item.Publico === true), today);
        const catalogPasapalabra = pasapalabras.find(item => item.estado === 'publicado' && item.fecha === today.firestore) || null;
        const pasapalabra = catalogPasapalabra || await loadExactCurrentPasapalabra(today.firestore);
        const pdv = pdvs
            .filter(item => item.version === 2 && ['publicado', 'programado'].includes(item.estado))
            .filter(item => catalogDate(item.fechaPublicacion)?.getTime() <= now.getTime())
            .sort((a, b) => String(b.periodo || '').localeCompare(String(a.periodo || ''))
                || (catalogDate(b.fechaPublicacion)?.getTime() || 0) - (catalogDate(a.fechaPublicacion)?.getTime() || 0))[0] || null;
        applyDailyHomeData({
            schemaVersion: 1,
            fechaGeneracion: today.iso,
            generadoEn: now.toISOString(),
            frase: 'Que todos sean uno',
            pasapalabra: pasapalabra ? {
                id: pasapalabra.id, titulo: pasapalabra.titulo, fecha: pasapalabra.fecha,
                href: 'pasapalabra/pasapalabra_de_hoy.html'
            } : null,
            meditacion: meditation ? {
                id: meditation.id, titulo: meditation.titulo,
                href: 'meditacion/meditacion_diaria.html'
            } : null,
            palabraDeVida: pdv ? {
                id: pdv.id, mes: pdv.mes,
                cita: pdv.citaPrincipal || pdv.titulo,
                href: `pdv/pdv.html?id=${encodeURIComponent(pdv.id)}`
            } : null,
            canal: null,
            novedades: []
        });
        document.documentElement.dataset.homeDataSource = 'static-catalogs';
        return true;
    } catch (error) {
        console.warn('No se pudo construir el Inicio desde los catálogos estáticos:', error);
        showUnavailableCurrentContent();
        return false;
    }
}

function showUnavailableCurrentContent() {
    document.querySelector('.pasapalabra-title').textContent = 'Contenido de hoy en actualización';
    document.querySelector('.meditacion-title').textContent = 'Contenido de hoy en actualización';
    document.getElementById('pdv-cita-index').textContent = 'Contenido de hoy en actualización';
    document.getElementById('pdv-mes-index').textContent = 'Intentá nuevamente más tarde';
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
    carruselData = Array.isArray(data.novedades)
        ? data.novedades.filter(item => isNewsVisible(item)).map(item => ({ ...item, href: channelPublicationUrl(item) }))
        : [];
    applyAndroidUpdateNews(window.genAndroidUpdateState, false);
    carruselCurrentIndex = 0;
    renderizarCarrusel();
    iniciarCarruselAutomatico();
}

function applyAndroidUpdateNews(state, rerender = true) {
    carruselData = carruselData.filter(item => item.id !== 'android-app-update');
    if (!state?.updateAvailable || state.required) return;
    carruselData.unshift({
        id: 'android-app-update',
        titulo: state.title,
        descripcion: state.description,
        href: state.apkUrl,
        textoEnlace: state.actionText,
        etiquetaCarrusel: `Nueva versión ${state.latestVersionName || ''}`.trim()
    });
    carruselCurrentIndex = 0;
    if (rerender) {
        renderizarCarrusel();
        iniciarCarruselAutomatico();
    }
}

function setPdvDestination(href) {
    const previewContainer = document.getElementById('pdv-preview-container');
    if (!previewContainer || !href) return;

    previewContainer.href = href;
}

// Inicializar página
async function initializePage({ refreshDailyContent = true } = {}) {
    const db = window.firebaseDb;
    const roles = window.genAuthSession
        ? await window.genAuthSession.getRoles().catch(() => [])
        : [];
    refreshIndexChannel(roles);
    if (refreshDailyContent) {
        cargarFraseAleatoria(db);
        cargarTituloPasapalabraHoy(db);
        cargarMeditacionHoy(db);
        cargarUltimaPdv(db);
    }
}

async function refreshIndexChannel(roles = [], { force = false } = {}) {
    if (!window.firebaseDb || !window.firebaseUtils) return;
    const normalizedRoles = [...new Set((Array.isArray(roles) ? roles : [])
        .map(role => String(role || '').trim())
        .filter(Boolean))].sort();
    const audienceKey = normalizedRoles.join('|') || 'publico';
    if (!force && audienceKey === channelAudienceKey) return;

    channelAudienceKey = audienceKey;
    const refreshVersion = ++channelRefreshVersion;
    const channelPostsPromise = cargarPublicacionesGeneralesVisibles(window.firebaseDb, normalizedRoles);
    await Promise.allSettled([
        cargarCarrusel(window.firebaseDb, normalizedRoles, channelPostsPromise, refreshVersion),
        cargarCanalPreview(window.firebaseDb, channelPostsPromise, refreshVersion)
    ]);
}

async function cargarCanalPreview(db, channelPostsPromise = null, refreshVersion = channelRefreshVersion) {
    const text = document.getElementById('canal-banner-preview');
    const subtitle = document.getElementById('canal-subtitulo');
    if (!text) return;
    try {
        const publicaciones = await (channelPostsPromise || cargarPublicacionesGeneralesVisibles(db));
        if (refreshVersion !== channelRefreshVersion) return;
        const toDate = value => value?.toDate ? value.toDate() : new Date(value);
        const general = publicaciones.sort((a, b) => toDate(b.fechaPublicacion) - toDate(a.fechaPublicacion))[0];
        if (general) {
            subtitle.textContent = general.rolesDestinatarios?.length ? 'Canal de tus zonas' : 'Canal General';
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
        link.href = item.id ? channelPublicationUrl(item) : (item.href || 'canal/canal.html');
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
    results.filter(result => result.status === 'rejected').forEach(result => {
        console.warn('Una consulta zonal del carrusel no estuvo disponible:', result.reason);
    });
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
        const { collection, query, where, orderBy, limit, getDocs } = window.firebaseUtils;
        const pdvRef = collection(db, 'pdv');
        const now = new Date();
        const snapshot = await getDocs(query(
            pdvRef,
            where('version', '==', 2),
            where('fechaPublicacion', '<=', now),
            orderBy('fechaPublicacion', 'desc'),
            limit(1)
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
        dateElement.textContent = new Intl.DateTimeFormat('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }).format(new Date());
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
    
    const { collection, query, where, getDocs } = window.firebaseUtils;
    
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
            const dateElement = document.getElementById('fechaHoy');
            if (dateElement) dateElement.textContent = formatearFechaLegible(fechaHoy);
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
    
    const { collection, query, where, getDocs } = window.firebaseUtils;
    
    try {
        const querySnapshot = await getDocs(query(
            collection(db, 'meditaciones'),
            where('Publico', '==', true)
        ));
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
    detenerCarruselAutomatico();
});

// Funciones del carrusel de fotos
async function cargarCarrusel(db, roles = [], channelPostsPromise = null, refreshVersion = channelRefreshVersion) {
    try {
        const channelPosts = await (channelPostsPromise || cargarPublicacionesGeneralesVisibles(db, roles));
        if (refreshVersion !== channelRefreshVersion) return;
        carruselData = [];
        // Las generales se muestran a todos; las segmentadas solo llegan a
        // usuarios que tengan alguna de sus zonas o categorías.
        channelPosts.filter(post => post.destacarEnCarrusel && isNewsVisible(post)).forEach(post => {
            carruselData.push({ ...post, fotoUrl: post.imagenUrl, descripcion: post.resumen, href: channelPublicationUrl(post) });
        });

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
        const destination = safeCarouselUrl(item.href);
        const slide = document.createElement(destination ? 'a' : 'div');
        slide.className = 'carrusel-slide';
        if (destination) {
            slide.href = destination;
            slide.setAttribute('aria-label', `${item.titulo || 'Novedad'}. ${String(item.textoEnlace || 'Más información').trim()}`);
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
        } else {
            slide.appendChild(createCarouselFallback(item, index));
        }

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
            const action = document.createElement('span');
            action.className = 'carrusel-action';
            action.textContent = String(item.textoEnlace || 'Más información').trim().split(/\s+/).slice(0, 4).join(' ') || 'Más información';
            action.setAttribute('aria-hidden', 'true');
            content.appendChild(action);
        }
        slide.appendChild(content);
        return slide;
    }));

    slidesContainer.querySelectorAll('.carrusel-slide img').forEach(image => {
        image.addEventListener('error', () => {
            const slide = image.closest('.carrusel-slide');
            const media = image.closest('.carrusel-media');
            const itemIndex = [...slidesContainer.children].indexOf(slide);
            if (media && itemIndex >= 0) {
                media.replaceWith(createCarouselFallback(carruselData[itemIndex], itemIndex));
            }
        }, { once: true });
    });

    // Renderizar dots
    dotsContainer.innerHTML = carruselData.map((_, index) => `
        <button type="button" class="carrusel-dot ${index === carruselCurrentIndex ? 'active' : ''}" aria-label="Ver novedad ${index + 1}" onclick="goToCarruselSlide(${index})"></button>
    `).join('');

    actualizarCarruselPosition();
}

function createCarouselFallback(item = {}, index = 0) {
    const palettes = [
        ['#6d3bd1', '#241140', '#b987ff'],
        ['#285fc4', '#102548', '#75b8ff'],
        ['#8d386f', '#35152d', '#ff8fd1'],
        ['#176a69', '#0d3438', '#69ddd1'],
        ['#965322', '#3d2414', '#ffc274'],
        ['#4f4cbd', '#20204d', '#a7a5ff']
    ];
    const stableId = String(item.id || '').replace(/^legacy[-:]/, '');
    const seedText = `${stableId}|${item.titulo || ''}|${item.etiquetaCarrusel || item.categoria || ''}`;
    const seed = [...seedText].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 1);
    const palette = palettes[seed % palettes.length];
    const category = String(item.etiquetaCarrusel || item.categoria || '').toLowerCase();
    const symbol = category.includes('evento') ? '◇'
        : category.includes('comunica') ? '◎'
        : category.includes('formación') || category.includes('recurso') ? '✦'
        : category.includes('aviso') ? '!'
        : 'G2';

    const fallback = document.createElement('div');
    fallback.className = 'carrusel-media carrusel-generated-art';
    fallback.dataset.variant = String(seed % 6);
    fallback.style.setProperty('--art-primary', palette[0]);
    fallback.style.setProperty('--art-deep', palette[1]);
    fallback.style.setProperty('--art-accent', palette[2]);
    fallback.setAttribute('aria-hidden', 'true');
    fallback.innerHTML = `
        <span class="carrusel-art-orbit"></span>
        <span class="carrusel-art-shape"></span>
        <span class="carrusel-art-symbol">${symbol}</span>
    `;
    return fallback;
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
        [...slidesContainer.querySelectorAll('.carrusel-slide')].forEach((slide, index) => {
            const isCurrent = index === carruselCurrentIndex;
            slide.setAttribute('aria-hidden', String(!isCurrent));
            if (slide.matches('a')) slide.tabIndex = isCurrent ? 0 : -1;
        });
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
    detenerCarruselAutomatico();
    if (!puedeRotarCarrusel()) return;
    carruselInterval = setTimeout(() => {
        carruselInterval = null;
        carruselCurrentIndex = (carruselCurrentIndex + 1) % carruselData.length;
        actualizarCarruselPosition();
        iniciarCarruselAutomatico();
    }, 5000);
}

function reiniciarCarruselAutomatico() {
    iniciarCarruselAutomatico();
}

function detenerCarruselAutomatico() {
    if (!carruselInterval) return;
    clearTimeout(carruselInterval);
    carruselInterval = null;
}

function puedeRotarCarrusel() {
    return carruselData.length > 1
        && !carruselPointerInside
        && !carruselFocusInside
        && !document.hidden
        && !carruselReducedMotion.matches;
}

function setupCarruselEventListeners() {
    const prevBtn = document.getElementById('carrusel-prev');
    const nextBtn = document.getElementById('carrusel-next');
    const section = document.querySelector('.carrusel-section');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => changeCarruselSlide(-1));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => changeCarruselSlide(1));
    }
    if (section) {
        section.addEventListener('mouseenter', () => {
            carruselPointerInside = true;
            detenerCarruselAutomatico();
        });
        section.addEventListener('mouseleave', () => {
            carruselPointerInside = false;
            iniciarCarruselAutomatico();
        });
        section.addEventListener('focusin', () => {
            carruselFocusInside = true;
            detenerCarruselAutomatico();
        });
        section.addEventListener('focusout', event => {
            if (section.contains(event.relatedTarget)) return;
            carruselFocusInside = false;
            iniciarCarruselAutomatico();
        });
    }
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) detenerCarruselAutomatico();
        else iniciarCarruselAutomatico();
    });
    carruselReducedMotion.addEventListener('change', () => {
        if (carruselReducedMotion.matches) detenerCarruselAutomatico();
        else iniciarCarruselAutomatico();
    });
}

// Funciones globales para HTML
window.goToCarruselSlide = goToCarruselSlide;

console.log('✅ Index optimizado cargado correctamente');
