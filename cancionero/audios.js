import { addToLocalPlaylist, adoptGuestPlaylistsForCurrentUser, detectProvider, getLocalPlaylists, loadAudioCatalog, mergeCloudPlaylists, playerDescriptor, providerLabels } from './audio-catalog.js?v=20260827-account-playlists';
import { clearMediaSession, connectMediaSession } from './media-session.js?v=20260825-1';
import { hasNativeAudio, nativeStop, playNativeAudio } from './native-audio.js?v=20260825-1';

const $ = selector => document.querySelector(selector);
const AUDIO_CATALOG_SESSION_KEY = 'gen_public_audio_catalog_v1';
const state = { audios: [], songs: new Map(), query: '', type: '', language: '', provider: '', sort: 'song', activeId: '', player: null, nativePlaying: false, playlistAudio: null, pickerReturnFocus: null, pickerOpenedAt: 0, toastTimer: null };
let accountPlaylistsReady = null;
const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
const field = (audio, ...keys) => keys.map(key => audio[key]).find(Boolean) || '';
const displayLabel = value => { const text = String(value || '').trim(); return text ? text.charAt(0).toLocaleUpperCase('es') + text.slice(1) : ''; };
const icons = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.8v10.4L17.5 12 9 6.8Z"></path></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 7v10M15.5 7v10"></path></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"></path></svg>',
  external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H7.5A2.5 2.5 0 0 0 5 9.5v7A2.5 2.5 0 0 0 7.5 19h7a2.5 2.5 0 0 0 2.5-2.5V15M13 5h6v6M19 5l-8 8"></path></svg>'
};

async function loadSongs() {
  const response = await fetch(new URL('../datos/sincronizacion/canciones.json', import.meta.url));
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

function readSessionAudioCatalog() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(AUDIO_CATALOG_SESSION_KEY));
    return Array.isArray(cached) ? cached : null;
  } catch { return null; }
}

function writeSessionAudioCatalog(audios) {
  try { sessionStorage.setItem(AUDIO_CATALOG_SESSION_KEY, JSON.stringify(audios)); } catch { /* Caché opcional. */ }
}

async function loadLiveAudios() {
  const cached = readSessionAudioCatalog();
  if (cached) return cached;
  if (!navigator.onLine) return [];
  if (window.firebaseReady) await window.firebaseReady.catch(() => null);
  const utils = window.firebaseUtils;
  if (!window.firebaseDb || !utils?.getDocs || !utils?.query || !utils?.where || !utils?.collection) return [];
  try {
    // El filtro coincide con la regla pública y obtiene todo el catálogo en una sola consulta.
    const snapshot = await utils.getDocs(utils.query(
      utils.collection(window.firebaseDb, 'cancion_audios_publicos'),
      utils.where('estado', '==', 'publicado')
    ));
    const audios = snapshot.docs.map(document => ({ id: document.id, ...document.data() }))
      .filter(audio => audio.id && audio.cancionId && audio.url);
    writeSessionAudioCatalog(audios);
    return audios;
  } catch (error) {
    console.warn('No se pudo actualizar el catálogo público de audios:', error);
    return [];
  }
}

function enrich(audio) {
  const song = state.songs.get(String(audio.cancionId)) || {};
  const provider = String(audio.proveedor || detectProvider(audio.url)).toLowerCase();
  return { ...audio, proveedor: provider, cancionTitulo: audio.cancionTitulo || song.titulo || 'Canción sin título', artista: audio.artista || song.artista || song.autor || 'Cancionero Gen' };
}

function mergeAudios(...sources) {
  const merged = new Map();
  sources.flat().forEach(audio => { if (audio?.id && audio?.url) merged.set(String(audio.id), enrich({ ...merged.get(String(audio.id)), ...audio })); });
  return [...merged.values()];
}

function optionValues(keys) {
  return [...new Set(state.audios.map(audio => field(audio, ...keys)).filter(Boolean).map(String))].sort(collator.compare);
}

function fillSelect(selector, values, labels = null) {
  const select = $(selector);
  values.forEach(value => { const option = document.createElement('option'); option.value = value; option.textContent = labels?.[value] || displayLabel(value); select.append(option); });
}

function setupFilters() {
  fillSelect('#typeFilter', optionValues(['tipo', 'versionVocal', 'tipoVoz']));
  fillSelect('#languageFilter', optionValues(['idioma']));
  const providers = [...new Set(state.audios.map(audio => audio.proveedor).filter(Boolean))].sort();
  fillSelect('#providerFilter', providers, providerLabels);
}

function searchable(audio) {
  return normalized([audio.cancionTitulo, audio.artista, audio.nombre, audio.version, audio.interprete, audio.idioma, audio.tipo, audio.versionVocal, audio.tipoVoz, providerLabels[audio.proveedor]].join(' '));
}

function filteredAudios() {
  const query = normalized(state.query);
  const result = state.audios.filter(audio => {
    const type = field(audio, 'tipo', 'versionVocal', 'tipoVoz');
    return (!query || searchable(audio).includes(query)) && (!state.type || type === state.type) && (!state.language || String(audio.idioma) === state.language) && (!state.provider || audio.proveedor === state.provider);
  });
  result.sort((a, b) => {
    if (state.sort === 'artist') return collator.compare(a.artista, b.artista) || collator.compare(a.cancionTitulo, b.cancionTitulo);
    if (state.sort === 'recent') return String(b.fechaCreacion?.seconds || b.fechaCreacion?._seconds || b.creadoEn || '').localeCompare(String(a.fechaCreacion?.seconds || a.fechaCreacion?._seconds || a.creadoEn || ''));
    return collator.compare(a.cancionTitulo, b.cancionTitulo) || collator.compare(field(a, 'version', 'nombre'), field(b, 'version', 'nombre'));
  });
  return result;
}

function badge(text) { const span = document.createElement('span'); span.textContent = displayLabel(text); return span; }

function closePlaylistPicker() {
  if ($('#playlistPicker').hidden) return;
  $('#playlistPicker').hidden = true; $('#playlistBackdrop').hidden = true; document.body.classList.remove('playlist-picker-open');
  state.playlistAudio = null; state.pickerReturnFocus?.focus(); state.pickerReturnFocus = null;
}

function saveAudioToPlaylist(name) {
  if (!state.playlistAudio || !name.trim()) return;
  const playlist = addToLocalPlaylist(state.playlistAudio, name.trim()); closePlaylistPicker();
  showToast(`Agregado a ${playlist?.nombre || name.trim()}`);
}

async function loadAccountPlaylists() {
  if (accountPlaylistsReady) return accountPlaylistsReady;
  accountPlaylistsReady = (async () => {
    await import('../firebase-config-cancionero.js?v=20260730-google1');
    const auth = window.firebaseAuth;
    const onAuthStateChanged = window.firebaseUtils?.onAuthStateChanged;
    if (!auth || !onAuthStateChanged) return getLocalPlaylists();
    return new Promise(resolve => {
      const unsubscribe = onAuthStateChanged(auth, async user => {
        unsubscribe();
        if (!user) return resolve(getLocalPlaylists());
        try {
          adoptGuestPlaylistsForCurrentUser();
          resolve(await mergeCloudPlaylists(user.uid));
        }
        catch (error) {
          console.warn('No se pudieron actualizar las playlists de la cuenta:', error);
          resolve(getLocalPlaylists());
        }
      });
    });
  })();
  return accountPlaylistsReady;
}

async function openPlaylistPicker(audio, trigger) {
  if (!audio?.url) return;
  await loadAccountPlaylists();
  state.playlistAudio = audio; state.pickerReturnFocus = trigger;
  state.pickerOpenedAt = performance.now();
  $('#playlistAudioName').textContent = audio.cancionTitulo;
  const choices = $('#playlistChoices'); choices.replaceChildren();
  const playlists = getLocalPlaylists().filter(playlist => playlist.tipo === 'audio');
  if (!playlists.length) {
    const empty = document.createElement('p'); empty.className = 'playlist-picker-empty'; empty.textContent = 'Todavía no tenés playlists de audio. Creá la primera acá abajo.'; choices.append(empty);
  } else {
    playlists.forEach(playlist => {
      const button = document.createElement('button'); button.type = 'button';
      const count = playlist.items.length; button.innerHTML = '<span>♪</span><div><strong></strong><small></small></div><b></b>';
      button.querySelector('strong').textContent = playlist.nombre; button.querySelector('small').textContent = `${count} ${count === 1 ? 'audio' : 'audios'}`;
      button.querySelector('b').innerHTML = icons.plus;
      button.addEventListener('click', () => saveAudioToPlaylist(playlist.nombre)); choices.append(button);
    });
  }
  $('#newPlaylistName').value = ''; $('#playlistBackdrop').hidden = false; $('#playlistPicker').hidden = false; document.body.classList.add('playlist-picker-open');
  requestAnimationFrame(() => {
    const target = window.matchMedia('(max-width: 620px)').matches
      ? $('#playlistPicker')
      : (choices.querySelector('button') || $('#playlistPicker'));
    target.focus({ preventScroll: true });
  });
}

function audioCard(audio) {
  const card = document.createElement('article'); card.className = 'audio-card'; card.dataset.audioId = String(audio.id); card.classList.toggle('is-playing', state.activeId === String(audio.id));
  const play = document.createElement('button'); play.type = 'button'; play.className = 'audio-play'; play.setAttribute('aria-label', `Reproducir ${audio.cancionTitulo}`); play.innerHTML = state.activeId === String(audio.id) ? icons.pause : icons.play; play.addEventListener('click', () => playAudio(audio));
  const copy = document.createElement('div'); copy.className = 'audio-card-copy';
  const heading = document.createElement('h3'); const link = document.createElement('a'); link.href = `cancion.html?id=${encodeURIComponent(audio.cancionId)}`; link.textContent = audio.cancionTitulo; heading.append(link);
  const subtitle = document.createElement('p'); subtitle.textContent = [audio.artista, field(audio, 'version', 'nombre', 'interprete')].filter(Boolean).join(' · ');
  const badges = document.createElement('div'); badges.className = 'audio-badges'; [field(audio, 'tipo', 'versionVocal', 'tipoVoz'), audio.idioma, providerLabels[audio.proveedor] || audio.proveedor].filter(Boolean).slice(0, 3).forEach(value => badges.append(badge(value)));
  copy.append(heading, subtitle, badges);
  const actions = document.createElement('div'); actions.className = 'audio-card-actions';
  const song = document.createElement('a'); song.href = `cancion.html?id=${encodeURIComponent(audio.cancionId)}`; song.title = 'Abrir letra y acordes'; song.setAttribute('aria-label', 'Abrir letra y acordes'); song.innerHTML = icons.external;
  if (audio?.url) {
    const add = document.createElement('button'); add.type = 'button'; add.title = 'Agregar a una playlist'; add.setAttribute('aria-label', 'Agregar a una playlist'); add.innerHTML = icons.plus; add.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); void openPlaylistPicker(audio, add); });
    actions.append(add);
  }
  actions.append(song); card.append(play, copy, actions); return card;
}

function render() {
  const audios = filteredAudios(); const grid = $('#audioGrid'); grid.replaceChildren();
  const activeFilters = [state.query, state.type, state.language, state.provider].filter(Boolean).length;
  $('#filterCount').textContent = activeFilters; $('#filterCount').hidden = !activeFilters;
  $('#resultsTitle').textContent = activeFilters ? 'Resultados' : 'Todos los audios';
  $('#resultCount').textContent = `${audios.length} ${audios.length === 1 ? 'versión' : 'versiones'}`;
  if (!audios.length) {
    grid.hidden = true; $('#audioState').hidden = false; $('#audioState').innerHTML = '<span class="audio-loader">♫</span><h3>No encontramos audios</h3><p>Probá con otra búsqueda o limpiá los filtros.</p>'; return;
  }
  $('#audioState').hidden = true; grid.hidden = false; audios.forEach(audio => grid.append(audioCard(audio)));
}

function stopPlayer() {
  if (state.player) { clearMediaSession(state.player); state.player.pause?.(); state.player.src = ''; state.player = null; }
  if (state.nativePlaying) { nativeStop(); state.nativePlaying = false; }
  $('#audioPlayer').replaceChildren(); $('#audioPlayer').hidden = true; state.activeId = ''; render();
}

function playAudio(audio) {
  if (state.activeId === String(audio.id) && state.player && !state.player.paused) { state.player.pause(); render(); return; }
  if (state.activeId === String(audio.id) && state.player?.paused) { void state.player.play(); render(); return; }
  const descriptor = playerDescriptor(audio); stopPlayer(); state.activeId = String(audio.id);
  const shell = $('#audioPlayer'); shell.hidden = false;
  const head = document.createElement('header'); head.className = 'audio-player-head'; head.innerHTML = '<span class="audio-player-mark">♪</span><div><small>AUDIO SELECCIONADO</small><strong></strong></div>';
  head.querySelector('strong').textContent = `${audio.cancionTitulo} · ${field(audio, 'version', 'nombre', 'interprete') || audio.artista}`;
  const close = document.createElement('button'); close.type = 'button'; close.className = 'audio-player-close'; close.setAttribute('aria-label', 'Cerrar reproductor'); close.textContent = '×'; close.addEventListener('click', stopPlayer); head.append(close);
  const body = document.createElement('div'); body.className = 'audio-player-body'; shell.append(head, body);
  if (descriptor.mode === 'audio') {
    if (hasNativeAudio() && playNativeAudio({ ...audio, titulo: audio.cancionTitulo }, descriptor, 'Audios · Cancionero Gen')) { state.nativePlaying = true; body.innerHTML = '<p class="audio-player-external">Reproduciendo con el reproductor de Gen.</p>'; render(); return; }
    const player = document.createElement('audio'); player.controls = true; player.autoplay = true; player.preload = 'metadata'; player.src = descriptor.url; state.player = player;
    player.addEventListener('play', render); player.addEventListener('pause', render); player.addEventListener('ended', stopPlayer);
    if (descriptor.fallbackUrl) player.addEventListener('error', () => { clearMediaSession(player); body.innerHTML = `<a class="audio-player-external" href="${descriptor.fallbackUrl}" target="_blank" rel="noopener noreferrer">Abrir audio en Google Drive ↗</a>`; }, { once: true });
    connectMediaSession(player, { ...audio, titulo: audio.cancionTitulo }, { album: 'Audios · Cancionero Gen' }); body.append(player);
    const visible = filteredAudios(); const currentIndex = visible.findIndex(item => String(item.id) === String(audio.id));
    const nextDescriptor = currentIndex >= 0 && visible[currentIndex + 1] ? playerDescriptor(visible[currentIndex + 1]) : null;
    if (nextDescriptor?.mode === 'audio') window.GenExternalAudio?.preload(nextDescriptor.url);
    void player.play().catch(() => {});
  } else if (descriptor.mode === 'iframe') {
    const frame = document.createElement('iframe'); frame.src = descriptor.url; frame.title = descriptor.title || 'Reproductor'; frame.allow = 'autoplay; encrypted-media; picture-in-picture'; frame.allowFullscreen = true; body.append(frame);
  } else {
    const external = document.createElement('a'); external.className = 'audio-player-external'; external.href = descriptor.url; external.target = '_blank'; external.rel = 'noopener noreferrer'; external.textContent = 'Abrir en el sitio de origen ↗'; body.append(external);
  }
  render();
}

function showToast(message) { const toast = $('#audioToast'); clearTimeout(state.toastTimer); toast.textContent = message; toast.hidden = false; state.toastTimer = setTimeout(() => { toast.hidden = true; }, 2600); }
function bind() {
  window.addEventListener('gen:native-audio-error', event => { state.nativePlaying = false; showToast(event.detail?.message || 'No pudimos reproducir este audio.'); });
  $('#audioSearch').addEventListener('input', event => { state.query = event.target.value; render(); });
  [['#typeFilter','type'],['#languageFilter','language'],['#providerFilter','provider'],['#sortFilter','sort']].forEach(([selector,key]) => $(selector).addEventListener('change', event => { state[key] = event.target.value; render(); }));
  $('#clearFilters').addEventListener('click', () => { state.query = state.type = state.language = state.provider = ''; state.sort = 'song'; ['#audioSearch','#typeFilter','#languageFilter','#providerFilter'].forEach(selector => { $(selector).value = ''; }); $('#sortFilter').value = 'song'; render(); });
  $('#filterToggle').addEventListener('click', () => { const open = $('#audioFilters').classList.toggle('is-open'); $('#filterToggle').setAttribute('aria-expanded', String(open)); });
  $('#closePlaylistPicker').addEventListener('click', closePlaylistPicker);
  $('#playlistBackdrop').addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    // Algunos WebView entregan al fondo el mismo toque que abrió el selector.
    if (performance.now() - state.pickerOpenedAt > 500) closePlaylistPicker();
  });
  $('#newPlaylistForm').addEventListener('submit', event => { event.preventDefault(); const name = $('#newPlaylistName').value.trim(); if (name) saveAudioToPlaylist(name); else $('#newPlaylistName').focus(); });
  document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#audioSearch').focus(); } if (event.key === 'Escape' && !$('#playlistPicker').hidden) closePlaylistPicker(); else if (event.key === 'Escape' && document.activeElement === $('#audioSearch')) { $('#audioSearch').value = ''; state.query = ''; render(); } });
}

async function init() {
  bind();
  try {
    const [songs, staticAudios] = await Promise.all([loadSongs(), loadAudioCatalog().catch(() => [])]);
    state.songs = new Map(songs.map(song => [String(song.id), song]));
    const liveAudios = await loadLiveAudios(); state.audios = mergeAudios(staticAudios, liveAudios); setupFilters(); render();
  } catch (error) {
    console.error(error); $('#resultCount').textContent = 'Sin conexión'; $('#audioState').innerHTML = '<span class="audio-loader">!</span><h3>No pudimos abrir los audios</h3><p>Revisá tu conexión e intentá nuevamente.</p>';
  }
}

init();
