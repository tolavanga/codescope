export type Language = 'TypeScript' | 'JavaScript' | 'Python' | 'CSS' | 'HTML' | 'JSON' | 'Text'
export type SourceFile = { name: string; content: string; language?: Language }
export type LineKind = 'code' | 'comment' | 'blank'
export type LineStat = { number: number; text: string; branches: number; indent: number; kind: LineKind }
export type Metrics = {
  lines: number
  code: number
  comments: number
  blank: number
  functions: number
  branches: number
  todos: number
  maxNesting: number
}
export type FileReport = { name: string; language: Language; metrics: Metrics; lineStats: LineStat[] }
export type Analysis = {
  files: FileReport[]
  totals: Metrics
  languages: { language: Language; lines: number; share: number }[]
  buckets: { label: string; branches: number; lines: number }[]
  quality: number
}
export type DiffLine = { type: 'same' | 'added' | 'removed'; text: string }

const emptyMetrics = (): Metrics => ({ lines: 0, code: 0, comments: 0, blank: 0, functions: 0, branches: 0, todos: 0, maxNesting: 0 })
const branchPattern = /\b(if|for|while|case|catch|elif|except|when)\b|&&|\|\||\?(?!\s*:)/g
const todoPattern = /\b(TODO|FIXME|HACK|XXX)\b/i

export function detectLanguage(name: string, content = ''): Language {
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension === 'ts' || extension === 'tsx') return 'TypeScript'
  if (extension === 'js' || extension === 'jsx' || extension === 'mjs') return 'JavaScript'
  if (extension === 'py') return 'Python'
  if (extension === 'css' || extension === 'scss') return 'CSS'
  if (extension === 'html' || extension === 'htm') return 'HTML'
  if (extension === 'json') return 'JSON'
  if (/\bdef\s+\w+\(|import\s+\w+\s*$|print\(/m.test(content)) return 'Python'
  if (/:\s*(string|number|boolean|unknown|void)\b|interface\s+\w+|type\s+\w+\s*=/.test(content)) return 'TypeScript'
  if (/\b(const|let|var|function|async|await|return)\b|=>/.test(content)) return 'JavaScript'
  return 'Text'
}

function countFunctions(line: string, language: Language) {
  if (language === 'Python') return (line.match(/^\s*(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(/) || []).length
  const matches = [
    ...line.matchAll(/\bfunction\s+[A-Za-z_$][\w$]*\s*\(/g),
    ...line.matchAll(/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g),
    ...line.matchAll(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g),
  ]
  return matches.filter(match => !['if', 'for', 'while', 'switch', 'catch'].includes(match[1] || '')).length
}

function analyzeFile(source: SourceFile): FileReport {
  const language = source.language || detectLanguage(source.name, source.content)
  const rawLines = source.content.replace(/\r\n?/g, '\n').split('\n')
  if (rawLines.length > 1 && rawLines.at(-1) === '') rawLines.pop()
  const metrics = emptyMetrics()
  metrics.lines = rawLines.length
  let inBlockComment = false
  let braceDepth = 0

  const lineStats = rawLines.map<LineStat>((text, index) => {
    const trimmed = text.trim()
    let kind: LineKind = 'code'
    if (!trimmed) kind = 'blank'
    else if (inBlockComment || /^(?:\/\/|#|<!--|\*)/.test(trimmed)) kind = 'comment'
    else if (/^(?:\/\*|<!--)/.test(trimmed)) kind = 'comment'

    if (kind === 'comment') metrics.comments++
    else if (kind === 'blank') metrics.blank++
    else {
      metrics.code++
      metrics.functions += countFunctions(trimmed, language)
    }
    if (/\*\//.test(trimmed)) inBlockComment = false
    if (/\/\*/.test(trimmed) && !/\*\//.test(trimmed)) inBlockComment = true

    const branches = kind === 'code' ? (trimmed.match(branchPattern) || []).length : 0
    metrics.branches += branches
    if (todoPattern.test(trimmed)) metrics.todos++

    let indent = 0
    if (language === 'Python') indent = Math.floor((text.match(/^\s*/)?.[0].replace(/\t/g, '    ').length || 0) / 4)
    else {
      const withoutStrings = trimmed.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '')
      const opens = (withoutStrings.match(/\{/g) || []).length
      const closes = (withoutStrings.match(/\}/g) || []).length
      const leadingClose = /^[}\])]/.test(trimmed) ? 1 : 0
      indent = Math.max(0, braceDepth - leadingClose)
      braceDepth = Math.max(0, braceDepth + opens - closes)
    }
    metrics.maxNesting = Math.max(metrics.maxNesting, indent)
    return { number: index + 1, text, branches, indent, kind }
  })

  return { name: source.name, language, metrics, lineStats }
}

export function analyzeSources(sources: SourceFile[]): Analysis {
  const files = sources.filter(source => source.content.length > 0).map(analyzeFile)
  const totals = emptyMetrics()
  files.forEach(file => {
    const metric = file.metrics
    totals.lines += metric.lines
    totals.code += metric.code
    totals.comments += metric.comments
    totals.blank += metric.blank
    totals.functions += metric.functions
    totals.branches += metric.branches
    totals.todos += metric.todos
    totals.maxNesting = Math.max(totals.maxNesting, metric.maxNesting)
  })

  const languageMap = new Map<Language, number>()
  files.forEach(file => languageMap.set(file.language, (languageMap.get(file.language) || 0) + file.metrics.code))
  const languageLines = Array.from(languageMap.values()).reduce((sum, value) => sum + value, 0) || 1
  const languages = Array.from(languageMap, ([language, lines]) => ({ language, lines, share: Math.round(lines / languageLines * 1000) / 10 })).sort((a, b) => b.lines - a.lines)

  const allLines = files.flatMap(file => file.lineStats)
  const bucketCount = Math.min(32, Math.max(8, Math.ceil(allLines.length / 5)))
  const bucketSize = Math.max(1, Math.ceil(allLines.length / bucketCount))
  const buckets = Array.from({ length: Math.ceil(allLines.length / bucketSize) || 1 }, (_, index) => {
    const lines = allLines.slice(index * bucketSize, (index + 1) * bucketSize)
    return { label: `${index * bucketSize + 1}—${Math.min((index + 1) * bucketSize, allLines.length)}`, branches: lines.reduce((sum, line) => sum + line.branches, 0), lines: lines.length }
  })
  const commentRate = totals.code ? totals.comments / totals.code * 100 : 0
  const branchDensity = totals.code ? totals.branches / totals.code * 100 : 0
  const quality = files.length ? Math.max(0, Math.min(100, Math.round(100 - branchDensity * 1.7 - totals.maxNesting * 3 - totals.todos * 2 + Math.min(commentRate, 15) * 0.25))) : 0
  return { files, totals, languages, buckets, quality }
}

export function compareCode(before: string, after: string) {
  const a = before.replace(/\r\n?/g, '\n').split('\n')
  const b = after.replace(/\r\n?/g, '\n').split('\n')
  const rows = a.length
  const cols = b.length
  const width = cols + 1
  const dp = new Uint32Array((rows + 1) * (cols + 1))
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      dp[i * width + j] = a[i] === b[j]
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1])
    }
  }
  const diff: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < rows && j < cols) {
    if (a[i] === b[j]) { diff.push({ type: 'same', text: a[i] }); i++; j++ }
    else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) { diff.push({ type: 'removed', text: a[i] }); i++ }
    else { diff.push({ type: 'added', text: b[j] }); j++ }
  }
  while (i < rows) { diff.push({ type: 'removed', text: a[i] }); i++ }
  while (j < cols) { diff.push({ type: 'added', text: b[j] }); j++ }
  return diff
}

export const sampleCode = `type User = {
  id: string
  name: string
  active: boolean
  lastLogin?: string
}

// Возвращает активных пользователей с свежим входом
export function getActiveUsers(users: User[], query: string) {
  const normalized = query.trim().toLowerCase()
  const result = []

  for (const user of users) {
    if (user.active && user.name.toLowerCase().includes(normalized)) {
      if (user.lastLogin) {
        const days = (Date.now() - Date.parse(user.lastLogin)) / 86400000
        if (days <= 30 || user.id === 'admin') {
          result.push(user)
        }
      }
    }
  }

  // TODO: добавить пагинацию для больших списков
  return result.sort((a, b) => a.name.localeCompare(b.name))
}`

export const improvedCode = `type User = {
  id: string
  name: string
  active: boolean
  lastLogin?: string
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000

// Чистая функция без сортировки исходного массива
export function getActiveUsers(users: User[], query: string) {
  const normalized = query.trim().toLowerCase()
  const threshold = Date.now() - MONTH_MS

  return users
    .filter(user => user.active)
    .filter(user => user.name.toLowerCase().includes(normalized))
    .filter(user => user.lastLogin && Date.parse(user.lastLogin) >= threshold)
    .toSorted((a, b) => a.name.localeCompare(b.name))
}`
