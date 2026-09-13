# RASTRO-CONTACT

**Extensión OSINT para extracción, normalización y análisis histórico de datos de contacto en sitios web.**

RASTRO-CONTACT forma parte de **RASTRO — Kit de Investigación de Fuentes Abiertas**. Está diseñada para que un investigador pueda analizar la página que tiene abierta en el navegador, localizar datos de contacto y perfiles sociales, descubrir páginas internas relevantes y contrastar esos indicadores con versiones históricas conservadas en Internet Archive.

> **Estado del proyecto:** versión 1.1.1. Herramienta en desarrollo activo. Los resultados automáticos deben verificarse siempre contra la fuente original.
>
> ## 📦 Descargar RASTRO-CONTACT

La última versión estable de la extensión está disponible en **GitHub Releases**:

➡️ **[Descargar RASTRO-CONTACT](../../releases/latest)**

> Descarga el archivo `rastro-contact-extension-vX.X.X.zip` incluido en **Assets**.  
> Los archivos `Source code (zip)` y `Source code (tar.gz)` son generados automáticamente por GitHub y no corresponden al paquete preparado para instalar la extensión.

### Instalación

1. Descarga la última versión desde **Releases**.
2. Descomprime el archivo ZIP.
3. Abre en Chrome:
   `chrome://extensions/`
4. Activa **Modo desarrollador**.
5. Pulsa **Cargar descomprimida**.
6. Selecciona la carpeta descomprimida de RASTRO-CONTACT.
7. Fija el icono de RASTRO-CONTACT en la barra del navegador para tener acceso rápido.

> **Nota:** RASTRO-CONTACT utiliza Manifest V3 y está desarrollada inicialmente para navegadores basados en Chromium. Chrome es actualmente el navegador utilizado como referencia para las pruebas de la extensión.

---

## 🖼️ RASTRO-CONTACT

RASTRO-CONTACT forma parte de **RASTRO — KIT DE INVESTIGACIÓN DE FUENTES ABIERTAS**.

La extensión permite analizar directamente la página abierta en el navegador, localizar datos de contacto y ampliar la investigación mediante páginas internas, fuentes históricas y pivotes hacia otros módulos RASTRO.


## Funciones principales

- Análisis de la pestaña activa mediante Manifest V3 y `chrome.scripting`.
- Extracción de **correos electrónicos** desde texto, HTML, `mailto:`, atributos, JSON-LD y formatos ofuscados.
- Decodificación de **Cloudflare Email Protection** (`data-cfemail`).
- Detección de **teléfonos** con prioridad para fuentes explícitas (`tel:` y datos estructurados) y filtros contextuales contra falsos positivos.
- Normalización de números españoles a formato internacional cuando el patrón es compatible.
- Detección de perfiles y enlaces de **LinkedIn, Instagram, Facebook, X/Twitter, Telegram, GitHub, YouTube, TikTok, WhatsApp y Discord**.
- Identificación y análisis opcional de páginas internas como contacto, aviso legal, privacidad, soporte, empresa o equipo.
- Consulta histórica mediante **Wayback Machine CDX**.
- Selección limitada de snapshots, deduplicación por `digest`, reintentos y pausas entre peticiones.
- Correlación de indicadores **actuales, históricos y persistentes**.
- Cronología `firstSeen / lastSeen` para contactos históricos.
- Pivotes hacia otros módulos del KIT RASTRO y búsquedas externas.
- Guardado local de casos.
- Exportación de resultados a **JSON** y **CSV**.
- Sin backend propio y sin telemetría incorporada.

## Arquitectura

```text
Página investigada
       │
       ▼
chrome.scripting / DOM actual
       │
       ├── emails
       ├── teléfonos
       ├── redes sociales
       ├── metadatos / JSON-LD
       └── páginas de interés
       │
       ▼
Service Worker (Manifest V3)
       │
       ├── páginas internas autorizadas
       ├── Wayback CDX
       ├── snapshots históricos
       └── cola / reintentos / cancelación
       │
       ▼
Normalización + correlación
       │
       ├── actual
       ├── histórico
       └── persistente
       │
       ▼
Interfaz RASTRO + pivotes + exportación
```

La extensión procesa localmente los resultados. Las consultas históricas se realizan directamente contra `web.archive.org`.

## Instalación manual

### Chrome

1. Descarga el repositorio o el ZIP de una release.
2. Si has descargado un ZIP, descomprímelo.
3. Abre `chrome://extensions/`.
4. Activa **Modo desarrollador**.
5. Pulsa **Cargar descomprimida**.
6. Selecciona la carpeta raíz que contiene `manifest.json`.
7. Fija **RASTRO-CONTACT** en la barra de extensiones si quieres tenerla siempre visible.

### Brave

1. Abre `brave://extensions/`.
2. Activa **Modo desarrollador**.
3. Pulsa **Cargar descomprimida**.
4. Selecciona la **carpeta descomprimida que contiene `manifest.json`**, no el archivo ZIP ni una carpeta superior.
5. Si Brave conserva una versión anterior, elimina esa instalación y vuelve a cargar esta carpeta.

### Microsoft Edge

1. Abre `edge://extensions/`.
2. Activa **Modo de desarrollador**.
3. Pulsa **Cargar extensión descomprimida**.
4. Selecciona la carpeta que contiene `manifest.json`.

## Uso básico

1. Abre la web que deseas investigar.
2. Pulsa el icono de **RASTRO-CONTACT**.
3. Selecciona **Analizar página**.
4. La consola mostrará los contactos actuales, perfiles sociales y páginas internas de interés.
5. Revisa los resultados y su contexto. Un valor detectado automáticamente no debe asumirse como verificado sin comprobar la fuente.
6. Si necesitas ampliar el análisis del sitio, selecciona páginas internas y pulsa **Analizar seleccionadas**. El navegador solicitará permiso únicamente para los orígenes correspondientes.
7. Pulsa **Analizar histórico** para consultar Wayback Machine y construir la cronología de contactos archivados.
8. Utiliza los pivotes RASTRO o exporta el caso a JSON/CSV.

## Cómo se extraen los correos

El motor combina varias fuentes para reducir pérdidas:

- texto visible del DOM;
- HTML renderizado;
- enlaces `mailto:`;
- atributos como `data-email`, `data-mail`, `data-contact`, `content` y `value`;
- JSON-LD / Schema.org;
- entidades HTML;
- formas ofuscadas como `usuario [at] dominio [dot] com` o `usuario (arroba) dominio (punto) es`;
- Cloudflare Email Protection mediante `data-cfemail`.

También se filtran patrones que suelen corresponder a recursos estáticos o valores de demostración.

## Cómo se extraen los teléfonos

Los números son una fuente habitual de falsos positivos. RASTRO-CONTACT utiliza distintos niveles de confianza:

1. **Alta confianza:** enlaces `tel:` y campos `telephone`, `phone` o `faxNumber` en datos estructurados.
2. **Candidatos en texto:** solo se aceptan cuando cumplen longitud/formato plausibles y el contexto aporta señales de contacto.
3. **Filtros negativos:** se penalizan o descartan secuencias próximas a términos como IBAN, CIF/NIF, código postal, pedido, factura, ID, referencia, fecha, precio o identificadores técnicos.

En webs españolas, los números nacionales compatibles se normalizan a `+34`. La detección continúa siendo heurística: comprueba siempre el número en su contexto original.

## Histórico con Wayback Machine

RASTRO-CONTACT consulta el índice CDX para localizar capturas HTML. Para no lanzar una descarga masiva:

- filtra respuestas HTML con estado 200;
- colapsa entradas por `digest` cuando CDX lo permite;
- prioriza páginas de contacto, aviso legal, empresa, equipo, privacidad y soporte;
- selecciona una muestra temporal limitada;
- procesa los snapshots de forma secuencial;
- aplica reintentos con espera incremental ante errores temporales;
- permite cancelar el análisis.

Internet Archive puede aplicar límites, devolver errores temporales o no conservar determinados recursos. La ausencia de resultados no demuestra que un contacto nunca existiera.

## Permisos de la extensión

El `manifest.json` utiliza:

- `activeTab`: acceso temporal a la pestaña sobre la que el usuario actúa.
- `scripting`: ejecución del escáner de DOM en la pestaña activa.
- `storage`: casos y estado local.
- `downloads`: exportación JSON/CSV.
- `tabs`: obtención de información de la pestaña para coordinar el análisis.
- acceso a `https://web.archive.org/*`: consultas históricas.
- permisos de host **opcionales** para páginas internas seleccionadas por el usuario.

La extensión no solicita acceso permanente a todos los sitios como permiso obligatorio.

## Privacidad

RASTRO-CONTACT es **local-first**:

- no incorpora servidor RASTRO;
- no incorpora analítica ni telemetría;
- no envía los casos a infraestructura del autor;
- guarda los casos mediante almacenamiento local del navegador;
- las consultas históricas salen directamente hacia Internet Archive;
- los pivotes externos solo se abren cuando el usuario decide utilizarlos.

Antes de usarla en un entorno institucional, revisa las políticas de tu organización, la configuración del navegador y las condiciones de las fuentes consultadas.

## Limitaciones conocidas

- Algunos sitios cargan datos dentro de iframes, Shadow DOM cerrado o mecanismos que impiden su lectura desde la página principal.
- Determinadas webs bloquean peticiones directas a páginas internas.
- Los correos construidos mediante JavaScript muy específico pueden requerir reglas adicionales.
- La extracción telefónica es deliberadamente conservadora para reducir falsos positivos y puede omitir formatos ambiguos.
- Internet Archive puede limitar peticiones, carecer de snapshots o devolver capturas incompletas.
- Los datos históricos pueden corresponder a personas o empresas que ya no guardan relación con el dominio.
- RASTRO-CONTACT no sustituye una herramienta de preservación forense ni acredita por sí misma la autenticidad de una evidencia.

## Estructura del proyecto

```text
rastro-contact-extension/
├── manifest.json
├── background/
│   └── service-worker.js
├── core/
│   ├── contact-extract.js
│   ├── entities.js
│   ├── normalize.js
│   └── pivots.js
├── historical/
│   ├── cdx.js
│   ├── extract.js
│   └── selector.js
├── ui/
│   ├── investigation.html
│   ├── investigation.css
│   ├── investigation.js
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── assets/
│   ├── rastro-logo.png
│   └── icon*.png
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── CHANGELOG.md
└── README.md
```

## Uso responsable

Esta herramienta está orientada a investigación OSINT y análisis de información públicamente accesible. Úsala únicamente dentro del marco legal y de las autorizaciones aplicables a tu actividad. El operador es responsable de comprobar la licitud, necesidad y proporcionalidad de sus consultas y del tratamiento posterior de la información obtenida.

## Créditos y terceros

RASTRO-CONTACT es un proyecto independiente. El enfoque de recuperación de contactos históricos mediante snapshots de Internet Archive fue informado, entre otras técnicas públicas de OSINT, por **Kronikier**, proyecto de **Soxoj**, distribuido bajo licencia MIT.

Consulta [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) para la atribución y el texto de licencia correspondiente.

## Autor

**S3GAD3**  
Proyecto **RASTRO — Kit de Investigación de Fuentes Abiertas**

## Licencia

RASTRO-CONTACT se distribuye bajo **MIT License**. Consulta [`LICENSE`](LICENSE).

Copyright © 2026 S3GAD3.
