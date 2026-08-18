import { DatabaseService } from '../aaglobal/firebase-config-cancionero.js?v=20260818-song-fallback';
import { parseChord, transposeChord, convertChordNotation, extractUniqueChords } from './chord-engine.js';
import { renderChordDiagram, chordShapeSummary } from './chord-diagrams.js?v=20260804-guide-dock-2';

const $ = (selector) => document.querySelector(selector);
const TEXT_CLASSES = ['texto-pequeno', 'texto-normal', 'texto-grande', 'texto-extra-grande', 'texto-muy-grande', 'texto-enorme', 'texto-maximo'];
const state = {
  song: null,
  transpose: 0,
  textSize: 2,
  speed: 5,
  notation: 'american',
  showChords: true,
  toolsCollapsed: false,
  autoScroll: false,
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
}

async function incrementView(id) {
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

  const fragment = document.createDocumentFragment();
  let previousBlank = false;
  const lines = lyric.split('\n');
  const sectionPattern = /^(intro|verso(?:\s+\d+)?|coro|estribillo|pre[- ]?coro|puente|bridge|outro):?\s*/i;
  const parseLine = (source) => {
    const chordMatches = [...source.matchAll(/\[([^\]\r\n]+)]/g)];
    let text = '';
    let sourcePosition = 0;
    const chords = [];
    chordMatches.forEach((match) => {
      text += source.slice(sourcePosition, match.index);
      if (parseChord(match[1])) chords.push({ raw: match[1], position: text.length });
      else text += match[0];
      sourcePosition = match.index + match[0].length;
    });
    text += source.slice(sourcePosition);
    return { text, chords };
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    let line = lines[lineIndex];
    const sectionMatch = line.trim().match(/^\[?(intro|verso(?:\s+\d+)?|coro|estribillo|pre[- ]?coro|puente|bridge|outro)\]?:?$/i);
    if (sectionMatch) {
      const section = document.createElement('div');
      section.className = 'seccion-titulo';
      section.textContent = sectionMatch[1];
      fragment.append(section);
      previousBlank = false;
      continue;
    }

    // Un título al inicio de una línea con acordes (por ejemplo "INTRO: [C]")
    // se representa como título, y esos acordes acompañan al verso siguiente.
    const leadingSection = line.match(sectionPattern);
    if (leadingSection && line.slice(leadingSection[0].length).includes('[')) {
      const section = document.createElement('div');
      section.className = 'seccion-titulo';
      section.textContent = leadingSection[1];
      fragment.append(section);
      line = line.slice(leadingSection[0].length);
    }

    let { text: lyricText, chords: positionedChords } = parseLine(line);
    const isChordOnlyLine = positionedChords.length > 0 && lyricText.trim() === '';

    // En un cancionero una línea compuesta solo por acordes pertenece al verso
    // inmediatamente inferior. Los agrupamos en una misma unidad visual.
    if (isChordOnlyLine && lineIndex + 1 < lines.length) {
      const next = parseLine(lines[lineIndex + 1]);
      const nextIsSection = Boolean(lines[lineIndex + 1].trim().match(sectionPattern));
      if (!nextIsSection && next.chords.length === 0 && next.text.trim() !== '') {
        lyricText = next.text;
        lineIndex += 1;
      }
    }

    if (!state.showChords && isChordOnlyLine && !lyricText.trim()) continue;
    const isBlank = lyricText.trim() === '' && positionedChords.length === 0;
    if (!state.showChords && isBlank && previousBlank) continue;
    previousBlank = isBlank;
    const row = document.createElement('div');
    row.className = 'lyrics-line';

    if (state.showChords && positionedChords.length) {
      row.classList.add('has-chords');
      const chordRow = document.createElement('div');
      chordRow.className = 'chord-line';
      let chordCursor = 0;
      positionedChords.forEach(({ raw, position }) => {
        const displayed = displayChord(raw);
        const gap = Math.max(position - chordCursor, chordCursor > 0 ? 1 : 0);
        if (gap) chordRow.append(document.createTextNode(' '.repeat(gap)));
        const chord = document.createElement('button');
        chord.type = 'button';
        chord.className = 'acorde-compacto';
        chord.textContent = displayed;
        chord.setAttribute('aria-label', `Ver acorde ${displayed}`);
        chord.addEventListener('click', () => openChordDrawer(displayed));
        chordRow.append(chord);
        chordCursor = Math.max(position, chordCursor + gap) + displayed.length;
      });
      row.append(chordRow);
    }

    if (lyricText || !positionedChords.length || !state.showChords) {
      row.classList.add('has-lyric');
      const lyricRow = document.createElement('div');
      lyricRow.className = 'lyric-line';
      lyricRow.textContent = lyricText || '\u00a0';
      row.append(lyricRow);
    }
    if (!row.hasChildNodes()) row.append(document.createTextNode('\u00a0'));
    fragment.append(row);
  }
  container.replaceChildren(fragment);
  container.classList.toggle('lyrics-only', !state.showChords);
  renderUsedChords(extractUniqueChords(lyric, { notation: state.notation }).map(displayChord));
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
  $('.lyrics-hint').innerHTML = state.showChords
    ? '<svg><use href="#i-music"/></svg>Toca un acorde para consultarlo'
    : '<svg><use href="#i-text"/></svg>Modo solo letra';
  syncToolsState();
}

function syncToolsState() {
  const tools = $('#songTools');
  const workspace = $('.song-workspace');
  const toggle = $('#toggleTools');
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

function toggleTools() {
  state.toolsCollapsed = !state.toolsCollapsed;
  syncToolsState();
  savePreferences();
}

function toggleAutoScroll(force) {
  const next = typeof force === 'boolean' ? force : !state.autoScroll;
  if (next === state.autoScroll) return;
  state.autoScroll = next;
  const button = $('#btnAutoScroll');
  button.classList.toggle('active', next);
  button.setAttribute('aria-pressed', String(next));
  button.querySelector('span').textContent = next ? 'Pausar auto-scroll' : 'Iniciar auto-scroll';
  if (!next) {
    cancelAnimationFrame(state.scrollFrame);
    state.scrollFrame = null;
    return;
  }
  state.scrollPrevious = performance.now();
  state.scrollAccumulator = 0;
  state.scrollFrame = requestAnimationFrame(scrollStep);
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
  state.guideDockVisible = Boolean(visible && state.usedChords.length);
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
  }
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
      toolsCollapsed: state.toolsCollapsed
    }));
  } catch { /* La lectura sigue funcionando sin almacenamiento. */ }
}

window.cambiarTono = changeTone;
window.cambiarTamano = changeTextSize;
window.cambiarVelocidad = changeSpeed;
window.toggleCifrado = toggleNotation;
window.toggleMostrarAcordes = toggleChordVisibility;
window.toggleAutoScroll = toggleAutoScroll;
window.resetearConfiguracion = resetSettings;
window.imprimirCancion = () => window.print();

$('#scrollSpeed').addEventListener('input', (event) => {
  state.speed = Number(event.target.value);
  syncControls();
  savePreferences();
});
$('#btnMostrarAcordes').addEventListener('click', toggleChordVisibility);
$('#toggleTools').addEventListener('click', toggleTools);
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
});
$('#quickGuideDock').addEventListener('pointerup', () => { guideResize = null; });
$('#likeButton').addEventListener('click', toggleLike);
$('#closeChordDrawer').addEventListener('click', closeChordDrawer);
$('#chordDrawerBackdrop').addEventListener('click', closeChordDrawer);
$('#guitarTab').addEventListener('click', () => selectDrawerInstrument('guitar'));
$('#pianoTab').addEventListener('click', () => selectDrawerInstrument('piano'));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!$('#quickGuideModal').hidden) closeQuickGuide();
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
document.addEventListener('visibilitychange', () => { if (document.hidden) toggleAutoScroll(false); });
window.addEventListener('scroll', updateGuideDockPosition, { passive: true });
window.addEventListener('resize', updateGuideDockPosition);
window.addEventListener('beforeunload', () => toggleAutoScroll(false));
$('.back-btn').addEventListener('click', (event) => {
  if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) {
    event.preventDefault();
    history.back();
  }
});

loadPreferences();
syncControls();
const songId = new URLSearchParams(location.search).get('id');
if (songId) loadSong(songId);
else showError('Falta identificar qué canción querés abrir.');
