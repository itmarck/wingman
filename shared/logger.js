export function createLogger(prefix) {
  const timestamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
  const fmt = (msg) => `[${timestamp()}] [${prefix}] ${msg}`;

  return {
    info: (msg) => console.log(fmt(msg)),
    warn: (msg) => console.warn(fmt(msg)),
    error: (msg) => console.error(fmt(msg)),
  };
}
