# Cargador de MP3 del Cancionero Gen

Un Google Form estándar tiene un mensaje final fijo y no puede mostrar automáticamente el enlace particular del archivo recién subido. La página Gen realiza la carga dentro de su propio formulario y utiliza Google Apps Script solamente como receptor interno, evitando la incompatibilidad de las aplicaciones web con varias cuentas de Google abiertas.

## Configuración

1. Desde la cuenta institucional, crear una carpeta de Drive llamada **Audios Cancionero Gen**.
2. Compartirla como **Cualquier persona con el enlace · Lector**.
3. Copiar el identificador de la carpeta desde su URL.
4. Abrir [script.new](https://script.new) desde la misma cuenta.
5. Copiar `Code.gs`; el identificador de la carpeta institucional ya está configurado.
6. Implementar como **Aplicación web**, ejecutándola como el propietario y permitiendo el acceso público.
7. Autorizar Drive y copiar la URL terminada en `/exec`.
8. Pegar esa URL en `datos/cancionero/audio-upload.json`, dentro de `googleFormUrl`.

El usuario nunca abre la URL de Apps Script. `subir-audio.html` envía el MP3 mediante `doPost` sin credenciales de Google y consulta el resultado temporal mediante `doGet`; al finalizar completa automáticamente el enlace público. Administración solo recibe y modera la propuesta pendiente.

Después de modificar `Code.gs`, siempre se debe publicar una versión nueva de la implementación.
