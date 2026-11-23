import path from 'node:path'

import { buildDemoImages, writeDemoImages } from './lib/demo-images.ts'
import { siteRootArg } from './lib/site-root.ts'

// the only writer of the demo's derivatives and of both image JSON files (`--site <dir>`, the demo by
// default); a rerun on the same machine leaves the tree unchanged. Gates never rerun it

async function main(): Promise<void> {
	const siteRoot = siteRootArg()
	const root = path.resolve(siteRoot)
	const images = await buildDemoImages(root)
	const result = writeDemoImages(root, images)
	console.log('demo:images OK')
	console.log(`  media:   ${path.relative(process.cwd(), result.directory) || '.'}`)
	console.log(`  files:   ${images.files.length} derivatives`)
	console.log(`  written: ${result.written}`)
	console.log(`  removed: ${result.removed.length}`)
	for (const warning of images.warnings) console.log(`  note:    ${warning}`)
}

await main()
