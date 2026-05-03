import chalk from 'chalk'

export type LogLevel = 'tick' | 'head' | 'info' | 'ok' | 'warn' | 'err' | 'verb' | 'data'

export type ParsedLine = {
  level: LogLevel
  timestamp: string
  tag: string | null
  depth: number
  msg: string
}

type ColorFn = (text: string) => string

const TAG_COLORS: Record<string, ColorFn> = {
  main: chalk.blue,
  mail: chalk.cyan,
  trnd: chalk.magenta,
  clde: chalk.yellow,
  slck: chalk.green,
  auth: chalk.red,
  task: chalk.blue,
  notn: chalk.cyan,
}

type LevelStyle = { symbol: string; color: ColorFn }

const LEVEL_STYLES: Record<string, LevelStyle> = {
  head: { symbol: '▸', color: chalk.white },
  info: { symbol: ' ', color: chalk.gray },
  ok:   { symbol: '✓', color: chalk.green },
  warn: { symbol: '⚠', color: chalk.yellow },
  err:  { symbol: '✗', color: chalk.red },
  verb: { symbol: '·', color: chalk.gray },
  data: { symbol: '·', color: chalk.gray },
}

const TICK_PATTERN = /^━━━ (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (.+?)[\s━]*$/
const LINE_PATTERN = /^(.) (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \[(.{4})\] ([a-z ]{4}) (\d{2}) \| (.*)$/

export function parseLine(raw: string): ParsedLine | null {
  const tickMatch = raw.match(TICK_PATTERN)
  if (tickMatch) {
    return { level: 'tick', timestamp: tickMatch[1], tag: null, depth: 0, msg: tickMatch[2] }
  }

  const match = raw.match(LINE_PATTERN)
  if (!match) return null

  const [, , timestamp, tag, level, depth, msg] = match
  return {
    level: level.trim() as LogLevel,
    timestamp,
    tag: tag.trim(),
    depth: parseInt(depth, 10),
    msg,
  }
}

function colorizeClassification(text: string): string {
  return text
    .replace(/-- urgent/g, chalk.red('-- urgent'))
    .replace(/-- important/g, chalk.yellow('-- important'))
    .replace(/-- informational/g, chalk.blue('-- informational'))
    .replace(/-- noise/g, chalk.gray('-- noise'))
}

function colorizeJson(line: string): string {
  return line
    .replace(/"([^"]+)":/g, (_, key) => chalk.cyan(`"${key}"`) + ':')
    .replace(/: "([^"]*)"/g, (_, val) => ': ' + chalk.green(`"${val}"`))
    .replace(/: (\d+)/g, (_, num) => ': ' + chalk.yellow(num))
    .replace(/: (true|false|null)/g, (_, val) => ': ' + chalk.magenta(val))
}

export function formatLine(parsed: ParsedLine, localTime: string): string {
  const { level, tag, depth, msg } = parsed

  if (level === 'tick') {
    return chalk.blue(`\n━━━ ${localTime} ${msg} ${'━'.repeat(Math.max(0, 50 - msg.length))}`)
  }

  const style: LevelStyle = LEVEL_STYLES[level] ?? LEVEL_STYLES['info']
  const symbol = style.color(style.symbol)
  const tagColor: ColorFn = tag ? (TAG_COLORS[tag] ?? chalk.white) : chalk.white
  const tagString = `${chalk.gray('[')}${tagColor((tag ?? '    ').padEnd(4))}${chalk.gray(']')}`
  const indent = '  '.repeat(depth)

  let text: string
  if (level === 'err') text = chalk.red(indent + msg)
  else if (level === 'warn') text = chalk.yellow(indent + msg)
  else if (level === 'head') text = chalk.white.bold(indent + msg)
  else if (level === 'ok') text = chalk.green(indent + msg)
  else if (level === 'verb') text = chalk.gray(indent + msg)
  else if (level === 'data') {
    const trimmed = msg.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('}') || trimmed.startsWith('"') || trimmed.startsWith('[') || trimmed.startsWith(']')) {
      text = indent + colorizeJson(msg)
    } else {
      text = chalk.white(indent + msg)
    }
  } else {
    text = colorizeClassification(indent + msg)
  }

  return `${symbol} ${chalk.gray(localTime)} ${tagString} ${text}`
}

export function formatOneline(parsed: ParsedLine, localTime: string): string | null {
  const { level, tag, depth, msg } = parsed
  if (level === 'tick' || level === 'verb' || level === 'data') return null
  if (depth > 0) return null

  const tagColor: ColorFn = tag ? (TAG_COLORS[tag] ?? chalk.white) : chalk.white
  const style: LevelStyle = LEVEL_STYLES[level] ?? LEVEL_STYLES['info']
  const symbol = style.color(style.symbol)

  let text: string
  if (level === 'err') text = chalk.red(msg)
  else if (level === 'warn') text = chalk.yellow(msg)
  else if (level === 'ok') text = chalk.green(msg)
  else if (level === 'head') text = chalk.white.bold(msg)
  else text = colorizeClassification(msg)

  return `${symbol} ${chalk.gray(localTime)}  ${tagColor(tag ?? '')}  ${text}`
}
