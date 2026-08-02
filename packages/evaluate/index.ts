import './cases/quotes.js';
import './cases/reviews.js';
import './cases/workflows.js';
import { print, run } from './runner.js';

const report = await run({
  repeat: readRepeat(process.argv.slice(2)),
  filter: readOption(process.argv.slice(2), '--case'),
});

print(report);

if (report.failed > 0) {
  process.exitCode = 1;
}

function readOption(arguments_: readonly string[], name: string): string | undefined {
  const inline = arguments_.find((argument) => argument.startsWith(`${name}=`));
  const position = arguments_.indexOf(name);
  return inline?.slice(name.length + 1) ?? (position >= 0 ? arguments_[position + 1] : undefined);
}

function readRepeat(arguments_: readonly string[]): number {
  const inline = arguments_.find((argument) => argument.startsWith('--repeat='));
  const position = arguments_.indexOf('--repeat');
  const value =
    inline?.slice('--repeat='.length) ?? (position >= 0 ? arguments_[position + 1] : '1');
  const repeat = Number(value);

  if (!Number.isInteger(repeat) || repeat < 1) {
    throw new Error('--repeat must be followed by a positive integer');
  }

  return repeat;
}
