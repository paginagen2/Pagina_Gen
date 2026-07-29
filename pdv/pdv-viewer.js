const pdvContainer = document.getElementById('pdv-container');

async function waitForFirebase(timeout = 12000) {
  if (window.firebaseReady) await Promise.race([
    window.firebaseReady,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase tardó demasiado.')), timeout))
  ]);
  if (!window.firebaseDb || !window.firebaseUtils) throw new Error('Firebase no está disponible.');
}

function errorCard(message) {
  pdvContainer.innerHTML = `
    <section class="pdv-state-card" role="alert">
      <p class="pdv-kicker">PALABRA DE VIDA</p>
      <h1>No pudimos abrir esta publicación</h1>
      <p>${window.PdvModel.escapeHtml(message)}</p>
      <div class="pdv-state-actions">
        <button type="button" data-pdv-retry>Intentar de nuevo</button>
        <a href="pdv_todas.html">Ver el archivo</a>
      </div>
    </section>`;
  pdvContainer.querySelector('[data-pdv-retry]')?.addEventListener('click', loadPdv);
}

function updateMetadata(data) {
  const title = `Palabra de Vida · ${data.mes} | Gen 2`;
  const description = `«${data.citaPrincipal}» (${data.citaReferencia})`;
  document.title = title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
  document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
  document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description);
}

async function sharePdv(data, button) {
  const shareData = {
    title: `Palabra de Vida · ${data.mes}`,
    text: `«${data.citaPrincipal}» (${data.citaReferencia})`,
    url: window.location.href
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(window.location.href);
      const original = button.textContent;
      button.textContent = 'Enlace copiado';
      setTimeout(() => { button.textContent = original; }, 1800);
    }
  } catch (error) {
    if (error.name !== 'AbortError') button.textContent = 'No se pudo compartir';
  }
}

function wireReader(data) {
  const shareButton = pdvContainer.querySelector('[data-pdv-share]');
  shareButton?.addEventListener('click', () => sharePdv(data, shareButton));
  const audio = pdvContainer.querySelector('audio');
  if (!audio) return;
  const section = audio.closest('.pdv-audio');
  const source = audio.querySelector('source');
  section.hidden = true;
  const showAudio = () => { section.hidden = false; };
  const discardAudio = () => { section.remove(); };
  audio.addEventListener('loadedmetadata', showAudio, { once: true });
  audio.addEventListener('canplay', showAudio, { once: true });
  audio.addEventListener('error', discardAudio, { once: true });
  source?.addEventListener('error', discardAudio, { once: true });
  if (audio.readyState >= 1) showAudio();
  if (audio.error) discardAudio();
}

async function loadPdv() {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) {
    errorCard('El enlace no indica qué Palabra de Vida querés leer.');
    return;
  }
  pdvContainer.innerHTML = '<div class="pdv-loading" role="status"><span></span><p>Cargando Palabra de Vida…</p></div>';
  try {
    await waitForFirebase();
    const { doc, getDoc } = window.firebaseUtils;
    const snapshot = await getDoc(doc(window.firebaseDb, 'pdv', id));
    if (!snapshot.exists()) throw new Error('La publicación no existe o todavía no está publicada.');
    const raw = { id: snapshot.id, ...snapshot.data() };
    if (raw.version !== 2 || raw.estado !== 'publicado') {
      throw new Error('La publicación no existe o todavía no está publicada.');
    }
    const data = window.PdvModel.normalizePdv(raw);
    pdvContainer.innerHTML = window.PdvModel.renderArticle(data);
    updateMetadata(data);
    wireReader(data);
  } catch (error) {
    console.error('Error al cargar la Palabra de Vida:', error);
    errorCard(error.message || 'Ocurrió un error inesperado.');
  }
}

document.addEventListener('DOMContentLoaded', loadPdv);
