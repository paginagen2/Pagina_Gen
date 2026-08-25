import { DatabaseService } from '../aaglobal/firebase-config-cancionero.js?v=20260819-artist-static';

const PAGE_SIZE = 15;
const params = new URLSearchParams(location.search);
const artistName = (params.get('artista') || '').trim();
let allSongs = [], visibleCount = 0, currentUser = null;
const favoriteIds = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('backButton')?.addEventListener('click', goBack);
  document.getElementById('loadMoreButton')?.addEventListener('click', () => { visibleCount += PAGE_SIZE; renderSongs(); });
  if (!artistName) return showEmpty('No se indicó qué artista querés consultar.');
  document.title = `${artistName} | Cancionero Gen`;
  document.getElementById('artistName').textContent = artistName;
  document.getElementById('artistAvatar').textContent = getInitials(artistName);
  await loadArtistSongs();
  window.firebaseUtils.onAuthStateChanged(window.firebaseAuth, async user => {
    currentUser = user || null; favoriteIds.clear();
    if (user) (await DatabaseService.getFavoritosUsuario(user.uid).catch(() => [])).forEach(song => favoriteIds.add(String(song.id)));
    syncFavoriteButtons();
  });
});

async function fetchSongs(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  return (await response.json()).canciones || [];
}

async function loadArtistSongs() {
  const button = document.getElementById('loadMoreButton');
  try {
    const [staticSongs, extras, recent] = await Promise.all([
      fetchSongs('../datos/cancionero/buscar.json'),
      fetchSongs('../datos/cancionero/extras.json').catch(() => []),
      DatabaseService.getCancionesLimitadas(15).catch(() => [])
    ]);
    const unique = new Map();
    [...recent, ...staticSongs, ...extras].forEach(song => {
      if (song?.id && String(song.artista || '').localeCompare(artistName, 'es', { sensitivity: 'base' }) === 0) unique.set(String(song.id), song);
    });
    allSongs = [...unique.values()].sort((a, b) => String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es'));
    visibleCount = PAGE_SIZE; renderSongs();
  } catch (error) {
    console.error(error); showEmpty('No pudimos cargar las canciones de este artista.'); if (button) button.hidden = true;
  }
}

function renderSongs() {
  const container = document.getElementById('artistSongs'); container.replaceChildren();
  if (!allSongs.length) return showEmpty('Este artista todavía no tiene canciones publicadas.');
  const visible = allSongs.slice(0, visibleCount);
  visible.forEach(song => container.append(createSongCard(song)));
  const categories = [...new Set(allSongs.map(song => getCategoryText(song.categoria)))].join(' · ');
  document.getElementById('songCount').textContent = `${allSongs.length} ${allSongs.length === 1 ? 'canción' : 'canciones'}`;
  document.getElementById('artistSummary').textContent = `${allSongs.length} ${allSongs.length === 1 ? 'canción' : 'canciones'} · ${categories}`;
  const button = document.getElementById('loadMoreButton'); button.hidden = visible.length >= allSongs.length; button.disabled = false; button.textContent = `Ver ${Math.min(PAGE_SIZE, allSongs.length - visible.length)} más`;
}

function createSongCard(song) {
  const card = document.createElement('article'); card.className = 'cancion-card'; const id = String(song.id); const category = ['misa', 'gen', 'fogon'].includes(song.categoria) ? song.categoria : 'gen'; const variant = hashText(`${song.titulo || ''}${artistName}`) % 6;
  card.innerHTML = `<div class="cancion-content"><div class="song-thumb" data-variant="${variant}">${getThumbnailIcon(category)}</div><div class="song-info"><div class="song-title-row"><h3 class="cancion-titulo"></h3><span class="artista-link"></span></div><div class="song-card-footer"><span class="cancion-categoria" data-categoria="${category}">${getCategoryText(category)}</span><span class="song-like-count"><svg aria-hidden="true"><use href="#i-heart"/></svg>${Number(song.likesCount || 0)}</span><button type="button" class="favorite-button" data-song-id="${escapeHtml(id)}" aria-pressed="false"><svg class="favorite-icon" aria-hidden="true"><use href="#i-heart"/></svg></button></div></div></div>`;
  card.querySelector('.cancion-titulo').textContent = song.titulo || 'Sin título'; card.querySelector('.artista-link').textContent = artistName;
  card.querySelector('.cancion-content').addEventListener('click', () => { location.href = `cancion.html?id=${encodeURIComponent(id)}`; });
  const favorite = card.querySelector('.favorite-button'); favorite.addEventListener('click', async event => { event.stopPropagation(); await toggleFavorite(song, favorite); }); syncFavoriteButton(favorite); return card;
}

async function toggleFavorite(song, button) {
  if (!currentUser) { window.genOpenAuthModal?.(); return; }
  const id = String(song.id); const active = !favoriteIds.has(id); button.disabled = true;
  try { await DatabaseService.setFavoritoCancion(id, currentUser.uid, active); if (active) favoriteIds.add(id); else favoriteIds.delete(id); syncFavoriteButtons(); }
  catch { button.title = 'No pudimos actualizar el favorito'; }
  finally { button.disabled = false; }
}
function syncFavoriteButtons() { document.querySelectorAll('.favorite-button').forEach(syncFavoriteButton); }
function syncFavoriteButton(button) { const active = favoriteIds.has(String(button.dataset.songId)); button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); button.title = active ? 'Quitar de favoritos' : 'Agregar a favoritos'; }
function showEmpty(message) { document.getElementById('artistSongs').innerHTML = `<div class="loading-state"><span class="loading-disc">♪</span><p>${escapeHtml(message)}</p></div>`; document.getElementById('artistSummary').textContent = message; document.getElementById('songCount').textContent = ''; }
function goBack() { const sameSite = document.referrer && new URL(document.referrer).origin === location.origin; if (sameSite && history.length > 1) history.back(); else location.href = 'cancionero.html'; }
function getCategoryText(category) { return ({ misa: 'Misa', gen: 'Gen', fogon: 'Fogón' })[category] || 'Canción'; }
function getThumbnailIcon(category) { return `<svg aria-hidden="true"><use href="#${({ misa: 'i-church', gen: 'i-users', fogon: 'i-fire' })[category] || 'i-music'}"/></svg>`; }
function getInitials(name) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'; }
function hashText(text) { return Array.from(text).reduce((total, character) => ((total << 5) - total + character.charCodeAt(0)) >>> 0, 0); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]); }
