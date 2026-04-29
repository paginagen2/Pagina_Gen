// Detección segura de Capacitor: funciona tanto en el browser como en la app nativa (Android/iOS).
// En la web, window.Capacitor no existe, así que usamos un fallback que siempre devuelve false.
const Capacitor = window.Capacitor ?? { isNativePlatform: () => false };

// Importar db y utilidades de Firebase (se asume que firebase-config.js ya las expone globalmente)
// Si no estuvieran globalmente, tendríamos que importarlas directamente aquí.
const db = window.firebaseDb; // La instancia de Firestore
const { collection, getDocs, query, orderBy } = window.firebaseUtils ?? {}; // Funciones necesarias de Firebase v9

const OFFLINE_STORAGE_PREFIX = "offline_data_";
const LAST_DOWNLOAD_PREFIX = "last_download_";

// Función para detectar si la aplicación se está ejecutando en una plataforma nativa (iOS/Android)
export function isNativePlatform() {
    return Capacitor.isNativePlatform();
}

/**
 * Descarga una categoría de datos (ej. canciones) desde Firebase y la guarda localmente.
 * @param {string} category - El nombre de la colección en Firebase (ej. "canciones", "meditaciones").
 * @returns {Promise<boolean>} True si la descarga fue exitosa, false en caso contrario.
 */
export async function downloadCategoryData(category) {
    if (!isNativePlatform()) {
        console.warn(`[Offline Mode] No estamos en una aplicación nativa. No se puede descargar ${category}.`);
        return false;
    }

    if (!db || !collection || !getDocs) {
        console.error("[Offline Mode] Firebase no está inicializado o faltan utilidades.");
        return false;
    }

    try {
        console.log(`[Offline Mode] Iniciando descarga de ${category} desde Firebase...`);
        const q = query(collection(db, category), orderBy("titulo")); // Asumiendo que hay un campo 'titulo' para ordenar
        const querySnapshot = await getDocs(q);
        const data = [];
        querySnapshot.forEach((doc) => {
            data.push({ id: doc.id, ...doc.data() });
        });

        localStorage.setItem(OFFLINE_STORAGE_PREFIX + category, JSON.stringify(data));
        localStorage.setItem(LAST_DOWNLOAD_PREFIX + category, new Date().toISOString());

        console.log(`[Offline Mode] ${category} descargado y guardado localmente (${data.length} ítems).`);
        return true;
    } catch (error) {
        console.error(`[Offline Mode] Error al descargar ${category}:`, error);
        return false;
    }
}

/**
 * Obtiene datos de una categoría desde el almacenamiento local.
 * @param {string} category - El nombre de la categoría.
 * @returns {Array | null} Los datos guardados localmente o null si no existen.
 */
export function getOfflineData(category) {
    if (!isNativePlatform()) {
        // En la web, siempre intentamos buscar online primero, pero si se pide offline, lo damos
        console.warn("[Offline Mode] No estamos en una aplicación nativa, pero se solicitó datos offline.");
    }
    const data = localStorage.getItem(OFFLINE_STORAGE_PREFIX + category);
    return data ? JSON.parse(data) : null;
}

/**
 * Verifica si hay datos offline para una categoría y cuándo fue la última descarga.
 * @param {string} category - El nombre de la categoría.
 * @returns {string | null} La fecha de la última descarga en formato ISO o null si no hay datos.
 */
export function getLastDownloadTime(category) {
    if (!isNativePlatform()) {
        return null;
    }
    return localStorage.getItem(LAST_DOWNLOAD_PREFIX + category);
}

/**
 * Busca actualizaciones para una categoría (solo un esqueleto por ahora).
 * La lógica de comparación avanzada iría aquí, por ejemplo, usando un campo 'timestamp' en Firebase.
 * @param {string} category - El nombre de la colección en Firebase.
 * @returns {Promise<boolean>} True si hubo actualizaciones y se descargaron, false si no o hubo error.
 */
export async function checkAndUpdateData(category) {
    if (!isNativePlatform()) {
        console.warn("[Offline Mode] No estamos en una aplicación nativa. No se puede buscar actualizaciones.");
        return false;
    }
    console.log(`[Offline Mode] Buscando actualizaciones para ${category}... (Lógica a implementar con timestamps de Firebase)`);
    // Aquí, idealmente, compararías un timestamp local con uno de Firebase
    // Si Firebase tiene datos más nuevos, llamarías a downloadCategoryData(category)
    return false; // Por ahora, devuelve false.
}

// ===============================================
// Funciones de descarga específicas por categoría
// ===============================================

export async function downloadSongs() {
    return downloadCategoryData("canciones");
}

// Funciones para gestionar el modo offline global
const OFFLINE_MODE_ACTIVE_KEY = "offlineModeActive";

export function activateOfflineMode(isActive) {
    if (!isNativePlatform()) {
        console.warn("[Offline Mode] No estamos en una aplicación nativa. No se puede activar/desactivar el modo offline global.");
        return;
    }
    localStorage.setItem(OFFLINE_MODE_ACTIVE_KEY, isActive.toString());
    console.log(`[Offline Mode] Modo offline global: ${isActive ? 'Activado' : 'Desactivado'}`);
}

export function isOfflineModeActive() {
    if (!isNativePlatform()) {
        return false; // El modo offline global solo aplica en la app nativa
    }
    return localStorage.getItem(OFFLINE_MODE_ACTIVE_KEY) === 'true';
}

// También podríamos tener:
// export async function downloadMeditaciones() {
//     return downloadCategoryData("meditaciones");
// }
// export async function downloadLibros() {
//     return downloadCategoryData("libros");
// }