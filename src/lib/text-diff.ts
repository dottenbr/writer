export type DiffSegmentType = "same" | "added" | "removed";

export interface DiffSegment {
  type: DiffSegmentType;
  value: string;
}

const TOKEN_REGEX = /\s+|[^\s]+/g;
const MAX_MATRIX_CELLS = 160000;

function tokenize(input: string): string[] {
  return input.match(TOKEN_REGEX) ?? [];
}

function mergeAdjacentSegments(segments: DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous && previous.type === segment.type) {
      previous.value += segment.value;
      continue;
    }
    merged.push({ ...segment });
  }
  return merged;
}

export function buildWordDiff(beforeText: string, afterText: string): DiffSegment[] {
  if (beforeText === afterText) {
    return [{ type: "same", value: afterText }];
  }

  const beforeTokens = tokenize(beforeText);
  const afterTokens = tokenize(afterText);
  const cellCount = (beforeTokens.length + 1) * (afterTokens.length + 1);

  // Avoid expensive O(n*m) memory/time for very large drafts.
  if (cellCount > MAX_MATRIX_CELLS) {
    return mergeAdjacentSegments([
      beforeText ? { type: "removed", value: beforeText } : { type: "same", value: "" },
      afterText ? { type: "added", value: afterText } : { type: "same", value: "" },
    ]);
  }

  const table: number[][] = Array.from({ length: beforeTokens.length + 1 }, () =>
    new Array(afterTokens.length + 1).fill(0)
  );

  for (let i = 1; i <= beforeTokens.length; i += 1) {
    for (let j = 1; j <= afterTokens.length; j += 1) {
      if (beforeTokens[i - 1] === afterTokens[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }

  const reversed: DiffSegment[] = [];
  let i = beforeTokens.length;
  let j = afterTokens.length;

  while (i > 0 && j > 0) {
    if (beforeTokens[i - 1] === afterTokens[j - 1]) {
      reversed.push({ type: "same", value: beforeTokens[i - 1] });
      i -= 1;
      j -= 1;
      continue;
    }
    if (table[i - 1][j] >= table[i][j - 1]) {
      reversed.push({ type: "removed", value: beforeTokens[i - 1] });
      i -= 1;
    } else {
      reversed.push({ type: "added", value: afterTokens[j - 1] });
      j -= 1;
    }
  }

  while (i > 0) {
    reversed.push({ type: "removed", value: beforeTokens[i - 1] });
    i -= 1;
  }

  while (j > 0) {
    reversed.push({ type: "added", value: afterTokens[j - 1] });
    j -= 1;
  }

  reversed.reverse();
  return mergeAdjacentSegments(reversed);
}
