const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = relativePath => fs.existsSync(path.join(root, relativePath));

const playlist = read('cancionero/playlist.js');
const playlistHtml = read('cancionero/playlist.html');
const playlistCss = read('cancionero/playlist.css');
const audioCatalog = read('cancionero/audio-catalog.js');
const song = read('cancionero/cancion.js');
const audios = read('cancionero/audios.js');
const androidManifest = exists('android/app/src/main/AndroidManifest.xml') ? read('android/app/src/main/AndroidManifest.xml') : '';
const androidActivity = exists('android/app/src/main/java/com/paginagen/app/MainActivity.java') ? read('android/app/src/main/java/com/paginagen/app/MainActivity.java') : '';
const iosDelegate = exists('ios/App/App/AppDelegate.swift') ? read('ios/App/App/AppDelegate.swift') : '';
const iosInfo = exists('ios/App/App/Info.plist') ? read('ios/App/App/Info.plist') : '';
const unavailable = read('perfil/sin-conexion-no-disponible.html');

assert.match(playlistHtml, /accept="\.playlistgen"/);
assert.doesNotMatch(playlist, /^import\s+\{\s*DatabaseService\s*\}/m, 'Las listas locales no deben esperar una importación estática de Firebase.');
assert.match(playlist, /void connectAccountPlaylists\(\)/);
assert.match(playlist, /sessionStorage\.getItem\('native_playlist_import'\)/);
assert.match(playlist, /data\.items\.length > 500/);
assert.match(playlist, /AndroidPlaylistFiles\.sharePlaylist/);
assert.match(playlist, /AndroidPlaylistFiles\.savePlaylist/);
assert.match(playlist, /Guardar archivo/);
assert.match(playlist, /function selectPlaylist/);
assert.match(playlist, /scrollIntoView\(\{ behavior: 'smooth'/);
assert.match(playlist, /onError\(\).*playNext\(\)/, 'Un video de YouTube no disponible debe avanzar la cola.');
assert.match(audioCatalog, /queueCompatibleProviders\s*=\s*new Set\(\['youtube', 'drive', 'vimeo', 'directo'\]\)/);
assert.doesNotMatch(audioCatalog, /queueCompatibleProviders\s*=.*soundcloud/);
assert.match(audioCatalog, /function addToLocalPlaylist\(audio, requestedName = '', requestedId = ''\) \{\s*if \(!audio\?\.id \|\| !audio\?\.url\) return null;/);
assert.match(audioCatalog, /adoptGuestPlaylistsForCurrentUser/);
assert.match(audioCatalog, /LEGACY_PLAYLIST_STORAGE_KEY/);
assert.match(song, /if \(isQueueCompatibleAudio\(audio\)\)/, 'Sólo las fuentes compatibles deben poder agregarse a una playlist.');
assert.match(song, /initializePlaylistStore\(\)/, 'La canción y Audios deben usar el mismo almacenamiento inicializado.');
assert.match(audios, /if \(isQueueCompatibleAudio\(audio\)\) \{[\s\S]*actions\.append\(add\);/);
assert.match(audios, /renderPlaylistChoices\(\);[\s\S]*playlistBackdrop.*hidden = false[\s\S]*loadAccountPlaylists\(\)\.then/, 'El selector debe abrir inmediatamente y actualizarse luego de sincronizar.');
assert.match(playlist, /playerDescriptor\(audio\)\.mode === 'audio'/, 'El modo continuo debe incluir únicamente audios reproducibles en segundo plano.');
assert.match(playlist, /item\.audio\?\.url/, 'La importación debe aceptar fuentes mixtas con enlaces válidos.');
assert.match(playlistCss, /--site-mobile-nav-height/);
assert.match(playlistCss, /\.playlist-selector-back/);
if (androidManifest) {
  assert.match(androidManifest, /application\/vnd\.paginagen\.playlist\+json/);
  assert.match(androidManifest, /application\/octet-stream/);
  assert.match(androidManifest, /android\.intent\.action\.SEND/);
  assert.match(androidManifest, /playlistgen/);
  assert.match(androidActivity, /native_playlist_import/);
  assert.match(androidActivity, /pendingPlaylistPayload/);
  assert.match(androidActivity, /attemptPlaylistDelivery\(attempt \+ 1\)/);
  assert.match(androidActivity, /OpenableColumns\.DISPLAY_NAME/);
  assert.match(androidActivity, /FileProvider\.getUriForFile/);
  assert.match(androidActivity, /Intent\.ACTION_CREATE_DOCUMENT/);
  assert.match(androidActivity, /openOutputStream/);
  assert.match(androidActivity, /isValidPlaylistPayload/);
  assert.match(androidActivity, /MAX_PLAYLIST_BYTES/);
}
if (iosDelegate) {
  assert.match(iosDelegate, /native_playlist_import/);
  assert.match(iosInfo, /com\.paginagen\.playlist/);
  assert.match(iosInfo, /<string>playlistgen<\/string>/);
}
assert.match(unavailable, /<base href="\/">/);
assert.match(unavailable, /href="\/?perfil\/sin-conexion\.html"/);

const stored = new Map();
const localStorageMock = {
  getItem: key => stored.has(key) ? stored.get(key) : null,
  setItem: (key, value) => stored.set(key, String(value)),
  removeItem: key => stored.delete(key)
};
const browserWindow = {
  firebaseAuth: { currentUser: { uid: 'usuario-prueba' } },
  firebaseUtils: {},
  firebaseConfigWeb: {},
  addEventListener() {},
  dispatchEvent() {}
};
const context = {
  window: browserWindow,
  localStorage: localStorageMock,
  sessionStorage: localStorageMock,
  navigator: { onLine: false },
  URL,
  TextEncoder,
  TextDecoder,
  CustomEvent: class CustomEvent {},
  console,
  btoa: value => Buffer.from(value, 'binary').toString('base64'),
  atob: value => Buffer.from(value, 'base64').toString('binary')
};
const executableCatalog = audioCatalog
  .replace(/^export\s+/gm, '')
  .replace(/import\.meta\.url/g, "'http://localhost/cancionero/audio-catalog.js'")
  + '\nwindow.__playlistTest = { adoptGuestPlaylistsForCurrentUser, getLocalPlaylists, addToLocalPlaylist };';
vm.runInNewContext(executableCatalog, context);
stored.set('gen_audio_playlists_v1', JSON.stringify([{ id: 'lista-antigua', nombre: 'Antigua', tipo: 'audio', items: [] }]));
stored.set('gen_audio_playlists_v2:guest', JSON.stringify([{ id: 'lista-audios', nombre: 'Audios', tipo: 'audio', items: [] }]));
stored.set('gen_audio_playlists_v2:usuario-prueba', JSON.stringify([{ id: 'lista-cuenta', nombre: 'Cuenta', tipo: 'audio', items: [] }]));
const migrated = browserWindow.__playlistTest.adoptGuestPlaylistsForCurrentUser();
assert.deepEqual([...migrated.map(item => item.id)].sort(), ['lista-antigua', 'lista-audios', 'lista-cuenta']);
assert.equal(stored.has('gen_audio_playlists_v1'), false);
assert.equal(stored.has('gen_audio_playlists_v2:guest'), false);
const saved = browserWindow.__playlistTest.addToLocalPlaylist({ id: 'audio-1', cancionId: 'cancion-1', url: 'https://youtu.be/prueba' }, 'Nombre que no se usa', 'lista-audios');
assert.equal(saved.id, 'lista-audios');
assert.equal(saved.items[0].audioId, 'audio-1');

console.log('Listas del Cancionero verificadas: web local, importación y asociaciones Android/iOS.');
