# Sincronización offline preparada

Esta infraestructura está activada y no requiere cambios en `firestore.rules`.
La publicación web se realiza mediante GitHub Pages en
`https://paginagen2.github.io/Pagina_Gen/`.

## Qué está preparado

- `scripts/generar-sincronizacion-offline.js` consulta las colecciones públicas.
- Genera una foto actual compacta por colección.
- Genera una diferencia con altas, modificaciones y eliminaciones.
- Varias ediciones quedan agrupadas en una sola ejecución.
- El dispositivo usa la diferencia si tiene la revisión inmediatamente anterior.
- Un dispositivo muy atrasado reemplaza su colección con la foto actual.
- Las modificaciones pisan el registro local y las eliminaciones lo borran.
- El flujo de GitHub puede ejecutarse manualmente y también cada 30 minutos.
- El cliente tiene `INCREMENTAL_SYNC_ENABLED = true`.

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

## Operación y validación

1. Revisar periódicamente la ejecución `Preparar sincronización offline`.
2. Confirmar que `datos/sincronizacion/manifest.json` avance de revisión.
3. Probar modificaciones, eliminaciones, reconexión y dispositivos atrasados.
4. Confirmar el despliegue de GitHub Pages y generar el APK después de cada cambio estructural.
