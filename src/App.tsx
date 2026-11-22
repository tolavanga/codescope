import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUpRight, Braces, Check, ChevronRight, Clipboard, Code2, Download, FileCode2, Files, LockKeyhole, Moon, Play, RotateCcw, Search, ShieldCheck, SquareCode, Sun, Upload, X } from 'lucide-react'
import { analyzeSources, compareCode, detectLanguage, improvedCode, sampleCode } from './lib/analyze'
import type { Analysis, DiffLine, Language, SourceFile } from './lib/analyze'

const snippets = [
  { id: 'debounce', name: 'debounce', language: 'TypeScript', description: 'Откладывает вызов до паузы в событиях. Полезно для поиска и resize.', code: `function debounce<T extends unknown[]>(\n  fn: (...args: T) => void,\n  delay = 200\n) {\n  let timer: ReturnType<typeof setTimeout>\n  return (...args: T) => {\n    clearTimeout(timer)\n    timer = setTimeout(() => fn(...args), delay)\n  }\n}` },
  { id: 'retry', name: 'retry', language: 'TypeScript', description: 'Повторяет асинхронную операцию с растущей задержкой.', code: `async function retry<T>(\n  task: () => Promise<T>,\n  attempts = 3\n): Promise<T> {\n  try {\n    return await task()\n  } catch (error) {\n    if (attempts <= 1) throw error\n    await new Promise(resolve =>\n      setTimeout(resolve, 2 ** (4 - attempts) * 250)\n    )\n    return retry(task, attempts - 1)\n  }\n}` },
  { id: 'bytes', name: 'formatBytes', language: 'JavaScript', description: 'Превращает байты в компактное и читаемое значение.', code: `function formatBytes(bytes, digits = 1) {\n  if (!Number.isFinite(bytes) || bytes < 0) {\n    throw new Error('Expected a positive number')\n  }\n  const units = ['B', 'KB', 'MB', 'GB', 'TB']\n  const index = bytes === 0\n    ? 0\n    : Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4)\n  const value = bytes / 1024 ** index\n  return \`\${value.toFixed(index ? digits : 0)} \${units[index]}\`\n}` },
  { id: 'group', name: 'groupBy', language: 'JavaScript', description: 'Группирует элементы массива по вычисленному ключу.', code: `function groupBy(items, getKey) {\n  return items.reduce((groups, item) => {\n    const key = getKey(item)\n    groups[key] ??= []\n    groups[key].push(item)\n    return groups\n  }, {})\n}` },
]

const emptyAnalysis = analyzeSources([{ name: 'users.ts', content: sampleCode }])
const initialBefore = analyzeSources([{ name: 'before.ts', content: sampleCode }])
const initialAfter = analyzeSources([{ name: 'after.ts', content: improvedCode }])

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return localStorage.getItem('codescope-theme') === 'light' ? 'light' : 'dark' } catch { return 'dark' }
  })
  const [mode, setMode] = useState<'paste' | 'files'>('paste')
  const [code, setCode] = useState(sampleCode)
  const [language, setLanguage] = useState<'Auto' | Language>('Auto')
  const [sources, setSources] = useState<SourceFile[]>([])
  const [analysis, setAnalysis] = useState<Analysis>(emptyAnalysis)
  const [sourceLabel, setSourceLabel] = useState('users.ts')
  const [notice, setNotice] = useState('Демо-анализ TypeScript · можно вставить свой код')
  const [selectedLine, setSelectedLine] = useState(1)
  const [before, setBefore] = useState(sampleCode)
  const [after, setAfter] = useState(improvedCode)
  const [beforeAnalysis, setBeforeAnalysis] = useState(initialBefore)
  const [afterAnalysis, setAfterAnalysis] = useState(initialAfter)
  const [diff, setDiff] = useState<DiffLine[]>(() => compareCode(sampleCode, improvedCode))
  const [copied, setCopied] = useState('')
  const [snippetQuery, setSnippetQuery] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const allLines = useMemo(() => analysis.files.flatMap(file => file.lineStats.map(line => ({ ...line, file: file.name }))), [analysis])
  const inspected = allLines[Math.min(selectedLine, allLines.length) - 1]
  const maxBucket = Math.max(1, ...analysis.buckets.map(bucket => bucket.branches))
  const visibleSnippets = snippets.filter(snippet => `${snippet.name} ${snippet.description} ${snippet.language}`.toLowerCase().includes(snippetQuery.toLowerCase()))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = 'ru'
    try { localStorage.setItem('codescope-theme', theme) } catch { /* Theme still works without storage. */ }
  }, [theme])

  const analyzePaste = () => {
    if (!code.trim()) { setNotice('Вставьте хотя бы одну строку кода'); return }
    const detected = language === 'Auto' ? detectLanguage('paste', code) : language
    const extension: Record<Language, string> = { TypeScript: 'ts', JavaScript: 'js', Python: 'py', CSS: 'css', HTML: 'html', JSON: 'json', Text: 'txt' }
    const name = `paste.${extension[detected]}`
    setAnalysis(analyzeSources([{ name, content: code, language: detected }]))
    setSourceLabel(name)
    setSelectedLine(1)
    setNotice(`Анализ обновлён · ${detected} · только в этом браузере`)
  }

  const readFiles = async (list: FileList | null) => {
    if (!list?.length) return
    const incoming = Array.from(list)
    if (incoming.length > 12) { setNotice('Можно загрузить не больше 12 файлов за один анализ'); return }
    if (incoming.some(file => file.size > 300_000)) { setNotice('Каждый файл должен быть меньше 300 КБ'); return }
    if (incoming.some(file => !/\.(tsx?|jsx?|mjs|py|css|scss|html?|json|txt)$/i.test(file.name))) { setNotice('Поддерживаются JS, TS, Python, CSS, HTML, JSON и TXT'); return }
    try {
      const next = await Promise.all(incoming.map(async file => ({ name: file.name, content: await file.text(), language: detectLanguage(file.name) })))
      setSources(next)
      setAnalysis(analyzeSources(next))
      setSourceLabel(`${next.length} ${next.length === 1 ? 'файл' : 'файлов'}`)
      setSelectedLine(1)
      setNotice(`Прочитано локально: ${next.map(file => file.name).join(', ')}`)
    } catch { setNotice('Не удалось прочитать файлы. Проверьте кодировку и попробуйте снова.') }
    if (fileInput.current) fileInput.current.value = ''
  }

  const removeSource = (name: string) => {
    const next = sources.filter(source => source.name !== name)
    setSources(next)
    if (next.length) {
      setAnalysis(analyzeSources(next))
      setSourceLabel(`${next.length} ${next.length === 1 ? 'файл' : 'файлов'}`)
      setNotice(`${name} исключён из анализа`)
    } else {
      setAnalysis(analyzeSources([]))
      setSourceLabel('Нет файлов')
      setNotice('Загрузите файлы для нового анализа')
    }
    setSelectedLine(1)
  }

  const runComparison = () => {
    if (!before.trim() || !after.trim()) { setNotice('Для сравнения нужны обе версии кода'); return }
    setBeforeAnalysis(analyzeSources([{ name: 'before', content: before }]))
    setAfterAnalysis(analyzeSources([{ name: 'after', content: after }]))
    setDiff(compareCode(before, after))
    setNotice('Сравнение обновлено · изменения посчитаны по строкам')
  }

  const copySnippet = async (id: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(id); window.setTimeout(() => setCopied(''), 1800) }
    catch { setNotice('Браузер запретил доступ к буферу обмена. Выделите код вручную.') }
  }

  const exportReport = () => {
    const report = { tool: 'CodeScope', generatedAt: new Date().toISOString(), source: sourceLabel, analysis }
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'codescope-report.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('JSON-отчёт сформирован локально')
  }

  const delta = (key: 'lines' | 'functions' | 'branches' | 'todos') => afterAnalysis.totals[key] - beforeAnalysis.totals[key]
  const added = diff.filter(line => line.type === 'added').length
  const removed = diff.filter(line => line.type === 'removed').length

  return <main id="top" className="app-shell">
    <a className="skip-link" href="#analyzer">К анализатору</a>
    <header className="topbar">
      <a className="brand" href="#top"><SquareCode/><b>CodeScope</b><span>LOCAL ANALYTICS</span></a>
      <nav aria-label="Разделы"><a href="#analyzer">Анализ</a><a href="#compare">Сравнение</a><a href="#snippets">Сниппеты</a></nav>
      <div className="topbar-actions"><span className="privacy"><i/>0 отправок</span><button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}>{theme === 'dark' ? <Sun/> : <Moon/>}</button><button className="export-button" onClick={exportReport}><Download/>Экспорт JSON</button></div>
    </header>

    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy"><span className="eyebrow">STATIC CODE INTELLIGENCE</span><h1 id="hero-title">Код в цифрах.<br/><em>До ревью.</em></h1><p>Быстрый снимок структуры, ветвлений и читаемости. Без аккаунта, API и передачи исходников.</p><div className="hero-proof"><span><ShieldCheck/>Локальный анализ</span><span><Braces/>7 языков</span><span><Download/>JSON-отчёт</span></div><a href="#analyzer" className="hero-link">Начать анализ<ArrowDown/></a></div>

      <section className="workbench" id="analyzer" aria-label="Анализатор кода">
        <div className="workbench-top"><div className="mode-tabs" role="tablist" aria-label="Источник кода"><button role="tab" aria-selected={mode === 'paste'} className={mode === 'paste' ? 'active' : ''} onClick={() => setMode('paste')}><Code2/>Вставить код</button><button role="tab" aria-selected={mode === 'files'} className={mode === 'files' ? 'active' : ''} onClick={() => setMode('files')}><Files/>Файлы</button></div><span>HEURISTIC / v1.0</span></div>
        {mode === 'paste' ? <div className="paste-panel" role="tabpanel"><div className="editor-top"><span><i/>SOURCE</span><div><select aria-label="Язык кода" value={language} onChange={event => setLanguage(event.target.value as 'Auto' | Language)}><option>Auto</option><option>TypeScript</option><option>JavaScript</option><option>Python</option><option>CSS</option><option>HTML</option><option>JSON</option></select><button className="text-button" onClick={() => { setCode(sampleCode); setLanguage('Auto'); setNotice('Демо-код восстановлен') }}><RotateCcw/>Демо</button></div></div><textarea className="code-input" value={code} onChange={event => setCode(event.target.value)} maxLength={200000} spellCheck={false} aria-label="Код для анализа"/><div className="editor-footer"><span>{code.split('\n').length} строк · {new Blob([code]).size.toLocaleString('ru-RU')} байт</span><button className="analyze-button" onClick={analyzePaste}><Play/>Анализировать</button></div></div> : <div className="files-panel" role="tabpanel"><input ref={fileInput} className="visually-hidden" type="file" multiple accept=".js,.jsx,.mjs,.ts,.tsx,.py,.css,.scss,.html,.htm,.json,.txt" onChange={event => void readFiles(event.target.files)}/><button className="upload-zone" onClick={() => fileInput.current?.click()}><Upload/><b>Выбрать файлы</b><span>До 12 файлов · максимум 300 КБ каждый</span><small>JS · TS · PY · CSS · HTML · JSON · TXT</small></button>{sources.length > 0 && <div className="file-chips">{sources.map(source => <span key={source.name}><FileCode2/>{source.name}<button onClick={() => removeSource(source.name)} aria-label={`Убрать ${source.name}`}><X/></button></span>)}</div>}</div>}
        <div className="analysis-notice" aria-live="polite"><LockKeyhole/><span>{notice}</span></div>
      </section>
    </section>

    <section className="source-summary" aria-label="Результат анализа"><div className="source-name"><span className="source-icon"><FileCode2/></span><div><span>ТЕКУЩИЙ СНИМОК</span><h2>{sourceLabel}</h2></div></div><div className="metric-grid"><div><b>{analysis.files.length}</b><span>ФАЙЛЫ</span></div><div><b>{analysis.totals.lines.toLocaleString('ru-RU')}</b><span>СТРОКИ</span></div><div><b>{analysis.totals.functions}</b><span>ФУНКЦИИ</span></div><div><b>{analysis.totals.branches}</b><span>ВЕТВЛЕНИЯ</span></div><div><b className={analysis.totals.todos ? 'warning' : ''}>{analysis.totals.todos}</b><span>TODO / FIXME</span></div><div><b className="accent">{analysis.quality}<small>/100</small></b><span>ИНДЕКС СТРУКТУРЫ</span></div></div></section>

    <div className="dashboard">
      <section className="panel composition-panel"><PanelHead index="01" title="Состав исходника" meta={`${analysis.totals.code} строк кода`}/><div className="composition-body"><div className="donut" style={{ '--code': `${analysis.totals.lines ? analysis.totals.code / analysis.totals.lines * 100 : 0}%`, '--comments': `${analysis.totals.lines ? (analysis.totals.code + analysis.totals.comments) / analysis.totals.lines * 100 : 0}%` } as React.CSSProperties}><div><b>{analysis.totals.lines ? Math.round(analysis.totals.code / analysis.totals.lines * 100) : 0}%</b><span>КОД</span></div></div><div className="composition-legend"><LegendRow label="Код" value={analysis.totals.code} color="blue"/><LegendRow label="Комментарии" value={analysis.totals.comments} color="pale"/><LegendRow label="Пустые строки" value={analysis.totals.blank} color="dark"/><div className="comment-rate"><span>Доля комментариев</span><b>{analysis.totals.code ? (analysis.totals.comments / analysis.totals.code * 100).toFixed(1) : '0.0'}%</b></div></div></div></section>

      <section className="panel language-panel"><PanelHead index="02" title="Языки" meta={`${analysis.languages.length} обнаружено`}/><div className="language-stack" aria-label="Доли языков">{analysis.languages.map((item,index) => <span key={item.language} style={{ width: `${item.share}%` }} className={`language-color-${index % 5}`} title={`${item.language}: ${item.share}%`}/>)}</div><div className="language-list">{analysis.languages.length ? analysis.languages.map((item,index) => <div key={item.language}><i className={`language-color-${index % 5}`}/><b>{item.language}</b><span>{item.lines} строк</span><strong>{item.share}%</strong></div>) : <p>Нет данных для анализа.</p>}</div><p className="panel-note">Язык определяется по расширению файла или характерному синтаксису.</p></section>

      <section className="panel complexity-panel"><PanelHead index="03" title="Плотность ветвлений" meta="if · for · catch · && · || · ?"/><div className="bar-chart" role="img" aria-label="Ветвления по группам строк">{analysis.buckets.map((bucket,index) => <div className="bar-column" key={`${bucket.label}-${index}`}><span className="bar-value">{bucket.branches || ''}</span><div className="bar-track"><i style={{ height: `${Math.max(3, bucket.branches / maxBucket * 100)}%` }}/></div><small>{index % 4 === 0 ? bucket.label.split('—')[0] : ''}</small></div>)}</div><div className="chart-caption"><span>Начало исходника</span><p>Выше столбец — больше условий в группе строк. Это не измерение производительности.</p><span>Конец</span></div></section>

      <section className="panel line-panel"><PanelHead index="04" title="Карта строк" meta={`${allLines.length} строк · цвет = вложенность`}/><div className="line-map" aria-hidden="true">{allLines.slice(0,240).map(line => <i key={`${line.file}-${line.number}`} className={`line-cell ${line.kind} level-${Math.min(4,line.indent)} branch-${Math.min(2,line.branches)}`}/>)}</div>{allLines.length > 240 && <p className="panel-note">На карте показаны первые 240 строк; в отчёте сохранены все.</p>}<div className="line-inspector"><label>Проверить строку<select value={allLines.length ? Math.min(selectedLine, allLines.length) : 0} onChange={event => setSelectedLine(Number(event.target.value))}>{allLines.map((line,index) => <option value={index + 1} key={`${line.file}-${line.number}`}>{line.number} · {line.file}</option>)}</select></label><div className="inspected-code">{inspected ? <><span>{inspected.file}:{inspected.number}</span><code>{inspected.text || '∅ пустая строка'}</code><small>{inspected.branches} ветвлений · уровень {inspected.indent}</small></> : <code>Нет строк для проверки</code>}</div></div><div className="line-legend"><span>Меньше вложенность</span>{[0,1,2,3,4].map(level => <i key={level} className={`level-${level}`}/>)}<span>Больше</span></div></section>

      <section className="panel files-table-panel"><PanelHead index="05" title="Файлы в снимке" meta="Статический эвристический анализ"/><div className="table-scroll"><table><thead><tr><th>Файл</th><th>Язык</th><th>Строки</th><th>Функции</th><th>Ветвления</th><th>Вложенность</th><th>TODO</th></tr></thead><tbody>{analysis.files.map(file => <tr key={file.name}><td><FileCode2/>{file.name}</td><td>{file.language}</td><td>{file.metrics.lines}</td><td>{file.metrics.functions}</td><td>{file.metrics.branches}</td><td>{file.metrics.maxNesting}</td><td className={file.metrics.todos ? 'warning' : ''}>{file.metrics.todos}</td></tr>)}</tbody></table></div></section>
    </div>

    <section className="compare-section" id="compare"><div className="section-heading"><span>06 / VERSION DIFF</span><h2>Сравните две версии.<br/><em>Без догадок.</em></h2><p>Построчный diff показывает добавления и удаления, а метрики — как изменилась структура.</p></div><div className="compare-editors"><label><span>A / ИСХОДНАЯ ВЕРСИЯ</span><textarea value={before} onChange={event => setBefore(event.target.value)} maxLength={40000} spellCheck={false}/></label><label><span>B / НОВАЯ ВЕРСИЯ</span><textarea value={after} onChange={event => setAfter(event.target.value)} maxLength={40000} spellCheck={false}/></label></div><div className="compare-actions"><span>{before.split('\n').length} → {after.split('\n').length} строк</span><button className="analyze-button" onClick={runComparison}><Play/>Сравнить версии</button></div><div className="diff-stats"><div><b className="added-text">+{added}</b><span>ДОБАВЛЕНО</span></div><div><b className="removed-text">−{removed}</b><span>УДАЛЕНО</span></div><div><b>{formatDelta(delta('functions'))}</b><span>ФУНКЦИИ</span></div><div><b>{formatDelta(delta('branches'))}</b><span>ВЕТВЛЕНИЯ</span></div><div><b>{formatDelta(delta('todos'))}</b><span>TODO</span></div><div><b>{formatDelta(afterAnalysis.quality - beforeAnalysis.quality)}</b><span>ИНДЕКС</span></div></div><div className="diff-view" tabIndex={0} aria-label="Результат построчного сравнения">{diff.map((line,index) => <div key={index} className={`diff-line ${line.type}`}><span>{line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}</span><code>{line.text || ' '}</code></div>)}</div></section>

    <section className="snippets-section" id="snippets"><div className="section-heading"><span>07 / COPY & SHIP</span><h2>Небольшие функции.<br/><em>Проверенные сценарии.</em></h2><p>Чистые примеры без зависимостей. Перед использованием адаптируйте обработку ошибок под свой проект.</p></div><div className="snippet-search"><Search/><input value={snippetQuery} onChange={event => setSnippetQuery(event.target.value)} placeholder="Найти сниппет…" aria-label="Поиск сниппетов"/><span>{visibleSnippets.length} / {snippets.length}</span></div><div className="snippet-list">{visibleSnippets.map((snippet,index) => <article key={snippet.id}><div className="snippet-info"><span>{String(index + 1).padStart(2,'0')} / {snippet.language}</span><h3>{snippet.name}()</h3><p>{snippet.description}</p><button onClick={() => void copySnippet(snippet.id,snippet.code)}>{copied === snippet.id ? <Check/> : <Clipboard/>}{copied === snippet.id ? 'Скопировано' : 'Копировать код'}</button></div><pre tabIndex={0}><code>{snippet.code}</code></pre></article>)}{visibleSnippets.length === 0 && <div className="empty-state"><Search/><b>Ничего не найдено</b><p>Попробуйте «async», «bytes» или очистите запрос.</p><button onClick={() => setSnippetQuery('')}>Показать все сниппеты</button></div>}</div></section>

    <section className="security-note"><div><LockKeyhole/><span>PRIVATE BY ARCHITECTURE</span></div><h2>Ваш код остаётся у вас.</h2><p>Никаких сетевых запросов с исходниками, скрытого выполнения кода и серверного хранения. Файлы читаются только для текущего анализа.</p><div><span>0</span><small>ОТПРАВОК ИСХОДНИКОВ</small><span>0</span><small>СОХРАНЁННЫХ ФАЙЛОВ</small><span>1</span><small>ЛОКАЛЬНАЯ НАСТРОЙКА ТЕМЫ</small></div></section>
    <footer className="footer"><a className="brand" href="#top"><SquareCode/><b>CodeScope</b></a><p>Метрики эвристические: они помогают найти места для ревью, но не заменяют тесты, линтер и профилировщик. Тема хранится только в этом браузере.</p><button onClick={exportReport}><Download/>Скачать текущий отчёт<ArrowUpRight/></button></footer>
  </main>
}

function PanelHead({ index, title, meta }: { index: string; title: string; meta: string }) {
  return <div className="panel-head"><div><span>{index}</span><h2>{title}</h2></div><p>{meta}</p><ChevronRight/></div>
}

function LegendRow({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="legend-row"><i className={color}/><span>{label}</span><b>{value}</b></div>
}

function formatDelta(value: number) {
  return value > 0 ? `+${value}` : String(value)
}
