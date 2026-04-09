type Meta = Record<string, unknown>;

export const logInfo = (event: string, meta: Meta = {}): void => {
  console.log(JSON.stringify({ level: "info", event, ...meta }));
};

export const logError = (event: string, meta: Meta = {}): void => {
  console.error(JSON.stringify({ level: "error", event, ...meta }));
};
