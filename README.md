# RF Coordinator

Coordinador de frecuencias UHF estático para GitHub Pages.

## V1

- BOYA BY-WM8 Pro K2 con **Banco A/B y canales 01–48**.
- Sennheiser EW100 G4 Range G.
- Deity THEOS.
- Saramonic K9.
- Rango de trabajo configurable.
- Frecuencias ocupadas configurables.
- Candidatos por canales reales del dispositivo o por paso de sintonización.
- Cálculo matemático de productos de intermodulación de órdenes 2–5.
- Ranking heurístico de candidatos.
- Modo estricto.
- Sin backend y sin dependencia de servicios externos.

## V2 — próximas etapas de V1, resueltas

**1. Perfiles completos EW100 G2/G3/G4, THEOS, K9, RØDELink II, Wisycom, Lectrosonics.**
`data/devices.json` pasó de 5 a 27 perfiles. Cada uno tiene un campo `confidence`:
- `verified`: dato de spec oficial del fabricante o fuente independiente que coincide (BOYA, los 12 rangos de G4, los 7 rangos de G3 con datos confirmados, THEOS, K9).
- `estimate`: dato razonable pero dependiente de variante/región que hay que confirmar contra el equipo real (G2 — solo el rango A confirmado con certeza —, Wisycom MTP40S, Lectrosonics DCHT/Duet versión doméstica).
- `pending`: sin datos RF públicos todavía. **RØDELink II** quedó así a propósito: ni RØDE ni los distribuidores que ya lo listan para pre-venta publican rango/paso/spacing a la fecha de esta actualización. El perfil existe como marcador, no genera candidatos, y la UI lo avisa explícitamente en vez de fallar en silencio.

**2. Bancos/canales oficiales.** Incorporado donde existen (BOYA por banco/canal; Sennheiser por rango con paso de 25 kHz confirmado contra la ficha de producto oficial).

**3. Potencia como variable de ponderación física.** Cada frecuencia ocupada puede llevar una potencia (mW) opcional. El motor exige más separación de un vecino de mayor potencia (heurística `√(mW/50)`, acotada entre 0.5× y 2×) y pondera la severidad de un producto de IM según la potencia combinada de lo que lo generó. Sigue siendo una heurística, no una simulación de propagación real — así se documenta en la UI.

**4. Ancho de canal, selectividad, bloqueo e IM del fabricante.** Se agregó el campo `selectivityDb` y se usa para relajar levemente la separación/umbral IM exigidos cuando el perfil lo declara (hoy solo Sennheiser G4, con la selectividad de canal adyacente ≥65 dB publicada por Sennheiser). Blocking dynamic range e IM rejection de fabricante quedan **sin poblar**: no se encontraron cifras públicas confiables para el resto de los perfiles, y se prefirió dejar el campo vacío antes que inventar un número. El motor cae de forma segura al comportamiento default cuando el dato no está.

**5. Importación de resultados de scan.** Sección colapsable en "Frecuencias ya ocupadas": se pega texto con líneas de frecuencia + nivel (separador libre: coma, espacio, tab, punto y coma), se define un umbral en dBm, y lo que supera el umbral se agrega como ocupada. El formato de parseo es genérico porque no se definió el export real de ningún analizador puntual — avisar el formato real del equipo para afinarlo.

**6. Motor de coordinación mejorado + búsqueda global de conjuntos.** Nueva sección "Buscar un conjunto de N frecuencias simultáneas": elige candidatos de a uno sumándolos al set de trabajo antes de elegir el siguiente (no ranking independiente), y después hace una pasada de mejora local (swap) buscando alternativas mejores para cada elección ya hecha, evaluada contra el resto del conjunto. Con N grande (10+) sobre un dispositivo de barrido continuo el cálculo puede tardar hasta 1–2 segundos; es una compensación esperada por hacer una búsqueda conjunta en vez de una independiente.

También se corrigió que los sistemas **digitales de espectro angosto** (THEOS, K9) pesan menos en la penalización IM cuando todo lo que contribuye a un producto es digital (descuento del 50%, no eliminación — la afirmación de "intermod-free" de Deity es sobre el transmisor, no garantiza ausencia de IM en un receptor real ni en un rodaje mixto con equipos analógicos).

**Peso por orden reordenado y piso crítico escalado (no lineal).** `ORDER_WEIGHT` centraliza IM3=1.6 (prioridad muy alta), IM2=1.2 (alta), IM4=0.8, IM5=0.5 — usado en todo el motor, no repetido en cada función. El piso crítico (distancia absoluta bajo la cual algo es crítico sin importar severidad) se escala por `(orderWeight/1.6)²`: con 5-6+ transmisores el volumen de productos IM4/IM5 crece tanto (cientos a miles) que un escalado lineal seguía marcando CRÍTICO por pura densidad. Ver "Diagnóstico de 6 transmisores" más abajo — el hallazgo real no fue un umbral mal calibrado, fue una coincidencia estructural de grilla.

**Relevancia de rango de trabajo.** `intermods()` y `precomputeDangerZones()` aceptan un `relevantRange` opcional (rango de trabajo configurado + 2MHz de margen); los productos IM fuera de eso se marcan `inRange:false` y su aporte al riesgo se descuenta ×0.15 (se informan igual, en la tabla, marcados "fuera de rango", pero no dominan la clasificación). Con 6 transmisores reales, el 84% de los productos IM calculados cae fuera del rango de trabajo — antes pesaban todos igual.

**Score dominado por el peor hit, no por la suma.** Antes cada hit relevante restaba score acumulativamente; un candidato con 6 IM5 lejanos podía puntuar peor que uno con 1 IM3 cerca. Ahora el score sale del peor riskScore encontrado + un empujón chico y acotado por cantidad adicional (máximo 5 hits extra cuentan). La cantidad ya no es el criterio principal.

**Diagnóstico de 6 transmisores (el problema real).** Con 2 Sennheiser G4 + 4 BOYA reales ocupando el rango BOYA (556.71–595.98MHz), % de candidatos "recomendado" cae en gradiente suave a medida que se agregan transmisores en el mismo ancho de banda: 80% (n=2) → 43% (n=3) → 12% (n=4) → 0% (n=5) → 0% (n=6). No es un salto abrupto ni un umbral roto — es degradación combinatoria real. Además se encontró que buena parte de los "críticos" con BOYA específicamente son coincidencias IM5 EXACTAS (0.000 MHz), no cercanas: la grilla fija de 0.41MHz de BOYA hace que ciertas combinaciones de canales caigan matemáticamente exactas sobre otros canales de la misma grilla — probado contra un dispositivo de grilla más fina (THEOS, paso 0.1MHz): la tasa de coincidencias exactas baja, pero el 0% recomendado persiste igual por densidad general de IM3, confirmando que con 6 transmisores en ~40MHz la escasez de posiciones limpias es real, no un artefacto del clasificador.

**Diagnóstico de auto-conflicto entre ocupadas.** `intermods()` se calculaba y se usaba solo para puntuar candidatos nuevos — nunca se comparaba contra las propias frecuencias ya cargadas como ocupadas. Ahora, cada vez que se agrega/quita/importa una ocupada (o se aprieta "Calcular" con otros parámetros), se recalcula si algún fantasma IM del propio set cae sobre otra ocupada del mismo set, y se muestra debajo de los chips. Caso real que motivó esto: 4 canales BOYA elegidos en progresión aritmética perfecta (cada uno a 4 pasos del siguiente, ej. CH01/05/09/13) generan productos IM3, IM4 e IM5 que caen exactos (0.000 MHz) sobre los otros 3 — invisible antes porque nada comparaba lo ocupado contra sí mismo. El chequeo excluye a propósito los casos donde la "víctima" es también generadora matemática de su propio fantasma (degenerado, no es una colisión real entre dos mics distintos) y reusa la misma ponderación por orden/potencia/selectividad/modo estricto que ya usa `scoreCandidate`.

**Clasificación en 4 niveles (🔴 CRÍTICO / 🟠 ALTO-NO RECOMENDADO / 🟡 REVISAR / 🟢 RECOMENDADO).** Reemplaza el sí/no anterior. Cada candidato se clasifica por el peor hit entre todos los productos IM relevantes (existentes + los que se formarían al agregarlo), combinando distancia real y orden — no todo IM5 se trata igual que un IM3: a la misma distancia, un IM3 pesa más (orden 3 = ×1.6) que un IM5 (orden 5 = ×0.5). El "Umbral crítico" (campo configurable, default 0.010 MHz) se escala al cuadrado del peso relativo por orden — IM3 usa el piso completo, IM5 necesita estar bastante más cerca — porque con 5-6+ transmisores el volumen de IM4/IM5 crece tanto que un piso parejo por orden marcaba crítico por pura densidad, no por gravedad real. Por cada candidato se muestra una tabla víctima/orden/producto/distancia/nivel, no solo el más cercano. `analyzeSelfConflicts()` (diagnóstico del set ocupado) usa la misma función `classifyConflict()`, mismo criterio en los dos lugares.

Se corrigió un bug real de unidades encontrado al implementar esto: al chequear si agregar un candidato formaría un fantasma nuevo, cuando el coeficiente del candidato en la fórmula IM es ±2 o más (ej. `+2×561.220 -2×566.200 +1×584.180`), la distancia real del producto a la víctima es esa cantidad multiplicada por el coeficiente — comparar la distancia sin escalar contra el umbral crítico subestimaba la distancia real a la mitad (o menos), clasificando como CRÍTICO algo que en distancia real caía en ADVERTENCIA. Caso de prueba permanente en `e2e_test.js`.

**Ayuda contextual en "4. Parámetros del análisis".** Un ícono "i" junto a cada campo (`<details>/<summary>`, sin JS extra) explica qué hace y sugiere valores según el equipo. Se eligió `<details>` sobre un tooltip por hover porque el contenido es largo y hover no funciona en touch (uso típico en tablet/celular durante un rodaje).

### Cómo probarlo

`npm install jsdom` (solo dev, no lo usa la app en producción) y después `npm test` corre `node --check` sobre `app.js` y una prueba end-to-end (`e2e_test.js`) que simula un navegador con jsdom: carga los 27 perfiles, agrega/quita frecuencias ocupadas, importa un scan, calcula recomendaciones, prueba un perfil `pending` y busca un conjunto de N frecuencias.

## BOYA

El perfil utiliza los datos de trabajo proporcionados para el proyecto:

- Banco A: 556.710–575.980 MHz, 48 canales.
- Banco B: 576.390–595.660 MHz, 48 canales.
- Paso: 0.410 MHz.

Por tanto, por ejemplo:
- A09 = 559.990 MHz
- B20 = 584.180 MHz

## Limitaciones importantes

Este coordinador NO es un simulador RF completo. El cálculo de IM es una pantalla matemática conservadora. Sigue sin modelar IP3, bloqueo real del receptor, ganancia/pérdida de antena, distancia TX/RX, aislamiento entre antenas ni potencia efectiva radiada — la potencia declarada (V2) pondera el heurístico, pero no reemplaza esos modelos físicos.

La herramienta no determina legalidad/regulación y no reemplaza un escaneo RF en la locación. Los perfiles `estimate`/`pending` necesitan confirmación contra el equipo real antes de usarse para coordinar un rodaje.

## Próximas etapas (post-V2)

1. Confirmar los 4 rangos restantes de EW100 G2 y la variante exacta de Wisycom/Lectrosonics que RAM usa en kit propio.
2. Cargar RØDELink II en cuanto RØDE publique datasheet técnico.
3. Sumar blocking dynamic range e IM rejection de fabricante donde se consiga (hoy solo hay selectividad de canal adyacente de Sennheiser G4).
4. UI para cargar un perfil "personalizado" con min/max/paso manuales (hoy el perfil existe en `devices.json` pero no tiene formulario).
5. Definir el formato real de export de scan del analizador que se use en campo y ajustar el parser a eso en vez del formato genérico actual.
