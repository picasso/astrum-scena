#!/usr/bin/env node
// a committed launcher, so the package manager links the bin even before `dist/` is built
await import('../dist/cli/index.js')
