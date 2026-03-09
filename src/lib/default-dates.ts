/** Default lookback: first day of the month, 12 months ago. */
export function getDefaultFromDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 12);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Default from date as YYYY-MM-DD string, for use in UI filter controls. */
export function getDefaultFromDateISO(): string {
  return getDefaultFromDate().toISOString().slice(0, 10);
}
