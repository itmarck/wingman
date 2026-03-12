#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';

const program = new Command();
program.name('wingman').description('Personal automation system').version('1.2.0');

const cmds = ['run', 'log', 'status', 'task', 'test', 'config', 'setup', 'state'];
await Promise.all(cmds.map(async (c) => (await import(`./cli/${c}.js`)).register(program)));

program.parse();
