import { z } from 'zod'

export const STUDIO_REPOSITORY = 'steegmanskyani-netizen/UpTillDawn-Crew'
export const STUDIO_BRANCH = 'main'
export const MAX_SOURCE_BYTES = 500_000

export function editablePath(path: string) {
  if (!path || path.length > 240 || path.startsWith('/') || /[\\\x00-\x1f?#%]/.test(path)) return false
  const parts = path.split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || part === '.git' || part === 'node_modules')) return false
  if (parts.some(part => /^\.env(?:\.|$)/.test(part) && !part.endsWith('.example'))) return false
  return /\.(tsx?|jsx?|mjs|cjs|jsonc?|css|scss|sql|md|ya?ml|html|txt|svg|toml)$/.test(path) || ['.gitignore', 'LICENSE', '.env.example', '.env.local.example'].includes(path)
}

export const sourcePath = z.string().refine(editablePath, 'Ongeldig of niet-bewerkbaar bronbestand.')
export const shaSchema = z.string().regex(/^[a-f0-9]{40}$/)
export const sourceChangeSchema = z.object({
  path: sourcePath,
  content: z.string().max(MAX_SOURCE_BYTES).nullable(),
}).strict()
export const changeSetSchema = z.object({
  base: shaSchema,
  title: z.string().trim().min(3).max(120),
  changes: z.array(sourceChangeSchema).min(1).max(30),
}).strict().superRefine((value, context) => {
  if (new Set(value.changes.map(item => item.path)).size !== value.changes.length) {
    context.addIssue({code: 'custom', message: 'Elk bestand mag maar eenmaal voorkomen.'})
  }
  if (value.changes.reduce((sum, item) => sum + new TextEncoder().encode(item.content || '').length, 0) > 1_500_000) {
    context.addIssue({code: 'custom', message: 'Deze wijziging is te groot. Sla minder bestanden tegelijk op.'})
  }
})

export type SourceChange = z.infer<typeof sourceChangeSchema>
export type SourceEntry = {path: string; sha: string; size?: number}
export type SourceTarget = {file: string; line: number; kind: string; label: string; handler: string}

export function summarizeChanges(before: string, after: string) {
  const oldLines = before.split('\n')
  const newLines = after.split('\n')
  let start = 0
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++
  let endOld = oldLines.length, endNew = newLines.length
  while (endOld > start && endNew > start && oldLines[endOld - 1] === newLines[endNew - 1]) { endOld--; endNew-- }
  return {line: start + 1, removed: oldLines.slice(start, endOld), added: newLines.slice(start, endNew)}
}
