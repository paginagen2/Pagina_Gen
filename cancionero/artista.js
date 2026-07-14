import { DatabaseService } from '../aaglobal/firebase-config-cancionero.js?v=20260713-artists1';

const PAGE_SIZE = 15;
const params = new URLSearchParams(window.location.search);
const artistName = (params.get('artista') || '').trim();
let lastSong = null;
let loadedSongs = 0;
let loading = false;

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('backButton')?.addEventListener('click', goBack);
  document.getElementById('loadMoreButton')?.addEventListener('click', loadArtistSongs);

  if (!artistName) {
    showEmpty('No se indicó qué artista querés consultar.');
    return;
  }

  document.title = `${artistName} | Cancionero Gen`;
  document.getElementById('artistName').textContent = artistName;
  document.getElementById('artistAvatar').textContent = getInitials(artistName);
  await loadArtistSongs();
});

async function loadArtistSongs() {
  if (loading) return;
  loading = true;
  const button = document.getElementById('loadMoreButton');
  if (button) { button.disabled = true; button.textContent = 'Cargando...'; }

  try {
    const result = await DatabaseService.getCancionesPorArtista(artistName, lastSong, PAGE_SIZE);
    lastSong = result.ultimaCancion;
    appendSongs(result.canciones);
    loadedSongs += result.canciones.length;

    document.getElementById('songCount').textContent = `${loadedSongs} ${loadedSongs === 1 ? 'canción' : 'canciones'}`;
    document.getElementById('artistSummary').textContent = `${loadedSongs} ${loadedSongs === 1 ? 'canción cargada' : 'canciones cargadas'}`;
    button.hidden = !result.hayMas;
    button.disabled = false;
    button.textContent = 'Ver 15 más';
  } catch (error) {
    console.error(error);
    if (loadedSongs === 0) showEmpty('No pudimos cargar las canciones de este artista.');
    if (button) button.hidden = true;
  } finally {
    loading = false;
  }
}

function appendSongs(songs) {
  const container = document.getElementById('artistSongs');
  if (loadedSongs === 0) container.innerHTML = '';
  if (songs.length === 0 && loadedSongs === 0) {
    showEmpty('Este artista todavía no tiene canciones publicadas.');
    return;
  }

  songs.forEach((song) => {
    const card = document.createElement('article');
    card.className = 'cancion-card';
    const category = ['misa', 'gen', 'fogon'].includes(song.categoria) ? song.categoria : 'gen';
    const variant = hashText(`${song.titulo || ''}${artistName}`) % 6;
    card.innerHTML = `
      <div class="cancion-content">
        <div class="song-thumb" data-variant="${variant}">${getThumbnailIcon(category)}</div>
        <div class="song-info">
          <div class="song-title-row"><h3 class="cancion-titulo">${escapeHtml(song.titulo || 'Sin título')}</h3><span class="artista-link">${escapeHtml(artistName)}</span></div>
          <div class="song-card-footer">
            <span class="cancion-categoria" data-categoria="${category}">${getCategoryText(category)}</span>
            <span class="song-like-count"><svg aria-hidden="true"><use href="#i-heart"/></svg>${Number(song.likesCount || 0)}</span>
          </div>
        </div>
      </div>`;
    card.querySelector('.cancion-content').addEventListener('click', () => {
      window.location.href = `cancion.html?id=${encodeURIComponent(song.id)}`;
    });
    container.appendChild(card);
  });
}

function showEmpty(message) {
  document.getElementById('artistSongs').innerHTML = `<div class="loading-state"><span class="loading-disc">♪</span><p>${escapeHtml(message)}</p></div>`;
  document.getElementById('artistSummary').textContent = message;
  document.getElementById('songCount').textContent = '';
}

function goBack() {
  const cameFromThisSite = document.referrer && new URL(document.referrer).origin === window.location.origin;
  if (cameFromThisSite && window.history.length > 1) window.history.back();
  else window.location.href = 'cancionero.html';
}

function getCategoryText(category) { return ({ misa: 'Misa', gen: 'Gen', fogon: 'Fogón' })[category] || 'Canción'; }
function getThumbnailIcon(category) { return `<svg aria-hidden="true"><use href="#${({ misa: 'i-church', gen: 'i-users', fogon: 'i-fire' })[category] || 'i-music'}"/></svg>`; }
function getInitials(name) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?'; }
function hashText(text) { return Array.from(text).reduce((total, character) => ((total << 5) - total + character.charCodeAt(0)) >>> 0, 0); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]); }
