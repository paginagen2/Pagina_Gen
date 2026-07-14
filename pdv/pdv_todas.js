/**
 * PDV Todas - Lista historial de Palabras de Vida desde Firebase
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Esperar a que Firebase esté listo
    if (!window.firebaseDb) {
        console.log('⏳ Esperando a Firebase...');
        const checkFirebase = setInterval(() => {
            if (window.firebaseDb) {
                clearInterval(checkFirebase);
                cargarHistorialPdv();
            }
        }, 100);
    } else {
        cargarHistorialPdv();
    }
});

async function cargarHistorialPdv() {
    const container = document.getElementById('pdv-lista-container');
    if (!container) return;

    try {
        const db = window.firebaseDb;
        const { collection, query, orderBy, getDocs } = window.firebaseUtils;

        const pdvRef = collection(db, 'pdv'); // Colección se llama 'pdv', no 'palabrasDeVida'
        const q = query(pdvRef, orderBy('fecha', 'desc'));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = '<div style="text-align: center; color: white; width: 100%; padding: 2rem;"><p>No hay Palabras de Vida registradas aún.</p></div>';
            return;
        }

        container.innerHTML = ''; // Limpiar cargando

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = data.urlSlug || docSnap.id;
            
            const item = document.createElement('a');
            item.href = `pdv.html?id=${id}`;
            item.className = 'palabra-nav-link';
            item.innerHTML = `
                <div class="palabra-nav-item">
                    <div class="nav-mes">${data.mes || 'Sin fecha'}</div>
                    <div class="nav-titulo">${data.titulo || 'Sin título'}</div>
                </div>
            `;
            container.appendChild(item);
        });

        addNavigationEffects();

    } catch (error) {
        console.error('Error al cargar historial de Palabras de Vida:', error);
        container.innerHTML = '<div style="text-align: center; color: white; width: 100%; padding: 2rem;"><p>Error al cargar el historial.</p></div>';
    }
}

function addNavigationEffects() {
    document.querySelectorAll('.palabra-nav-item').forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateX(12px) scale(1.02)';
            this.style.transition = 'all 0.3s ease';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateX(0) scale(1)';
        });
    });
}
