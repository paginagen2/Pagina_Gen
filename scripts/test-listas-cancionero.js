const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = relativePath => fs.existsSync(path.join(root, relativePath));

const playlist = read('cancionero/playlist.js');
const playlistHtml = read('cancionero/playlist.html');
const playlistCss = read('cancionero/playlist.css');
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
assert.match(playlistCss, /--site-mobile-nav-height/);
assert.match(playlistCss, /\.playlist-selector-back/);
assert.match(unavailable, /<base href="\/">/);
assert.match(unavailable, /href="perfil\/sin-conexion\.html"/);

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
