const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { createECDH } = require('node:crypto');
const webpush = require('web-push');
const { currentMinute, plansForLocalDay } = require('./notificaciones-planificador');

const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT;
const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
if (!serviceAccountValue || !publicKey || !privateKey) {
  throw new Error('Faltan FIREBASE_SERVICE_ACCOUNT, WEB_PUSH_PUBLIC_KEY o WEB_PUSH_PRIVATE_KEY.');
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountValue);
} catch {
  serviceAccount = JSON.parse(Buffer.from(serviceAccountValue, 'base64').toString('utf8'));
}

const vapid = createECDH('prime256v1');
vapid.setPrivateKey(Buffer.from(privateKey, 'base64url'));
if (vapid.getPublicKey().toString('base64url') !== publicKey) {
  throw new Error('WEB_PUSH_PUBLIC_KEY no corresponde a WEB_PUSH_PRIVATE_KEY.');
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
webpush.setVapidDetails('https://paginagen2.github.io/Pagina_Gen', publicKey, privateKey);

function clean(value, max = 220) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validSubscription(value) {
  return value?.endpoint?.startsWith('https://') && value?.keys?.p256dh && value?.keys?.auth;
}

function absoluteAsset(value) {
  return new URL(String(value || '').replace(/^\/+/, ''), 'https://paginagen2.github.io/Pagina_Gen/').href;
}

async function sendToDevice(doc, payload) {
  const device = doc.data();
  if (!device.enabled) return 'skipped';
  try {
    if (device.fcmToken) {
      await getMessaging().send({
        token: device.fcmToken,
        notification: {
          title: clean(payload.title, 90),
          body: clean(payload.body),
          ...(payload.image ? { imageUrl: absoluteAsset(payload.image) } : {})
        },
        data: {
          url: clean(payload.url || 'index.html', 300),
          tag: clean(payload.tag || 'gen2-notification', 120),
          image: payload.image ? absoluteAsset(payload.image) : ''
        },
        android: {
          priority: payload.urgency === 'high' ? 'high' : 'normal',
          notification: {
            ...(payload.image ? { imageUrl: absoluteAsset(payload.image) } : {}),
            tag: clean(payload.tag || 'gen2-notification', 120),
            sound: 'default'
          }
        },
        apns: {
          headers: { 'apns-priority': '10' },
          payload: { aps: { sound: 'default', badge: Number(payload.badge || 1), mutableContent: true } },
          ...(payload.image ? { fcmOptions: { imageUrl: absoluteAsset(payload.image) } } : {})
        }
      });
    } else if (validSubscription(device.subscription)) {
      await webpush.sendNotification(device.subscription, JSON.stringify(payload), {
        TTL: 43200,
        urgency: payload.urgency || 'normal'
      });
    } else {
      await doc.ref.set({
        enabled: false,
        ultimoError: 'El dispositivo no tiene un token o una suscripción válida.',
        ultimoErrorEn: FieldValue.serverTimestamp()
      }, { merge: true });
      return 'skipped';
    }
    await doc.ref.set({ ultimoEnvioEn: FieldValue.serverTimestamp(), ultimoError: FieldValue.delete() }, { merge: true });
    return 'sent';
  } catch (error) {
    const expired = [401, 403, 404, 410].includes(error.statusCode)
      || ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(error.code);
    await doc.ref.set({
      ...(expired ? { enabled: false, subscription: null, fcmToken: null } : {}),
      ultimoError: clean(error.message, 240),
      ultimoErrorEn: FieldValue.serverTimestamp()
    }, { merge: true });
    const log = expired ? console.warn : console.error;
    log(expired ? 'Se retiró un registro de notificaciones vencido' : 'Falló una notificación', {
      deviceId: doc.id,
      platform: device.platform || 'unknown',
      transport: device.transport || 'unknown',
      code: error.code || error.statusCode || 'unknown',
      message: clean(error.message, 240)
    });
    return expired ? 'skipped' : 'failed';
  }
}

async function devices() {
  return db.collectionGroup('dispositivosNotificaciones').where('enabled', '==', true).get();
}

async function matchesRoles(doc, roles) {
  if (!roles?.length) return true;
  const user = await doc.ref.parent.parent.get();
  return (user.data()?.roles || []).some(role => roles.includes(role));
}

async function broadcast(payload, { category = 'general', roles = [], deliveryKey = '' } = {}) {
  const snapshot = await devices();
  const result = { devices: snapshot.size, matched: 0, sent: 0, failed: 0, alreadyDelivered: 0, skipped: 0 };
  for (const doc of snapshot.docs) {
    const isEssentialCommunication = category === 'general' || category === 'zone';
    if (!isEssentialCommunication && (doc.data().categories?.[category] || 'off') === 'off') continue;
    if (!(await matchesRoles(doc, roles))) continue;
    result.matched += 1;
    const delivery = deliveryKey ? doc.ref.collection('entregas').doc(deliveryKey) : null;
    if (delivery && (await delivery.get()).exists) {
      result.alreadyDelivered += 1;
      continue;
    }
    const status = await sendToDevice(doc, payload);
    if (status === 'sent') {
      result.sent += 1;
      if (delivery) await delivery.set({ category, creadoEn: FieldValue.serverTimestamp() });
    }
    if (status === 'failed') result.failed += 1;
    if (status === 'skipped') result.skipped += 1;
  }
  return result;
}

async function processQueue() {
  const summary = { jobs: 0, sent: 0, failed: 0 };
  const snapshot = await db.collection('notificaciones_pendientes')
    .where('estado', '==', 'pendiente').limit(25).get();
  for (const job of snapshot.docs) {
    summary.jobs += 1;
    const data = job.data();
    await job.ref.set({ estado: 'procesando', procesadoEn: FieldValue.serverTimestamp() }, { merge: true });
    try {
      let result;
      if (data.tipo === 'prueba') {
        const device = await db.doc(`usuarios/${data.destinatarioUid}/dispositivosNotificaciones/${data.deviceId}`).get();
        const status = device.exists ? await sendToDevice(device, {
          title: 'Una pausa para hoy',
          body: 'Tu Meditación diaria está lista. Tocá para abrirla en Gen 2.',
          url: 'meditacion/meditacion_diaria.html',
          image: 'aadocumentos/imagenes/notificaciones/meditacion-diaria.png',
          tag: `gen2-test-${data.deviceId}`,
          badge: 1
        }) : 'failed';
        result = { sent: status === 'sent' ? 1 : 0, failed: status === 'failed' ? 1 : 0 };
      } else {
        result = await broadcast({
          title: clean(data.title, 90),
          body: clean(data.body),
          url: clean(data.url || 'index.html', 300),
          tag: `gen2-manual-${job.id}`,
          badge: 1,
          renotify: true
        }, {
          category: data.category || 'general',
          roles: Array.isArray(data.roles) ? data.roles : [],
          deliveryKey: `manual-${job.id}`
        });
      }
      summary.sent += result.sent || 0;
      summary.failed += result.failed || 0;
      await job.ref.set({ estado: 'completada', resultado: result, completadoEn: FieldValue.serverTimestamp() }, { merge: true });
    } catch (error) {
      summary.failed += 1;
      await job.ref.set({ estado: 'error', error: clean(error.message, 300), completadoEn: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  return summary;
}

async function notifyCanalPosts() {
  const summary = { posts: 0, sent: 0, failed: 0, waitingForDevices: 0 };
  const now = new Date();
  const [published, programmed] = await Promise.all([
    db.collection('canal_publicaciones').where('estado', '==', 'publicada')
      .orderBy('fechaPublicacion', 'desc').limit(25).get(),
    db.collection('canal_publicaciones').where('estado', '==', 'programada')
      .where('fechaPublicacion', '<=', now).limit(25).get()
  ]);
  for (const post of [...published.docs, ...programmed.docs]) {
    const data = post.data();
    if (data.notificacionEnviadaEn) continue;
    summary.posts += 1;
    const result = await broadcast({
      title: clean(data.titulo || 'Nueva comunicación', 90),
      body: clean(data.resumen || 'Hay una novedad en Canal Gen.'),
      url: 'canal/canal.html',
      image: data.imagenUrl || 'aadocumentos/imagenes/notificaciones/comunicacion.png',
      tag: `canal-${post.id}`,
      badge: 1,
      renotify: true
    }, {
      category: data.rolesDestinatarios?.length ? 'zone' : 'general',
      roles: data.rolesDestinatarios || [],
      deliveryKey: `canal-${post.id}`
    });
    summary.sent += result.sent;
    summary.failed += result.failed;
    const completed = result.matched > 0 && result.failed === 0 && result.skipped === 0;
    if (!completed && result.matched === 0) summary.waitingForDevices += 1;
    await post.ref.set({
      ...(completed ? { notificacionEnviadaEn: FieldValue.serverTimestamp() } : {}),
      resultadoNotificacion: result,
      ultimoIntentoNotificacionEn: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  return summary;
}

function localParts(timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'America/Argentina/Buenos_Aires',
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

const content = {
  wordOfLife: ['Palabra de Vida', 'Una propuesta para vivir la unidad te está esperando.', 'pdv/pdv.html', 'palabra-de-vida.png'],
  passphrase: ['Pasapalabra de hoy', 'Tomate un momento para descubrir la propuesta de hoy.', 'pasapalabra/pasapalabra_de_hoy.html', 'pasapalabra.png'],
  meditation: ['Meditación diaria', 'Una pausa para acompañar tu día.', 'meditacion/meditacion_diaria.html', 'meditacion-diaria.png']
};

async function processScheduledContent() {
  const summary = { devices: 0, due: 0, sent: 0, failed: 0 };
  const snapshot = await devices();
  summary.devices = snapshot.size;
  for (const device of snapshot.docs) {
    const data = device.data();
    const parts = localParts(data.timezone);
    const plans = plansForLocalDay(data, parts, Object.keys(content));
    for (const plan of plans) {
      const nowMinute = currentMinute(parts);
      if (nowMinute < plan.minute) continue;
      summary.due += 1;
      const [title, body, url, image] = content[plan.category];
      const delivery = device.ref.collection('entregas').doc(`${plan.category}-${plan.dateKey}`);
      if ((await delivery.get()).exists) continue;
      const status = await sendToDevice(device, {
        title, body, url,
        image: `aadocumentos/imagenes/notificaciones/${image}`,
        tag: `gen2-${plan.category}-${plan.dateKey}`,
        badge: 1
      });
      if (status === 'sent') {
        await delivery.set({
          category: plan.category,
          dateKey: plan.dateKey,
          horaProgramada: plan.time,
          horaFija: plan.fixed,
          creadoEn: FieldValue.serverTimestamp()
        });
        summary.sent += 1;
      }
      if (status === 'failed') summary.failed += 1;
    }
  }
  return summary;
}

(async () => {
  const summary = {
    queue: await processQueue(),
    channel: await notifyCanalPosts(),
    scheduled: await processScheduledContent()
  };
  console.log('Resumen de notificaciones:', JSON.stringify(summary));
  const failures = summary.queue.failed + summary.channel.failed + summary.scheduled.failed;
  if (failures > 0) throw new Error(`${failures} envío(s) de notificaciones fallaron.`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
