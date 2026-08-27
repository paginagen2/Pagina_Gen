// firebase-config-cancionero.js

import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getFirestore, 
  collection, 
  collectionGroup,
  getDocs, 
  getDoc,
  deleteDoc,
  addDoc, 
  setDoc,
  doc, 
  documentId,
  updateDoc, 
  writeBatch,
  increment, 
  query, 
  where, 
  orderBy, 
  limit,
  startAfter,
  onSnapshot,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, signInWithPopup, signInWithCredential, GoogleAuthProvider, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// 🔥 PEGA AQUÍ TU CONFIGURACIÓN REAL (reemplaza esto)
const firebaseConfig = window.firebaseConfigWeb || {
  apiKey: "AIzaSyB7US5r--cM82usyzLqd-ckamgIdyewfKE",
  authDomain: "pagina-gen.firebaseapp.com",
  projectId: "pagina-gen",
  storageBucket: "pagina-gen.firebasestorage.app",
  messagingSenderId: "876893109130",
  appId: "1:876893109130:web:862f79fc7a609e512ee673",
};

// Inicializar Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
const auth = getAuth(app);
const PUBLIC_SONG_QUERY_LIMIT = 200;

window.firebaseDb = db;
window.firebaseAuth = auth;
window.firebaseUtils = {
  collection, collectionGroup, getDocs, query, where, doc, getDoc, setDoc, deleteDoc, updateDoc, writeBatch, runTransaction,
  documentId, increment, orderBy, limit, startAfter, onSnapshot,
  signInWithPopup, signInWithCredential, GoogleAuthProvider, signOut, onAuthStateChanged
};

window.firebaseConfigWeb = firebaseConfig;

export const DatabaseService = {
  async getCancionPorId(cancionId) {
    const offline = await esperarModoSinConexion();
    const guardada = await ejecutarOfflineSeguro(offline, 'getItem', 'canciones', cancionId);
    const guardadaVigente = typeof offline?.isFresh === 'function' && offline.isFresh(guardada);
    if (guardada?.item && (!navigator.onLine || guardadaVigente)) return guardada.item;
    try {
      const snapshot = await getDoc(doc(db, 'canciones', cancionId));
      if (!snapshot.exists()) {
        await ejecutarOfflineSeguro(offline, 'deleteItem', 'canciones', cancionId);
        return cargarCancionEstatica(cancionId);
      }
      const cancion = { id: snapshot.id, ...snapshot.data() };
      await ejecutarOfflineSeguro(offline, 'upsertItem', 'canciones', cancion);
      return cancion;
    } catch (error) {
      if (guardada?.item) return guardada.item;
      const estatica = await cargarCancionEstatica(cancionId);
      if (estatica) return estatica;
      throw error;
    }
  },

  async getCancionesLimitadas(cantidad = 15, categoria = 'todas') {
    const restrictions = [where('estado', '==', 'publicado')];
    if (categoria !== 'todas') restrictions.push(where('categoria', '==', categoria));
    restrictions.push(orderBy('fechaCreacion', 'desc'));
    restrictions.push(limit(cantidad));
    try {
      const snapshot = await getDocs(query(collection(db, 'canciones'), ...restrictions));
      return snapshot.docs.map((songDoc) => ({ id: songDoc.id, ...songDoc.data() }));
    } catch (error) {
      // Mientras el índice compuesto nuevo termina de publicarse, los IDs que
      // genera Admin también permiten recuperar primero las cargas recientes.
      console.warn('Se usa el orden reciente de respaldo para el cancionero:', error);
      const fallbackSnapshot = await getDocs(query(
        collection(db, 'canciones'),
        where('estado', '==', 'publicado'),
        orderBy(documentId(), 'desc'),
        limit(Math.max(cantidad * 3, 30))
      ));
      return fallbackSnapshot.docs
        .map((songDoc) => ({ id: songDoc.id, ...songDoc.data() }))
        .filter((song) => categoria === 'todas' || song.categoria === categoria)
        .slice(0, cantidad);
    }
  },

  async getEstadoLike(cancionId, usuarioId) {
    if (!cancionId || !usuarioId) return false;
    const likeSnapshot = await getDoc(doc(db, 'canciones', cancionId, 'likes', usuarioId));
    return likeSnapshot.exists();
  },

  async getEstadoFavorito(cancionId, usuarioId) {
    return this.getEstadoLike(cancionId, usuarioId);
  },

  async setLikeCancion(cancionId, usuarioId, activo) {
    if (!cancionId || !usuarioId) throw new Error('Faltan datos para guardar el like.');
    const likeRef = doc(db, 'canciones', cancionId, 'likes', usuarioId);
    const favoritoRef = doc(db, 'usuarios', usuarioId, 'favoritos', cancionId);
    const creadoEn = new Date().toISOString();
    const batch = writeBatch(db);
    if (activo) {
      batch.set(likeRef, { usuarioId, creadoEn });
      batch.set(favoritoRef, { usuarioId, cancionId, creadoEn });
    } else {
      batch.delete(likeRef);
      batch.delete(favoritoRef);
    }
    // Ambas representaciones cambian juntas: el corazón de la canción y la
    // lista rápida del perfil nunca pueden quedar con estados diferentes.
    await batch.commit();
    return activo;
  },

  async setFavoritoCancion(cancionId, usuarioId, activo) {
    return this.setLikeCancion(cancionId, usuarioId, activo);
  },

  async getFavoritosUsuario(usuarioId) {
    if (!usuarioId) return [];
    let referencias = [];
    let necesitaRespaldo = false;
    try {
      const favoritosSnapshot = await getDocs(query(
        collection(db, 'usuarios', usuarioId, 'favoritos'),
        orderBy('creadoEn', 'desc')
      ));
      referencias = favoritosSnapshot.docs.map((favoritoDoc) => ({
        cancionId: favoritoDoc.data().cancionId || favoritoDoc.id,
        creadoEn: favoritoDoc.data().creadoEn || ''
      }));
    } catch (error) {
      necesitaRespaldo = true;
      console.warn('La lista rápida de favoritos todavía no está disponible:', error);
    }
    if (referencias.length === 0) {
      try {
        const anterioresSnapshot = await getDocs(query(
          collectionGroup(db, 'likes'),
          where('usuarioId', '==', usuarioId)
        ));
        referencias = anterioresSnapshot.docs.map((likeDoc) => ({
          cancionId: likeDoc.ref.parent.parent?.id || '',
          creadoEn: likeDoc.data().creadoEn || ''
        }));
      } catch (error) {
        necesitaRespaldo = true;
        console.warn('No se pudieron recuperar favoritos anteriores:', error);
      }
    }
    if (referencias.length === 0 && necesitaRespaldo) {
      const response = await fetch(new URL('../datos/cancionero/buscar.json', import.meta.url));
      if (!response.ok) throw new Error('No se pudo abrir el índice del cancionero.');
      const indice = await response.json();
      const canciones = Array.isArray(indice.canciones) ? indice.canciones : [];
      const estados = await Promise.all(canciones.map((cancion) =>
        this.getEstadoLike(cancion.id, usuarioId).catch(() => false)
      ));
      return canciones.filter((_, index) => estados[index]);
    }
    referencias.sort((a, b) => String(b.creadoEn).localeCompare(String(a.creadoEn)));

    // El índice público ya contiene lo necesario para dibujar las tarjetas.
    // Así, abrir Favoritos cuesta una sola lectura de la subcolección personal
    // y una descarga estática cacheable, no una lectura Firestore por canción.
    const indice = await cargarIndiceCancionero().catch((error) => {
      console.warn('No se pudo usar el índice estático para favoritos:', error);
      return [];
    });
    const porId = new Map(indice.map((cancion) => [String(cancion.id), cancion]));
    const faltantes = referencias.filter(({ cancionId }) => !porId.has(String(cancionId)));
    if (faltantes.length) {
      const recuperadas = await Promise.all(faltantes.map(({ cancionId }) =>
        this.getCancionPorId(cancionId).catch(() => null)
      ));
      recuperadas.forEach((cancion) => {
        if (cancion?.id) porId.set(String(cancion.id), cancion);
      });
    }
    const canciones = referencias.map(({ cancionId }) => porId.get(String(cancionId)) || null);
    return canciones.filter((cancion) =>
      cancion && (!cancion.estado || cancion.estado === 'publicado' || cancion.estado === 'publicada')
    );
  },
  // Función para obtener canciones una sola vez (filtradas por estado: 'publicado')
  async getCanciones() {
    try {
      console.log('🔍 Obteniendo canciones públicas...');
      const q = query(
        collection(db, 'canciones'),
        where('estado', '==', 'publicado'),
        orderBy('fechaCreacion', 'desc'),
        limit(PUBLIC_SONG_QUERY_LIMIT)
      );
      const snapshot = await getDocs(q);
      const canciones = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fechaCreacion: doc.data().fechaCreacion?.toDate() || new Date()
      }));
      console.log('✅ Canciones públicas obtenidas:', canciones.length);
      return canciones;
    } catch (error) {
      console.error('❌ Error obteniendo canciones públicas:', error);
      throw error;
    }
  },

  // Obtener únicamente las canciones de un artista, en páginas de 15.
  async getCancionesPorArtista(nombreArtista, ultimaCancion = null, cantidad = 15) {
    try {
      const restricciones = [
        where('estado', '==', 'publicado'),
        where('artista', '==', nombreArtista),
        limit(cantidad)
      ];
      if (ultimaCancion) restricciones.splice(2, 0, startAfter(ultimaCancion));

      const snapshot = await getDocs(query(collection(db, 'canciones'), ...restricciones));
      const cancionesFirebase = snapshot.docs.map((songDoc) => ({ id: songDoc.id, ...songDoc.data() }));
      const extras = ultimaCancion ? [] : await cargarResumenesExtra();
      return {
        canciones: [...cancionesFirebase, ...extras.filter((song) =>
          song.artista === nombreArtista &&
          !cancionesFirebase.some((item) => String(item.id) === String(song.id))
        )],
        ultimaCancion: snapshot.docs.at(-1) || null,
        hayMas: snapshot.size === cantidad
      };
    } catch (error) {
      console.error('❌ Error obteniendo canciones del artista:', error);
      throw error;
    }
  },

  // Función para escuchar cambios en tiempo real (filtradas por estado: 'publicado')
  onCancionesChange(callback) {
    console.log('🔄 Configurando listener en tiempo real para canciones públicas...');
    const q = query(
      collection(db, 'canciones'),
      where('estado', '==', 'publicado'),
      orderBy('fechaCreacion', 'desc'),
      limit(PUBLIC_SONG_QUERY_LIMIT)
    );
    return onSnapshot(q, (snapshot) => {
      const canciones = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fechaCreacion: doc.data().fechaCreacion?.toDate() || new Date()
      }));
      console.log('🔄 Canciones públicas actualizadas en tiempo real:', canciones.length);
      callback(canciones);
    }, (error) => {
      console.error('❌ Error en listener de canciones públicas:', error);
    });
  },

  // Agregar nueva canción
  async agregarCancion(cancion) {
    try {
      console.log('➕ Agregando canción:', cancion.titulo);
      const docRef = await addDoc(collection(db, 'canciones'), {
        ...cancion,
        reproducciones: 0,
        fechaCreacion: new Date(),
        estado: "pendiente", // Estado inicial: pendiente, publico, rechazado, eliminado
        usuarioId: cancion.usuarioId || "anonimo", // ID del usuario que la creó
        activa: true
      });
      console.log('✅ Canción agregada con ID:', docRef.id);
      return docRef.id;
    } catch (error) {
      console.error('❌ Error agregando canción:', error);
      throw error;
    }
  },

  // Incrementar reproducciones
  async incrementarReproducciones(cancionId) {
    if (!navigator.onLine || !auth.currentUser) return false;
    try {
      const cancionRef = doc(db, 'canciones', cancionId);
      await updateDoc(cancionRef, {
        reproducciones: increment(1)
      });
      console.log('👁️ Reproducciones incrementadas para:', cancionId);
      return true;
    } catch (error) {
      console.error('❌ Error incrementando reproducciones:', error);
      return false;
    }
  },

  // Agregar datos iniciales (solo para testing)
  async agregarDatosIniciales() {
    try {
      const cancionesIniciales = [
        {
          titulo: "Alabaré",
          artista: "Tradicional",
          categoria: "misa",
          letra: `[C]Alabaré, alabaré
[G]Alabaré a mi Señor
[Am]Todos unidos [F]alegres
[C]Alabemos al Se[G]ñor

[C]Juan vio el número
[G]De los redimidos
[Am]Y todos [F]alababan
[C]Al Señor con [G]gozo

[C]Unos oraban, [G]otros cantaban
[Am]Unos gritaban [F]otros lloraban
[C]Pero todos [G]alababan
[C]Al Señor`
        },
        {
          titulo: "Que todos sean uno",
          artista: "Gen",
          categoria: "gen",
          letra: `[E]Que todos sean uno
[B]Como tú Padre en mí
[C#m]Y yo en ti [A]también
[E]Que ellos sean [B]uno en [E]nos

[A]Esta es la oración
[E]Que Jesús elevó al Padre
[B]Por toda la humani[E]dad
[A]Y es el ideal
[E]Que nos mueve cada día
[B]A construir frater[E]nidad`
        },
        {
          titulo: "Fogón de hermanos",
          artista: "Tradicional",
          categoria: "fogon",
          letra: `[A]Este fogón está encendido
[E]Con el calor de la amistad
[D]Cada llama es un la[A]tido
[E]De nuestro corazón de [A]paz

[A]Cantemos juntos esta noche
[E]Bajo las estrellas del lugar
[D]Que nuestras voces se des[A]borden
[E]En canciones del ho[A]gar`
        }
      ];

      for (const cancion of cancionesIniciales) {
        await this.agregarCancion(cancion);
      }
      
      console.log('✅ Datos iniciales agregados correctamente');
      return true;
    } catch (error) {
      console.error('❌ Error agregando datos iniciales:', error);
      throw error;
    }
  }
};

async function esperarModoSinConexion() {
  if (window.GenOffline) return window.GenOffline;
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve(window.GenOffline || null), 2000);
    window.addEventListener('gen:offline-ready', () => {
      clearTimeout(timeout);
      resolve(window.GenOffline);
    }, { once: true });
  });
}

async function ejecutarOfflineSeguro(offline, metodo, ...args) {
  if (typeof offline?.[metodo] !== 'function') return null;
  try {
    return await offline[metodo](...args);
  } catch {
    return null;
  }
}

let snapshotCancionesPromise = null;
let indiceCancioneroPromise = null;

async function cargarIndiceCancionero() {
  indiceCancioneroPromise ||= fetch(
    new URL('../datos/cancionero/buscar.json', import.meta.url),
    { cache: 'default' }
  ).then(async (response) => {
    if (!response.ok) throw new Error('No se pudo abrir el índice del cancionero.');
    const data = await response.json();
    return Array.isArray(data.canciones) ? data.canciones : [];
  }).catch((error) => {
    indiceCancioneroPromise = null;
    throw error;
  });
  return indiceCancioneroPromise;
}

async function cargarCancionEstatica(cancionId) {
  try {
    snapshotCancionesPromise ||= fetch(
      new URL('../datos/sincronizacion/canciones.json', import.meta.url),
      { cache: 'no-cache' }
    ).then(async (response) => {
      if (!response.ok) throw new Error('No se pudo abrir el respaldo del cancionero.');
      const data = await response.json();
      return Array.isArray(data.items) ? data.items : [];
    }).catch((error) => {
      snapshotCancionesPromise = null;
      throw error;
    });

    const canciones = await snapshotCancionesPromise;
    const cancion = canciones.find((item) => String(item.id) === String(cancionId));
    return cancion ? { ...cancion, origen: 'estatico' } : null;
  } catch {
    return null;
  }
}

async function cargarResumenesExtra() {
  try {
    const response = await fetch(new URL('../datos/cancionero/extras.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.canciones) ? data.canciones : [];
  } catch {
    return [];
  }
}

// Función para probar la conexión
export async function probarConexion() {
  try {
    console.log('🧪 Probando conexión a Firebase...');
    const canciones = await DatabaseService.getCanciones();
    console.log('✅ Conexión exitosa. Canciones:', canciones.length);
    return true;
  } catch (error) {
    console.error('❌ Error de conexión:', error);
    return false;
  }
}
