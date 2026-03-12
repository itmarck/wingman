#!/usr/bin/env node
import { createRequire } from 'module';
import { loadConfig } from './shared/env.js';
import { Command } from 'commander';

loadConfig();

const { version } = createRequire(import.meta.url)('./package.json');
const program = new Command();
program.name('wingman').description('Personal automation system').version(version);

const cmds = ['run', 'log', 'status', 'task', 'test', 'config', 'setup', 'teardown', 'reset', 'state', 'stop'];
await Promise.all(cmds.map(async (c) => (await import(`./cli/${c}.js`)).register(program)));

program.parse();
