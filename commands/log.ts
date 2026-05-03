import { readFile } from 'fs/promises'
import chalk from 'chalk'
import type { Command } from 'commander'
import { dateString, utcToLocalTime } from './lib/date.js'
import { parseLine, formatLine, formatOneline } from './lib/print.js'

const LOG_DIR = 'logs'

type LogOptions = {
  yesterday?: boolean
  oneline?: boolean
  verbose?: boolean
  data?: boolean
  all?: boolean
  summary?: boolean
  tag?: string
  depth?: string
  filter?: string
  errors?: boolean
}

async function showSummary(): Promise<void> {
  try {
    const content = await readFile(`${LOG_DIR}/output.log`, 'utf-8')
    console.log(chalk.gray('\n─── Wingman tick summary ───\n'))
    for (const line of content.split('\n').filter(l => l.trim())) {
      const colored = line.includes('nothing to run')
        ? chalk.gray(line)
        : line
            .replace(/(email:[^,)]+)/g, match => chalk.cyan(match))
            .replace(/(trending:[^,)]+)/g, match => chalk.magenta(match))
            .replace(/(digest[^,)]*)/g, match => chalk.yellow(match))
            .replace(/(catchup:[^,)]+)/g, match => chalk.blue(match))
            .replace(/(inbox:[^,)]+)/g, match => chalk.cyan(match))
      console.log(colored)
    }
    console.log('')
  } catch (error: any) {
    if (error.code === 'ENOENT') console.log(chalk.yellow(`\nNo summary log (${LOG_DIR}/output.log)\n`))
    else throw error
  }
}

async function viewLog(options: LogOptions): Promise<void> {
  if (options.summary) return showSummary()

  const daysAgo = options.yesterday ? 1 : 0
  const date = dateString(daysAgo)
  const label = daysAgo === 0 ? 'hoy' : 'ayer'
  const file = `${LOG_DIR}/${date}.log`

  const showVerb = options.all || options.verbose
  const showData = options.all || options.data
  const depthLimit = options.depth != null ? parseInt(options.depth, 10) : null

  try {
    const content = await readFile(file, 'utf-8')
    console.log(chalk.gray(`\n─── Wingman logs — ${date} (${label}) ───\n`))

    let printed = 0

    for (const raw of content.split('\n')) {
      if (!raw.trim()) continue

      const parsed = parseLine(raw)
      if (!parsed) continue

      if (parsed.level === 'verb' && !showVerb) continue
      if (parsed.level === 'data' && !showData) continue
      if (options.tag && parsed.tag !== options.tag && parsed.level !== 'tick') continue
      if (options.errors && parsed.level !== 'err') continue
      if (depthLimit !== null && parsed.depth > depthLimit) continue
      if (options.filter && !raw.toLowerCase().includes(options.filter.toLowerCase())) continue

      const localTime = utcToLocalTime(parsed.timestamp)

      if (options.oneline) {
        const line = formatOneline(parsed, localTime)
        if (!line) continue
        console.log(line)
      } else {
        console.log(formatLine(parsed, localTime))
      }

      printed++
    }

    if (printed === 0) {
      console.log(chalk.yellow(`No hay resultados${options.tag ? ` para "${options.tag}"` : ''} ${label}.`))
    }
    console.log('')
  } catch (error: any) {
    if (error.code === 'ENOENT') console.log(chalk.yellow(`\nNo hay logs de ${label} (${file})\n`))
    else throw error
  }
}

export function register(program: Command): void {
  program
    .command('log')
    .description('View logs')
    .option('-y, --yesterday', "yesterday's log")
    .option('-1, --oneline', 'compact view (depth 0 only)')
    .option('-v, --verbose', 'include verb lines')
    .option('-d, --data', 'include data lines')
    .option('-a, --all', 'everything (verb + data)')
    .option('-s, --summary', 'tick summaries (output.log)')
    .option('-t, --tag <tag>', 'filter by agent tag (mail, trnd, clde, slck, task)')
    .option('--depth <n>', 'max depth (0, 1, 2)')
    .option('-f, --filter <text>', 'text search')
    .option('-e, --errors', 'only error lines')
    .action((opts: LogOptions) => viewLog(opts))
}
