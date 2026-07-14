let db;
let utils;
let auth;
let userRoles = [];
let posts = [];
let activeFilter = 'todo';
let loadTimer = null;
let scheduledRefresh = null;

const QUERY_LIMIT = 30;
// Firebase 9.22 admite hasta 10 valores en array-contains-any.
// Se crean varias consultas para no descartar roles adicionales del usuario.
const ROLE_QUERY_LIMIT = 10;

document.addEventListener('DOMContentLoaded', async () => {
    await waitForFirebase();
    if (!window.firebaseDb) return renderStatus('No se pudo conectar al Canal.');

    db = window.firebaseDb;
    utils = window.firebaseUtils;
    auth = window.firebaseAuth;

    utils.onAuthStateChanged(auth, async user => {
        try {
            userRoles = user ? await window.genAuthSession.getRoles(user) : [];
        } catch (error) {
            console.warn('No se pudieron obtener los roles del usuario:', error);
            userRoles = [];
        }
        scheduleLoadPosts();
    });

    window.addEventListener('gen:profile-updated', event => {
        userRoles = event.detail?.roles || [];
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
            if (window.firebaseDb && window.firebaseUtils && window.firebaseAuth && window.genAuthSession) {
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
    renderStatus('Cargando publicaciones...');
    try {
        const base = utils.collection(db, 'canal_publicaciones');
        const now = new Date();
        const requests = [
            ...buildAudienceQueries(base, 'publicada', now),
            ...buildAudienceQueries(base, 'programada', now)
        ];
        const snapshots = await Promise.all(requests);
        const uniquePosts = new Map();
        snapshots.forEach(snapshot => snapshot.docs.forEach(document => {
            uniquePosts.set(document.id, { id: document.id, ...document.data() });
        }));
        posts = [...uniquePosts.values()];
        renderPosts();

        // Una pestaña abierta incorpora automáticamente publicaciones cuya fecha acaba de llegar.
        clearTimeout(scheduledRefresh);
        scheduledRefresh = setTimeout(loadPosts, 60000);
    } catch (error) {
        console.error('No se pudieron cargar las publicaciones:', error);
        renderStatus(error.code === 'failed-precondition'
            ? 'El Canal necesita publicar sus índices de Firebase antes de mostrar contenido por roles.'
            : 'No se pudieron cargar las publicaciones.');
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

function renderStatus(message) {
    document.getElementById('canal-feed').innerHTML = `<p class="canal-status">${escapeHtml(message)}</p>`;
}

function renderPosts() {
    const visible = posts
        .filter(post => activeFilter === 'todo'
            || (activeFilter === 'general' ? !(post.rolesDestinatarios || []).length : (post.rolesDestinatarios || []).length > 0))
        .sort((a, b) => toDate(b.fechaPublicacion) - toDate(a.fechaPublicacion));

    if (!visible.length) return renderStatus('No hay publicaciones para mostrar todavía.');

    document.getElementById('canal-feed').innerHTML = visible.map(post => {
        const picture = imageUrl(post.imagenUrl);
        const link = safeWebUrl(post.enlace);
        return `
        <article class="canal-post" id="${escapeHtml(post.id)}">
            ${picture ? `<img src="${escapeHtml(picture)}" alt="">` : ''}
            <div class="canal-post-content">
                <h2>${escapeHtml(post.titulo)}</h2>
                <div class="canal-post-meta">${post.rolesDestinatarios?.length ? 'Para tus zonas' : 'General'} · ${toDate(post.fechaPublicacion, new Date()).toLocaleDateString('es-AR')}</div>
                <p>${escapeHtml(post.resumen)}</p>
                ${post.contenido ? `<p class="canal-post-body">${escapeHtml(post.contenido)}</p>` : ''}
                ${link ? `<a class="canal-post-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">Más información</a>` : ''}
            </div>
        </article>`;
    }).join('');
}
