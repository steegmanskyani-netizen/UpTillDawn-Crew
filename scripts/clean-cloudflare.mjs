// OpenNext appends environment exports on repeat builds; start with clean generated output.
import { rmSync } from 'node:fs'
rmSync(new URL('../.open-next', import.meta.url), { recursive: true, force: true })
