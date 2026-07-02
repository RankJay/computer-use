export type FilePatchEdit = {
  readonly search: string;
  readonly replace: string;
  readonly replaceAll?: boolean;
};

export function applyFilePatches(
  content: string,
  edits: readonly FilePatchEdit[],
): { readonly content: string; readonly applied: number } {
  let result = content;
  let applied = 0;

  for (const edit of edits) {
    if (edit.search.length === 0) {
      throw new Error("Each edit.search must be non-empty.");
    }
    if (edit.replaceAll === true) {
      const parts = result.split(edit.search);
      if (parts.length === 1) {
        throw new Error(`search text not found: ${previewSearch(edit.search)}`);
      }
      result = parts.join(edit.replace);
      applied += parts.length - 1;
    } else {
      const index = result.indexOf(edit.search);
      if (index === -1) {
        throw new Error(`search text not found: ${previewSearch(edit.search)}`);
      }
      result = result.slice(0, index) + edit.replace + result.slice(index + edit.search.length);
      applied += 1;
    }
  }

  return { content: result, applied };
}

function previewSearch(search: string): string {
  const flat = search.replace(/\s+/g, " ").trim();
  if (flat.length <= 48) {
    return flat;
  }
  return `${flat.slice(0, 45)}…`;
}
