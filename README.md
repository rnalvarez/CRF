# CRF — actualización de perfiles de coordinación

Estos son los archivos modificados para la versión de perfiles:

- `coordination-profiles.js`: motor de perfiles Robust / Standard / More Frequencies.
- `styles.css`: estilos visuales del selector y descripción de perfiles.

`index.html` ya fue actualizado en el repositorio para cargar `coordination-profiles.js` y contiene el selector global.

## Reglas

- Robust: IM2–IM5 + guarda completa.
- Standard: solo IM3 + 70% de la guarda base. Es el perfil por defecto.
- More Frequencies: solo IM3 de 2 TX; elimina IM5 e IM3 de 3 TX o más; usa `bandwidth` del dispositivo como guarda mínima.

Importante: los perfiles cambian el criterio de coordinación; no significan que los productos ignorados sean físicamente imposibles.
