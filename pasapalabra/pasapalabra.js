const LOCAL_DATA_ROOT = '../datos/pasapalabra';
const REMOTE_DATA_ROOT = 'https://raw.githubusercontent.com/paginagen2/Pagina_Gen/main/datos/pasapalabra';

let paginaActual = 0;
let cargandoPagina = false;
let historialRespaldo = null;

function fechaArgentina() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

function formatearFechaLegible(fechaStr) {
    if (!fechaStr) return '';
    const [dia, mes, anio] = fechaStr.split('/').map(Number);
    if (!dia || !mes || !anio) return fechaStr;

    return new Date(anio, mes - 1, dia).toLocaleDateString('es-AR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function fechaFirestoreDesdeIso(fechaIso) {
    const [anio, mes, dia] = String(fechaIso).split('-');
    return dia && mes && anio ? `${dia}/${mes}/${anio}` : '';
}

async function cargarHoyDesdeFirestore(fechaIso) {
    if (window.firebaseReady) await window.firebaseReady;
    if (!window.firebaseDb || !window.firebaseUtils) {
        throw new Error('Firebase no está disponible');
    }

    const { collection, getDocs, query, where } = window.firebaseUtils;
    const snapshot = await getDocs(query(
        collection(window.firebaseDb, 'pasapalabra'),
        where('estado', '==', 'publicado'),
        where('fecha', '==', fechaFirestoreDesdeIso(fechaIso))
    ));
    const documento = snapshot.docs[0];
    return documento ? { id: documento.id, ...documento.data() } : null;
}

function valorFecha(fecha) {
    const [dia, mes, anio] = String(fecha || '').split('/').map(Number);
    return dia && mes && anio ? Date.UTC(anio, mes - 1, dia) : 0;
}

async function cargarPaginaDeRespaldo(numeroPagina) {
    if (!historialRespaldo) {
        if (window.firebaseReady) await window.firebaseReady;
        if (!window.firebaseDb || !window.firebaseUtils) {
            throw new Error('Firebase no está disponible');
        }

        const { collection, getDocs, query, where } = window.firebaseUtils;
        const snapshot = await getDocs(query(
            collection(window.firebaseDb, 'pasapalabra'),
            where('estado', '==', 'publicado')
        ));
        historialRespaldo = snapshot.docs
            .map(documento => ({ id: documento.id, ...documento.data() }))
            .sort((a, b) => valorFecha(b.fecha) - valorFecha(a.fecha)
                || String(b.id).localeCompare(String(a.id)));
    }

    const tamanioPagina = 6;
    const inicio = (numeroPagina - 1) * tamanioPagina;
    return {
        schemaVersion: 1,
        pagina: numeroPagina,
        siguientePagina: inicio + tamanioPagina < historialRespaldo.length ? numeroPagina + 1 : null,
        items: historialRespaldo.slice(inicio, inicio + tamanioPagina)
    };
}

async function cargarJson(ruta, cacheKey = '') {
    const suffix = cacheKey ? `?v=${encodeURIComponent(cacheKey)}` : '';
    const fuentes = [
        `${LOCAL_DATA_ROOT}/${ruta}${suffix}`,
        `${REMOTE_DATA_ROOT}/${ruta}${suffix}`
    ];

    let ultimoError;
    for (const fuente of fuentes) {
        try {
            const response = await fetch(fuente, { cache: 'no-store' });
            if (!response.ok) throw new Error(`respuesta ${response.status}`);
            const data = await response.json();
            if (data?.schemaVersion !== 1) throw new Error('formato no válido');
            return data;
        } catch (error) {
            ultimoError = error;
            console.warn(`No se pudo cargar ${fuente}:`, error);
        }
    }

    throw ultimoError || new Error('No se pudo cargar el archivo de Pasapalabra');
}

function mostrarEstadoVacio(listaElement, titulo, detalle) {
    listaElement.replaceChildren();
    const contenedor = document.createElement('div');
    contenedor.className = 'mensaje-vacio';
    const heading = document.createElement('h3');
    heading.textContent = titulo;
    const texto = document.createElement('p');
    texto.textContent = detalle;
    contenedor.append(heading, texto);
    listaElement.appendChild(contenedor);
}

function crearTarjeta(pasapalabra) {
    const item = document.createElement('article');
    item.className = 'pasapalabra_container_diario';

    const titulo = document.createElement('h4');
    titulo.textContent = pasapalabra.titulo || 'Sin título';
    const contenido = document.createElement('p');
    contenido.className = 'pasapalabra_contenido_diario';
    contenido.textContent = pasapalabra.reflexion || 'Sin contenido';
    const fecha = document.createElement('h3');
    fecha.className = 'pasapalabra_fecha_diaria';
    fecha.textContent = pasapalabra.fecha || 'Sin fecha';

    item.append(titulo, contenido, fecha);
    return item;
}

/**
 * Carga sólo el archivo estático del Pasapalabra de hoy.
 * No abre una conexión a Firestore ni descarga el historial.
 */
export async function cargarPasapalabraDeHoy() {
    const tituloElement = document.getElementById('titulo-hoy');
    const fechaElement = document.getElementById('fecha-hoy');
    const reflexionElement = document.getElementById('reflexion-hoy');
    const contenedorElement = document.getElementById('contenedor-hoy');
    const hoy = fechaArgentina();

    try {
        let pasapalabra;
        try {
            const data = await cargarJson('hoy.json', hoy);
            if (data.fecha === hoy) pasapalabra = data.pasapalabra;
        } catch (archivoError) {
            console.warn('El archivo diario aún no está disponible; se usará la consulta mínima de respaldo.', archivoError);
        }

        if (!pasapalabra) {
            pasapalabra = await cargarHoyDesdeFirestore(hoy);
        }

        if (!pasapalabra) {
            tituloElement.textContent = 'NO DISPONIBLE';
            fechaElement.textContent = new Date(`${hoy}T12:00:00`).toLocaleDateString('es-AR', {
                day: 'numeric', month: 'long', year: 'numeric'
            });
            reflexionElement.textContent = 'El pasapalabra de hoy no se ha subido aún. Por favor, vuelve más tarde.';
            contenedorElement.style.borderLeftColor = '#ff6b6b';
            return;
        }

        tituloElement.textContent = pasapalabra.titulo || 'Sin título';
        fechaElement.textContent = formatearFechaLegible(pasapalabra.fecha);
        reflexionElement.textContent = pasapalabra.reflexion || 'Sin contenido';
    } catch (error) {
        console.error('Error al cargar el Pasapalabra de hoy:', error);
        tituloElement.textContent = 'ERROR';
        fechaElement.textContent = '';
        reflexionElement.textContent = 'No se pudo cargar el Pasapalabra de hoy. Por favor, intenta nuevamente más tarde.';
        contenedorElement.style.borderLeftColor = '#ff6b6b';
    }
}

async function cargarSiguientePagina() {
    if (cargandoPagina) return;

    const listaElement = document.getElementById('lista-pasapalabras');
    const boton = document.getElementById('btn-ver-mas');
    const loadingElement = document.getElementById('loading-message');
    const siguientePagina = paginaActual + 1;
    cargandoPagina = true;
    boton.disabled = true;
    boton.textContent = 'Cargando...';

    try {
        let data;
        try {
            data = await cargarJson(`paginas/${siguientePagina}.json`);
        } catch (archivoError) {
            console.warn('El historial paginado aún no está disponible; se usará una única consulta de respaldo.', archivoError);
            data = await cargarPaginaDeRespaldo(siguientePagina);
        }
        if (siguientePagina === 1) listaElement.replaceChildren();

        const fragmento = document.createDocumentFragment();
        (data.items || []).forEach(item => fragmento.appendChild(crearTarjeta(item)));
        listaElement.appendChild(fragmento);
        paginaActual = siguientePagina;

        const hayMas = Boolean(data.siguientePagina);
        boton.hidden = !hayMas;
        boton.disabled = false;
        boton.textContent = 'Ver más';

        if (paginaActual === 1 && !data.items?.length) {
            mostrarEstadoVacio(listaElement, 'No hay reflexiones disponibles', 'Aún no se han publicado reflexiones. Vuelve pronto.');
        }
    } catch (error) {
        console.error(`Error al cargar la página ${siguientePagina} de Pasapalabra:`, error);
        if (paginaActual === 0) {
            mostrarEstadoVacio(listaElement, 'Error al cargar las reflexiones', 'Hubo un problema al cargar las reflexiones. Por favor, intenta nuevamente más tarde.');
        }
        boton.hidden = false;
        boton.disabled = false;
        boton.textContent = paginaActual ? 'Reintentar' : 'Intentar nuevamente';
    } finally {
        cargandoPagina = false;
        if (loadingElement) loadingElement.hidden = true;
    }
}

/**
 * Carga el primer lote del archivo histórico. Los demás lotes se descargan
 * únicamente cuando la persona pulsa "Ver más".
 */
export async function cargarTodosPasapalabras() {
    const boton = document.getElementById('btn-ver-mas');
    if (!boton || boton.dataset.configurado === 'true') return;

    boton.dataset.configurado = 'true';
    boton.addEventListener('click', cargarSiguientePagina);
    await cargarSiguientePagina();
}
