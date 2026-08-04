let db;
let utils;
let auth;
let userRoles = [];
let posts = [];
let activeFilter = 'todo';
let loadTimer = null;
let scheduledRefresh = null;
let hasLoadedPosts = false;

const QUERY_LIMIT = 30;
// Firebase 9.22 admite hasta 10 valores en array-contains-any.
// Se crean varias consultas para no descartar roles adicionales del usuario.
const ROLE_QUERY_LIMIT = 10;

document.addEventListener('DOMContentLoaded', async () => {
    await waitForFirebase();
    if (!window.firebaseDb) {
        const fallbackLoaded = await loadDailyFallback();
        if (!fallbackLoaded) renderStatus('No se pudo conectar al Canal.');
        return;
    }

    db = window.firebaseDb;
    utils = window.firebaseUtils;
    auth = window.firebaseAuth;
    scheduleLoadPosts();

    utils.onAuthStateChanged(auth, async user => {
        try {
            userRoles = user && window.genAuthSession
                ? await window.genAuthSession.getRoles(user)
                : [];
        } catch (error) {
            console.warn('No se pudieron obtener los roles del usuario:', error);
            userRoles = [];
        }
        scheduleLoadPosts();
    });

    window.addEventListener('gen:profile-updated', event => {
        userRoles = window.genExpandRoles
            ? window.genExpandRoles(event.detail?.roles || [])
            : (event.detail?.roles || []);
        scheduleLoadPosts();
    });

    document.querySelectorAll('.canal-filter').forEach(button => button.addEventListener('click', () => {
        activeFilter = button.dataset.filter;
        document.querySelectorAll('.canal-filter').forEach(item => item.classList.toggle('active', item === button));
        renderPosts();
    }));
});

function scheduleLoadPosts() {
    clearTimeout(loadTimer);
    loadTimer = setTimeout(loadPosts, 50);
}

function waitForFirebase() {
    return new Promise(resolve => {
        const timer = setInterval(() => {
            if (window.firebaseDb && window.firebaseUtils && window.firebaseAuth) {
                clearInterval(timer);
                resolve();
            }
        }, 100);
        setTimeout(() => {
            clearInterval(timer);
            resolve();
        }, 20000);
    });
}

function buildAudienceQueries(base, estado, now) {
    const requests = [];
    const generalConstraints = [
        utils.where('estado', '==', estado),
        utils.where('rolesDestinatarios', '==', [])
    ];
    if (estado === 'programada') generalConstraints.push(utils.where('fechaPublicacion', '<=', now));
    generalConstraints.push(utils.orderBy('fechaPublicacion', 'desc'), utils.limit(QUERY_LIMIT));
    requests.push(utils.getDocs(utils.query(base, ...generalConstraints)));

    for (let start = 0; start < userRoles.length; start += ROLE_QUERY_LIMIT) {
        const roleGroup = userRoles.slice(start, start + ROLE_QUERY_LIMIT);
        const roleConstraints = [
            utils.where('estado', '==', estado),
            utils.where('rolesDestinatarios', 'array-contains-any', roleGroup)
        ];
        if (estado === 'programada') roleConstraints.push(utils.where('fechaPublicacion', '<=', now));
        roleConstraints.push(utils.orderBy('fechaPublicacion', 'desc'), utils.limit(QUERY_LIMIT));
        requests.push(utils.getDocs(utils.query(base, ...roleConstraints)));
    }
    return requests;
}

async function loadPosts() {
    // Solo mostrar la espera durante la primera carga. Las actualizaciones
    // automáticas posteriores mantienen el contenido actual en pantalla.
    if (!hasLoadedPosts) renderStatus('Cargando publicaciones...');
    try {
        const cacheKey = `canal-${[...userRoles].sort().join('-') || 'publico'}`;
        const guardados = await window.GenOffline?.getCollection(cacheKey).catch(() => null);
        const cachedVisiblePosts = guardados?.items?.filter(item => isPostVisible(item)) || [];
        if (cachedVisiblePosts.length && (!navigator.onLine || window.GenOffline.isFresh(guardados))) {
            posts = cachedVisiblePosts;
            hasLoadedPosts = true;
            renderPosts();
            return;
        }
        const base = utils.collection(db, 'canal_publicaciones');
        const now = new Date();
        const requests = [
            ...buildAudienceQueries(base, 'publicada', now),
            ...buildAudienceQueries(base, 'programada', now)
        ];
        const [queryResults, legacyResult] = await Promise.all([
            Promise.allSettled(requests),
            Promise.allSettled([utils.getDocs(utils.collection(db, 'carrusel'))])
        ]);
        const uniquePosts = new Map();
        const snapshots = queryResults
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);
        snapshots.forEach(snapshot => snapshot.docs.forEach(document => {
            uniquePosts.set(document.id, { id: document.id, ...document.data() });
        }));
        queryResults.filter(result => result.status === 'rejected').forEach(result => {
            console.warn('Una consulta del Canal no estuvo disponible:', result.reason);
        });
        // Compatibilidad temporal con las novedades creadas antes de unificar
        // Carrusel y Comunicación. Al editarlas desde Administrador se migran.
        const legacySnapshot = legacyResult[0]?.status === 'fulfilled' ? legacyResult[0].value : null;
        legacySnapshot?.docs.forEach(document => {
            const data = document.data();
            uniquePosts.set(`legacy-${document.id}`, {
                id: `legacy-${document.id}`,
                titulo: data.titulo || 'Novedad',
                resumen: data.descripcion || '',
                contenido: '',
                imagenUrl: data.fotoUrl || '',
                enlace: data.href || '',
                rolesDestinatarios: [],
                estado: 'publicada',
                fechaPublicacion: data.createdAt || new Date(0)
            });
        });
        if (!uniquePosts.size) {
            const fallbackLoaded = await loadDailyFallback();
            if (fallbackLoaded) return;
        }
        posts = [...uniquePosts.values()];
        await window.GenOffline?.replaceCollection(cacheKey, posts).catch(() => {});
        hasLoadedPosts = true;
        renderPosts();

        // Una pestaña abierta incorpora automáticamente publicaciones cuya fecha acaba de llegar.
        clearTimeout(scheduledRefresh);
        scheduledRefresh = setTimeout(loadPosts, 6 * 60 * 60 * 1000);
    } catch (error) {
        console.error('No se pudieron cargar las publicaciones:', error);
        if (!hasLoadedPosts) {
            const fallbackLoaded = await loadDailyFallback();
            if (!fallbackLoaded) renderStatus('No se pudieron cargar las publicaciones.');
        }
    }
}

async function loadDailyFallback() {
    try {
        const response = await fetch('../datos/inicio.json', { cache: 'no-store' });
        if (!response.ok) return false;
        const data = await response.json();
        const fallbackPosts = Array.isArray(data.novedades) ? data.novedades : [];
        if (!fallbackPosts.length) return false;
        posts = fallbackPosts.map(item => ({
            id: item.id || `resumen-${Math.random().toString(36).slice(2)}`,
            titulo: item.titulo || 'Novedad Gen',
            resumen: item.descripcion || '',
            contenido: '',
            imagenUrl: item.fotoUrl || '',
            enlace: item.href || '',
            textoEnlace: item.textoEnlace || 'Más información',
            rolesDestinatarios: [],
            estado: 'publicada',
            fechaPublicacion: data.generadoEn || data.fechaGeneracion,
            fechaEventoInicio: item.fechaEventoInicio || '',
            fechaEventoFin: item.fechaEventoFin || '',
            fechaVencimiento: item.fechaVencimiento || null,
            etiquetaCarrusel: item.etiquetaCarrusel || item.categoria || ''
        })).filter(item => isPostVisible(item));
        if (!posts.length) return false;
        hasLoadedPosts = true;
        renderPosts();
        return true;
    } catch (error) {
        console.warn('Tampoco se pudo cargar el resumen diario del Canal:', error);
        return false;
    }
}

function escapeHtml(value = '') {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
}

function toDate(value, fallback = new Date(0)) {
    if (!value) return fallback;
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date;
}

function isPostVisible(post, now = new Date()) {
    if (!post.fechaVencimiento) return true;
    return toDate(post.fechaVencimiento, new Date(0)) > now;
}

function safeWebUrl(value, base = document.baseURI) {
    if (!value) return '';
    try {
        const url = new URL(value, base);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_) {
        return '';
    }
}

function imageUrl(value) {
    if (!value) return '';
    return /^https?:\/\//i.test(value)
        ? safeWebUrl(value)
        : safeWebUrl(`../${value}`);
}

function formatEventDate(post) {
    if (!post.fechaEventoInicio) return '';
    const format = value => {
        const parts = String(value).split('-').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return '';
        return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    };
    const start = format(post.fechaEventoInicio);
    const end = format(post.fechaEventoFin);
    if (!start) return '';
    return end ? `Del ${start} al ${end}` : start;
}

function renderStatus(message) {
    document.getElementById('canal-feed').innerHTML = `<p class="canal-status">${escapeHtml(message)}</p>`;
}

function renderPosts() {
    const visible = posts
        .filter(post => isPostVisible(post))
        .filter(post => activeFilter === 'todo'
            || (activeFilter === 'general' ? !(post.rolesDestinatarios || []).length : (post.rolesDestinatarios || []).length > 0))
        .sort((a, b) => toDate(b.fechaPublicacion) - toDate(a.fechaPublicacion));

    const count = document.getElementById('canal-count');
    if (count) count.textContent = `${visible.length} ${visible.length === 1 ? 'publicación' : 'publicaciones'}`;
    if (!visible.length) return renderStatus('No hay publicaciones para mostrar todavía.');

    document.getElementById('canal-feed').innerHTML = visible.map(post => {
        const picture = imageUrl(post.imagenUrl || post.fotoUrl);
        const link = safeWebUrl(post.enlace);
        const linkText = String(post.textoEnlace || 'Más información').trim().split(/\s+/).slice(0, 4).join(' ');
        const eventDate = formatEventDate(post);
        return `
        <article class="canal-post${picture ? '' : ' canal-post-no-image'}" id="${escapeHtml(post.id)}">
            ${picture ? `<img src="${escapeHtml(picture)}" alt="">` : renderPostPlaceholder(post)}
            <div class="canal-post-content">
                <div class="canal-post-meta">${post.rolesDestinatarios?.length ? 'Para tus zonas' : 'General'} · ${toDate(post.fechaPublicacion, new Date()).toLocaleDateString('es-AR')}</div>
                <h2>${escapeHtml(post.titulo)}</h2>
                ${eventDate ? `<div class="canal-post-event">📅 ${escapeHtml(eventDate)}</div>` : ''}
                ${post.resumen ? `<p class="canal-post-summary">${escapeHtml(post.resumen)}</p>` : ''}
                ${post.contenido ? `<details class="canal-post-details"><summary>Leer publicación completa</summary><p class="canal-post-body">${escapeHtml(post.contenido)}</p></details>` : ''}
                ${link ? `<a class="canal-post-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkText)} <span aria-hidden="true">↗</span></a>` : ''}
            </div>
        </article>`;
    }).join('');

    document.querySelectorAll('.canal-post img').forEach(image => {
        const discardBrokenImage = () => {
            const card = image.closest('.canal-post');
            const post = posts.find(item => String(item.id) === card?.id);
            image.replaceWith(createPostPlaceholder(post || { id: card?.id, titulo: card?.querySelector('h2')?.textContent || 'Novedad' }));
            card?.classList.add('canal-post-no-image');
        };
        image.addEventListener('error', discardBrokenImage, { once: true });
        if (image.complete && image.naturalWidth === 0) discardBrokenImage();
    });

    const requestedId = decodeURIComponent(window.location.hash.slice(1));
    const requestedPost = requestedId ? document.getElementById(requestedId) : null;
    if (requestedPost) requestAnimationFrame(() => requestedPost.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function renderPostPlaceholder(post) {
    const palettes = [
        ['#6d3bd1', '#241140', '#b987ff'],
        ['#285fc4', '#102548', '#75b8ff'],
        ['#8d386f', '#35152d', '#ff8fd1'],
        ['#176a69', '#0d3438', '#69ddd1'],
        ['#965322', '#3d2414', '#ffc274'],
        ['#4f4cbd', '#20204d', '#a7a5ff']
    ];
    const stableId = String(post.id || '').replace(/^legacy[-:]/, '');
    const categoryValue = post.etiquetaCarrusel || post.categoria || '';
    const seedText = `${stableId}|${post.titulo || ''}|${categoryValue}`;
    const seed = [...seedText].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 1);
    const palette = palettes[seed % palettes.length];
    const category = String(categoryValue).toLowerCase();
    const symbol = category.includes('evento') ? '◇'
        : category.includes('comunica') ? '◎'
        : category.includes('formación') || category.includes('recurso') ? '✦'
        : category.includes('aviso') ? '!'
        : 'G2';
    const style = `--art-primary:${palette[0]};--art-deep:${palette[1]};--art-accent:${palette[2]}`;
    return `<div class="canal-post-visual canal-generated-art" data-variant="${seed % 6}" style="${style}" aria-hidden="true">
        <span class="canal-art-orbit"></span>
        <span class="canal-art-shape"></span>
        <span class="canal-art-symbol">${symbol}</span>
    </div>`;
}

function createPostPlaceholder(post) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderPostPlaceholder(post).trim();
    return wrapper.firstElementChild;
}
