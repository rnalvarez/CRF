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

## BOYA

El perfil utiliza los datos de trabajo proporcionados para el proyecto:

- Banco A: 556.710–575.980 MHz, 48 canales.
- Banco B: 576.390–595.660 MHz, 48 canales.
- Paso: 0.410 MHz.

Por tanto, por ejemplo:
- A09 = 559.990 MHz
- B20 = 584.180 MHz

## Limitaciones importantes

Esta V1 NO es un simulador RF completo. El cálculo de IM es una pantalla matemática conservadora y todavía no modela IP3, selectividad de receptor, bloqueo, ganancia/pérdida de antena, distancia, aislamiento entre antenas, potencia efectiva radiada ni características específicas de cada front-end.

La herramienta no determina legalidad/regulación y no reemplaza un escaneo RF en la locación.

## Próximas etapas

1. Añadir perfiles completos de EW100 G2/G3/G4, THEOS, K9, RØDELink II, Wisycom y Lectrosonics.
2. Añadir bancos/canales oficiales donde existan.
3. Incorporar potencia como variable de ponderación física, no solamente como dato.
4. Añadir ancho de canal, selectividad, bloqueo e intermodulación especificados por fabricante.
5. Añadir importación de resultados de scan.
6. Mejorar el motor de coordinación incremental y la búsqueda global de conjuntos de frecuencias.
