import { createAccessToken } from '../src/adapters/http/auth.js';

const source = process.argv[2];
const signingSecret = process.env.SERVER_SECRET;

if (!source) {
  throw new Error('Token source is required. Example: npm run token -- browser');
}

if (!signingSecret) {
  throw new Error('SERVER_SECRET is required');
}

process.stdout.write(`${await createAccessToken(source, signingSecret)}\n`);
