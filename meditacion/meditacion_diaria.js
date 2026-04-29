import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyB7US5r--cM82usyzLqd-ckamgIdyewfKE",
    authDomain: "pagina-gen.firebaseapp.com",
    projectId: "pagina-gen",
    storageBucket: "pagina-gen.appspot.com",
    messagingSenderId: "876893109130",
    appId: "1:876893109130:web:862f79fc7a609e512ee673"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', cargarMeditacion);

async function cargarMeditacion() {
    const tituloEl = document.getElementById('meditacionTitulo');
    const fechaEl = document.getElementById('meditacionFecha');
    const textoEl = document.getElementById('meditacionTexto');
    const metaEl = document.getElementById('meditacionMeta');
    const autorEl = document.getElementById('meditacionAutor');
    const libroEl = document.getElementById('meditacionLibro');
    const paginaEl = document.getElementById('meditacionPagina');
    const descEl = document.getElementById('meditacionDescripcion');

    try {
        const hoy = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        fechaEl.textContent = hoy.toLocaleDateString('es-ES', options);

        const querySnapshot = await getDocs(collection(db, 'meditaciones'));
        const meditaciones = [];
        querySnapshot.forEach(doc => meditaciones.push({ id: doc.id, ...doc.data() }));

        if (meditaciones.length > 0) {
            // 1. Calcular días transcurridos desde fecha base
            const fechaBase = new Date(2024, 0, 1);
            const msPorDia = 24 * 60 * 60 * 1000;
            const diasTranscurridos = Math.floor((hoy - fechaBase) / msPorDia);

            // 2. Determinar en qué número de ciclo estamos
            const numeroDeCiclo = Math.floor(diasTranscurridos / meditaciones.length);
            const indiceEnCiclo = diasTranscurridos % meditaciones.length;

            // 3. ASIGNAR ORDEN ALEATORIO ESTABLE (Incluyendo el numeroDeCiclo en el hash)
            // Al meter el numeroDeCiclo, el orden cambia CADA VEZ que se completa la lista.
            const meditacionesConOrden = meditaciones.map(med => {
                let hash = 0;
                // Combinamos ID + Ciclo para que la "semilla" sea única por ciclo
                const semilla = med.id + numeroDeCiclo;
                for (let i = 0; i < semilla.length; i++) {
                    hash = ((hash << 5) - hash) + semilla.charCodeAt(i);
                    hash |= 0; 
                }
                return { ...med, ordenAleatorio: hash };
            });

            // 4. ORDENAR por ese hash dinámico
            meditacionesConOrden.sort((a, b) => a.ordenAleatorio - b.ordenAleatorio);

            // 5. Seleccionar la meditación del día
            const med = meditacionesConOrden[indiceEnCiclo];

            tituloEl.textContent = med.titulo || 'Reflexión para hoy';
            textoEl.textContent = med.contenido || 'Sin contenido.';
            
            // Mostrar Metadata (Autor, Libro, Página)
            let tieneMeta = false;
            if (med.autor) {
                autorEl.textContent = med.autor;
                tieneMeta = true;
            } else { autorEl.textContent = ''; }

            if (med.libro) {
                libroEl.textContent = (med.autor ? ' — ' : '') + med.libro.trim();
                tieneMeta = true;
            } else { libroEl.textContent = ''; }

            if (med.pagina) {
                paginaEl.textContent = (med.libro || med.autor ? ', pág. ' : 'Pág. ') + med.pagina.toString().trim();
                tieneMeta = true;
            } else { paginaEl.textContent = ''; }

            metaEl.style.display = tieneMeta ? 'block' : 'none';

            // Mostrar Descripción (reemplaza al anterior contexto)
            if (med.descripcion || med.contexto) {
                descEl.textContent = med.descripcion || med.contexto;
                descEl.style.display = 'block';
            } else {
                descEl.style.display = 'none';
            }
        } else {
            tituloEl.textContent = 'Próximamente';
            textoEl.textContent = 'Estamos preparando nuevas meditaciones para ti.';
        }
    } catch (error) {
        console.error(error);
        tituloEl.textContent = 'Error de conexión';
    }
}
