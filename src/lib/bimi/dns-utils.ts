export const DNS_TIMEOUT_MS = 10_000;

export function withDnsTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error(`DNS timed out after ${DNS_TIMEOUT_MS}ms`), { code: "ETIMEOUT" })),
      DNS_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function isDnsNotFoundError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === "ENOTFOUND" || code === "ENODATA";
}
