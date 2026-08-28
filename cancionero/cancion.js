import { DatabaseService } from '../aaglobal/firebase-config-cancionero.js?v=20260818-song-fallback';
import { transposeChord, convertChordNotation } from './chord-engine.js';
import { renderSongContent } from './song-content.js?v=20260825-tabs-visible-hidden';
import { renderChordDiagram, chordShapeSummary } from './chord-diagrams.js?v=20260804-guide-dock-2';
import { addSongToLocalPlaylist, addToLocalPlaylist, getLocalPlaylists, initializePlaylistStore, isQueueCompatibleAudio, loadAudiosForSong, playerDescriptor, providerLabels } from './audio-catalog.js?v=20260827-unified-playlists';
import { clearMediaSession, connectMediaSession } from './media-session.js?v=20260825-1';
import { hasNativeAudio, nativePause, nativePlay, nativeStop, playNativeAudio } from './native-audio.js?v=20260825-1';

const audioTypeLabels = {
  guia: 'Guía de la canción', oficial: 'Versión oficial', en_vivo: 'En vivo', cover: 'Cover', remix: 'Remix',
  instrumental: 'Instrumental', voces: 'Voces', otra: 'Otro'
};

const $ = (selector) => document.querySelector(selector);
window.addEventListener('gen:native-audio-error', event => showToast(event.detail?.message || 'No pudimos reproducir este audio.'));
const TEXT_CLASSES = ['texto-pequeno', 'texto-normal', 'texto-grande', 'texto-extra-grande', 'texto-muy-grande', 'texto-enorme', 'texto-maximo'];
let pendingPlaylistAudio = null;
let pendingPlaylistSong = null;
let playlistStoreReady = initializePlaylistStore();
const state = {
  song: null,
  audios: [],
  selectedAudioId: null,
  transpose: 0,
  textSize: 2,
  speed: 5,
  notation: 'american',
  showChords: true,
  tabMode: 'expanded',
  toolsCollapsed: false,
  mobileToolsOpen: false,
  autoScroll: false,
  autoScrollSession: false,
  scrollFrame: null,
  scrollPrevious: 0,
  scrollAccumulator: 0,
  drawerChord: 'C',
  drawerInstrument: 'guitar',
  usedChords: [],
  guideInstrument: 'guitar',
  guideScale: 1,
  guideDockVisible: false,
  guideLastFocus: null,
  lastFocus: null,
  liked: false,
  likeBusy: false,
  toastTimer: null
};

function offlineSong(id) {
  try {
    const songs = JSON.parse(localStorage.getItem('offline_data_canciones') || '[]');
    return Array.isArray(songs) ? songs.find((song) => String(song.id) === String(id)) || null : null;
  } catch { return null; }
}

async function loadSong(id) {
  if (new URLSearchParams(window.location.search).get('preview') === '1') {
    const adminPreview = new URLSearchParams(window.location.search).get('admin') === '1';
    const storageKey = adminPreview ? 'gen_admin_song_preview' : 'gen_song_submission_draft';
    try { state.song = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { state.song = null; }
    if (!state.song) return showError('No encontramos el borrador de la canción.');
    state.song.id = 'preview';
    document.body.classList.add('song-preview-mode');
    renderSong();
    setupPreviewMode(adminPreview);
    return;
  }
  const local = offlineSong(id);
  try {
    state.song = await DatabaseService.getCancionPorId(id) || local;
  } catch {
    state.song = local;
  }
  if (!state.song) return showError('No encontramos esta canción.');
  renderSong();
  if (state.song.origen !== 'estatico') void incrementView(id);
  if (!hasLikesCount(state.song)) void loadDailyLikes(id);
  setupLikeState();
  void loadSongAudios(id);
}

async function loadSongAudios(songId) {
    try {
        state.audios = (await loadAudiosForSong(songId))
      .sort((a, b) => Number(Boolean(b.versionPrincipal || b.esPrincipal)) - Number(Boolean(a.versionPrincipal || a.esPrincipal)) || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
    state.selectedAudioId = localStorage.getItem(`song_audio_version:${songId}`);
    renderSongAudios();
  } catch (error) {
    console.warn('No se pudo cargar el catálogo estático de audios:', error);
    state.audios = [];
    renderSongAudios();
  }
}

function renderSongAudios() {
  const section = $('#songAudioSection');
  const list = $('#songAudioList');
  if (!section || !list) return;
  const active = $('#songAudioActive');
  if (active) {
    resetFloatingPlayer(active);
    active.replaceChildren();
    active.hidden = true;
    if (active.parentElement === list) section.append(active);
  }
  section.hidden = state.audios.length === 0;
  list.replaceChildren();
  if (!state.audios.length) return;
  const versionId = audio => String(audio.versionId || `legacy-${[audio.cancionId, audio.tipo, audio.version, audio.versionVocal, audio.tipoVoz, audio.interprete, audio.idioma].join('|').toLowerCase()}`);
  const versionMap = new Map();
  state.audios.forEach(audio => {
    const id = versionId(audio);
    if (!versionMap.has(id)) versionMap.set(id, []);
    versionMap.get(id).push(audio);
  });
  const versions = [...versionMap.entries()].map(([id, sources]) => ({
    id, sources,
    principal: sources.some(audio => audio.versionPrincipal || audio.esPrincipal),
    representative: sources.find(audio => audio.esPrincipal) || sources[0]
  })).sort((a, b) => Number(b.principal) - Number(a.principal));
  const original = versions.find(version => version.principal) || versions[0];
  if (!versions.some(version => version.id === String(state.selectedAudioId))) state.selectedAudioId = original.id;
  const selectedVersion = versions.find(version => version.id === String(state.selectedAudioId)) || original;
  const sourceStorageKey = `song_audio_source:${state.song?.id}:${selectedVersion.id}`;
  const storedSourceId = localStorage.getItem(sourceStorageKey);
  let selectedAudio = selectedVersion.sources.find(source => String(source.id) === String(storedSourceId)) || selectedVersion.representative;
  const sourceSummary = sources => {
    const labels = [...new Set(sources.map(source => providerLabels[source.proveedor] || 'Enlace'))];
    return labels.length === 1 ? labels[0] : `${labels.length} fuentes: ${labels.join(', ')}`;
  };
  const picker = $('#songAudioVersionPicker');
  const select = $('#songAudioVersion');
  if (picker && select) {
    picker.hidden = versions.length < 2;
    select.replaceChildren();
    versions.forEach(version => {
      const audio = version.representative;
      const category = audioTypeLabels[audio.tipo] || 'Otro';
      const versionName = audio.tipo === 'voces'
        ? [category, audio.versionVocal, audio.tipoVoz].filter(Boolean).join(' · ')
        : category;
      const interpreter = String(audio.interprete || '');
      const detail = interpreter && !versionName.toLocaleLowerCase('es').includes(interpreter.toLocaleLowerCase('es'))
        ? `${versionName} · ${interpreter}`
        : versionName;
      select.add(new Option(`${detail} · ${sourceSummary(version.sources)}`, version.id));
    });
    select.value = selectedVersion.id;
    select.onchange = () => {
      state.selectedAudioId = select.value;
      localStorage.setItem(`song_audio_version:${state.song?.id}`, state.selectedAudioId);
      renderSongAudios();
    };
  }
  [selectedAudio].forEach(audio => {
    const card = document.createElement('article');
    card.className = `song-audio-card${selectedVersion.principal ? ' is-primary' : ''}`;
    const badge = document.createElement('span');
    badge.className = 'song-audio-provider';
    badge.textContent = selectedVersion.principal
      ? `Audio guía · ${providerLabels[audio.proveedor] || 'Enlace'}`
      : (providerLabels[audio.proveedor] || 'Enlace');
    const copy = document.createElement('div');
    copy.className = 'song-audio-copy';
    const title = document.createElement('h3'); title.textContent = audio.nombre || `${state.song?.titulo || 'Canción'} — ${audio.version || 'Audio'}`;
    const detail = document.createElement('p');
    const contentDetail = audio.tipo === 'voces'
      ? [audio.versionVocal, audio.tipoVoz].filter(Boolean).join(' · ')
      : audioTypeLabels[audio.tipo] || '';
    detail.textContent = [audio.interprete, contentDetail, providerLabels[audio.proveedor]].filter(Boolean).join(' · ');
    copy.append(badge, title, detail);
    if (audio.descripcion) {
      const description = document.createElement('p');
      description.className = 'song-audio-description';
      description.textContent = audio.descripcion;
      copy.append(description);
    }
    const actions = document.createElement('div'); actions.className = 'song-audio-actions';
    if (selectedVersion.sources.length > 1) {
      const sourceSelect = document.createElement('select'); sourceSelect.className = 'song-audio-source-select'; sourceSelect.setAttribute('aria-label', 'Elegir fuente de audio');
      const providerCounts = new Map();
      selectedVersion.sources.forEach(source => providerCounts.set(source.proveedor, (providerCounts.get(source.proveedor) || 0) + 1));
      const providerIndexes = new Map();
      selectedVersion.sources.forEach(source => {
        const provider = providerLabels[source.proveedor] || 'Enlace';
        const index = (providerIndexes.get(source.proveedor) || 0) + 1;
        providerIndexes.set(source.proveedor, index);
        const label = providerCounts.get(source.proveedor) > 1 ? `${provider} ${index}` : provider;
        sourceSelect.add(new Option(label, source.id));
      });
      sourceSelect.value = selectedAudio.id;
      sourceSelect.addEventListener('change', () => {
        const source = selectedVersion.sources.find(item => String(item.id) === sourceSelect.value);
        if (!source) return;
        localStorage.setItem(sourceStorageKey, String(source.id));
        renderSongAudios();
      });
      actions.append(sourceSelect);
    }
    const play = document.createElement('button'); play.type = 'button'; play.className = 'audio-play-button';
    const descriptor = playerDescriptor(audio);
    play.textContent = descriptor.mode === 'external' ? 'Abrir ↗' : '▶ Escuchar';
    play.addEventListener('click', () => playSongAudio(audio, card));
    actions.append(play);
    if (isQueueCompatibleAudio(audio)) {
      const save = document.createElement('button'); save.type = 'button'; save.className = 'audio-save-button'; save.textContent = '+ Playlist';
      save.addEventListener('click', () => saveAudioToPlaylist(audio)); actions.append(save);
    }
    card.append(copy, actions); list.append(card);
  });
}

function playSongAudio(audio, card) {
  const descriptor = playerDescriptor(audio);
  clearMediaSession();
  if (descriptor.mode !== 'audio' || !hasNativeAudio()) nativeStop();
  if (descriptor.mode === 'external') {
    window.open(descriptor.url, '_blank', 'noopener,noreferrer');
    return;
  }
  const active = $('#songAudioActive');
  if (!active) return;
  resetFloatingPlayer(active);
  card?.after(active);
  active.replaceChildren();
  const isDriveAudio = descriptor.kind === 'drive-audio';
  active.classList.toggle('is-resizable-player', descriptor.mode === 'iframe' && !isDriveAudio);
  active.classList.toggle('is-drive-audio-player', isDriveAudio);
  active.style.removeProperty('width');
  active.style.removeProperty('height');
  active.hidden = false;
  const heading = document.createElement('div'); heading.className = 'song-audio-now';
  const label = document.createElement('span'); label.textContent = 'Reproduciendo';
  const title = document.createElement('strong'); title.textContent = audio.nombre || 'Audio de la canción';
  const close = document.createElement('button'); close.type = 'button'; close.setAttribute('aria-label', 'Cerrar reproductor'); close.textContent = '×';
  close.addEventListener('click', () => { clearMediaSession(); nativeStop(); active.replaceChildren(); active.hidden = true; });
  const headingActions = document.createElement('div'); headingActions.className = 'song-audio-now-actions';
  headingActions.append(close);
  if (descriptor.mode === 'iframe' && !isDriveAudio) addFloatingPlayerButton(headingActions, active);
  heading.append(label, title, headingActions);
  if (descriptor.mode === 'audio') {
    if (hasNativeAudio() && playNativeAudio(audio, descriptor, 'Cancionero Gen')) {
      const status = document.createElement('p'); status.className = 'song-audio-native-status'; status.textContent = 'Reproducción de Android activa. Podés cambiar de sección sin cortar la canción.';
      const controls = document.createElement('div'); controls.className = 'song-audio-native-controls';
      const pause = document.createElement('button'); pause.type = 'button'; pause.textContent = 'Pausar'; pause.addEventListener('click', nativePause);
      const resume = document.createElement('button'); resume.type = 'button'; resume.textContent = 'Reproducir'; resume.addEventListener('click', nativePlay);
      const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = 'Detener'; stop.addEventListener('click', () => { nativeStop(); active.replaceChildren(); active.hidden = true; });
      controls.append(pause, resume, stop); active.append(heading, status, controls); active.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return;
    }
    const player = document.createElement('audio'); player.controls = true; player.autoplay = true; player.preload = 'metadata'; player.crossOrigin = 'anonymous'; player.src = descriptor.url;
    if (descriptor.fallbackMode === 'iframe' && descriptor.fallbackUrl) {
      player.addEventListener('error', () => {
        clearMediaSession(player);
        const frame = document.createElement('iframe'); frame.src = descriptor.fallbackUrl; frame.title = 'Reproductor de Google Drive';
        frame.allow = 'autoplay; encrypted-media; picture-in-picture'; frame.allowFullscreen = true; frame.loading = 'eager';
        active.classList.add('is-resizable-player');
        addFloatingPlayerButton(headingActions, active);
        player.replaceWith(frame);
      }, { once: true });
    }
    active.append(heading, player);
    connectMediaSession(player, audio, { album: 'Cancionero Gen' });
    const currentIndex = state.audios.findIndex(item => String(item.id) === String(audio.id));
    const nextDescriptor = currentIndex >= 0 && state.audios[currentIndex + 1] ? playerDescriptor(state.audios[currentIndex + 1]) : null;
    if (nextDescriptor?.mode === 'audio') window.GenExternalAudio?.preload(nextDescriptor.url);
    void player.play().catch(error => console.warn('El navegador espera que pulses reproducir:', error));
  } else {
    const frame = document.createElement('iframe'); frame.src = descriptor.url; frame.title = descriptor.title || 'Reproductor externo';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture'; frame.allowFullscreen = true; frame.loading = 'eager';
    if (isDriveAudio) {
      const playerShell = document.createElement('div'); playerShell.className = 'song-drive-player-frame'; playerShell.append(frame); active.append(heading, playerShell);
    } else active.append(heading, frame);
  }
  active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function addFloatingPlayerButton(container, player) {
  if (container.querySelector('.song-audio-popout')) return;
  const popout = document.createElement('button'); popout.type = 'button'; popout.className = 'song-audio-popout';
  popout.textContent = 'Ventana'; popout.setAttribute('aria-label', 'Mostrar como ventana flotante dentro de la página');
  popout.addEventListener('click', () => setFloatingPlayer(player, !player.classList.contains('is-floating')));
  container.insertBefore(popout, container.querySelector('[aria-label="Cerrar reproductor"]'));
}

function resetFloatingPlayer(player) {
  player.classList.remove('is-floating');
  ['top', 'right', 'bottom', 'left', 'width', 'height'].forEach(property => player.style.removeProperty(property));
}

function setFloatingPlayer(player, floating) {
  const button = player.querySelector('.song-audio-popout');
  if (!floating) {
    resetFloatingPlayer(player);
    if (button) {
      button.textContent = 'Ventana';
      button.setAttribute('aria-label', 'Mostrar como ventana flotante dentro de la página');
    }
    player.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  const current = player.getBoundingClientRect();
  const width = Math.min(Math.max(current.width, 480), window.innerWidth - 48);
  const height = Math.min(Math.max(current.height, 300), window.innerHeight - 48);
  const guide = $('#quickGuideDock');
  const guideSpace = state.guideDockVisible && guide && !guide.hidden
    ? guide.getBoundingClientRect().width + 48
    : 24;
  const right = Math.max(24, Math.min(guideSpace, window.innerWidth - width - 24));
  player.classList.add('is-floating');
  player.style.width = `${Math.round(width)}px`;
  player.style.height = `${Math.round(height)}px`;
  player.style.top = `${Math.max(24, Math.min(120, window.innerHeight - height - 24))}px`;
  player.style.right = `${Math.round(right)}px`;
  player.style.left = 'auto';
  if (button) {
    button.textContent = 'Integrar';
    button.setAttribute('aria-label', 'Devolver el reproductor a la canción');
  }
}

function saveAudioToPlaylist(audio) {
  pendingPlaylistAudio = audio;
  pendingPlaylistSong = null;
  const dialog = $('#audioPlaylistDialog');
  if (!dialog) return;
  $('#audioPlaylistDialogTitle').textContent = 'Agregar a una playlist';
  $('#newAudioPlaylistName').placeholder = 'Ej.: Música para el encuentro';
  $('#audioPlaylistSelectionTitle').textContent = audio.nombre
    ? `Elegí dónde guardar “${audio.nombre}”.`
    : 'Elegí dónde guardar esta versión.';
  renderAudioPlaylistChoices();
  $('#newAudioPlaylistName').value = '';
  dialog.showModal();
  void playlistStoreReady.then(() => {
    if (dialog.open && pendingPlaylistAudio?.id === audio.id) renderAudioPlaylistChoices();
  });
}

function playlistHasAudio(playlist, audio) {
  return playlist.items?.some(item => String(item.audioId) === String(audio.id));
}

function finishPlaylistSave(name, playlistId = '') {
  if ((!pendingPlaylistAudio && !pendingPlaylistSong) || !name.trim()) return;
  const playlist = pendingPlaylistAudio
    ? addToLocalPlaylist(pendingPlaylistAudio, name, playlistId)
    : addSongToLocalPlaylist(pendingPlaylistSong, name);
  if (!playlist) { showToast('No pudimos agregar esta fuente a la playlist.'); return; }
  showToast(`Guardada en “${playlist.nombre}”.`);
  $('#audioPlaylistDialog')?.close();
}

function renderAudioPlaylistChoices() {
  const container = $('#audioPlaylistChoices');
  if (!container || (!pendingPlaylistAudio && !pendingPlaylistSong)) return;
  const expectedType = pendingPlaylistAudio ? 'audio' : 'canciones';
  const playlists = getLocalPlaylists().filter(item => item.tipo === expectedType);
  container.replaceChildren();
  if (!playlists.length) {
    const empty = document.createElement('p');
    empty.className = 'audio-playlist-empty';
    empty.textContent = pendingPlaylistAudio ? 'Todavía no creaste playlists de audio. Podés crear la primera acá abajo.' : 'Todavía no creaste listas de canciones. Podés crear la primera acá abajo.';
    container.append(empty);
    return;
  }
  playlists.forEach(playlist => {
    const saved = pendingPlaylistAudio
      ? playlistHasAudio(playlist, pendingPlaylistAudio)
      : playlist.items?.some(item => String(item.cancionId) === String(pendingPlaylistSong.id));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'audio-playlist-choice';
    button.disabled = saved;
    const copy = document.createElement('span');
    const title = document.createElement('strong'); title.textContent = playlist.nombre;
    const count = document.createElement('small');
    const amount = playlist.items?.length || 0;
    count.textContent = `${amount} ${pendingPlaylistAudio ? `audio${amount === 1 ? '' : 's'}` : `canción${amount === 1 ? '' : 'es'}`}`;
    copy.append(title, count);
    const action = document.createElement('b'); action.textContent = saved ? 'Ya guardada' : 'Agregar';
    button.append(copy, action);
    button.addEventListener('click', () => finishPlaylistSave(playlist.nombre, playlist.id));
    container.append(button);
  });
}

$('#closeAudioPlaylistDialog')?.addEventListener('click', () => $('#audioPlaylistDialog')?.close());
$('#audioPlaylistDialog')?.addEventListener('click', event => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
$('#audioPlaylistDialog')?.addEventListener('close', () => { pendingPlaylistAudio = null; pendingPlaylistSong = null; });
$('#createAudioPlaylistForm')?.addEventListener('submit', event => {
  event.preventDefault();
  finishPlaylistSave($('#newAudioPlaylistName').value);
});

function saveSongToList() {
  if (!state.song) return;
  pendingPlaylistAudio = null;
  pendingPlaylistSong = state.song;
  $('#audioPlaylistDialogTitle').textContent = 'Guardar canción en una lista';
  $('#audioPlaylistSelectionTitle').textContent = `Elegí dónde guardar “${state.song.titulo || 'esta canción'}”.`;
  $('#newAudioPlaylistName').placeholder = 'Ej.: Canciones para el encuentro';
  renderAudioPlaylistChoices();
  $('#newAudioPlaylistName').value = '';
  $('#audioPlaylistDialog')?.showModal();
  void playlistStoreReady.then(() => {
    if ($('#audioPlaylistDialog')?.open && pendingPlaylistSong) renderAudioPlaylistChoices();
  });
}

$('#saveSongToList')?.addEventListener('click', saveSongToList);
window.addEventListener('gen:auth-changed', () => {
  playlistStoreReady = initializePlaylistStore();
  void playlistStoreReady.then(() => {
    if ($('#audioPlaylistDialog')?.open) renderAudioPlaylistChoices();
  });
});

async function incrementView(id) {
  const key = `song_viewed:${id}`;
  const lastView = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - lastView < 30 * 60 * 1000) return;
  sessionStorage.setItem(key, String(Date.now()));
  const incremented = await DatabaseService.incrementarReproducciones(id);
  if (!incremented || !state.song || String(state.song.id) !== String(id)) return;
  state.song.reproducciones = Number(state.song.reproducciones || 0) + 1;
  $('#cancionVistas').textContent = formatNumber(state.song.reproducciones);
}

function hasLikesCount(song) {
  return ['likesCount', 'likes'].some((field) =>
    song?.[field] !== null && song?.[field] !== '' && Number.isFinite(Number(song?.[field]))
  );
}

async function loadDailyLikes(id) {
  try {
    const response = await fetch('../datos/cancionero/buscar.json', { cache: 'no-cache' });
    if (!response.ok) return;
    const summary = (await response.json()).canciones?.find((song) => String(song.id) === String(id));
    if (summary) $('#cancionLikes').textContent = formatNumber(summary.likesCount);
  } catch { /* El contador del documento queda como respaldo. */ }
}

function renderSong() {
  const song = state.song;
  const title = song.titulo || 'Sin título';
  const artist = song.artista || 'Desconocido';
  document.title = `${title} - Cancionero Gen`;
  $('#headerTitulo').textContent = title;
  $('#headerArtista span').textContent = artist;
  $('#headerArtista').href = `artista.html?artista=${encodeURIComponent(artist)}`;
  $('#cancionCategoria').textContent = categoryLabel(song.categoria);
  $('#cancionVistas').textContent = formatNumber(song.reproducciones || 0);
  $('#cancionLikes').textContent = formatNumber(song.likesCount || song.likes || 0);
  $('#lyricsTitle').textContent = title;
  renderLyrics();
  syncControls();
}

function categoryLabel(category) {
  return ({ misa: 'Misa', gen: 'Gen', fogon: 'Fogón' })[category] || 'Cancionero';
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-AR').format(Number(value) || 0);
}

function displayChord(raw) {
  const transposed = transposeChord(raw, state.transpose, { notation: state.notation });
  return transposed || convertChordNotation(raw, state.notation) || raw;
}

function renderLyrics() {
  const container = $('#letraContent');
  container.setAttribute('aria-busy', 'false');
  TEXT_CLASSES.forEach((name) => container.classList.remove(name));
  container.classList.add(TEXT_CLASSES[state.textSize]);
  const lyric = String(state.song?.letra || '').replace(/\r\n?/g, '\n');
  if (!lyric.trim()) {
    const empty = document.createElement('p');
    empty.textContent = 'La letra todavía no está disponible.';
    container.replaceChildren(empty);
    renderUsedChords([]);
    return;
  }

  const chords = renderSongContent(container, lyric, {
    showChords: state.showChords,
    tabMode: state.tabMode,
    displayChord,
    onChordClick: openChordDrawer,
    onTabReference: focusTabReference
  });
  container.classList.toggle('lyrics-only', !state.showChords);
  renderUsedChords(chords.map(displayChord));
}

function renderUsedChords(chords) {
  const unique = [...new Set(chords)];
  state.usedChords = unique;
  $('#quickGuideCount').textContent = unique.length
    ? `${unique.length} acorde${unique.length === 1 ? '' : 's'} utilizado${unique.length === 1 ? '' : 's'}`
    : 'Sin acordes cargados';
  $('#openQuickGuide').disabled = unique.length === 0;
  if (!$('#quickGuideModal').hidden) renderQuickGuide();
}

function setupPreviewMode(adminPreview = false) {
  const banner = $('#songPreviewBanner');
  banner.hidden = false;
  const copy = banner.querySelector('div:first-child');
  if (adminPreview) {
    copy.querySelector('strong').textContent = 'Vista previa desde Administración';
    copy.querySelector('small').textContent = 'Esta es la representación exacta que tendrá la canción al publicarse.';
    $('#previewSubmitSong').hidden = true;
    $('#previewEditSong').textContent = 'Volver a Administración';
  }
  $('#previewEditSong').onclick = () => {
    window.location.href = adminPreview ? '../admin/admin.html?restaurarCancion=1#cancionero' : 'cancionero.html?editarAporte=1';
  };
  $('#previewSubmitSong').onclick = submitPreviewSong;
  $('.back-btn').href = adminPreview ? '../admin/admin.html?restaurarCancion=1#cancionero' : 'cancionero.html?editarAporte=1';
}

async function submitPreviewSong() {
  const user = window.firebaseAuth?.currentUser;
  if (!user) {
    if (typeof window.genOpenAuthModal === 'function') window.genOpenAuthModal();
    return showToast('Iniciá sesión para enviar la canción.');
  }
  const button = $('#previewSubmitSong');
  button.disabled = true;
  button.textContent = 'Enviando…';
  try {
    const payload = {
      ...state.song,
      id: undefined,
      usuarioId: user.uid,
      creadoPorNombre: String(user.displayName || user.email?.split('@')[0] || 'Perfil sin nombre').slice(0, 120)
    };
    delete payload.id;
    const songId = await DatabaseService.agregarCancion(payload);
    sessionStorage.setItem('gen_pending_song_audio_target', JSON.stringify({
      id: songId, titulo: payload.titulo, artista: payload.artista || 'Sin artista',
      categoria: payload.categoria, ownerUid: user.uid, pendiente: true
    }));
    sessionStorage.removeItem('gen_song_submission_draft');
    $('#previewSubmittedOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  } catch (error) {
    console.error('No se pudo enviar la canción:', error);
    showToast(error.message || 'No pudimos enviar la canción.');
    button.disabled = false;
    button.textContent = 'Enviar para revisión';
  }
}

$('#previewAddAudio').addEventListener('click', () => {
  window.location.href = 'subir-audio.html?cancionPendiente=1';
});

function syncControls() {
  const tone = state.transpose === 0 ? 'Original' : `${state.transpose > 0 ? '+' : ''}${state.transpose}`;
  $('#tonoActual').textContent = tone;
  $('#tonoControlValue').textContent = tone;
  $('#velocidadActual').textContent = speedLabel(state.speed);
  $('#scrollSpeed').value = String(state.speed);
  const button = $('#btnCifrado');
  button.querySelector('.cifrado-sample').textContent = state.notation === 'american' ? 'C' : 'Do';
  button.querySelector('strong').textContent = state.notation === 'american' ? 'C → Do' : 'Do → C';
  button.setAttribute('aria-pressed', String(state.notation === 'spanish'));
  const chordsButton = $('#btnMostrarAcordes');
  chordsButton.setAttribute('aria-pressed', String(state.showChords));
  chordsButton.querySelector('span:nth-child(2)').textContent = state.showChords ? 'Letra y acordes' : 'Solo letra';
  chordsButton.querySelector('strong').textContent = state.showChords ? 'Visibles' : 'Ocultos';
  chordsButton.classList.toggle('active', state.showChords);
  const tabsButton = $('#btnMostrarTablaturas');
  const tabLabels = { hidden: 'Ocultas', expanded: 'Visibles' };
  tabsButton.querySelector('strong').textContent = tabLabels[state.tabMode];
  tabsButton.setAttribute('aria-pressed', String(state.tabMode !== 'hidden'));
  tabsButton.classList.toggle('active', state.tabMode !== 'hidden');
  $('.lyrics-hint').innerHTML = state.showChords
    ? '<svg><use href="#i-music"/></svg>Toca un acorde para consultarlo'
    : '<svg><use href="#i-text"/></svg>Modo solo letra';
  syncToolsState();
  syncAutoScrollBar();
}

function syncToolsState() {
  const tools = $('#songTools');
  const workspace = $('.song-workspace');
  const toggle = $('#toggleTools');
  const mobile = window.matchMedia('(max-width: 900px)').matches;
  if (mobile) {
    tools.classList.remove('collapsed');
    tools.classList.toggle('mobile-open', state.mobileToolsOpen);
    tools.setAttribute('role', 'dialog');
    tools.setAttribute('aria-modal', String(state.mobileToolsOpen));
    $('#mobileToolsBackdrop').hidden = !state.mobileToolsOpen;
    const trigger = $('#mobileToolsTrigger');
    trigger.setAttribute('aria-expanded', String(state.mobileToolsOpen));
    toggle.setAttribute('aria-expanded', String(state.mobileToolsOpen));
    toggle.title = 'Cerrar herramientas';
    toggle.querySelector('span').textContent = 'Cerrar';
    document.body.classList.toggle('mobile-tools-open', state.mobileToolsOpen);
    return;
  }
  state.mobileToolsOpen = false;
  tools.classList.remove('mobile-open');
  tools.removeAttribute('role');
  tools.setAttribute('aria-modal', 'false');
  $('#mobileToolsBackdrop').hidden = true;
  document.body.classList.remove('mobile-tools-open');
  tools.classList.toggle('collapsed', state.toolsCollapsed);
  workspace.classList.toggle('tools-collapsed', state.toolsCollapsed);
  toggle.setAttribute('aria-expanded', String(!state.toolsCollapsed));
  toggle.title = state.toolsCollapsed ? 'Abrir herramientas' : 'Contraer herramientas';
  toggle.querySelector('span').textContent = state.toolsCollapsed ? 'Abrir' : 'Contraer';
}

function speedLabel(speed) {
  if (speed <= 3) return 'Lenta';
  if (speed <= 7) return 'Normal';
  return 'Rápida';
}

function changeTone(delta) {
  state.transpose = Math.max(-11, Math.min(11, state.transpose + delta));
  renderLyrics();
  syncControls();
}

function changeTextSize(delta) {
  state.textSize = Math.max(0, Math.min(TEXT_CLASSES.length - 1, state.textSize + delta));
  renderLyrics();
  savePreferences();
}

function changeSpeed(delta) {
  state.speed = Math.max(1, Math.min(10, state.speed + delta));
  syncControls();
  savePreferences();
}

function moveReading(direction) {
  const viewport = Math.max(320, window.innerHeight);
  const distance = state.autoScroll
    ? (direction < 0 ? viewport * 0.58 : viewport * 0.3)
    : viewport * 0.36;
  const target = Math.max(0, window.scrollY + (Math.round(distance) * direction));
  window.scrollTo({
    top: target,
    behavior: state.autoScroll ? 'instant' : 'smooth'
  });
}

function toggleNotation() {
  state.notation = state.notation === 'american' ? 'spanish' : 'american';
  renderLyrics();
  syncControls();
  savePreferences();
}

function toggleChordVisibility() {
  state.showChords = !state.showChords;
  renderLyrics();
  syncControls();
  savePreferences();
}

function toggleTabVisibility() {
  state.tabMode = state.tabMode === 'hidden' ? 'expanded' : 'hidden';
  renderLyrics();
  syncControls();
  savePreferences();
}

function focusTabReference(key) {
  if (state.tabMode === 'hidden') {
    state.tabMode = 'expanded';
    renderLyrics();
    syncControls();
    savePreferences();
  }
  requestAnimationFrame(() => {
    const target = [...document.querySelectorAll('#letraContent [data-tab-key]')]
      .find(element => element.dataset.tabKey === key);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('song-tab-highlight');
    requestAnimationFrame(() => target.classList.add('song-tab-highlight'));
    window.setTimeout(() => target.classList.remove('song-tab-highlight'), 1500);
  });
}

function toggleTools() {
  if (window.matchMedia('(max-width: 900px)').matches) {
    if (state.mobileToolsOpen) closeMobileTools();
    else openMobileTools();
    return;
  }
  state.toolsCollapsed = !state.toolsCollapsed;
  syncToolsState();
  savePreferences();
}

function openMobileTools() {
  if (!window.matchMedia('(max-width: 900px)').matches || state.mobileToolsOpen) return;
  state.mobileToolsOpen = true;
  syncToolsState();
  if (!history.state?.songToolsPanel) history.pushState({ ...(history.state || {}), songToolsPanel: true }, '');
  requestAnimationFrame(() => $('#toggleTools')?.focus());
}

function closeMobileTools({ fromHistory = false } = {}) {
  if (!state.mobileToolsOpen) return;
  state.mobileToolsOpen = false;
  syncToolsState();
  if (!fromHistory && history.state?.songToolsPanel) history.back();
  else $('#mobileToolsTrigger')?.focus();
}

function syncAutoScrollBar() {
  const dock = $('#mobileAutoScrollBar');
  if (!dock) return;
  dock.hidden = !state.autoScrollSession;
  document.body.classList.toggle('auto-scroll-controls-visible', state.autoScrollSession);
  $('#mobileScrollSpeedLabel').textContent = speedLabel(state.speed);
  $('#mobileScrollSpeedValue').textContent = `${state.speed}/10`;
  const toggle = $('#mobileScrollToggle');
  toggle.setAttribute('aria-pressed', String(state.autoScroll));
  toggle.querySelector('span').textContent = state.autoScroll ? 'Pausar' : 'Reanudar';
}

function toggleAutoScroll(force, options = {}) {
  const next = typeof force === 'boolean' ? force : !state.autoScroll;
  const keepControls = Boolean(options.keepControls || (typeof force !== 'boolean' && state.autoScrollSession));
  if (next) state.autoScrollSession = true;
  else if (!keepControls) state.autoScrollSession = false;
  if (next === state.autoScroll) {
    syncAutoScrollBar();
    return;
  }
  if (next && state.mobileToolsOpen) closeMobileTools();
  state.autoScroll = next;
  const button = $('#btnAutoScroll');
  button.classList.toggle('active', next);
  button.setAttribute('aria-pressed', String(next));
  button.querySelector('span').textContent = next ? 'Pausar auto-scroll' : 'Iniciar auto-scroll';
  if (!next) {
    cancelAnimationFrame(state.scrollFrame);
    state.scrollFrame = null;
    syncAutoScrollBar();
    return;
  }
  state.scrollPrevious = performance.now();
  state.scrollAccumulator = 0;
  state.scrollFrame = requestAnimationFrame(scrollStep);
  syncAutoScrollBar();
}

function pauseResumeAutoScroll() {
  toggleAutoScroll(!state.autoScroll, { keepControls: true });
}

function stopAutoScroll() {
  toggleAutoScroll(false, { keepControls: false });
}

function scrollStep(now) {
  if (!state.autoScroll) return;
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
    toggleAutoScroll(false);
    return;
  }
  const elapsed = Math.min(50, now - state.scrollPrevious);
  state.scrollPrevious = now;
  state.scrollAccumulator += elapsed * state.speed * 0.006;
  if (state.scrollAccumulator >= 1) {
    const pixels = Math.floor(state.scrollAccumulator);
    window.scrollBy(0, pixels);
    state.scrollAccumulator -= pixels;
  }
  state.scrollFrame = requestAnimationFrame(scrollStep);
}

function resetSettings() {
  toggleAutoScroll(false);
  state.transpose = 0;
  state.textSize = 2;
  state.speed = 5;
  state.notation = 'american';
  state.showChords = true;
  state.tabMode = 'expanded';
  renderLyrics();
  syncControls();
  savePreferences();
  showToast('Ajustes restablecidos.');
}

function openChordDrawer(chord) {
  state.drawerChord = chord;
  state.lastFocus = document.activeElement;
  $('#chordDrawerTitle').textContent = chord;
  renderDrawer();
  $('#chordDrawer').hidden = false;
  $('#chordDrawerBackdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#closeChordDrawer').focus();
}

function customChordShape(chord) {
  return null;
}

function renderDrawer() {
  const chord = state.drawerChord;
  const customShape = customChordShape(chord);
  const summary = chordShapeSummary(chord, state.notation, customShape);
  $('#guitarChordDiagram').innerHTML = renderChordDiagram(chord, 'guitar', state.notation, customShape);
  $('#pianoChordDiagram').innerHTML = renderChordDiagram(chord, 'piano', state.notation, customShape);
  $('#chordDrawerNote').textContent = summary
    ? `${summary.typeLabel}. Notas: ${summary.notes.join(' · ')}. Fórmula: ${summary.formula}.`
    : 'Todavía no tenemos una posición verificada para este acorde.';
}

function selectDrawerInstrument(instrument) {
  state.drawerInstrument = instrument;
  const guitar = instrument === 'guitar';
  $('#guitarTab').setAttribute('aria-selected', String(guitar));
  $('#pianoTab').setAttribute('aria-selected', String(!guitar));
  $('#guitarChordPanel').hidden = !guitar;
  $('#pianoChordPanel').hidden = guitar;
}

function closeChordDrawer() {
  $('#chordDrawer').hidden = true;
  $('#chordDrawerBackdrop').hidden = true;
  document.body.style.overflow = '';
  state.lastFocus?.focus?.();
}

function renderQuickGuideGrid(grid) {
  grid.classList.toggle('guide-compact', state.guideScale === 0);
  grid.classList.toggle('guide-large', state.guideScale === 2);
  grid.classList.toggle('guide-extra-compact', state.guideScale === -1);
  grid.classList.toggle('guide-extra-large', state.guideScale === 3);
  if (!state.usedChords.length) {
    const empty = document.createElement('p');
    empty.className = 'quick-guide-empty';
    empty.textContent = 'Esta canción todavía no tiene acordes cargados.';
    grid.replaceChildren(empty);
    return;
  }
  grid.replaceChildren(...state.usedChords.map((chord) => {
    const card = document.createElement('article');
    card.className = 'quick-guide-card';
    const title = document.createElement('h3');
    title.textContent = chord;
    const diagram = document.createElement('div');
    diagram.innerHTML = renderChordDiagram(chord, state.guideInstrument, state.notation, customChordShape(chord));
    card.append(title, diagram);
    return card;
  }));
}

function renderQuickGuide() {
  renderQuickGuideGrid($('#quickGuideGrid'));
  renderQuickGuideGrid($('#quickGuideDockGrid'));
  const guitar = state.guideInstrument === 'guitar';
  $('#guideGuitarTab').setAttribute('aria-selected', String(guitar));
  $('#guidePianoTab').setAttribute('aria-selected', String(!guitar));
  $('#dockGuideGuitarTab').setAttribute('aria-selected', String(guitar));
  $('#dockGuidePianoTab').setAttribute('aria-selected', String(!guitar));
}

function openQuickGuide() {
  if (!state.usedChords.length) return;
  if (state.mobileToolsOpen) closeMobileTools();
  state.guideLastFocus = document.activeElement;
  renderQuickGuide();
  $('#quickGuideBackdrop').hidden = false;
  $('#quickGuideModal').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#closeQuickGuide').focus();
}

function closeQuickGuide() {
  $('#quickGuideBackdrop').hidden = true;
  $('#quickGuideModal').hidden = true;
  document.body.style.overflow = '';
  state.guideLastFocus?.focus?.();
}

function setGuideDockVisible(visible) {
  const mobile = window.matchMedia('(max-width: 900px)').matches;
  state.guideDockVisible = Boolean(visible && !mobile && state.usedChords.length);
  $('#quickGuideDock').hidden = !state.guideDockVisible;
  $('#toggleGuideDock').setAttribute('aria-pressed', String(state.guideDockVisible));
  $('#toggleGuideDock span').textContent = state.guideDockVisible
    ? 'Ocultar junto a la letra'
    : 'Mostrar junto a la letra';
  document.body.classList.toggle('guide-dock-visible', state.guideDockVisible);
  if (state.guideDockVisible) {
    // El panel lateral pasa a ser la vista activa de la guía.
    $('#quickGuideBackdrop').hidden = true;
    $('#quickGuideModal').hidden = true;
    document.body.style.overflow = '';
    renderQuickGuide();
    updateGuideDockPosition();
    requestAnimationFrame(syncGuideDockWidth);
  }
}

function syncGuideDockWidth() {
  const dock = $('#quickGuideDock');
  if (!dock || dock.hidden || window.matchMedia('(max-width: 900px)').matches) return;
  const width = Math.round(dock.getBoundingClientRect().width);
  if (width > 0) document.documentElement.style.setProperty('--guide-dock-width', `${width}px`);
}

function updateGuideDockPosition() {
  if (!state.guideDockVisible || window.matchMedia('(max-width: 680px)').matches) return;
  const overview = $('.song-overview');
  const dock = $('#quickGuideDock');
  if (!overview || !dock) return;
  const safeTop = Math.max(110, Math.round(overview.getBoundingClientRect().bottom + 22));
  dock.style.top = `${safeTop}px`;
}

function closeGuideDock() {
  setGuideDockVisible(false);
}

function selectGuideInstrument(instrument) {
  state.guideInstrument = instrument;
  renderQuickGuide();
}

function changeGuideScale(delta) {
  state.guideScale = Math.max(-1, Math.min(3, state.guideScale + delta));
  renderQuickGuide();
}

function setupLikeState() {
  const utils = window.firebaseUtils;
  if (!utils?.onAuthStateChanged || !window.firebaseAuth) return;
  utils.onAuthStateChanged(window.firebaseAuth, async (user) => {
    state.liked = user ? await DatabaseService.getEstadoFavorito(state.song.id, user.uid).catch((error) => {
      console.error('No se pudo consultar el favorito:', error);
      return false;
    }) : false;
    syncLikeButton();
  });
}

function syncLikeButton() {
  const button = $('#likeButton');
  button.classList.toggle('active', state.liked);
  button.setAttribute('aria-pressed', String(state.liked));
  button.setAttribute('aria-label', state.liked ? 'Quitar esta canción de favoritos' : 'Agregar esta canción a favoritos');
  button.title = state.liked ? 'Quitar de favoritos' : 'Agregar a favoritos';
}

async function toggleLike() {
  const user = window.firebaseAuth?.currentUser;
  if (!user) {
    if (typeof window.genOpenAuthModal === 'function') window.genOpenAuthModal();
    else document.getElementById('auth-btn')?.click();
    showToast('Iniciá sesión para agregar canciones a favoritos.');
    return;
  }
  if (state.likeBusy) return;
  state.likeBusy = true;
  $('#likeButton').disabled = true;
  try {
    state.liked = await DatabaseService.setFavoritoCancion(state.song.id, user.uid, !state.liked);
    syncLikeButton();
    showToast(state.liked ? 'Agregada a favoritos. El contador se actualizará mañana.' : 'Quitada de favoritos. El contador se actualizará mañana.');
    window.dispatchEvent(new CustomEvent('gen:favorite-changed', {
      detail: { songId: String(state.song.id), active: state.liked }
    }));
  } catch (error) {
    console.error('No se pudo actualizar el favorito:', error);
    showToast('No pudimos actualizar tus favoritos. Intentá nuevamente.');
  } finally {
    state.likeBusy = false;
    $('#likeButton').disabled = false;
  }
}

function showToast(message) {
  const toast = $('#songToast');
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  state.toastTimer = setTimeout(() => { toast.hidden = true; }, 3600);
}

function printSong() {
  if (!state.song) return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.append(frame);

  const printDocument = frame.contentDocument;
  if (!printDocument) {
    frame.remove();
    window.print();
    return;
  }

  printDocument.open();
  printDocument.write('<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body></body></html>');
  printDocument.close();
  printDocument.title = `${state.song.titulo || 'Canción'} · Cancionero Gen`;

  const style = printDocument.createElement('style');
  style.textContent = `
    @page { size: A4; margin: 15mm 17mm 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #19151f; background: #fff; font-family: Arial, sans-serif; }
    .print-header { margin: 0 0 10mm; padding: 0 0 6mm; border-bottom: 1.5px solid #2c2434; }
    .print-kicker { margin: 0 0 2.5mm; color: #6d3ba4; font-size: 8pt; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0 0 2.5mm; font-size: 23pt; line-height: 1.08; letter-spacing: -.03em; }
    .print-artist { margin: 0; color: #635c6b; font-size: 11pt; }
    .print-lyrics-header { margin: 0 0 6mm; padding-bottom: 4mm; border-bottom: 1px solid #d5ced9; }
    .print-lyrics-header span { display: block; margin-bottom: 2mm; color: #6d3ba4; font-size: 8pt; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    .print-lyrics-header h2 { margin: 0; font-size: 14pt; }
    .letra-content { color: #1d1922; font-family: "Cascadia Mono", Consolas, "Courier New", monospace; font-size: 10.8pt; line-height: 1.48; white-space: pre-wrap; }
    .lyrics-line { min-height: 1.1em; margin: 0 0 3.2mm; break-inside: avoid-page; page-break-inside: avoid; white-space: pre-wrap; }
    .chord-line { min-height: 1em; margin: 0 0 1.1mm; color: #65349b; font-weight: 800; line-height: 1; white-space: pre; }
    .lyric-line { min-height: 1.15em; line-height: 1.15; white-space: pre-wrap; }
    .acorde-compacto { appearance: none; margin: 0; padding: 0; border: 0; color: inherit; background: transparent; font: inherit; font-weight: 800; line-height: inherit; }
    .seccion-titulo { margin: 8mm 0 3mm; color: #65349b; font-family: Arial, sans-serif; font-size: 8.5pt; font-weight: 800; letter-spacing: .13em; line-height: 1.2; text-transform: uppercase; break-after: avoid-page; page-break-after: avoid; }
  `;
  printDocument.head.append(style);

  const header = printDocument.createElement('header');
  header.className = 'print-header';
  const kicker = printDocument.createElement('p');
  kicker.className = 'print-kicker';
  kicker.textContent = 'Cancionero Gen';
  const title = printDocument.createElement('h1');
  title.textContent = state.song.titulo || 'Canción';
  const artist = printDocument.createElement('p');
  artist.className = 'print-artist';
  artist.textContent = state.song.artista || 'Cancionero Gen';
  header.append(kicker, title, artist);

  const lyricsHeader = printDocument.createElement('header');
  lyricsHeader.className = 'print-lyrics-header';
  const lyricsKicker = printDocument.createElement('span');
  lyricsKicker.textContent = 'Letra y acordes';
  const lyricsTitle = printDocument.createElement('h2');
  lyricsTitle.textContent = state.song.titulo || 'Canción';
  lyricsHeader.append(lyricsKicker, lyricsTitle);

  const lyrics = $('#letraContent').cloneNode(true);
  lyrics.removeAttribute('id');
  printDocument.body.append(header, lyricsHeader, lyrics);

  const cleanup = () => frame.remove();
  frame.contentWindow.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(() => frame.contentWindow.print(), 100);
  setTimeout(cleanup, 60000);
}

function showError(message) {
  $('#headerTitulo').textContent = 'Canción no disponible';
  $('#headerArtista span').textContent = 'Cancionero Gen';
  const error = document.createElement('div');
  error.className = 'song-error';
  error.innerHTML = '<h2>No pudimos abrir la canción</h2><p></p><a href="cancionero.html">Volver al cancionero</a>';
  error.querySelector('p').textContent = message;
  $('#letraContent').replaceChildren(error);
  $('#letraContent').setAttribute('aria-busy', 'false');
}

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('songbook_reader_preferences') || '{}');
    if (['american', 'spanish'].includes(saved.notation)) state.notation = saved.notation;
    if (Number.isInteger(saved.textSize)) state.textSize = Math.max(0, Math.min(TEXT_CLASSES.length - 1, saved.textSize));
    if (Number.isInteger(saved.speed)) state.speed = Math.max(1, Math.min(10, saved.speed));
    if (typeof saved.showChords === 'boolean') state.showChords = saved.showChords;
    if (saved.tabMode === 'hidden') state.tabMode = 'hidden';
    else if (saved.tabMode === 'expanded' || saved.tabMode === 'collapsed') state.tabMode = 'expanded';
    // Las herramientas comienzan desplegadas para que el lector sea descubrible;
    // el usuario puede contraerlas manualmente durante la lectura.
    state.toolsCollapsed = false;
  } catch { /* Preferencias opcionales. */ }
}

function savePreferences() {
  try {
    localStorage.setItem('songbook_reader_preferences', JSON.stringify({
      notation: state.notation,
      textSize: state.textSize,
      speed: state.speed,
      showChords: state.showChords,
      tabMode: state.tabMode,
      toolsCollapsed: state.toolsCollapsed
    }));
  } catch { /* La lectura sigue funcionando sin almacenamiento. */ }
}

window.cambiarTono = changeTone;
window.cambiarTamano = changeTextSize;
window.cambiarVelocidad = changeSpeed;
window.toggleCifrado = toggleNotation;
window.toggleMostrarAcordes = toggleChordVisibility;
window.toggleMostrarTablaturas = toggleTabVisibility;
window.toggleAutoScroll = toggleAutoScroll;
window.resetearConfiguracion = resetSettings;
window.imprimirCancion = printSong;

$('#scrollSpeed').addEventListener('input', (event) => {
  state.speed = Number(event.target.value);
  syncControls();
  savePreferences();
});
$('#btnMostrarAcordes').addEventListener('click', toggleChordVisibility);
$('#btnMostrarTablaturas').addEventListener('click', toggleTabVisibility);
$('#toggleTools').addEventListener('click', toggleTools);
$('#mobileToolsTrigger').addEventListener('click', openMobileTools);
$('#mobileToolsBackdrop').addEventListener('click', () => closeMobileTools());
$('#mobileScrollSlower').addEventListener('click', () => changeSpeed(-1));
$('#mobileScrollFaster').addEventListener('click', () => changeSpeed(1));
$('#mobileScrollToggle').addEventListener('click', pauseResumeAutoScroll);
$('#mobileScrollStop').addEventListener('click', stopAutoScroll);
$('#openQuickGuide').addEventListener('click', openQuickGuide);
$('#closeQuickGuide').addEventListener('click', closeQuickGuide);
$('#quickGuideBackdrop').addEventListener('click', closeQuickGuide);
$('#guideGuitarTab').addEventListener('click', () => selectGuideInstrument('guitar'));
$('#guidePianoTab').addEventListener('click', () => selectGuideInstrument('piano'));
$('#guideChordSmaller').addEventListener('click', () => changeGuideScale(-1));
$('#guideChordLarger').addEventListener('click', () => changeGuideScale(1));
$('#toggleGuideDock').addEventListener('click', () => setGuideDockVisible(!state.guideDockVisible));
$('#closeGuideDock').addEventListener('click', closeGuideDock);
$('#dockGuideGuitarTab').addEventListener('click', () => selectGuideInstrument('guitar'));
$('#dockGuidePianoTab').addEventListener('click', () => selectGuideInstrument('piano'));
$('#dockGuideChordSmaller').addEventListener('click', () => changeGuideScale(-1));
$('#dockGuideChordLarger').addEventListener('click', () => changeGuideScale(1));
let guideResize = null;
$('#quickGuideDock').addEventListener('pointerdown', (event) => {
  const dock = $('#quickGuideDock');
  if (dock.hidden || event.clientX - dock.getBoundingClientRect().left > 26) return;
  const rect = dock.getBoundingClientRect();
  guideResize = { pointerId: event.pointerId, right: rect.right, min: 280 };
  dock.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
$('#quickGuideDock').addEventListener('pointermove', (event) => {
  if (!guideResize || event.pointerId !== guideResize.pointerId) return;
  const width = Math.max(guideResize.min, guideResize.right - event.clientX);
  $('#quickGuideDock').style.width = `${width}px`;
  document.documentElement.style.setProperty('--guide-dock-width', `${Math.round(width)}px`);
});
$('#quickGuideDock').addEventListener('pointerup', () => { guideResize = null; });
if ('ResizeObserver' in window) {
  new ResizeObserver(syncGuideDockWidth).observe($('#quickGuideDock'));
}
let playerDrag = null;
$('#songAudioActive').addEventListener('pointerdown', event => {
  const player = $('#songAudioActive');
  if (!player.classList.contains('is-floating') || !event.target.closest('.song-audio-now') || event.target.closest('button')) return;
  const rect = player.getBoundingClientRect();
  playerDrag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
  player.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
$('#songAudioActive').addEventListener('pointermove', event => {
  if (!playerDrag || event.pointerId !== playerDrag.pointerId) return;
  const player = $('#songAudioActive');
  const rect = player.getBoundingClientRect();
  const left = Math.max(12, Math.min(event.clientX - playerDrag.offsetX, window.innerWidth - rect.width - 12));
  const top = Math.max(12, Math.min(event.clientY - playerDrag.offsetY, window.innerHeight - rect.height - 12));
  player.style.left = `${Math.round(left)}px`;
  player.style.top = `${Math.round(top)}px`;
  player.style.right = 'auto';
});
$('#songAudioActive').addEventListener('pointerup', event => {
  if (playerDrag?.pointerId === event.pointerId) playerDrag = null;
});
$('#songAudioActive').addEventListener('pointercancel', () => { playerDrag = null; });
$('#likeButton').addEventListener('click', toggleLike);
$('#closeChordDrawer').addEventListener('click', closeChordDrawer);
$('#chordDrawerBackdrop').addEventListener('click', closeChordDrawer);
$('#guitarTab').addEventListener('click', () => selectDrawerInstrument('guitar'));
$('#pianoTab').addEventListener('click', () => selectDrawerInstrument('piano'));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && state.mobileToolsOpen) {
    const focusable = [...$('#songTools').querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  if (event.key === 'Escape') {
    if (state.mobileToolsOpen) closeMobileTools();
    else if (!$('#quickGuideModal').hidden) closeQuickGuide();
    else if (!$('#chordDrawer').hidden) closeChordDrawer();
  }
  const target = event.target instanceof Element ? event.target : null;
  const isInteractive = target?.closest('input, textarea, select, button, [contenteditable="true"]');
  if (isInteractive || event.ctrlKey || event.metaKey || event.altKey) return;

  const rawKey = event.key.toLowerCase();
  const key = event.code === 'Space' || [' ', 'space', 'spacebar'].includes(rawKey)
    ? 'space'
    : rawKey;
  const actions = {
    a: () => toggleAutoScroll(),
    space: () => toggleAutoScroll(),
    v: () => toggleChordVisibility(),
    t: () => toggleTabVisibility(),
    c: () => toggleNotation(),
    '+': () => changeSpeed(1),
    '=': () => changeSpeed(1),
    '-': () => changeSpeed(-1),
    '_': () => changeSpeed(-1),
    arrowleft: () => changeSpeed(-1),
    arrowright: () => changeSpeed(1),
    arrowup: () => moveReading(-1),
    arrowdown: () => moveReading(1)
  };
  const action = actions[key];
  if (!action) return;
  event.preventDefault();
  action();
});
window.addEventListener('popstate', () => {
  if (state.mobileToolsOpen) closeMobileTools({ fromHistory: true });
});
document.addEventListener('visibilitychange', () => { if (document.hidden) toggleAutoScroll(false); });
window.addEventListener('scroll', updateGuideDockPosition, { passive: true });
let lyricsResizeTimer = null;
window.addEventListener('resize', () => {
  if (window.matchMedia('(max-width: 900px)').matches && state.guideDockVisible) {
    setGuideDockVisible(false);
  }
  updateGuideDockPosition();
  if (!window.matchMedia('(max-width: 900px)').matches && state.mobileToolsOpen) closeMobileTools();
  else syncToolsState();
  window.clearTimeout(lyricsResizeTimer);
  lyricsResizeTimer = window.setTimeout(() => {
    if (state.song?.letra?.includes('|')) renderLyrics();
  }, 160);
});
window.addEventListener('beforeunload', () => {
  stopAutoScroll();
  state.mobileToolsOpen = false;
});
$('.back-btn').addEventListener('click', (event) => {
  if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) {
    event.preventDefault();
    history.back();
  }
});

loadPreferences();
syncControls();
const params = new URLSearchParams(location.search);
const songId = params.get('id');
if (songId || params.get('preview') === '1') loadSong(songId || 'preview');
else showError('Falta identificar qué canción querés abrir.');
