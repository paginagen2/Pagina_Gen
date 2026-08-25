export function hasNativeAudio() { return Boolean(window.AndroidNativeAudio?.playQueue); }

function nativeItem(audio, descriptor, album) {
  return {
    id: String(audio.id || audio.audioId || ''),
    url: descriptor.url,
    title: audio.nombre || audio.titulo || 'Audio de la canción',
    artist: audio.artista || audio.autor || 'Gen',
    album: album || 'Cancionero Gen',
    artwork: new URL('../aadocumentos/imagenes/og-image.jpg', location.href).href
  };
}

export function playNativeAudio(audio, descriptor, album = 'Cancionero Gen') {
  if (!hasNativeAudio() || descriptor?.mode !== 'audio') return false;
  return window.AndroidNativeAudio.playQueue(JSON.stringify([nativeItem(audio, descriptor, album)]), 0) === true;
}

export function playNativeQueue(audios, activeAudio, descriptorFor, album = 'Playlist Gen') {
  if (!hasNativeAudio()) return false;
  const playable = audios.map(audio => ({ audio, descriptor: descriptorFor(audio) })).filter(item => item.descriptor?.mode === 'audio');
  const index = playable.findIndex(item => String(item.audio.id) === String(activeAudio.id));
  if (index < 0) return false;
  const payload = playable.map(item => nativeItem(item.audio, item.descriptor, album));
  return window.AndroidNativeAudio.playQueue(JSON.stringify(payload), index) === true;
}

export function nativePlay() { window.AndroidNativeAudio?.play?.(); }
export function nativePause() { window.AndroidNativeAudio?.pause?.(); }
export function nativePrevious() { window.AndroidNativeAudio?.previous?.(); }
export function nativeNext() { window.AndroidNativeAudio?.next?.(); }
export function nativeStop() { window.AndroidNativeAudio?.stop?.(); }
export function nativeSeekTo(seconds) { window.AndroidNativeAudio?.seekTo?.(Math.max(0, Number(seconds) || 0) * 1000); }

export function nativeAudioState() {
  try { return JSON.parse(window.AndroidNativeAudio?.getState?.() || '{"active":false}'); }
  catch { return { active: false }; }
}
