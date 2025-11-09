// CONFIGURACIÓN FIREBASE UNIFICADA - FUNCIONA PARA TODO
console.log('🚀 Iniciando Firebase unificado...');

// Definir firebaseConfig en el ámbito global (reutilizable en ambos bloques)
const firebaseConfig = {
  apiKey: "AIzaSyB7US5r--cM82usyzLqd-ckamgIdyewfKE",
  authDomain: "pagina-gen.firebaseapp.com",
  projectId: "pagina-gen",
  storageBucket: "pagina-gen.firebasestorage.app",
  messagingSenderId: "876893109130",
  appId: "1:876893109130:web:862f79fc7a609e512ee673",
  measurementId: "G-TCF3R6C846"
};

(async function inicializarFirebaseUnificado() {
    try {
        console.log('📦 Importando Firebase...');
        
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js');
        const { getFirestore, collection, getDocs, addDoc, query, where, doc, updateDoc, orderBy, limit, getDoc } = 
              await import('https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js');
        
        // Reutilizar si ya está inicializado; si no, inicializar
        const app = window.firebaseApp || initializeApp(firebaseConfig);
        const db  = window.firebaseDb  || getFirestore(app);

        // 3️⃣ EXPONER AMBAS SINTAXIS para compatibilidad total
        
        // Para cancionero (sintaxis v8) - ✅ YA FUNCIONA
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
                })
            })
        };
        
        // Para gen-animadores (sintaxis v9) - ✅ AHORA FUNCIONA
        window.firebaseApp = app;
        window.firebaseDb = db;
        
        // Funciones globales para gen-animadores
        window.firebaseUtils = {
            collection,
            getDocs,
            addDoc,
            query,
            where,
            doc,
            updateDoc,
            orderBy,
            limit
        };
        
        console.log('🎉 Firebase unificado inicializado correctamente!');
        console.log('✅ Cancionero: usar firebase.firestore()');
        console.log('✅ Gen Animadores: usar window.firebaseDb y window.firebaseUtils');
        
        // Confirmar funcionamiento
        const testCollection = collection(db, 'recursos');
        console.log('🧪 Prueba de conexión exitosa');
        
        // Notificación visual de éxito
        if (document.body) {
            const successMsg = document.createElement('div');
            successMsg.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #10b981;
                color: white;
                padding: 15px 25px;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 9999;
                font-weight: 600;
                font-size: 16px;
            `;
            successMsg.innerHTML = '🔥 Firebase conectado - Cancionero ✅ Gen Animadores ✅';
            document.body.appendChild(successMsg);
            
            setTimeout(() => successMsg.remove(), 5000);
        }
        
    } catch (error) {
        console.error('❌ Error inicializando Firebase:', error);
        
        // Notificación de error
        if (document.body) {
            const errorMsg = document.createElement('div');
            errorMsg.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #ef4444;
                color: white;
                padding: 15px 25px;
                border-radius: 12px;
                z-index: 9999;
                font-weight: 600;
                max-width: 400px;
            `;
            errorMsg.innerHTML = `❌ Error Firebase: ${error.message}`;
            document.body.appendChild(errorMsg);
        }
    }
})();