const LEGACY_PLAYLIST_STORAGE_KEY = 'gen_audio_playlists_v1';
const PLAYLIST_STORAGE_PREFIX = 'gen_audio_playlists_v2:';
const PLAYLIST_SYNC_PREFIX = 'gen_audio_playlist_sync_v1:';
const PLAYLIST_DELETIONS_KEY = 'gen_audio_playlist_deletions_v1';
const SONG_AUDIO_SESSION_PREFIX = 'gen_song_audio_lookup_v1:';
const DRIVE_API_KEY = window.firebaseConfigWeb?.apiKey || 'AIzaSyB7US5r--cM82usyzLqd-ckamgIdyewfKE';

export const providerLabels = {
  youtube: 'YouTube', spotify: 'Spotify', soundcloud: 'SoundCloud', drive: 'Google Drive',
  bandcamp: 'Bandcamp', applemusic: 'Apple Music', vimeo: 'Vimeo', directo: 'Audio', externo: 'Enlace externo'
};
export const queueCompatibleProviders = new Set(['youtube', 'drive', 'vimeo', 'directo']);

export function detectProvider(value) {
  let url;
  try { url = new URL(value); } catch { return 'externo'; }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'youtube';
  if (host.endsWith('spotify.com')) return 'spotify';
  if (host.endsWith('soundcloud.com')) return 'soundcloud';
  if (host.endsWith('drive.google.com') || host.endsWith('docs.google.com')) return 'drive';
  if (host.endsWith('bandcamp.com')) return 'bandcamp';
  if (host.endsWith('music.apple.com')) return 'applemusic';
  if (host.endsWith('vimeo.com')) return 'vimeo';
  if (/\.(mp3|m4a|aac|ogg|wav)(?:$|\?)/i.test(url.pathname + url.search)) return 'directo';
  return 'externo';
}

export function isQueueCompatibleAudio(audio) {
  if (!audio?.url) return false;
  const declared = String(audio.proveedor || '').trim().toLowerCase();
  return queueCompatibleProviders.has(declared) || queueCompatibleProviders.has(detectProvider(audio.url));
}

function youtubeId(url) {
  if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || '';
  if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2] || '';
  return url.searchParams.get('v') || '';
}

export function playerDescriptor(audio) {
  let url;
  try { url = new URL(audio.url); } catch { return { mode: 'external', url: audio.url || '' }; }
  const provider = audio.proveedor || detectProvider(audio.url);
  if (provider === 'youtube') {
    const id = youtubeId(url);
    return id ? { mode: 'iframe', kind: 'youtube', videoId: id, url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&enablejsapi=1`, title: 'Reproductor de YouTube' } : { mode: 'external', url: audio.url };
  }
  if (provider === 'spotify') {
    const parts = url.pathname.split('/').filter(Boolean);
    const offset = parts[0]?.startsWith('intl-') ? 1 : 0;
    const type = parts[offset]; const id = parts[offset + 1];
    return ['track', 'episode', 'album', 'playlist', 'show'].includes(type) && id
      ? { mode: 'iframe', url: `https://open.spotify.com/embed/${type}/${encodeURIComponent(id)}`, title: 'Reproductor de Spotify' }
      : { mode: 'external', url: audio.url };
  }
  if (provider === 'soundcloud') return { mode: 'iframe', kind: 'soundcloud', url: `https://w.soundcloud.com/player/?url=${encodeURIComponent(audio.url)}&auto_play=true&show_artwork=false&sharing=false`, title: 'Reproductor de SoundCloud' };
  if (provider === 'drive') {
    const id = url.pathname.match(/\/d\/([^/]+)/)?.[1] || url.searchParams.get('id');
    return id ? {
      mode: 'audio',
      url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&key=${encodeURIComponent(DRIVE_API_KEY)}`,
      fallbackMode: 'iframe',
      fallbackUrl: `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`,
      kind: 'drive-native',
      title: 'Audio de Google Drive'
    } : { mode: 'external', url: audio.url };
  }
  if (provider === 'vimeo') {
    const id = url.pathname.match(/\/(\d+)/)?.[1];
    return id ? { mode: 'iframe', kind: 'vimeo', videoId: id, url: `https://player.vimeo.com/video/${encodeURIComponent(id)}?autoplay=1`, title: 'Reproductor de Vimeo' } : { mode: 'external', url: audio.url };
  }
  if (provider === 'directo') return { mode: 'audio', url: audio.url, title: 'Reproductor de audio' };
  return { mode: 'external', url: audio.url };
}

export async function loadAudioCatalog() {
  const response = await fetch(new URL('../datos/sincronizacion/audios.json', import.meta.url), { cache: 'no-cache' });
  if (!response.ok) throw new Error('No se pudo abrir el catálogo de audios.');
  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items.filter(item => item && item.id && item.cancionId && item.url) : [];
}

function readSessionSongAudios(songId) {
  try {
    const value = JSON.parse(sessionStorage.getItem(`${SONG_AUDIO_SESSION_PREFIX}${songId}`));
    return Array.isArray(value) ? value : null;
  } catch { return null; }
}

function writeSessionSongAudios(songId, audios) {
  try { sessionStorage.setItem(`${SONG_AUDIO_SESSION_PREFIX}${songId}`, JSON.stringify(audios)); } catch { /* Caché opcional. */ }
}

export async function loadAudiosForSong(songId) {
  let staticItems = [];
  try {
    staticItems = (await loadAudioCatalog()).filter(audio => String(audio.cancionId) === String(songId));
  } catch { /* Firestore puede resolver el faltante. */ }

  const sessionItems = readSessionSongAudios(songId);
  if (sessionItems) return sessionItems;
  if (!navigator.onLine) return staticItems;

  if (window.firebaseReady) await window.firebaseReady.catch(() => null);
  const db = window.firebaseDb;
  const utils = window.firebaseUtils;
  if (!db || !utils?.getDocs || !utils?.query || !utils?.where) return staticItems;

  try {
    const snapshot = await utils.getDocs(utils.query(
      utils.collection(db, 'cancion_audios_publicos'),
      utils.where('cancionId', '==', String(songId)),
      utils.where('estado', '==', 'publicado')
    ));
    const liveItems = snapshot.docs.map(document => ({ id: document.id, ...document.data() }))
      .filter(item => item.id && item.url);
    writeSessionSongAudios(songId, liveItems);
    return liveItems;
  } catch {
    return staticItems;
  }
}

function playlistAudioSnapshot(audio) {
  return Object.fromEntries([
    'id', 'cancionId', 'cancionTitulo', 'url', 'proveedor', 'modoReproduccion', 'tipo',
    'version', 'versionVocal', 'tipoVoz', 'interprete', 'idioma', 'nombre', 'estado', 'esPrincipal',
    'versionId', 'versionPrincipal', 'duracionSegundos', 'durationSeconds'
  ].filter(key => audio[key] !== undefined).map(key => [key, audio[key]]));
}

export function getLocalPlaylists() {
  try {
    const owner = window.firebaseAuth?.currentUser?.uid || 'guest';
    const key = `${PLAYLIST_STORAGE_PREFIX}${owner}`;
    if (owner === 'guest' && localStorage.getItem(key) === null && localStorage.getItem(LEGACY_PLAYLIST_STORAGE_KEY)) {
      localStorage.setItem(key, localStorage.getItem(LEGACY_PLAYLIST_STORAGE_KEY));
      localStorage.removeItem(LEGACY_PLAYLIST_STORAGE_KEY);
    }
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => item && item.id && Array.isArray(item.items)).map(item => ({
      ...item,
      tipo: item.tipo === 'canciones' ? 'canciones' : 'audio'
    })) : [];
  } catch { return []; }
}

export function saveLocalPlaylists(playlists) {
  const now = new Date().toISOString();
  const normalized = playlists.map(playlist => ({
    ...playlist,
    descripcion: String(playlist.descripcion || '').slice(0, 180),
    actualizadaEn: playlist.actualizadaEn || now
  }));
  const owner = window.firebaseAuth?.currentUser?.uid || 'guest';
  localStorage.setItem(`${PLAYLIST_STORAGE_PREFIX}${owner}`, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent('gen-playlists-updated'));
  void syncLocalPlaylistsForCurrentUser(normalized).catch(error => console.warn('La lista quedó guardada localmente:', error));
}

function playlistForCloud(playlist, userId) {
  return {
    usuarioId: userId,
    nombre: String(playlist.nombre || 'Lista').slice(0, 60),
    descripcion: String(playlist.descripcion || '').slice(0, 180),
    tipo: playlist.tipo === 'canciones' ? 'canciones' : 'audio',
    creadaEn: playlist.creadaEn || new Date().toISOString(),
    actualizadaEn: playlist.actualizadaEn || new Date().toISOString(),
    eliminada: false,
    items: Array.isArray(playlist.items) ? playlist.items.slice(0, 200) : []
  };
}

function pendingPlaylistDeletions() {
  try { const value = JSON.parse(localStorage.getItem(PLAYLIST_DELETIONS_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}

async function flushPlaylistDeletions(user, utils) {
  if (!user || !navigator.onLine || !utils?.setDoc || !utils?.doc) return;
  const all = pendingPlaylistDeletions();
  const current = all.filter(item => item.usuarioId === user.uid);
  await Promise.all(current.map(item => {
    const deleted = playlistForCloud({ ...item.playlist, items: [], actualizadaEn: item.eliminadaEn }, user.uid);
    deleted.eliminada = true;
    return utils.setDoc(utils.doc(window.firebaseDb, 'usuarios', user.uid, 'playlists', item.playlist.id), deleted);
  }));
  localStorage.setItem(PLAYLIST_DELETIONS_KEY, JSON.stringify(all.filter(item => item.usuarioId !== user.uid)));
}

export async function syncLocalPlaylistsForCurrentUser(source = getLocalPlaylists()) {
  const user = window.firebaseAuth?.currentUser;
  const utils = window.firebaseUtils;
  if (!user || !navigator.onLine || !utils?.setDoc || !utils?.doc) return false;
  await flushPlaylistDeletions(user, utils);
  const syncKey = `${PLAYLIST_SYNC_PREFIX}${user.uid}`;
  let previous = {};
  try { previous = JSON.parse(localStorage.getItem(syncKey) || '{}'); } catch { previous = {}; }
  const next = {};
  const changed = source.filter(playlist => {
    const signature = JSON.stringify(playlistForCloud(playlist, user.uid));
    next[playlist.id] = signature;
    return previous[playlist.id] !== signature;
  });
  await Promise.all(changed.map(playlist => utils.setDoc(
    utils.doc(window.firebaseDb, 'usuarios', user.uid, 'playlists', playlist.id),
    playlistForCloud(playlist, user.uid)
  )));
  localStorage.setItem(syncKey, JSON.stringify(next));
  return true;
}

export async function mergeCloudPlaylists(userId) {
  const utils = window.firebaseUtils;
  if (!userId || !utils?.getDocs || !utils?.collection) return getLocalPlaylists();
  if (window.firebaseAuth?.currentUser?.uid === userId) await flushPlaylistDeletions(window.firebaseAuth.currentUser, utils);
  const snapshot = await utils.getDocs(utils.collection(window.firebaseDb, 'usuarios', userId, 'playlists'));
  const local = getLocalPlaylists();
  const merged = new Map(local.map(playlist => [playlist.id, playlist]));
  snapshot.docs.forEach(document => {
    const remote = { id: document.id, ...document.data() };
    const current = merged.get(remote.id);
    if (remote.eliminada && (!current || String(remote.actualizadaEn || '') >= String(current.actualizadaEn || ''))) {
      merged.delete(remote.id);
      return;
    }
    if (!current || String(remote.actualizadaEn || '') > String(current.actualizadaEn || '')) merged.set(remote.id, remote);
  });
  const result = [...merged.values()].filter(item => item && Array.isArray(item.items));
  localStorage.setItem(`${PLAYLIST_STORAGE_PREFIX}${userId}`, JSON.stringify(result));
  await syncLocalPlaylistsForCurrentUser(result);
  window.dispatchEvent(new CustomEvent('gen-playlists-updated'));
  return result;
}

export async function deleteCloudPlaylist(playlist) {
  const user = window.firebaseAuth?.currentUser;
  const utils = window.firebaseUtils;
  if (!user) return false;
  const pending = pendingPlaylistDeletions().filter(item => !(item.usuarioId === user.uid && item.playlist?.id === playlist.id));
  pending.push({ usuarioId: user.uid, playlist, eliminadaEn: new Date().toISOString() });
  localStorage.setItem(PLAYLIST_DELETIONS_KEY, JSON.stringify(pending));
  if (!navigator.onLine) return false;
  await flushPlaylistDeletions(user, utils);
  return true;
}

window.addEventListener('online', () => { void syncLocalPlaylistsForCurrentUser(); });

export function addToLocalPlaylist(audio, requestedName = '') {
  if (!audio?.id || !audio?.url) return null;
  const playlists = getLocalPlaylists();
  const name = requestedName.trim() || 'Mi playlist';
  let playlist = playlists.find(item => item.tipo === 'audio' && item.nombre.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'));
  if (!playlist) {
    playlist = { id: `playlist_${Date.now()}`, nombre: name, descripcion: '', tipo: 'audio', creadaEn: new Date().toISOString(), items: [] };
    playlists.push(playlist);
  }
  if (!playlist.items.some(item => String(item.audioId) === String(audio.id))) {
    playlist.items.push({
      audioId: String(audio.id),
      cancionId: String(audio.cancionId),
      agregadoEn: new Date().toISOString(),
      audio: playlistAudioSnapshot(audio)
    });
  }
  playlist.actualizadaEn = new Date().toISOString();
  saveLocalPlaylists(playlists);
  return playlist;
}

export function addSongToLocalPlaylist(song, requestedName = '') {
  const playlists = getLocalPlaylists();
  const name = requestedName.trim() || 'Mi cancionero';
  let playlist = playlists.find(item => item.tipo === 'canciones' && item.nombre.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'));
  if (!playlist) {
    playlist = { id: `playlist_${Date.now()}`, nombre: name, descripcion: '', tipo: 'canciones', creadaEn: new Date().toISOString(), items: [] };
    playlists.push(playlist);
  }
  const songId = String(song.id || song.cancionId || '');
  if (songId && !playlist.items.some(item => String(item.cancionId) === songId)) {
    playlist.items.push({
      cancionId: songId,
      agregadoEn: new Date().toISOString(),
      cancion: Object.fromEntries(['id', 'titulo', 'artista', 'categoria', 'tono', 'tonalidad'].filter(key => song[key] !== undefined).map(key => [key, song[key]]))
    });
  }
  playlist.actualizadaEn = new Date().toISOString();
  saveLocalPlaylists(playlists);
  return playlist;
}

export function removeFromLocalPlaylist(playlistId, audioId) {
  const playlists = getLocalPlaylists();
  const playlist = playlists.find(item => item.id === playlistId);
  if (playlist) {
    playlist.items = playlist.items.filter(item => String(item.audioId) !== String(audioId));
    playlist.actualizadaEn = new Date().toISOString();
  }
  saveLocalPlaylists(playlists);
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = ''; bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function playlistShareUrl(playlist) {
  const portable = { v: 2, nombre: playlist.nombre, tipo: playlist.tipo || 'audio', items: playlist.items.map(({ audioId, cancionId, audio, cancion }) => ({ audioId, cancionId, audio, cancion })) };
  return new URL(`playlist.html#p=${base64UrlEncode(portable)}`, location.href).href;
}

export function playlistFromLocation(hash = location.hash) {
  const encoded = new URLSearchParams(hash.replace(/^#/, '')).get('p');
  if (!encoded) return null;
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return [1, 2].includes(parsed?.v) && Array.isArray(parsed.items) ? { ...parsed, tipo: parsed.tipo === 'canciones' ? 'canciones' : 'audio' } : null;
  } catch { return null; }
}
