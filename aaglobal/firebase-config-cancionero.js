// Importar Firebase desde CDN (v9, consistente con el resto)
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
  onSnapshot 
} from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

// 🔥 Datos firebase
const firebaseConfig = {
  apiKey: "AIzaSyB7US5r--cM82usyzLqd-ckamgIdyewfKE",
  authDomain: "pagina-gen.firebaseapp.com",
  projectId: "pagina-gen",
  storageBucket: "pagina-gen.appspot.com",
  messagingSenderId: "876893109130",
  appId: "1:876893109130:web:862f79fc7a609e512ee673",
};

// Inicializar Firebase (o usar la instancia existente si ya está inicializada)
// Esta parte se eliminará si firebase-config.js ya hace la inicialización global
// Si window.firebaseApp no está disponible (ej. en desarrollo o test), esta línea podría ser necesaria
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);


// Función para probar la conexión
// Módulo para Cancionero: probar conexión y suscribirse a cambios de canciones publicadas
export async function probarConexion() {
  try {
    // Ya no es necesario importar aquí, se usa la versión global/superior
    // const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');

    const database = await obtenerDb(); // obtenerDb ya no necesita getFirestore como parámetro
    // Probar una lectura simple
    await getDocs(collection(database, 'canciones'));
    return true;
  } catch (error) {
    console.error('❌ Probar conexión Firebase (cancionero):', error);
    return false;
  }
}

export const DatabaseService = {
  // Devuelve una función unsubscribe
  async onCancionesChange(callback) {
    // Ya no es necesario importar aquí, se usa la versión global/superior
    // const { getFirestore, collection, query, where, onSnapshot } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');

    const database = await obtenerDb(); // obtenerDb ya no necesita getFirestore como parámetro
    const q = query(collection(database, 'canciones'), where('estado', '==', 'publicado'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = [];
      snapshot.forEach((docSnap) => items.push({ id: docSnap.id, ...docSnap.data() }));
      try {
        callback(items);
      } catch (cbErr) {
        console.error('❌ Error en callback onCancionesChange:', cbErr);
      }
    }, (err) => {
      console.error('❌ Error en onSnapshot:', err);
    });

    return unsubscribe;
  }
};

// Obtiene la DB global si existe, o inicializa una nueva
async function obtenerDb() {
  if (window.firebaseDb) return window.firebaseDb;

  // Si window.firebaseDb no existe, se usa la inicialización global de este módulo (app/db)
  // o se espera que firebase-config.js ya haya inicializado y expuesto window.firebaseApp y window.firebaseDb
  // Si llega a este punto y NO hay window.firebaseApp, significa que firebase-config.js no se cargó primero
  // o no expone las variables globales como se espera.
  // Aquí simplemente devolvemos la 'db' que ya fue exportada al inicio del módulo
  return db;
}

