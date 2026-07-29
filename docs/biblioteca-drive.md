# Flujo editorial de Biblioteca con Google Drive

## Configurar el formulario de archivos

1. Crear un Google Form nuevo con una pregunta de **Subir archivo**.
2. Opcionalmente agregar un campo corto para que la persona copie el código de referencia mostrado por la Biblioteca.
3. En **Administración → Biblioteca → Formulario para adjuntar archivos**, pegar el enlace del formulario.
4. Guardarlo. El formulario aparecerá integrado dentro de la página y no enviará a la persona a otra pestaña.

## Recibir y revisar un aporte

1. La persona abre **Aportar un recurso** en la Biblioteca.
2. Completa la ficha interna. Los datos quedan guardados en Firebase.
3. En el segundo paso adjunta únicamente el archivo mediante Google Forms, sin salir de la página.
4. El equipo abre el archivo recibido en Drive y revisa contenido, autoría y permisos.
5. Si se aprueba, mueve el archivo a la carpeta definitiva de la Biblioteca.

Si la persona propone un tema nuevo, aparecerá destacado en **Aportes recibidos**. Un administrador debe decidir si lo incorpora a **Temas oficiales** antes de utilizarlo en la ficha.

## Preparar el archivo

1. En Google Drive, abrir **Compartir**.
2. En **Acceso general**, elegir **Cualquier persona con el enlace**.
3. Mantener el permiso **Lector**.
4. Copiar el enlace.

No debe publicarse un enlace con permisos de edición.

## Incorporarlo al catálogo

1. Abrir **Administración → Biblioteca**.
2. En **Aportes recibidos**, elegir **Preparar ficha**.
3. Revisar los datos que la persona proporcionó.
4. Pegar el enlace aprobado en **Link del recurso**. Este campo también admite enlaces externos que no sean de Drive.
5. Pulsar **Comprobar enlace**. Debe abrir sin pedir permisos.
6. Guardar inicialmente como **Borrador** y revisar cómo aparece.
7. Cambiar el estado a **Publicado**.

## Retirar un recurso

- **Archivar** lo oculta de la Biblioteca sin borrar la ficha.
- **Eliminar** quita la ficha de Firestore, pero conserva el archivo original en Drive.
- Para retirar también el archivo, debe hacerse manualmente desde Drive.

## Organización sugerida en Drive

```text
Biblioteca Gen
├── 01 - Aportes para revisar
├── 02 - Publicados
│   ├── Libros
│   ├── Documentos
│   ├── Audio
│   └── Videos
└── 03 - Archivados
```
