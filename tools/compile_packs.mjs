/** Compile packs/<name>/src/*.json -> LevelDB. Foundry must be shut down (LevelDB LOCK). */
import { compilePack } from '@foundryvtt/foundryvtt-cli'
import fs from 'node:fs'
const manifest = JSON.parse(fs.readFileSync('module.json', 'utf8'))
for (const pack of manifest.packs || []) {
  await compilePack(`${pack.path}/src`, pack.path)
  console.log(`compiled ${pack.name}`)
}
