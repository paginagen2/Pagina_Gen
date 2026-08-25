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
const CHANNEL_CACHE_PREFIX = 'canal-admin-v2';
// Firebase 9.22 admite hasta 10 valores en array-contains-any.
// Se crean varias consultas para no descartar roles adicionales del usuario.
const ROLE_QUERY_LIMIT = 10;

document.addEventListener('DOMContentLoaded', async () => {
    await waitForFirebase();
    if (!window.firebaseDb) {
        const cacheKey = `${CHANNEL_CACHE_PREFIX}-publico`;
        const guardados = await window.GenOffline?.getCollection(cacheKey).catch(() => null);
        const cachedVisiblePosts = guardados?.items?.filter(item => isPostVisible(item)) || [];
        if (cachedVisiblePosts.length) {
            posts = cachedVisiblePosts;
            hasLoadedPosts = true;
            renderPosts();
        } else renderStatus('No se pudo conectar al Canal.');
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
        const cacheKey = `${CHANNEL_CACHE_PREFIX}-${[...userRoles].sort().join('-') || 'publico'}`;
        const guardados = await window.GenOffline?.getCollection(cacheKey).catch(() => null);
        const cachedVisiblePosts = guardados?.items?.filter(item => isPostVisible(item)) || [];
        if (cachedVisiblePosts.length && !navigator.onLine) {
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
        const queryResults = await Promise.allSettled(requests);
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
        posts = [...uniquePosts.values()];
        await window.GenOffline?.replaceCollection(cacheKey, posts).catch(() => {});
        hasLoadedPosts = true;
        renderPosts();

        // Una pestaña abierta incorpora automáticamente publicaciones cuya fecha acaba de llegar.
        clearTimeout(scheduledRefresh);
        scheduledRefresh = setTimeout(loadPosts, 6 * 60 * 60 * 1000);
    } catch (error) {
        console.error('No se pudieron cargar las publicaciones:', error);
        if (!hasLoadedPosts) renderStatus('No se pudieron cargar las publicaciones.');
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

    if (!visible.length) return renderStatus('No hay publicaciones para mostrar todavía.');

    document.getElementById('canal-feed').innerHTML = visible.map(post => {
        const picture = imageUrl(post.imagenUrl || post.fotoUrl);
        const eventDate = formatEventDate(post);
        return `
        <a class="canal-post${picture ? '' : ' canal-post-no-image'}" id="${escapeHtml(post.id)}" href="publicacion.html?id=${encodeURIComponent(post.id)}" aria-label="Leer ${escapeHtml(post.titulo || 'publicación')}">
            ${picture ? `<img src="${escapeHtml(picture)}" alt="">` : renderPostPlaceholder(post)}
            <div class="canal-post-content">
                <div class="canal-post-meta">${post.rolesDestinatarios?.length ? 'Para tus zonas' : 'General'} · ${toDate(post.fechaPublicacion, new Date()).toLocaleDateString('es-AR')}</div>
                <h2>${escapeHtml(post.titulo)}</h2>
                ${eventDate ? `<div class="canal-post-event">📅 ${escapeHtml(eventDate)}</div>` : ''}
                ${post.resumen ? `<p class="canal-post-summary">${escapeHtml(post.resumen)}</p>` : ''}
                <span class="canal-post-link">Leer publicación <span aria-hidden="true">→</span></span>
            </div>
        </a>`;
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
