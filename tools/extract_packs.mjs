/** Extract LevelDB -> packs/<name>/src/*.json. Foundry must be shut down (LevelDB LOCK). */
import { extractPack } from '@foundryvtt/foundryvtt-cli'
import fs from 'node:fs'
const manifest = JSON.parse(fs.readFileSync('module.json', 'utf8'))
for (const pack of manifest.packs || []) {
  await extractPack(pack.path, `${pack.path}/src`)
  console.log(`extracted ${pack.name}`)
}
