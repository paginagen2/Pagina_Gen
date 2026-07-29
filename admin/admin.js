let db, utils, auth;
let currentUser = null;
let currentSection = 'carrusel';
let editingId = null;
const loadedSections = new Set();

// Variables globales para todas las secciones
let allCanciones = [];
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

document.addEventListener('DOMContentLoaded', async function() {
    try {
        if (window.firebaseReady) await window.firebaseReady;

        if (!window.firebaseDb || !window.firebaseUtils || !window.firebaseAuth) {
            throw new Error('No se pudo iniciar la conexión con Firebase.');
        }

        db = window.firebaseDb;
        utils = window.firebaseUtils;
        auth = window.firebaseAuth;
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
            const roles = userData?.roles || [];

            if (!roles.includes('admin')) {
                showAccessDenied();
                return;
            }

            // Migración compatible: los registros anteriores no tenían un campo
            // de visibilidad. Se marcan como públicos una sola vez para que las
            // nuevas reglas no oculten contenido histórico legítimo.
            await migrateLegacyMeditationVisibility();

            // Si es admin, mostrar el contenido
            hideAdminStatus();
            document.getElementById('admin-content').style.display = 'block';
            document.getElementById('access-denied').style.display = 'none';

            setupSectionNavigation();
            loadCurrentSection();
        } catch (error) {
            console.error('No se pudo verificar el acceso de administrador:', error);
            showAdminError('No pudimos verificar tu acceso. Recargá la página para intentarlo nuevamente.');
        }
    }, (error) => {
        console.error('Error de autenticación:', error);
        showAdminError('No pudimos verificar tu sesión. Recargá la página para intentarlo nuevamente.');
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
}

function changeSection(section) {
    currentSection = section;
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === section);
    });
    
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === `${section}-section`);
    });
    
    editingId = null;
    loadCurrentSection();
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
        case 'meditaciones':
            loadMeditaciones();
            break;
        case 'biblioteca':
            initBibliotecaAdmin();
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
        case 'lyrics':
            initLyricsCorrector();
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
            utils.orderBy('createdAt', 'desc')
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
            item.innerHTML = `
                ${data.fotoUrl ? `<img src="../${data.fotoUrl}" alt="${data.titulo}" class="carrusel-item-img">` : ''}
                <div class="carrusel-item-content">
                    <h3>${data.titulo}</h3>
                    <p>${data.descripcion}</p>
                    <div class="carrusel-item-actions">
                        <button class="btn-edit" onclick="editCarruselItem('${docSnap.id}', ${JSON.stringify(data).replace(/"/g, '&quot;')})">Editar</button>
                        <button class="btn-delete" onclick="deleteCarruselItem('${docSnap.id}')">Borrar</button>
                    </div>
                </div>
            `;
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

async function loadCanciones() {
    try {
        const q = utils.query(utils.collection(db, 'canciones'), utils.orderBy('fechaCreacion', 'desc'));
        const querySnapshot = await utils.getDocs(q);
        allCanciones = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        allCanciones.sort((a, b) => {
            const ta = a.fechaCreacion && a.fechaCreacion.toMillis ? a.fechaCreacion.toMillis() : (a.fechaCreacion || 0);
            const tb = b.fechaCreacion && b.fechaCreacion.toMillis ? b.fechaCreacion.toMillis() : (b.fechaCreacion || 0);
            return tb - ta;
        });
        
        displayCanciones(allCanciones);
        setupCancioneroListeners();
    } catch (error) {
        console.error('Error al cargar canciones:', error);
    }
}

function displayCanciones(canciones) {
    const list = document.getElementById('cancion-list');
    if (!list) return;
    list.innerHTML = '';
    
    canciones.forEach(cancion => {
        const item = document.createElement('div');
        item.className = `item ${editingId === cancion.id ? 'active' : ''}`;
        
        const estado = cancion.estado || 'pendiente';
        const categoria = cancion.categoria || 'gen';
        
        item.innerHTML = `
            <div class="item-title">${cancion.titulo}</div>
            <div class="item-subtitle">${cancion.artista || 'Sin artista'}</div>
            <span class="item-badge badge-${categoria}">${categoria}</span>
            <span class="item-badge badge-${estado}">${estado}</span>
        `;
        item.addEventListener('click', () => editCancion(cancion));
        list.appendChild(item);
    });
}

function editCancion(cancion) {
    editingId = cancion.id;
    const form = document.getElementById('cancion-form');
    form.dataset.editingId = cancion.id;

    document.getElementById('cancion-form-title').textContent = '✏️ Editar Canción';
    document.getElementById('cancion-titulo').value = cancion.titulo || '';
    document.getElementById('cancion-artista').value = cancion.artista || '';
    document.getElementById('cancion-letra').value = cancion.letra || '';
    document.getElementById('cancion-categoria').value = cancion.categoria || 'gen';
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

function setupCancioneroListeners() {
    const search = document.getElementById('cancion-search');
    const filterEstado = document.getElementById('cancion-filter-estado');
    const filterCategoria = document.getElementById('cancion-filter-categoria');
    const form = document.getElementById('cancion-form');
    const cancelBtn = document.getElementById('cancion-cancel');
    const deleteBtn = document.getElementById('cancion-delete');
    if (!form || form.dataset.adminBound === 'true') return;
    form.dataset.adminBound = 'true';

    if (search) search.addEventListener('input', filterCanciones);
    if (filterEstado) filterEstado.addEventListener('change', filterCanciones);
    if (filterCategoria) filterCategoria.addEventListener('change', filterCanciones);

    if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formEditingId = form.dataset.editingId || null;

        const data = {
            titulo: document.getElementById('cancion-titulo').value.trim(),
            artista: document.getElementById('cancion-artista').value.trim(),
            letra: document.getElementById('cancion-letra').value.trim(),
            categoria: document.getElementById('cancion-categoria').value,
            estado: document.getElementById('cancion-estado').value,
            reproducciones: 0,
            fechaCreacion: new Date(),
            activa: true
        };
        
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

function filterCanciones() {
    const search = document.getElementById('cancion-search').value.toLowerCase();
    const filterEstado = document.getElementById('cancion-filter-estado').value;
    const filterCategoria = document.getElementById('cancion-filter-categoria').value;
    
    let filtered = allCanciones.filter(c => {
        const matchSearch = (c.titulo || '').toLowerCase().includes(search) ||
                           (c.artista || '').toLowerCase().includes(search);
        const matchEstado = !filterEstado || (c.estado || 'pendiente') === filterEstado;
        const matchCategoria = !filterCategoria || (c.categoria || 'gen') === filterCategoria;
        return matchSearch && matchEstado && matchCategoria;
    });
    
    displayCanciones(filtered);
}

// ==================== RECURSOS ====================

async function loadRecursos() {
    try {
        const q = utils.query(utils.collection(db, 'recursos'), utils.orderBy('fechaCreacion', 'desc'));
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
            <div class="item-title">${icono} ${recurso.titulo || 'Sin título'}</div>
            <div class="item-subtitle">Categoría: ${recurso.categoria || 'Sin categoría'}</div>
            <span class="item-badge badge-${recurso.estado || 'pendiente'}">${recurso.estado || 'pendiente'}</span>
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
        const querySnapshot = await utils.getDocs(utils.collection(db, 'pasapalabra'));
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
                    <div class="reflexion-date">${reflexion.fecha || 'Sin fecha'}</div>
                    <div class="reflexion-title">${reflexion.titulo || 'Sin título'}</div>
                </div>
                <button class="btn-delete" onclick="deletePasapalabra('${reflexion.id}')">🗑️ Eliminar</button>
            </div>
            <div class="reflexion-content">${(reflexion.reflexion || 'Sin contenido').substring(0, 250)}...</div>
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
        const q = utils.query(utils.collection(db, 'meditaciones'), utils.orderBy('titulo'));
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
                    <div class="item-title">${it.titulo}</div>
                    <div class="item-subtitle">${(it.descripcion||'').substring(0,80)}</div>
                    <div style="margin-top:6px;color:var(--text-muted);">${(it.contenido||'').substring(0,140)}...</div>
                    <div style="margin-top:6px;color:var(--text-muted);font-size:13px;">${it.autor? 'Autor: '+it.autor : ''} ${it.libro? ' • '+it.libro : ''} ${it.pagina? ' (p. '+it.pagina+')' : ''}</div>
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

        const data = { titulo, contenido, activa: meditacionDiaria, 'Meditación': meditacionCategoria, 'Informacion': informacionCategoria, 'Publico': publicoCategoria };
        if (libro) data.libro = libro;
        if (pagina) data.pagina = pagina;
        if (autor) data.autor = autor;
        if (descripcion) data.descripcion = descripcion;

        try {
            if (editingId) {
                await utils.setDoc(utils.doc(db, 'meditaciones', editingId), data, { merge: true });
                alert('✅ Meditación actualizada');
            } else {
                const id = `meditacion_${Date.now()}`;
                await utils.setDoc(utils.doc(db, 'meditaciones', id), data);
                alert('✅ Meditación guardada');
            }
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
            await utils.deleteDoc(utils.doc(db, 'meditaciones', editingId));
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
    document.getElementById('meditacion-categoria-publico').checked = item['Publico'] !== false;
    
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
    document.getElementById('meditacion-categoria-publico').checked = true;
    const cancelBtn = document.getElementById('meditacion-cancel');
    const delBtn = document.getElementById('meditacion-delete');
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (delBtn) delBtn.style.display = 'none';
}

async function deleteMeditacion(id) {
    if (!confirm('¿Eliminar esta meditación?')) return;
    try {
        await utils.deleteDoc(utils.doc(db, 'meditaciones', id));
        alert('✅ Meditación eliminada');
        if (editingId === id) resetMeditacionForm();
        loadMeditaciones();
    } catch (err) {
        console.error('Error al eliminar meditación:', err);
        alert('❌ Error al eliminar');
    }
}

window.editMeditacion = editMeditacion;
window.deleteMeditacion = deleteMeditacion;

// ==================== FRASES ====================

async function loadFrases() {
    try {
        const q = utils.query(utils.collection(db, 'frases'), utils.orderBy('fechaCreacion', 'desc'));
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
            <div class="item-title">"${(frase.frase || '').substring(0, 80)}..."</div>
            <div class="item-subtitle">— ${frase.autor || 'Anónimo'}</div>
            <span class="item-badge badge-${frase.estado || 'publicado'}">${frase.estado || 'publicado'}</span>
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
        const q = utils.query(utils.collection(db, 'pdv'), utils.orderBy('fechaCreacion', 'desc'));
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
                    <div class="item-title">${it.mes || 'Sin mes'}</div>
                    <div class="item-subtitle">${it.citaReferencia || ''}</div>
                    <div style="margin-top:6px;color:var(--text-muted);">${(it.citaPrincipal || '').substring(0,80)}...</div>
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
        const snapshot = await utils.getDocs(utils.collection(db, 'pdv'));
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
              <label class="pdv-block-extra"${block.tipo === 'reflexion_autor' ? '' : ' hidden'}>Título
                <input data-field="titulo" value="${escape(block.titulo || '')}" placeholder="Escribe Chiara Lubich">
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

// ==================== CORRECCIÓN DE LETRAS ====================

let allLyricsCanciones = [];
let lyricsEditingId = null;

function initLyricsCorrector() {
    loadLyricsList();
    setupLyricsListeners();
}

async function loadLyricsList() {
    const list = document.getElementById('lyrics-list');
    if (!list) return;
    list.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Cargando...</p>';
    
    try {
        const q = utils.query(utils.collection(db, 'canciones'), utils.orderBy('fechaCreacion', 'desc'));
        const querySnapshot = await utils.getDocs(q);
        allLyricsCanciones = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        displayLyricsList(allLyricsCanciones);
    } catch (error) {
        console.error('Error al cargar lista de canciones:', error);
        list.innerHTML = '<p style="text-align: center; color: var(--danger-color);">Error al cargar la lista.</p>';
    }
}

function displayLyricsList(canciones) {
    const list = document.getElementById('lyrics-list');
    if (!list) return;
    list.innerHTML = '';
    
    const search = document.getElementById('lyrics-search')?.value.toLowerCase() || '';
    const filter = document.getElementById('lyrics-filter')?.value || '';
    
    const filtered = canciones.filter(c => {
        const matchSearch = !search || (c.titulo || '').toLowerCase().includes(search) || (c.artista || '').toLowerCase().includes(search);
        const matchFilter = !filter || c.estado === filter;
        return matchSearch && matchFilter;
    });
    
    if (filtered.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No hay canciones para mostrar.</p>';
        return;
    }
    
    filtered.forEach(cancion => {
        const item = document.createElement('div');
        item.className = `item ${lyricsEditingId === cancion.id ? 'active' : ''}`;
        
        item.innerHTML = `
            <div class="item-title">${cancion.titulo || 'Sin título'}</div>
            <div class="item-subtitle">${cancion.artista || 'Sin artista'}</div>
            <span class="item-badge badge-${cancion.categoria || 'gen'}">${cancion.categoria || 'gen'}</span>
            <span class="item-badge badge-${cancion.estado || 'pendiente'}">${cancion.estado || 'pendiente'}</span>
        `;
        
        item.addEventListener('click', () => editLyrics(cancion));
        list.appendChild(item);
    });
}

function editLyrics(cancion) {
    lyricsEditingId = cancion.id;
    document.getElementById('lyrics-edit-id').value = cancion.id;
    document.getElementById('lyrics-titulo').value = cancion.titulo || '';
    document.getElementById('lyrics-artista').value = cancion.artista || '';
    document.getElementById('lyrics-letra').value = cancion.letra || '';
    document.getElementById('lyrics-estado').value = cancion.estado || 'pendiente';
    document.getElementById('lyrics-form-title').textContent = '✏️ Editando: ' + (cancion.titulo || 'Sin título');
    document.getElementById('lyrics-cancel').style.display = 'inline-block';
}

function resetLyricsForm() {
    lyricsEditingId = null;
    document.getElementById('lyrics-form').reset();
    document.getElementById('lyrics-form-title').textContent = '✏️ Editar Letra';
    document.getElementById('lyrics-cancel').style.display = 'none';
}

function setupLyricsListeners() {
    const search = document.getElementById('lyrics-search');
    const filter = document.getElementById('lyrics-filter');
    const form = document.getElementById('lyrics-form');
    if (!form || form.dataset.adminBound === 'true') return;
    form.dataset.adminBound = 'true';
    const cancelBtn = document.getElementById('lyrics-cancel');
    
    if (search) search.addEventListener('input', () => displayLyricsList(allLyricsCanciones));
    if (filter) filter.addEventListener('change', () => displayLyricsList(allLyricsCanciones));
    
    if (cancelBtn) cancelBtn.addEventListener('click', resetLyricsForm);
    
    if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('lyrics-edit-id').value;
        if (!id) return;
        
        const data = {
            artista: document.getElementById('lyrics-artista').value.trim(),
            letra: document.getElementById('lyrics-letra').value.trim(),
            estado: document.getElementById('lyrics-estado').value
        };
        
        try {
            await utils.setDoc(utils.doc(db, 'canciones', id), data, { merge: true });
            alert('✅ Letra actualizada con éxito!');
            resetLyricsForm();
            loadLyricsList();
            // Also update the main allCanciones list
            if (typeof loadCanciones === 'function') loadCanciones();
        } catch (error) {
            console.error('Error al guardar letra:', error);
            alert('❌ Error al guardar los cambios: ' + error.message);
        }
    });
}

// ==================== SUBIDA MÚLTIPLE ====================

let bulkPreviewData = [];

function initBulkUpload() {
    setupBulkUploadListeners();
}

function setupBulkUploadListeners() {
    const fileInput = document.getElementById('bulk-file');
    const previewBtn = document.getElementById('bulk-preview');
    const uploadBtn = document.getElementById('bulk-upload');
    const clearBtn = document.getElementById('bulk-clear');
    if (!previewBtn || previewBtn.dataset.adminBound === 'true') return;
    previewBtn.dataset.adminBound = 'true';
    
    if (fileInput) fileInput.addEventListener('change', handleBulkFile);
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
    
    if (!jsonText) {
        container.innerHTML = '<p style="color: var(--danger-color);">Por favor pega el JSON o sube un archivo.</p>';
        return;
    }
    
    try {
        bulkPreviewData = JSON.parse(jsonText);
        if (!Array.isArray(bulkPreviewData)) {
            throw new Error('El JSON debe ser un array.');
        }
        
        let html = `<h3 style="color: var(--text-light); margin-bottom: 1rem;">📋 Previsualización (${bulkPreviewData.length} canciones)</h3>`;
        html += '<div style="max-height: 400px; overflow-y: auto;">';
        
        bulkPreviewData.forEach((item, index) => {
            html += `
                <div style="background: var(--admin-card-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
                    <div style="font-weight: bold; color: var(--text-light);">${index + 1}. ${item.titulo || 'Sin título'}</div>
                    <div style="color: var(--text-muted);">Artista: ${item.artista || 'N/A'}</div>
                    <div style="color: var(--text-muted);">Categoría: ${item.categoria || 'gen'} | Estado: ${item.estado || 'pendiente'}</div>
                    <div style="color: var(--text-muted); margin-top: 0.5rem; white-space: pre-wrap; font-size: 0.875rem;">${(item.letra || '').substring(0, 200)}${item.letra && item.letra.length > 200 ? '...' : ''}</div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        container.innerHTML = `<p style="color: var(--danger-color);">Error al parsear el JSON: ${error.message}</p>`;
        bulkPreviewData = [];
    }
}

async function doBulkUpload() {
    if (bulkPreviewData.length === 0) {
        alert('Por favor previsualiza primero los datos.');
        return;
    }
    
    if (!confirm(`¿Estás seguro de subir ${bulkPreviewData.length} canciones?`)) {
        return;
    }
    
    const container = document.getElementById('bulk-preview-container');
    let successCount = 0;
    let errorCount = 0;
    
    container.innerHTML = '<p style="color: var(--text-light);">Subiendo canciones...</p>';
    
    for (let i = 0; i < bulkPreviewData.length; i++) {
        const item = bulkPreviewData[i];
        try {
            const data = {
                titulo: item.titulo || '',
                artista: item.artista || '',
                letra: item.letra || '',
                categoria: item.categoria || 'gen',
                estado: item.estado || 'pendiente',
                fechaCreacion: new Date(),
                activa: true,
                reproducciones: 0
            };
            
            const id = `cancion_${Date.now()}_${i}`;
            await utils.setDoc(utils.doc(db, 'canciones', id), data);
            successCount++;
            
            container.innerHTML = `<p style="color: var(--text-light);">Subiendo... ${i + 1}/${bulkPreviewData.length}</p>`;
        } catch (error) {
            console.error('Error al subir canción ' + (i + 1), error);
            errorCount++;
        }
    }
    
    container.innerHTML = `
        <div style="padding: 1.5rem; border-radius: 8px; background: var(--success-color); color: white;">
            <h3>✅ Completado!</h3>
            <p>Canciones subidas exitosamente: ${successCount}</p>
            ${errorCount > 0 ? `<p style="margin-top: 0.5rem;">Errores: ${errorCount}</p>` : ''}
        </div>
    `;
    
    alert(`Subida completada! ${successCount} exitosas, ${errorCount} errores.`);
    
    // Clear form
    clearBulkForm();
    
    // Refresh main canciones list if needed
    if (typeof loadCanciones === 'function') loadCanciones();
}

function clearBulkForm() {
    document.getElementById('bulk-json').value = '';
    document.getElementById('bulk-file').value = '';
    document.getElementById('bulk-preview-container').innerHTML = '';
    bulkPreviewData = [];
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
        const [snapshot, legacySnapshot] = await Promise.all([
            utils.getDocs(utils.collection(db, 'canal_publicaciones')),
            utils.getDocs(utils.collection(db, 'carrusel'))
        ]);
        const currentItems = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
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
    const assignmentForm = document.getElementById('asignacion-form');
    if (!zoneForm || zoneForm.dataset.bound) return;
    zoneForm.dataset.bound = 'true';
    zoneForm.addEventListener('submit', createAccessZone);
    codeForm.addEventListener('submit', createAccessCode);
    assignmentForm.addEventListener('submit', assignAccessDirectly);
    document.getElementById('codigo-tipo').addEventListener('change', updateCodeTypeFields);
    document.getElementById('codigo-destino-tipo').addEventListener('change', updateCodeDestinationFields);
    document.getElementById('asignacion-destino-tipo').addEventListener('change', updateAssignmentDestinationFields);
    document.getElementById('acceso-tipo').addEventListener('change', updateAccessEntityFields);
    document.getElementById('codigos-filtro').addEventListener('change', renderAccessCodes);
    document.getElementById('codigos-destino-filtro').addEventListener('change', renderAccessCodes);
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
    updateAssignmentDestinationFields();
    updateAccessEntityFields();
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
    return accessRoleId(value, document.getElementById('acceso-tipo')?.value || 'zona');
}

function updateAccessEntityFields() {
    const isFunction = document.getElementById('acceso-tipo').value === 'funcionalidad';
    document.getElementById('zona-nombre-label').textContent = isFunction ? 'Nombre de la funcionalidad *' : 'Nombre de la zona *';
    document.getElementById('zona-nombre').placeholder = isFunction ? 'Ej.: Administrador' : 'Ej.: Rosario';
    document.getElementById('zona-id-help').textContent = isFunction
        ? 'Se genera con el prefijo funcion_. “Administrador” usa el rol especial admin.'
        : 'Se genera con el prefijo zona_. No podrá cambiarse después.';
    document.getElementById('zona-submit').textContent = isFunction ? 'Crear funcionalidad' : 'Crear zona';
    const idInput = document.getElementById('zona-id');
    if (!idInput.dataset.manual) idInput.value = zoneRoleId(document.getElementById('zona-nombre').value);
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

function updateAssignmentDestinationFields() {
    const isZone = document.getElementById('asignacion-destino-tipo').value === 'zona';
    document.getElementById('asignacion-zona-group').hidden = !isZone;
    document.getElementById('asignacion-funcionalidad-group').hidden = isZone;
    document.getElementById('asignacion-zona').required = isZone;
    document.getElementById('asignacion-funcionalidad').required = !isZone;
}

async function loadAccessAdmin() {
    try {
        const [zonesSnapshot, functionsSnapshot, codesSnapshot, usersSnapshot] = await Promise.all([
            utils.getDocs(utils.collection(db, 'zonas')),
            utils.getDocs(utils.collection(db, 'funcionalidades')),
            utils.getDocs(utils.collection(db, 'codigos_roles')),
            utils.getDocs(utils.collection(db, 'usuarios'))
        ]);
        accessZones = zonesSnapshot.docs.map(item => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (a.nombre || a.id).localeCompare(b.nombre || b.id, 'es'));
        accessFunctions = functionsSnapshot.docs.map(item => ({ id: item.id, ...item.data() }))
            .sort((a, b) => (a.nombre || a.id).localeCompare(b.nombre || b.id, 'es'));
        accessCodes = codesSnapshot.docs.map(item => ({ id: item.id, ...item.data() }))
            .sort((a, b) => accessDate(b.creadoEn) - accessDate(a.creadoEn));
        accessUsers = usersSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        const usersList = document.getElementById('codigo-usuarios');
        usersList.replaceChildren();
        accessUsers.forEach(user => {
            if (!user.email) return;
            const option = document.createElement('option');
            option.value = user.email;
            option.label = user.nombre || user.displayName || user.email;
            usersList.appendChild(option);
        });
        renderAccessZones();
        renderAccessCodes();
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
    const container = document.getElementById('zonas-list');
    const zoneSelect = document.getElementById('codigo-zona');
    const functionSelect = document.getElementById('codigo-funcionalidad');
    const assignmentZoneSelect = document.getElementById('asignacion-zona');
    const assignmentFunctionSelect = document.getElementById('asignacion-funcionalidad');
    container.replaceChildren();
    zoneSelect.innerHTML = '<option value="">Elegí una zona</option>';
    functionSelect.innerHTML = '<option value="">Elegí una funcionalidad</option>';
    assignmentZoneSelect.innerHTML = '<option value="">Elegí una zona</option>';
    assignmentFunctionSelect.innerHTML = '<option value="">Elegí una funcionalidad</option>';
    const entries = [
        ...accessZones.map(item => ({ ...item, accessType: 'zona' })),
        ...accessFunctions.map(item => ({ ...item, accessType: 'funcionalidad' }))
    ].sort((a, b) => (a.nombre || a.id).localeCompare(b.nombre || b.id, 'es'));
    entries.forEach(zone => {
        const row = document.createElement('article');
        row.className = `access-item${zone.activa === false ? ' access-item-inactive' : ''}`;
        const info = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = zone.nombre || zone.id;
        const meta = document.createElement('span');
        const typeName = zone.accessType === 'funcionalidad' ? 'Funcionalidad' : 'Zona';
        meta.textContent = `${typeName} · ${zone.id} · ${zone.activa === false ? 'Inactiva' : 'Activa'}`;
        info.append(title, meta);
        if (zone.descripcion) {
            const description = document.createElement('p');
            description.textContent = zone.descripcion;
            info.appendChild(description);
        }
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = zone.activa === false ? 'btn-secondary' : 'btn-delete';
        toggle.textContent = zone.activa === false ? 'Reactivar' : 'Desactivar';
        toggle.addEventListener('click', () => toggleAccessZone(zone));
        row.append(info, toggle);
        container.appendChild(row);

        if (zone.activa !== false) {
            const option = document.createElement('option');
            option.value = zone.id;
            option.textContent = zone.nombre || zone.id;
            (zone.accessType === 'funcionalidad' ? functionSelect : zoneSelect).appendChild(option);
            const assignmentOption = option.cloneNode(true);
            (zone.accessType === 'funcionalidad' ? assignmentFunctionSelect : assignmentZoneSelect).appendChild(assignmentOption);
        }
    });
    if (!entries.length) container.innerHTML = '<p class="admin-list-status">Todavía no hay zonas ni funcionalidades.</p>';
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
        const snapshot = await utils.getDocs(utils.collection(db, 'codigos_roles', code.id, 'canjes'));
        const redemptions = await Promise.all(snapshot.docs.map(async item => {
            const data = item.data();
            const profile = await utils.getDoc(utils.doc(db, 'usuarios', data.uid));
            const user = profile.exists() ? profile.data() : {};
            return {
                uid: data.uid,
                name: user.nombre || user.displayName || user.email || data.uid,
                date: accessDate(data.canjeadoEn)
            };
        }));
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
    const accessType = document.getElementById('acceso-tipo').value;
    const isFunction = accessType === 'funcionalidad';
    const name = document.getElementById('zona-nombre').value.trim();
    const idInput = document.getElementById('zona-id');
    const id = (idInput.value.trim() || accessRoleId(name, accessType)).toLowerCase();
    const validId = isFunction
        ? /^(?:admin|funcion_[a-z0-9]+(?:_[a-z0-9]+)*)$/
        : /^zona_[a-z0-9]+(?:_[a-z0-9]+)*$/;
    if (!validId.test(id)) return alert(isFunction
        ? 'La funcionalidad debe usar admin o comenzar con funcion_, usando solo letras, números y guiones bajos.'
        : 'La zona debe comenzar con zona_ y usar solo letras, números y guiones bajos.');
    const existingItems = isFunction ? accessFunctions : accessZones;
    if (existingItems.some(item => String(item.nombre || '').trim().toLowerCase() === name.toLowerCase())) {
        return alert(`Ya existe ${isFunction ? 'una funcionalidad' : 'una zona'} con ese nombre.`);
    }
    try {
        const collectionName = isFunction ? 'funcionalidades' : 'zonas';
        const reference = utils.doc(db, collectionName, id);
        if ((await utils.getDoc(reference)).exists()) return alert(`Ya existe ${isFunction ? 'una funcionalidad' : 'una zona'} con ese identificador.`);
        await utils.setDoc(reference, {
            nombre: name,
            descripcion: document.getElementById('zona-descripcion').value.trim(),
            activa: true,
            creadoEn: new Date(),
            creadoPor: currentUser.uid
        });
        event.target.reset();
        idInput.dataset.manual = '';
        await loadAccessAdmin();
    } catch (error) {
        console.error(error);
        alert(`No se pudo crear la zona: ${error.message}`);
    }
}

async function toggleAccessZone(zone) {
    const nextActive = zone.activa === false;
    const isFunction = zone.accessType === 'funcionalidad';
    const itemName = isFunction ? 'la funcionalidad' : 'la zona';
    if (!confirm(`${nextActive ? '¿Reactivar' : '¿Desactivar'} ${itemName} “${zone.nombre || zone.id}”?`)) return;
    try {
        await utils.updateDoc(utils.doc(db, isFunction ? 'funcionalidades' : 'zonas', zone.id), { activa: nextActive, actualizadoEn: new Date(), actualizadoPor: currentUser.uid });
        await loadAccessAdmin();
    } catch (error) {
        alert(`No se pudo actualizar la zona: ${error.message}`);
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

async function assignAccessDirectly(event) {
    event.preventDefault();
    const email = document.getElementById('asignacion-email').value.trim().toLowerCase();
    const destinationType = document.getElementById('asignacion-destino-tipo').value;
    const role = destinationType === 'zona'
        ? document.getElementById('asignacion-zona').value
        : document.getElementById('asignacion-funcionalidad').value;
    if (!role) return alert(destinationType === 'zona' ? 'Elegí una zona.' : 'Elegí una funcionalidad.');

    const user = accessUsers.find(item => String(item.email || '').trim().toLowerCase() === email);
    if (!user) return alert('No encontramos una cuenta registrada con ese correo.');
    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (roles.includes(role)) return alert('La cuenta ya tiene ese acceso asignado.');

    try {
        await utils.updateDoc(utils.doc(db, 'usuarios', user.id), {
            roles: [...roles, role],
            accesoAsignadoEn: new Date(),
            accesoAsignadoPor: currentUser.uid
        });
        event.target.reset();
        updateAssignmentDestinationFields();
        await loadAccessAdmin();
        alert('Acceso asignado correctamente.');
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

function bibText(value) {
    return String(value || '').trim();
}

function bibFormatBytes(bytes) {
    if (!Number(bytes)) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** power)).toFixed(power ? 1 : 0)} ${units[power]}`;
}

function bibElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

async function initBibliotecaAdmin() {
    setupBibliotecaListeners();
    await Promise.all([loadBibliotecaAdmin(), loadBibliotecaAportes(), loadBibliotecaMetrics(), loadBibliotecaFormConfig(), loadBibliotecaTopics()]);
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
        status.textContent = 'Formulario guardado. Ya se mostrará dentro de la Biblioteca.';
    } catch (error) {
        console.error(error);
        status.textContent = `No se pudo guardar: ${error.message}`;
    }
}

async function loadBibliotecaAdmin() {
    const list = document.getElementById('bib-list');
    if (list) list.textContent = 'Cargando catálogo…';
    try {
        const snapshot = await utils.getDocs(utils.collection(db, 'biblioteca_recursos'));
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
            tamano: bibText(document.getElementById('bib-tamano').value),
            searchText: [title, document.getElementById('bib-autor').value, themes.join(' '), document.getElementById('bib-descripcion').value].join(' ').toLowerCase(),
            actualizadoEn: new Date(), actualizadoPor: currentUser.uid
        };
        if (!existing) { data.creadoEn = new Date(); data.creadoPor = currentUser.uid; }
        await utils.setDoc(utils.doc(db, 'biblioteca_recursos', id), data, { merge: true });
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
    document.getElementById('bib-estado').value = item.estado || 'borrador';
    document.getElementById('bib-anio').value = item.anio || '';
    document.getElementById('bib-idioma').value = item.idioma || 'es';
    document.getElementById('bib-link-recurso').value = item.linkRecurso || item.driveUrl || (item.googleId ? `https://drive.google.com/file/d/${item.googleId}/view` : '');
    document.getElementById('bib-tipo').value = item.tipo || 'PDF';
    document.getElementById('bib-tamano').value = item.tamano || '';
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
        if (bibEditingId === id) resetBibliotecaForm();
        await loadBibliotecaAdmin();
    } catch (error) { console.error(error); alert(`No se pudo eliminar: ${error.message}`); }
}

async function loadBibliotecaAportes() {
    const list = document.getElementById('bib-aportes-list');
    if (!list) return;
    list.textContent = 'Cargando aportes…';
    try {
        const snapshot = await utils.getDocs(utils.collection(db, 'biblioteca_aportes'));
        bibAportes = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
            .filter(item => item.estado === 'pendiente');
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
            bibElement('div', 'item-subtitle', [item.codigo, item.autor, item.categoria].filter(Boolean).join(' · ')),
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
    document.getElementById('bib-descripcion').value = item.descripcion || '';
    const contributionTopics = [...(item.temas || [])];
    if (item.temaPropuesto && item.temaPropuestoAprobado) contributionTopics.push(item.temaPropuesto);
    document.getElementById('bib-temas').value = contributionTopics.join(', ');
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
    if (views) views.textContent = bibMetrics.filter(item => item.tipo === 'apertura').length;
}

async function loadBibliotecaMetrics() {
    try {
        const snapshot = await utils.getDocs(utils.collection(db, 'biblioteca_eventos'));
        bibMetrics = snapshot.docs.map(docSnap => docSnap.data());
        updateBibliotecaSummary();
    } catch (error) {
        console.warn('No se pudieron cargar las métricas de Biblioteca:', error);
    }
}

async function migrateLegacyMeditationVisibility() {
    try {
        const snapshot = await utils.getDocs(utils.collection(db, 'meditaciones'));
        const pending = snapshot.docs.filter(docSnap => !Object.prototype.hasOwnProperty.call(docSnap.data(), 'Publico'));
        for (let start = 0; start < pending.length; start += 450) {
            const batch = utils.writeBatch(db);
            pending.slice(start, start + 450).forEach(docSnap => batch.update(docSnap.ref, { Publico: true }));
            await batch.commit();
        }
        if (pending.length) console.info(`Visibilidad normalizada en ${pending.length} meditaciones anteriores.`);
    } catch (error) {
        console.warn('No se pudo normalizar la visibilidad histórica de las meditaciones:', error);
    }
}
