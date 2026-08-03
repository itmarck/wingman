export function readOption(arguments_: readonly string[], name: string): string | undefined {
  const inline = arguments_.find((argument) => argument.startsWith(`${name}=`));
  const position = arguments_.indexOf(name);
  return inline?.slice(name.length + 1) ?? (position >= 0 ? arguments_[position + 1] : undefined);
}

export function readPositiveInteger(
  arguments_: readonly string[],
  name: string,
  defaultValue: number,
): number {
  const raw = readOption(arguments_, name);
  if (raw === undefined) return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} requires a positive integer`);
  return value;
}
