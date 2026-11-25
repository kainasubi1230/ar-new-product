# Avatar SVG assets
Eight independent SVGs traced from the exact uploaded 8-animal reference sheet.
Each SVG has a transparent background and uses semantic groups:
- data-color-role="base"
- data-color-role="accent"
- data-color-role="secondary"
- data-color-role="tertiary"
- data-color-role="ink"

Apply colors in the app with CSS, e.g.
.avatar-svg [data-color-role="accent"] { fill: var(--avatar-accent) !important; }
.avatar-svg [data-color-role="base"] { fill: var(--avatar-base) !important; }
.avatar-svg [data-color-role="secondary"] { fill: var(--avatar-secondary) !important; }
.avatar-svg [data-color-role="tertiary"] { fill: var(--avatar-tertiary) !important; }
.avatar-svg [data-color-role="ink"] { fill: var(--avatar-ink) !important; }

Note: these are traced/vectorized approximations from the raster reference, not original editable source artwork. Fine paper grain/halftone detail is simplified. Groups with the same role recolor together.
