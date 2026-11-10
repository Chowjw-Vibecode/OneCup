// Use the approved letterforms. Remove the paper tone only while rendering.
let brandId=10;
export const brandMarkup = () => {
  const id = `thiscup-brand-ink-${++brandId}`;
  return `<svg class="thiscup-brand-art" viewBox="48 26 352 63" role="img" aria-label="这一杯 · THIS CUP"><defs><filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0.0314  0 0 0 0 0.1725  0 0 0 0 0.2745  -1.2 0 0 0 1.08"/></filter></defs><image href="./assets/ceramic/cup-reference.png" width="1586" height="992" filter="url(#${id})"/></svg>`;
};
