import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrations = join(process.cwd(), 'migrations');

describe('PostgreSQL migration baseline', () => {
  it('contains only separate system and telemetry baselines', async () => {
    const files = (await readdir(migrations)).sort();
    const [system, telemetry] = await Promise.all(
      files.map((file) => readFile(join(migrations, file), 'utf8')),
    );

    expect(files).toEqual(['001_system.sql', '002_telemetry.sql']);
    expect(system).toContain('CREATE TABLE core_entries');
    expect(system).toContain('CREATE TABLE proactivity_suggestions');
    expect(system).not.toContain('telemetry.');
    expect(telemetry).toContain('CREATE TABLE telemetry.runs');
    expect(telemetry).not.toMatch(
      /CREATE TABLE (?:core|interpretation|execution|automation|proactivity)_/,
    );
  });

  it('contains current generic vocabulary without destructive legacy operations', async () => {
    const system = await readFile(join(migrations, '001_system.sql'), 'utf8');

    expect(system).toContain("consent IN ('none', 'explicit')");
    expect(system).toContain("status IN ('proposed', 'consented', 'cancelled', 'completed')");
    expect(system).not.toMatch(
      /\b(?:concepts|predicates|axioms|aliases|links|reminders|planningRequest|reminderRequest|authorization)\b/,
    );
    expect(system).not.toMatch(/\b(?:DROP|ALTER)\b/);
  });
});
