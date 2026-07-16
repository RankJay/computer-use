/** Short, user-facing detail for a tool activity line. Not for agent/protocol use. */

const DETAIL_MAX_CHARS = 56;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncate(text: string): string {
  if (text.length <= DETAIL_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, DETAIL_MAX_CHARS - 1)}…`;
}

function basenamePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function formatProgram(record: Record<string, unknown>): string | null {
  const program = stringField(record, "program");
  if (!program) {
    return null;
  }
  const args = record.args;
  if (!Array.isArray(args) || args.length === 0) {
    return program;
  }
  const argParts = args.filter((arg): arg is string => typeof arg === "string" && arg.length > 0);
  if (argParts.length === 0) {
    return program;
  }
  return `${program} ${argParts.join(" ")}`;
}

function formatKeys(record: Record<string, unknown>): string | null {
  const keys = record.keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    return null;
  }
  const parts = keys.filter((key): key is string => typeof key === "string" && key.length > 0);
  if (parts.length === 0) {
    return null;
  }
  return parts.join("+");
}

/**
 * One-line detail for chat activity rows.
 * Returns null when input has nothing meaningful for an end user (e.g. mouse coords).
 */
export function toolActivityDetail(toolName: string, input: unknown): string | null {
  void toolName;
  if (!isPlainRecord(input)) {
    return null;
  }

  const path = stringField(input, "path");
  if (path) {
    return truncate(basenamePath(path));
  }

  const program = formatProgram(input);
  if (program) {
    return truncate(program);
  }

  const keys = formatKeys(input);
  if (keys) {
    return truncate(keys);
  }

  for (const key of ["app", "name", "query", "url", "cwd"] as const) {
    const value = stringField(input, key);
    if (value) {
      return truncate(key === "cwd" ? basenamePath(value) : value);
    }
  }

  return null;
}
