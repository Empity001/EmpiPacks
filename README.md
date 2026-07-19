# EmpiPacks

Repositorio de EmpiPack Studio y catalogo remoto de EmpiLauncher.

## EmpiPack Studio

La app toma una instancia existente, muestra sus carpetas y archivos superiores
y genera un `.empipack` con solo el contenido marcado. Mods, configuraciones,
resource packs y shaders se recomiendan por defecto; mundos, logs, versiones y
caches quedan fuera salvo que se seleccionen manualmente.

```bash
npm install
npm run dev
```

## Publicar un paquete

1. Instala [GitHub CLI](https://cli.github.com/) y ejecuta `gh auth login` una vez.
2. Genera el paquete con EmpiPack Studio.
3. Pulsa `Publicar en GitHub`.

Studio crea o actualiza la release `ID-VERSION`, sube el `.empipack` y actualiza
`catalog.json` sin guardar tu cuenta ni tokens dentro de la aplicacion.

EmpiLauncher consulta este catalogo al abrir, descarga solo versiones nuevas y
verifica el SHA-256 antes de extraerlas. El formato interno es un ZIP con este
contenido:

```text
pack.json
overrides/
  mods/
  config/
  resourcepacks/
```

Hito actual: `empipack-studio-foundation-01`.
