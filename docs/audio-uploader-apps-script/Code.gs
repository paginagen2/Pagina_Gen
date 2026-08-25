const DESTINATION_FOLDER_ID = '1Trlfa5w1xiPVcET_JVmuIk6vf1pyJLaSb3KHzG9Xc08uBhC_Eap8TfGZdd6Wz9g8_ZlTzcPI';
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const STATUS_TTL_SECONDS = 600;

function doGet(event) {
  const params = event && event.parameter ? event.parameter : {};
  if (params.action === 'status') return uploadStatusResponse_(params);
  return ContentService.createTextOutput('Servicio de carga de audios Gen 2');
}

function doPost(event) {
  let uploadToken = '';
  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    uploadToken = validToken_(payload.uploadToken);
    setUploadStatus_(uploadToken, { state: 'uploading' });

    const originalName = String(payload.fileName || 'audio.mp3');
    if (!originalName.toLowerCase().endsWith('.mp3')) throw new Error('Solo se permiten archivos MP3.');
    if (!payload.base64) throw new Error('El archivo está vacío.');

    const bytes = Utilities.base64Decode(payload.base64);
    if (bytes.length > MAX_FILE_SIZE) throw new Error('El archivo supera el máximo de 25 MB.');
    if (!looksLikeMp3_(bytes)) throw new Error('El contenido no corresponde a un MP3 válido.');
    const safeName = originalName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ._() -]/g, '_');
    const blob = Utilities.newBlob(bytes, 'audio/mpeg', safeName);
    const file = DriveApp.getFolderById(DESTINATION_FOLDER_ID).createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (error) { /* La carpeta puede otorgar el permiso por herencia. */ }

    const result = {
      state: 'complete',
      name: file.getName(),
      url: 'https://drive.google.com/file/d/' + file.getId() + '/view?usp=sharing'
    };
    setUploadStatus_(uploadToken, result);
    return jsonResponse_(result);
  } catch (error) {
    const result = { state: 'error', message: String(error && error.message || 'No se pudo subir el archivo.') };
    if (uploadToken) setUploadStatus_(uploadToken, result);
    return jsonResponse_(result);
  }
}

function uploadStatusResponse_(params) {
  const prefix = String(params.prefix || '');
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(prefix)) {
    return ContentService.createTextOutput('Callback inválido.');
  }
  let result;
  try {
    const token = validToken_(params.uploadToken);
    const cached = CacheService.getScriptCache().get('audio-upload:' + token);
    result = cached ? JSON.parse(cached) : { state: 'waiting' };
  } catch (error) {
    result = { state: 'error', message: 'Identificador de carga inválido.' };
  }
  return ContentService.createTextOutput(prefix + '(' + JSON.stringify(result) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function validToken_(value) {
  const token = String(value || '');
  if (!/^[a-zA-Z0-9_-]{20,80}$/.test(token)) throw new Error('Identificador de carga inválido.');
  return token;
}

function setUploadStatus_(token, result) {
  CacheService.getScriptCache().put('audio-upload:' + token, JSON.stringify(result), STATUS_TTL_SECONDS);
}

function looksLikeMp3_(bytes) {
  if (bytes.length < 3) return false;
  const startsWithId3 = bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51;
  const startsWithFrame = (bytes[0] & 255) === 255 && ((bytes[1] & 255) & 224) === 224;
  return startsWithId3 || startsWithFrame;
}

function jsonResponse_(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
