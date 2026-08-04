# Sincronización offline preparada

Esta infraestructura queda desactivada para no modificar el funcionamiento publicado.
No requiere cambios en `firestore.rules`.

## Qué está preparado

- `scripts/generar-sincronizacion-offline.js` consulta las colecciones públicas.
- Genera una foto actual compacta por colección.
- Genera una diferencia con altas, modificaciones y eliminaciones.
- Varias ediciones quedan agrupadas en una sola ejecución.
- El dispositivo usa la diferencia si tiene la revisión inmediatamente anterior.
- Un dispositivo muy atrasado reemplaza su colección con la foto actual.
- Las modificaciones pisan el registro local y las eliminaciones lo borran.
- El flujo de GitHub está disponible únicamente mediante ejecución manual.
- El cliente tiene `INCREMENTAL_SYNC_ENABLED = false`.

## Colecciones incluidas

- canciones
- meditaciones
- recursos de Gen Animadores
- catálogo de Biblioteca, sin descargar documentos
- Pasapalabra
- Palabra de Vida
- publicaciones públicas del Canal

Las publicaciones del Canal destinadas a roles continúan usando su ruta autenticada y
no se incluyen en archivos públicos.

## Activación futura

1. Ejecutar manualmente `Preparar sincronización offline`.
2. Revisar los archivos creados en `datos/sincronizacion`.
3. Publicarlos en un entorno de prueba.
4. Cambiar `INCREMENTAL_SYNC_ENABLED` a `true`.
5. Probar modificaciones, eliminaciones, reconexión y dispositivos atrasados.
6. Agregar al flujo una programación cada 30 minutos.
7. Publicar web/PWA y generar el APK.

No debe agregarse la programación automática antes de completar la validación.
