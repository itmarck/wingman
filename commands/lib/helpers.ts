import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { spawn } from 'child_process'
import { createInterface } from 'readline'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function exec(script: string, scriptArgs: string[] = []): void {
  const path = resolve(ROOT, script)
  const runner = resolve(ROOT, 'node_modules/.bin/tsx')
  const child = spawn(runner, [path, ...scriptArgs], {
    stdio: 'inherit',
    shell: true,
    windowsHide: true,
  })
  child.on('close', (exitCode) => process.exit(exitCode ?? 0))
}

export function ask(question: string): Promise<string> {
  const readlineInterface = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) =>
    readlineInterface.question(question, (answer) => {
      readlineInterface.close()
      resolve(answer.trim())
    }),
  )
}

export function openUrl(url: string): void {
  spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', windowsHide: true }).unref()
}
