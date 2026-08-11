/**
 * Ambient typings for CSS modules (Expo web / Metro).
 * Must remain a script (no imports/exports) so the wildcard module is global.
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
