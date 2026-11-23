import { fileURLToPath } from 'node:url'

// the installed package directory: `src/` and the `tsc` output `dist/` sit side by side under it, so the
// same URL resolves from either copy of this module
export const CORE_ROOT = fileURLToPath(new URL('..', import.meta.url))
