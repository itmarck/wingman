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
  };

  const target = args[1];

  if (!target || !tests[target]) {
    console.error(`Usage: npm run dev -- test [${Object.keys(tests).join('|')}]`);
    process.exit(1);
  }

  run('node', [tests[target]]);
} else {
  // --- scheduler with optional force flags ---

  const agents = ['all', 'email', 'digest', 'trending', 'catchup'];
  const flags = args.filter((a) => agents.includes(a)).map((a) => `--force-${a}`);

  run('node', ['main.js', ...flags]);
}
