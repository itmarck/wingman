import './cases/quotes.js';
import './cases/reviews.js';
import './cases/workflows.js';
import { readOption, readPositiveInteger } from './cli.js';
import { print, run } from './runner.js';

const report = await run({
  repeat: readPositiveInteger(process.argv.slice(2), '--repeat', 1),
  filter: readOption(process.argv.slice(2), '--case'),
});

print(report);

if (report.failed > 0) process.exitCode = 1;
