import { deleteCloudPlaylist, getLocalPlaylists, isQueueCompatibleAudio, loadAudioCatalog, mergeCloudPlaylists, playerDescriptor, playlistFromLocation, providerLabels, removeFromLocalPlaylist, saveLocalPlaylists } from './audio-catalog.js?v=20260825-native-save-import-fix';
import { clearMediaSession, connectMediaSession } from './media-session.js?v=20260825-1';
import { hasNativeAudio, nativeNext, nativePause, nativePlay, nativePrevious, nativeStop, playNativeQueue } from './native-audio.js?v=20260825-1';

const FAVORITES_ID = 'profile_favorites';
let curatedPlaylists = [
  { id: 'curated_gen_esenciales', nombre: 'Gen esenciales', descripcion: 'Canciones centrales para encuentros, escuelas y momentos compartidos.', tipo: 'canciones', curada: true, items: [
    ['KUyS3lB77gRyawc034yG', 'Luce (Español)', 'Música Gen', 'gen'], ['cancion_1763217469980', 'Dejemos Huellas', 'Escuela 2024', 'gen'], ['qPSX6wBz6Z9kIcxYNOBl', 'Nací para amar', 'Escuela 2023', 'gen'], ['Ufl8rYilTSxRLnjWwdRZ', 'Gen Revolution', 'Música Gen', 'gen'], ['2eW94ddqeXxEGgADqBqO', 'La Justa Dirección', 'Música Gen', 'gen'], ['TTWqKb2GVrQwAcNb7EJJ', 'Aprender a Vivir', 'Escuela 2024', 'gen']
  ].map(([id, titulo, artista, categoria]) => ({ cancionId: id, cancion: { id, titulo, artista, categoria } })) },
  { id: 'curated_fogon', nombre: 'Fogón para cantar', descripcion: 'Clásicos y canciones actuales para guitarra y ronda.', tipo: 'canciones', curada: true, items: [
    ['1ZETSxuNxq3uuiZLWPl0', 'Canción para mi muerte', 'Sui Generis', 'fogon'], ['CoHOXybyLsKBhkfGDcLd', 'Flaca', 'Andres Calamaro', 'fogon'], ['CgHDHbSmSBYXwvNYJNV7', 'Trátame Suavemente', 'Soda Stereo', 'fogon'], ['bivdM1cdtQtyUyppW0wC', 'Icaro', 'Alan Sutton y las Criaturitas de la Ansiedad', 'fogon'], ['F3seMjHgZKjKUUKTJJEL', 'Como eran las cosas', 'Babasonicos', 'fogon']
  ].map(([id, titulo, artista, categoria]) => ({ cancionId: id, cancion: { id, titulo, artista, categoria } })) },
  { id: 'curated_encuentro', nombre: 'Para abrir un encuentro', descripcion: 'Un recorrido que empieza con energía y termina en clave de unidad.', tipo: 'canciones', curada: true, items: [
    ['4p9tIbaHFDS9dknvmvXq', 'Sueños de Papel', 'Escuela 2023', 'gen'], ['cancion_1782745676087', 'En dirección al sol', 'Música Gen', 'gen'], ['M2ya9TTfVVj78UngegNL', 'De mis Raices', 'Escuela 2023', 'gen'], ['KjVtv3F0asIrjXFMFND3', 'Mosaico', 'Música Gen', 'gen'], ['sJwsMq1LZ81ZDWPKVL94', 'Alma de Cristo', 'Misa', 'misa']
  ].map(([id, titulo, artista, categoria]) => ({ cancionId: id, cancion: { id, titulo, artista, categoria } })) }
];
const $ = selector => document.querySelector(selector);
let playlists = getLocalPlaylists();
let catalog = [], favoriteSongs = [], currentUser = null, favoritesLoading = false;
let DatabaseService = null;
let activeId = FAVORITES_ID;
let currentAudioId = null;
let queueIndex = -1, youtubePlayer = null;
let providerPlayer = null, playbackSession = 0;
let youtubeApiPromise = null, soundCloudApiPromise = null, vimeoApiPromise = null;

function confirmPlaylistAction({ title, message, confirmLabel = 'Eliminar' }) {
  const dialog = $('#playlistConfirmDialog');
  if (!dialog) return Promise.resolve(false);
  $('#playlistConfirmTitle').textContent = title;
  $('#playlistConfirmMessage').textContent = message;
  $('#playlistConfirmSubmit').textContent = confirmLabel;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise(resolve => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (typeof previous === 'function') previous(); resolve(window.YT); };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; document.head.append(script);
    }
  });
  return youtubeApiPromise;
}

function loadScriptApi(source, ready, existingPromise, remember) {
  if (ready()) return Promise.resolve();
  if (existingPromise) return existingPromise;
  const promise = new Promise((resolve, reject) => {
    const current = document.querySelector(`script[src="${source}"]`);
    if (current) { current.addEventListener('load', resolve, { once: true }); current.addEventListener('error', reject, { once: true }); return; }
    const script = document.createElement('script'); script.src = source; script.addEventListener('load', resolve, { once: true }); script.addEventListener('error', reject, { once: true }); document.head.append(script);
  });
  remember(promise); return promise;
}
function loadSoundCloudApi() { return loadScriptApi('https://w.soundcloud.com/player/api.js', () => Boolean(window.SC?.Widget), soundCloudApiPromise, promise => { soundCloudApiPromise = promise; }); }
function loadVimeoApi() { return loadScriptApi('https://player.vimeo.com/api/player.js', () => Boolean(window.Vimeo?.Player), vimeoApiPromise, promise => { vimeoApiPromise = promise; }); }

function audioQueue() {
  const playlist = activePlaylist();
  if (playlist?.tipo !== 'audio') return [];
  return playlist.items.map(reference => audioById(reference.audioId) || reference.audio).filter(Boolean);
}
function stopCurrentPlayback(preserveNative = false) {
  playbackSession += 1;
  clearMediaSession();
  if (!preserveNative) nativeStop();
  try { youtubePlayer?.destroy(); } catch { /* Puede cerrarse antes de terminar de cargar. */ }
  youtubePlayer = null;
  try { providerPlayer?.cleanup?.(); } catch { /* El iframe puede haberse cerrado primero. */ }
  providerPlayer = null;
}
function playNext() { const queue = audioQueue(); if (!queue.length) return; const next = queueIndex + 1; if (next >= queue.length) return closePlayer(); playAudio(queue[next], next); }
function playPrevious() { const queue = audioQueue(); if (!queue.length) return; const previous = Math.max(0, queueIndex - 1); playAudio(queue[previous], previous); }
function closePlayer() {
  stopCurrentPlayback(); currentAudioId = null; queueIndex = -1;
  const container = $('#playlistPlayer'); if (container) { container.hidden = true; container.replaceChildren(); }
  renderAudioSelection();
}

function playlistFilename(playlist) {
  const safe = String(playlist.nombre || 'playlist-gen').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${safe || 'playlist-gen'}.playlistgen`;
}

function playlistFile(playlist) {
  const payload = JSON.stringify({ v: 2, nombre: playlist.nombre, tipo: playlist.tipo, items: playlist.items }, null, 2);
  return new File([payload], playlistFilename(playlist), { type: 'application/vnd.paginagen.playlist+json' });
}

function downloadPlaylistFile(file) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function savePlaylistFile(playlist) {
  const file = playlistFile(playlist);
  if (window.AndroidPlaylistFiles?.savePlaylist) {
    const opened = window.AndroidPlaylistFiles.savePlaylist(file.name, await file.text());
    showPlaylistStatus(opened ? 'Elegí dónde guardar la playlist.' : 'No pudimos abrir el selector de archivos.', !opened);
    return;
  }
  downloadPlaylistFile(file);
  showPlaylistStatus('La descarga comenzó. Revisá la carpeta Descargas.');
}

let playlistStatusTimer;
function showPlaylistStatus(message, error = false) {
  const status = $('#playlistStatus'); if (!status) return;
  clearTimeout(playlistStatusTimer); status.textContent = message; status.classList.toggle('is-error', error); status.hidden = false;
  playlistStatusTimer = setTimeout(() => { status.hidden = true; }, 4200);
}

async function sharePlaylistFile(playlist) {
  const message = `Te comparto mi playlist *${playlist.nombre}*`;
  const file = playlistFile(playlist);
  try {
    if (window.AndroidPlaylistFiles?.sharePlaylist) {
      const opened = window.AndroidPlaylistFiles.sharePlaylist(file.name, await file.text());
      if (!opened) throw new Error('Android no pudo preparar el archivo.');
      showPlaylistStatus('Se abrió el menú de Android para compartir la playlist.');
    } else if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ title: playlist.nombre, text: message, files: [file] });
      showPlaylistStatus('Playlist compartida.');
    } else {
      showPlaylistStatus('Este dispositivo no permite compartir archivos desde Gen. Usá “Guardar archivo”.', true);
    }
  } catch (error) {
    if (error?.name !== 'AbortError') showPlaylistStatus('No pudimos abrir el menú para compartir. Intentá nuevamente.', true);
  }
}

function selectPlaylist(id) {
  activeId = id; render();
  requestAnimationFrame(() => $('#playlistDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function activePlaylist() {
  if (activeId === FAVORITES_ID) return { id: FAVORITES_ID, nombre: 'Favoritos', tipo: 'favoritos', items: favoriteSongs.map(cancion => ({ cancionId: String(cancion.id), cancion })) };
  return playlists.find(item => item.id === activeId) || curatedPlaylists.find(item => item.id === activeId) || null;
}
function audioById(id) { return catalog.find(audio => String(audio.id) === String(id)); }
function sanitizeAudioPlaylists(source) {
  return source.map(playlist => playlist.tipo !== 'audio' ? playlist : {
    ...playlist,
    items: playlist.items.filter(reference => {
      const audio = audioById(reference.audioId) || reference.audio;
      return audio ? isQueueCompatibleAudio(audio) : false;
    })
  });
}
function typeLabel(type) { return type === 'audio' ? 'Para escuchar' : type === 'favoritos' ? 'Favoritos del perfil' : 'Letras y acordes'; }
function itemLabel(playlist) { const count = playlist.items.length; return playlist.tipo === 'audio' ? `${count} audio${count === 1 ? '' : 's'}` : `${count} canción${count === 1 ? '' : 'es'}`; }

function renderList() {
  const list = $('#playlistList'); list.replaceChildren();
  const favorite = document.createElement('button'); favorite.type = 'button'; favorite.classList.toggle('active', activeId === FAVORITES_ID);
  favorite.innerHTML = `<span class="playlist-list-title"><span aria-hidden="true">♥</span><strong>Favoritos</strong></span><small>${currentUser ? (favoritesLoading ? 'Cargando…' : `${favoriteSongs.length} canciones`) : 'Inicia sesión para verlos'}</small>`;
  favorite.addEventListener('click', () => selectPlaylist(FAVORITES_ID)); list.append(favorite);
  playlists.forEach(playlist => {
    const button = document.createElement('button'); button.type = 'button'; button.classList.toggle('active', playlist.id === activeId);
    button.innerHTML = `<span class="playlist-list-title"><span aria-hidden="true">${playlist.tipo === 'audio' ? '▶' : '♫'}</span><strong></strong></span><small>${typeLabel(playlist.tipo)} · ${itemLabel(playlist)}</small>`;
    button.querySelector('strong').textContent = playlist.nombre; button.addEventListener('click', () => selectPlaylist(playlist.id)); list.append(button);
  });
  const curatedList = $('#curatedPlaylistList'); curatedList.replaceChildren();
  curatedPlaylists.forEach(playlist => {
    const button = document.createElement('button'); button.type = 'button'; button.classList.toggle('active', playlist.id === activeId);
    button.innerHTML = '<span class="playlist-list-title"><span aria-hidden="true">✦</span><strong></strong></span><small></small>';
    button.querySelector('strong').textContent = playlist.nombre; button.querySelector('small').textContent = itemLabel(playlist);
    button.addEventListener('click', () => selectPlaylist(playlist.id)); curatedList.append(button);
  });
}

function touchAndSave(playlist) { playlist.actualizadaEn = new Date().toISOString(); saveLocalPlaylists(playlists); }
function moveItem(playlist, index, offset) {
  const target = index + offset; if (target < 0 || target >= playlist.items.length) return;
  [playlist.items[index], playlist.items[target]] = [playlist.items[target], playlist.items[index]]; touchAndSave(playlist); render();
}
function orderButtons(playlist, index) {
  if (playlist.curada || playlist.tipo === 'favoritos') return [];
  return [-1, 1].map(offset => { const button = document.createElement('button'); button.type = 'button'; button.textContent = offset < 0 ? '↑' : '↓'; button.title = offset < 0 ? 'Subir' : 'Bajar'; button.disabled = index + offset < 0 || index + offset >= playlist.items.length; button.addEventListener('click', () => moveItem(playlist, index, offset)); return button; });
}

function playAudio(audio, requestedIndex = null) {
  const descriptor = playerDescriptor(audio);
  stopCurrentPlayback(descriptor.mode === 'audio' && hasNativeAudio());
  const queue = audioQueue(); queueIndex = requestedIndex ?? queue.findIndex(item => String(item.id) === String(audio.id));
  currentAudioId = String(audio.id); renderAudioSelection();
  const container = $('#playlistPlayer'); container.replaceChildren(); container.hidden = false; container.classList.remove('is-drive-player');
  if (descriptor.mode === 'external') { window.open(descriptor.url, '_blank', 'noopener,noreferrer'); container.hidden = true; return; }
  const header = document.createElement('header'); header.className = 'playlist-player-header';
  const mark = document.createElement('span'); mark.className = 'playlist-player-mark'; mark.textContent = '♪';
  const copy = document.createElement('div'); const label = document.createElement('small'); label.textContent = 'REPRODUCIENDO'; const title = document.createElement('strong'); title.textContent = audio.nombre || 'Audio de la canción'; copy.append(label, title);
  const close = document.createElement('button'); close.type = 'button'; close.className = 'playlist-player-close'; close.setAttribute('aria-label', 'Cerrar reproductor'); close.textContent = '×'; close.addEventListener('click', closePlayer);
  header.append(mark, copy, close); const body = document.createElement('div'); body.className = 'playlist-player-body'; container.append(header, body);
  if (descriptor.mode === 'audio') {
    if (hasNativeAudio() && playNativeQueue(queue, audio, playerDescriptor, activePlaylist()?.nombre || 'Playlist Gen')) {
      const nativeStatus = document.createElement('p'); nativeStatus.className = 'playlist-player-native-status'; nativeStatus.textContent = 'La reproducción continúa en Android aunque cambies de sección.';
      const queueControls = document.createElement('div'); queueControls.className = 'playlist-native-queue-controls';
      const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '‹ Anterior'; previous.addEventListener('click', nativePrevious);
      const pause = document.createElement('button'); pause.type = 'button'; pause.textContent = 'Pausar'; pause.addEventListener('click', nativePause);
      const resume = document.createElement('button'); resume.type = 'button'; resume.textContent = 'Reproducir'; resume.addEventListener('click', nativePlay);
      const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Siguiente ›'; next.addEventListener('click', nativeNext);
      queueControls.append(previous, pause, resume, next); body.append(nativeStatus, queueControls); return;
    }
    const player = document.createElement('audio'); player.controls = true; player.autoplay = true; player.preload = 'metadata'; player.crossOrigin = 'anonymous'; player.src = descriptor.url;
    if (descriptor.fallbackUrl) player.addEventListener('error', () => { clearMediaSession(player); body.replaceChildren(); const fallback = document.createElement('a'); fallback.className = 'playlist-player-fallback'; fallback.href = descriptor.fallbackUrl; fallback.target = '_blank'; fallback.rel = 'noopener noreferrer'; fallback.innerHTML = '<span>↗</span><strong>Abrir audio en Google Drive</strong><small>El archivo no admite reproducción directa.</small>'; body.append(fallback); }, { once: true });
    player.addEventListener('ended', playNext);
    connectMediaSession(player, audio, {
      album: activePlaylist()?.nombre || 'Playlist Gen',
      previous: queueIndex > 0 ? playPrevious : null,
      next: queueIndex < queue.length - 1 ? playNext : null
    });
    const queueControls = document.createElement('div'); queueControls.className = 'playlist-native-queue-controls';
    const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '‹ Anterior'; previous.disabled = queueIndex <= 0; previous.addEventListener('click', playPrevious);
    const next = document.createElement('button'); next.type = 'button'; next.textContent = 'Siguiente ›'; next.disabled = queueIndex >= queue.length - 1; next.addEventListener('click', playNext);
    queueControls.append(previous, next); body.append(player, queueControls); void player.play().catch(error => console.warn('El navegador espera que pulses reproducir:', error)); return;
  }
  if (descriptor.kind === 'youtube') {
    const session = playbackSession; body.classList.add('has-video'); const mount = document.createElement('div'); body.append(mount);
    loadYouTubeApi().then(YT => { if (!mount.isConnected || session !== playbackSession) return; youtubePlayer = new YT.Player(mount, { videoId: descriptor.videoId, playerVars: { autoplay: 1, rel: 0 }, events: { onStateChange(event) { if (event.data === YT.PlayerState.ENDED && session === playbackSession) playNext(); } } }); });
    return;
  }
  const frame = document.createElement('iframe'); frame.src = descriptor.url; frame.title = descriptor.title || 'Reproductor'; frame.allow = 'autoplay; encrypted-media; picture-in-picture'; frame.allowFullscreen = true; body.classList.add('has-video');
  body.append(frame);
  const session = playbackSession;
  if (descriptor.kind === 'soundcloud') {
    loadSoundCloudApi().then(() => {
      if (!frame.isConnected || session !== playbackSession) return;
      const widget = window.SC.Widget(frame); const finish = () => { if (session === playbackSession) playNext(); };
      widget.bind(window.SC.Widget.Events.FINISH, finish);
      providerPlayer = { cleanup() { widget.unbind(window.SC.Widget.Events.FINISH); widget.pause(); } };
    }).catch(error => console.warn('No se pudo conectar el control de SoundCloud:', error));
  } else if (descriptor.kind === 'vimeo') {
    loadVimeoApi().then(() => {
      if (!frame.isConnected || session !== playbackSession) return;
      const player = new window.Vimeo.Player(frame); const finish = () => { if (session === playbackSession) playNext(); };
      player.on('ended', finish);
      providerPlayer = { cleanup() { player.off('ended', finish); void player.pause().catch(() => {}); void player.destroy().catch(() => {}); } };
    }).catch(error => console.warn('No se pudo conectar el control de Vimeo:', error));
  }
}

function renderAudioSelection() { document.querySelectorAll('.playlist-item[data-audio-id]').forEach(row => row.classList.toggle('is-playing', row.dataset.audioId === currentAudioId)); }

function renderLogin(detail) {
  const empty = document.createElement('div'); empty.className = 'playlist-empty';
  empty.innerHTML = '<div><span class="playlist-empty-heart">♥</span><h2>Inicia sesión para ver tus favoritos</h2><p>Esta lista se completa automáticamente con las canciones que marques con el corazón.</p><button class="playlist-action" type="button">Iniciar sesión</button></div>';
  empty.querySelector('button').addEventListener('click', () => { if (window.genOpenAuthModal) window.genOpenAuthModal(); else document.getElementById('auth-btn')?.click(); }); detail.append(empty);
}

function songRow(reference, playlist, index) {
  const song = reference.cancion || reference; const id = String(reference.cancionId || song.id || ''); const row = document.createElement('article'); row.className = 'playlist-item';
  const number = document.createElement('span'); number.className = 'playlist-item-number'; number.textContent = String(index + 1).padStart(2, '0');
  const copy = document.createElement('div'); copy.className = 'playlist-item-copy'; const h = document.createElement('h3'); h.textContent = song.titulo || 'Canción'; const p = document.createElement('p'); p.textContent = [song.artista, song.categoria].filter(Boolean).join(' · ') || 'Letra y acordes'; copy.append(h, p);
  const actions = document.createElement('div'); actions.className = 'playlist-item-actions'; const open = document.createElement('a'); open.className = 'playlist-open-link'; open.href = `cancion.html?id=${encodeURIComponent(id)}`; open.textContent = 'Abrir letra'; actions.append(...orderButtons(playlist, index), open);
  if (playlist.tipo !== 'favoritos' && !playlist.curada) { const del = document.createElement('button'); del.type = 'button'; del.textContent = '×'; del.title = 'Quitar de la lista'; del.addEventListener('click', async () => { const accepted = await confirmPlaylistAction({ title: 'Quitar canción', message: `“${song.titulo || 'Esta canción'}” dejará de formar parte de “${playlist.nombre}”.`, confirmLabel: 'Quitar canción' }); if (!accepted) return; playlist.items = playlist.items.filter(item => String(item.cancionId) !== id); touchAndSave(playlist); render(); }); actions.append(del); }
  row.append(number, copy, actions); return row;
}

function audioRow(reference, playlist, index) {
  const audio = audioById(reference.audioId) || reference.audio; const row = document.createElement('article'); row.className = 'playlist-item'; row.dataset.audioId = String(reference.audioId || audio?.id || '');
  const number = document.createElement('span'); number.className = 'playlist-item-number'; number.textContent = String(index + 1).padStart(2, '0'); const copy = document.createElement('div'); copy.className = 'playlist-item-copy';
  const h = document.createElement('h3'); h.textContent = audio?.nombre || 'Audio no disponible'; const p = document.createElement('p'); p.textContent = audio ? [providerLabels[audio.proveedor], audio.interprete].filter(Boolean).join(' · ') : 'Este audio fue retirado del catálogo.'; copy.append(h, p);
  const actions = document.createElement('div'); actions.className = 'playlist-item-actions'; actions.append(...orderButtons(playlist, index));
  if (audio) { const play = document.createElement('button'); play.className = 'playlist-play-button'; play.textContent = '▶'; play.title = 'Reproducir'; play.setAttribute('aria-label', `Reproducir ${audio.nombre || 'audio'}`); play.addEventListener('click', () => playAudio(audio)); const song = document.createElement('a'); song.className = 'playlist-open-link'; song.href = `cancion.html?id=${encodeURIComponent(audio.cancionId)}`; song.textContent = 'Ver letra'; actions.append(play, song); }
  const del = document.createElement('button'); del.className = 'playlist-remove-button'; del.textContent = '×'; del.title = 'Quitar de la lista'; del.addEventListener('click', async () => { const accepted = await confirmPlaylistAction({ title: 'Quitar audio', message: `“${audio?.nombre || 'Este audio'}” dejará de formar parte de “${playlist.nombre}”.`, confirmLabel: 'Quitar audio' }); if (!accepted) return; removeFromLocalPlaylist(playlist.id, reference.audioId); playlists = getLocalPlaylists(); render(); }); actions.append(del); row.append(number, copy, actions); row.classList.toggle('is-playing', row.dataset.audioId === currentAudioId); return row;
}

function renderDetail() {
  const detail = $('#playlistDetail'); detail.replaceChildren(); const playlist = activePlaylist(); if (!playlist) { activeId = FAVORITES_ID; return renderDetail(); }
  if (playlist.tipo === 'favoritos' && !currentUser) return renderLogin(detail);
  const back = document.createElement('button'); back.type = 'button'; back.className = 'playlist-selector-back'; back.textContent = '← Ver mis listas'; back.addEventListener('click', () => $('#playlistSelector')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const header = document.createElement('header'); header.className = 'playlist-detail-header'; const copy = document.createElement('div'); const eyebrow = document.createElement('span'); eyebrow.className = 'playlist-type'; eyebrow.textContent = typeLabel(playlist.tipo);
  const title = document.createElement('h2'); title.textContent = playlist.nombre; const count = document.createElement('p'); count.textContent = playlist.tipo === 'favoritos' ? `${itemLabel(playlist)} · sincronizada con tu perfil` : playlist.curada ? `${itemLabel(playlist)} · selección preparada por Gen` : `${itemLabel(playlist)} · ${currentUser ? 'sincronizada con tu cuenta' : 'guardada en este dispositivo'}`; copy.append(eyebrow, title, count);
  if (playlist.descripcion) { const description = document.createElement('p'); description.className = 'playlist-description'; description.textContent = playlist.descripcion; copy.append(description); }
  const actions = document.createElement('div'); actions.className = 'playlist-detail-actions';
  if (playlist.curada) {
    const save = document.createElement('button'); save.className = 'playlist-action primary'; save.textContent = 'Guardar en mis listas'; save.addEventListener('click', () => { const copy = { ...playlist, id: `playlist_${Date.now()}`, curada: undefined, creadaEn: new Date().toISOString(), actualizadaEn: new Date().toISOString(), items: playlist.items.map(item => ({ ...item })) }; playlists.push(copy); saveLocalPlaylists(playlists); activeId = copy.id; render(); }); actions.append(save);
  } else if (playlist.tipo !== 'favoritos') {
    const edit = document.createElement('button'); edit.className = 'playlist-action subtle'; edit.textContent = '✎ Editar'; edit.addEventListener('click', () => { $('#editPlaylistName').value = playlist.nombre; $('#editPlaylistDescription').value = playlist.descripcion || ''; $('#editPlaylistForm').dataset.playlistId = playlist.id; $('#editPlaylistDialog').showModal(); });
    const share = document.createElement('button'); share.className = 'playlist-action primary'; share.textContent = '↗ Compartir'; share.addEventListener('click', () => sharePlaylistFile(playlist));
    const download = document.createElement('button'); download.className = 'playlist-action subtle'; download.textContent = '↓ Guardar archivo'; download.addEventListener('click', () => void savePlaylistFile(playlist));
    const remove = document.createElement('button'); remove.className = 'playlist-action danger'; remove.textContent = 'Eliminar'; remove.addEventListener('click', async () => { const accepted = await confirmPlaylistAction({ title: 'Eliminar playlist', message: `Vas a eliminar “${playlist.nombre}” y todos sus elementos. Esta acción no se puede deshacer.`, confirmLabel: 'Eliminar playlist' }); if (!accepted) return; playlists = playlists.filter(item => item.id !== playlist.id); saveLocalPlaylists(playlists); await deleteCloudPlaylist(playlist).catch(error => console.warn('No se pudo borrar la copia sincronizada:', error)); activeId = FAVORITES_ID; render(); });
    actions.append(edit);
    if (playlist.tipo === 'canciones' && playlist.items.length) { const pdf = document.createElement('button'); pdf.className = 'playlist-action primary'; pdf.textContent = 'Crear cancionero PDF'; pdf.addEventListener('click', () => { sessionStorage.setItem('songbook_pdf_playlist', JSON.stringify({ nombre: playlist.nombre, ids: playlist.items.map(item => String(item.cancionId)).filter(Boolean) })); location.href = 'cancionero.html?crearPDF=lista'; }); actions.append(pdf); }
    actions.append(share, download, remove);
  }
  header.append(copy, actions);
  const notice = document.createElement('aside'); notice.className = 'playlist-queue-notice'; notice.hidden = playlist.tipo !== 'audio';
  notice.innerHTML = '<strong>Cola automática</strong><span>Drive, YouTube, SoundCloud, Vimeo y audios directos comparten la misma cola. Cuando termina una pista, comienza la siguiente.</span>';
  const addMore = document.createElement('aside'); addMore.className = `playlist-add-more${playlist.items.length ? '' : ' is-empty'}`;
  const addMoreCopy = document.createElement('div'); const addMoreTitle = document.createElement('strong'); addMoreTitle.textContent = playlist.items.length ? '¿Querés sumar algo más?' : 'Esta playlist está esperando contenido';
  const addMoreText = document.createElement('span'); addMoreText.textContent = playlist.tipo === 'audio' ? 'Abrí una canción, elegí una fuente compatible y tocá “+ Playlist”.' : 'Explorá el cancionero y guardá canciones desde su letra.'; addMoreCopy.append(addMoreTitle, addMoreText);
  const addMoreLink = document.createElement('a'); addMoreLink.href = 'cancionero.html#canciones'; addMoreLink.textContent = playlist.tipo === 'audio' ? 'Buscar audios' : 'Buscar canciones'; addMore.append(addMoreCopy, addMoreLink);
  addMore.hidden = playlist.tipo === 'favoritos';
  const player = document.createElement('div'); player.id = 'playlistPlayer'; player.className = 'playlist-player'; player.hidden = true; const items = document.createElement('div'); items.className = 'playlist-items';
  playlist.items.forEach((reference, index) => items.append(playlist.tipo === 'audio' ? audioRow(reference, playlist, index) : songRow(reference, playlist, index)));
  if (!playlist.items.length && !favoritesLoading && playlist.tipo === 'favoritos') { const empty = document.createElement('div'); empty.className = 'playlist-empty compact'; empty.innerHTML = '<div><h2>No tienes favoritos</h2><p>Descubre nuevas canciones y usa el corazón para guardarlas acá.</p><a class="playlist-action" href="cancionero.html#canciones">Descubrir canciones</a></div>'; items.append(empty); }
  detail.append(back, header, notice, addMore, player, items);
}
function render() { renderList(); renderDetail(); }

$('#createPlaylist').addEventListener('click', () => { $('#createPlaylistDialog').showModal(); $('#playlistName').focus(); });
$('#cancelPlaylist').addEventListener('click', () => $('#createPlaylistDialog').close());
$('#cancelEditPlaylist').addEventListener('click', () => $('#editPlaylistDialog').close());
$('#editPlaylistForm').addEventListener('submit', event => { event.preventDefault(); const playlist = playlists.find(item => item.id === event.currentTarget.dataset.playlistId); if (!playlist) return; const data = new FormData(event.currentTarget); playlist.nombre = String(data.get('nombre') || '').trim().slice(0, 60); playlist.descripcion = String(data.get('descripcion') || '').trim().slice(0, 180); touchAndSave(playlist); $('#editPlaylistDialog').close(); render(); });
$('#createPlaylistForm').addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get('nombre') || '').trim(); if (!name) return; const playlist = { id: `playlist_${Date.now()}`, nombre: name, tipo: data.get('tipo') === 'canciones' ? 'canciones' : 'audio', creadaEn: new Date().toISOString(), items: [] }; playlists.push(playlist); saveLocalPlaylists(playlists); activeId = playlist.id; event.currentTarget.reset(); $('#createPlaylistDialog').close(); render(); });

async function importPlaylistFile(file) {
  try {
    if (!file?.name?.toLowerCase().endsWith('.playlistgen')) throw new Error('El archivo no tiene extensión .playlistgen.');
    if (file.size > 1024 * 1024) throw new Error('La playlist supera el límite de 1 MB.');
    const data = JSON.parse(await file.text());
    if (![1, 2, undefined].includes(data.v) || !Array.isArray(data.items) || data.items.length > 500) throw new Error('La estructura o versión de la playlist no es válida.');
    const tipo = data.tipo === 'canciones' ? 'canciones' : data.tipo === 'audio' ? 'audio' : null;
    if (!tipo) throw new Error('El tipo de playlist no es válido.');
    const items = data.items.filter(item => item && typeof item === 'object' && (tipo === 'audio' ? item.audioId && item.audio && isQueueCompatibleAudio(item.audio) : item.cancionId)).slice(0, 500);
    if (items.length !== data.items.length) throw new Error('La playlist contiene elementos incompletos o fuentes que no admiten avance automático.');
    const playlist = { id: `playlist_${Date.now()}`, nombre: String(data.nombre || 'Lista importada').trim().slice(0, 60), tipo, creadaEn: new Date().toISOString(), items };
    playlists.push(playlist); saveLocalPlaylists(playlists); activeId = playlist.id; render();
  } catch (error) { const message = error instanceof SyntaxError ? 'El archivo no contiene datos JSON válidos.' : error?.message || 'El archivo no es una playlist de Gen válida.'; showPlaylistStatus(message, true); alert(message); }
}

async function importNativePlaylistIfPresent() {
  const payload = sessionStorage.getItem('native_playlist_import');
  if (!payload) return;
  sessionStorage.removeItem('native_playlist_import');
  await importPlaylistFile(new File([payload], 'playlist.playlistgen', { type: 'application/vnd.paginagen.playlist+json' }));
  history.replaceState(null, '', 'playlist.html');
}

$('#playlistImport').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (file) await importPlaylistFile(file);
  event.target.value = '';
});

async function loadFavorites(user) { favoritesLoading = true; render(); try { favoriteSongs = await DatabaseService.getFavoritosUsuario(user.uid); } catch (error) { console.error('No se pudieron cargar los favoritos:', error); favoriteSongs = []; } finally { favoritesLoading = false; render(); } }

async function connectAccountPlaylists() {
  try {
    const firebaseModule = await import('../aaglobal/firebase-config-cancionero.js?v=20260819-lists-v2');
    DatabaseService = firebaseModule.DatabaseService;
    if (!window.firebaseUtils?.onAuthStateChanged || !window.firebaseAuth) return;
    window.firebaseUtils.onAuthStateChanged(window.firebaseAuth, async user => {
      currentUser = user || null;
      favoriteSongs = [];
      favoritesLoading = Boolean(user);
      if (user) {
        try { playlists = sanitizeAudioPlaylists(await mergeCloudPlaylists(user.uid)); saveLocalPlaylists(playlists); }
        catch (error) { playlists = getLocalPlaylists(); console.warn('Se mantienen las listas de esta cuenta en el dispositivo:', error); }
        void loadFavorites(user);
      } else {
        playlists = getLocalPlaylists();
        favoritesLoading = false;
        render();
      }
    });
  } catch (error) {
    favoritesLoading = false;
    console.warn('Las listas siguen disponibles sin conexión; la cuenta se sincronizará al volver a abrir con internet.', error);
    render();
  }
}

async function init() {
  try { const response = await fetch('../datos/cancionero/listas-curadas.json', { cache: 'no-cache' }); if (response.ok) { const data = await response.json(); if (Array.isArray(data.playlists)) curatedPlaylists = data.playlists; } } catch (error) { console.warn('Se usan las selecciones incluidas en la página:', error); }
  try { catalog = await loadAudioCatalog(); } catch { catalog = []; }
  playlists = sanitizeAudioPlaylists(playlists); saveLocalPlaylists(playlists);
  const shared = playlistFromLocation();
  if (shared) {
    if (shared.tipo === 'audio') shared.items = shared.items.filter(item => item?.audio && isQueueCompatibleAudio(item.audio));
    const panel = $('#sharedPlaylist'); panel.hidden = false; const h = document.createElement('h2'); h.textContent = `Lista compartida: ${shared.nombre || 'Sin nombre'}`; const p = document.createElement('p'); p.textContent = `${typeLabel(shared.tipo)} · ${shared.items.length} elementos compatibles. Podés guardarla en este dispositivo.`; const button = document.createElement('button'); button.className = 'playlist-action'; button.type = 'button'; button.textContent = 'Guardar lista'; button.addEventListener('click', () => { const playlist = { id: `playlist_${Date.now()}`, nombre: String(shared.nombre || 'Lista compartida'), tipo: shared.tipo, creadaEn: new Date().toISOString(), items: shared.items }; playlists.push(playlist); saveLocalPlaylists(playlists); activeId = playlist.id; history.replaceState(null, '', location.pathname); panel.hidden = true; render(); }); panel.append(h, p, button);
  }
  await importNativePlaylistIfPresent();
  render();
  void connectAccountPlaylists();
}
init();
