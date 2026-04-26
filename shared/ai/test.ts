import { createLogger } from '../logger.js';
import { classify, getProvider } from './index.js';

const log = createLogger('clde');

async function main() {
  const provider = getProvider();
  log.head(`Testing AI provider: ${provider.name}`);
  const result = await classify(
    'Classify this email and respond with a JSON object containing at least a "classification" field.\n\n' +
      'From: test@example.com\nSubject: Test email\nBody: This is a test email for Wingman.',
  );
  log.ok(`Classification result: ${JSON.stringify(result, null, 2)}`);
  log.ok(`${provider.name} test passed`);
}

main().catch((err) => {
  log.error(`Test failed: ${err.message}`);
  process.exit(1);
});
