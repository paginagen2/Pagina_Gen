// Firebase Unificado (v9.22.2) para Cancionero y Gen Animadores
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  increment,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDoc
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

// 🔥 Configuración Firebase (la misma que ya tienes)
const firebaseConfig = {
  apiKey: "AIzaSyB7US5r--cM82usyzLqd-ckamgIdyewfKE",
  authDomain: "pagina-gen.firebaseapp.com",
  projectId: "pagina-gen",
  storageBucket: "pagina-gen.appspot.com", // Asegúrate de que coincida con tu bucket real
  messagingSenderId: "876893109130",
  appId: "1:876893109130:web:862f79fc7a609e512ee673",
  measurementId: "G-TCF3R6C846" // Si usas Analytics
};

let app;
let db;

// Inicializar Firebase una sola vez
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}
db = getFirestore(app);

// Exponer globalmente para facilitar el acceso en otros módulos/scripts
window.firebaseApp = app;
window.firebaseDb = db;

// Exportar funciones útiles para Firestore v9
export const firebaseUtils = {
  db, // La instancia de Firestore
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  increment,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDoc
};

// Función para probar la conexión (usada por cancionero)
export async function probarConexion() {
  try {
    await getDocs(collection(db, 'canciones'));
    console.log('✅ Conexión Firebase exitosa (pro.js).');
    return true;
  } catch (error) {
    console.error('❌ Error al probar conexión Firebase (pro.js):', error);
    return false;
  }
}

// Servicio de base de datos para Cancionero (ejemplo)
export const DatabaseService = {
  onCancionesChange(callback) {
    const q = query(collection(db, 'canciones'), where('estado', '==', 'publicado'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = [];
      snapshot.forEach((docSnap) => items.push({ id: docSnap.id, ...docSnap.data() }));
      try {
        callback(items);
      } catch (cbErr) {
        console.error('❌ Error en callback onCancionesChange (pro.js):', cbErr);
      }
    }, (err) => {
      console.error('❌ Error en onSnapshot (pro.js):', err);
    });
    return unsubscribe;
  },

  // Ejemplo de cómo agregar una canción (si el cancionero lo necesitara)
  addCancion: async (data) => {
    try {
      const docRef = await addDoc(collection(db, 'canciones'), { ...data, estado: 'pendiente' });
      console.log("Canción añadida con ID: ", docRef.id);
      return docRef.id;
    } catch (e) {
      console.error("Error añadiendo canción: ", e);
      throw e;
    }
  }
};

// Opcional: Proporcionar una capa de compatibilidad para el viejo estilo de v8 si es estrictamente necesario
// Esto es solo si tienes código muy antiguo que usa window.firebase.firestore().collection().get()
// Si ya has migrado o migrarás, puedes omitir esto.
window.firebase = {
  firestore: () => ({
    collection: (path) => ({
      get: async () => {
        const snapshot = await getDocs(collection(db, path));
        return {
          forEach: (callback) => {
            snapshot.forEach((docSnap) => {
              callback({
                id: docSnap.id,
                data: () => docSnap.data()
              });
            });
          }
        };
      },
      add: async (data) => {
        const docRef = await addDoc(collection(db, path), data);
        return { id: docRef.id };
      }
    }),
    doc: (path) => ({
      get: async () => {
        const docRef = doc(db, path);
        const docSnap = await getDoc(docRef);
        return {
          exists: docSnap.exists(),
          id: docSnap.id,
          data: () => docSnap.data()
        };
      }
    }),
    update: async (path, data) => {
        const docRef = doc(db, path);
        await updateDoc(docRef, data);
    }
  })
};

// Mensaje de depuración al iniciar
console.log('🎉 Firebase unificado (firebase-config-pro.js) inicializado y disponible globalmente.');