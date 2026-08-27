import { detectProvider, providerLabels } from './audio-catalog.js?v=20260818-1';
import { DatabaseService } from '../aaglobal/firebase-config-cancionero.js?v=20260819-audio-recent';

// Se completa cuando el formulario de Google, creado bajo la cuenta institucional,
// esté disponible. La página nunca acepta un Drive personal como destino sugerido.
let googleAudioUploadFormUrl = '';
let selectedGoogleAudioFile = null;
const MAX_GOOGLE_AUDIO_BYTES = 25 * 1024 * 1024;
const $ = selector => document.querySelector(selector);
const TYPE_LABELS = {
  guia: 'Guía', en_vivo: 'En vivo', cover: 'Cover', remix: 'Remix', instrumental: 'Instrumental', voces: 'Voces',
  oficial: 'Versión oficial', otra: 'Otro audio'
};
const AUTO_PERMISSION_PROVIDERS = new Set(['youtube', 'spotify', 'soundcloud', 'bandcamp', 'applemusic', 'vimeo']);
let songs = [];
let currentUser = null;
const pendingSongTarget = (() => {
  if (new URLSearchParams(window.location.search).get('cancionPendiente') !== '1') return null;
  try {
    const song = JSON.parse(sessionStorage.getItem('gen_pending_song_audio_target') || 'null');
    return song?.id && song?.titulo ? song : null;
  } catch {
    return null;
  }
})();

function selectedSong() {
  return songs.find(song => String(song.id) === String($('#publicAudioSong').value)) || null;
}

function normalizedSearch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

function renderSongOptions() {
  const select = $('#publicAudioSong');
  const query = normalizedSearch($('#publicAudioSongSearch').value);
  const selectedId = select.value;
  const filtered = [...songs]
    .filter(song => !query || normalizedSearch(`${song.titulo || ''} ${song.artista || ''}`).includes(query))
    .sort((a, b) => String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es'))
    .slice(0, 40);
  select.replaceChildren(new Option(filtered.length ? 'Elegí una canción' : 'No encontramos coincidencias', ''));
  filtered.forEach(song => select.add(new Option(`${song.titulo} — ${song.artista || 'Sin artista'}`, song.id)));
  if (filtered.some(song => String(song.id) === String(selectedId))) select.value = selectedId;
  $('#audioSongResultsCount').textContent = query
    ? `${filtered.length} coincidencia${filtered.length === 1 ? '' : 's'}`
    : `${Math.min(songs.length, 40)} de ${songs.length}`;
  updateSelectedSongSummary();
}

function updateSelectedSongSummary() {
  const song = selectedSong();
  const summary = $('#audioSongSelected');
  summary.hidden = !song;
  if (!song) return;
  $('#audioSongSelectedTitle').textContent = song.titulo || 'Sin título';
  const category = ({ misa: 'Misa', gen: 'Gen', fogon: 'Fogón' })[song.categoria] || 'Cancionero';
  $('#audioSongSelectedMeta').textContent = `${song.artista || 'Sin artista'} · ${category}${song.pendiente ? ' · Pendiente de revisión' : ''}`;
}

function isVoiceUpload() {
  return $('#publicAudioType').value === 'voces';
}

function generatedName() {
  const song = selectedSong();
  const language = $('#publicAudioLanguage').value;
  const type = $('#publicAudioType').value;
  const voiceVersion = $('#publicAudioVoiceVersion').value.trim();
  const voiceType = $('#publicAudioVoiceType').value.trim();
  const performer = $('#publicAudioPerformer').value.trim();
  const url = $('#publicAudioUrl').value.trim();
  const provider = url ? detectProvider(url) : '';
  const detail = isVoiceUpload()
    ? [TYPE_LABELS[type], voiceVersion, voiceType].filter(Boolean).join(' · ')
    : TYPE_LABELS[type] || 'Audio';
  const source = type === 'oficial' && provider ? providerLabels[provider] || 'Enlace externo' : '';
  return `${song?.titulo || 'Canción sin seleccionar'}${language ? ` (${language})` : ''} — ${detail}${performer ? ` · ${performer}` : ''}${source ? ` · ${source}` : ''}`;
}

function updatePreview() {
  const voice = isVoiceUpload();
  const voiceFields = $('#publicAudioVoiceFields');
  voiceFields.hidden = !voice;
  $('#publicAudioVoiceVersion').required = voice;
  $('#publicAudioVoiceType').required = voice;
  const url = $('#publicAudioUrl').value.trim();
  const provider = detectProvider(url);
  const permission = $('#publicAudioPermission');
  if (AUTO_PERMISSION_PROVIDERS.has(provider)) {
    permission.checked = true;
    permission.dataset.autoConfirmed = 'true';
  } else if (permission.dataset.autoConfirmed === 'true') {
    permission.checked = false;
    delete permission.dataset.autoConfirmed;
  }
  $('#publicAudioProvider').textContent = url
    ? `Fuente detectada: ${providerLabels[provider] || 'Enlace externo'}. Se mostrará junto al audio.`
    : 'La plataforma se detectará automáticamente.';
  $('#publicAudioName').value = generatedName();
}

function showStatus(message, error = false) {
  const status = $('#publicAudioStatus');
  status.hidden = false;
  status.classList.toggle('error', error);
  status.textContent = message;
}

function setDriveProgress(value, label) {
  $('#googleAudioProgress').hidden = false;
  $('#googleAudioProgressBar').value = value;
  $('#googleAudioProgressLabel').textContent = label;
}

function resetDriveUpload() {
  selectedGoogleAudioFile = null;
  $('#googleAudioFile').value = '';
  $('#googleAudioUpload').hidden = true;
  $('#googleAudioProgress').hidden = true;
  $('#googleAudioProgressBar').value = 0;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No pudimos leer el archivo seleccionado.'));
    reader.onprogress = event => {
      if (event.lengthComputable) setDriveProgress(Math.round(5 + (event.loaded / event.total) * 30), 'Preparando…');
    };
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.readAsDataURL(file);
  });
}

async function uploadStatusRequest(uploadToken) {
  const callbackPrefix = 'genAudioStatus';
  const url = new URL(googleAudioUploadFormUrl);
  url.searchParams.set('action', 'status');
  url.searchParams.set('uploadToken', uploadToken);
  url.searchParams.set('prefix', callbackPrefix);
  url.searchParams.set('_', Date.now());
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: controller.signal
    });
    if (!response.ok) throw new Error(`Drive respondió con estado ${response.status}.`);
    const text = (await response.text()).trim();
    const opening = `${callbackPrefix}(`;
    if (!text.startsWith(opening) || !text.endsWith(')')) throw new Error('Drive devolvió una confirmación inválida.');
    return JSON.parse(text.slice(opening.length, -1));
  } finally {
    window.clearTimeout(timeout);
  }
}

async function waitForDriveUpload(uploadToken) {
  const deadline = Date.now() + 75000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await uploadStatusRequest(uploadToken);
      if (result?.state === 'complete') return result;
      if (result?.state === 'error') throw new Error(result.message || 'Drive rechazó la carga.');
      lastError = null;
    } catch (error) {
      if (error.message && !/consultar|confirmaci|estado|Failed to fetch|aborted|respondió/i.test(error.message)) throw error;
      lastError = error;
    }
    await new Promise(resolve => window.setTimeout(resolve, 1500));
  }
  throw lastError || new Error('Drive no confirmó la carga a tiempo. Intentá nuevamente.');
}

async function uploadSelectedAudioToDrive() {
  const file = selectedGoogleAudioFile;
  if (!file) return null;
  if (!googleAudioUploadFormUrl) {
    showStatus('El receptor institucional todavía no está conectado.', true);
    return null;
  }
  const uploadButton = $('#googleAudioUpload');
  const chooseButton = $('#googleAudioChoose');
  uploadButton.disabled = true;
  chooseButton.disabled = true;
  try {
    const base64 = await readFileAsBase64(file);
    if (!base64) throw new Error('El archivo está vacío.');
    const uploadToken = `${Date.now()}_${crypto.randomUUID().replaceAll('-', '')}`;
    setDriveProgress(40, 'Subiendo…');
    await fetch(googleAudioUploadFormUrl, {
      method: 'POST', mode: 'no-cors', credentials: 'omit', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ action: 'upload', uploadToken, fileName: file.name, mimeType: file.type, base64 })
    });
    setDriveProgress(88, 'Confirmando…');
    const result = await waitForDriveUpload(uploadToken);
    $('#publicAudioUrl').value = result.url;
    setDriveProgress(100, 'Carga terminada');
    showStatus('Audio subido correctamente. El enlace público ya quedó agregado a la propuesta.');
    selectedGoogleAudioFile = null;
    $('#googleAudioFile').value = '';
    $('#googleAudioUpload').hidden = true;
    updatePreview();
    return result;
  } catch (error) {
    console.error(error);
    setDriveProgress(0, 'No se pudo subir');
    showStatus(error.message || 'No pudimos subir el audio. Intentá nuevamente.', true);
    return null;
  } finally {
    uploadButton.disabled = false;
    chooseButton.disabled = false;
  }
}

async function loadSongs() {
  try {
    const response = await fetch('../datos/cancionero/buscar.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error();
    const staticSongs = (await response.json()).canciones || [];
    const recentSongs = await DatabaseService.getCancionesLimitadas(15).catch(() => []);
    const unique = new Map();
    [...recentSongs, ...staticSongs].forEach(song => { if (song?.id) unique.set(String(song.id), song); });
    if (pendingSongTarget) unique.set(String(pendingSongTarget.id), pendingSongTarget);
    songs = [...unique.values()];
    renderSongOptions();
    applyPendingSongTarget();
  } catch {
    const select = $('#publicAudioSong');
    if (pendingSongTarget) {
      songs = [pendingSongTarget];
      select.replaceChildren(new Option(`${pendingSongTarget.titulo} · ${pendingSongTarget.artista || 'Sin artista'} (pendiente)`, pendingSongTarget.id));
      applyPendingSongTarget();
    } else {
      select.replaceChildren(new Option('No pudimos cargar las canciones', ''));
      showStatus('No pudimos cargar el listado. Intentá nuevamente más tarde.', true);
    }
  }
  updatePreview();
}

async function loadUploadFormConfig() {
  try {
    const response = await fetch('../datos/cancionero/audio-upload.json', { cache: 'no-cache' });
    if (!response.ok) return;
    const config = await response.json();
    if (typeof config.googleFormUrl === 'string' && /^https:\/\/(script\.google\.com\/macros|docs\.google\.com\/forms|forms\.gle)\//i.test(config.googleFormUrl)) {
      googleAudioUploadFormUrl = config.googleFormUrl;
    }
  } catch { /* El formulario institucional puede configurarse más adelante. */ }
}

function updateAuth(user) {
  currentUser = user || null;
  $('#audioAuthNotice').hidden = Boolean(currentUser);
  $('#publicAudioForm').hidden = !currentUser;
  if (currentUser) {
    $('#audioUserLabel').textContent = currentUser.displayName || currentUser.email || 'Cuenta registrada';
    applyPendingSongTarget();
  }
}

function applyPendingSongTarget() {
  if (!pendingSongTarget) return;
  const select = $('#publicAudioSong');
  const notice = $('#pendingSongNotice');
  const sameUser = !currentUser || !pendingSongTarget.ownerUid || pendingSongTarget.ownerUid === currentUser.uid;
  if (!sameUser) {
    notice.hidden = true;
    select.disabled = false;
    $('#publicAudioSongSearch').disabled = false;
    return showStatus('Esta canción pendiente pertenece a otra cuenta. Elegí una canción publicada.', true);
  }
  const optionExists = [...select.options].some(option => option.value === String(pendingSongTarget.id));
  if (!optionExists) select.add(new Option(`${pendingSongTarget.titulo} · ${pendingSongTarget.artista || 'Sin artista'} (pendiente)`, pendingSongTarget.id));
  select.value = String(pendingSongTarget.id);
  select.disabled = true;
  $('#publicAudioSongSearch').value = pendingSongTarget.titulo;
  $('#publicAudioSongSearch').disabled = true;
  $('#pendingSongName').textContent = pendingSongTarget.titulo;
  notice.hidden = false;
  updateSelectedSongSummary();
  updatePreview();
}

$('#audioLogin').addEventListener('click', () => {
  if (typeof window.genOpenAuthModal === 'function') window.genOpenAuthModal();
  else document.getElementById('auth-btn')?.click();
});

$('#googleAudioChoose').addEventListener('click', () => $('#googleAudioFile').click());

$('#googleAudioFile').addEventListener('change', event => {
  const file = event.target.files?.[0] || null;
  if (!file) return resetDriveUpload();
  const extension = file.name.toLowerCase().match(/\.([^.]+)$/)?.[1] || '';
  if (!['mp3', 'm4a'].includes(extension)) {
    resetDriveUpload();
    return showStatus('Seleccioná un archivo MP3 o M4A.', true);
  }
  if (file.size > MAX_GOOGLE_AUDIO_BYTES) {
    resetDriveUpload();
    return showStatus('El audio supera el máximo de 25 MB.', true);
  }
  selectedGoogleAudioFile = file;
  $('#googleAudioFileName').textContent = file.name;
  $('#googleAudioUpload').hidden = false;
  setDriveProgress(0, `${(file.size / 1024 / 1024).toFixed(1)} MB`);
});

$('#googleAudioUpload').addEventListener('click', uploadSelectedAudioToDrive);
$('#publicAudioSongSearch').addEventListener('input', renderSongOptions);
$('#publicAudioSong').addEventListener('change', () => { updateSelectedSongSummary(); updatePreview(); });

[
  'publicAudioUrl', 'publicAudioType', 'publicAudioLanguage',
  'publicAudioPerformer', 'publicAudioVoiceVersion', 'publicAudioVoiceType'
].forEach(id => document.getElementById(id).addEventListener('input', updatePreview));

$('#publicAudioForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser) return updateAuth(null);
  const utils = window.firebaseUtils;
  const db = window.firebaseDb;
  const song = selectedSong();
  if (!song) return showStatus('Elegí una canción.', true);
  if (isVoiceUpload() && (!$('#publicAudioVoiceVersion').value.trim() || !$('#publicAudioVoiceType').value.trim())) {
    return showStatus('Completá la versión de voces y el tipo de voz.', true);
  }
  if (!$('#publicAudioPermission').checked) return showStatus('Confirmá que el audio puede compartirse.', true);

  const button = $('#publicAudioSubmit');
  button.disabled = true;
  try {
    if (selectedGoogleAudioFile) {
      button.textContent = 'Subiendo audio…';
      const uploadResult = await uploadSelectedAudioToDrive();
      if (!uploadResult) return;
    }
    const url = $('#publicAudioUrl').value.trim();
    try { new URL(url); } catch { return showStatus('Agregá un enlace válido o seleccioná un archivo MP3 o M4A.', true); }
    const provider = detectProvider(url);
    button.textContent = 'Enviando…';
    const id = `audio_${Date.now()}_${currentUser.uid.slice(0, 8)}`;
    const submitterName = String(currentUser.displayName || currentUser.email?.split('@')[0] || 'Perfil sin nombre').slice(0, 120);
    const data = {
      cancionId: String(song.id), cancionTitulo: song.titulo || '', url, proveedor: provider,
      modoReproduccion: ['youtube', 'spotify', 'soundcloud', 'drive', 'vimeo'].includes(provider)
        ? 'embed' : provider === 'directo' ? 'audio' : 'externo',
      tipo: $('#publicAudioType').value,
      version: '',
      versionVocal: isVoiceUpload() ? $('#publicAudioVoiceVersion').value.trim() : '',
      tipoVoz: isVoiceUpload() ? $('#publicAudioVoiceType').value.trim() : '',
      interprete: $('#publicAudioPerformer').value.trim(), idioma: $('#publicAudioLanguage').value,
      descripcion: $('#publicAudioDescription').value.trim(),
      nombre: generatedName(), estado: 'pendiente', esPrincipal: false, permisosConfirmados: true,
      creadoPor: currentUser.uid, creadoPorNombre: submitterName,
      fechaCreacion: new Date(), actualizadaEn: new Date()
    };
    await utils.setDoc(utils.doc(db, 'cancion_audios', id), data);
    if (pendingSongTarget && String(song.id) === String(pendingSongTarget.id)) {
      sessionStorage.removeItem('gen_pending_song_audio_target');
    }
    event.target.reset();
    resetDriveUpload();
    if (pendingSongTarget) {
      $('#publicAudioSong').value = String(pendingSongTarget.id);
      $('#publicAudioSong').disabled = true;
      $('#publicAudioSongSearch').value = pendingSongTarget.titulo;
      updateSelectedSongSummary();
    } else {
      renderSongOptions();
    }
    updatePreview();
    showStatus('Propuesta enviada. El equipo la revisará antes de publicarla.');
  } catch (error) {
    console.error(error);
    showStatus('No pudimos enviar la propuesta. Revisá tu sesión e intentá nuevamente.', true);
  } finally {
    button.disabled = false;
    button.textContent = 'Enviar para revisión';
  }
});

async function init() {
  await Promise.all([loadSongs(), loadUploadFormConfig()]);
  if (window.firebaseReady) await window.firebaseReady;
  const auth = window.firebaseAuth;
  const utils = window.firebaseUtils;
  if (!auth || !utils) return showStatus('No pudimos iniciar el acceso a tu cuenta.', true);
  utils.onAuthStateChanged(auth, updateAuth);
}

window.addEventListener('gen:auth-changed', event => updateAuth(event.detail?.user || null));
init();
