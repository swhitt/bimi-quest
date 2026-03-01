export function log(level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>) {
  const entry = { level, message, timestamp: new Date().toISOString(), ...fields };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}
