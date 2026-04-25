#!/usr/bin/env node

/**
 * Dev runner — npm run dev [options]
 *
 * Usage:
 *   npm run dev                    → regular tick (respects timing)
 *   npm run dev -- all             → force all agents
 *   npm run dev -- email           → force email agent
 *   npm run dev -- digest          → force morning digest
 *   npm run dev -- trending        → force Reddit trending
 *   npm run dev -- catchup         → force email catch-up
 *   npm run dev -- test slack      → verify Slack webhook
 *   npm run dev -- test claude     → verify Claude CLI
 *   npm run dev -- test notion     → verify Notion API
 *   npm run dev -- schema          → create Notion databases
 *   npm run dev -- notion          → list pending tasks
 */

import { spawn } from 'child_process';

const args = process.argv.slice(2).map((a) => a.toLowerCase());

function run(cmd, cmdArgs) {
  const child = spawn(cmd, cmdArgs, { stdio: 'inherit', shell: true });
  child.on('close', (code) => process.exit(code));
}

// --- test subcommand ---

if (args[0] === 'test') {
  const tests = {
    slack: 'shared/slack.js',
    claude: 'shared/claude.js',
    notion: 'shared/notion.js',
  };

  const target = args[1];

  if (!target || !tests[target]) {
    console.error(`Usage: npm run dev -- test [${Object.keys(tests).join('|')}]`);
    process.exit(1);
  }

  run('npx', ['tsx', tests[target]]);
} else if (args[0] === 'schema') {
  run('npx', ['tsx', 'agents/tasks/schema.js']);
} else if (args[0] === 'notion') {
  run('npx', ['tsx', 'scripts/notion.js', ...args.slice(1)]);
} else {
  // --- scheduler with optional force flags ---

  const agents = ['all', 'email', 'digest', 'trending', 'catchup', 'inbox'];
  const flags = args.filter((a) => agents.includes(a)).map((a) => `--force-${a}`);

  run('npx', ['tsx', 'main.js', ...flags]);
}
