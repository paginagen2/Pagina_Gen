'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createECDH } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = relative => fs.existsSync(path.join(root, relative));
const requireIos = process.argv.includes('--ios');

const pushConfig = read('aaglobal/push-config.js');
const publicKey = pushConfig.match(/GEN2_VAPID_PUBLIC_KEY\s*=\s*'([^']+)'/)?.[1];
const keyId = pushConfig.match(/GEN2_VAPID_KEY_ID\s*=\s*'([^']+)'/)?.[1];
if (!publicKey || !keyId) throw new Error('Faltan la clave pública o la versión Web Push.');

const workflow = read('.github/workflows/procesar-notificaciones.yml');
if (!workflow.includes(`WEB_PUSH_PUBLIC_KEY: ${publicKey}`)) {
  throw new Error('La web y el procesador usan claves públicas Web Push diferentes.');
}

let privateKey = process.env.WEB_PUSH_PRIVATE_KEY || '';
if (!privateKey && exists('WebPush_Secreto_GitHub.local.txt')) {
  privateKey = read('WebPush_Secreto_GitHub.local.txt').match(/[A-Za-z0-9_-]{43}/g)?.[0] || '';
}
if (privateKey) {
  const vapid = createECDH('prime256v1');
  vapid.setPrivateKey(Buffer.from(privateKey, 'base64url'));
  if (vapid.getPublicKey().toString('base64url') !== publicKey) {
    throw new Error('La clave privada Web Push no corresponde a la clave pública.');
  }
}

if (exists('android/app/google-services.json')) {
  const android = JSON.parse(read('android/app/google-services.json'));
  const client = android.client?.find(item => item.client_info?.android_client_info?.package_name === 'com.paginagen.app');
  if (!client?.client_info?.mobilesdk_app_id || !client?.api_key?.[0]?.current_key) {
    throw new Error('google-services.json no contiene una configuración válida para com.paginagen.app.');
  }
}

if (requireIos) {
  if (!exists('ios/App/App/GoogleService-Info.plist')) {
    throw new Error('Falta ios/App/App/GoogleService-Info.plist. Descargalo desde la aplicación iOS com.paginagen.app en Firebase.');
  }
  const iosConfig = read('ios/App/App/GoogleService-Info.plist');
  if (!iosConfig.includes('<string>com.paginagen.app</string>')) {
    throw new Error('GoogleService-Info.plist no corresponde a com.paginagen.app.');
  }
  const project = read('ios/App/App.xcodeproj/project.pbxproj');
  if (!project.includes('GoogleService-Info.plist in Resources')) {
    throw new Error('GoogleService-Info.plist no está agregado al target iOS.');
  }
}

console.log(`Configuración de notificaciones verificada${requireIos ? ' para iOS' : ''}.`);
