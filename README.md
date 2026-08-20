# CRF — Coordinador de Frecuencias UHF

Web app estática (sin backend, pensada para GitHub Pages) para coordinar frecuencias de sistemas de audio inalámbrico UHF — micrófonos, IFB — en producciones de cine y video. Dado un rango de trabajo, lo que ya está ocupado y el equipo que se quiere sumar, calcula y ordena frecuencias candidatas libres de conflicto.

## Qué problema resuelve

Coordinar múltiples receptores UHF a mano es propenso a error: hay que dejar separación suficiente entre transmisores, y además evitar que sus productos de intermodulación (IM) —"fantasmas" matemáticos que aparecen cuando dos o más transmisores se mezclan de forma no lineal— caigan sobre otro receptor en uso. CRF automatiza ese análisis y explica *por qué* descarta o penaliza cada candidato.

## Motor de coordinación

- **Productos de intermodulación, órdenes IM2–IM5** (`intermods()`): enumera los productos posibles a partir de las frecuencias ocupadas, ponderando por potencia declarada (mW) y descontando penalización cuando todo lo que contribuye a un producto es digital de espectro angosto.
- **Clasificación en 4 niveles + 1 informativo**: 🔴 CRÍTICO / 🟠 ADVERTENCIA /🟡 REVISAR / 🟢 RECOMENDADO, o ℹ️ FUERA DE RANGO cuando el producto cae fuera del rango de trabajo + margen configurable (se sigue calculando y mostrando, pero nunca puede ser el peor nivel de un candidato). El piso crítico se escala según el orden del producto, para que la densidad combinatoria de IM4/IM5 con muchos transmisores no dispare falsos críticos.
- **Diagnóstico de auto-conflicto** (`analyzeSelfConflicts`): antes de sugerir nada, revisa si las frecuencias *ya* ocupadas generan IM entre sí mismas, con la misma ponderación que el resto del motor.
- **Danger zones** (`precomputeDangerZones`): detecta el caso en que un candidato no cae cerca de ningún fantasma existente, pero al sumarse genera uno *nuevo* sobre otra ocupada distinta. Se precomputa una vez por corrida (no por candidato) y se busca por candidato con binary search.
- **Búsqueda de un conjunto de N frecuencias simultáneas** (`calculateSet`): selección voraz secuencial + una pasada de mejora local (swap), para elegir un set que funcione bien *entre sí*, no solo cada frecuencia evaluada de forma independiente.

## Perfiles de coordinación

`coordination-profiles.js` envuelve el motor y decide qué fenómenos matemáticos llegan al score, sin tocar la lógica base:

| Perfil | Qué conserva | Guarda de canal |
|---|---|---|
| **Robust (Seguro)** | IM2–IM5 completo | Sin reducir |
| **Standard (Rodaje)** — default | Solo IM3 | -30% |
| **More Frequencies (Alta densidad)** | Solo IM3 de 2 TX (2A−B) | Ancho de banda del receptor |

## Catálogo de dispositivos

27 perfiles en `data/devices.json` — Sennheiser EW 100 G2/G3/G4 (por variante regional), BOYA BY-WM8 Pro, Deity THEOS, Wisycom MTP40S, Saramonic K9, Lectrosonics DCHT, RØDELink II, más un perfil personalizable. Cada uno declara su modelo de generación de candidatos (bancos de canales o barrido continuo) y un flag de confianza — `verified` / `estimate` / `pending` — cuando el dato depende de la variante exacta del equipo o todavía no hay datasheet público.

## Otras herramientas

- **Importar resultado de scan**: pegar texto de un analizador de espectro (cualquier separador: coma, espacio, tab) y cargar automáticamente como ocupadas las frecuencias que superen un umbral en dBm.
- **Detalle de IM colapsable**: cada resultado muestra su tabla de víctima/orden/producto/distancia/nivel dentro de un `<details>` desplegable (`render-accordion.js`), con la cantidad de advertencias resumida en el título.

## Stack

Vanilla JS, sin build ni dependencias en runtime. `package.json` solo declara `jsdom` como dev-dependency, para el harness de tests.

## Estructura

```
index.html                  UI y layout
app.js                       motor: IM, clasificación, auto-conflictos, danger zones, buscar conjunto
coordination-profiles.js     perfiles de coordinación (envuelve las funciones de app.js)
render-accordion.js          render de cada resultado con el detalle IM colapsable
styles.css                   estilos (incluye los del acordeón y los de perfiles)
data/devices.json            catálogo de 27 perfiles de equipos
e2e_test.js / package.json   suite de tests end-to-end sobre jsdom
VALIDATION.txt               bitácora de validaciones a medida que evolucionó el motor
```

## Tests

```
npm install
npm test
```

Corre `node --check app.js` + `e2e_test.js`: motor de IM, clasificación de 4 niveles, auto-conflictos, danger zones, in-range/fuera-de-rango y el acordeón de detalle — 24 checks en total.

## Límites, por diseño

El motor es matemático/heurístico: no modela IP3, bloqueo del receptor, ganancia de antena, distancia real TX/RX, aislación entre antenas ni potencia efectiva radiada. Los perfiles de equipo marcados como *estimados* o *pendientes* dependen de la variante exacta o todavía no tienen datasheet público — hay que confirmar contra la unidad real. Ninguna recomendación acá reemplaza un scan RF en la locación ni determina legalidad o regulación del espectro.
