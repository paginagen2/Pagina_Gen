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

document.addEventListener('DOMContentLoaded', function() {
    let tries = 0;
    const maxTries = 200; // Esperar máximo 20 segundos
    const checkFirebase = setInterval(() => {
        if (window.firebaseDb && window.firebaseUtils && window.firebaseAuth) {
            clearInterval(checkFirebase);
            db = window.firebaseDb;
            utils = window.firebaseUtils;
            auth = window.firebaseAuth;
            initializeAdmin();
        } else if (tries < maxTries) {
            tries++;
        } else {
            clearInterval(checkFirebase);
            console.warn('Firebase no se cargó en 20 segundos');
        }
    }, 100);
});

async function initializeAdmin() {
    const unsubscribe = utils.onAuthStateChanged(auth, async (user) => {
        unsubscribe();
        currentUser = user;
        
        if (!user) {
            showAccessDenied();
            return;
        }

        const userDoc = await utils.getDoc(utils.doc(db, 'usuarios', user.uid));
        const userData = userDoc.data();
        const roles = userData?.roles || [];

        if (!roles.includes('admin')) {
            showAccessDenied();
            return;
        }

        // Si es admin, mostrar el contenido
        document.getElementById('admin-content').style.display = 'block';
        document.getElementById('access-denied').style.display = 'none';

        setupSectionNavigation();
        loadCurrentSection();
    });
}

function showAccessDenied() {
    document.getElementById('admin-content').style.display = 'none';
    document.getElementById('access-denied').style.display = 'block';
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
        case 'cancionero':
            loadCanciones();
            break;
        case 'meditaciones':
            loadMeditaciones();
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

async function loadPdV() {
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

function displayPdV(items) {
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

function setupPdVListeners() {
    const form = document.getElementById('pdv-form');
    if (!form) return;

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

function resetPdVForm() {
    document.getElementById('pdv-edit-id').value = '';
    document.getElementById('pdv-form-title').textContent = '➕ Nueva PdV';
    document.getElementById('pdv-form').reset();
    document.getElementById('pdv-cancel').style.display = 'none';
    document.getElementById('pdv-delete').style.display = 'none';
}

function editPdV(id) {
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

async function deletePdV(id) {
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

function setupCanalForm() {
    const form = document.getElementById('canal-form');
    const cancel = document.getElementById('canal-cancel');
    const audience = document.getElementById('canal-audiencia');
    const state = document.getElementById('canal-estado');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = 'true';
    form.addEventListener('submit', saveCanalPost);
    cancel.addEventListener('click', resetCanalForm);
    audience.addEventListener('change', updateCanalAudienceFields);
    state.addEventListener('change', updateCanalStateFields);
    updateCanalAudienceFields();
    updateCanalStateFields();
}

function updateCanalAudienceFields() {
    const isGeneral = document.getElementById('canal-audiencia').value === 'general';
    const rolesGroup = document.getElementById('canal-roles-group');
    const rolesInput = document.getElementById('canal-roles');
    const featured = document.getElementById('canal-destacar');
    rolesGroup.hidden = isGeneral;
    rolesInput.required = !isGeneral;
    featured.disabled = !isGeneral;
    if (isGeneral) rolesInput.value = '';
    else featured.checked = false;
}

function updateCanalStateFields() {
    const scheduled = document.getElementById('canal-estado').value === 'programada';
    const date = document.getElementById('canal-fecha');
    date.required = scheduled;
}

async function loadCanalAdmin() {
    const container = document.getElementById('canal-list');
    if (!container) return;
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
                rolesDestinatarios: [],
                audiencia: 'general',
                estado: 'publicada',
                fechaPublicacion: data.createdAt || new Date(0),
                destacarEnCarrusel: true
            };
        });
        canalItems = [...currentItems, ...legacyItems]
            .sort((a, b) => canalDate(b.fechaPublicacion) - canalDate(a.fechaPublicacion));
        if (!canalItems.length) { container.innerHTML = '<p style="color:var(--text-muted)">Todavía no hay publicaciones.</p>'; return; }
        container.innerHTML = '';
        canalItems.forEach(item => {
            const row = document.createElement('article');
            row.className = 'canal-admin-item';
            const title = document.createElement('h3'); title.textContent = item.titulo || 'Sin título';
            const meta = document.createElement('p'); meta.className = 'canal-admin-meta';
            meta.textContent = `${canalEffectiveState(item)} · ${item.rolesDestinatarios?.length ? item.rolesDestinatarios.join(', ') : 'General'}${item.destacarEnCarrusel ? ' · En novedades' : ''}${item.legacyCarrusel ? ' · Formato anterior' : ''}`;
            const summary = document.createElement('p'); summary.textContent = item.resumen || '';
            const actions = document.createElement('div'); actions.className = 'canal-admin-actions';
            const edit = document.createElement('button'); edit.className = 'btn-edit'; edit.textContent = 'Editar'; edit.addEventListener('click', () => editCanalPost(item.id));
            const remove = document.createElement('button'); remove.className = 'btn-delete'; remove.textContent = 'Borrar'; remove.addEventListener('click', () => deleteCanalPost(item.id));
            actions.append(edit, remove); row.append(title, meta, summary, actions); container.appendChild(row);
        });
    } catch (error) { console.error(error); container.innerHTML = '<p style="color:var(--danger-color)">No se pudieron cargar las publicaciones.</p>'; }
}

async function saveCanalPost(event) {
    event.preventDefault();
    const id = document.getElementById('canal-edit-id').value;
    const estado = document.getElementById('canal-estado').value;
    const fechaInput = document.getElementById('canal-fecha').value;
    if (estado === 'programada' && !fechaInput) return alert('Elegí la fecha y hora para programar la publicación.');
    const audiencia = document.getElementById('canal-audiencia').value;
    const roles = audiencia === 'roles'
        ? [...new Set(document.getElementById('canal-roles').value.split(',').map(role => role.trim()).filter(Boolean))]
        : [];
    if (audiencia === 'roles' && !roles.length) return alert('Ingresá al menos una zona destinataria.');
    const imageValue = document.getElementById('canal-imagen').value.trim();
    const linkValue = document.getElementById('canal-enlace').value.trim();
    if (!validOptionalWebUrl(imageValue)) return alert('La imagen debe ser una ruta del sitio o una URL http/https válida.');
    if (!validOptionalWebUrl(linkValue)) return alert('El enlace debe ser una URL http/https válida.');
    const data = {
        titulo: document.getElementById('canal-titulo').value.trim(),
        resumen: document.getElementById('canal-resumen').value.trim(),
        contenido: document.getElementById('canal-contenido').value.trim(),
        imagenUrl: imageValue,
        enlace: linkValue,
        rolesDestinatarios: roles,
        audiencia,
        estado,
        fechaPublicacion: fechaInput ? new Date(fechaInput) : new Date(),
        destacarEnCarrusel: audiencia === 'general' && document.getElementById('canal-destacar').checked,
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
    document.getElementById('canal-enlace').value = item.enlace || '';
    document.getElementById('canal-audiencia').value = item.rolesDestinatarios?.length ? 'roles' : 'general';
    document.getElementById('canal-roles').value = (item.rolesDestinatarios || []).join(', ');
    document.getElementById('canal-estado').value = item.estado || 'borrador';
    const date = canalDate(item.fechaPublicacion);
    document.getElementById('canal-fecha').value = item.fechaPublicacion ? date.toISOString().slice(0, 16) : '';
    document.getElementById('canal-destacar').checked = Boolean(item.destacarEnCarrusel);
    updateCanalAudienceFields();
    // Restaurar los roles después de actualizar la visibilidad del campo.
    document.getElementById('canal-roles').value = (item.rolesDestinatarios || []).join(', ');
    document.getElementById('canal-cancel').style.display = 'inline-block';
    document.getElementById('canal-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetCanalForm() {
    document.getElementById('canal-form').reset();
    document.getElementById('canal-edit-id').value = '';
    document.getElementById('canal-cancel').style.display = 'none';
    document.getElementById('canal-form-title').textContent = '💬 Crear comunicación';
    updateCanalAudienceFields();
    updateCanalStateFields();
}
async function deleteCanalPost(id) {
    if (!confirm('¿Borrar esta publicación?')) return;
    try {
        const isLegacy = id.startsWith('legacy:');
        await utils.deleteDoc(utils.doc(db, isLegacy ? 'carrusel' : 'canal_publicaciones', isLegacy ? id.slice('legacy:'.length) : id));
        await loadCanalAdmin();
    } catch (error) { alert(`No se pudo borrar: ${error.message}`); }
}
