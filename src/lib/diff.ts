export interface DiffLine {
  type: "unchanged" | "added" | "removed";
  text: string;
  certLineNo: number | null;
  webLineNo: number | null;
}

/** LCS-based unified diff between two arrays of lines */
export function computeDiff(a: string[], b: string[]): DiffLine[] {
  const m = a.length;
  const n = b.length;

  // For very large inputs, fall back to simple remove-all/add-all
  if (m > 2000 || n > 2000) {
    return [
      ...a.map((text, i): DiffLine => ({ type: "removed", text, certLineNo: i + 1, webLineNo: null })),
      ...b.map((text, i): DiffLine => ({ type: "added", text, certLineNo: null, webLineNo: i + 1 })),
    ];
  }

  // Space-optimized LCS using two rows
  const prev = new Uint16Array(n + 1);
  const curr = new Uint16Array(n + 1);
  const directions: Uint8Array[] = [];

  for (let i = 0; i <= m; i++) {
    directions.push(new Uint8Array(n + 1));
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        directions[i][j] = 1; // diagonal
      } else if (prev[j] >= curr[j - 1]) {
        curr[j] = prev[j];
        directions[i][j] = 2; // up
      } else {
        curr[j] = curr[j - 1];
        directions[i][j] = 3; // left
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && directions[i][j] === 1) {
      result.push({ type: "unchanged", text: a[i - 1], certLineNo: i, webLineNo: j });
      i--;
      j--;
    } else if (i > 0 && (j === 0 || directions[i][j] === 2)) {
      result.push({ type: "removed", text: a[i - 1], certLineNo: i, webLineNo: null });
      i--;
    } else {
      result.push({ type: "added", text: b[j - 1], certLineNo: null, webLineNo: j });
      j--;
    }
  }

  return result.reverse();
}
