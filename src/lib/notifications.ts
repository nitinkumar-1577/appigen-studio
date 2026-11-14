export const NOTIFICATION_RETENTION_MS = 24 * 60 * 60 * 1000;
export const MAX_STORED_NOTIFICATIONS = 30;
export interface TimestampedNotification { createdAt: number }
export function retainRecentNotifications<T extends TimestampedNotification>(items: T[], now = Date.now()): T[] {
  const cutoff = now - NOTIFICATION_RETENTION_MS;
  return items.filter((item) => Number.isFinite(item.createdAt) && item.createdAt >= cutoff).slice(0, MAX_STORED_NOTIFICATIONS);
}
