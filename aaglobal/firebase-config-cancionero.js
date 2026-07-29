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
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signInWithCredential, GoogleAuthProvider, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// 🔥 PEGA AQUÍ TU CONFIGURACIÓN REAL (reemplaza esto)
const firebaseConfig = {
  apiKey: "AIzaSyB7US5r--cM82usyzLqd-ckamgIdyewfKE",
  authDomain: "pagina-gen.firebaseapp.com",
  projectId: "pagina-gen",
  storageBucket: "pagina-gen.appspot.com",
  messagingSenderId: "876893109130",
  appId: "1:876893109130:web:862f79fc7a609e512ee673",
};

// Inicializar Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
const auth = getAuth(app);

window.firebaseDb = db;
window.firebaseAuth = auth;
window.firebaseUtils = {
  collection, getDocs, query, where, doc, getDoc, setDoc, deleteDoc, updateDoc, writeBatch, runTransaction,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signInWithCredential, GoogleAuthProvider, signOut, onAuthStateChanged
};

export const DatabaseService = {
  async getCancionPorId(cancionId) {
    const snapshot = await getDoc(doc(db, 'canciones', cancionId));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() };
  },

  async getCancionesLimitadas(cantidad = 15, categoria = 'todas') {
    const restrictions = [where('estado', '==', 'publicado')];
    if (categoria !== 'todas') restrictions.push(where('categoria', '==', categoria));
    restrictions.push(limit(cantidad));
    const snapshot = await getDocs(query(collection(db, 'canciones'), ...restrictions));
    return snapshot.docs.map((songDoc) => ({ id: songDoc.id, ...songDoc.data() }));
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
    if (activo) {
      await setDoc(likeRef, { usuarioId, creadoEn });
    } else {
      await deleteDoc(likeRef);
    }
    try {
      if (activo) {
        await setDoc(favoritoRef, { usuarioId, cancionId, creadoEn });
      } else {
        await deleteDoc(favoritoRef);
      }
    } catch (error) {
      // El favorito principal ya quedó guardado. Esta copia sólo acelera
      // la pantalla personal cuando sus reglas estén publicadas.
      console.warn('No se pudo sincronizar la lista rápida de favoritos:', error);
    }
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
    const canciones = await Promise.all(referencias.map(async ({ cancionId }) => {
      return this.getCancionPorId(cancionId);
    }));
    return canciones.filter((cancion) =>
      cancion && (!cancion.estado || cancion.estado === 'publicado' || cancion.estado === 'publicada')
    );
  },
  // Función para obtener canciones una sola vez (filtradas por estado: 'publicado')
  async getCanciones() {
    try {
      console.log('🔍 Obteniendo canciones públicas...');
      const q = query(collection(db, 'canciones'), where('estado', '==', 'publicado'));
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
      return {
        canciones: snapshot.docs.map((songDoc) => ({ id: songDoc.id, ...songDoc.data() })),
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
    const q = query(collection(db, 'canciones'), where('estado', '==', 'publicado'));
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
    try {
      const cancionRef = doc(db, 'canciones', cancionId);
      await updateDoc(cancionRef, {
        reproducciones: increment(1)
      });
      console.log('👁️ Reproducciones incrementadas para:', cancionId);
    } catch (error) {
      console.error('❌ Error incrementando reproducciones:', error);
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
