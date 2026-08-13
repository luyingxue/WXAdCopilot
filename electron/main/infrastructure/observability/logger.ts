import { app } from "electron";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

type LogDetails = Record<string, unknown>;

function sanitize(value: unknown): unknown {
  if (typeof value === "string" && value.startsWith("http")) {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return value;
    }
  }
  return value;
}

export function logEvent(
  level: "info" | "warn" | "error",
  scope: string,
  event: string,
  details: LogDetails = {},
): void {
  const safeDetails = Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, sanitize(value)]),
  );
  const entry = JSON.stringify({
    time: new Date().toISOString(),
    level,
    scope,
    event,
    ...safeDetails,
  });
  console[level](`[${scope}] ${event}`, safeDetails);
  const logDirectory = path.join(app.getPath("userData"), "logs");
  void mkdir(logDirectory, { recursive: true })
    .then(() =>
      appendFile(path.join(logDirectory, "development.jsonl"), `${entry}\n`, {
        mode: 0o600,
      }),
    )
    .catch(() => undefined);
}
