// the absolute site root, which the integration takes from Astro's `config.root`; the core never
// derives it from cwd, since `astro build --root <site>` may run from any ancestor directory
export { siteRoot } from 'virtual:astrum-scena/site-root'
