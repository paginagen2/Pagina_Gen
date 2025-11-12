import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js';
import {
    getFirestore,
    collection,
    getDocs,
    query,
    where,
    orderBy
} from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js';

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyB7US5r--cM82usyzLqd-ckamgIdyewfKE",
    authDomain: "pagina-gen.firebaseapp.com",
    projectId: "pagina-gen",
    storageBucket: "pagina-gen.appspot.com",
    messagingSenderId: "876893109130",
    appId: "1:876893109130:web:862f79fc7a609e512ee673"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Convierte fecha de formato DD/MM/YYYY a objeto Date
 */
function parseFecha(fechaStr) {
    if (!fechaStr) return null;
    
    // Formato DD/MM/YYYY
    const partes = fechaStr.split('/');
    if (partes.length === 3) {
        const dia = parseInt(partes[0], 10);
        const mes = parseInt(partes[1], 10) - 1; // Mes es 0-indexado
        const anio = parseInt(partes[2], 10);
        return new Date(anio, mes, dia);
    }
    return null;
}

/**
 * Obtiene la fecha de hoy en formato DD/MM/YYYY
 */
function obtenerFechaHoy() {
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const anio = hoy.getFullYear();
    return `${dia}/${mes}/${anio}`;
}

/**
 * Formatea fecha para mostrar (más legible)
 */
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

/**
 * Carga el pasapalabra del día de hoy
 */
export async function cargarPasapalabraDeHoy() {
    const tituloElement = document.getElementById('titulo-hoy');
    const fechaElement = document.getElementById('fecha-hoy');
    const reflexionElement = document.getElementById('reflexion-hoy');
    const contenedorElement = document.getElementById('contenedor-hoy');

    try {
        const fechaHoy = obtenerFechaHoy();
        
        // Consultar todos los pasapalabras con estado publicado
        const q = query(
            collection(db, 'pasapalabra'),
            where('estado', '==', 'publicado')
        );
        
        const querySnapshot = await getDocs(q);
        let pasapalabraEncontrado = null;

        // Buscar el pasapalabra que coincida con la fecha de hoy
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.fecha === fechaHoy) {
                pasapalabraEncontrado = data;
            }
        });

        if (pasapalabraEncontrado) {
            // Mostrar el pasapalabra encontrado
            tituloElement.textContent = pasapalabraEncontrado.titulo || 'Sin título';
            fechaElement.textContent = formatearFechaLegible(pasapalabraEncontrado.fecha);
            reflexionElement.textContent = pasapalabraEncontrado.reflexion || 'Sin contenido';
        } else {
            // No hay pasapalabra para hoy
            tituloElement.textContent = 'NO DISPONIBLE';
            fechaElement.textContent = formatearFechaLegible(fechaHoy);
            reflexionElement.textContent = 'El pasapalabra de hoy no se ha subido aún. Por favor, vuelve más tarde.';
            contenedorElement.style.borderLeftColor = '#ff6b6b';
        }
    } catch (error) {
        console.error('Error al cargar el pasapalabra de hoy:', error);
        tituloElement.textContent = 'ERROR';
        fechaElement.textContent = formatearFechaLegible(obtenerFechaHoy());
        reflexionElement.textContent = 'Hubo un error al cargar el pasapalabra de hoy. Por favor, intenta nuevamente más tarde.';
        contenedorElement.style.borderLeftColor = '#ff6b6b';
    }
}

/**
 * Carga todos los pasapalabras ordenados cronológicamente
 */
export async function cargarTodosPasapalabras() {
    const listaElement = document.getElementById('lista-pasapalabras');
    const loadingElement = document.getElementById('loading-message');

    try {
        // Consultar todos los pasapalabras publicados
        const q = query(
            collection(db, 'pasapalabra'),
            where('estado', '==', 'publicado')
        );
        
        const querySnapshot = await getDocs(q);
        const pasapalabras = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            pasapalabras.push({
                id: doc.id,
                ...data
            });
        });

        // Ocultar mensaje de carga
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }

        if (pasapalabras.length === 0) {
            listaElement.innerHTML = `
                <div class="mensaje-vacio">
                    <h3>No hay reflexiones disponibles</h3>
                    <p>Aún no se han publicado reflexiones. Vuelve pronto.</p>
                </div>
            `;
            return;
        }

        // Ordenar por fecha (más reciente primero)
        pasapalabras.sort((a, b) => {
            const fechaA = parseFecha(a.fecha);
            const fechaB = parseFecha(b.fecha);
            
            if (!fechaA || !fechaB) return 0;
            return fechaB - fechaA; // Orden descendente
        });

        // Renderizar todos los pasapalabras
        listaElement.innerHTML = '';
        
        pasapalabras.forEach(pasapalabra => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'pasapalabra_container_diario';
            
            itemDiv.innerHTML = `
                <h4>${pasapalabra.titulo || 'Sin título'}</h4>
                <p class="pasapalabra_contenido_diario">${pasapalabra.reflexion || 'Sin contenido'}</p>
                <h3 class="pasapalabra_fecha_diaria">${pasapalabra.fecha || 'Sin fecha'}</h3>
            `;
            
            listaElement.appendChild(itemDiv);
        });

    } catch (error) {
        console.error('Error al cargar los pasapalabras:', error);
        
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
        
        listaElement.innerHTML = `
            <div class="mensaje-vacio">
                <h3>Error al cargar las reflexiones</h3>
                <p>Hubo un problema al cargar las reflexiones. Por favor, intenta nuevamente más tarde.</p>
            </div>
        `;
    }
}