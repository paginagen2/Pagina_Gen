import { parseSongContent } from '../cancionero/song-content.js?v=20260825-riff-links';

let db, utils, auth;
let currentUser = null;
let currentUserRoles = [];
let currentSection = 'carrusel';
let editingId = null;
const loadedSections = new Set();
const ADMIN_QUERY_LIMIT = 500;
const ADMIN_BATCH_SIZE = 450;
const OFFLINE_SYNC_COLLECTIONS = new Set([
    'canciones', 'meditaciones', 'recursos', 'biblioteca_recursos',
    'pasapalabra', 'pdv', 'canal_publicaciones', 'cancion_audios'
]);

function adminEscapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
}

function adminCssToken(value, fallback = 'pendiente') {
    const token = String(value || fallback).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return token || fallback;
}

function enableOfflineMutationTracking() {
    if (utils.__offlineMutationTrackingEnabled) return;
    const original = { addDoc: utils.addDoc, setDoc: utils.setDoc, updateDoc: utils.updateDoc, deleteDoc: utils.deleteDoc };
    const stamp = data => ({ ...data, _offlineDeleted: false, _offlineActualizadoEn: new Date() });
    utils.addDoc = (ref, data) => OFFLINE_SYNC_COLLECTIONS.has(ref.id)
        ? original.addDoc(ref, stamp(data)) : original.addDoc(ref, data);
    utils.setDoc = (ref, data, options) => OFFLINE_SYNC_COLLECTIONS.has(ref.parent?.id)
        ? original.setDoc(ref, stamp(data), options) : original.setDoc(ref, data, options);
    utils.updateDoc = (ref, data) => OFFLINE_SYNC_COLLECTIONS.has(ref.parent?.id)
        ? original.updateDoc(ref, stamp(data)) : original.updateDoc(ref, data);
    utils.deleteDoc = ref => OFFLINE_SYNC_COLLECTIONS.has(ref.parent?.id)
        ? original.setDoc(ref, {
            estado: 'eliminado', Publico: false, _offlineDeleted: true, _offlineActualizadoEn: new Date()
        }, { merge: true })
        : original.deleteDoc(ref);
    utils.__offlineMutationTrackingEnabled = true;
}

// Variables globales para todas las secciones
let allCanciones = [];
const selectedSongApprovalIds = new Set();
let visibleSongAdminItems = [];
let allCancionAudios = [];
let editingAudioId = null;
let allRecursos = [];
let allReflexiones = [];
let allPdvs = [];
let allMeditaciones = [];
let allFrases = [];
let allCarruselItems = [];
let accessZones = [];
let accessFunctions = [];
let accessCodes = [];
let accessUsers = [];
let androidVersionReleases = [];
let androidPublicationConfig = null;
const FIXED_AUDIENCE_ROLES = [
    { id: 'gen', nombre: 'Gen', descripcion: 'Contenido interno para los Gen.' },
    { id: 'gen2', nombre: 'Gen2', descripcion: 'Incluye también todo el contenido Gen.' },
    { id: 'asistente', nombre: 'Asistente', descripcion: 'Contenido destinado a asistentes.' }
];
const FIXED_FUNCTION_ROLES = [
    ['admin', 'Administrador total'],
    ['funcion_comunicacion', 'Comunicación'],
    ['funcion_notificaciones', 'Notificaciones'],
    ['funcion_pasapalabra', 'Pasapalabra'],
    ['funcion_meditaciones', 'Meditaciones'],
    ['funcion_biblioteca', 'Biblioteca'],
    ['funcion_cancionero', 'Cancionero'],
    ['funcion_subida_multiple', 'Subida múltiple'],
    ['funcion_recursos', 'Recursos'],
    ['funcion_frases', 'Frases'],
    ['funcion_pdv', 'Palabra de Vida']
].map(([id, nombre]) => ({ id, nombre, descripcion: '' }));
const SECTION_ROLES = {
    carrusel: 'funcion_comunicacion',
    notificaciones: 'funcion_notificaciones',
    'versiones-android': 'admin',
    pasapalabra: 'funcion_pasapalabra',
    meditaciones: 'funcion_meditaciones',
    biblioteca: 'funcion_biblioteca',
    cancionero: 'funcion_cancionero',
    audios: 'funcion_cancionero',
    'bulk-upload': 'funcion_subida_multiple',
    recursos: 'funcion_recursos',
    frases: 'funcion_frases',
    pdv: 'funcion_pdv'
};

function isFullAdmin() {
    return currentUserRoles.includes('admin');
}

function canAccessSection(section) {
    if (isFullAdmin()) return true;
    if (section === 'carrusel'
        && currentUserRoles.some(role => role.startsWith('funcion_comunicacion_zona_'))) {
        return true;
    }
    const requiredRole = SECTION_ROLES[section];
    return Boolean(requiredRole && currentUserRoles.includes(requiredRole));
}

function managedCommunicationZones() {
    return currentUserRoles
        .filter(role => role.startsWith('funcion_comunicacion_zona_'))
        .map(role => role.slice('funcion_comunicacion_'.length));
}

function hasAnyAdminAccess(roles = currentUserRoles) {
    return roles.includes('admin')
        || Object.values(SECTION_ROLES).some(role => roles.includes(role))
        || roles.some(role => role.startsWith('funcion_comunicacion_zona_'));
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        if (window.firebaseReady) await window.firebaseReady;

        if (!window.firebaseDb || !window.firebaseUtils || !window.firebaseAuth) {
            throw new Error('No se pudo iniciar la conexión con Firebase.');
        }

        db = window.firebaseDb;
        utils = window.firebaseUtils;
        auth = window.firebaseAuth;
        enableOfflineMutationTracking();
        initializeAdmin();
    } catch (error) {
        console.error('No se pudo iniciar el panel de administración:', error);
        showAdminError('No pudimos conectar el panel. Revisá tu conexión y recargá la página.');
    }
});

function initializeAdmin() {
    let unsubscribe = null;
    unsubscribe = utils.onAuthStateChanged(auth, async (user) => {
        if (unsubscribe) unsubscribe();
        currentUser = user;
        
        if (!user) {
            showAccessDenied();
            return;
        }

        try {
            const userDoc = await utils.getDoc(utils.doc(db, 'usuarios', user.uid));
            const userData = userDoc.exists() ? userDoc.data() : null;
            const roles = Array.isArray(userData?.roles) ? userData.roles : [];
            currentUserRoles = roles;

            if (!hasAnyAdminAccess(roles)) {
                showAccessDenied();
                return;
            }

            // Si es admin, mostrar el contenido
            hideAdminStatus();
            document.getElementById('admin-content').style.display = 'block';
            document.getElementById('access-denied').style.display = 'none';

            setupSectionNavigation();
            applySectionPermissions();
            openOnlyAssignedSection();
            if (canAccessSection('notificaciones')) setupPushAdmin();
        } catch (error) {
            console.error('No se pudo verificar el acceso de administrador:', error);
            showAdminError('No pudimos verificar tu acceso. Recargá la página para intentarlo nuevamente.');
        }
    }, (error) => {
        console.error('Error de autenticación:', error);
        showAdminError('No pudimos verificar tu sesión. Recargá la página para intentarlo nuevamente.');
    });
}

function setupPushAdmin() {
    const form = document.getElementById('push-admin-form');
    if (!form || form.dataset.ready) return;
    form.dataset.ready = 'true';
    const limitedZones = !isFullAdmin() && !currentUserRoles.includes('funcion_comunicacion')
        ? managedCommunicationZones()
        : [];
    if (limitedZones.length) {
        const rolesInput = document.getElementById('push-roles');
        rolesInput.value = limitedZones[0];
        rolesInput.placeholder = limitedZones.join(', ');
    }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const status = document.getElementById('push-admin-status');
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        status.textContent = 'Enviando…';
        try {
            const roles = document.getElementById('push-roles').value.split(',').map(value => value.trim()).filter(Boolean);
            const limitedZones = !isFullAdmin() && !currentUserRoles.includes('funcion_comunicacion')
                ? managedCommunicationZones()
                : [];
            if (limitedZones.length && (roles.length !== 1 || !limitedZones.includes(roles[0]))) {
                throw new Error('Sólo podés enviar a una de las zonas que administrás.');
            }
            await utils.addDoc(utils.collection(db, 'notificaciones_pendientes'), {
                tipo: 'manual',
                title: document.getElementById('push-title').value,
                body: document.getElementById('push-body').value,
                category: document.getElementById('push-category').value,
                url: document.getElementById('push-url').value || 'index.html',
                roles,
                estado: 'pendiente',
                creadoPor: currentUser.uid,
                creadoEn: new Date()
            });
            status.textContent = 'Envío programado. Se procesará dentro de los próximos cinco minutos.';
            form.reset();
            document.getElementById('push-url').value = 'index.html';
            if (limitedZones.length) document.getElementById('push-roles').value = limitedZones[0];
        } catch (error) {
            console.error(error);
            status.textContent = `No se pudo enviar: ${error.message}`;
        } finally {
            button.disabled = false;
        }
    });
}

function showAccessDenied() {
    hideAdminStatus();
    document.getElementById('admin-content').style.display = 'none';
    document.getElementById('access-denied').style.display = 'block';
}

function hideAdminStatus() {
    const status = document.getElementById('admin-loading');
    if (status) status.style.display = 'none';
}

function showAdminError(message) {
    const status = document.getElementById('admin-loading');
    if (!status) return;
    status.classList.add('is-error');
    status.innerHTML = `
        <h1>No se pudo cargar el panel</h1>
        <p>${message}</p>
        <button type="button" class="btn-primary" onclick="window.location.reload()">Reintentar</button>
    `;
    status.style.display = 'grid';
}

function setupSectionNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            changeSection(section);
        });
    });
    document.getElementById('admin-section-back')?.addEventListener('click', showAdminSectionPicker);
}

function applySectionPermissions() {
    document.querySelectorAll('.nav-btn[data-section]').forEach(button => {
        button.hidden = !canAccessSection(button.dataset.section);
    });
    const firstAllowed = [...document.querySelectorAll('.nav-btn[data-section]')]
        .find(button => !button.hidden);
    if (!firstAllowed) {
        showAccessDenied();
        return;
    }
    const subtitle = document.querySelector('.admin-header p');
    if (subtitle) subtitle.textContent = isFullAdmin()
        ? 'Gestioná todo el contenido de la página'
        : 'Gestioná únicamente las secciones que tenés asignadas';
}

function openOnlyAssignedSection() {
    const allowedButtons = [...document.querySelectorAll('.nav-btn[data-section]')]
        .filter(button => !button.hidden);
    const backButton = document.getElementById('admin-section-back');
    const hasSingleSection = allowedButtons.length === 1;
    if (backButton) backButton.hidden = hasSingleSection;
    if (hasSingleSection) changeSection(allowedButtons[0].dataset.section);
}

function changeSection(section) {
    if (!canAccessSection(section)) {
        alert('No tenés permiso para administrar esta sección.');
        return;
    }
    currentSection = section;
    document.getElementById('admin-content').classList.add('admin-section-selected');
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === section);
    });
    
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === `${section}-section`);
    });
    
    editingId = null;
    loadCurrentSection();
}

function showAdminSectionPicker() {
    document.getElementById('admin-content').classList.remove('admin-section-selected');
    document.querySelectorAll('.nav-btn').forEach(button => button.classList.remove('active'));
    document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
    document.querySelector('.admin-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function loadCurrentSection() {
    // Cada sección conserva su DOM y sus datos durante esta sesión del panel.
    // Las funciones de guardar/eliminar siguen actualizando su lista directamente.
    if (loadedSections.has(currentSection)) return;
    loadedSections.add(currentSection);

    switch (currentSection) {
        case 'carrusel':
            loadCanalAdmin();
            setupCanalForm();
            break;
        case 'zonas-codigos':
            setupAccessAdmin();
            loadAccessAdmin();
            break;
        case 'cancionero':
            loadCanciones();
            break;
        case 'audios':
            loadCanciones();
            break;
        case 'meditaciones':
            loadMeditaciones();
            break;
        case 'biblioteca':
            initBibliotecaAdmin();
            break;
        case 'versiones-android':
            initAndroidVersionsAdmin();
            break;
        case 'recursos':
            loadRecursos();
            break;
        case 'pasapalabra':
            loadPasapalabra();
            break;
        case 'frases':
            loadFrases();
            break;
        case 'pdv':
            loadPdV();
            break;
        case 'bulk-upload':
            initBulkUpload();
            break;
        default:
            break;
    }
}

// ==================== FUNCIONES AUXILIARES ====================

function convertToDateFormat(dateString) {
    const months = {
        'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
        'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
        'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };
    
    const regex = /(\d+)\s+de\s+(\w+)\s+de\s+(\d{4})/i;
    const match = dateString.match(regex);
    
    if (match) {
        const day = match[1].padStart(2, '0');
        const month = months[match[2].toLowerCase()] || '01';
        const year = match[3];
        return `${day}/${month}/${year}`;
    }
    
    return dateString;
}

function parseDateDDMMYYYY(dateStr) {
    const [day, month, year] = dateStr.split('/');
    return new Date(year, month - 1, day);
}

// ==================== CARRUSEL ====================

async function loadCarruselList() {
    const listContainer = document.getElementById('carrusel-list');
    if (!listContainer) return;
    listContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Cargando...</p>';

    try {
        const q = utils.query(
            utils.collection(db, 'carrusel'),
            utils.orderBy('createdAt', 'desc'),
            utils.limit(ADMIN_QUERY_LIMIT)
        );
        const querySnapshot = await utils.getDocs(q);

        if (querySnapshot.empty) {
            listContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); grid-column: 1/-1;">No hay elementos en el carrusel.</p>';
            return;
        }

        listContainer.innerHTML = '';
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const item = document.createElement('div');
            item.className = 'carrusel-item';
            if (data.fotoUrl) {
                const image = document.createElement('img');
                image.src = `../${String(data.fotoUrl).replace(/^\/+/, '')}`;
                image.alt = String(data.titulo || 'Imagen del carrusel');
                image.className = 'carrusel-item-img';
                item.appendChild(image);
            }
            const content = document.createElement('div');
            content.className = 'carrusel-item-content';
            const title = document.createElement('h3');
            title.textContent = data.titulo || 'Sin título';
            const description = document.createElement('p');
            description.textContent = data.descripcion || '';
            const actions = document.createElement('div');
            actions.className = 'carrusel-item-actions';
            const edit = document.createElement('button');
            edit.type = 'button'; edit.className = 'btn-edit'; edit.textContent = 'Editar';
            edit.addEventListener('click', () => editCarruselItem(docSnap.id, data));
            const remove = document.createElement('button');
            remove.type = 'button'; remove.className = 'btn-delete'; remove.textContent = 'Borrar';
            remove.addEventListener('click', () => deleteCarruselItem(docSnap.id));
            actions.append(edit, remove);
            content.append(title, description, actions);
            item.appendChild(content);
            listContainer.appendChild(item);
        });
    } catch (error) {
        console.error('Error al cargar la lista:', error);
        listContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); grid-column: 1/-1;">Error al cargar la lista.</p>';
    }
}

function setupCarruselFormListeners() {
    const form = document.getElementById('carrusel-form');
    const fotoUrlInput = document.getElementById('carrusel-foto-url');
    const cancelBtn = document.getElementById('carrusel-cancel');
    if (!form || form.dataset.adminBound === 'true') return;
    form.dataset.adminBound = 'true';

    if (fotoUrlInput) {
        fotoUrlInput.addEventListener('input', (e) => {
            const url = e.target.value;
            const preview = document.getElementById('carrusel-foto-preview');
            if (url) {
                preview.src = '../' + url;
                preview.style.display = 'block';
            } else {
                preview.style.display = 'none';
            }
        });
    }

    if (form) {
        form.addEventListener('submit', handleCarruselSubmit);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', resetCarruselForm);
    }
}

async function handleCarruselSubmit(e) {
    e.preventDefault();

    const editId = document.getElementById('carrusel-edit-id').value;
    const titulo = document.getElementById('carrusel-titulo').value;
    const descripcion = document.getElementById('carrusel-descripcion').value;
    const fotoUrl = document.getElementById('carrusel-foto-url').value;

    if (editId) {
        await updateCarruselItem(editId, titulo, descripcion, fotoUrl);
    } else {
        await addCarruselItem(titulo, descripcion, fotoUrl);
    }
}

async function addCarruselItem(titulo, descripcion, fotoUrl) {
    try {
        await utils.addDoc(utils.collection(db, 'carrusel'), {
            titulo,
            descripcion,
            fotoUrl,
            createdAt: new Date()
        });

        alert('¡Elemento agregado correctamente!');
        resetCarruselForm();
        loadCarruselList();
    } catch (error) {
        console.error('Error al agregar:', error);
        alert('Error al agregar el elemento.');
    }
}

async function updateCarruselItem(id, titulo, descripcion, fotoUrl) {
    try {
        const docRef = utils.doc(db, 'carrusel', id);

        await utils.updateDoc(docRef, {
            titulo,
            descripcion,
            fotoUrl
        });

        alert('¡Elemento actualizado correctamente!');
        resetCarruselForm();
        loadCarruselList();
    } catch (error) {
        console.error('Error al actualizar:', error);
        alert('Error al actualizar el elemento.');
    }
}

async function deleteCarruselItem(id) {
    if (!confirm('¿Estás seguro de borrar este elemento?')) return;

    try {
        const docRef = utils.doc(db, 'carrusel', id);
        await utils.deleteDoc(docRef);

        alert('¡Elemento borrado correctamente!');
        loadCarruselList();
    } catch (error) {
        console.error('Error al borrar:', error);
        alert('Error al borrar el elemento.');
    }
}

function editCarruselItem(id, data) {
    document.getElementById('carrusel-edit-id').value = id;
    document.getElementById('carrusel-titulo').value = data.titulo;
    document.getElementById('carrusel-descripcion').value = data.descripcion;
    document.getElementById('carrusel-foto-url').value = data.fotoUrl;
    document.getElementById('carrusel-form-title').textContent = 'Editar elemento';
    document.getElementById('carrusel-cancel').style.display = 'inline-block';

    const preview = document.getElementById('carrusel-foto-preview');
    if (data.fotoUrl) {
        preview.src = '../' + data.fotoUrl;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetCarruselForm() {
    document.getElementById('carrusel-form').reset();
    document.getElementById('carrusel-edit-id').value = '';
    document.getElementById('carrusel-form-title').textContent = 'Agregar nuevo elemento';
    document.getElementById('carrusel-cancel').style.display = 'none';
    document.getElementById('carrusel-foto-preview').style.display = 'none';
    document.getElementById('carrusel-foto-preview').src = '';
}

window.editCarruselItem = editCarruselItem;
window.deleteCarruselItem = deleteCarruselItem;

// ==================== CANCIONERO ====================

const CANCION_CATEGORIES = new Set(['misa', 'gen', 'fogon']);

function normalizeCancionCategory(value) {
    return CANCION_CATEGORIES.has(value) ? value : 'gen';
}

async function loadCanciones() {
    try {
        const q = utils.query(utils.collection(db, 'canciones'), utils.orderBy('fechaCreacion', 'desc'), utils.limit(ADMIN_QUERY_LIMIT));
        const querySnapshot = await utils.getDocs(q);
        allCanciones = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        allCanciones.sort((a, b) => {
            const ta = a.fechaCreacion && a.fechaCreacion.toMillis ? a.fechaCreacion.toMillis() : (a.fechaCreacion || 0);
            const tb = b.fechaCreacion && b.fechaCreacion.toMillis ? b.fechaCreacion.toMillis() : (b.fechaCreacion || 0);
            return tb - ta;
        });
        
        displayCanciones(allCanciones);
        setupCancioneroListeners();
        restoreAdminSongPreview();
    } catch (error) {
        console.error('Error al cargar canciones:', error);
    }
    // La bandeja de audios debe abrir aunque la consulta de canciones falle;
    // de lo contrario, propuestas ya guardadas quedaban invisibles.
    setupAudioAdmin();
    await loadCancionAudios();
}

function displayCanciones(canciones) {
    const list = document.getElementById('cancion-list');
    if (!list) return;
    visibleSongAdminItems = canciones;
    list.innerHTML = '';
    
    const bulkActions = document.getElementById('cancion-bulk-actions');
    if (bulkActions) bulkActions.hidden = !isFullAdmin();
    canciones.forEach(cancion => {
        const item = document.createElement('div');
        item.className = `item cancion-admin-item ${editingId === cancion.id ? 'active' : ''}`;
        
        const estado = cancion.estado || 'pendiente';
        const categoria = normalizeCancionCategory(cancion.categoria);
        
        if (isFullAdmin() && estado === 'pendiente') {
            const selection = document.createElement('label');
            selection.className = 'cancion-bulk-check';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = selectedSongApprovalIds.has(cancion.id);
            checkbox.setAttribute('aria-label', `Seleccionar ${cancion.titulo || 'canción'}`);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) selectedSongApprovalIds.add(cancion.id);
                else selectedSongApprovalIds.delete(cancion.id);
                updateSongBulkActions(canciones);
            });
            selection.append(checkbox);
            item.append(selection);
        }
        const content = document.createElement('div');
        content.className = 'cancion-admin-content';
        content.innerHTML = `
            <div class="item-title">${adminEscapeHtml(cancion.titulo || 'Sin título')}</div>
            <div class="item-subtitle">${adminEscapeHtml(cancion.artista || 'Sin artista')}${cancion.creadoPorNombre ? ` · Enviada por ${adminEscapeHtml(cancion.creadoPorNombre)}` : ''}</div>
            <span class="item-badge badge-${adminCssToken(categoria, 'gen')}">${adminEscapeHtml(categoria)}</span>
            <span class="item-badge badge-${adminCssToken(estado)}">${adminEscapeHtml(estado)}</span>
        `;
        item.append(content);
        content.addEventListener('click', () => editCancion(cancion));
        list.appendChild(item);
    });
    updateSongBulkActions(canciones);
}

function updateSongBulkActions(visibleSongs = allCanciones) {
    if (!isFullAdmin()) return;
    const selectedCount = document.getElementById('cancion-selected-count');
    const approve = document.getElementById('cancion-approve-selected');
    const selectAll = document.getElementById('cancion-select-all-pending');
    const visiblePendingIds = visibleSongs.filter(song => (song.estado || 'pendiente') === 'pendiente').map(song => song.id);
    const selectedVisible = visiblePendingIds.filter(id => selectedSongApprovalIds.has(id)).length;
    if (selectedCount) selectedCount.textContent = `${selectedSongApprovalIds.size} seleccionada${selectedSongApprovalIds.size === 1 ? '' : 's'}`;
    if (approve) approve.disabled = selectedSongApprovalIds.size === 0;
    if (selectAll) {
        selectAll.checked = visiblePendingIds.length > 0 && selectedVisible === visiblePendingIds.length;
        selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visiblePendingIds.length;
    }
}

function editCancion(cancion) {
    editingId = cancion.id;
    const form = document.getElementById('cancion-form');
    form.dataset.editingId = cancion.id;

    document.getElementById('cancion-form-title').textContent = '✏️ Editar Canción';
    document.getElementById('cancion-titulo').value = cancion.titulo || '';
    document.getElementById('cancion-artista').value = cancion.artista || '';
    document.getElementById('cancion-letra').value = cancion.letra || '';
    document.getElementById('cancion-tono').value = cancion.tono || '';
    document.getElementById('cancion-idioma').value = cancion.idioma || 'Español';
    document.getElementById('cancion-categoria').value = normalizeCancionCategory(cancion.categoria);
    document.getElementById('cancion-estado').value = cancion.estado || 'pendiente';
    
    document.getElementById('cancion-cancel').style.display = 'inline-block';
    document.getElementById('cancion-delete').style.display = 'inline-block';
    displayCanciones(allCanciones);
}

function resetCancionForm() {
    editingId = null;
    const form = document.getElementById('cancion-form');
    delete form.dataset.editingId;

    document.getElementById('cancion-form-title').textContent = '➕ Nueva Canción';
    form.reset();
    document.getElementById('cancion-cancel').style.display = 'none';
    document.getElementById('cancion-delete').style.display = 'none';
    displayCanciones(allCanciones);
}

function restoreAdminSongPreview() {
    if (new URLSearchParams(location.search).get('restaurarCancion') !== '1') return;
    let draft;
    try { draft = JSON.parse(sessionStorage.getItem('gen_admin_song_preview') || 'null'); } catch { draft = null; }
    if (!draft) return;
    if (draft.id) {
        const existing = allCanciones.find(song => String(song.id) === String(draft.id));
        if (existing) editCancion(existing);
    }
    document.getElementById('cancion-titulo').value = draft.titulo || '';
    document.getElementById('cancion-artista').value = draft.artista || '';
    document.getElementById('cancion-letra').value = draft.letra || '';
    document.getElementById('cancion-tono').value = draft.tono || '';
    document.getElementById('cancion-idioma').value = draft.idioma || 'Español';
    document.getElementById('cancion-categoria').value = draft.categoria || 'gen';
    document.getElementById('cancion-estado').value = draft.estado || 'pendiente';
    history.replaceState(null, '', 'admin.html#cancionero');
}

function setupCancioneroListeners() {
    const search = document.getElementById('cancion-search');
    const filterEstado = document.getElementById('cancion-filter-estado');
    const filterCategoria = document.getElementById('cancion-filter-categoria');
    const form = document.getElementById('cancion-form');
    const cancelBtn = document.getElementById('cancion-cancel');
    const deleteBtn = document.getElementById('cancion-delete');
    const previewBtn = document.getElementById('cancion-preview');
    const selectAllPending = document.getElementById('cancion-select-all-pending');
    const approveSelected = document.getElementById('cancion-approve-selected');
    if (!form || form.dataset.adminBound === 'true') return;
    form.dataset.adminBound = 'true';

    if (search) search.addEventListener('input', filterCanciones);
    if (filterEstado) filterEstado.addEventListener('change', filterCanciones);
    if (filterCategoria) filterCategoria.addEventListener('change', filterCanciones);
    if (selectAllPending) selectAllPending.addEventListener('change', () => {
        if (!isFullAdmin()) return;
        visibleSongAdminItems.filter(song => (song.estado || 'pendiente') === 'pendiente').forEach(song => {
            if (selectAllPending.checked) selectedSongApprovalIds.add(song.id);
            else selectedSongApprovalIds.delete(song.id);
        });
        displayCanciones(visibleSongAdminItems);
    });
    if (approveSelected) approveSelected.addEventListener('click', approveSelectedSongs);

    if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formEditingId = form.dataset.editingId || null;

        const data = {
            titulo: document.getElementById('cancion-titulo').value.trim(),
            artista: document.getElementById('cancion-artista').value.trim(),
            letra: document.getElementById('cancion-letra').value.trim(),
            tono: document.getElementById('cancion-tono').value.trim(),
            idioma: document.getElementById('cancion-idioma').value,
            categoria: document.getElementById('cancion-categoria').value,
            estado: document.getElementById('cancion-estado').value,
            reproducciones: 0,
            fechaCreacion: new Date(),
            activa: true
        };
        
        if (!parseSongContent(data.letra).chords.length) {
            return alert('La canción debe contener al menos un acorde reconocido.');
        }

        if (formEditingId) {
            const cancionExistente = allCanciones.find(c => c.id === formEditingId);
            if (cancionExistente && cancionExistente.reproducciones) {
                data.reproducciones = cancionExistente.reproducciones;
            }
            if (cancionExistente && cancionExistente.fechaCreacion) {
                data.fechaCreacion = cancionExistente.fechaCreacion;
            }
        }
        
        try {
            if (formEditingId) {
                await utils.setDoc(utils.doc(db, 'canciones', formEditingId), data, { merge: true });
            } else {
                const id = `cancion_${Date.now()}`;
                await utils.setDoc(utils.doc(db, 'canciones', id), data);
            }
            alert('✅ Canción guardada con éxito');
            resetCancionForm();
            loadCanciones();
        } catch (error) {
            console.error('Error al guardar canción:', error);
            alert('❌ Error al guardar la canción: ' + error.message);
        }
    });

    if (cancelBtn) cancelBtn.addEventListener('click', resetCancionForm);

    if (previewBtn) previewBtn.addEventListener('click', () => {
        const draft = {
            id: form.dataset.editingId || '',
            titulo: document.getElementById('cancion-titulo').value.trim() || 'Canción sin título',
            artista: document.getElementById('cancion-artista').value.trim(),
            letra: document.getElementById('cancion-letra').value,
            tono: document.getElementById('cancion-tono').value.trim(),
            idioma: document.getElementById('cancion-idioma').value,
            categoria: document.getElementById('cancion-categoria').value,
            estado: document.getElementById('cancion-estado').value
        };
        if (!draft.letra.trim()) return alert('Pegá la canción antes de abrir la vista previa.');
        sessionStorage.setItem('gen_admin_song_preview', JSON.stringify(draft));
        window.location.href = '../cancionero/cancion.html?preview=1&admin=1';
    });

    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
        if (!editingId) return;
        if (confirm('¿Estás seguro de eliminar esta canción?')) {
            try {
                await utils.deleteDoc(utils.doc(db, 'canciones', editingId));
                alert('✅ Canción eliminada con éxito');
                resetCancionForm();
                loadCanciones();
            } catch (error) {
                console.error('Error al eliminar canción:', error);
                alert('❌ Error al eliminar la canción');
            }
        }
    });
}

async function approveSelectedSongs() {
    if (!isFullAdmin() || !selectedSongApprovalIds.size) return;
    const songs = allCanciones.filter(song => selectedSongApprovalIds.has(song.id) && (song.estado || 'pendiente') === 'pendiente');
    if (!songs.length) {
        selectedSongApprovalIds.clear();
        updateSongBulkActions();
        return;
    }
    if (!confirm(`¿Aprobar y publicar ${songs.length} canción${songs.length === 1 ? '' : 'es'}?`)) return;
    const button = document.getElementById('cancion-approve-selected');
    if (button) { button.disabled = true; button.textContent = 'Publicando…'; }
    try {
        for (let offset = 0; offset < songs.length; offset += ADMIN_BATCH_SIZE) {
            const batch = utils.writeBatch(db);
            songs.slice(offset, offset + ADMIN_BATCH_SIZE).forEach(song => {
                batch.update(utils.doc(db, 'canciones', song.id), { estado: 'publicado', activa: true });
            });
            await batch.commit();
        }
        selectedSongApprovalIds.clear();
        await loadCanciones();
    } catch (error) {
        console.error('No se pudieron aprobar las canciones seleccionadas:', error);
        alert(`No se pudieron aprobar todas las canciones: ${error.message}`);
    } finally {
        if (button) { button.textContent = 'Aprobar seleccionadas'; updateSongBulkActions(); }
    }
}

function filterCanciones() {
    const search = document.getElementById('cancion-search').value.toLowerCase();
    const filterEstado = document.getElementById('cancion-filter-estado').value;
    const filterCategoria = document.getElementById('cancion-filter-categoria').value;
    
    let filtered = allCanciones.filter(c => {
        const matchSearch = (c.titulo || '').toLowerCase().includes(search) ||
                           (c.artista || '').toLowerCase().includes(search);
        const matchEstado = !filterEstado || (c.estado || 'pendiente') === filterEstado;
        const matchCategoria = !filterCategoria || normalizeCancionCategory(c.categoria) === filterCategoria;
        return matchSearch && matchEstado && matchCategoria;
    });
    
    displayCanciones(filtered);
}

// ==================== AUDIOS DEL CANCIONERO ====================

const AUDIO_PROVIDER_LABELS = {
    youtube: 'YouTube', spotify: 'Spotify', soundcloud: 'SoundCloud', drive: 'Google Drive',
    bandcamp: 'Bandcamp', applemusic: 'Apple Music', vimeo: 'Vimeo', directo: 'Audio directo', externo: 'Enlace externo'
};
const AUDIO_TYPE_LABELS = {
    guia: 'Guía', oficial: 'Versión oficial', en_vivo: 'En vivo', cover: 'Cover', remix: 'Remix',
    instrumental: 'Instrumental', voces: 'Voces', otra: 'Otro audio'
};
const AUDIO_STATE_LABELS = {
    pendiente: 'Pendiente', publicado: 'Publicado', rechazado: 'Rechazado', archivado: 'Archivado'
};
const AUDIO_PUBLIC_FIELDS = [
    'cancionId', 'cancionTitulo', 'url', 'proveedor', 'modoReproduccion', 'tipo',
    'version', 'versionVocal', 'tipoVoz', 'interprete', 'idioma', 'nombre', 'descripcion', 'estado', 'esPrincipal',
    'versionId', 'versionPrincipal'
];

function publicAudioData(audio) {
    return Object.fromEntries(AUDIO_PUBLIC_FIELDS.map(field => [field, audio[field] ?? (['esPrincipal', 'versionPrincipal'].includes(field) ? false : '')]));
}

function audioToken(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general';
}

function audioVersionId(audio) {
    if (audio.versionId) return String(audio.versionId);
    return `legacy-${[audio.cancionId, audio.tipo, audio.version, audio.versionVocal, audio.tipoVoz, audio.interprete, audio.idioma].map(audioToken).join('-')}`;
}

function automaticAudioVersionId(audio) {
    return `auto-${[audio.cancionId, audio.tipo, audio.versionVocal, audio.tipoVoz, audio.interprete, audio.idioma].map(audioToken).join('-')}`;
}

function audioVersionGroups(items = allCancionAudios.filter(audio => audio.estado === 'publicado')) {
    const groups = new Map();
    items.forEach(audio => {
        const id = audioVersionId(audio);
        if (!groups.has(id)) groups.set(id, { id, sources: [], songId: String(audio.cancionId || '') });
        groups.get(id).sources.push(audio);
    });
    return [...groups.values()].map(group => ({
        ...group,
        representative: group.sources.find(source => source.esPrincipal) || group.sources[0],
        principal: group.sources.some(source => source.versionPrincipal || source.esPrincipal)
    }));
}

function audioVersionLabel(group) {
    const audio = group.representative;
    const providers = [...new Set(group.sources.map(source => AUDIO_PROVIDER_LABELS[source.proveedor] || 'Enlace externo'))];
    const sourceLabel = providers.length === 1 ? `Fuente: ${providers[0]}` : `Fuentes: ${providers.join(', ')}`;
    const versionLabel = audio.tipo === 'voces'
        ? [AUDIO_TYPE_LABELS[audio.tipo], audio.versionVocal, audio.tipoVoz, audio.interprete].filter(Boolean).join(' · ')
        : [AUDIO_TYPE_LABELS[audio.tipo] || 'Otro', audio.interprete, audio.idioma].filter(Boolean).join(' · ');
    return `${versionLabel} · ${sourceLabel}`;
}

async function syncPublicAudioCatalog() {
    // La consulta debe expresar la misma condición que las reglas públicas.
    // Firestore no permite listar la colección completa aunque actualmente
    // todos sus documentos sean publicados.
    const publicQuery = utils.query(
        utils.collection(db, 'cancion_audios_publicos'),
        utils.where('estado', '==', 'publicado')
    );
    const publicSnapshot = await utils.getDocs(publicQuery);
    const current = new Map(publicSnapshot.docs.map(document => [document.id, { id: document.id, ...document.data() }]));
    const published = new Map(allCancionAudios.filter(audio => audio.estado === 'publicado')
        .map(audio => [audio.id, publicAudioData(audio)]));
    const operations = [];
    const affectedSongs = new Set();

    published.forEach((data, id) => {
        const before = current.get(id);
        if (!before || JSON.stringify(publicAudioData(before)) !== JSON.stringify(data)) {
            operations.push({ type: 'set', ref: utils.doc(db, 'cancion_audios_publicos', id), data });
            affectedSongs.add(data.cancionId);
        }
    });
    current.forEach((audio, id) => {
        if (!published.has(id)) {
            operations.push({ type: 'delete', ref: utils.doc(db, 'cancion_audios_publicos', id) });
            affectedSongs.add(audio.cancionId);
        }
    });
    for (let offset = 0; offset < operations.length; offset += ADMIN_BATCH_SIZE) {
        const batch = utils.writeBatch(db);
        operations.slice(offset, offset + ADMIN_BATCH_SIZE).forEach(operation => {
            if (operation.type === 'set') batch.set(operation.ref, operation.data);
            else batch.delete(operation.ref);
        });
        await batch.commit();
    }
    affectedSongs.forEach(songId => {
        try { sessionStorage.removeItem(`gen_song_audio_lookup_v1:${songId}`); } catch { /* Caché opcional. */ }
    });
    return operations.length;
}

function detectAudioProvider(value) {
    let url;
    try { url = new URL(value); } catch { return 'externo'; }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'youtube';
    if (host.endsWith('spotify.com')) return 'spotify';
    if (host.endsWith('soundcloud.com')) return 'soundcloud';
    if (host.endsWith('drive.google.com') || host.endsWith('docs.google.com')) return 'drive';
    if (host.endsWith('bandcamp.com')) return 'bandcamp';
    if (host.endsWith('music.apple.com')) return 'applemusic';
    if (host.endsWith('vimeo.com')) return 'vimeo';
    if (/\.(mp3|m4a|aac|ogg|wav)(?:$|\?)/i.test(url.pathname + url.search)) return 'directo';
    return 'externo';
}

function selectedAudioSong() {
    const id = document.getElementById('audio-cancion')?.value || '';
    return allCanciones.find(song => String(song.id) === String(id)) || null;
}

function updateCurrentPrincipalNotice() {
    const notice = document.getElementById('audio-current-principal');
    if (!notice) return;
    const songId = document.getElementById('audio-cancion')?.value || '';
    const principal = allCancionAudios.find(audio => String(audio.cancionId) === String(songId) && audio.esPrincipal);
    notice.replaceChildren();
    notice.hidden = !principal;
    if (!principal) return;
    const heading = document.createElement('strong');
    heading.textContent = principal.id === editingAudioId ? 'Este es el audio principal actual' : 'Audio principal actual';
    const detail = document.createElement('span');
    detail.textContent = principal.nombre || principal.version || principal.interprete || 'Audio sin nombre';
    notice.append(heading, detail);
}

function generatedAudioName(values = {}) {
    const song = values.song || selectedAudioSong();
    const title = song?.titulo || 'Canción sin seleccionar';
    const language = values.idioma ?? document.getElementById('audio-idioma')?.value ?? '';
    const type = values.tipo ?? document.getElementById('audio-tipo')?.value ?? 'oficial';
    const voiceVersion = (values.versionVocal ?? document.getElementById('audio-version-vocal')?.value ?? '').trim();
    const voiceType = (values.tipoVoz ?? document.getElementById('audio-tipo-voz')?.value ?? '').trim();
    const performer = (values.interprete ?? document.getElementById('audio-interprete')?.value ?? '').trim();
    const url = values.url ?? document.getElementById('audio-url')?.value ?? '';
    const provider = values.proveedor ?? document.getElementById('audio-proveedor')?.value ?? detectAudioProvider(url);
    const versionLabel = type === 'voces'
        ? [AUDIO_TYPE_LABELS[type], voiceVersion, voiceType].filter(Boolean).join(' · ')
        : AUDIO_TYPE_LABELS[type] || 'Otro';
    const qualifiers = [language ? `(${language})` : '', '—', versionLabel].filter(Boolean);
    const source = type === 'oficial' && url ? AUDIO_PROVIDER_LABELS[provider] || 'Enlace externo' : '';
    return `${title} ${qualifiers.join(' ')}${performer ? ` · ${performer}` : ''}${source ? ` · ${source}` : ''}`.replace(/\s+/g, ' ').trim();
}

function updateAudioFormPreview() {
    const input = document.getElementById('audio-url');
    const providerSelect = document.getElementById('audio-proveedor');
    const nameInput = document.getElementById('audio-nombre');
    if (!input || !providerSelect || !nameInput) return;
    const voice = document.getElementById('audio-tipo')?.value === 'voces';
    const voiceFields = document.getElementById('audio-voice-fields');
    if (voiceFields) voiceFields.hidden = !voice;
    const provider = detectAudioProvider(input.value.trim());
    if (input.value.trim()) providerSelect.value = provider;
    nameInput.value = generatedAudioName();
    const help = document.getElementById('audio-url-help');
    if (help) help.textContent = input.value.trim()
        ? `Detectado: ${AUDIO_PROVIDER_LABELS[provider] || 'Enlace externo'}. Se validará antes de guardar.`
        : 'La plataforma se detectará automáticamente.';
    const preview = document.getElementById('audio-admin-preview');
    if (preview) {
        preview.hidden = !input.value.trim();
        preview.replaceChildren();
        if (input.value.trim()) {
            const link = document.createElement('a');
            link.href = input.value.trim();
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = `Probar enlace en ${AUDIO_PROVIDER_LABELS[provider] || 'la plataforma'} ↗`;
            preview.append(link);
        }
    }
}

function populateAudioSongSelect() {
    const select = document.getElementById('audio-cancion');
    if (!select) return;
    const selected = select.value;
    select.replaceChildren(new Option('Elegí una canción', ''));
    [...allCanciones]
        .filter(song => !song._offlineDeleted)
        .sort((a, b) => String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es'))
        .forEach(song => select.add(new Option(`${song.titulo || 'Sin título'} · ${song.artista || 'Sin artista'}`, song.id)));
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
}

async function loadCancionAudios() {
    const list = document.getElementById('audio-list');
    const publishedList = document.getElementById('audio-published-list');
    const issuesList = document.getElementById('audio-issues-list');
    if (!list || !publishedList || !issuesList) return;
    populateAudioSongSelect();
    list.innerHTML = '<p class="field-help">Cargando audios…</p>';
    publishedList.innerHTML = '<p class="field-help">Cargando audios publicados…</p>';
    ['audio-missing-official-list', 'audio-multiple-principal-list', 'audio-incomplete-source-list'].forEach(id => {
        const container = document.getElementById(id);
        if (container) container.innerHTML = '<p class="field-help">Revisando…</p>';
    });
    try {
        const snapshot = await utils.getDocs(utils.query(
            utils.collection(db, 'cancion_audios'),
            utils.limit(ADMIN_QUERY_LIMIT)
        ));
        allCancionAudios = snapshot.docs.map(document => ({ id: document.id, ...document.data() }))
            .filter(audio => !audio._offlineDeleted)
            .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
        const syncStatus = document.getElementById('audio-sync-status');
        try {
            const changes = await syncPublicAudioCatalog();
            if (syncStatus) {
                syncStatus.textContent = changes
                    ? `Catálogo público actualizado: ${changes} cambio${changes === 1 ? '' : 's'}.`
                    : 'Catálogo público sincronizado.';
                syncStatus.dataset.state = 'success';
            }
        } catch (error) {
            console.warn('No se pudo actualizar el catálogo público de audios:', error);
            if (syncStatus) {
                syncStatus.textContent = error?.code === 'permission-denied'
                    ? 'No se pudo publicar el catálogo de audios. Revisá que las reglas nuevas estén publicadas en Firebase.'
                    : 'No se pudo sincronizar el catálogo público de audios. Recargá e intentá nuevamente.';
                syncStatus.dataset.state = 'error';
            }
        }
        displayCancionAudios();
    } catch (error) {
        console.error('Error al cargar audios del cancionero:', error);
        const denied = error?.code === 'permission-denied';
        const message = denied
            ? 'No hay permiso para leer los audios. Publicá las reglas actuales de Firestore.'
            : 'No se pudieron cargar los audios. Intentá nuevamente.';
        if (denied) {
            try {
                const publicSnapshot = await utils.getDocs(utils.query(
                    utils.collection(db, 'cancion_audios_publicos'),
                    utils.where('estado', '==', 'publicado'),
                    utils.limit(ADMIN_QUERY_LIMIT)
                ));
                allCancionAudios = publicSnapshot.docs.map(document => ({ id: document.id, ...document.data() }));
                displayCancionAudios();
                list.innerHTML = '<div class="audio-permission-notice"><strong>Las propuestas están bloqueadas por permisos</strong><span>El catálogo público sí pudo cargarse. Publicá las reglas actualizadas de Firestore para revisar propuestas y guardar cambios.</span></div>';
                const syncStatus = document.getElementById('audio-sync-status');
                if (syncStatus) {
                    syncStatus.textContent = 'Vista de solo lectura: falta habilitar el permiso de Cancionero en Firestore.';
                    syncStatus.dataset.state = 'error';
                }
                return;
            } catch (publicError) {
                console.error('Tampoco se pudo cargar el catálogo público de audios:', publicError);
            }
        }
        list.innerHTML = `<p class="field-help">${message}</p>`;
        publishedList.innerHTML = `<p class="field-help">${message}</p>`;
        ['audio-missing-official-list', 'audio-multiple-principal-list', 'audio-incomplete-source-list'].forEach(id => {
            const container = document.getElementById(id);
            if (container) container.innerHTML = `<p class="field-help">${message}</p>`;
        });
    }
}

function displayCancionAudios() {
    const proposalList = document.getElementById('audio-list');
    const publishedList = document.getElementById('audio-published-list');
    const issuesList = document.getElementById('audio-issues-list');
    if (!proposalList || !publishedList || !issuesList) return;
    const search = (document.getElementById('audio-search')?.value || '').trim().toLowerCase();
    const provider = document.getElementById('audio-filter-provider')?.value || '';
    const stateFilter = document.getElementById('audio-filter-state')?.value || '';
    const matchingItems = allCancionAudios.filter(audio => {
        const haystack = [audio.nombre, audio.interprete, audio.version, audio.descripcion, audio.cancionTitulo, audio.creadoPorNombre].join(' ').toLowerCase();
        return (!search || haystack.includes(search))
            && (!provider || audio.proveedor === provider);
    });
    const proposals = matchingItems.filter(audio => audio.estado !== 'publicado' && (!stateFilter || (audio.estado || 'pendiente') === stateFilter));
    const allPublishedAudios = allCancionAudios.filter(audio => audio.estado === 'publicado');

    const renderItems = (container, items, emptyMessage) => {
        container.replaceChildren();
        if (!items.length) {
            const empty = document.createElement('p');
            empty.className = 'field-help';
            empty.textContent = emptyMessage;
            container.append(empty);
            return;
        }
        items.forEach(audio => container.append(createCancionAudioListItem(audio)));
    };

    const versions = audioVersionGroups(allPublishedAudios);
    const catalogSongs = new Map();
    versions.forEach(version => {
        if (!catalogSongs.has(version.songId)) catalogSongs.set(version.songId, []);
        catalogSongs.get(version.songId).push(version);
    });
    const allPublishedVersions = audioVersionGroups(allPublishedAudios);
    const versionsBySong = new Map();
    allPublishedVersions.forEach(version => {
        if (!versionsBySong.has(version.songId)) versionsBySong.set(version.songId, []);
        versionsBySong.get(version.songId).push(version);
    });
    const publishedSongs = allCanciones.filter(song => !song._offlineDeleted && ['publicado', 'publicada'].includes(song.estado));
    const catalogSearch = (document.getElementById('audio-catalog-search')?.value || '').trim().toLowerCase();
    const visibleCatalogSongs = publishedSongs.filter(song => !catalogSearch || [song.titulo, song.artista].join(' ').toLowerCase().includes(catalogSearch));
    const songsWithAudio = publishedSongs.filter(song => catalogSongs.has(String(song.id))).length;
    const missingOfficial = publishedSongs.filter(song => !allPublishedAudios.some(audio =>
        String(audio.cancionId) === String(song.id) && audio.tipo === 'oficial'
    ));
    const multiplePrincipal = [];
    versionsBySong.forEach(songVersions => {
        const principals = songVersions.filter(version => version.principal);
        if (principals.length > 1) multiplePrincipal.push({
            audio: principals[0].representative,
            message: `${principals.length} versiones están marcadas como principales`
        });
    });
    const incompleteSources = allPublishedAudios.filter(audio => !String(audio.url || '').trim() || !String(audio.cancionId || '').trim());
    const totalIssues = missingOfficial.length + multiplePrincipal.length + incompleteSources.length;

    document.getElementById('audio-list-count').textContent = `${proposals.length} propuesta${proposals.length === 1 ? '' : 's'}`;
    document.getElementById('audio-published-count').textContent = `${songsWithAudio} con audio · ${publishedSongs.length - songsWithAudio} sin audio`;
    document.getElementById('audio-issues-count').textContent = `${totalIssues} caso${totalIssues === 1 ? '' : 's'}`;
    document.getElementById('audio-pending-tab-count').textContent = proposals.length;
    document.getElementById('audio-catalog-tab-count').textContent = publishedSongs.length;
    document.getElementById('audio-issues-tab-count').textContent = totalIssues;
    document.getElementById('audio-missing-official-count').textContent = missingOfficial.length;
    document.getElementById('audio-multiple-principal-count').textContent = multiplePrincipal.length;
    document.getElementById('audio-incomplete-source-count').textContent = incompleteSources.length;
    renderItems(proposalList, proposals, 'No hay propuestas para mostrar.');
    renderAudioCatalog(publishedList, catalogSongs, visibleCatalogSongs);
    renderMissingOfficialSongs(document.getElementById('audio-missing-official-list'), missingOfficial);
    renderAudioIssues(document.getElementById('audio-multiple-principal-list'), multiplePrincipal, 'No hay canciones con más de una versión principal.');
    renderAudioIssues(document.getElementById('audio-incomplete-source-list'), incompleteSources.map(audio => ({ audio, message: 'Falta el enlace o la canción asociada' })), 'No hay fuentes incompletas.');
}

function renderAudioIssues(container, issues, emptyMessage) {
    if (!container) return;
    container.replaceChildren();
    if (!issues.length) {
        const empty = document.createElement('p'); empty.className = 'field-help'; empty.textContent = emptyMessage; container.append(empty); return;
    }
    issues.forEach(issue => {
        const item = createCancionAudioListItem(issue.audio);
        item.querySelector('small').textContent = issue.message;
        container.append(item);
    });
}

function renderMissingOfficialSongs(container, songs) {
    if (!container) return;
    container.replaceChildren();
    if (!songs.length) {
        const empty = document.createElement('p'); empty.className = 'field-help'; empty.textContent = 'Todas las canciones publicadas tienen una versión oficial.'; container.append(empty); return;
    }
    songs.sort((a, b) => String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es')).forEach(song => {
        const pendingOfficial = allCancionAudios.find(audio => String(audio.cancionId) === String(song.id) && audio.tipo === 'oficial' && audio.estado !== 'publicado');
        const item = document.createElement(pendingOfficial ? 'button' : 'div');
        if (pendingOfficial) item.type = 'button';
        item.className = 'item audio-admin-item audio-missing-official-item';
        const copy = document.createElement('span'); copy.className = 'audio-admin-copy';
        const title = document.createElement('strong'); title.textContent = song.titulo || 'Canción sin título';
        const detail = document.createElement('small'); detail.textContent = pendingOfficial
            ? 'Hay una propuesta oficial pendiente: abrila para revisarla'
            : 'Todavía no se recibió una versión oficial';
        copy.append(title, detail);
        const badge = document.createElement('span'); badge.className = `item-badge ${pendingOfficial ? 'badge-pendiente' : 'badge-archivado'}`; badge.textContent = pendingOfficial ? 'Propuesta pendiente' : 'Sin oficial';
        item.append(copy, badge);
        if (pendingOfficial) item.addEventListener('click', () => editCancionAudio(pendingOfficial));
        container.append(item);
    });
}

function renderAudioCatalog(container, versionsBySong, songs) {
    container.replaceChildren();
    if (!songs.length) {
        const empty = document.createElement('p'); empty.className = 'field-help'; empty.textContent = 'No encontramos canciones con esa búsqueda.'; container.append(empty); return;
    }
    [...songs].sort((a, b) => String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es')).forEach(songData => {
        const versions = versionsBySong.get(String(songData.id)) || [];
        const song = document.createElement('section'); song.className = `audio-song-group${versions.length ? ' has-audio' : ' no-audio'}`;
        const heading = document.createElement('div'); heading.className = 'audio-song-heading';
        const headingCopy = document.createElement('div'); headingCopy.className = 'audio-song-heading-copy';
        const title = document.createElement('h3'); title.textContent = songData.titulo || 'Canción sin título';
        const artist = document.createElement('small'); artist.textContent = songData.artista || 'Sin artista';
        headingCopy.append(title, artist);
        const status = document.createElement('span'); status.className = `audio-song-status ${versions.length ? 'has-audio' : 'no-audio'}`;
        status.textContent = versions.length ? 'Tiene audio' : 'Sin audio';
        heading.append(headingCopy, status); song.append(heading);
        if (!versions.length) {
            const empty = document.createElement('p'); empty.className = 'audio-song-empty'; empty.textContent = 'Esta canción todavía no tiene audios publicados.'; song.append(empty); container.append(song); return;
        }
        versions.sort((a, b) => Number(b.principal) - Number(a.principal) || audioVersionLabel(a).localeCompare(audioVersionLabel(b), 'es')).forEach(version => {
            const box = document.createElement('div'); box.className = 'audio-version-group';
            const versionHeading = document.createElement('div'); versionHeading.className = 'audio-version-heading';
            const label = document.createElement('strong'); label.textContent = audioVersionLabel(version);
            const badges = document.createElement('span'); badges.className = 'audio-version-badges';
            if (version.principal) { const badge = document.createElement('span'); badge.textContent = 'Principal'; badges.append(badge); }
            const sources = document.createElement('span'); sources.textContent = `${version.sources.length} fuente${version.sources.length === 1 ? '' : 's'}`; badges.append(sources);
            versionHeading.append(label, badges); box.append(versionHeading);
            const sourceList = document.createElement('div'); sourceList.className = 'audio-source-list';
            version.sources.forEach(source => {
                const row = document.createElement('div'); row.className = 'audio-catalog-source';
                const copy = document.createElement('div'); copy.className = 'audio-catalog-source-copy';
                const label = document.createElement('strong'); label.textContent = AUDIO_PROVIDER_LABELS[source.proveedor] || 'Enlace';
                const detail = document.createElement('small'); detail.textContent = source.descripcion || source.nombre || 'Audio publicado';
                copy.append(label, detail);
                const actions = document.createElement('div'); actions.className = 'audio-catalog-source-actions';
                const open = document.createElement('a'); open.href = source.url || '#'; open.target = '_blank'; open.rel = 'noopener noreferrer'; open.textContent = 'Abrir ↗';
                const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Editar';
                edit.addEventListener('click', () => {
                    document.querySelector('.audio-admin-grid')?.classList.add('is-editing');
                    editCancionAudio(source);
                });
                actions.append(open, edit); row.append(copy, actions); sourceList.append(row);
            });
            box.append(sourceList); song.append(box);
        });
        container.append(song);
    });
}

function createCancionAudioListItem(audio, compact = false) {
        const item = document.createElement('button');
        item.type = 'button';
        item.dataset.audioId = audio.id;
        item.className = `item audio-admin-item${editingAudioId === audio.id ? ' active' : ''}`;
        const copy = document.createElement('span'); copy.className = 'audio-admin-copy';
        const title = document.createElement('strong'); title.textContent = compact ? (AUDIO_PROVIDER_LABELS[audio.proveedor] || 'Enlace') : (audio.cancionTitulo || audio.nombre || 'Audio sin canción');
        const detailParts = [AUDIO_PROVIDER_LABELS[audio.proveedor] || 'Enlace'];
        if (audio.nombre && audio.nombre !== audio.cancionTitulo) detailParts.push(audio.nombre);
        if (audio.versionVocal) detailParts.push(`Voces: ${audio.versionVocal}`);
        if (audio.tipoVoz) detailParts.push(`Tipo de voz: ${audio.tipoVoz}`);
        if (audio.interprete) detailParts.push(`Intérprete: ${audio.interprete}`);
        if (audio.idioma) detailParts.push(`Idioma: ${audio.idioma}`);
        if (audio.creadoPorNombre) detailParts.push(`Subido por ${audio.creadoPorNombre}`);
        if (audio.descripcion) detailParts.push(audio.descripcion);
        if (audio.esPrincipal) detailParts.push('Principal');
        const detail = document.createElement('small'); detail.textContent = detailParts.join(' · ');
        copy.append(title, detail);
        const audioState = audio.estado || 'pendiente';
        const badge = document.createElement('span'); badge.className = `item-badge badge-${audioState}`; badge.textContent = AUDIO_STATE_LABELS[audioState] || 'Pendiente';
        item.append(copy, badge);
        item.addEventListener('click', () => editCancionAudio(audio));
        return item;
}

function editCancionAudio(audio) {
    editingAudioId = audio.id;
    const isPublished = audio.estado === 'publicado';
    document.getElementById('audio-form-title').textContent = isPublished ? 'Editar audio publicado' : 'Revisar propuesta';
    document.getElementById('audio-submitter').value = audio.creadoPorNombre || 'No informado';
    document.getElementById('audio-submitter-group').hidden = false;
    document.getElementById('audio-cancion').value = audio.cancionId || '';
    document.getElementById('audio-url').value = audio.url || '';
    document.getElementById('audio-proveedor').value = audio.proveedor || 'externo';
    document.getElementById('audio-tipo').value = audio.tipo || 'oficial';
    document.getElementById('audio-version-vocal').value = audio.versionVocal || '';
    document.getElementById('audio-tipo-voz').value = audio.tipoVoz || '';
    document.getElementById('audio-interprete').value = audio.interprete || '';
    document.getElementById('audio-descripcion').value = audio.descripcion || '';
    document.getElementById('audio-idioma').value = audio.idioma || '';
    document.getElementById('audio-estado').value = audio.estado || 'pendiente';
    document.getElementById('audio-principal').checked = Boolean(audio.esPrincipal) || audio.tipo === 'oficial';
    document.getElementById('audio-permisos').checked = Boolean(audio.permisosConfirmados);
    document.getElementById('audio-cancel').hidden = false;
    document.getElementById('audio-delete').hidden = false;
    document.getElementById('audio-approve').hidden = isPublished;
    document.getElementById('audio-reject').hidden = isPublished;
    document.getElementById('audio-save').textContent = isPublished ? 'Guardar cambios' : 'Guardar revisión';
    updateAudioFormPreview();
    updateCurrentPrincipalNotice();
    document.querySelectorAll('.audio-admin-item').forEach(item => item.classList.toggle('active', item.dataset.audioId === audio.id));
    if (window.matchMedia('(max-width: 820px)').matches) {
        document.getElementById('audio-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function resetAudioForm() {
    editingAudioId = null;
    const form = document.getElementById('audio-form');
    form?.reset();
    document.getElementById('audio-form-title').textContent = 'Seleccioná una propuesta';
    document.getElementById('audio-submitter').value = '';
    document.getElementById('audio-submitter-group').hidden = true;
    document.getElementById('audio-cancel').hidden = true;
    document.getElementById('audio-delete').hidden = true;
    document.getElementById('audio-approve').hidden = true;
    document.getElementById('audio-reject').hidden = true;
    document.getElementById('audio-save').textContent = 'Guardar revisión';
    document.getElementById('audio-admin-preview').hidden = true;
    document.getElementById('audio-current-principal').hidden = true;
    document.querySelectorAll('.audio-admin-item.active').forEach(item => item.classList.remove('active'));
    document.querySelector('.audio-admin-grid')?.classList.remove('is-editing');
    updateAudioFormPreview();
}

function setupAudioAdmin() {
    const root = document.querySelector('.audio-admin-grid');
    const tabs = document.querySelector('.audio-admin-tabs');
    const section = document.getElementById('audios-section');
    if (section) {
        if (tabs && tabs.parentElement !== section) section.append(tabs);
        if (root && root.parentElement !== section) section.append(root);
    }
    const form = document.getElementById('audio-form');
    if (!form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';
    document.querySelectorAll('[data-audio-view]').forEach(button => {
        if (!button.closest('.audio-admin-tabs')) return;
        button.addEventListener('click', () => {
            document.querySelectorAll('.audio-admin-tabs [data-audio-view]').forEach(tab => tab.classList.toggle('active', tab === button));
            root.dataset.audioView = button.dataset.audioView;
            if (button.dataset.audioView !== 'catalog') root.classList.remove('is-editing');
        });
    });
    ['audio-cancion', 'audio-url', 'audio-tipo', 'audio-version-vocal', 'audio-tipo-voz', 'audio-interprete', 'audio-idioma']
        .forEach(id => document.getElementById(id)?.addEventListener('input', updateAudioFormPreview));
    document.getElementById('audio-cancion')?.addEventListener('change', () => {
        updateCurrentPrincipalNotice();
    });
    document.getElementById('audio-tipo')?.addEventListener('change', event => {
        if (event.target.value === 'oficial') document.getElementById('audio-principal').checked = true;
    });
    document.getElementById('audio-search')?.addEventListener('input', displayCancionAudios);
    document.getElementById('audio-catalog-search')?.addEventListener('input', displayCancionAudios);
    document.getElementById('audio-filter-state')?.addEventListener('change', displayCancionAudios);
    document.getElementById('audio-filter-provider')?.addEventListener('change', displayCancionAudios);
    document.getElementById('audio-cancel')?.addEventListener('click', resetAudioForm);
    document.getElementById('audio-approve')?.addEventListener('click', () => {
        if (!editingAudioId) return;
        document.getElementById('audio-estado').value = 'publicado';
        form.requestSubmit();
    });
    document.getElementById('audio-reject')?.addEventListener('click', () => {
        if (!editingAudioId || !confirm('¿Rechazar esta propuesta de audio?')) return;
        document.getElementById('audio-estado').value = 'rechazado';
        form.requestSubmit();
    });
    document.getElementById('audio-delete')?.addEventListener('click', async () => {
        if (!editingAudioId || !confirm('¿Eliminar esta asociación de audio? El archivo externo no se eliminará.')) return;
        await utils.deleteDoc(utils.doc(db, 'cancion_audios', editingAudioId));
        resetAudioForm(); await loadCancionAudios();
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!editingAudioId) return alert('Seleccioná una propuesta de la bandeja para revisarla.');
        const song = selectedAudioSong();
        const url = document.getElementById('audio-url').value.trim();
        if (!song) return alert('Elegí una canción.');
        try { new URL(url); } catch { return alert('El enlace no es válido.'); }
        if (document.getElementById('audio-tipo').value === 'voces'
            && (!document.getElementById('audio-version-vocal').value.trim() || !document.getElementById('audio-tipo-voz').value.trim())) {
            return alert('Completá la versión de voces y el tipo de voz.');
        }
        const provider = document.getElementById('audio-proveedor').value || detectAudioProvider(url);
        const currentAudio = allCancionAudios.find(audio => audio.id === editingAudioId);
        const wantsPrincipal = document.getElementById('audio-principal').checked;
        const data = {
            cancionId: String(song.id), cancionTitulo: song.titulo || '', proveedor: provider, url,
            modoReproduccion: ['youtube', 'spotify', 'soundcloud', 'drive', 'vimeo'].includes(provider) ? 'embed' : provider === 'directo' ? 'audio' : 'externo',
            tipo: document.getElementById('audio-tipo').value,
            version: currentAudio?.version || '',
            versionVocal: document.getElementById('audio-tipo').value === 'voces' ? document.getElementById('audio-version-vocal').value.trim() : '',
            tipoVoz: document.getElementById('audio-tipo').value === 'voces' ? document.getElementById('audio-tipo-voz').value.trim() : '',
            interprete: document.getElementById('audio-interprete').value.trim(),
            descripcion: document.getElementById('audio-descripcion').value.trim(),
            idioma: document.getElementById('audio-idioma').value,
            estado: document.getElementById('audio-estado').value,
            versionId: '',
            versionPrincipal: wantsPrincipal,
            esPrincipal: wantsPrincipal,
            permisosConfirmados: document.getElementById('audio-permisos').checked,
            nombre: generatedAudioName({ song }), actualizadaEn: new Date(), actualizadoPor: currentUser?.uid || ''
        };
        const automaticVersion = automaticAudioVersionId(data);
        const matchingPublishedAudio = allCancionAudios.find(audio =>
            audio.estado === 'publicado' && audio.id !== editingAudioId && automaticAudioVersionId(audio) === automaticVersion
        );
        data.versionId = currentAudio?.estado === 'publicado'
            ? audioVersionId(currentAudio)
            : matchingPublishedAudio ? audioVersionId(matchingPublishedAudio) : automaticVersion;
        if (!data.permisosConfirmados) return alert('Confirmá los permisos antes de guardar.');
        const id = editingAudioId;
        const currentPrincipals = data.versionPrincipal
            ? allCancionAudios.filter(audio => audio.cancionId === data.cancionId && audio.id !== id && (audio.versionPrincipal || audio.esPrincipal) && audioVersionId(audio) !== data.versionId)
            : [];
        if (currentPrincipals.length) {
            const currentNames = currentPrincipals
                .map(audio => audio.nombre || audio.version || audio.interprete || 'Audio sin nombre')
                .join(', ');
            const replacePrincipal = confirm(
                `Esta canción ya tiene como audio guía principal:\n\n${currentNames}\n\n` +
                '¿Querés reemplazarlo por el audio que estás guardando?\n\n' +
                'Aceptar: reemplazar el principal actual.\nCancelar: no guardar el cambio.'
            );
            if (!replacePrincipal) return;
        }
        if (data.versionPrincipal) {
            await Promise.all(currentPrincipals
                .map(audio => utils.updateDoc(utils.doc(db, 'cancion_audios', audio.id), { esPrincipal: false, versionPrincipal: false, actualizadaEn: new Date() })));
            const sameVersionSources = allCancionAudios.filter(audio => audio.id !== id && audioVersionId(audio) === data.versionId);
            await Promise.all(sameVersionSources.map(audio => utils.updateDoc(utils.doc(db, 'cancion_audios', audio.id), {
                versionPrincipal: true,
                esPrincipal: false,
                actualizadaEn: new Date()
            })));
        }
        await utils.setDoc(utils.doc(db, 'cancion_audios', id), data, { merge: true });
        if (data.estado !== 'publicado') alert(data.estado === 'rechazado' ? 'Propuesta rechazada.' : 'Revisión guardada.');
        resetAudioForm(); await loadCancionAudios();
    });
    updateAudioFormPreview();
}

// ==================== RECURSOS ====================

async function loadRecursos() {
    try {
        const q = utils.query(utils.collection(db, 'recursos'), utils.orderBy('fechaCreacion', 'desc'), utils.limit(ADMIN_QUERY_LIMIT));
        const querySnapshot = await utils.getDocs(q);
        allRecursos = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        allRecursos.sort((a, b) => {
            const ta = a.fechaCreacion && a.fechaCreacion.toMillis ? a.fechaCreacion.toMillis() : (a.fechaCreacion || 0);
            const tb = b.fechaCreacion && b.fechaCreacion.toMillis ? b.fechaCreacion.toMillis() : (b.fechaCreacion || 0);
            return tb - ta;
        });
        
        displayRecursos(allRecursos);
        setupRecursosListeners();
    } catch (error) {
        console.error('Error al cargar recursos:', error);
    }
}

function displayRecursos(recursos) {
    const list = document.getElementById('recurso-list');
    if (!list) return;
    list.innerHTML = '';
    
    recursos.forEach(recurso => {
        const item = document.createElement('div');
        item.className = `item ${editingId === recurso.id ? 'active' : ''}`;
        
        const iconos = {
            'dinamicas': '💥',
            'juegos': '🎲',
            'reflexiones': '🤔',
            'retiros': '⛰️'
        };
        
        const icono = iconos[recurso.categoria] || '📋';
        
        item.innerHTML = `
            <div class="item-title">${icono} ${adminEscapeHtml(recurso.titulo || 'Sin título')}</div>
            <div class="item-subtitle">Categoría: ${adminEscapeHtml(recurso.categoria || 'Sin categoría')}</div>
            <span class="item-badge badge-${adminCssToken(recurso.estado)}">${adminEscapeHtml(recurso.estado || 'pendiente')}</span>
        `;
        item.addEventListener('click', () => editRecurso(recurso));
        list.appendChild(item);
    });
}

function editRecurso(recurso) {
    editingId = recurso.id;
    const form = document.getElementById('recurso-form');
    form.dataset.editingId = recurso.id;
    
    document.getElementById('recurso-form-title').textContent = '✏️ Editar Recurso';
    document.getElementById('recurso-titulo').value = recurso.titulo || '';
    document.getElementById('recurso-categoria').value = recurso.categoria || 'dinamicas';
    document.getElementById('recurso-descripcion').value = recurso.descripcion || '';
    document.getElementById('recurso-objetivo').value = recurso.objetivo || '';
    document.getElementById('recurso-duracion').value = recurso.duracion || '';
    document.getElementById('recurso-participantes').value = recurso.participantes || '';
    document.getElementById('recurso-materiales').value = 
        (Array.isArray(recurso.materiales) ? recurso.materiales.join('\n') : recurso.materiales || '');
    document.getElementById('recurso-pasos').value = 
        (Array.isArray(recurso.pasos) ? recurso.pasos.join('\n') : recurso.pasos || '');
    document.getElementById('recurso-estado').value = recurso.estado || 'pendiente';
    document.getElementById('recurso-autor').value = recurso.autor || '';
    
    document.getElementById('recurso-cancel').style.display = 'inline-block';
    document.getElementById('recurso-delete').style.display = 'inline-block';
    displayRecursos(allRecursos);
}

function resetRecursoForm() {
    editingId = null;
    const form = document.getElementById('recurso-form');
    delete form.dataset.editingId;
    
    document.getElementById('recurso-form-title').textContent = '➕ Nuevo Recurso';
    form.reset();
    document.getElementById('recurso-cancel').style.display = 'none';
    document.getElementById('recurso-delete').style.display = 'none';
    displayRecursos(allRecursos);
}

function setupRecursosListeners() {
    const search = document.getElementById('recurso-search');
    const filterEstado = document.getElementById('recurso-filter-estado');
    const filterCategoria = document.getElementById('recurso-filter-categoria');
    const form = document.getElementById('recurso-form');
    const cancelBtn = document.getElementById('recurso-cancel');
    const deleteBtn = document.getElementById('recurso-delete');
    if (!form || form.dataset.adminBound === 'true') return;
    form.dataset.adminBound = 'true';

    if (search) search.addEventListener('input', filterRecursos);
    if (filterEstado) filterEstado.addEventListener('change', filterRecursos);
    if (filterCategoria) filterCategoria.addEventListener('change', filterRecursos);

    if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formEditingId = form.dataset.editingId || null;
        
        const materialesText = document.getElementById('recurso-materiales').value.trim();
        const pasosText = document.getElementById('recurso-pasos').value.trim();
        
        const data = {
            titulo: document.getElementById('recurso-titulo').value.trim(),
            categoria: document.getElementById('recurso-categoria').value,
            descripcion: document.getElementById('recurso-descripcion').value.trim(),
            objetivo: document.getElementById('recurso-objetivo').value.trim(),
            duracion: document.getElementById('recurso-duracion').value.trim(),
            participantes: document.getElementById('recurso-participantes').value.trim(),
            materiales: materialesText ? materialesText.split('\n').filter(m => m.trim()) : [],
            pasos: pasosText ? pasosText.split('\n').filter(p => p.trim()) : [],
            estado: document.getElementById('recurso-estado').value,
            autor: document.getElementById('recurso-autor').value.trim() || 'Administrador',
            fechaCreacion: new Date()
        };
        
        if (formEditingId) {
            const recursoExistente = allRecursos.find(r => r.id === formEditingId);
            if (recursoExistente && recursoExistente.fechaCreacion) {
                data.fechaCreacion = recursoExistente.fechaCreacion;
            }
        }
        
        try {
            if (formEditingId) {
                await utils.setDoc(utils.doc(db, 'recursos', formEditingId), data, { merge: true });
            } else {
                const id = `recurso_${Date.now()}`;
                await utils.setDoc(utils.doc(db, 'recursos', id), data);
            }
            alert('✅ Recurso guardado con éxito');
            resetRecursoForm();
            loadRecursos();
        } catch (error) {
            console.error('Error al guardar recurso:', error);
            alert('❌ Error al guardar el recurso: ' + error.message);
        }
    });

    if (cancelBtn) cancelBtn.addEventListener('click', resetRecursoForm);

    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
        if (!editingId) return;
        if (confirm('¿Estás seguro de eliminar este recurso?')) {
            try {
                await utils.deleteDoc(utils.doc(db, 'recursos', editingId));
                alert('✅ Recurso eliminado con éxito');
                resetRecursoForm();
                loadRecursos();
            } catch (error) {
                console.error('Error al eliminar recurso:', error);
                alert('❌ Error al eliminar el recurso');
            }
        }
    });
}

function filterRecursos() {
    const search = document.getElementById('recurso-search').value.toLowerCase();
    const filterEstado = document.getElementById('recurso-filter-estado').value;
    const filterCategoria = document.getElementById('recurso-filter-categoria').value;
    
    let filtered = allRecursos.filter(r => {
        const matchSearch = (r.titulo || '').toLowerCase().includes(search);
        const matchEstado = !filterEstado || (r.estado || 'pendiente') === filterEstado;
        const matchCategoria = !filterCategoria || (r.categoria || '') === filterCategoria;
        return matchSearch && matchEstado && matchCategoria;
    });
    
    displayRecursos(filtered);
}

// ==================== PASAPALABRA ====================

async function loadPasapalabra() {
    try {
        const querySnapshot = await utils.getDocs(utils.query(
            utils.collection(db, 'pasapalabra'),
            utils.limit(ADMIN_QUERY_LIMIT)
        ));
        allReflexiones = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displayPasapalabra(allReflexiones);
        setupPasapalabraListeners();
    } catch (error) {
        console.error('Error al cargar pasapalabra:', error);
    }
}

function displayPasapalabra(reflexiones) {
    const list = document.getElementById('pasapalabra-list');
    if (!list) return;
    list.innerHTML = '';
    
    if (reflexiones.length === 0) {
        return;
    }
    
    reflexiones.sort((a, b) => {
        try {
            const dateA = parseDateDDMMYYYY(a.fecha || '01/01/2000');
            const dateB = parseDateDDMMYYYY(b.fecha || '01/01/2000');
            return dateB - dateA;
        } catch {
            return 0;
        }
    });
    
    reflexiones.forEach(reflexion => {
        const item = document.createElement('div');
        item.className = 'reflexion-item';
        item.innerHTML = `
            <div class="reflexion-header">
                <div>
                    <div class="reflexion-date">${adminEscapeHtml(reflexion.fecha || 'Sin fecha')}</div>
                    <div class="reflexion-title">${adminEscapeHtml(reflexion.titulo || 'Sin título')}</div>
                </div>
                <button class="btn-delete" onclick="deletePasapalabra('${reflexion.id}')">🗑️ Eliminar</button>
            </div>
            <div class="reflexion-content">${adminEscapeHtml((reflexion.reflexion || 'Sin contenido').substring(0, 250))}...</div>
        `;
        list.appendChild(item);
    });
}

function setupPasapalabraListeners() {
    const processBtn = document.getElementById('pasapalabra-process');
    const processSaveBtn = document.getElementById('pasapalabra-process-save');
    const search = document.getElementById('pasapalabra-search');
    const form = document.getElementById('pasapalabra-form');
    if (!form || form.dataset.adminBound === 'true') return;
    form.dataset.adminBound = 'true';

    if (processBtn) processBtn.addEventListener('click', processPasapalabraRawToForm);
    if (processSaveBtn) processSaveBtn.addEventListener('click', async () => {
        try {
            processPasapalabraRawToForm();
            const form = document.getElementById('pasapalabra-form');
            if (typeof form.requestSubmit === 'function') {
                form.requestSubmit();
            } else {
                form.dispatchEvent(new Event('submit', { cancelable: true }));
            }
        } catch (err) {
            console.error('Error al procesar y guardar pasapalabra:', err);
            alert('Error al procesar y guardar: ' + (err && err.message));
        }
    });
    if (search) search.addEventListener('input', () => {
        const searchText = search.value.toLowerCase();
        const filtered = allReflexiones.filter(r => {
            return (r.fecha || '').toLowerCase().includes(searchText) ||
                   (r.titulo || '').toLowerCase().includes(searchText);
        });
        displayPasapalabra(filtered);
    });
    if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            fecha: document.getElementById('pasapalabra-fecha').value.trim(),
            titulo: document.getElementById('pasapalabra-titulo').value.trim(),
            reflexion: document.getElementById('pasapalabra-reflexion').value.trim(),
            estado: 'publicado',
            createdAt: new Date()
        };
        
        if (!data.fecha || !data.titulo || !data.reflexion) {
            alert('❌ Por favor completa todos los campos');
            return;
        }
        
        try {
            const id = `pasapalabra_${Date.now()}`;
            await utils.setDoc(utils.doc(db, 'pasapalabra', id), data);
            alert('✅ Reflexión guardada con éxito');
            
            document.getElementById('pasapalabra-raw').value = '';
            form.reset();
            
            loadPasapalabra();
        } catch (error) {
            console.error('Error al guardar reflexión:', error);
            alert('❌ Error al guardar la reflexión: ' + error.message);
        }
    });
}

function processPasapalabraRawToForm() {
    const rawText = document.getElementById('pasapalabra-raw').value || '';
    const lines = rawText.split('\n').map(l => l.trim()).filter(line => line);

    const dateRegex = /\d+\s+de\s+\w+\s+de\s+\d{4}/i;
    const dateLine = lines.find(line => dateRegex.test(line));
    if (dateLine) {
        const formattedDate = convertToDateFormat(dateLine.trim());
        document.getElementById('pasapalabra-fecha').value = formattedDate;
    }

    const titleIndex = dateLine ? lines.indexOf(dateLine) + 1 : 0;
    if (titleIndex < lines.length) {
        const potentialTitle = lines[titleIndex];
        if (potentialTitle && potentialTitle === potentialTitle.toUpperCase()) {
            document.getElementById('pasapalabra-titulo').value = potentialTitle.trim();
        }
    }

    const contentLines = lines.filter(line => {
        const lower = line.toLowerCase();
        return !dateRegex.test(line) &&
               line !== document.getElementById('pasapalabra-titulo').value &&
               !lower.includes('abrazos') &&
               !lower.includes('@') &&
               (!lower.match(/^[a-z\s]+$/i) || line.length > 50);
    });

    document.getElementById('pasapalabra-reflexion').value = contentLines.join('\n').trim();
}

async function deletePasapalabra(id) {
    if (confirm('¿Estás seguro de eliminar esta reflexión?')) {
        try {
            await utils.deleteDoc(utils.doc(db, 'pasapalabra', id));
            alert('✅ Reflexión eliminada con éxito');
            loadPasapalabra();
        } catch (error) {
            console.error('Error al eliminar reflexión:', error);
            alert('❌ Error al eliminar la reflexión');
        }
    }
}

window.deletePasapalabra = deletePasapalabra;

// ==================== MEDITACIONES ====================

async function loadMeditaciones() {
    try {
        const q = utils.query(utils.collection(db, 'meditaciones'), utils.orderBy('titulo'), utils.limit(ADMIN_QUERY_LIMIT));
        const querySnapshot = await utils.getDocs(q);
        allMeditaciones = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        displayMeditaciones(allMeditaciones);
        setupMeditacionesListeners();
    } catch (error) {
        console.error('Error al cargar meditaciones:', error);
    }
}

function displayMeditaciones(items) {
    const list = document.getElementById('meditacion-list');
    if (!list) return;
    list.innerHTML = '';
    if (!items || items.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted)">No hay meditaciones cargadas.</div>';
        return;
    }
    items.forEach(it => {
        const el = document.createElement('div');
        el.className = 'item';
        el.innerHTML = `
            <div style="display:flex;justify-content:space-between;gap:12px;">
                <div style="flex:1">
                    <div class="item-title">${adminEscapeHtml(it.titulo || 'Sin título')}</div>
                    <div class="item-subtitle">${adminEscapeHtml((it.descripcion||'').substring(0,80))}</div>
                    <div style="margin-top:6px;color:var(--text-muted);">${adminEscapeHtml((it.contenido||'').substring(0,140))}...</div>
                    <div style="margin-top:6px;color:var(--text-muted);font-size:13px;">${adminEscapeHtml(it.autor? 'Autor: '+it.autor : '')} ${adminEscapeHtml(it.libro? ' • '+it.libro : '')} ${adminEscapeHtml(it.pagina? ' (p. '+it.pagina+')' : '')}</div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                    <button class="btn-edit" onclick="editMeditacion('${it.id}')">✏️ Editar</button>
                    <button class="btn-delete" onclick="deleteMeditacion('${it.id}')">🗑️ Eliminar</button>
                </div>
            </div>
        `;
        list.appendChild(el);
    });
}

function setupMeditacionesListeners() {
    const saveBtn = document.getElementById('meditacion-save-btn');
    const cancelBtn = document.getElementById('meditacion-cancel');
    const deleteBtn = document.getElementById('meditacion-delete');
    const search = document.getElementById('meditacion-search');
    if (!saveBtn || saveBtn.dataset.adminBound === 'true') return;
    saveBtn.dataset.adminBound = 'true';

    if (saveBtn) saveBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!currentUser) { alert('Inicia sesión primero'); return; }
        const titulo = (document.getElementById('meditacion-titulo').value || '').trim();
        const contenido = (document.getElementById('meditacion-contenido').value || '').trim();
        if (!titulo || !contenido) { alert('Completa título y contenido'); return; }
        const libro = (document.getElementById('meditacion-libro').value || '').trim();
        const pagina = (document.getElementById('meditacion-pagina').value || '').trim();
        const autor = (document.getElementById('meditacion-autor').value || '').trim();
        const descripcion = (document.getElementById('meditacion-descripcion').value || '').trim();
        const meditacionDiaria = document.getElementById('meditacion-diaria').checked;
        const meditacionCategoria = document.getElementById('meditacion-categoria-meditacion').checked;
        const informacionCategoria = document.getElementById('meditacion-categoria-informacion').checked;
        const publicoCategoria = document.getElementById('meditacion-categoria-publico').checked;

        const data = {
            titulo, contenido, activa: meditacionDiaria,
            'Meditación': meditacionCategoria, 'Informacion': informacionCategoria,
            'Publico': publicoCategoria,
            estado: publicoCategoria ? 'publicado' : 'borrador'
        };
        if (libro) data.libro = libro;
        if (pagina) data.pagina = pagina;
        if (autor) data.autor = autor;
        if (descripcion) data.descripcion = descripcion;

        try {
            const savedMeditationId = editingId || `meditacion_${Date.now()}`;
            if (editingId) {
                await utils.setDoc(utils.doc(db, 'meditaciones', savedMeditationId), data, { merge: true });
                alert('✅ Meditación actualizada');
            } else {
                await utils.setDoc(utils.doc(db, 'meditaciones', savedMeditationId), data);
                alert('✅ Meditación guardada');
            }
            await registerMeditationLibraryChange(savedMeditationId, 'upsert');
            resetMeditacionForm();
            loadMeditaciones();
        } catch (err) {
            console.error('Error al guardar meditación:', err);
            alert('❌ Error: ' + (err && err.message));
        }
    });

    if (cancelBtn) cancelBtn.addEventListener('click', resetMeditacionForm);

    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
        if (!editingId) return;
        if (!confirm('¿Eliminar meditación editada?')) return;
        try {
            const deletedMeditationId = editingId;
            await utils.deleteDoc(utils.doc(db, 'meditaciones', deletedMeditationId));
            await registerMeditationLibraryChange(deletedMeditationId, 'delete');
            alert('✅ Meditación eliminada');
            resetMeditacionForm();
            loadMeditaciones();
        } catch (err) {
            console.error('Error al eliminar meditación:', err);
            alert('❌ Error al eliminar');
        }
    });

    if (search) search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        if (!q) return displayMeditaciones(allMeditaciones);
        const filtered = allMeditaciones.filter(m => (m.titulo||'').toLowerCase().includes(q));
        displayMeditaciones(filtered);
    });
}

function editMeditacion(id) {
    const item = allMeditaciones.find(m => m.id === id);
    if (!item) return;

    editingId = item.id;
    document.getElementById('meditacion-titulo').value = item.titulo || '';
    document.getElementById('meditacion-contenido').value = item.contenido || '';
    document.getElementById('meditacion-libro').value = item.libro || '';
    document.getElementById('meditacion-pagina').value = item.pagina || '';
    document.getElementById('meditacion-autor').value = item.autor || '';
    document.getElementById('meditacion-descripcion').value = item.descripcion || '';
    document.getElementById('meditacion-diaria').checked = item.activa !== false;
    document.getElementById('meditacion-categoria-meditacion').checked = item['Meditación'] !== false;
    document.getElementById('meditacion-categoria-informacion').checked = item['Informacion'] === true;
    document.getElementById('meditacion-categoria-publico').checked = item['Publico'] === true;
    
    const cancelBtn = document.getElementById('meditacion-cancel');
    const delBtn = document.getElementById('meditacion-delete');
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
    if (delBtn) delBtn.style.display = 'inline-block';
}

function resetMeditacionForm() {
    editingId = null;
    document.getElementById('meditacion-titulo').value = '';
    document.getElementById('meditacion-contenido').value = '';
    document.getElementById('meditacion-libro').value = '';
    document.getElementById('meditacion-pagina').value = '';
    document.getElementById('meditacion-autor').value = '';
    document.getElementById('meditacion-descripcion').value = '';
    document.getElementById('meditacion-diaria').checked = true;
    document.getElementById('meditacion-categoria-meditacion').checked = true;
    document.getElementById('meditacion-categoria-informacion').checked = false;
    document.getElementById('meditacion-categoria-publico').checked = false;
    const cancelBtn = document.getElementById('meditacion-cancel');
    const delBtn = document.getElementById('meditacion-delete');
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (delBtn) delBtn.style.display = 'none';
}

async function deleteMeditacion(id) {
    if (!confirm('¿Eliminar esta meditación?')) return;
    try {
        await utils.deleteDoc(utils.doc(db, 'meditaciones', id));
        await registerMeditationLibraryChange(id, 'delete');
        alert('✅ Meditación eliminada');
        if (editingId === id) resetMeditacionForm();
        loadMeditaciones();
    } catch (err) {
        console.error('Error al eliminar meditación:', err);
        alert('❌ Error al eliminar');
    }
}

async function registerMeditationLibraryChange(id, action) {
    await registerLibraryChange('meditaciones', id, action);
}

async function registerLibraryChange(configId, id, action) {
    const reference = utils.doc(db, 'biblioteca_config', configId);
    await utils.runTransaction(db, async transaction => {
        const snapshot = await transaction.get(reference);
        const previousData = snapshot.exists() ? snapshot.data() : {};
        const previous = Array.isArray(previousData.cambios) ? previousData.cambios : [];
        const revision = Date.now();
        const combinedChanges = [...previous, { id, action, revision }];
        const removedChanges = combinedChanges.slice(0, Math.max(0, combinedChanges.length - 100));
        const changes = combinedChanges.slice(-100);
        const revisionBase = removedChanges.length
            ? Number(removedChanges[removedChanges.length - 1].revision) || 0
            : Number(previousData.revisionBase ?? previousData.revision) || 0;
        transaction.set(reference, {
            revision,
            cambios: changes,
            revisionBase,
            actualizadoEn: new Date(),
            actualizadoPor: currentUser.uid
        }, { merge: true });
    });
}

window.editMeditacion = editMeditacion;
window.deleteMeditacion = deleteMeditacion;

// ==================== FRASES ====================

async function loadFrases() {
    try {
        const q = utils.query(utils.collection(db, 'frases'), utils.orderBy('fechaCreacion', 'desc'), utils.limit(ADMIN_QUERY_LIMIT));
        const querySnapshot = await utils.getDocs(q);
        allFrases = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        allFrases.sort((a, b) => {
            const ta = a.fechaCreacion && a.fechaCreacion.toMillis ? a.fechaCreacion.toMillis() : (a.fechaCreacion || 0);
            const tb = b.fechaCreacion && b.fechaCreacion.toMillis ? b.fechaCreacion.toMillis() : (b.fechaCreacion || 0);
            return tb - ta;
        });
        
        displayFrases(allFrases);
        setupFrasesListeners();
    } catch (error) {
        console.error('Error al cargar frases:', error);
    }
}

function displayFrases(frases) {
    const list = document.getElementById('frase-list');
    if (!list) return;
    list.innerHTML = '';

    frases.forEach(frase => {
        const item = document.createElement('div');
        item.className = `item ${editingId === frase.id ? 'active' : ''}`;

        item.innerHTML = `
            <div class="item-title">"${adminEscapeHtml((frase.frase || '').substring(0, 80))}..."</div>
            <div class="item-subtitle">— ${adminEscapeHtml(frase.autor || 'Anónimo')}</div>
            <span class="item-badge badge-${adminCssToken(frase.estado, 'publicado')}">${adminEscapeHtml(frase.estado || 'publicado')}</span>
        `;
        item.addEventListener('click', () => editFrase(frase));
        list.appendChild(item);
    });
}

function editFrase(frase) {
    editingId = frase.id;
    const form = document.getElementById('frase-form');
    form.dataset.editingId = frase.id;
    
    document.getElementById('frase-form-title').textContent = '✏️ Editar Frase';
    document.getElementById('frase-texto').value = frase.frase || '';
    document.getElementById('frase-autor').value = frase.autor || '';
    document.getElementById('frase-cancel').style.display = 'inline-block';
    document.getElementById('frase-delete').style.display = 'inline-block';
    displayFrases(allFrases);
}

function resetFraseForm() {
    editingId = null;
    const form = document.getElementById('frase-form');
    delete form.dataset.editingId;
    
    document.getElementById('frase-form-title').textContent = '➕ Nueva Frase';
    form.reset();
    document.getElementById('frase-cancel').style.display = 'none';
    document.getElementById('frase-delete').style.display = 'none';
    displayFrases(allFrases);
}

function setupFrasesListeners() {
    const form = document.getElementById('frase-form');
    const cancelBtn = document.getElementById('frase-cancel');
    const deleteBtn = document.getElementById('frase-delete');
    if (!form || form.dataset.adminBound === 'true') return;
    form.dataset.adminBound = 'true';

    if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formEditingId = form.dataset.editingId || null;

        const data = {
            frase: document.getElementById('frase-texto').value.trim(),
            autor: document.getElementById('frase-autor').value.trim(),
            estado: 'publicado',
            fechaCreacion: new Date()
        };

        try {
            if (formEditingId) {
                const fraseExistente = allFrases.find(f => f.id === formEditingId);
                if (fraseExistente && fraseExistente.fechaCreacion) {
                    data.fechaCreacion = fraseExistente.fechaCreacion;
                }
                await utils.setDoc(utils.doc(db, 'frases', formEditingId), data, { merge: true });
            } else {
                const id = `frase_${Date.now()}`;
                await utils.setDoc(utils.doc(db, 'frases', id), data);
            }
            alert('✅ Frase guardada con éxito');
            resetFraseForm();
            loadFrases();
        } catch (error) {
            console.error('Error al guardar frase:', error);
            alert('❌ Error al guardar la frase: ' + error.message);
        }
    });

    if (cancelBtn) cancelBtn.addEventListener('click', resetFraseForm);

    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
        if (!editingId) return;
        if (confirm('¿Estás seguro de eliminar esta frase?')) {
            try {
                await utils.deleteDoc(utils.doc(db, 'frases', editingId));
                alert('✅ Frase eliminada con éxito');
                resetFraseForm();
                loadFrases();
            } catch (error) {
                console.error('Error al eliminar frase:', error);
                alert('❌ Error al eliminar la frase');
            }
        }
    });
}

// ==================== PDV ====================

async function loadPdVLegacy() {
    try {
        const q = utils.query(utils.collection(db, 'pdv'), utils.orderBy('fechaCreacion', 'desc'), utils.limit(ADMIN_QUERY_LIMIT));
        const querySnapshot = await utils.getDocs(q);
        
        allPdvs = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        displayPdV(allPdvs);
        setupPdVListeners();
    } catch (error) {
        console.error('Error al cargar PdV:', error);
    }
}

function displayPdVLegacy(items) {
    const list = document.getElementById('pdv-list');
    if (!list) return;
    list.innerHTML = '';
    if (!items || items.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted)">No hay PdV cargadas.</div>';
        return;
    }

    items.forEach(it => {
        const el = document.createElement('div');
        el.className = 'item';
        el.innerHTML = `
            <div style="display:flex;justify-content:space-between;gap:12px;">
                <div style="flex:1">
                    <div class="item-title">${adminEscapeHtml(it.mes || 'Sin mes')}</div>
                    <div class="item-subtitle">${adminEscapeHtml(it.citaReferencia || '')}</div>
                    <div style="margin-top:6px;color:var(--text-muted);">${adminEscapeHtml((it.citaPrincipal || '').substring(0,80))}...</div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                    <button class="btn-edit" onclick="editPdV('${it.id}')">✏️ Editar</button>
                    <button class="btn-delete" onclick="deletePdV('${it.id}')">🗑️ Eliminar</button>
                </div>
            </div>
        `;
        list.appendChild(el);
    });
}

function setupPdVListenersLegacy() {
    const form = document.getElementById('pdv-form');
    if (!form || form.dataset.legacyAdminBound === 'true') return;
    form.dataset.legacyAdminBound = 'true';

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formEditingId = document.getElementById('pdv-edit-id').value || null;

        const data = {
            mes: document.getElementById('pdv-mes').value.trim(),
            citaPrincipal: document.getElementById('pdv-cita-principal').value.trim(),
            citaReferencia: document.getElementById('pdv-cita-referencia').value.trim(),
            contenido: document.getElementById('pdv-contenido').value.trim(),
            fechaCreacion: new Date()
        };

        try {
            if (formEditingId) {
                await utils.setDoc(utils.doc(db, 'pdv', formEditingId), data, { merge: true });
                alert('✅ PdV actualizada con éxito');
            } else {
                const id = `pdv_${Date.now()}`;
                await utils.setDoc(utils.doc(db, 'pdv', id), data);
                alert('✅ PdV guardada con éxito');
            }
            resetPdVForm();
            loadPdV();
        } catch (err) {
            console.error('Error al guardar PdV:', err);
            alert('❌ Error al guardar la PdV: ' + (err && err.message));
        }
    });

    const cancelBtn = document.getElementById('pdv-cancel');
    const deleteBtn = document.getElementById('pdv-delete');

    if (cancelBtn) cancelBtn.addEventListener('click', resetPdVForm);

    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
        const formEditingId = document.getElementById('pdv-edit-id').value || null;
        if (!formEditingId) return;
        
        if (confirm('¿Estás seguro de eliminar esta PdV?')) {
            try {
                await utils.deleteDoc(utils.doc(db, 'pdv', formEditingId));
                alert('✅ PdV eliminada con éxito');
                resetPdVForm();
                loadPdV();
            } catch (err) {
                console.error('Error al eliminar PdV:', err);
                alert('❌ Error al eliminar la PdV');
            }
        }
    });
}

function resetPdVFormLegacy() {
    document.getElementById('pdv-edit-id').value = '';
    document.getElementById('pdv-form-title').textContent = '➕ Nueva PdV';
    document.getElementById('pdv-form').reset();
    document.getElementById('pdv-cancel').style.display = 'none';
    document.getElementById('pdv-delete').style.display = 'none';
}

function editPdVLegacy(id) {
    const item = allPdvs.find(p => p.id === id);
    if (!item) return;
    
    editingId = item.id;
    document.getElementById('pdv-edit-id').value = item.id;
    document.getElementById('pdv-form-title').textContent = '✏️ Editar PdV';
    document.getElementById('pdv-mes').value = item.mes || '';
    document.getElementById('pdv-cita-principal').value = item.citaPrincipal || '';
    document.getElementById('pdv-cita-referencia').value = item.citaReferencia || '';
    document.getElementById('pdv-contenido').value = item.contenido || '';

    document.getElementById('pdv-cancel').style.display = 'inline-block';
    document.getElementById('pdv-delete').style.display = 'inline-block';
}

async function deletePdVLegacy(id) {
    if (!confirm('¿Eliminar esta PdV?')) return;
    try {
        await utils.deleteDoc(utils.doc(db, 'pdv', id));
        alert('✅ PdV eliminada con éxito');
        loadPdV();
    } catch (err) {
        console.error('Error al eliminar PdV:', err);
        alert('❌ Error al eliminar la PdV');
    }
}

// ==================== PDV · SISTEMA V2 ====================

let pdvBlocksV2 = [];
let pdvV2Ready = false;

const pdvBlockLabels = {
    parrafo: 'Párrafo',
    cita_destacada: 'Cita principal repetida',
    cita_secundaria: 'Cita bíblica secundaria',
    reflexion_autor: 'Reflexión de un autor',
    experiencia: 'Experiencia / testimonio',
    conclusion: 'Conclusión'
};

function pdvMessage(id, text = '', type = '') {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = text;
    element.classList.toggle('is-error', type === 'error');
    element.classList.toggle('is-success', type === 'success');
}

function pdvMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    const result = new Date(value).getTime();
    return Number.isFinite(result) ? result : 0;
}

function pdvScheduleLabel(value) {
    const date = window.PdvModel.pdvDate(value);
    if (!date) return '';
    return new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function pdvStatusInfo(item) {
    if (item.version !== 2) return { label: 'Formato anterior', css: 'draft' };
    if (item.estado === 'programado' && !window.PdvModel.isAvailable(item)) {
        return { label: `Programada · ${pdvScheduleLabel(item.fechaPublicacion)}`, css: 'scheduled' };
    }
    if (window.PdvModel.isAvailable(item)) return { label: 'Publicada', css: 'published' };
    return { label: 'Borrador', css: 'draft' };
}

function updatePdvScheduleHelp() {
    const help = document.getElementById('pdv-schedule-help');
    if (!help) return;
    const month = document.getElementById('pdv-periodo')?.value;
    const state = document.getElementById('pdv-estado')?.value;
    const date = month ? window.PdvModel.publicationDateForPeriod(`${month}-01`) : null;
    if (state === 'programado' && date) {
        help.textContent = `Se publicará automáticamente el ${pdvScheduleLabel(date)} (hora de Argentina).`;
    } else if (state === 'publicado' && date && date > new Date()) {
        help.textContent = `Como el mes todavía no comenzó, se programará automáticamente para el ${pdvScheduleLabel(date)}.`;
    } else if (state === 'publicado') {
        help.textContent = 'Se mostrará inmediatamente.';
    } else {
        help.textContent = 'El borrador no es visible en la página.';
    }
}

async function loadPdV() {
    try {
        const snapshot = await utils.getDocs(utils.query(
            utils.collection(db, 'pdv'),
            utils.limit(ADMIN_QUERY_LIMIT)
        ));
        allPdvs = snapshot.docs
            .map(documentSnapshot => ({ id: documentSnapshot.id, ...documentSnapshot.data() }))
            .sort((a, b) => String(b.periodo || '').localeCompare(String(a.periodo || ''))
                || pdvMillis(b.fechaCreacion) - pdvMillis(a.fechaCreacion));
        displayPdV(allPdvs);
        setupPdVListeners();
    } catch (error) {
        console.error('Error al cargar PdV:', error);
        pdvMessage('pdv-save-progress', 'No se pudieron cargar las publicaciones.', 'error');
    }
}

function displayPdV(items) {
    const list = document.getElementById('pdv-list');
    if (!list || !window.PdvModel) return;
    const count = document.getElementById('pdv-count');
    if (count) count.textContent = String(items?.length || 0);
    if (!items?.length) {
        list.innerHTML = '<p class="pdv-list-empty">Todavía no hay publicaciones.</p>';
        return;
    }
    const escape = window.PdvModel.escapeHtml;
    const editing = document.getElementById('pdv-edit-id')?.value;
    list.innerHTML = '';
    items.forEach(item => {
        const card = document.createElement('div');
        const status = pdvStatusInfo(item);
        card.className = `item pdv-list-item${editing === item.id ? ' active' : ''}`;
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.innerHTML = `
          <div class="pdv-list-item-top">
            <div>
              <div class="item-title">${escape(item.mes || 'Sin mes')}</div>
              <div class="item-subtitle">${escape(item.citaReferencia || 'Sin referencia')}</div>
            </div>
            <span class="pdv-status pdv-status-${status.css}">${escape(status.label)}</span>
          </div>
          <p>${escape((item.citaPrincipal || item.titulo || 'Sin cita').slice(0, 110))}</p>`;
        card.addEventListener('click', () => editPdV(item.id));
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                editPdV(item.id);
            }
        });
        list.appendChild(card);
    });
}

function syncPdvBlocksV2() {
    document.querySelectorAll('.pdv-block-row').forEach(row => {
        const index = Number(row.dataset.index);
        pdvBlocksV2[index] = {
            ...pdvBlocksV2[index],
            tipo: row.querySelector('[data-field="tipo"]')?.value || 'parrafo',
            texto: row.querySelector('[data-field="texto"]')?.value || '',
            referencia: row.querySelector('[data-field="referencia"]')?.value || '',
            titulo: row.querySelector('[data-field="titulo"]')?.value || ''
        };
    });
}

function renderPdvBlocksV2() {
    const container = document.getElementById('pdv-blocks-editor');
    if (!container) return;
    if (!pdvBlocksV2.length) {
        container.innerHTML = '<p class="pdv-blocks-empty">Importá el Word o agregá el primer bloque.</p>';
        return;
    }
    const escape = window.PdvModel.escapeHtml;
    container.innerHTML = pdvBlocksV2.map((block, index) => {
        const options = Object.entries(pdvBlockLabels)
            .map(([value, label]) => `<option value="${value}"${block.tipo === value ? ' selected' : ''}>${label}</option>`)
            .join('');
        return `
          <div class="pdv-block-row" data-index="${index}">
            <div class="pdv-block-fields">
              <label>Tipo de bloque<select data-field="tipo">${options}</select></label>
              <label>Texto<textarea data-field="texto" rows="4">${escape(block.texto || '')}</textarea></label>
              <label class="pdv-block-extra"${block.tipo === 'cita_secundaria' ? '' : ' hidden'}>Referencia
                <input data-field="referencia" value="${escape(block.referencia || '')}" placeholder="Jn 13, 35">
              </label>
              <label class="pdv-block-extra"${['reflexion_autor', 'experiencia'].includes(block.tipo) ? '' : ' hidden'}>${block.tipo === 'experiencia' ? 'Introducción' : 'Título'}
                <input data-field="titulo" value="${escape(block.titulo || '')}" placeholder="${block.tipo === 'experiencia' ? 'Wambil, de México, nos cuenta' : 'Escribe Chiara Lubich'}">
              </label>
            </div>
            <div class="pdv-block-actions" aria-label="Ordenar bloque">
              <button type="button" data-action="up" title="Subir" ${index === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" data-action="down" title="Bajar" ${index === pdvBlocksV2.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" data-action="remove" class="pdv-block-remove" title="Eliminar">×</button>
            </div>
          </div>`;
    }).join('');
}

function fillPdvFormV2(data = {}) {
    const normalized = window.PdvModel.normalizePdv(data);
    document.getElementById('pdv-mes').value = normalized.mes;
    document.getElementById('pdv-periodo').value = normalized.periodo?.slice(0, 7) || '';
    document.getElementById('pdv-cita-principal').value = normalized.citaPrincipal;
    document.getElementById('pdv-cita-referencia').value = normalized.citaReferencia;
    document.getElementById('pdv-autor').value = normalized.autor;
    document.getElementById('pdv-estado').value = normalized.estado;
    document.getElementById('pdv-audio-url').value = normalized.audioUrl;
    pdvBlocksV2 = normalized.bloques;
    renderPdvBlocksV2();
    document.getElementById('pdv-audio-help').textContent = 'Pegá un enlace público directo al audio. Si no funciona, el reproductor no se mostrará.';
    updatePdvScheduleHelp();
}

async function importPdvDocxV2(file) {
    if (!file) return;
    if (!window.mammoth || !window.PdvModel) {
        pdvMessage('pdv-import-status', 'El importador no pudo iniciarse. Recargá la página.', 'error');
        return;
    }
    pdvMessage('pdv-import-status', `Leyendo ${file.name}…`);
    try {
        const result = await window.mammoth.convertToHtml(
            { arrayBuffer: await file.arrayBuffer() },
            {
                ignoreEmptyParagraphs: true,
                convertImage: window.mammoth.images.imgElement(() => Promise.resolve({ src: '' }))
            }
        );
        const imported = window.PdvModel.parseImportedHtml(result.value);
        const publicationDate = window.PdvModel.publicationDateForPeriod(imported.periodo);
        const initialState = publicationDate && publicationDate > new Date() ? 'programado' : 'borrador';
        fillPdvFormV2({ ...imported, estado: initialState, fechaPublicacion: publicationDate });
        const missing = [];
        if (!imported.mes) missing.push('el mes');
        if (!imported.citaPrincipal) missing.push('la cita principal');
        if (!imported.citaReferencia) missing.push('la referencia');
        const note = missing.length
            ? ` Falta revisar ${missing.join(', ')}.`
            : ' Revisá la vista previa y publicala cuando esté lista.';
        pdvMessage('pdv-import-status', `Word importado: ${imported.bloques.length} bloques detectados.${note}`, missing.length ? 'error' : 'success');
        document.getElementById('pdv-mes').focus();
    } catch (error) {
        console.error('Error al importar el Word:', error);
        pdvMessage('pdv-import-status', 'No se pudo leer este Word. Verificá que sea un archivo .docx válido.', 'error');
    }
}

function collectPdvFormV2() {
    syncPdvBlocksV2();
    const month = document.getElementById('pdv-periodo').value;
    return window.PdvModel.normalizePdv({
        id: document.getElementById('pdv-edit-id').value,
        mes: document.getElementById('pdv-mes').value,
        periodo: month ? `${month}-01` : '',
        citaPrincipal: document.getElementById('pdv-cita-principal').value,
        citaReferencia: document.getElementById('pdv-cita-referencia').value,
        bloques: pdvBlocksV2,
        autor: document.getElementById('pdv-autor').value,
        audioUrl: document.getElementById('pdv-audio-url').value,
        estado: document.getElementById('pdv-estado').value
    });
}

function missingPdvFields(data) {
    const missing = [];
    if (!data.mes) missing.push('mes visible');
    if (!data.periodo) missing.push('mes de publicación');
    if (!data.citaPrincipal) missing.push('cita principal');
    if (!data.citaReferencia) missing.push('referencia');
    if (!data.bloques.length) missing.push('contenido');
    if (!data.autor) missing.push('autor');
    if (data.audioUrl) {
        try {
            const url = new URL(data.audioUrl);
            if (!['http:', 'https:'].includes(url.protocol)) missing.push('un enlace de audio válido');
        } catch {
            missing.push('un enlace de audio válido');
        }
    }
    return missing;
}

function openPdvPreviewV2() {
    const data = collectPdvFormV2();
    const missing = missingPdvFields(data);
    if (missing.length) {
        pdvMessage('pdv-save-progress', `Para la vista previa falta: ${missing.join(', ')}.`, 'error');
        return;
    }
    const modal = document.getElementById('pdv-preview-modal');
    document.getElementById('pdv-preview-content').innerHTML = window.PdvModel.renderArticle(data, { archiveHref: '#' });
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('pdv-preview-close').focus();
}

function closePdvPreviewV2() {
    document.getElementById('pdv-preview-modal').hidden = true;
    document.body.style.overflow = '';
}

function setupPdVListeners() {
    const form = document.getElementById('pdv-form');
    if (!form || pdvV2Ready) return;
    pdvV2Ready = true;
    renderPdvBlocksV2();

    document.getElementById('pdv-docx-file')?.addEventListener('change', event => {
        importPdvDocxV2(event.target.files?.[0]);
        event.target.value = '';
    });
    document.getElementById('pdv-add-block')?.addEventListener('click', () => {
        syncPdvBlocksV2();
        pdvBlocksV2.push({ tipo: 'parrafo', texto: '', referencia: '', titulo: '' });
        renderPdvBlocksV2();
        document.querySelector('.pdv-block-row:last-child textarea')?.focus();
    });
    document.getElementById('pdv-blocks-editor')?.addEventListener('change', event => {
        if (event.target.dataset.field !== 'tipo') return;
        syncPdvBlocksV2();
        renderPdvBlocksV2();
    });
    document.getElementById('pdv-blocks-editor')?.addEventListener('click', event => {
        const action = event.target.closest('button[data-action]')?.dataset.action;
        if (!action) return;
        const index = Number(event.target.closest('.pdv-block-row')?.dataset.index);
        syncPdvBlocksV2();
        if (action === 'remove') pdvBlocksV2.splice(index, 1);
        if (action === 'up' && index > 0) [pdvBlocksV2[index - 1], pdvBlocksV2[index]] = [pdvBlocksV2[index], pdvBlocksV2[index - 1]];
        if (action === 'down' && index < pdvBlocksV2.length - 1) [pdvBlocksV2[index + 1], pdvBlocksV2[index]] = [pdvBlocksV2[index], pdvBlocksV2[index + 1]];
        renderPdvBlocksV2();
    });
    document.getElementById('pdv-estado')?.addEventListener('change', updatePdvScheduleHelp);
    document.getElementById('pdv-periodo')?.addEventListener('change', updatePdvScheduleHelp);

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const editId = document.getElementById('pdv-edit-id').value || null;
        const saveButton = document.getElementById('pdv-save-button');
        let data = collectPdvFormV2();
        const missing = missingPdvFields(data);
        if (missing.length) {
            pdvMessage('pdv-save-progress', `Falta completar: ${missing.join(', ')}.`, 'error');
            return;
        }
        saveButton.disabled = true;
        pdvMessage('pdv-save-progress', 'Guardando…');
        try {
            const existing = allPdvs.find(item => item.id === editId);
            const id = editId || window.PdvModel.slugFromPeriod(data.periodo);
            const now = new Date();
            const monthStart = window.PdvModel.publicationDateForPeriod(data.periodo);
            const shouldSchedule = data.estado === 'programado'
                || (data.estado === 'publicado' && monthStart && monthStart > now);
            const finalState = data.estado === 'borrador' ? 'borrador' : (shouldSchedule ? 'programado' : 'publicado');
            const publicationDate = finalState === 'programado'
                ? monthStart
                : (finalState === 'publicado'
                    ? (existing?.estado === 'publicado' ? existing.fechaPublicacion : now)
                    : null);
            const record = {
                version: 2,
                slug: id,
                mes: data.mes,
                periodo: data.periodo,
                citaPrincipal: data.citaPrincipal,
                citaReferencia: data.citaReferencia,
                bloques: data.bloques,
                autor: data.autor,
                audioUrl: data.audioUrl,
                estado: finalState,
                fechaCreacion: existing?.fechaCreacion || now,
                fechaActualizacion: now,
                fechaPublicacion: publicationDate
            };
            await utils.setDoc(utils.doc(db, 'pdv', id), record);
            resetPdVForm();
            await loadPdV();
            const message = finalState === 'programado'
                ? `Publicación programada para el ${pdvScheduleLabel(publicationDate)}.`
                : (finalState === 'publicado' ? 'Publicación guardada y visible.' : 'Borrador guardado.');
            pdvMessage('pdv-save-progress', message, 'success');
        } catch (error) {
            console.error('Error al guardar PdV:', error);
            pdvMessage('pdv-save-progress', `No se pudo guardar: ${error?.message || 'error desconocido'}`, 'error');
        } finally {
            saveButton.disabled = false;
        }
    });

    document.getElementById('pdv-preview-button')?.addEventListener('click', openPdvPreviewV2);
    document.getElementById('pdv-preview-close')?.addEventListener('click', closePdvPreviewV2);
    document.getElementById('pdv-preview-modal')?.addEventListener('click', event => {
        if (event.target.id === 'pdv-preview-modal') closePdvPreviewV2();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !document.getElementById('pdv-preview-modal')?.hidden) closePdvPreviewV2();
    });
    document.getElementById('pdv-cancel')?.addEventListener('click', resetPdVForm);
    document.getElementById('pdv-delete')?.addEventListener('click', () => {
        const id = document.getElementById('pdv-edit-id').value;
        if (id) deletePdV(id);
    });
}

function resetPdVForm() {
    document.getElementById('pdv-edit-id').value = '';
    document.getElementById('pdv-form-title').textContent = 'Nueva Palabra de Vida';
    document.getElementById('pdv-form').reset();
    document.getElementById('pdv-cancel').style.display = 'none';
    document.getElementById('pdv-delete').style.display = 'none';
    document.getElementById('pdv-audio-help').textContent = 'Pegá un enlace público directo al audio. Si no funciona, el reproductor no se mostrará.';
    pdvBlocksV2 = [];
    renderPdvBlocksV2();
    displayPdV(allPdvs);
    updatePdvScheduleHelp();
}

function editPdV(id) {
    const item = allPdvs.find(pdv => pdv.id === id);
    if (!item) return;
    document.getElementById('pdv-edit-id').value = item.id;
    document.getElementById('pdv-form-title').textContent = `Editar ${item.mes || 'Palabra de Vida'}`;
    const legacyBlocks = item.contenido
        ? [{ tipo: 'parrafo', texto: String(item.contenido).replace(/<[^>]+>/g, ' ') }]
        : [];
    fillPdvFormV2({ ...item, bloques: Array.isArray(item.bloques) ? item.bloques : legacyBlocks });
    document.getElementById('pdv-cancel').style.display = 'inline-block';
    document.getElementById('pdv-delete').style.display = 'inline-block';
    displayPdV(allPdvs);
    document.getElementById('pdv-form-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deletePdV(id) {
    if (!confirm('¿Eliminar definitivamente esta Palabra de Vida?')) return;
    try {
        await utils.deleteDoc(utils.doc(db, 'pdv', id));
        resetPdVForm();
        await loadPdV();
        pdvMessage('pdv-save-progress', 'Publicación eliminada.', 'success');
    } catch (error) {
        console.error('Error al eliminar PdV:', error);
        pdvMessage('pdv-save-progress', 'No se pudo eliminar la publicación.', 'error');
    }
}

window.editPdV = editPdV;
window.deletePdV = deletePdV;

// ==================== SUBIDA MÚLTIPLE ====================

let bulkPreviewData = [];
let bulkPreviewType = '';
let bulkPreparedOperations = [];
const BULK_RESOURCE_CATEGORIES = new Set(['dinamicas', 'juegos', 'reflexiones', 'retiros']);
const BULK_RESOURCE_STATES = new Set(['pendiente', 'publicado']);
const BULK_SONG_STATES = new Set(['pendiente', 'publicado']);
const BULK_COLLECTIONS = Object.freeze({
    canciones: { label: 'Canciones', prefix: 'cancion' },
    cancion_audios: { label: 'Audios', prefix: 'audio' },
    recursos: { label: 'Recursos', prefix: 'recurso' },
    canal_publicaciones: { label: 'Comunicaciones', prefix: 'comunicacion' },
    pasapalabra: { label: 'Pasapalabra', prefix: 'pasapalabra' },
    meditaciones: { label: 'Meditaciones', prefix: 'meditacion' },
    frases: { label: 'Frases', prefix: 'frase' },
    pdv: { label: 'Palabra de Vida', prefix: 'pdv' },
    biblioteca_recursos: { label: 'Biblioteca', prefix: 'biblioteca' },
    notificaciones_pendientes: { label: 'Notificaciones', prefix: 'notificacion' },
    versiones_android: { label: 'Versiones Android', prefix: 'version' }
});
const BULK_MIXED_COLLECTIONS = new Set(['canciones', 'cancion_audios']);

function initBulkUpload() {
    setupBulkUploadListeners();
}

function setupBulkUploadListeners() {
    const fileInput = document.getElementById('bulk-file');
    const typeInput = document.getElementById('bulk-type');
    const previewBtn = document.getElementById('bulk-preview');
    const uploadBtn = document.getElementById('bulk-upload');
    const clearBtn = document.getElementById('bulk-clear');
    if (!previewBtn || previewBtn.dataset.adminBound === 'true') return;
    previewBtn.dataset.adminBound = 'true';
    
    if (fileInput) fileInput.addEventListener('change', handleBulkFile);
    if (typeInput) typeInput.addEventListener('change', clearBulkPreview);
    if (previewBtn) previewBtn.addEventListener('click', showBulkPreview);
    if (uploadBtn) uploadBtn.addEventListener('click', doBulkUpload);
    if (clearBtn) clearBtn.addEventListener('click', clearBulkForm);
}

function handleBulkFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        document.getElementById('bulk-json').value = event.target.result;
    };
    reader.readAsText(file);
}

function showBulkPreview() {
    const jsonText = document.getElementById('bulk-json').value.trim();
    const container = document.getElementById('bulk-preview-container');
    const type = document.getElementById('bulk-type').value;
    
    if (!jsonText) {
        container.innerHTML = '<p style="color: var(--danger-color);">Por favor pega el JSON o sube un archivo.</p>';
        return;
    }
    
    try {
        bulkPreviewData = JSON.parse(jsonText);
        if (!Array.isArray(bulkPreviewData)) {
            throw new Error('El JSON debe ser un array.');
        }
        if (bulkPreviewData.length === 0) throw new Error('El array no puede estar vacío.');
        const resolved = bulkPreviewData.map((item, index) => ({
            item,
            collection: resolveBulkCollection(item, type, index)
        }));
        validateBulkCollectionCombination(resolved, type);
        validateBulkItems(resolved);
        bulkPreparedOperations = prepareBulkOperations(resolved);
        bulkPreviewType = type;

        const totals = resolved.reduce((summary, entry) => {
            summary[entry.collection] = (summary[entry.collection] || 0) + 1;
            return summary;
        }, {});
        const totalLabel = Object.entries(totals).map(([collection, count]) => `${count} ${BULK_COLLECTIONS[collection].label}`).join(' · ');
        let html = `<h3 style="color: var(--text-light); margin-bottom: 1rem;">📋 Previsualización (${bulkPreviewData.length})</h3><p style="color:var(--text-muted);">${bulkEscapeHtml(totalLabel)}</p>`;
        html += '<div style="max-height: 400px; overflow-y: auto;">';
        
        resolved.forEach(({ item, collection }, index) => {
            const title = bulkItemTitle(item, collection);
            const secondary = String(item.descripcion || item.resumen || item.contenido || item.reflexion || item.letra || item.url || '').slice(0, 200);
            html += `
                <div style="background: var(--admin-card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
                    <div style="font-weight: bold; color: var(--text-light);">${index + 1}. ${bulkEscapeHtml(title)}</div>
                    <div style="color: var(--text-muted);">${bulkEscapeHtml(BULK_COLLECTIONS[collection].label)} · ${bulkEscapeHtml(item.estado || 'estado automático')}</div>
                    <div style="color: var(--text-muted); margin-top: 0.5rem; white-space: pre-wrap; font-size: 0.875rem;">${bulkEscapeHtml(secondary)}</div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        container.innerHTML = `<p style="color: var(--danger-color);">No se pudo preparar la subida: ${bulkEscapeHtml(error.message)}</p>`;
        bulkPreviewData = [];
        bulkPreviewType = '';
        bulkPreparedOperations = [];
    }
}

function resolveBulkCollection(item, selectedType, index) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`El elemento ${index + 1} no es un objeto válido.`);
    const declared = String(item.coleccion || '').trim();
    let collection = selectedType;
    if (selectedType === 'auto') {
        if (!declared) throw new Error(`Falta “coleccion” en el elemento ${index + 1}.`);
        collection = declared;
    } else if (selectedType === 'cancionero_audio') {
        if (!declared) throw new Error(`Indicá “coleccion”: “canciones” o “cancion_audios” en el elemento ${index + 1}.`);
        collection = declared;
    } else if (declared && declared !== selectedType) {
        throw new Error(`El elemento ${index + 1} declara “${declared}”, pero seleccionaste “${selectedType}”.`);
    }
    if (!BULK_COLLECTIONS[collection]) throw new Error(`La colección “${collection}” no está habilitada para importación.`);
    return collection;
}

function validateBulkCollectionCombination(entries, selectedType) {
    const collections = new Set(entries.map(entry => entry.collection));
    if (collections.size <= 1) return;
    const onlySongAndAudio = [...collections].every(collection => BULK_MIXED_COLLECTIONS.has(collection));
    if (!onlySongAndAudio || collections.size !== 2) throw new Error('Cada subida debe corresponder a una sola colección. La única combinación permitida es canciones + cancion_audios.');
    if (!['auto', 'cancionero_audio'].includes(selectedType)) throw new Error('Para combinar canciones y audios elegí “Canciones + audios” o leé la colección desde el JSON.');
}

function validateBulkItems(entries) {
    const songs = entries.filter(entry => entry.collection === 'canciones').map(entry => entry.item);
    const resources = entries.filter(entry => entry.collection === 'recursos').map(entry => entry.item);
    if (songs.length) validateBulkSongs(songs);
    if (resources.length) validateBulkResources(resources);
    entries.forEach(({ item, collection }, index) => {
        const number = index + 1;
        if (collection === 'cancion_audios') {
            if (!String(item.cancionId || item.cancionClave || '').trim()) throw new Error(`Falta cancionId o cancionClave en el audio ${number}.`);
            if (!String(item.url || '').trim()) throw new Error(`Falta la URL en el audio ${number}.`);
            try { new URL(item.url); } catch { throw new Error(`La URL del audio ${number} no es válida.`); }
        } else if (collection === 'frases' && !String(item.frase || '').trim()) throw new Error(`Falta “frase” en el elemento ${number}.`);
        else if (collection === 'pasapalabra' && (!String(item.titulo || '').trim() || !String(item.reflexion || '').trim())) throw new Error(`Pasapalabra ${number} necesita titulo y reflexion.`);
        else if (collection === 'meditaciones' && (!String(item.titulo || '').trim() || !String(item.contenido || '').trim())) throw new Error(`La meditación ${number} necesita titulo y contenido.`);
        else if (collection === 'canal_publicaciones' && (!String(item.titulo || '').trim() || !item.fechaVencimiento)) throw new Error(`La comunicación ${number} necesita titulo y fechaVencimiento.`);
        else if (collection === 'biblioteca_recursos' && (!String(item.titulo || '').trim() || !String(item.linkRecurso || '').trim())) throw new Error(`El recurso de biblioteca ${number} necesita titulo y linkRecurso.`);
        else if (collection === 'notificaciones_pendientes' && (!String(item.title || '').trim() || !String(item.body || '').trim())) throw new Error(`La notificación ${number} necesita title y body.`);
        else if (collection === 'pdv' && !String(item.periodo || item.mes || '').trim()) throw new Error(`Palabra de Vida ${number} necesita periodo o mes.`);
        else if (collection === 'versiones_android' && !String(item.versionCode || item.codigo || item.id || '').trim()) throw new Error(`La versión Android ${number} necesita versionCode.`);
    });
}

function bulkItemTitle(item, collection) {
    return item.titulo || item.title || item.frase || item.nombre || item.versionName || item.periodo || item.mes || item.url || BULK_COLLECTIONS[collection].label;
}

function validateBulkSongs(items) {
    const seen = new Set();
    items.forEach((item, index) => {
        const number = index + 1;
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`La canción ${number} no es un objeto válido.`);
        const title = String(item.titulo || '').trim();
        const artist = String(item.artista || '').trim();
        const lyrics = String(item.letra || '').trim();
        const category = item.categoria || 'gen';
        const state = item.estado || 'pendiente';
        if (!title) throw new Error(`Falta el título en la canción ${number}.`);
        if (title.length > 160) throw new Error(`El título de la canción ${number} supera los 160 caracteres.`);
        if (artist.length > 160) throw new Error(`El artista de la canción ${number} supera los 160 caracteres.`);
        if (!lyrics) throw new Error(`Falta la letra en la canción ${number}.`);
        if (lyrics.length > 30000) throw new Error(`La letra de la canción ${number} supera los 30.000 caracteres.`);
        if (!parseSongContent(lyrics).chords.length) throw new Error(`La canción ${number} debe contener al menos un acorde reconocido.`);
        if (!CANCION_CATEGORIES.has(category)) throw new Error(`Categoría inválida en la canción ${number}. Usá solamente misa, gen o fogon.`);
        if (!BULK_SONG_STATES.has(state)) throw new Error(`Estado inválido en la canción ${number}. Usá pendiente o publicado.`);
        const identity = `${title.toLocaleLowerCase('es')}|${artist.toLocaleLowerCase('es')}`;
        if (seen.has(identity)) throw new Error(`La canción ${number} está duplicada dentro del archivo.`);
        seen.add(identity);
    });
}

function validateBulkResources(items) {
    items.forEach((item, index) => {
        const number = index + 1;
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`El recurso ${number} no es un objeto válido.`);
        ['titulo', 'descripcion', 'objetivo', 'duracion', 'participantes'].forEach(field => {
            if (!String(item[field] || '').trim()) throw new Error(`Falta “${field}” en el recurso ${number}.`);
        });
        if (!BULK_RESOURCE_CATEGORIES.has(item.categoria)) {
            throw new Error(`Categoría inválida en el recurso ${number}. Usá dinamicas, juegos, reflexiones o retiros.`);
        }
        if (!BULK_RESOURCE_STATES.has(item.estado || 'pendiente')) {
            throw new Error(`Estado inválido en el recurso ${number}. Usá pendiente o publicado.`);
        }
        if (!Array.isArray(item.materiales) || !item.materiales.every(value => typeof value === 'string')) {
            throw new Error(`“materiales” debe ser una lista de textos en el recurso ${number}.`);
        }
        if (!Array.isArray(item.pasos) || !item.pasos.length || !item.pasos.every(value => typeof value === 'string')) {
            throw new Error(`“pasos” debe ser una lista de textos no vacía en el recurso ${number}.`);
        }
        if (item.programa !== undefined && (typeof item.programa !== 'object' || item.programa === null || Array.isArray(item.programa))) {
            throw new Error(`“programa” debe ser un objeto en el recurso ${number}.`);
        }
    });
}

function bulkEscapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
}

async function doBulkUpload() {
    if (bulkPreviewData.length === 0 || bulkPreparedOperations.length === 0) {
        alert('Por favor previsualiza primero los datos.');
        return;
    }
    
    const selectedType = document.getElementById('bulk-type').value;
    if (bulkPreviewType !== selectedType) {
        alert('El tipo de contenido cambió. Volvé a previsualizar antes de subir.');
        return;
    }
    const collectionNames = [...new Set(bulkPreparedOperations.map(operation => BULK_COLLECTIONS[operation.collection].label))].join(' + ');
    if (!confirm(`¿Subir ${bulkPreviewData.length} elementos a ${collectionNames}?${bulkPreparedOperations.some(operation => operation.collection === 'notificaciones_pendientes') ? '\n\nLas notificaciones quedarán programadas para envío.' : ''}`)) {
        return;
    }
    
    const container = document.getElementById('bulk-preview-container');
    const uploadButton = document.getElementById('bulk-upload');
    let successCount = 0;
    let errorCount = 0;
    
    container.innerHTML = `<p style="color: var(--text-light);">Subiendo ${bulkEscapeHtml(collectionNames)}...</p>`;
    if (uploadButton) uploadButton.disabled = true;
    
    const prepared = bulkPreparedOperations;

    for (let offset = 0; offset < prepared.length; offset += ADMIN_BATCH_SIZE) {
        const chunk = prepared.slice(offset, offset + ADMIN_BATCH_SIZE);
        try {
            const batch = utils.writeBatch(db);
            chunk.forEach(operation => batch.set(operation.ref, operation.data));
            await batch.commit();
            successCount += chunk.length;
            container.innerHTML = `<p style="color: var(--text-light);">Subiendo... ${Math.min(offset + chunk.length, prepared.length)}/${prepared.length}</p>`;
        } catch (error) {
            console.error(`Error al subir el lote iniciado en ${offset + 1}`, error);
            errorCount += chunk.length;
        }
    }
    
    container.innerHTML = `
        <div style="padding: 1.5rem; border-radius: 8px; background: var(--success-color); color: white;">
            <h3>✅ Completado!</h3>
            <p>Elementos subidos exitosamente: ${successCount}</p>
            ${errorCount > 0 ? `<p style="margin-top: 0.5rem;">Errores: ${errorCount}</p>` : ''}
        </div>
    `;
    
    alert(`Subida completada! ${successCount} exitosas, ${errorCount} errores.`);
    document.getElementById('bulk-json').value = '';
    document.getElementById('bulk-file').value = '';
    bulkPreviewData = [];
    bulkPreviewType = '';
    bulkPreparedOperations = [];
    if (uploadButton) uploadButton.disabled = false;
    
    if (prepared.some(operation => operation.collection === 'recursos') && typeof loadRecursos === 'function') loadRecursos();
    if (prepared.some(operation => operation.collection === 'canciones') && typeof loadCanciones === 'function') loadCanciones();
    if (prepared.some(operation => operation.collection === 'cancion_audios') && typeof loadCancionAudios === 'function') loadCancionAudios();
}

function prepareBulkOperations(entries) {
    const now = Date.now();
    const songReferences = new Map();
    entries.forEach(({ item, collection }, index) => {
        if (collection !== 'canciones') return;
        const id = bulkDocumentId(item, collection, index, now);
        if (item.clave) {
            const key = String(item.clave).trim();
            if (songReferences.has(key)) throw new Error(`La clave de canción “${key}” está repetida.`);
            songReferences.set(key, { id, titulo: String(item.titulo || '').trim() });
        }
    });
    return entries.map(({ item, collection }, index) => {
        const id = bulkDocumentId(item, collection, index, now);
        const data = normalizeBulkItem(item, collection, songReferences);
        return {
            collection,
            ref: utils.doc(db, collection, id),
            data: { ...data, _offlineDeleted: false, _offlineActualizadoEn: new Date() }
        };
    });
}

function bulkDocumentId(item, collection, index, now) {
    const requested = String(item.id || (collection === 'versiones_android' ? item.versionCode || item.codigo : '') || '').trim();
    if (requested) {
        if (requested.includes('/') || requested.length > 180) throw new Error(`El id del elemento ${index + 1} no es válido.`);
        return requested;
    }
    return `${BULK_COLLECTIONS[collection].prefix}_${now}_${index}`;
}

function normalizeBulkItem(item, collection, songReferences) {
    if (collection === 'canciones') return normalizeBulkSong(item);
    if (collection === 'recursos') return normalizeBulkResource(item);
    if (collection === 'cancion_audios') return normalizeBulkAudio(item, songReferences);
    const data = bulkCleanObject(item);
    const now = new Date();
    if (collection === 'frases') Object.assign(data, { estado: item.estado || 'publicado', fechaCreacion: bulkDate(item.fechaCreacion, now) });
    if (collection === 'pasapalabra') Object.assign(data, { estado: item.estado || 'publicado', createdAt: bulkDate(item.createdAt, now) });
    if (collection === 'meditaciones') Object.assign(data, { activa: item.activa === true, Publico: item.Publico !== false, Meditación: item.Meditación === true, Informacion: item.Informacion === true });
    if (collection === 'canal_publicaciones') Object.assign(data, {
        audiencia: item.audiencia || 'general', rolesDestinatarios: Array.isArray(item.rolesDestinatarios) ? item.rolesDestinatarios : [],
        estado: item.estado || 'publicada', fechaPublicacion: bulkDate(item.fechaPublicacion, now), fechaVencimiento: bulkDate(item.fechaVencimiento),
        destacarEnCarrusel: item.destacarEnCarrusel === true, creadoEn: bulkDate(item.creadoEn, now), creadoPor: currentUser?.uid || '', actualizadoEn: now, actualizadoPor: currentUser?.uid || ''
    });
    if (collection === 'biblioteca_recursos') Object.assign(data, { estado: item.estado || 'borrador', creadoEn: bulkDate(item.creadoEn, now), creadoPor: currentUser?.uid || '', actualizadoEn: now, actualizadoPor: currentUser?.uid || '' });
    if (collection === 'notificaciones_pendientes') Object.assign(data, { tipo: item.tipo || 'manual', estado: 'pendiente', roles: Array.isArray(item.roles) ? item.roles : [], url: item.url || 'index.html', creadoPor: currentUser?.uid || '', creadoEn: now });
    if (collection === 'versiones_android') Object.assign(data, {
        versionCode: Number(item.versionCode || item.codigo),
        versionName: String(item.versionName || item.version || ''),
        newFeatures: Array.isArray(item.newFeatures) ? item.newFeatures : [],
        improvements: Array.isArray(item.improvements) ? item.improvements : [],
        fixes: Array.isArray(item.fixes) ? item.fixes : [],
        removedFeatures: Array.isArray(item.removedFeatures) ? item.removedFeatures : [],
        apkUrl: String(item.apkUrl || item.enlaceApk || ''),
        releaseDate: String(item.releaseDate || item.fechaPublicacion || ''),
        estado: 'pendiente',
        updatedAt: now,
        updatedBy: currentUser?.uid || ''
    });
    if (collection === 'pdv') {
        Object.assign(data, { version: Number(item.version) || 2, estado: item.estado || 'borrador', fechaCreacion: bulkDate(item.fechaCreacion, now), fechaActualizacion: now });
        if (item.fechaPublicacion) data.fechaPublicacion = bulkDate(item.fechaPublicacion);
    }
    return data;
}

function normalizeBulkAudio(item, songReferences) {
    const linked = item.cancionClave ? songReferences.get(String(item.cancionClave).trim()) : null;
    if (item.cancionClave && !linked) throw new Error(`No existe una canción con clave “${item.cancionClave}” dentro del JSON.`);
    const url = String(item.url).trim();
    const provider = item.proveedor || detectAudioProvider(url);
    const type = item.tipo || 'guia';
    return {
        cancionId: String(linked?.id || item.cancionId || '').trim(), cancionTitulo: String(item.cancionTitulo || linked?.titulo || '').trim(),
        url, proveedor: provider, modoReproduccion: item.modoReproduccion || (['youtube', 'spotify', 'soundcloud', 'drive', 'vimeo'].includes(provider) ? 'embed' : provider === 'directo' ? 'audio' : 'externo'),
        tipo: type, version: '', versionVocal: type === 'voces' ? String(item.versionVocal || '') : '', tipoVoz: type === 'voces' ? String(item.tipoVoz || '') : '',
        interprete: String(item.interprete || ''), idioma: String(item.idioma || 'Sin especificar'), nombre: String(item.nombre || item.cancionTitulo || linked?.titulo || 'Audio'), descripcion: String(item.descripcion || ''),
        estado: item.estado || 'pendiente', esPrincipal: item.esPrincipal === true, versionPrincipal: item.esPrincipal === true,
        permisosConfirmados: item.permisosConfirmados !== false, creadoPor: currentUser?.uid || '', creadoPorNombre: currentUser?.displayName || currentUser?.email || 'Administrador', fechaCreacion: bulkDate(item.fechaCreacion, new Date()), actualizadaEn: new Date()
    };
}

function bulkCleanObject(item) {
    return Object.fromEntries(Object.entries(item).filter(([key]) => !['coleccion', 'id', 'clave', 'cancionClave'].includes(key)));
}

function bulkDate(value, fallback = null) {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`La fecha “${value}” no es válida.`);
    return date;
}

function normalizeBulkSong(item) {
    return {
        titulo: String(item.titulo || '').trim(),
        artista: String(item.artista || '').trim(),
        letra: String(item.letra || ''),
        categoria: normalizeCancionCategory(item.categoria),
        estado: item.estado || 'pendiente',
        tono: String(item.tono || 'C'),
        idioma: String(item.idioma || 'Español'),
        fuente: String(item.fuente || ''),
        fechaCreacion: new Date(),
        activa: true,
        reproducciones: 0
    };
}

function normalizeBulkResource(item) {
    const data = {
        titulo: String(item.titulo).trim(),
        categoria: item.categoria,
        descripcion: String(item.descripcion).trim(),
        objetivo: String(item.objetivo).trim(),
        duracion: String(item.duracion).trim(),
        participantes: String(item.participantes).trim(),
        materiales: item.materiales.map(value => value.trim()).filter(Boolean),
        pasos: item.pasos.map(value => value.trim()).filter(Boolean),
        estado: item.estado || 'pendiente',
        autor: String(item.autor || 'Equipo Página Gen').trim(),
        fechaCreacion: new Date()
    };
    if (item.programa && Object.keys(item.programa).length) data.programa = item.programa;
    return data;
}

function clearBulkForm() {
    document.getElementById('bulk-json').value = '';
    document.getElementById('bulk-file').value = '';
    document.getElementById('bulk-preview-container').innerHTML = '';
    bulkPreviewData = [];
    bulkPreviewType = '';
    bulkPreparedOperations = [];
}

function clearBulkPreview() {
    document.getElementById('bulk-preview-container').innerHTML = '';
    bulkPreviewData = [];
    bulkPreviewType = '';
    bulkPreparedOperations = [];
}

// ==================== CANAL DE COMUNICACIÓN ====================
let canalItems = [];

function canalDate(value, fallback = new Date(0)) {
    if (!value) return fallback;
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date;
}

function canalEffectiveState(item) {
    return item.estado === 'programada' && canalDate(item.fechaPublicacion) <= new Date()
        ? 'publicada (programada)'
        : (item.estado || 'borrador');
}

function validOptionalWebUrl(value) {
    if (!value) return true;
    try {
        const url = new URL(value, document.baseURI);
        return ['http:', 'https:'].includes(url.protocol);
    } catch (_) {
        return false;
    }
}

function resolveCanalImageUrl(value) {
    const cleanValue = value.trim();
    if (!cleanValue) return '';
    try {
        if (/^https?:\/\//i.test(cleanValue)) return new URL(cleanValue).href;
        const siteRoot = new URL('../', document.baseURI);
        return new URL(cleanValue.replace(/^(\.\.\/|\.\/|\/)+/, ''), siteRoot).href;
    } catch (_) {
        return '';
    }
}

function closeCanalImagePreview() {
    const preview = document.getElementById('canal-image-preview');
    const image = document.getElementById('canal-image-preview-img');
    const toggle = document.getElementById('canal-preview-toggle');
    if (preview) preview.hidden = true;
    if (image) image.removeAttribute('src');
    if (toggle) {
        toggle.textContent = 'Ver miniatura';
        toggle.setAttribute('aria-expanded', 'false');
    }
}

function toggleCanalImagePreview() {
    const preview = document.getElementById('canal-image-preview');
    const image = document.getElementById('canal-image-preview-img');
    const status = document.getElementById('canal-image-preview-status');
    const toggle = document.getElementById('canal-preview-toggle');
    if (!preview || !image || !status || !toggle) return;

    if (!preview.hidden) {
        closeCanalImagePreview();
        return;
    }

    const resolvedUrl = resolveCanalImageUrl(document.getElementById('canal-imagen').value);
    preview.hidden = false;
    toggle.textContent = 'Ocultar miniatura';
    toggle.setAttribute('aria-expanded', 'true');
    status.textContent = resolvedUrl ? 'Cargando miniatura…' : 'Ingresá una dirección de imagen válida.';
    image.hidden = true;
    if (!resolvedUrl) return;

    image.onload = () => {
        image.hidden = false;
        status.textContent = `${image.naturalWidth} × ${image.naturalHeight} px`;
    };
    image.onerror = () => {
        image.hidden = true;
        status.textContent = 'No se pudo cargar esta imagen. Revisá la dirección.';
    };
    image.src = resolvedUrl;
}

function createCanalListImagePreview(item) {
    if (!item.imagenUrl) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'canal-list-preview';
    wrapper.hidden = true;

    const image = document.createElement('img');
    image.alt = `Vista previa de ${item.titulo || 'la comunicación'}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.hidden = true;

    const status = document.createElement('p');
    status.className = 'canal-list-preview-status';
    wrapper.append(image, status);

    return { wrapper, image, status };
}

function toggleCanalListImagePreview(preview, button, imageUrl) {
    if (!preview.wrapper.hidden) {
        preview.wrapper.hidden = true;
        preview.image.removeAttribute('src');
        preview.image.hidden = true;
        preview.status.textContent = '';
        button.textContent = 'Ver foto';
        button.setAttribute('aria-expanded', 'false');
        return;
    }

    preview.wrapper.hidden = false;
    preview.status.textContent = 'Cargando miniatura…';
    button.textContent = 'Ocultar foto';
    button.setAttribute('aria-expanded', 'true');
    const resolvedUrl = resolveCanalImageUrl(imageUrl);
    if (!resolvedUrl) {
        preview.status.textContent = 'La dirección de la imagen no es válida.';
        return;
    }

    preview.image.onload = () => {
        preview.image.hidden = false;
        preview.status.textContent = `${preview.image.naturalWidth} × ${preview.image.naturalHeight} px`;
    };
    preview.image.onerror = () => {
        preview.image.hidden = true;
        preview.status.textContent = 'No se pudo cargar la imagen.';
    };
    preview.image.src = resolvedUrl;
}

function setupCanalForm() {
    const form = document.getElementById('canal-form');
    const cancel = document.getElementById('canal-cancel');
    const audience = document.getElementById('canal-audiencia');
    const state = document.getElementById('canal-estado');
    const eventType = document.getElementById('canal-evento-tipo');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = 'true';
    form.addEventListener('submit', saveCanalPost);
    cancel.addEventListener('click', resetCanalForm);
    audience.addEventListener('change', updateCanalAudienceFields);
    state.addEventListener('change', updateCanalStateFields);
    eventType.addEventListener('change', updateCanalEventFields);
    document.getElementById('canal-destacar').addEventListener('change', updateCanalFeatureFields);
    document.getElementById('canal-preview-toggle')?.addEventListener('click', toggleCanalImagePreview);
    document.getElementById('canal-imagen')?.addEventListener('input', closeCanalImagePreview);
    document.getElementById('canal-archive-toggle')?.addEventListener('click', toggleCanalArchive);
    const managedZones = managedCommunicationZones();
    if (!isFullAdmin() && !currentUserRoles.includes('funcion_comunicacion') && managedZones.length) {
        audience.value = 'roles';
        audience.disabled = true;
        const rolesInput = document.getElementById('canal-roles');
        rolesInput.placeholder = managedZones.join(', ');
        rolesInput.value = managedZones[0];
    }
    updateCanalAudienceFields();
    updateCanalStateFields();
    updateCanalEventFields();
    updateCanalFeatureFields();
}

function updateCanalAudienceFields() {
    const isGeneral = document.getElementById('canal-audiencia').value === 'general';
    const rolesGroup = document.getElementById('canal-roles-group');
    const rolesInput = document.getElementById('canal-roles');
    rolesGroup.hidden = isGeneral;
    rolesInput.required = !isGeneral;
    if (isGeneral) rolesInput.value = '';
}

function updateCanalFeatureFields() {
    const featured = document.getElementById('canal-destacar').checked;
    const options = document.getElementById('canal-feature-options');
    const label = document.getElementById('canal-etiqueta');
    options.hidden = !featured;
    label.required = featured;
    if (!featured) label.value = '';
}

function updateCanalStateFields() {
    const scheduled = document.getElementById('canal-estado').value === 'programada';
    const date = document.getElementById('canal-fecha');
    date.required = scheduled;
    date.disabled = !scheduled;
    if (!scheduled) date.value = '';
}

function updateCanalEventFields() {
    const type = document.getElementById('canal-evento-tipo').value;
    const startGroup = document.getElementById('canal-evento-inicio-group');
    const endGroup = document.getElementById('canal-evento-fin-group');
    const start = document.getElementById('canal-evento-inicio');
    const end = document.getElementById('canal-evento-fin');
    const startLabel = document.getElementById('canal-evento-inicio-label');
    const hasDate = type !== 'ninguna';
    const isRange = type === 'rango';
    startGroup.hidden = !hasDate;
    endGroup.hidden = !isRange;
    start.required = hasDate;
    end.required = isRange;
    startLabel.textContent = isRange ? 'Desde' : 'Fecha del evento';
    if (!hasDate) start.value = '';
    if (!isRange) end.value = '';
}

function toggleCanalArchive() {
    const list = document.getElementById('canal-archived-list');
    const toggle = document.getElementById('canal-archive-toggle');
    if (!list || !toggle) return;
    list.hidden = !list.hidden;
    toggle.setAttribute('aria-expanded', String(!list.hidden));
}

function isCanalArchived(item, now = new Date()) {
    return item.estado === 'archivada'
        || (item.fechaVencimiento && canalDate(item.fechaVencimiento) <= now);
}

function renderCanalAdminItem(item, { archived = false } = {}) {
    const row = document.createElement('article');
    row.className = `canal-admin-item${archived ? ' is-archived' : ''}`;
    const title = document.createElement('h3');
    title.textContent = item.titulo || 'Sin título';
    const meta = document.createElement('p');
    meta.className = 'canal-admin-meta';
    const expiryText = item.fechaVencimiento
        ? ` · ${archived ? 'Venció' : 'Vence'} ${canalDate(item.fechaVencimiento).toLocaleString('es-AR')}`
        : '';
    meta.textContent = `${archived ? 'Archivada' : canalEffectiveState(item)} · ${item.rolesDestinatarios?.length ? item.rolesDestinatarios.join(', ') : 'General'}${item.destacarEnCarrusel ? ` · ${item.etiquetaCarrusel || 'Novedad'}` : ''}${expiryText}${item.legacyCarrusel ? ' · Formato anterior' : ''}`;
    const summary = document.createElement('p');
    summary.textContent = item.resumen || '';
    const actions = document.createElement('div');
    actions.className = 'canal-admin-actions';
    const edit = document.createElement('button');
    edit.className = 'btn-edit';
    edit.textContent = archived ? 'Editar o republicar' : 'Editar';
    edit.addEventListener('click', () => editCanalPost(item.id));
    const remove = document.createElement('button');
    remove.className = 'btn-delete';
    remove.textContent = 'Borrar';
    remove.addEventListener('click', () => deleteCanalPost(item.id));
    const preview = createCanalListImagePreview(item);
    if (preview) {
        const showImage = document.createElement('button');
        showImage.className = 'btn-preview';
        showImage.type = 'button';
        showImage.textContent = 'Ver foto';
        showImage.setAttribute('aria-expanded', 'false');
        showImage.addEventListener('click', () => toggleCanalListImagePreview(preview, showImage, item.imagenUrl));
        actions.append(showImage);
    }
    actions.append(edit, remove);
    row.append(title, meta, summary);
    if (preview) row.append(preview.wrapper);
    row.append(actions);
    return row;
}

async function loadCanalAdmin() {
    const container = document.getElementById('canal-list');
    const archivedContainer = document.getElementById('canal-archived-list');
    if (!container || !archivedContainer) return;
    container.innerHTML = '<p style="color:var(--text-muted)">Cargando publicaciones...</p>';
    try {
        const limitedZones = !isFullAdmin() && !currentUserRoles.includes('funcion_comunicacion')
            ? managedCommunicationZones()
            : [];
        const snapshots = limitedZones.length
            ? await Promise.all(limitedZones.map(zone => utils.getDocs(utils.query(
                utils.collection(db, 'canal_publicaciones'),
                utils.where('zonaAdministradora', '==', zone),
                utils.limit(ADMIN_QUERY_LIMIT)
            ))))
            : [await utils.getDocs(utils.query(
                utils.collection(db, 'canal_publicaciones'),
                utils.limit(ADMIN_QUERY_LIMIT)
            ))];
        const legacySnapshot = limitedZones.length
            ? { docs: [] }
            : await utils.getDocs(utils.query(
                utils.collection(db, 'carrusel'),
                utils.limit(ADMIN_QUERY_LIMIT)
            ));
        const currentItemMap = new Map();
        snapshots.flatMap(snapshot => snapshot.docs).forEach(docSnap => {
            currentItemMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        });
        const currentItems = [...currentItemMap.values()];
        const legacyItems = legacySnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            return {
                id: `legacy:${docSnap.id}`,
                legacyId: docSnap.id,
                legacyCarrusel: true,
                titulo: data.titulo || '',
                resumen: data.descripcion || '',
                contenido: '',
                imagenUrl: data.fotoUrl || '',
                enlace: data.href || '',
                textoEnlace: 'Más información',
                rolesDestinatarios: [],
                audiencia: 'general',
                estado: 'publicada',
                fechaPublicacion: data.createdAt || new Date(0),
                tipoFechaEvento: 'ninguna',
                fechaEventoInicio: '',
                fechaEventoFin: '',
                etiquetaCarrusel: data.etiquetaCarrusel || data.categoria || 'Novedad',
                destacarEnCarrusel: true
            };
        });
        canalItems = [...currentItems, ...legacyItems]
            .sort((a, b) => canalDate(b.fechaPublicacion) - canalDate(a.fechaPublicacion));
        const now = new Date();
        const activeItems = canalItems.filter(item => !isCanalArchived(item, now));
        const archivedItems = canalItems.filter(item => isCanalArchived(item, now));
        document.getElementById('canal-archive-count').textContent = String(archivedItems.length);
        container.innerHTML = '';
        activeItems.forEach(item => container.appendChild(renderCanalAdminItem(item)));
        if (!activeItems.length) container.innerHTML = '<p style="color:var(--text-muted)">No hay comunicaciones activas.</p>';
        archivedContainer.replaceChildren();
        archivedItems.forEach(item => archivedContainer.appendChild(renderCanalAdminItem(item, { archived: true })));
        if (!archivedItems.length) archivedContainer.innerHTML = '<p style="color:var(--text-muted)">No hay comunicaciones archivadas.</p>';
    } catch (error) { console.error(error); container.innerHTML = '<p style="color:var(--danger-color)">No se pudieron cargar las publicaciones.</p>'; }
}

async function saveCanalPost(event) {
    event.preventDefault();
    const id = document.getElementById('canal-edit-id').value;
    const estado = document.getElementById('canal-estado').value;
    const fechaInput = document.getElementById('canal-fecha').value;
    if (estado === 'programada' && !fechaInput) return alert('Elegí la fecha y hora para programar la publicación.');
    const eventType = document.getElementById('canal-evento-tipo').value;
    const eventStart = document.getElementById('canal-evento-inicio').value;
    const eventEnd = document.getElementById('canal-evento-fin').value;
    if (eventType !== 'ninguna' && !eventStart) return alert('Elegí la fecha del evento.');
    if (eventType === 'rango' && !eventEnd) return alert('Elegí la fecha final del evento.');
    if (eventType === 'rango' && eventEnd < eventStart) return alert('La fecha final del evento no puede ser anterior a la inicial.');
    const audiencia = document.getElementById('canal-audiencia').value;
    const roles = audiencia === 'roles'
        ? [...new Set(document.getElementById('canal-roles').value.split(',').map(role => role.trim()).filter(Boolean))]
        : [];
    if (audiencia === 'roles' && !roles.length) return alert('Ingresá al menos una zona destinataria.');
    const limitedZones = !isFullAdmin() && !currentUserRoles.includes('funcion_comunicacion')
        ? managedCommunicationZones()
        : [];
    if (limitedZones.length && (roles.length !== 1 || !limitedZones.includes(roles[0]))) {
        return alert('Sólo podés publicar para una de las zonas que administrás.');
    }
    const imageValue = document.getElementById('canal-imagen').value.trim();
    const linkValue = document.getElementById('canal-enlace').value.trim();
    const linkTextValue = document.getElementById('canal-texto-enlace').value.trim();
    const linkTextWords = linkTextValue.split(/\s+/).filter(Boolean);
    const featured = document.getElementById('canal-destacar').checked;
    const expiryValue = document.getElementById('canal-vencimiento').value;
    if (!expiryValue) return alert('Elegí hasta cuándo debe mostrarse la comunicación.');
    const expiryDate = expiryValue ? new Date(expiryValue) : null;
    if (expiryDate <= new Date()) return alert('La fecha de vencimiento debe ser futura.');
    if (!validOptionalWebUrl(imageValue)) return alert('La imagen debe ser una ruta del sitio o una URL http/https válida.');
    if (!validOptionalWebUrl(linkValue)) return alert('El enlace debe ser una URL http/https válida.');
    if (linkTextWords.length > 4) return alert('El texto del botón puede tener como máximo 4 palabras.');
    const data = {
        titulo: document.getElementById('canal-titulo').value.trim(),
        resumen: document.getElementById('canal-resumen').value.trim(),
        contenido: document.getElementById('canal-contenido').value.trim(),
        imagenUrl: imageValue,
        enlace: linkValue,
        textoEnlace: linkTextValue || 'Más información',
        rolesDestinatarios: roles,
        zonaAdministradora: roles.length === 1 && roles[0].startsWith('zona_') ? roles[0] : '',
        audiencia,
        estado,
        fechaPublicacion: estado === 'programada' ? new Date(fechaInput) : new Date(),
        tipoFechaEvento: eventType,
        fechaEventoInicio: eventType === 'ninguna' ? '' : eventStart,
        fechaEventoFin: eventType === 'rango' ? eventEnd : '',
        etiquetaCarrusel: featured
            ? document.getElementById('canal-etiqueta').value.trim()
            : '',
        destacarEnCarrusel: featured,
        fechaVencimiento: expiryDate,
        eliminarEn: null,
        actualizadoEn: new Date(),
        actualizadoPor: currentUser.uid
    };
    try {
        if (id.startsWith('legacy:')) {
            await utils.addDoc(utils.collection(db, 'canal_publicaciones'), { ...data, creadoEn: new Date(), creadoPor: currentUser.uid });
            await utils.deleteDoc(utils.doc(db, 'carrusel', id.slice('legacy:'.length)));
        } else if (id) await utils.updateDoc(utils.doc(db, 'canal_publicaciones', id), data);
        else await utils.addDoc(utils.collection(db, 'canal_publicaciones'), { ...data, creadoEn: new Date(), creadoPor: currentUser.uid });
        resetCanalForm(); await loadCanalAdmin();
    } catch (error) { console.error(error); alert(`No se pudo guardar: ${error.message}`); }
}

function editCanalPost(id) {
    const item = canalItems.find(post => post.id === id); if (!item) return;
    document.getElementById('canal-form-title').textContent = item.legacyCarrusel ? 'Convertir novedad anterior' : 'Editar comunicación';
    document.getElementById('canal-edit-id').value = id;
    document.getElementById('canal-titulo').value = item.titulo || '';
    document.getElementById('canal-resumen').value = item.resumen || '';
    document.getElementById('canal-contenido').value = item.contenido || '';
    document.getElementById('canal-imagen').value = item.imagenUrl || '';
    closeCanalImagePreview();
    document.getElementById('canal-enlace').value = item.enlace || '';
    document.getElementById('canal-texto-enlace').value = item.textoEnlace || '';
    document.getElementById('canal-audiencia').value = item.rolesDestinatarios?.length ? 'roles' : 'general';
    document.getElementById('canal-roles').value = (item.rolesDestinatarios || []).join(', ');
    document.getElementById('canal-estado').value = item.estado || 'borrador';
    const date = canalDate(item.fechaPublicacion);
    document.getElementById('canal-fecha').value = item.estado === 'programada' && item.fechaPublicacion ? date.toISOString().slice(0, 16) : '';
    const eventType = item.tipoFechaEvento || (item.fechaEventoFin ? 'rango' : (item.fechaEventoInicio ? 'dia' : 'ninguna'));
    document.getElementById('canal-evento-tipo').value = eventType;
    document.getElementById('canal-evento-inicio').value = item.fechaEventoInicio || '';
    document.getElementById('canal-evento-fin').value = item.fechaEventoFin || '';
    document.getElementById('canal-destacar').checked = Boolean(item.destacarEnCarrusel);
    document.getElementById('canal-etiqueta').value = item.destacarEnCarrusel ? (item.etiquetaCarrusel || 'Novedad') : '';
    document.getElementById('canal-vencimiento').value = item.fechaVencimiento
        ? canalDate(item.fechaVencimiento).toISOString().slice(0, 16)
        : '';
    updateCanalAudienceFields();
    updateCanalFeatureFields();
    updateCanalStateFields();
    updateCanalEventFields();
    document.getElementById('canal-evento-inicio').value = item.fechaEventoInicio || '';
    document.getElementById('canal-evento-fin').value = item.fechaEventoFin || '';
    // Restaurar los roles después de actualizar la visibilidad del campo.
    document.getElementById('canal-roles').value = (item.rolesDestinatarios || []).join(', ');
    document.getElementById('canal-cancel').style.display = 'inline-block';
    document.getElementById('canal-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetCanalForm() {
    document.getElementById('canal-form').reset();
    const limitedZones = !isFullAdmin() && !currentUserRoles.includes('funcion_comunicacion')
        ? managedCommunicationZones()
        : [];
    if (limitedZones.length) {
        document.getElementById('canal-audiencia').value = 'roles';
        document.getElementById('canal-roles').value = limitedZones[0];
    }
    document.getElementById('canal-etiqueta').value = '';
    document.getElementById('canal-vencimiento').value = '';
    document.getElementById('canal-edit-id').value = '';
    document.getElementById('canal-cancel').style.display = 'none';
    document.getElementById('canal-form-title').textContent = '💬 Crear comunicación';
    closeCanalImagePreview();
    updateCanalAudienceFields();
    updateCanalFeatureFields();
    updateCanalStateFields();
    updateCanalEventFields();
}
async function deleteCanalPost(id) {
    if (!confirm('¿Borrar esta publicación?')) return;
    try {
        const isLegacy = id.startsWith('legacy:');
        await utils.deleteDoc(utils.doc(db, isLegacy ? 'carrusel' : 'canal_publicaciones', isLegacy ? id.slice('legacy:'.length) : id));
        await loadCanalAdmin();
    } catch (error) { alert(`No se pudo borrar: ${error.message}`); }
}

// ==================== ZONAS Y CÓDIGOS DE ACCESO ====================

function setupAccessAdmin() {
    const zoneForm = document.getElementById('zona-form');
    const codeForm = document.getElementById('codigo-form');
    if (!zoneForm || zoneForm.dataset.bound) return;
    zoneForm.dataset.bound = 'true';
    zoneForm.addEventListener('submit', createAccessZone);
    codeForm.addEventListener('submit', createAccessCode);
    document.getElementById('codigo-tipo').addEventListener('change', updateCodeTypeFields);
    document.getElementById('codigo-destino-tipo').addEventListener('change', updateCodeDestinationFields);
    document.getElementById('codigos-filtro').addEventListener('change', renderAccessCodes);
    document.getElementById('codigos-destino-filtro').addEventListener('change', renderAccessCodes);
    document.getElementById('perfiles-busqueda')?.addEventListener('input', renderRoleProfiles);
    document.getElementById('desactivar-acceso-toggle')?.addEventListener('click', toggleDeactivationPanel);
    document.getElementById('desactivar-acceso-tipo')?.addEventListener('change', renderDeactivationOptions);
    document.getElementById('codigo-generado-copiar').addEventListener('click', () => {
        copyAccessCode(document.getElementById('codigo-generado-valor').textContent);
    });
    document.getElementById('zona-nombre').addEventListener('input', event => {
        const idInput = document.getElementById('zona-id');
        if (!idInput.dataset.manual) idInput.value = zoneRoleId(event.target.value);
    });
    document.getElementById('zona-id').addEventListener('input', event => {
        event.target.dataset.manual = event.target.value ? 'true' : '';
    });
    updateCodeTypeFields();
    updateCodeDestinationFields();
}

function roleDisplayName(role) {
    if (role === 'admin') return 'Administrador total';
    const item = [...accessZones, ...accessFunctions].find(entry => entry.id === role);
    return item?.nombre || role.replaceAll('_', ' ');
}

function effectiveProfileRoles(user) {
    const roles = new Set(Array.isArray(user.roles) ? user.roles : []);
    if (roles.has('gen2')) roles.add('gen');
    return [...roles];
}

function createRolePill(user, role, { inherited = false } = {}) {
    const pill = document.createElement('span');
    pill.className = 'profile-role-pill';
    pill.textContent = `${roleDisplayName(role)}${inherited ? ' · heredado' : ''}`;
    if (!inherited) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Retirar';
        remove.setAttribute('aria-label', `Retirar ${roleDisplayName(role)} de ${user.nombre || user.email}`);
        remove.addEventListener('click', () => revokeUserRole(user, role));
        pill.appendChild(remove);
    }
    return pill;
}

function renderRoleProfiles() {
    const groupedContainer = document.getElementById('roles-perfiles-list');
    const profilesContainer = document.getElementById('perfiles-list');
    if (!groupedContainer || !profilesContainer) return;
    groupedContainer.replaceChildren();
    const knownRoles = new Set(['admin']);
    [...accessZones, ...accessFunctions].forEach(item => knownRoles.add(item.id));
    accessUsers.forEach(user => effectiveProfileRoles(user).forEach(role => knownRoles.add(role)));
    [...knownRoles].sort((a, b) => roleDisplayName(a).localeCompare(roleDisplayName(b), 'es')).forEach(role => {
        const members = accessUsers.filter(user => effectiveProfileRoles(user).includes(role));
        const details = document.createElement('details');
        details.className = 'role-group';
        const summary = document.createElement('summary');
        summary.textContent = `${roleDisplayName(role)} (${members.length})`;
        details.appendChild(summary);
        if (!members.length) {
            const empty = document.createElement('p');
            empty.className = 'admin-list-status';
            empty.textContent = 'No hay personas con este rol.';
            details.appendChild(empty);
        } else {
            members.sort((a, b) => (a.nombre || a.email || '').localeCompare(b.nombre || b.email || '', 'es'))
                .forEach(user => {
                    const row = document.createElement('div');
                    row.className = 'role-member';
                    const identity = document.createElement('span');
                    identity.textContent = `${user.nombre || user.displayName || 'Sin nombre'} · ${user.email || 'Sin correo'}`;
                    row.appendChild(identity);
                    const inherited = role === 'gen' && !user.roles?.includes('gen') && user.roles?.includes('gen2');
                    if (inherited) {
                        const note = document.createElement('small');
                        note.textContent = 'Por Gen2';
                        row.appendChild(note);
                    } else {
                        const remove = document.createElement('button');
                        remove.type = 'button';
                        remove.className = 'btn-delete';
                        remove.textContent = 'Retirar';
                        remove.addEventListener('click', () => revokeUserRole(user, role));
                        row.appendChild(remove);
                    }
                    details.appendChild(row);
                });
        }
        groupedContainer.appendChild(details);
    });

    const term = (document.getElementById('perfiles-busqueda')?.value || '').trim().toLowerCase();
    const filteredUsers = accessUsers
        .filter(user => !term || `${user.nombre || ''} ${user.displayName || ''} ${user.email || ''}`.toLowerCase().includes(term))
        .sort((a, b) => (a.nombre || a.email || '').localeCompare(b.nombre || b.email || '', 'es'));
    profilesContainer.replaceChildren();
    filteredUsers.forEach(user => {
        const card = document.createElement('article');
        card.className = 'profile-access-card';
        const title = document.createElement('strong');
        title.textContent = user.nombre || user.displayName || 'Sin nombre';
        const email = document.createElement('span');
        email.textContent = user.email || 'Sin correo';
        const roles = document.createElement('div');
        roles.className = 'profile-role-list';
        const storedRoles = Array.isArray(user.roles) ? user.roles : [];
        storedRoles.forEach(role => roles.appendChild(createRolePill(user, role)));
        if (storedRoles.includes('gen2') && !storedRoles.includes('gen')) {
            roles.appendChild(createRolePill(user, 'gen', { inherited: true }));
        }
        if (!roles.childElementCount) {
            const empty = document.createElement('small');
            empty.textContent = 'Sin roles asignados';
            roles.appendChild(empty);
        }
        const assignment = document.createElement('div');
        assignment.className = 'profile-role-assignment';
        const select = document.createElement('select');
        select.setAttribute('aria-label', `Agregar rol a ${user.nombre || user.email}`);
        select.innerHTML = '<option value="">Elegí un rol para agregar</option>';
        const currentRoles = new Set(effectiveProfileRoles(user));
        const availableRoles = [
            ...accessZones.filter(item => item.activa !== false),
            ...accessFunctions.filter(item => item.activa !== false)
        ].filter(item => !currentRoles.has(item.id))
            .sort((a, b) => roleDisplayName(a.id).localeCompare(roleDisplayName(b.id), 'es'));
        availableRoles.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = roleDisplayName(item.id);
            select.appendChild(option);
        });
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'btn-secondary';
        add.textContent = 'Agregar rol';
        add.disabled = !availableRoles.length;
        add.addEventListener('click', () => {
            if (!select.value) return alert('Elegí un rol para agregar.');
            assignRoleToUser(user, select.value);
        });
        assignment.append(select, add);
        card.append(title, email, roles, assignment);
        profilesContainer.appendChild(card);
    });
    if (!filteredUsers.length) profilesContainer.innerHTML = '<p class="admin-list-status">No encontramos perfiles.</p>';
}

async function revokeUserRole(user, role) {
    if (role === 'admin' && user.id === currentUser.uid) {
        return alert('No podés retirar tu propio rol de administrador.');
    }
    if (role === 'admin') {
        const adminCount = accessUsers.filter(item => item.roles?.includes('admin')).length;
        if (adminCount <= 1) return alert('No se puede retirar el rol del último administrador.');
    }
    if (!confirm(`¿Retirar “${roleDisplayName(role)}” de ${user.nombre || user.email || 'esta cuenta'}?`)) return;
    const roles = (Array.isArray(user.roles) ? user.roles : []).filter(item => item !== role);
    const history = Array.isArray(user.historialRoles) ? user.historialRoles.slice(-99) : [];
    history.push({
        accion: 'retirado',
        rol: role,
        realizadoPor: currentUser.uid,
        fecha: new Date()
    });
    try {
        await utils.updateDoc(utils.doc(db, 'usuarios', user.id), {
            roles,
            historialRoles: history,
            accesoActualizadoEn: new Date(),
            accesoActualizadoPor: currentUser.uid
        });
        await loadAccessAdmin();
    } catch (error) {
        console.error(error);
        alert(`No se pudo retirar el rol: ${error.message}`);
    }
}

function accessRoleId(value, type = 'zona') {
    const normalized = String(value || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (type === 'funcionalidad' && ['admin', 'administrador'].includes(normalized)) return 'admin';
    const prefix = type === 'funcionalidad' ? 'funcion_' : 'zona_';
    return `${prefix}${normalized}`;
}

function zoneRoleId(value) {
    return accessRoleId(value, 'zona');
}

function updateCodeTypeFields() {
    const limited = document.getElementById('codigo-tipo').value === 'limitado';
    const group = document.getElementById('codigo-max-usos-group');
    const input = document.getElementById('codigo-max-usos');
    group.hidden = !limited;
    input.required = limited;
    input.disabled = !limited;
}

function updateCodeDestinationFields() {
    const destinationType = document.getElementById('codigo-destino-tipo').value;
    const isZone = destinationType === 'zona';
    document.getElementById('codigo-zona-group').hidden = !isZone;
    document.getElementById('codigo-funcionalidad-group').hidden = isZone;
    document.getElementById('codigo-zona').required = isZone;
    document.getElementById('codigo-funcionalidad').required = !isZone;
}

async function loadAccessAdmin() {
    try {
        const [zonesSnapshot, functionsSnapshot, codesSnapshot, usersSnapshot] = await Promise.all([
            utils.getDocs(utils.collection(db, 'zonas')),
            utils.getDocs(utils.collection(db, 'funcionalidades')),
            utils.getDocs(utils.query(utils.collection(db, 'codigos_roles'), utils.limit(ADMIN_QUERY_LIMIT))),
            utils.getDocs(utils.query(utils.collection(db, 'usuarios'), utils.limit(ADMIN_QUERY_LIMIT)))
        ]);
        accessZones = zonesSnapshot.docs.map(item => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (a.nombre || a.id).localeCompare(b.nombre || b.id, 'es'));
        const storedFunctions = functionsSnapshot.docs
            .map(item => ({ id: item.id, ...item.data() }))
            .filter(item => item.id !== 'funcion_correccion_letras');
        const fixedRoles = [
            ...FIXED_AUDIENCE_ROLES.map(item => ({ ...item, fixed: true, roleType: 'audiencia' })),
            ...FIXED_FUNCTION_ROLES.map(item => ({
                ...item,
                fixed: true,
                roleType: 'funcionalidad'
            }))
        ];
        const functionMap = new Map(fixedRoles.map(item => [item.id, item]));
        storedFunctions.forEach(item => functionMap.set(item.id, {
            roleType: 'funcionalidad',
            ...functionMap.get(item.id),
            ...item
        }));
        accessZones.forEach(zone => {
            const roleId = zone.rolComunicacion || `funcion_comunicacion_${zone.id}`;
            if (functionMap.has(roleId)) return;
            functionMap.set(roleId, {
                id: roleId,
                nombre: `Comunicación · ${zone.nombre || zone.id}`,
                descripcion: `Administración de comunicaciones para ${zone.nombre || zone.id}.`,
                activa: zone.activa !== false,
                zonaRol: zone.id,
                generadoAutomaticamente: true,
                derivadoDeZona: true,
                roleType: 'funcionalidad'
            });
        });
        accessFunctions = [...functionMap.values()]
            .sort((a, b) => (a.nombre || a.id).localeCompare(b.nombre || b.id, 'es'));
        accessCodes = codesSnapshot.docs.map(item => ({ id: item.id, ...item.data() }))
            .sort((a, b) => accessDate(b.creadoEn) - accessDate(a.creadoEn));
        accessUsers = usersSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        renderAccessZones();
        renderAccessCodes();
        renderRoleProfiles();
        renderDeactivationOptions();
        updateAccessStats();
    } catch (error) {
        console.error('No se pudieron cargar zonas y códigos:', error);
        document.getElementById('zonas-list').innerHTML = '<p class="admin-list-status admin-list-error">No se pudieron cargar las zonas.</p>';
        document.getElementById('codigos-list').innerHTML = '<p class="admin-list-status admin-list-error">No se pudieron cargar los códigos.</p>';
    }
}

function accessDate(value) {
    if (!value) return new Date(0);
    return typeof value.toDate === 'function' ? value.toDate() : new Date(value);
}

function isAccessCodeAvailable(code) {
    if (code.usado === true) return false;
    if (code.activo === false) return false;
    if (code.venceEn && accessDate(code.venceEn) <= new Date()) return false;
    if (code.tipo !== 'libre' && Number(code.usosActuales || 0) >= Number(code.maxUsos || 1)) return false;
    return true;
}

function renderAccessZones() {
    const zoneContainer = document.getElementById('zonas-list');
    const communicationContainer = document.getElementById('comunicacion-admin-list');
    const functionContainer = document.getElementById('funciones-list');
    const audienceContainer = document.getElementById('roles-generales-list');
    const zoneSelect = document.getElementById('codigo-zona');
    const functionSelect = document.getElementById('codigo-funcionalidad');
    zoneContainer.replaceChildren();
    communicationContainer.replaceChildren();
    functionContainer.replaceChildren();
    audienceContainer.replaceChildren();
    zoneSelect.innerHTML = '<option value="">Elegí una zona</option>';
    functionSelect.innerHTML = '<option value="">Elegí un rol o función</option>';
    const communicationOptions = document.createElement('optgroup');
    communicationOptions.label = 'Administración de comunicación';
    const functionOptions = document.createElement('optgroup');
    functionOptions.label = 'Otras funciones';
    const audienceOptions = document.createElement('optgroup');
    audienceOptions.label = 'Roles generales';

    const renderEntry = (entry, accessType, container) => {
        const row = document.createElement('article');
        row.className = `access-item${entry.activa === false ? ' access-item-inactive' : ''}`;
        const info = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = entry.nombre || entry.id;
        const meta = document.createElement('span');
        const typeName = entry.roleType === 'audiencia'
            ? 'Audiencia'
            : (entry.roleType === 'administracion' ? 'Administración' : (accessType === 'zona' ? 'Zona' : 'Función'));
        meta.textContent = `${typeName} · ${entry.id} · ${entry.activa === false ? 'Inactiva' : 'Activa'}`;
        info.append(title, meta);
        if (entry.descripcion) {
            const description = document.createElement('p');
            description.textContent = entry.descripcion;
            info.appendChild(description);
        }
        row.appendChild(info);
        if (entry.activa !== false) {
            const codeButton = document.createElement('button');
            codeButton.type = 'button';
            codeButton.className = 'btn-secondary';
            codeButton.textContent = 'Crear código';
            codeButton.addEventListener('click', () => prepareCodeForRole(entry.id, accessType));
            row.appendChild(codeButton);
        }
        container.appendChild(row);

        if (entry.activa !== false) {
            const option = document.createElement('option');
            option.value = entry.id;
            option.textContent = entry.nombre || entry.id;
            if (accessType === 'zona') {
                zoneSelect.appendChild(option);
            } else if (entry.id === 'funcion_comunicacion' || entry.id.startsWith('funcion_comunicacion_')) {
                communicationOptions.appendChild(option);
            } else if (entry.roleType === 'audiencia') {
                audienceOptions.appendChild(option);
            } else {
                functionOptions.appendChild(option);
            }
        }
    };

    accessZones.forEach(item => renderEntry(item, 'zona', zoneContainer));
    accessFunctions.forEach(item => {
        const isCommunicationAdmin = item.id === 'funcion_comunicacion'
            || item.id.startsWith('funcion_comunicacion_');
        const container = isCommunicationAdmin
            ? communicationContainer
            : (item.roleType === 'funcionalidad' ? functionContainer : audienceContainer);
        renderEntry(item, 'funcionalidad', container);
    });
    [communicationOptions, functionOptions, audienceOptions].forEach(group => {
        if (group.children.length) functionSelect.appendChild(group);
    });
    if (!accessZones.length) zoneContainer.innerHTML = '<p class="admin-list-status">Todavía no hay zonas.</p>';
    if (!accessFunctions.some(item => item.id === 'funcion_comunicacion' || item.id.startsWith('funcion_comunicacion_'))) communicationContainer.innerHTML = '<p class="admin-list-status">Todavía no hay permisos de comunicación.</p>';
    if (!accessFunctions.some(item => item.roleType === 'funcionalidad' && item.id !== 'funcion_comunicacion' && !item.id.startsWith('funcion_comunicacion_'))) functionContainer.innerHTML = '<p class="admin-list-status">Todavía no hay otras funciones.</p>';
    if (!accessFunctions.some(item => item.roleType !== 'funcionalidad')) audienceContainer.innerHTML = '<p class="admin-list-status">Todavía no hay roles generales.</p>';
}

function prepareCodeForRole(role, accessType) {
    const destination = document.getElementById('codigo-destino-tipo');
    destination.value = accessType;
    updateCodeDestinationFields();
    document.getElementById(accessType === 'zona' ? 'codigo-zona' : 'codigo-funcionalidad').value = role;
    if (accessType === 'funcionalidad') {
        document.getElementById('codigo-tipo').value = 'unico';
        updateCodeTypeFields();
    }
    document.getElementById('codigo-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderAccessCodes() {
    const container = document.getElementById('codigos-list');
    if (!container) return;
    const filter = document.getElementById('codigos-filtro').value;
    const destinationFilter = document.getElementById('codigos-destino-filtro').value;
    const filtered = accessCodes.filter(code => {
        const available = isAccessCodeAvailable(code);
        const statusMatches = filter === 'todos' || (filter === 'activos' ? available : !available);
        const destinationType = code.destinoTipo === 'funcionalidad' ? 'funcionalidad' : 'zona';
        return statusMatches && (destinationFilter === 'todos' || destinationType === destinationFilter);
    });
    container.replaceChildren();
    filtered.forEach(code => {
        const available = isAccessCodeAvailable(code);
        const uses = Number(code.usosActuales || (code.usado ? 1 : 0));
        const maximum = code.tipo === 'libre' ? 'sin límite' : Number(code.maxUsos || 1);
        const row = document.createElement('article');
        row.className = `access-item access-code-item${available ? '' : ' access-item-inactive'}`;
        const info = document.createElement('div');
        const title = document.createElement('strong');
        title.className = 'access-code-value';
        title.textContent = code.id;
        const zone = accessZones.find(item => item.id === code.rol);
        const accessFunction = accessFunctions.find(item => item.id === code.rol);
        const destination = code.destinoTipo === 'funcionalidad'
            ? `Función: ${accessFunction?.nombre || code.rol}`
            : (zone?.nombre || code.rol || 'Sin destino');
        const meta = document.createElement('span');
        meta.textContent = `${destination} · ${uses}/${maximum} usos · ${available ? 'Activo' : accessCodeStatus(code)}`;
        info.append(title, meta);
        if (code.destinatarioEmail) {
            const recipient = document.createElement('small');
            recipient.textContent = `Reservado para: ${code.destinatarioEmail}`;
            info.appendChild(recipient);
        }
        if (code.nota) {
            const note = document.createElement('p');
            note.textContent = code.nota;
            info.appendChild(note);
        }
        if (code.venceEn) {
            const expiry = document.createElement('small');
            expiry.textContent = `Vence: ${accessDate(code.venceEn).toLocaleString('es-AR')}`;
            info.appendChild(expiry);
        }
        const actions = document.createElement('div');
        actions.className = 'access-item-actions';
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'btn-secondary';
        copy.textContent = 'Copiar';
        copy.addEventListener('click', () => copyAccessCode(code.id));
        actions.appendChild(copy);
        const history = document.createElement('div');
        history.className = 'access-code-history';
        history.hidden = true;
        if (uses > 0 && code.tipo) {
            const showHistory = document.createElement('button');
            showHistory.type = 'button';
            showHistory.className = 'btn-secondary';
            showHistory.textContent = 'Ver canjes';
            showHistory.addEventListener('click', () => toggleCodeHistory(code, history, showHistory));
            actions.appendChild(showHistory);
        }
        if (!code.usado && !isAccessCodeExhausted(code)) {
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = code.activo === false ? 'btn-secondary' : 'btn-delete';
            const isFree = code.tipo === 'libre';
            toggle.textContent = code.activo === false
                ? (isFree ? 'Descongelar' : 'Reactivar')
                : (isFree ? 'Congelar' : 'Cancelar');
            toggle.addEventListener('click', () => toggleAccessCode(code));
            actions.appendChild(toggle);
        }
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn-delete';
        remove.textContent = 'Eliminar';
        remove.addEventListener('click', () => deleteAccessCode(code));
        actions.appendChild(remove);
        row.append(info, actions, history);
        container.appendChild(row);
    });
    if (!filtered.length) container.innerHTML = '<p class="admin-list-status">No hay códigos para este filtro.</p>';
}

async function toggleCodeHistory(code, container, button) {
    if (!container.hidden) {
        container.hidden = true;
        button.textContent = 'Ver canjes';
        return;
    }
    container.hidden = false;
    button.textContent = 'Ocultar canjes';
    if (container.dataset.loaded) return;
    container.textContent = 'Cargando canjes...';
    try {
        const snapshot = await utils.getDocs(utils.query(
            utils.collection(db, 'codigos_roles', code.id, 'canjes'),
            utils.limit(ADMIN_QUERY_LIMIT)
        ));
        const usersById = new Map(accessUsers.map(user => [user.id, user]));
        const redemptions = snapshot.docs.map(item => {
            const data = item.data();
            const user = usersById.get(data.uid) || {};
            return {
                uid: data.uid,
                name: user.nombre || user.displayName || user.email || data.uid,
                date: accessDate(data.canjeadoEn)
            };
        });
        container.replaceChildren();
        redemptions.sort((a, b) => b.date - a.date).forEach(redemption => {
            const entry = document.createElement('p');
            entry.textContent = `${redemption.name} · ${redemption.date.toLocaleString('es-AR')}`;
            entry.title = redemption.uid;
            container.appendChild(entry);
        });
        if (!redemptions.length) container.textContent = 'Este código no tiene canjes registrados en el formato nuevo.';
        container.dataset.loaded = 'true';
    } catch (error) {
        console.error(error);
        container.textContent = 'No se pudo cargar el historial.';
    }
}

function isAccessCodeExhausted(code) {
    return code.tipo !== 'libre' && Number(code.usosActuales || 0) >= Number(code.maxUsos || 1);
}

function accessCodeStatus(code) {
    if (code.usado === true || isAccessCodeExhausted(code)) return 'Agotado';
    if (code.activo === false) return code.tipo === 'libre' ? 'Congelado' : 'Cancelado';
    if (code.venceEn && accessDate(code.venceEn) <= new Date()) return 'Vencido';
    return 'Inactivo';
}

function updateAccessStats() {
    document.getElementById('zonas-total').textContent = accessZones.filter(zone => zone.activa !== false).length;
    document.getElementById('codigos-activos').textContent = accessCodes.filter(isAccessCodeAvailable).length;
    document.getElementById('codigos-usos').textContent = accessCodes.reduce((total, code) => total + Number(code.usosActuales || (code.usado ? 1 : 0)), 0);
}

async function createAccessZone(event) {
    event.preventDefault();
    const name = document.getElementById('zona-nombre').value.trim();
    const idInput = document.getElementById('zona-id');
    const id = (idInput.value.trim() || accessRoleId(name, 'zona')).toLowerCase();
    if (!/^zona_[a-z0-9]+(?:_[a-z0-9]+)*$/.test(id)) {
        return alert('La zona debe comenzar con zona_ y usar solo letras, números y guiones bajos.');
    }
    if (accessZones.some(item => String(item.nombre || '').trim().toLowerCase() === name.toLowerCase())) {
        return alert('Ya existe una zona con ese nombre.');
    }
    try {
        const reference = utils.doc(db, 'zonas', id);
        if ((await utils.getDoc(reference)).exists()) return alert('Ya existe una zona con ese identificador.');
        const baseData = {
            nombre: name,
            descripcion: document.getElementById('zona-descripcion').value.trim(),
            activa: true,
            creadoEn: new Date(),
            creadoPor: currentUser.uid
        };
        const communicationRole = `funcion_comunicacion_${id}`;
        const audienceCode = await uniqueAccessCode();
        const batch = utils.writeBatch(db);
        batch.set(reference, {
            ...baseData,
            rolComunicacion: communicationRole,
            codigoInicial: audienceCode
        });
        batch.set(utils.doc(db, 'codigos_roles', audienceCode), accessCodeData(id, 'zona', 'libre', null, `Código inicial de ${name}`));
        await batch.commit();
        const generated = document.getElementById('codigo-generado');
        generated.hidden = false;
        document.getElementById('codigo-generado-valor').textContent = audienceCode;
        event.target.reset();
        idInput.dataset.manual = '';
        await loadAccessAdmin();
    } catch (error) {
        console.error(error);
        alert(`No se pudo crear la zona: ${error.message}`);
    }
}

function accessCodeData(role, destinationType, type, maxUses, note = '') {
    return {
        rol: role,
        destinoTipo: destinationType,
        tipo: type,
        maxUsos: maxUses,
        usosActuales: 0,
        activo: true,
        venceEn: null,
        nota: note,
        creadoEn: new Date(),
        creadoPor: currentUser.uid
    };
}

function toggleDeactivationPanel() {
    const panel = document.getElementById('desactivar-acceso-panel');
    const button = document.getElementById('desactivar-acceso-toggle');
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderDeactivationOptions() {
    const container = document.getElementById('desactivar-acceso-list');
    const type = document.getElementById('desactivar-acceso-tipo')?.value;
    if (!container) return;
    container.replaceChildren();
    if (!type) {
        container.innerHTML = '<p class="admin-list-status">Elegí una categoría para ver sus elementos activos.</p>';
        return;
    }
    const entries = type === 'zona'
        ? accessZones.filter(item => item.activa !== false)
        : accessFunctions.filter(item => item.activa !== false && item.roleType !== 'audiencia' && item.id !== 'admin');
    entries.forEach(entry => {
        const row = document.createElement('article');
        row.className = 'access-item';
        const info = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = entry.nombre || entry.id;
        const id = document.createElement('span');
        id.textContent = entry.id;
        info.append(title, id);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-delete';
        button.textContent = 'Desactivar';
        button.addEventListener('click', () => deactivateAccessEntry(entry, type));
        row.append(info, button);
        container.appendChild(row);
    });
    if (!entries.length) container.innerHTML = '<p class="admin-list-status">No hay elementos activos en esta categoría.</p>';
}

async function deactivateAccessEntry(entry, type) {
    const category = type === 'zona' ? 'la zona' : 'la función';
    const name = entry.nombre || entry.id;
    if (!confirm(`¿Querés desactivar ${category} “${name}”?`)) return;
    const typedName = prompt(`Para confirmar, escribí exactamente:\n${name}`);
    if (typedName === null) return;
    if (typedName.trim() !== name) {
        return alert('El nombre ingresado no coincide. No se realizó ningún cambio.');
    }
    try {
        const update = {
            activa: false,
            actualizadoEn: new Date(),
            actualizadoPor: currentUser.uid
        };
        const batch = utils.writeBatch(db);
        const collectionName = type === 'zona' ? 'zonas' : 'funcionalidades';
        batch.set(utils.doc(db, collectionName, entry.id), update, { merge: true });
        const affectedRoles = [entry.id];
        if (type === 'zona') {
            const communicationRole = entry.rolComunicacion || `funcion_comunicacion_${entry.id}`;
            affectedRoles.push(communicationRole);
            batch.set(utils.doc(db, 'funcionalidades', communicationRole), update, { merge: true });
        }
        accessCodes
            .filter(code => affectedRoles.includes(code.rol) && code.activo !== false)
            .forEach(code => batch.update(utils.doc(db, 'codigos_roles', code.id), {
                activo: false,
                actualizadoEn: new Date(),
                actualizadoPor: currentUser.uid
            }));
        await batch.commit();
        await loadAccessAdmin();
        alert(`${name} quedó desactivada.`);
    } catch (error) {
        console.error(error);
        alert(`No se pudo desactivar: ${error.message}`);
    }
}

function randomAccessCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const value = [...bytes].map(byte => alphabet[byte % alphabet.length]).join('');
    return `GEN-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8)}`;
}

async function uniqueAccessCode() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = randomAccessCode();
        if (!(await utils.getDoc(utils.doc(db, 'codigos_roles', code))).exists()) return code;
    }
    throw new Error('No se pudo generar un código único. Intentá nuevamente.');
}

async function createAccessCode(event) {
    event.preventDefault();
    const destinationType = document.getElementById('codigo-destino-tipo').value;
    const role = destinationType === 'zona'
        ? document.getElementById('codigo-zona').value
        : document.getElementById('codigo-funcionalidad').value;
    const type = document.getElementById('codigo-tipo').value;
    const maxUses = type === 'unico' ? 1 : (type === 'limitado' ? Number(document.getElementById('codigo-max-usos').value) : null);
    if (!role) return alert(destinationType === 'zona' ? 'Elegí una zona.' : 'Elegí una funcionalidad.');
    if ((role === 'admin' || role.startsWith('funcion_')) && type !== 'unico') {
        return alert('Los códigos administrativos deben ser personales y de un solo uso.');
    }
    if (type === 'limitado' && (!Number.isInteger(maxUses) || maxUses < 2)) return alert('Ingresá una cantidad válida de usos.');
    const expiresValue = document.getElementById('codigo-vence').value;
    const expiresAt = expiresValue ? new Date(expiresValue) : null;
    if (expiresAt && expiresAt <= new Date()) return alert('El vencimiento debe ser posterior al momento actual.');
    try {
        const code = await uniqueAccessCode();
        await utils.setDoc(utils.doc(db, 'codigos_roles', code), {
            rol: role,
            destinoTipo: destinationType,
            tipo: type === 'unico' ? 'limitado' : type,
            maxUsos: maxUses,
            usosActuales: 0,
            activo: true,
            venceEn: expiresAt,
            nota: document.getElementById('codigo-nota').value.trim(),
            creadoEn: new Date(),
            creadoPor: currentUser.uid
        });
        event.target.reset();
        updateCodeTypeFields();
        updateCodeDestinationFields();
        document.getElementById('codigo-generado').hidden = false;
        document.getElementById('codigo-generado-valor').textContent = code;
        await loadAccessAdmin();
    } catch (error) {
        console.error(error);
        alert(`No se pudo generar el código: ${error.message}`);
    }
}

async function assignRoleToUser(user, role) {
    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (roles.includes(role)) return alert('La cuenta ya tiene ese acceso asignado.');
    if (role === 'admin' && !confirm(`¿Otorgar administración total a ${user.nombre || user.email}? Tendrá acceso a toda la página y a la gestión de roles.`)) {
        return;
    }

    try {
        const history = Array.isArray(user.historialRoles) ? user.historialRoles.slice(-99) : [];
        history.push({
            accion: 'asignado',
            rol: role,
            realizadoPor: currentUser.uid,
            fecha: new Date()
        });
        await utils.updateDoc(utils.doc(db, 'usuarios', user.id), {
            roles: [...roles, role],
            accesoAsignadoEn: new Date(),
            accesoAsignadoPor: currentUser.uid,
            historialRoles: history
        });
        await loadAccessAdmin();
        alert('Rol agregado correctamente.');
    } catch (error) {
        console.error(error);
        alert(`No se pudo asignar el acceso: ${error.message}`);
    }
}

async function toggleAccessCode(code) {
    const nextActive = code.activo === false;
    const isFree = code.tipo === 'libre';
    const action = nextActive ? (isFree ? 'descongelar' : 'reactivar') : (isFree ? 'congelar' : 'cancelar');
    if (!confirm(`¿${action.charAt(0).toUpperCase() + action.slice(1)} el código ${code.id}?`)) return;
    try {
        await utils.updateDoc(utils.doc(db, 'codigos_roles', code.id), {
            activo: nextActive,
            actualizadoEn: new Date(),
            actualizadoPor: currentUser.uid
        });
        await loadAccessAdmin();
    } catch (error) {
        alert(`No se pudo actualizar el código: ${error.message}`);
    }
}

async function deleteAccessCode(code) {
    const uses = Number(code.usosActuales || (code.usado ? 1 : 0));
    const warning = uses
        ? `También se eliminará su historial de ${uses} canje${uses === 1 ? '' : 's'}.`
        : 'Esta acción no se puede deshacer.';
    if (!confirm(`¿Eliminar definitivamente el código ${code.id}?\n\n${warning}`)) return;
    try {
        const redemptions = await utils.getDocs(utils.collection(db, 'codigos_roles', code.id, 'canjes'));
        for (let offset = 0; offset < redemptions.docs.length; offset += 450) {
            const batch = utils.writeBatch(db);
            redemptions.docs.slice(offset, offset + 450).forEach(item => batch.delete(item.ref));
            await batch.commit();
        }
        await utils.deleteDoc(utils.doc(db, 'codigos_roles', code.id));
        await loadAccessAdmin();
    } catch (error) {
        console.error(error);
        alert(`No se pudo eliminar el código: ${error.message}`);
    }
}

async function copyAccessCode(code) {
    if (!code) return;
    try {
        await navigator.clipboard.writeText(code);
    } catch (_) {
        prompt('Copiá este código:', code);
    }
}

// ==================== BIBLIOTECA ====================
let bibItems = [];
let bibAportes = [];
let bibMetrics = [];
let bibEditingId = null;
let bibListenersReady = false;
const BIB_DEFAULT_TOPICS = [
    'Meditación', 'Dios Amor', 'Voluntad de Dios', 'El hermano', 'El mandamiento nuevo',
    'La unidad', 'Jesús Abandonado', 'Jesús en medio', 'Jesús Eucaristía', 'La Palabra de Vida',
    'María', 'El Espíritu Santo', 'La Iglesia', 'Revolución Arcoíris', 'Rojo', 'Anaranjado',
    'Amarillo', 'Verde', 'Azul', 'Índigo', 'Violeta', 'Diálogo',
    'Diálogo 1 · Dentro de la Iglesia Católica', 'Diálogo 2 · Otras Iglesias Cristianas',
    'Diálogo 3 · Otras Religiones', 'Diálogo 4 · Personas sin creencias',
    'Fisionomía del Gen', 'Estatutos', 'Ciudad Nueva'
];
let bibOfficialTopics = [...BIB_DEFAULT_TOPICS];
let bibTopicDraft = new Set();

function bibText(value) {
    return String(value || '').trim();
}

function bibFormatBytes(bytes) {
    if (!Number(bytes)) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** power)).toFixed(power ? 1 : 0)} ${units[power]}`;
}

function bibParseVisibleSize(value) {
    const match = bibText(value).match(/^(\d+(?:[.,]\d+)?)\s*(B|KB|MB|GB|TB)$/i);
    return match
        ? { numero: match[1].replace(',', '.'), unidad: match[2].toUpperCase() }
        : { numero: '', unidad: '' };
}

function bibElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

async function initBibliotecaAdmin() {
    setupBibliotecaListeners();
    await ensureBibliotecaCacheRevisions();
    await Promise.all([loadBibliotecaAdmin(), loadBibliotecaAportes(), loadBibliotecaMetrics(), loadBibliotecaFormConfig(), loadBibliotecaTopics()]);
}

async function ensureBibliotecaCacheRevisions() {
    for (const configId of ['catalogo', 'meditaciones']) {
        const reference = utils.doc(db, 'biblioteca_config', configId);
        const snapshot = await utils.getDoc(reference);
        if (snapshot.exists() && Number(snapshot.data().revision)) continue;
        const revision = Date.now();
        await utils.setDoc(reference, {
            revision,
            cambios: [],
            revisionBase: revision,
            actualizadoEn: new Date(),
            actualizadoPor: currentUser.uid
        }, { merge: true });
    }
}

function setupBibliotecaListeners() {
    if (bibListenersReady) return;
    bibListenersReady = true;
    document.getElementById('bib-form')?.addEventListener('submit', saveBibliotecaResource);
    document.getElementById('bib-cancel')?.addEventListener('click', resetBibliotecaForm);
    document.getElementById('bib-delete')?.addEventListener('click', () => bibEditingId && deleteBibliotecaResource(bibEditingId));
    document.getElementById('bib-search')?.addEventListener('input', renderBibliotecaList);
    document.getElementById('bib-filter')?.addEventListener('change', renderBibliotecaList);
    document.getElementById('bib-refresh-aportes')?.addEventListener('click', loadBibliotecaAportes);
    document.getElementById('bib-link-test')?.addEventListener('click', previewBibliotecaResourceLink);
    document.getElementById('bib-link-recurso')?.addEventListener('input', event => {
        const id = extractGoogleDriveId(event.target.value);
        document.getElementById('bib-link-help').textContent = id
            ? `ID detectado: ${id}. Comprobá que funcione sin iniciar sesión.`
            : 'Puede ser un archivo de Drive o cualquier enlace público.';
    });
    document.getElementById('bib-google-form-save')?.addEventListener('click', saveBibliotecaFormConfig);
    document.getElementById('bib-add-topic')?.addEventListener('click', addBibliotecaOfficialTopic);
    document.getElementById('bib-new-topic')?.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); addBibliotecaOfficialTopic(); }
    });
    document.getElementById('bib-temas-open')?.addEventListener('click', openBibliotecaTopicSelector);
    document.getElementById('bib-topic-selector-close')?.addEventListener('click', closeBibliotecaTopicSelector);
    document.getElementById('bib-topic-selector-cancel')?.addEventListener('click', closeBibliotecaTopicSelector);
    document.getElementById('bib-topic-selector-apply')?.addEventListener('click', applyBibliotecaTopicSelection);
    document.getElementById('bib-topic-selector-clear')?.addEventListener('click', () => {
        bibTopicDraft.clear();
        renderBibliotecaTopicSelector();
    });
    document.getElementById('bib-topic-selector-search')?.addEventListener('input', renderBibliotecaTopicSelector);
    document.getElementById('bib-topic-selector')?.addEventListener('click', event => {
        if (event.target.id === 'bib-topic-selector') closeBibliotecaTopicSelector();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !document.getElementById('bib-topic-selector')?.hidden) closeBibliotecaTopicSelector();
    });
}

async function loadBibliotecaTopics() {
    try {
        const snapshot = await utils.getDoc(utils.doc(db, 'biblioteca_config', 'temas'));
        const configured = snapshot.exists() && Array.isArray(snapshot.data().temas) ? snapshot.data().temas : [];
        const unique = new Map();
        (configured.length ? configured : BIB_DEFAULT_TOPICS).forEach(topic => unique.set(String(topic).trim().toLocaleLowerCase('es'), String(topic).trim()));
        bibOfficialTopics = [...unique.values()].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
        renderBibliotecaTopics();
    } catch (error) {
        console.warn('No se pudieron cargar los temas oficiales:', error);
        renderBibliotecaTopics();
    }
}

function renderBibliotecaTopics() {
    const list = document.getElementById('bib-topics-list');
    if (!list) return;
    list.replaceChildren();
    bibOfficialTopics.forEach(topic => {
        const chip = bibElement('span', 'bib-topic-chip');
        chip.append(document.createTextNode(topic));
        const remove = bibElement('button', '', '×');
        remove.type = 'button'; remove.setAttribute('aria-label', `Quitar ${topic}`);
        remove.addEventListener('click', () => removeBibliotecaOfficialTopic(topic));
        chip.append(remove); list.append(chip);
    });
    document.getElementById('bib-topics-count').textContent = `${bibOfficialTopics.length} temas`;
}

function selectedBibliotecaTopics() {
    return bibText(document.getElementById('bib-temas')?.value)
        .split(',')
        .map(topic => topic.trim())
        .filter(Boolean);
}

function renderBibliotecaSelectedTopics() {
    const container = document.getElementById('bib-temas-selected');
    if (!container) return;
    const selected = selectedBibliotecaTopics();
    container.replaceChildren();
    if (!selected.length) {
        container.append(bibElement('span', 'bib-selected-topics-empty', 'Sin temas seleccionados'));
        return;
    }
    selected.forEach(topic => container.append(bibElement('span', 'bib-topic-chip', topic)));
}

function openBibliotecaTopicSelector() {
    const modal = document.getElementById('bib-topic-selector');
    const search = document.getElementById('bib-topic-selector-search');
    bibTopicDraft = new Set(selectedBibliotecaTopics());
    if (search) search.value = '';
    renderBibliotecaTopicSelector();
    modal.hidden = false;
    document.body.classList.add('admin-modal-open');
    setTimeout(() => search?.focus(), 0);
}

function closeBibliotecaTopicSelector() {
    const modal = document.getElementById('bib-topic-selector');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('admin-modal-open');
    document.getElementById('bib-temas-open')?.focus();
}

function renderBibliotecaTopicSelector() {
    const list = document.getElementById('bib-topic-selector-list');
    const count = document.getElementById('bib-topic-selector-count');
    if (!list) return;
    const query = bibText(document.getElementById('bib-topic-selector-search')?.value).toLocaleLowerCase('es');
    const topics = [...new Set([...bibOfficialTopics, ...bibTopicDraft])]
        .sort((a, b) => a.localeCompare(b, 'es'))
        .filter(topic => !query || topic.toLocaleLowerCase('es').includes(query));
    list.replaceChildren();
    if (!topics.length) {
        list.append(bibElement('p', 'bib-topic-selector-empty', 'No hay temas que coincidan con la búsqueda.'));
    } else {
        topics.forEach(topic => {
            const label = bibElement('label', 'bib-topic-option');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = bibTopicDraft.has(topic);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) bibTopicDraft.add(topic);
                else bibTopicDraft.delete(topic);
                label.classList.toggle('selected', checkbox.checked);
                count.textContent = `${bibTopicDraft.size} seleccionados`;
            });
            label.classList.toggle('selected', checkbox.checked);
            label.append(checkbox, bibElement('span', '', topic));
            list.append(label);
        });
    }
    count.textContent = `${bibTopicDraft.size} seleccionados`;
}

function applyBibliotecaTopicSelection() {
    document.getElementById('bib-temas').value = [...bibTopicDraft]
        .sort((a, b) => a.localeCompare(b, 'es'))
        .join(', ');
    renderBibliotecaSelectedTopics();
    closeBibliotecaTopicSelector();
}

async function persistBibliotecaTopics(message) {
    const status = document.getElementById('bib-topic-status');
    try {
        await utils.setDoc(utils.doc(db, 'biblioteca_config', 'temas'), {
            temas: bibOfficialTopics, actualizadoEn: new Date(), actualizadoPor: currentUser.uid
        });
        renderBibliotecaTopics();
        status.textContent = message;
        return true;
    } catch (error) {
        console.error(error);
        status.textContent = `No se pudieron guardar los temas: ${error.message}`;
        return false;
    }
}

async function addBibliotecaOfficialTopic(value = document.getElementById('bib-new-topic').value) {
    const topic = bibText(value);
    const input = document.getElementById('bib-new-topic');
    if (!topic) return;
    if (bibOfficialTopics.some(item => item.toLocaleLowerCase('es') === topic.toLocaleLowerCase('es'))) {
        document.getElementById('bib-topic-status').textContent = 'Ese tema ya existe.';
        return true;
    }
    bibOfficialTopics.push(topic);
    bibOfficialTopics.sort((a, b) => a.localeCompare(b, 'es'));
    if (input) input.value = '';
    return persistBibliotecaTopics(`Tema “${topic}” agregado.`);
}

async function removeBibliotecaOfficialTopic(topic) {
    if (!confirm(`¿Quitar “${topic}” de las opciones oficiales? Los recursos existentes conservarán ese tema.`)) return;
    bibOfficialTopics = bibOfficialTopics.filter(item => item !== topic);
    await persistBibliotecaTopics(`Tema “${topic}” retirado de las opciones.`);
}

function embeddedGoogleFormUrl(value) {
    const raw = bibText(value);
    if (!isValidPublicUrl(raw) || (!raw.includes('docs.google.com/forms/') && !raw.includes('forms.gle/'))) return '';
    if (raw.startsWith('https://forms.gle/q3zVNZubgbXKbYNNA')) {
        return 'https://docs.google.com/forms/d/e/1FAIpQLSfjjD_05ualjVeWFGaLyoXUbLcveEGmujC2A8M9pF9roSXyLA/viewform?embedded=true';
    }
    try {
        const url = new URL(raw);
        if (url.hostname === 'docs.google.com') url.searchParams.set('embedded', 'true');
        return url.toString();
    } catch {
        return '';
    }
}

async function loadBibliotecaFormConfig() {
    const input = document.getElementById('bib-google-form-url');
    if (!input) return;
    try {
        const snapshot = await utils.getDoc(utils.doc(db, 'biblioteca_config', 'aportes'));
        if (snapshot.exists()) input.value = snapshot.data().googleFormUrl || '';
    } catch (error) {
        console.warn('No se pudo cargar el formulario de aportes:', error);
    }
}

async function saveBibliotecaFormConfig() {
    const input = document.getElementById('bib-google-form-url');
    const status = document.getElementById('bib-google-form-status');
    const url = embeddedGoogleFormUrl(input.value);
    if (!url) {
        status.textContent = 'Pegá un enlace válido de Google Forms.';
        return;
    }
    try {
        await utils.setDoc(utils.doc(db, 'biblioteca_config', 'aportes'), {
            googleFormUrl: url, actualizadoEn: new Date(), actualizadoPor: currentUser.uid
        });
        input.value = url;
        status.textContent = 'Formulario guardado. Ya se usará desde la Biblioteca.';
    } catch (error) {
        console.error(error);
        status.textContent = `No se pudo guardar: ${error.message}`;
    }
}

async function loadBibliotecaAdmin() {
    const list = document.getElementById('bib-list');
    if (list) list.textContent = 'Cargando catálogo…';
    try {
        const snapshot = await utils.getDocs(utils.query(
            utils.collection(db, 'biblioteca_recursos'),
            utils.limit(ADMIN_QUERY_LIMIT)
        ));
        bibItems = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        bibItems.sort((a, b) => String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es'));
        renderBibliotecaList();
        updateBibliotecaSummary();
    } catch (error) {
        console.error(error);
        if (list) list.textContent = 'No se pudo cargar el catálogo.';
    }
}

function renderBibliotecaList() {
    const list = document.getElementById('bib-list');
    if (!list) return;
    const search = bibText(document.getElementById('bib-search')?.value).toLowerCase();
    const stateFilter = document.getElementById('bib-filter')?.value || '';
    const filtered = bibItems.filter(item => {
        const searchable = [item.titulo, item.autor, item.descripcion, ...(item.temas || [])].join(' ').toLowerCase();
        return (!search || searchable.includes(search)) && (!stateFilter || item.estado === stateFilter);
    });
    list.replaceChildren();
    if (!filtered.length) {
        list.append(bibElement('p', 'bib-empty', 'No hay recursos con esos filtros.'));
        return;
    }
    filtered.forEach(item => {
        const card = bibElement('article', 'item bib-admin-item');
        const info = bibElement('div', 'bib-admin-info');
        info.append(
            bibElement('div', 'item-title', item.titulo || 'Sin título'),
            bibElement('div', 'item-subtitle', [item.autor, item.categoria, item.tipo, item.tamano || bibFormatBytes(item.tamanoBytes)].filter(Boolean).join(' · '))
        );
        const status = bibElement('span', `bib-status bib-status-${item.estado || 'borrador'}`, item.estado || 'borrador');
        const actions = bibElement('div', 'bib-admin-actions');
        const edit = bibElement('button', 'btn-edit', 'Editar');
        edit.type = 'button'; edit.addEventListener('click', () => editBibliotecaResource(item.id));
        const remove = bibElement('button', 'btn-delete', 'Eliminar');
        remove.type = 'button'; remove.addEventListener('click', () => deleteBibliotecaResource(item.id));
        actions.append(edit, remove); card.append(info, status, actions); list.append(card);
    });
}

function setBibliotecaProgress(percent, text) {
    const progress = document.getElementById('bib-progress');
    if (!progress) return;
    progress.classList.toggle('active', Boolean(text));
    progress.style.setProperty('--progress', `${Math.max(0, Math.min(100, percent || 0))}%`);
    progress.querySelector('span').textContent = text || '';
}

function extractGoogleDriveId(value) {
    const raw = bibText(value);
    if (!raw) return '';
    const pathMatch = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (pathMatch) return pathMatch[1];
    try {
        const url = new URL(raw);
        const queryId = url.searchParams.get('id');
        if (queryId && /^[a-zA-Z0-9_-]+$/.test(queryId)) return queryId;
    } catch {
        // También permitimos pegar directamente el ID.
    }
    return /^[a-zA-Z0-9_-]{20,}$/.test(raw) ? raw : '';
}

function previewBibliotecaResourceLink() {
    const value = bibText(document.getElementById('bib-link-recurso')?.value);
    if (!isValidPublicUrl(value)) return alert('Primero pegá un enlace válido.');
    const id = extractGoogleDriveId(value);
    window.open(id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview` : value, '_blank', 'noopener,noreferrer');
}

function isValidPublicUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

async function saveBibliotecaResource(event) {
    event.preventDefault();
    const title = bibText(document.getElementById('bib-titulo').value);
    if (!title) return alert('Completá el título.');
    const linkRecurso = bibText(document.getElementById('bib-link-recurso').value);
    if (!isValidPublicUrl(linkRecurso)) return alert('Pegá un link público válido para el recurso.');
    const googleId = extractGoogleDriveId(linkRecurso);
    const sizeNumber = bibText(document.getElementById('bib-tamano-numero').value);
    const sizeUnit = document.getElementById('bib-tamano-unidad').value;
    if ((sizeNumber && !sizeUnit) || (!sizeNumber && sizeUnit)) {
        return alert('Para indicar el tamaño, completá el número y elegí una unidad.');
    }
    const existing = bibItems.find(item => item.id === bibEditingId);
    const sourceContributionId = document.getElementById('bib-source-aporte-id').value;
    const save = document.getElementById('bib-save');
    save.disabled = true;
    try {
        const id = bibEditingId || `recurso_${crypto.randomUUID()}`;
        setBibliotecaProgress(45, 'Validando ficha y enlace de Drive…');
        const themes = bibText(document.getElementById('bib-temas').value).split(',').map(value => value.trim()).filter(Boolean);
        const data = {
            titulo: title, autor: bibText(document.getElementById('bib-autor').value),
            descripcion: bibText(document.getElementById('bib-descripcion').value),
            categoria: document.getElementById('bib-categoria').value,
            temas: themes, estado: document.getElementById('bib-estado').value,
            anio: Number(document.getElementById('bib-anio').value) || null,
            idioma: document.getElementById('bib-idioma').value,
            origen: googleId ? 'drive' : 'externo', linkRecurso, googleId,
            tipo: document.getElementById('bib-tipo').value,
            tamano: sizeNumber && sizeUnit ? `${sizeNumber.replace('.', ',')} ${sizeUnit}` : '',
            searchText: [title, document.getElementById('bib-autor').value, themes.join(' '), document.getElementById('bib-descripcion').value].join(' ').toLowerCase(),
            actualizadoEn: new Date(), actualizadoPor: currentUser.uid
        };
        if (!existing) { data.creadoEn = new Date(); data.creadoPor = currentUser.uid; }
        await utils.setDoc(utils.doc(db, 'biblioteca_recursos', id), data, { merge: true });
        await registerBibliotecaCatalogChange(id, 'upsert');
        if (sourceContributionId) {
            await utils.updateDoc(utils.doc(db, 'biblioteca_aportes', sourceContributionId), {
                estado: 'incorporado', recursoId: id, revisadoEn: new Date(), revisadoPor: currentUser.uid
            });
        }
        setBibliotecaProgress(100, data.estado === 'publicado' ? 'Recurso publicado.' : 'Ficha guardada para revisión.');
        resetBibliotecaForm();
        await Promise.all([loadBibliotecaAdmin(), loadBibliotecaAportes()]);
    } catch (error) {
        console.error(error); setBibliotecaProgress(0, `No se pudo guardar: ${error.message}`);
    } finally { save.disabled = false; }
}

function editBibliotecaResource(id) {
    const item = bibItems.find(resource => resource.id === id);
    if (!item) return;
    bibEditingId = id;
    document.getElementById('bib-form-title').textContent = 'Editar recurso';
    document.getElementById('bib-edit-id').value = id;
    document.getElementById('bib-titulo').value = item.titulo || '';
    document.getElementById('bib-autor').value = item.autor || '';
    document.getElementById('bib-categoria').value = item.categoria || 'documentos';
    document.getElementById('bib-descripcion').value = item.descripcion || '';
    document.getElementById('bib-temas').value = (item.temas || []).join(', ');
    renderBibliotecaSelectedTopics();
    document.getElementById('bib-estado').value = item.estado || 'borrador';
    document.getElementById('bib-anio').value = item.anio || '';
    document.getElementById('bib-idioma').value = item.idioma || 'es';
    document.getElementById('bib-link-recurso').value = item.linkRecurso || item.driveUrl || (item.googleId ? `https://drive.google.com/file/d/${item.googleId}/view` : '');
    document.getElementById('bib-tipo').value = item.tipo || 'PDF';
    const visibleSize = bibParseVisibleSize(item.tamano);
    document.getElementById('bib-tamano-numero').value = visibleSize.numero;
    document.getElementById('bib-tamano-unidad').value = visibleSize.unidad;
    document.getElementById('bib-link-help').textContent = item.googleId ? `ID de Drive detectado: ${item.googleId}` : 'Puede ser un archivo de Drive o cualquier enlace público.';
    document.getElementById('bib-cancel').hidden = false;
    document.getElementById('bib-delete').hidden = false;
    document.getElementById('bib-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetBibliotecaForm() {
    bibEditingId = null;
    document.getElementById('bib-form').reset();
    document.getElementById('bib-edit-id').value = '';
    document.getElementById('bib-source-aporte-id').value = '';
    document.getElementById('bib-form-title').textContent = '➕ Nuevo recurso';
    renderBibliotecaSelectedTopics();
    document.getElementById('bib-link-help').textContent = 'Puede ser un archivo de Drive o cualquier enlace público.';
    document.getElementById('bib-cancel').hidden = true;
    document.getElementById('bib-delete').hidden = true;
    setTimeout(() => setBibliotecaProgress(0, ''), 1800);
}

async function deleteBibliotecaResource(id) {
    const item = bibItems.find(resource => resource.id === id);
    if (!item || !confirm(`¿Quitar “${item.titulo}” del catálogo? El archivo original seguirá guardado en Drive.`)) return;
    try {
        await utils.deleteDoc(utils.doc(db, 'biblioteca_recursos', id));
        await registerBibliotecaCatalogChange(id, 'delete');
        if (bibEditingId === id) resetBibliotecaForm();
        await loadBibliotecaAdmin();
    } catch (error) { console.error(error); alert(`No se pudo eliminar: ${error.message}`); }
}

async function registerBibliotecaCatalogChange(id, action) {
    await registerLibraryChange('catalogo', id, action);
}

async function loadBibliotecaAportes() {
    const list = document.getElementById('bib-aportes-list');
    if (!list) return;
    list.textContent = 'Cargando aportes…';
    try {
        const snapshot = await utils.getDocs(utils.query(
            utils.collection(db, 'biblioteca_aportes'),
            utils.where('estado', '==', 'pendiente'),
            utils.limit(ADMIN_QUERY_LIMIT)
        ));
        bibAportes = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        renderBibliotecaAportes();
        updateBibliotecaSummary();
    } catch (error) {
        console.error(error);
        list.textContent = 'No se pudieron cargar los aportes.';
    }
}

function renderBibliotecaAportes() {
    const list = document.getElementById('bib-aportes-list');
    list.replaceChildren();
    if (!bibAportes.length) {
        list.append(bibElement('p', 'bib-empty', 'No hay aportes pendientes.'));
        return;
    }
    bibAportes.forEach(item => {
        const card = bibElement('article', 'item bib-admin-item');
        const info = bibElement('div', 'bib-admin-info');
        info.append(
            bibElement('div', 'item-title', item.titulo || 'Sin título'),
            bibElement('div', 'item-subtitle', [item.codigo, item.autor, item.categoria, item.tipo, item.anio, item.idioma].filter(Boolean).join(' · ')),
            bibElement('p', 'bib-aporte-description', item.descripcion || '')
        );
        if (item.temas?.length) {
            const topics = bibElement('div', 'bib-aporte-topics');
            item.temas.forEach(topic => topics.append(bibElement('span', 'bib-topic-chip', topic)));
            info.append(topics);
        }
        if (item.temaPropuesto) {
            const proposal = bibElement('div', item.temaPropuestoAprobado ? 'bib-topic-proposal approved' : 'bib-topic-proposal');
            proposal.append(
                bibElement('strong', '', item.temaPropuestoAprobado ? 'Tema propuesto aprobado' : 'Tema nuevo propuesto'),
                bibElement('span', '', item.temaPropuesto)
            );
            info.append(proposal);
        }
        const actions = bibElement('div', 'bib-admin-actions');
        if (item.temaPropuesto && !item.temaPropuestoAprobado) {
            const approveTopic = bibElement('button', 'btn-secondary', 'Aprobar tema');
            approveTopic.type = 'button'; approveTopic.addEventListener('click', () => approveBibliotecaProposedTopic(item.id));
            actions.append(approveTopic);
        }
        const prepare = bibElement('button', 'btn-primary', 'Preparar ficha');
        prepare.type = 'button'; prepare.addEventListener('click', () => prepareBibliotecaContribution(item.id));
        const discard = bibElement('button', 'btn-danger', 'Descartar');
        discard.type = 'button'; discard.addEventListener('click', () => discardBibliotecaContribution(item.id));
        actions.append(prepare, discard); card.append(info, actions); list.append(card);
    });
}

async function approveBibliotecaProposedTopic(id) {
    const item = bibAportes.find(value => value.id === id);
    if (!item?.temaPropuesto) return;
    if (!confirm(`¿Incorporar “${item.temaPropuesto}” como tema oficial?`)) return;
    const topicSaved = await addBibliotecaOfficialTopic(item.temaPropuesto);
    if (!topicSaved) return;
    try {
        await utils.updateDoc(utils.doc(db, 'biblioteca_aportes', id), {
            temaPropuestoAprobado: true, temaPropuestoRevisadoEn: new Date(), temaPropuestoRevisadoPor: currentUser.uid
        });
        await loadBibliotecaAportes();
    } catch (error) {
        console.error(error);
        alert(`El tema se agregó, pero no se pudo actualizar el aporte: ${error.message}`);
    }
}

function prepareBibliotecaContribution(id) {
    const item = bibAportes.find(value => value.id === id);
    if (!item) return;
    resetBibliotecaForm();
    document.getElementById('bib-form-title').textContent = `Preparar aporte ${item.codigo || ''}`.trim();
    document.getElementById('bib-source-aporte-id').value = id;
    document.getElementById('bib-titulo').value = item.titulo || '';
    document.getElementById('bib-autor').value = item.autor || '';
    document.getElementById('bib-categoria').value = item.categoria || 'documentos';
    document.getElementById('bib-anio').value = item.anio || '';
    document.getElementById('bib-idioma').value = item.idioma || 'es';
    document.getElementById('bib-tipo').value = item.tipo || 'PDF';
    document.getElementById('bib-descripcion').value = item.descripcion || '';
    const contributionTopics = [...(item.temas || [])];
    if (item.temaPropuesto && item.temaPropuestoAprobado) contributionTopics.push(item.temaPropuesto);
    document.getElementById('bib-temas').value = contributionTopics.join(', ');
    renderBibliotecaSelectedTopics();
    document.getElementById('bib-estado').value = 'borrador';
    document.getElementById('bib-link-recurso').focus();
    document.getElementById('bib-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function discardBibliotecaContribution(id) {
    const item = bibAportes.find(value => value.id === id);
    if (!item || !confirm(`¿Descartar el aporte “${item.titulo}”?`)) return;
    try {
        await utils.updateDoc(utils.doc(db, 'biblioteca_aportes', id), {
            estado: 'descartado', revisadoEn: new Date(), revisadoPor: currentUser.uid
        });
        await loadBibliotecaAportes();
    } catch (error) {
        console.error(error);
        alert(`No se pudo descartar: ${error.message}`);
    }
}

function updateBibliotecaSummary() {
    const total = document.getElementById('bib-total');
    const published = document.getElementById('bib-publicados');
    const pending = document.getElementById('bib-pendientes');
    const views = document.getElementById('bib-lecturas');
    if (total) total.textContent = bibItems.length;
    if (published) published.textContent = bibItems.filter(item => item.estado === 'publicado').length;
    if (pending) pending.textContent = bibAportes.length;
    if (views) views.textContent = bibMetrics.reduce((total, item) => total + (item.tipo === 'apertura' ? 1 : Number(item.aperturas) || 0), 0);
}

async function loadBibliotecaMetrics() {
    try {
        const [legacySnapshot, batchSnapshot] = await Promise.all([
            utils.getDocs(utils.query(
                utils.collection(db, 'biblioteca_eventos'),
                utils.limit(ADMIN_QUERY_LIMIT)
            )),
            utils.getDocs(utils.query(
                utils.collection(db, 'biblioteca_metricas'),
                utils.orderBy('creadoEn', 'desc'),
                utils.limit(ADMIN_QUERY_LIMIT)
            )).catch(() => ({ docs: [] }))
        ]);
        bibMetrics = [
            ...legacySnapshot.docs.map(docSnap => docSnap.data()),
            ...batchSnapshot.docs.map(docSnap => docSnap.data())
        ];
        updateBibliotecaSummary();
    } catch (error) {
        console.warn('No se pudieron cargar las métricas de Biblioteca:', error);
    }
}

// ==================== CONTROL DE VERSIONES DE ANDROID ====================
async function initAndroidVersionsAdmin() {
    const publicationForm = document.getElementById('android-publication-form');
    if (!publicationForm?.dataset.ready) {
        publicationForm.dataset.ready = 'true';
        publicationForm.addEventListener('submit', saveAndroidPublicationConfig);
        document.getElementById('android-latest-version')?.addEventListener('change', syncAndroidLatestRelease);
        document.getElementById('android-minimum-version')?.addEventListener('change', updateAndroidPolicyPreview);
        document.getElementById('android-release-form')?.addEventListener('submit', saveAndroidRelease);
        document.getElementById('android-release-cancel')?.addEventListener('click', resetAndroidReleaseForm);
    }
    await Promise.all([loadAndroidPublicationConfig(), loadAndroidVersionHistory()]);
    populateAndroidVersionSelectors();
    applyAndroidPublicationConfig();
    renderAndroidVersionHistory();
    resetAndroidReleaseForm();
}

async function loadAndroidPublicationConfig() {
    const source = document.getElementById('android-version-source');
    try {
        const snapshot = await utils.getDoc(utils.doc(db, 'configuracion_publica', 'android'));
        if (snapshot.exists()) {
            androidPublicationConfig = snapshot.data();
            if (source) source.textContent = 'Configuración activa en Firestore';
            return;
        }
        const response = await fetch('../datos/android-version.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('No existe una configuración inicial');
        androidPublicationConfig = await response.json();
        if (source) source.textContent = 'Configuración local pendiente de publicar';
    } catch (error) {
        console.error('No se pudo cargar la configuración de Android:', error);
        androidPublicationConfig = null;
        if (source) source.textContent = 'No se pudo cargar la configuración';
    }
}

async function loadAndroidVersionHistory() {
    try {
        const snapshot = await utils.getDocs(utils.query(
            utils.collection(db, 'versiones_android'),
            utils.orderBy('versionCode', 'desc'),
            utils.limit(100)
        ));
        androidVersionReleases = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    } catch (error) {
        console.error('No se pudo cargar el historial de Android:', error);
        androidVersionReleases = [];
        const history = document.getElementById('android-version-history');
        if (history) history.innerHTML = '<p class="admin-list-status">No pudimos cargar el historial de versiones.</p>';
    }
}

function androidVersionLabel(version) {
    return `Versión ${version?.versionName || 'sin nombre'}`;
}

function nextAndroidVersionCode() {
    return Math.max(0, ...androidVersionReleases.map(item => Number(item.versionCode) || 0)) + 1;
}

function syncAndroidLatestRelease() {
    const code = Number(document.getElementById('android-latest-version')?.value || 0);
    const release = androidVersionReleases.find(item => Number(item.versionCode) === code);
    if (release?.apkUrl) document.getElementById('android-apk-url').value = release.apkUrl;
    updateAndroidPolicyPreview();
}

function populateAndroidVersionSelectors() {
    const latest = document.getElementById('android-latest-version');
    const minimum = document.getElementById('android-minimum-version');
    if (!latest || !minimum) return;
    const selectedLatest = String(androidPublicationConfig?.versionCode || latest.value || '');
    const selectedMinimum = String(androidPublicationConfig?.minimumVersionCode || minimum.value || '');
    const publishedReleases = androidVersionReleases.filter(version => version.estado === 'publicado');
    const options = ['<option value="">Elegí una versión publicada</option>', ...publishedReleases.map(version =>
        `<option value="${Number(version.versionCode)}">${adminEscapeHtml(androidVersionLabel(version))}</option>`
    )].join('');
    latest.innerHTML = options;
    minimum.innerHTML = options;
    latest.value = selectedLatest;
    minimum.value = selectedMinimum;
}

function applyAndroidPublicationConfig() {
    const config = androidPublicationConfig;
    if (!config) return updateAndroidPolicyPreview();
    document.getElementById('android-apk-url').value = config.apkUrl || 'https://pagina-gen.web.app/descargas/Pagina-Gen.apk';
    document.getElementById('android-update-title').value = config.titulo || 'Actualizá Gen 2';
    document.getElementById('android-update-description').value = config.descripcion || 'Hay una nueva versión disponible.';
    document.getElementById('android-update-action').value = config.textoEnlace || 'Descargar actualización';
    updateAndroidPolicyPreview();
}

function updateAndroidPolicyPreview() {
    const latestCode = Number(document.getElementById('android-latest-version')?.value || androidPublicationConfig?.versionCode || 0);
    const minimumCode = Number(document.getElementById('android-minimum-version')?.value || androidPublicationConfig?.minimumVersionCode || 0);
    const latestRelease = androidVersionReleases.find(item => Number(item.versionCode) === latestCode);
    const minimumRelease = androidVersionReleases.find(item => Number(item.versionCode) === minimumCode);
    const latestLabel = latestRelease ? androidVersionLabel(latestRelease) : (latestCode ? `código ${latestCode}` : '—');
    const minimumLabel = minimumRelease ? androidVersionLabel(minimumRelease) : (minimumCode ? `código ${minimumCode}` : '—');
    document.getElementById('android-latest-summary').textContent = latestLabel;
    document.getElementById('android-minimum-summary').textContent = minimumLabel;
    const policy = latestCode && minimumCode && latestCode === minimumCode ? 'Obligatoria para versiones anteriores' : 'Recomendada con compatibilidad anterior';
    document.getElementById('android-policy-summary').textContent = latestCode && minimumCode ? policy : '—';
    const preview = document.getElementById('android-policy-preview');
    if (!preview) return;
    if (minimumCode > latestCode) {
        preview.className = 'android-policy-preview is-error';
        preview.textContent = 'La versión mínima no puede ser posterior a la última versión disponible.';
    } else if (latestCode === minimumCode && latestCode) {
        preview.className = 'android-policy-preview is-required';
        preview.textContent = `Actualización obligatoria: todas las versiones anteriores a ${minimumLabel} quedarán bloqueadas.`;
    } else if (latestCode) {
        preview.className = 'android-policy-preview';
        preview.textContent = `La actualización se anunciará, pero las versiones desde ${minimumLabel} podrán seguir usándose.`;
    } else {
        preview.className = 'android-policy-preview';
        preview.textContent = 'Registrá una versión para configurar la publicación.';
    }
}

async function saveAndroidPublicationConfig(event) {
    event.preventDefault();
    const status = document.getElementById('android-publication-status');
    const latestCode = Number(document.getElementById('android-latest-version').value);
    const minimumCode = Number(document.getElementById('android-minimum-version').value);
    const latestRelease = androidVersionReleases.find(item => Number(item.versionCode) === latestCode && item.estado === 'publicado');
    if (!latestRelease || !androidVersionReleases.some(item => Number(item.versionCode) === minimumCode && item.estado === 'publicado')) {
        status.textContent = 'Elegí versiones revisadas y publicadas.';
        return;
    }
    if (minimumCode > latestCode) {
        status.textContent = 'La versión mínima no puede superar la última versión.';
        return;
    }
    const config = {
        versionCode: latestCode,
        versionName: String(latestRelease.versionName),
        minimumVersionCode: minimumCode,
        apkUrl: document.getElementById('android-apk-url').value.trim(),
        titulo: document.getElementById('android-update-title').value.trim(),
        descripcion: document.getElementById('android-update-description').value.trim(),
        textoEnlace: document.getElementById('android-update-action').value.trim(),
        updatedAt: new Date(),
        updatedBy: currentUser.uid
    };
    status.textContent = 'Publicando…';
    try {
        await utils.setDoc(utils.doc(db, 'configuracion_publica', 'android'), config);
        androidPublicationConfig = config;
        document.getElementById('android-version-source').textContent = 'Configuración activa en Firestore';
        updateAndroidPolicyPreview();
        status.textContent = 'Configuración publicada. Android comenzará a usarla inmediatamente.';
    } catch (error) {
        console.error('No se pudo publicar la configuración de Android:', error);
        status.textContent = `No se pudo publicar: ${error.message}`;
    }
}

function splitAndroidReleaseLines(id) {
    return document.getElementById(id).value.split(/\r?\n/).map(value => value.trim()).filter(Boolean).slice(0, 30);
}

async function saveAndroidRelease(event) {
    event.preventDefault();
    const status = document.getElementById('android-release-status');
    const code = Number(document.getElementById('android-release-code').value);
    const originalCode = Number(document.getElementById('android-release-original-code').value || code);
    if (!Number.isInteger(code) || code < 1) return;
    const existingRelease = androidVersionReleases.find(item => Number(item.versionCode) === originalCode);
    const requestedState = document.getElementById('android-release-state').value === 'publicado' ? 'publicado' : 'pendiente';
    const release = {
        versionCode: code,
        versionName: document.getElementById('android-release-name').value.trim(),
        newFeatures: splitAndroidReleaseLines('android-release-new'),
        improvements: splitAndroidReleaseLines('android-release-improvements'),
        fixes: splitAndroidReleaseLines('android-release-fixes'),
        removedFeatures: splitAndroidReleaseLines('android-release-removed'),
        apkUrl: document.getElementById('android-release-apk-url').value.trim(),
        releaseDate: document.getElementById('android-release-date').value,
        estado: requestedState,
        updatedAt: new Date(),
        updatedBy: currentUser.uid
    };
    if (![release.newFeatures, release.improvements, release.fixes, release.removedFeatures].some(items => items.length)) {
        status.textContent = 'Documentá por lo menos una función, mejora, corrección o función retirada.';
        return;
    }
    if (release.estado === 'publicado' && !release.apkUrl) {
        status.textContent = 'Para publicar la versión, agregá primero el enlace directo al APK.';
        return;
    }
    if (release.estado === 'pendiente' && existingRelease?.estado === 'publicado' && [Number(androidPublicationConfig?.versionCode), Number(androidPublicationConfig?.minimumVersionCode)].includes(code)) {
        status.textContent = 'Esta versión está activa como actual o mínima. Cambiá primero la configuración de publicación antes de volverla pendiente.';
        return;
    }
    if (release.estado === 'publicado' && existingRelease?.estado !== 'publicado' && !confirm(`¿Marcar la versión ${release.versionName} como publicada? Quedará disponible para elegirla como actual o mínima.`)) return;
    if (release.estado === 'publicado' && existingRelease?.estado !== 'publicado') {
        release.aprobadoEn = new Date();
        release.aprobadoPor = currentUser.uid;
    }
    status.textContent = 'Guardando…';
    try {
        await utils.setDoc(utils.doc(db, 'versiones_android', String(code)), release, { merge: true });
        if (originalCode !== code) await utils.deleteDoc(utils.doc(db, 'versiones_android', String(originalCode)));
        await loadAndroidVersionHistory();
        resetAndroidReleaseForm();
        populateAndroidVersionSelectors();
        applyAndroidPublicationConfig();
        renderAndroidVersionHistory();
        status.textContent = `Versión ${release.versionName} guardada.`;
    } catch (error) {
        console.error('No se pudo guardar la versión de Android:', error);
        status.textContent = `No se pudo guardar: ${error.message}`;
    }
}

function renderAndroidChangeGroup(title, values, className = '') {
    if (!Array.isArray(values) || !values.length) return '';
    return `<section class="android-change-group ${className}"><h4>${adminEscapeHtml(title)}</h4><ul>${values.map(value => `<li>${adminEscapeHtml(value)}</li>`).join('')}</ul></section>`;
}

function renderAndroidVersionHistory() {
    const container = document.getElementById('android-version-history');
    if (!container) return;
    if (!androidVersionReleases.length) {
        container.innerHTML = '<p class="admin-list-status">Todavía no hay versiones registradas. Empezá por la versión instalada actualmente.</p>';
        return;
    }
    const latestCode = Number(androidPublicationConfig?.versionCode || 0);
    const minimumCode = Number(androidPublicationConfig?.minimumVersionCode || 0);
    container.innerHTML = androidVersionReleases.map(version => {
        const code = Number(version.versionCode);
        const isPending = version.estado !== 'publicado';
        const badges = [isPending ? '<span class="android-version-badge is-pending">Pendiente de revisión</span>' : '<span class="android-version-badge is-published">Publicada</span>', code === latestCode ? '<span class="android-version-badge is-latest">Actual</span>' : '', code === minimumCode ? '<span class="android-version-badge is-minimum">Mínima</span>' : ''].join('');
        return `<article class="android-version-card" data-version-code="${code}">
            <header><div><span class="android-version-code">Código interno Android: ${code}</span><h3>Versión ${adminEscapeHtml(version.versionName)}</h3></div><div class="android-version-badges">${badges}</div></header>
            <div class="android-version-metadata">${version.releaseDate ? `<span>Publicación: ${adminEscapeHtml(version.releaseDate)}</span>` : '<span>Sin fecha de publicación</span>'}${version.apkUrl ? `<a href="${adminEscapeHtml(version.apkUrl)}" target="_blank" rel="noopener noreferrer">Abrir APK en GitHub</a>` : '<span>Sin enlace al APK</span>'}</div>
            <div class="android-version-changes">
                ${renderAndroidChangeGroup('Funciones nuevas', version.newFeatures)}
                ${renderAndroidChangeGroup('Cambios y mejoras', version.improvements)}
                ${renderAndroidChangeGroup('Correcciones', version.fixes)}
                ${renderAndroidChangeGroup('Funciones retiradas', version.removedFeatures, 'is-removed')}
            </div>
            <div class="android-version-actions"><button class="btn-secondary android-version-edit" type="button" data-version-code="${code}">Editar versión</button>${isPending ? `<button class="btn-primary android-version-approve" type="button" data-version-code="${code}">Aprobar versión</button>` : ''}</div>
        </article>`;
    }).join('');
    container.querySelectorAll('.android-version-edit').forEach(button => button.addEventListener('click', () => editAndroidRelease(Number(button.dataset.versionCode))));
    container.querySelectorAll('.android-version-approve').forEach(button => button.addEventListener('click', () => approveAndroidRelease(Number(button.dataset.versionCode))));
}

async function approveAndroidRelease(code) {
    const release = androidVersionReleases.find(item => Number(item.versionCode) === code);
    if (!release || release.estado === 'publicado') return;
    if (!release.apkUrl) {
        alert('Antes de aprobarla, editá la versión y agregá el enlace directo al APK de GitHub Releases.');
        editAndroidRelease(code);
        return;
    }
    if (!confirm(`¿Aprobar la versión ${release.versionName}? Después quedará disponible para elegirla como versión actual o mínima.`)) return;
    try {
        await utils.updateDoc(utils.doc(db, 'versiones_android', String(code)), {
            estado: 'publicado', aprobadoEn: new Date(), aprobadoPor: currentUser.uid
        });
        await loadAndroidVersionHistory();
        populateAndroidVersionSelectors();
        applyAndroidPublicationConfig();
        renderAndroidVersionHistory();
    } catch (error) {
        console.error('No se pudo aprobar la versión de Android:', error);
        alert(`No se pudo aprobar la versión: ${error.message}`);
    }
}

function editAndroidRelease(code) {
    const release = androidVersionReleases.find(item => Number(item.versionCode) === code);
    if (!release) return;
    document.getElementById('android-release-form-title').textContent = `Editar versión ${release.versionName}`;
    document.getElementById('android-release-original-code').value = String(code);
    document.getElementById('android-release-name').value = release.versionName || '';
    document.getElementById('android-release-code').value = String(code);
    document.getElementById('android-release-apk-url').value = release.apkUrl || '';
    document.getElementById('android-release-date').value = release.releaseDate || '';
    document.getElementById('android-release-state').value = release.estado === 'publicado' ? 'publicado' : 'pendiente';
    document.getElementById('android-release-new').value = (release.newFeatures || []).join('\n');
    document.getElementById('android-release-improvements').value = (release.improvements || []).join('\n');
    document.getElementById('android-release-fixes').value = (release.fixes || []).join('\n');
    document.getElementById('android-release-removed').value = (release.removedFeatures || []).join('\n');
    document.getElementById('android-release-cancel').hidden = false;
    document.getElementById('android-release-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetAndroidReleaseForm() {
    document.getElementById('android-release-form')?.reset();
    document.getElementById('android-release-original-code').value = '';
    document.getElementById('android-release-code').value = String(nextAndroidVersionCode());
    document.getElementById('android-release-form-title').textContent = 'Registrar una versión';
    document.getElementById('android-release-cancel').hidden = true;
}
