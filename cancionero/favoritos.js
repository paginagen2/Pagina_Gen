import { DatabaseService } from '../aaglobal/firebase-config-cancionero.js?v=20260730-google1';

const content = document.getElementById('favoritesContent');
const count = document.getElementById('favoritesCount');
let currentUser = null;
let favoriteSongs = [];

function escapeHTML(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function attribute(value) {
  return escapeHTML(value).replace(/"/g, '&quot;');
}

function categoryLabel(category) {
  return ({ misa: 'Misa', gen: 'Gen', fogon: 'Fogón' })[category] || 'Gen';
}

function hashText(value) {
  let hash = 0;
  for (const character of String(value)) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return Math.abs(hash);
}

function thumbnailIcon(category) {
  if (category === 'fogon') return '<span aria-hidden="true">♨</span>';
  if (category === 'misa') return '<span aria-hidden="true">✦</span>';
  return '<svg aria-hidden="true"><use href="#i-music"/></svg>';
}

function renderEmpty() {
  count.hidden = true;
  content.innerHTML = `
    <div class="favorites-empty">
      <span class="favorites-empty-icon"><svg aria-hidden="true"><use href="#i-heart"/></svg></span>
      <h2>No tienes favoritos</h2>
      <p>Descubre nuevas canciones y usa el corazón para guardarlas en tu colección.</p>
      <a class="favorites-cta" href="cancionero.html#canciones">Ir a canciones destacadas</a>
    </div>
  `;
  content.setAttribute('aria-busy', 'false');
}

function renderLogin() {
  count.hidden = true;
  content.innerHTML = `
    <div class="favorites-login">
      <span class="favorites-empty-icon"><svg aria-hidden="true"><use href="#i-heart"/></svg></span>
      <h2>Inicia sesión para ver tus favoritos</h2>
      <p>Esta colección es personal y está disponible únicamente para cuentas registradas.</p>
      <button class="favorites-cta" id="favoritesLogin" type="button">Iniciar sesión</button>
    </div>
  `;
  document.getElementById('favoritesLogin')?.addEventListener('click', () => {
    if (typeof window.genOpenAuthModal === 'function') window.genOpenAuthModal();
    else document.getElementById('auth-btn')?.click();
  });
  content.setAttribute('aria-busy', 'false');
}

function createSongCard(song) {
  const card = document.createElement('article');
  card.className = 'cancion-card';
  const id = String(song.id || '');
  const title = song.titulo || 'Sin título';
  const artist = song.artista || 'Desconocido';
  const category = ['misa', 'gen', 'fogon'].includes(song.categoria) ? song.categoria : 'gen';
  const tone = song.tono || song.tonalidad || '';
  const variant = hashText(`${title}${artist}`) % 6;
  card.innerHTML = `
    <div class="cancion-content">
      <div class="song-thumb" data-variant="${variant}">${thumbnailIcon(category)}</div>
      <div class="song-info">
        <div class="song-title-row">
          <h3 class="cancion-titulo">${escapeHTML(title)}</h3>
          <button type="button" class="artista-link" data-artist="${attribute(artist)}">${escapeHTML(artist)}</button>
        </div>
        <div class="song-card-footer">
          <span class="cancion-categoria" data-categoria="${category}">${categoryLabel(category)}</span>
          ${tone ? `<span class="song-key">${escapeHTML(tone)}</span>` : ''}
          <button type="button" class="favorite-button active" aria-pressed="true" aria-label="Quitar ${attribute(title)} de favoritos" title="Quitar de favoritos">
            <svg class="favorite-icon" aria-hidden="true"><use href="#i-heart"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
  card.querySelector('.cancion-content')?.addEventListener('click', () => {
    window.location.href = `cancion.html?id=${encodeURIComponent(id)}`;
  });
  card.querySelector('.artista-link')?.addEventListener('click', (event) => {
    event.stopPropagation();
    window.location.href = `artista.html?artista=${encodeURIComponent(artist)}`;
  });
  card.querySelector('.favorite-button')?.addEventListener('click', async (event) => {
    event.stopPropagation();
    const button = event.currentTarget;
    if (!currentUser || button.disabled) return;
    button.disabled = true;
    try {
      await DatabaseService.setFavoritoCancion(id, currentUser.uid, false);
      favoriteSongs = favoriteSongs.filter((favorite) => String(favorite.id) !== id);
      renderSongs();
    } catch (error) {
      console.error('No se pudo quitar el favorito:', error);
      showToast('No pudimos quitar la canción de favoritos', 'error');
      button.disabled = false;
    }
  });
  return card;
}

function renderSongs() {
  if (favoriteSongs.length === 0) {
    renderEmpty();
    return;
  }
  count.textContent = `${favoriteSongs.length} ${favoriteSongs.length === 1 ? 'canción' : 'canciones'}`;
  count.hidden = false;
  const grid = document.createElement('div');
  grid.className = 'favorites-grid';
  favoriteSongs.forEach((song) => grid.appendChild(createSongCard(song)));
  content.replaceChildren(grid);
  content.setAttribute('aria-busy', 'false');
}

async function loadFavorites(user) {
  content.setAttribute('aria-busy', 'true');
  content.innerHTML = '<div class="favorites-loading"><span>♪</span><p>Cargando tus favoritos…</p></div>';
  try {
    favoriteSongs = await DatabaseService.getFavoritosUsuario(user.uid);
    if (currentUser?.uid !== user.uid) return;
    renderSongs();
  } catch (error) {
    console.error('No se pudieron cargar los favoritos:', error);
    content.innerHTML = `
      <div class="favorites-empty">
        <h2>No pudimos cargar tus favoritos</h2>
        <p>Revisa tu conexión e inténtalo nuevamente.</p>
        <button class="favorites-cta" id="retryFavorites" type="button">Reintentar</button>
      </div>
    `;
    document.getElementById('retryFavorites')?.addEventListener('click', () => loadFavorites(user));
    content.setAttribute('aria-busy', 'false');
  }
}

function showToast(message, type = 'success') {
  const status = document.getElementById('statusToast');
  const toast = document.getElementById('toast');
  document.getElementById('toastMessage').textContent = message;
  document.getElementById('toastIcon').textContent = type === 'error' ? '×' : '✓';
  toast.className = `toast ${type}`;
  status.classList.add('show');
  window.setTimeout(() => status.classList.remove('show'), 3000);
}

window.firebaseUtils.onAuthStateChanged(window.firebaseAuth, (user) => {
  currentUser = user || null;
  favoriteSongs = [];
  if (currentUser) void loadFavorites(currentUser);
  else renderLogin();
});
