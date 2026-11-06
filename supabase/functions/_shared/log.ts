// Structured logs (spec: "Logs"). Never pass secrets, tokens or URLs with query strings.

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  info(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

export const consoleLogger: Logger = {
  info: (msg, fields = {}) => {
    console.log(JSON.stringify({ level: 'info', msg, ...fields }));
  },
  error: (msg, fields = {}) => {
    console.error(JSON.stringify({ level: 'error', msg, ...fields }));
  },
};

export const silentLogger: Logger = { info: () => undefined, error: () => undefined };
