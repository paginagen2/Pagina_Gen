let publicationDb;
let publicationUtils;
let currentPublication;
let availablePublications = [];

document.addEventListener('DOMContentLoaded', loadPublicationPage);

function escapeHtml(value = '') {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
}

function toDate(value, fallback = new Date(0)) {
    if (!value) return fallback;
    if (value && typeof value === 'object' && Number.isFinite(Number(value._seconds))) return new Date(Number(value._seconds) * 1000);
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date;
}

function safeUrl(value, base = document.baseURI) {
    if (!value) return '';
    try {
        const url = new URL(value, base);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
}

function imageUrl(value) {
    if (!value) return '';
    return /^https?:\/\//i.test(value) ? safeUrl(value) : safeUrl(`../${value}`);
}

function isVisible(post, now = new Date()) {
    if (post.estado === 'programada' && toDate(post.fechaPublicacion) > now) return false;
    if (post.fechaVencimiento && toDate(post.fechaVencimiento) <= now) return false;
    return !post.estado || ['publicada', 'programada', 'publicado'].includes(post.estado);
}

function formatEventDate(post) {
    const format = value => {
        const parts = String(value || '').split('-').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return '';
        return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    };
    const start = format(post.fechaEventoInicio);
    const end = format(post.fechaEventoFin);
    return start ? (end ? `Del ${start} al ${end}` : start) : '';
}

function waitForFirebase() {
    return new Promise(resolve => {
        let attempts = 0;
        const timer = setInterval(() => {
            if (window.firebaseDb && window.firebaseUtils && window.firebaseAuth) {
                clearInterval(timer); resolve(true);
            } else if (++attempts >= 80) { clearInterval(timer); resolve(false); }
        }, 100);
    });
}

async function waitForInitialAuth() {
    return new Promise(resolve => {
        let unsubscribe = () => {};
        unsubscribe = publicationUtils.onAuthStateChanged(window.firebaseAuth, user => {
            unsubscribe(); resolve(user);
        });
    });
}

async function getFirebasePublication(id) {
    if (id.startsWith('legacy-')) return null;
    const reference = publicationUtils.doc(publicationDb, 'canal_publicaciones', id);
    const snapshot = await publicationUtils.getDoc(reference);
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() };
}

async function getRelatedFirebasePublications(excludedId) {
    const roles = window.genAuthSession
        ? await window.genAuthSession.getRoles().catch(() => [])
        : [];
    const base = publicationUtils.collection(publicationDb, 'canal_publicaciones');
    const now = new Date();
    const requests = [];
    const addQuery = (estado, roleGroup = null) => {
        const constraints = [
            publicationUtils.where('estado', '==', estado),
            roleGroup
                ? publicationUtils.where('rolesDestinatarios', 'array-contains-any', roleGroup)
                : publicationUtils.where('rolesDestinatarios', '==', [])
        ];
        if (estado === 'programada') constraints.push(publicationUtils.where('fechaPublicacion', '<=', now));
        constraints.push(publicationUtils.orderBy('fechaPublicacion', 'desc'), publicationUtils.limit(8));
        requests.push(publicationUtils.getDocs(publicationUtils.query(base, ...constraints)));
    };
    ['publicada', 'programada'].forEach(estado => addQuery(estado));
    for (let offset = 0; offset < roles.length; offset += 10) {
        const roleGroup = roles.slice(offset, offset + 10);
        ['publicada', 'programada'].forEach(estado => addQuery(estado, roleGroup));
    }
    const results = await Promise.allSettled(requests);
    const unique = new Map();
    results.filter(result => result.status === 'fulfilled').forEach(result => {
        result.value.docs.forEach(document => unique.set(document.id, { id: document.id, ...document.data() }));
    });
    return [...unique.values()]
        .filter(item => String(item.id) !== String(excludedId) && isVisible(item, now))
        .sort((a, b) => toDate(b.fechaPublicacion) - toDate(a.fechaPublicacion))
        .slice(0, 3);
}

async function loadPublicationPage() {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) return renderError('No se indicó qué publicación abrir.');

    if (await waitForFirebase()) {
        publicationDb = window.firebaseDb;
        publicationUtils = window.firebaseUtils;
        await waitForInitialAuth();
        try {
            const firebasePost = await getFirebasePublication(id);
            if (firebasePost && isVisible(firebasePost)) {
                currentPublication = firebasePost;
                availablePublications = [firebasePost];
                renderPublication(firebasePost);
                const related = await getRelatedFirebasePublications(id);
                availablePublications = [firebasePost, ...related];
                renderRelated(firebasePost);
            }
        } catch (error) {
            console.warn('No se pudo leer la publicación desde Firebase:', error);
        }
    }
    if (!currentPublication) renderError('La publicación no existe, venció o no está disponible para tu usuario.');
}

function renderPublication(post) {
    document.title = `${post.titulo || 'Publicación'} | Canal Gen`;
    const picture = imageUrl(post.imagenUrl || post.fotoUrl);
    const eventDate = formatEventDate(post);
    const externalLink = safeUrl(post.enlace);
    const linkText = String(post.textoEnlace || 'Más información').trim().split(/\s+/).slice(0, 4).join(' ');
    document.getElementById('publication-view').innerHTML = `
      <article class="publication-article">
        ${picture ? `<img class="publication-image" src="${escapeHtml(picture)}" alt="">` : '<div class="publication-visual" aria-hidden="true"><span>Comunicación Gen</span></div>'}
        <div class="publication-content">
          <div class="publication-meta">${post.rolesDestinatarios?.length ? 'Para tus zonas' : 'General'} · ${toDate(post.fechaPublicacion, new Date()).toLocaleDateString('es-AR')}</div>
          <h1>${escapeHtml(post.titulo || 'Publicación')}</h1>
          ${eventDate ? `<div class="publication-event">📅 ${escapeHtml(eventDate)}</div>` : ''}
          ${post.resumen ? `<p class="publication-summary">${escapeHtml(post.resumen)}</p>` : ''}
          ${post.contenido ? `<div class="publication-body">${escapeHtml(post.contenido)}</div>` : ''}
          ${externalLink ? `<a class="publication-action" href="${escapeHtml(externalLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkText)} <span aria-hidden="true">↗</span></a>` : ''}
        </div>
      </article>`;
    document.querySelector('.publication-image')?.addEventListener('error', event => {
        event.currentTarget.replaceWith(Object.assign(document.createElement('div'), { className: 'publication-visual', innerHTML: '<span>Comunicación Gen</span>' }));
    }, { once: true });
    renderRelated(post);
}

function renderRelated(post) {
    const totalText = `${post.resumen || ''} ${post.contenido || ''}`.trim().length;
    const related = availablePublications.filter(item => String(item.id) !== String(post.id)).slice(0, 3);
    const section = document.getElementById('related-section');
    if (totalText > 700 || !related.length) { section.hidden = true; return; }
    document.getElementById('related-list').innerHTML = related.map(item => `
      <a class="related-card" href="publicacion.html?id=${encodeURIComponent(item.id)}">
        <small>${item.rolesDestinatarios?.length ? 'Tus zonas' : 'General'}</small>
        <strong>${escapeHtml(item.titulo || 'Publicación')}</strong>
        ${item.resumen || item.descripcion ? `<p>${escapeHtml(item.resumen || item.descripcion)}</p>` : ''}
      </a>`).join('');
    section.hidden = false;
}

function renderError(message) {
    document.getElementById('publication-view').innerHTML = `<p class="publication-status">${escapeHtml(message)}</p>`;
    document.getElementById('related-section').hidden = true;
}
