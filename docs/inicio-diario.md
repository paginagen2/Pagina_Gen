# Inicio diario sin lecturas por visitante

La portada consume `datos/inicio.json`. GitHub Actions regenera ese archivo una vez por día consultando Firestore con una cuenta de servicio de solo lectura.

## Configuración inicial

1. En Google Cloud IAM, crear una cuenta de servicio para el proyecto `pagina-gen`.
2. Otorgarle solamente un rol de lectura de Firestore, por ejemplo `Cloud Datastore Viewer`.
3. Crear una clave JSON para esa cuenta.
4. En GitHub, abrir `Settings > Secrets and variables > Actions`.
5. Crear el secreto `FIREBASE_SERVICE_ACCOUNT` pegando el JSON completo.
6. Abrir `Actions > Generar inicio diario` y ejecutar `Run workflow` una vez.

La clave nunca debe guardarse en un archivo del repositorio.

## Ejecución

El workflow `.github/workflows/generar-inicio-diario.yml` se ejecuta todos los días a las 00:05 de `America/Argentina/Buenos_Aires`. También puede ejecutarse manualmente.

Si falla, la portada conserva el último `datos/inicio.json` válido.

## Reglas e índices

`firestore.rules` y `firestore.indexes.json` están versionados, pero deben publicarse en Firebase para tener efecto:

```powershell
firebase deploy --only firestore
```

Antes de publicarlas en producción conviene validarlas con Firebase Emulator Suite y una copia representativa de los documentos.
