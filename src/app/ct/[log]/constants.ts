export const DEFAULT_PAGE_SIZE = 100;
export const PAGE_SIZES = [50, 100, 200] as const;

export function toPageNumber(startIndex: number, pageSize: number): number {
  return Math.floor(startIndex / pageSize) + 1;
}
