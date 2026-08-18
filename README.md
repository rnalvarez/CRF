# CRF — Accordion de detalles IM

Archivos preparados para integrar el accordion UX en las tarjetas de candidatos.

- `render-accordion.js`: funciones de renderizado.
- `accordion.css`: CSS nuevo.

En `app.js`, el render de candidatos debe usar:
`results.map(renderCandidateResult).join("")`

El `<details>` queda cerrado por defecto.
