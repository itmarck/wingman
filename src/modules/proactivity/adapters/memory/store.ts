import type { ProactiveProposal } from '../../domain/proposal.js';
import type { ProactivityStore } from '../../ports/store.js';

export class MemoryProactivityStore implements ProactivityStore {
  readonly #proposals = new Map<string, ProactiveProposal>();
  readonly #fingerprints = new Map<string, string>();
  async save(proposal: ProactiveProposal): Promise<void> {
    const frozen = Object.freeze(structuredClone(proposal));
    this.#proposals.set(proposal.id, frozen);
    this.#fingerprints.set(proposal.fingerprint, proposal.id);
  }
  async find(id: string): Promise<ProactiveProposal | undefined> {
    return this.#proposals.get(id);
  }
  async findFingerprint(fingerprint: string): Promise<ProactiveProposal | undefined> {
    const id = this.#fingerprints.get(fingerprint);
    return id ? this.#proposals.get(id) : undefined;
  }
  async list(): Promise<readonly ProactiveProposal[]> {
    return Object.freeze([...this.#proposals.values()]);
  }
}
