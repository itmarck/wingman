import { runLocalQuality } from './local.js';
import { printQuality } from './quality.js';

const arguments_ = process.argv.slice(2);
const unknown = arguments_.filter((argument) => argument !== '--json');
if (unknown.length > 0) throw new Error(`Unknown quality option: ${unknown.join(' ')}`);

const report = await runLocalQuality();
printQuality(report, arguments_.includes('--json'));
if (!report.mayStop) process.exitCode = 1;
