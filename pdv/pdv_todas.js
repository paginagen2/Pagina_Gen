const archiveContainer = document.getElementById('pdv-lista-container');

async function waitForArchiveFirebase(timeout = 12000) {
  if (window.firebaseReady) await Promise.race([
    window.firebaseReady,
    new Promise((_, reject) => setTimeout(() => reject(new Error('La conexión tardó demasiado.')), timeout))
  ]);
  if (!window.firebaseDb || !window.firebaseUtils) throw new Error('Firebase no está disponible.');
}

function showArchiveState(title, message, retry = false) {
  archiveContainer.innerHTML = `
    <div class="pdv-archive-state">
      <h2>${window.PdvModel.escapeHtml(title)}</h2>
      <p>${window.PdvModel.escapeHtml(message)}</p>
      ${retry ? '<button type="button" data-archive-retry>Intentar de nuevo</button>' : ''}
    </div>`;
  archiveContainer.querySelector('[data-archive-retry]')?.addEventListener('click', loadArchive);
}

async function loadArchive() {
  archiveContainer.innerHTML = '<div class="pdv-loading" role="status"><span></span><p>Cargando publicaciones…</p></div>';
  try {
    await waitForArchiveFirebase();
    const { collection, query, where, orderBy, getDocs } = window.firebaseUtils;
    const reference = collection(window.firebaseDb, 'pdv');
    const now = new Date();
    const [publishedSnapshot, scheduledSnapshot] = await Promise.all([
      getDocs(query(reference,
        where('estado', '==', 'publicado'),
        where('fechaPublicacion', '<=', now),
        orderBy('fechaPublicacion', 'desc'))),
      getDocs(query(reference,
        where('estado', '==', 'programado'),
        where('fechaPublicacion', '<=', now),
        orderBy('fechaPublicacion', 'desc')))
    ]);
    const items = [...publishedSnapshot.docs, ...scheduledSnapshot.docs]
      .map(documentSnapshot => ({ id: documentSnapshot.id, ...documentSnapshot.data() }))
      .filter(item => item.version === 2)
      .filter(item => window.PdvModel.isAvailable(item, now))
      .map(item => window.PdvModel.normalizePdv(item))
      .sort((a, b) => String(b.periodo || '').localeCompare(String(a.periodo || '')));
    if (!items.length) {
      showArchiveState('El archivo está listo', 'Las nuevas Palabras de Vida publicadas van a aparecer acá.');
      return;
    }
    archiveContainer.innerHTML = items.map((item, index) => `
      <a class="pdv-archive-card${index === 0 ? ' is-latest' : ''}" href="pdv.html?id=${encodeURIComponent(item.id)}">
        <div>
          <span class="pdv-archive-month">${window.PdvModel.escapeHtml(item.mes || 'Sin fecha')}</span>
          ${index === 0 ? '<span class="pdv-latest-label">MÁS RECIENTE</span>' : ''}
        </div>
        <blockquote>«${window.PdvModel.escapeHtml(item.citaPrincipal || 'Leer la Palabra de Vida')}»</blockquote>
        <div class="pdv-archive-footer">
          <span>${window.PdvModel.escapeHtml(item.citaReferencia || '')}</span>
          <strong>Leer <span aria-hidden="true">→</span></strong>
        </div>
      </a>`).join('');
  } catch (error) {
    console.error('Error al cargar el archivo:', error);
    showArchiveState('No pudimos cargar el archivo', 'Revisá tu conexión e intentá nuevamente.', true);
  }
}

document.addEventListener('DOMContentLoaded', loadArchive);
