const TITLE_MAX_LENGTH = 48;

export function deriveChatTitle(prompt: string): string {
  const collapsed = prompt.trim().replace(/\s+/g, " ");
  return collapsed.length <= TITLE_MAX_LENGTH
    ? collapsed
    : `${collapsed.slice(0, TITLE_MAX_LENGTH - 1)}…`;
}
