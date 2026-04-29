#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'module';
import { loadConfig } from './shared/env.js';

loadConfig();

const { version } = createRequire(import.meta.url)('./package.json') as { version: string };
const program = new Command();
program.name('wingman').description('Personal automation system').version(version);

type CliModule = { register: (program: Command) => void };

const cmds = ['run', 'log', 'test', 'config', 'setup', 'state'] as const;
await Promise.all(
  cmds.map(async (name) => ((await import(`./cli/${name}.js`)) as CliModule).register(program)),
);

program.parse();
