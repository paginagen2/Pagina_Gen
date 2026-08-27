const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = relativePath => fs.existsSync(path.join(root, relativePath));

const playlist = read('cancionero/playlist.js');
const playlistHtml = read('cancionero/playlist.html');
const playlistCss = read('cancionero/playlist.css');
const audioCatalog = read('cancionero/audio-catalog.js');
const song = read('cancionero/cancion.js');
const audios = read('cancionero/audios.js');
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
assert.match(audioCatalog, /function addToLocalPlaylist\(audio, requestedName = ''\) \{\s*if \(!audio\?\.id \|\| !audio\?\.url\) return null;/);
assert.match(song, /if \(audio\?\.url\)/, 'Toda fuente con enlace puede agregarse a una lista.');
assert.match(audios, /if \(audio\?\.url\) \{[\s\S]*actions\.append\(add\);/);
assert.match(playlist, /playerDescriptor\(audio\)\.mode === 'audio'/, 'El modo continuo debe incluir únicamente audios reproducibles en segundo plano.');
assert.match(playlist, /item\.audio\?\.url/, 'La importación debe aceptar fuentes mixtas con enlaces válidos.');
assert.match(playlistCss, /--site-mobile-nav-height/);
assert.match(playlistCss, /\.playlist-selector-back/);
assert.match(unavailable, /<base href="\/">/);
assert.match(unavailable, /href="\/?perfil\/sin-conexion\.html"/);

if (exists('android/app/src/main/AndroidManifest.xml')) {
  const androidManifest = read('android/app/src/main/AndroidManifest.xml');
  const androidActivity = read('android/app/src/main/java/com/paginagen/app/MainActivity.java');
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

if (exists('ios/App/App/AppDelegate.swift')) {
  const iosDelegate = read('ios/App/App/AppDelegate.swift');
  const iosInfo = read('ios/App/App/Info.plist');
  assert.match(iosDelegate, /native_playlist_import/);
  assert.match(iosInfo, /com\.paginagen\.playlist/);
  assert.match(iosInfo, /<string>playlistgen<\/string>/);
}

console.log('Listas del Cancionero verificadas: web local e importación.');
