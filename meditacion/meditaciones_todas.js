import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js';
import { getFirestore, collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyB7US5r--cM82usyzLqd-ckamgIdyewfKE",
    authDomain: "pagina-gen.firebaseapp.com",
    projectId: "pagina-gen",
    storageBucket: "pagina-gen.firebasestorage.app",
    messagingSenderId: "876893109130",
    appId: "1:876893109130:web:862f79fc7a609e512ee673"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let todasLasMeditaciones = [];

document.addEventListener('DOMContentLoaded', async () => {
    await cargarTodasLasMeditaciones();
    setupModal();
    setupBuscador();
});

async function cargarTodasLasMeditaciones() {
    const grid = document.getElementById('listaMeditaciones');
    
    try {
        const querySnapshot = await getDocs(query(collection(db, 'meditaciones'), where('Publico', '==', true)));
        todasLasMeditaciones = [];

        querySnapshot.forEach((doc) => {
            todasLasMeditaciones.push({ id: doc.id, ...doc.data() });
        });

        // Ordenar alfabéticamente por título
        todasLasMeditaciones.sort((a, b) => (a.titulo || "").localeCompare(b.titulo || ""));

        renderizarMeditaciones(todasLasMeditaciones);
    } catch (error) {
        console.error("Error al cargar meditaciones:", error);
        grid.innerHTML = '<p>Error al cargar las meditaciones.</p>';
    }
}

function renderizarMeditaciones(meditaciones) {
    const grid = document.getElementById('listaMeditaciones');
    grid.innerHTML = '';

    if (meditaciones.length === 0) {
        grid.innerHTML = '<p>No se encontraron meditaciones que coincidan con la búsqueda.</p>';
        return;
    }

    meditaciones.forEach((med) => {
        const card = document.createElement('div');
        card.className = 'meditacion-card-item';
        card.innerHTML = `<h3>${med.titulo || "Sin título"}</h3>`;
        card.onclick = () => abrirModal(med);
        grid.appendChild(card);
    });
}

function setupBuscador() {
    const inputBusqueda = document.getElementById('inputBusqueda');
    const btnOpciones = document.getElementById('btnOpciones');
    const opcionesBusqueda = document.getElementById('opcionesBusqueda');
    const checks = document.querySelectorAll('.opciones-busqueda input');

    if (btnOpciones) {
        btnOpciones.onclick = () => {
            opcionesBusqueda.classList.toggle('collapsed');
            const icono = btnOpciones.querySelector('.icono-down');
            if (icono) icono.style.transform = opcionesBusqueda.classList.contains('collapsed') ? 'rotate(0deg)' : 'rotate(180deg)';
        };
    }

    if (inputBusqueda) {
        inputBusqueda.oninput = () => filtrarMeditaciones();
    }

    checks.forEach(check => {
        check.onchange = () => filtrarMeditaciones();
    });
}

function filtrarMeditaciones() {
    const input = document.getElementById('inputBusqueda');
    const texto = input ? input.value : "";
    const checkTitulo = document.getElementById('checkTitulo');
    const checkTexto = document.getElementById('checkTexto');
    const radioModo = document.querySelector('input[name="modoBusqueda"]:checked');

    const buscarEnTitulo = checkTitulo ? checkTitulo.checked : true;
    const buscarEnTexto = checkTexto ? checkTexto.checked : true;
    const modoExacto = radioModo ? radioModo.value === 'exacto' : false;

    if (!texto.trim()) {
        renderizarMeditaciones(todasLasMeditaciones);
        return;
    }

    const textoNormalizado = normalizarTexto(texto);
    const palabras = textoNormalizado.split(/\s+/).filter(p => p.length > 0);

    const filtradas = todasLasMeditaciones.filter(med => {
        let match = false;
        const tituloNorm = normalizarTexto(med.titulo || "");
        const contenidoNorm = normalizarTexto(med.contenido || "");

        if (modoExacto) {
            if (buscarEnTitulo && tituloNorm.includes(textoNormalizado)) match = true;
            if (buscarEnTexto && contenidoNorm.includes(textoNormalizado)) match = true;
        } else {
            const matchTitulo = buscarEnTitulo && palabras.every(p => tituloNorm.includes(p));
            const matchTexto = buscarEnTexto && palabras.every(p => contenidoNorm.includes(p));
            match = matchTitulo || matchTexto;
        }

        return match;
    });

    renderizarMeditaciones(filtradas);
}

function normalizarTexto(t) {
    return t.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") 
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") 
        .trim();
}

function setupModal() {
    const modal = document.getElementById('meditacionModal');
    const span = document.querySelector('.close-modal');
    
    if (span) span.onclick = () => modal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == modal) modal.style.display = 'none';
    };
}

function abrirModal(med) {
    const modal = document.getElementById('meditacionModal');
    document.getElementById('modalTitulo').textContent = med.titulo || "Sin título";
    document.getElementById('modalTexto').textContent = med.contenido || "";
    
    const metaEl = document.getElementById('modalMeta');
    const autorEl = document.getElementById('modalAutor');
    const libroEl = document.getElementById('modalLibro');
    const paginaEl = document.getElementById('modalPagina');

    let tieneMeta = false;
    if (med.autor) {
        autorEl.textContent = med.autor;
        tieneMeta = true;
    } else { autorEl.textContent = ''; }

    if (med.libro) {
        libroEl.textContent = (med.autor ? ' — ' : '') + med.libro;
        tieneMeta = true;
    } else { libroEl.textContent = ''; }

    if (med.pagina) {
        paginaEl.textContent = (med.libro || med.autor ? ', pág. ' : 'Pág. ') + med.pagina;
        tieneMeta = true;
    } else { paginaEl.textContent = ''; }

    metaEl.style.display = tieneMeta ? 'block' : 'none';

    const descEl = document.getElementById('modalDescripcion');
    const textoDescripcion = (med.descripcion || med.contexto || '').trim();
    
    const normalizar = (t) => t.toLowerCase().replace(/[\s\-_,.]/g, '');
    const metaNormalizado = normalizar((med.autor || '') + (med.libro || '') + (med.pagina || ''));
    const descNormalizada = normalizar(textoDescripcion);
    
    if (!textoDescripcion || textoDescripcion.length < 5 || descNormalizada === metaNormalizado) {
        descEl.style.display = 'none';
    } else {
        descEl.textContent = textoDescripcion;
        descEl.style.display = 'block';
    }
    
    modal.style.display = 'block';
}
