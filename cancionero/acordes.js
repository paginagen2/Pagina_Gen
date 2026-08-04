import { extractChords, convertChordNotation } from './chord-engine.js';
import { chordLibrary, specialChordLibrary, chordTypeLabels } from './chord-library.js?v=20260803-shared-chords-2';
import { renderChordDiagram, chordShapeSummary } from './chord-diagrams.js?v=20260803-shared-chords-2';

const $ = (selector) => document.querySelector(selector);
const state = {
  instrument: 'guitar',
  notation: 'american',
  note: 'all',
  type: 'all',
  drawerInstrument: 'guitar',
  drawerChord: 'C',
  drawerCustomShape: null,
  summaries: null,
  selectedSong: null,
  searchTimer: null,
  lastFocus: null
};

const suffixByType = {
  major: '', minor: 'm', seventh: '7', major_seventh: 'maj7', diminished: 'dim', augmented: 'aug'
};

let databaseServicePromise;
function getDatabaseService() {
  databaseServicePromise ||= import('../aaglobal/firebase-config-cancionero.js?v=20260730-online-catalog')
    .then((module) => module.DatabaseService);
  return databaseServicePromise;
}

function chordName(entry, notation = state.notation) {
  if (entry.nombre) return convertChordNotation(entry.nombre, notation) || entry.nombre;
  const raw = `${entry.nota}${suffixByType[entry.tipo] ?? ''}`;
  return convertChordNotation(raw, notation) || raw;
}

function setActive(selector, attribute, value) {
  document.querySelectorAll(selector).forEach((button) => {
    const active = button.dataset[attribute] === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function createNoteFilters() {
  const notes = ['all', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const labels = { all: 'Todas' };
  const container = $('#notasFilter');
  container.replaceChildren(...notes.map((note) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nota-btn${note === state.note ? ' active' : ''}`;
    button.dataset.nota = note;
    button.textContent = labels[note] || note;
    button.setAttribute('aria-pressed', String(note === state.note));
    button.addEventListener('click', () => filterByNote(note));
    return button;
  }));
}

function renderDictionary() {
  const dictionaryEntries = [
    ...Object.values(chordLibrary),
    ...Object.values(specialChordLibrary).filter((entry) => entry.tipo === 'special')
  ];
  const entries = dictionaryEntries.filter((entry) =>
    (state.note === 'all' || entry.nota === state.note) &&
    (state.type === 'all' || entry.tipo === state.type)
  );
  const grid = $('#acordesGrid');
  grid.replaceChildren(...entries.map((entry) => {
    const name = chordName(entry);
    const summary = chordShapeSummary(name, state.notation);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'acorde-card';
    card.setAttribute('aria-label', `Ver detalle de ${name}`);
    card.innerHTML = `
      <span class="acorde-header"><strong class="acorde-name"></strong><span class="acorde-type"></span></span>
      <span class="acorde-card-diagram"></span>
      <span class="acorde-info"><span class="acorde-notes"></span><span class="acorde-formula"></span></span>`;
    card.querySelector('.acorde-name').textContent = name;
    card.querySelector('.acorde-type').textContent = chordTypeLabels[entry.tipo] || entry.tipo;
    card.querySelector('.acorde-card-diagram').innerHTML = renderChordDiagram(name, state.instrument, state.notation);
    card.querySelector('.acorde-notes').textContent = summary?.notes.join(' · ') || 'Posición de referencia';
    card.querySelector('.acorde-formula').textContent = summary?.formula || '';
    card.addEventListener('click', () => openDrawer(name));
    return card;
  }));
  $('.results-hint').textContent = `${entries.length} acorde${entries.length === 1 ? '' : 's'} · Tocá uno para verlo en detalle`;
}

function selectInstrument(instrument) {
  state.instrument = instrument;
  setActive('.instrument-btn', 'instrument', instrument);
  renderDictionary();
}

function selectNotation(value) {
  state.notation = value === 'europeo' ? 'spanish' : 'american';
  setActive('.cifrado-btn', 'cifrado', value);
  renderDictionary();
  if (state.selectedSong) renderSongPreview(state.selectedSong);
}

function filterByNote(note) {
  state.note = note;
  setActive('.nota-btn', 'nota', note);
  renderDictionary();
}

function filterByType(type) {
  state.type = type;
  setActive('.tipo-btn', 'tipo', type);
  renderDictionary();
}

window.selectInstrument = selectInstrument;
window.selectCifrado = selectNotation;
window.filterByNota = filterByNote;
window.filterByType = filterByType;

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
  return response.json();
}

async function ensureSummaries() {
  if (state.summaries) return state.summaries;
  const [data, extras] = await Promise.all([
    fetchJson('../datos/cancionero/buscar.json'),
    fetchJson('../datos/cancionero/extras.json').catch(() => ({ canciones: [] }))
  ]);
  const base = data.canciones || [];
  const online = await getDatabaseService()
    .then((service) => service.getCancionesLimitadas(15))
    .catch((error) => {
      console.warn('No se pudieron sumar canciones recientes al Centro de Acordes:', error);
      return [];
    });
  const unique = new Map();
  [...online, ...base, ...(extras.canciones || [])].forEach((song) => {
    if (song?.id) unique.set(String(song.id), song);
  });
  state.summaries = [...unique.values()];
  return state.summaries;
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function renderSongResults(songs, label = 'Canciones sugeridas') {
  const container = $('#songSearchResults');
  $('#songResultsTitle').textContent = label;
  $('#songResultsCount').textContent = songs.length ? `${songs.length} resultado${songs.length === 1 ? '' : 's'}` : 'No encontramos coincidencias';
  if (!songs.length) {
    const empty = document.createElement('p');
    empty.className = 'song-results-empty';
    empty.textContent = 'Probá con otro título o artista.';
    container.replaceChildren(empty);
    return;
  }
  container.replaceChildren(...songs.slice(0, 12).map((song) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'song-result-item';
    button.innerHTML = `
      <span class="song-result-art">♫</span>
      <span class="song-result-title"><strong></strong></span>
      <span class="song-result-meta"><span class="song-result-artist"></span><span class="song-result-category"></span></span>
      <span class="song-result-arrow">›</span>`;
    button.querySelector('strong').textContent = song.titulo || 'Sin título';
    button.querySelector('.song-result-artist').textContent = song.artista || 'Desconocido';
    button.querySelector('.song-result-category').textContent = categoryLabel(song.categoria);
    button.addEventListener('click', () => selectSong(song, button));
    return button;
  }));
}

function categoryLabel(category) {
  return ({ misa: 'Misa', gen: 'Gen', fogon: 'Fogón' })[category] || 'Cancionero';
}

async function selectSong(summary, sourceButton) {
  document.querySelectorAll('.song-result-item').forEach((button) => button.classList.remove('active'));
  sourceButton?.classList.add('active');
  $('#songChordEmptyState').hidden = true;
  $('#songChordContent').hidden = false;
  $('#selectedSongName').textContent = summary.titulo || 'Cargando…';
  $('#selectedSongArtist').textContent = 'Cargando acordes…';
  $('#songChordList').replaceChildren();
  try {
    const databaseService = await getDatabaseService();
    const fullSong = await databaseService.getCancionPorId(summary.id);
    if (!fullSong) throw new Error('La canción ya no está disponible.');
    state.selectedSong = { ...summary, ...fullSong };
    renderSongPreview(state.selectedSong);
  } catch (error) {
    $('#selectedSongArtist').textContent = 'No pudimos cargar esta canción.';
    $('#songChordList').textContent = error.message;
  }
}

function renderSongPreview(song) {
  const notation = state.notation;
  const chords = extractChords(song.letra || '', { notation });
  $('#selectedSongName').textContent = song.titulo || 'Sin título';
  $('#selectedSongArtist').textContent = `${song.artista || 'Desconocido'} · ${categoryLabel(song.categoria)}`;
  const chordList = $('#songChordList');
  if (chords.length) {
    chordList.replaceChildren(...chords.map((chord) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = chord;
      button.addEventListener('click', () => openDrawer(chord));
      return button;
    }));
  } else {
    const text = document.createElement('span');
    text.textContent = 'Esta letra todavía no tiene acordes cargados.';
    chordList.replaceChildren(text);
  }
  $('#openSelectedSong').href = `cancion.html?id=${encodeURIComponent(song.id)}&from=acordes`;
}

async function runSearch() {
  const query = normalize($('#songChordSearch').value.trim());
  $('#songSearchClear').hidden = !query;
  try {
    const songs = await ensureSummaries();
    const results = query
      ? songs.filter((song) => normalize(`${song.titulo} ${song.artista}`).includes(query))
      : songs.slice(0, 6);
    renderSongResults(results, query ? 'Resultados' : 'Canciones sugeridas');
  } catch {
    renderSongResults([], 'Búsqueda no disponible');
  }
}

function openDrawer(chord, customShape = null) {
  state.drawerChord = chord;
  state.drawerCustomShape = customShape;
  state.lastFocus = document.activeElement;
  $('#chordDetailTitle').textContent = chord;
  updateDrawer();
  const drawer = $('#chordDetailDrawer');
  drawer.hidden = false;
  drawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  $('#closeChordDetail').focus();
}

function updateDrawer() {
  const chord = state.drawerChord;
  const customShape = state.drawerCustomShape;
  const summary = chordShapeSummary(chord, state.notation, customShape);
  $('#chordDetailDiagram').innerHTML = renderChordDiagram(chord, state.drawerInstrument, state.notation, customShape);
  $('#chordDetailNotes').textContent = summary?.notes.join(' · ') || 'Sin datos';
  $('#chordDetailFormula').textContent = summary?.formula || 'Sin datos';
  document.querySelectorAll('[data-drawer-instrument]').forEach((button) => {
    button.classList.toggle('active', button.dataset.drawerInstrument === state.drawerInstrument);
  });
}

function closeDrawer() {
  const drawer = $('#chordDetailDrawer');
  drawer.hidden = true;
  drawer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  state.lastFocus?.focus?.();
}

function initTabs() {
  const tabs = [...document.querySelectorAll('.chord-tab')];
  const panels = [$('#songChordsPanel'), $('#dictionaryPanel')];
  const activate = () => {
    const target = location.hash === '#dictionaryPanel' ? 'dictionaryPanel' : 'songChordsPanel';
    tabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.getAttribute('href') === `#${target}`)));
    panels.forEach((panel) => { panel.hidden = panel.id !== target; });
  };
  window.addEventListener('hashchange', activate);
  activate();
}

$('#songChordSearchForm').addEventListener('submit', (event) => { event.preventDefault(); runSearch(); });
$('#songChordSearch').addEventListener('input', () => {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(runSearch, 180);
});
$('#songSearchClear').addEventListener('click', () => {
  $('#songChordSearch').value = '';
  $('#songChordSearch').focus();
  runSearch();
});
$('#closeChordDetail').addEventListener('click', closeDrawer);
$('#chordDetailBackdrop').addEventListener('click', closeDrawer);
document.querySelectorAll('[data-drawer-instrument]').forEach((button) => button.addEventListener('click', () => {
  state.drawerInstrument = button.dataset.drawerInstrument;
  updateDrawer();
}));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#chordDetailDrawer').hidden) closeDrawer(); });

createNoteFilters();
renderDictionary();
initTabs();
runSearch();
