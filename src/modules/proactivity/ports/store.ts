import type { ProactiveProposal } from '../domain/proposal.js';

export interface ProactivityStore {
  save(proposal: ProactiveProposal): Promise<void>;
  find(id: string): Promise<ProactiveProposal | undefined>;
  findFingerprint(fingerprint: string): Promise<ProactiveProposal | undefined>;
  list(): Promise<readonly ProactiveProposal[]>;
}
