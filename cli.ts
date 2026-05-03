#!/usr/bin/env node
import { Command } from 'commander'
import { createRequire } from 'module'
import { loadConfig } from './lib/env.js'

loadConfig()

const require = createRequire(import.meta.url)
const { version } = require('./package.json') as { version: string }
const program = new Command()
program.name('wingman').description('Personal automation system').version(version)

type CliModule = { register: (program: Command) => void }

const cmds = ['run', 'log', 'test', 'config', 'setup', 'state'] as const
await Promise.all(
  cmds.map(async function (name) {
    const cliModule: CliModule = await import(`./commands/${name}.js`)
    cliModule.register(program)
  }),
)

program.parse()
