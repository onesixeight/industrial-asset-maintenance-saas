import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  MarkAllReadResponse,
  NotificationListQuery,
  NotificationResponse,
  UnreadCountResponse,
} from "@iam/shared";
import { PrismaService } from "../prisma";

type NotificationRow = {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
};

function toNotificationResponse(n: NotificationRow): NotificationResponse {
  return {
    id: n.id,
    userId: n.userId,
    title: n.title,
    message: n.message,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

/**
 * Per-user notification consumer. Every query is scoped by `userId` (the JWT
 * `sub`) — notifications are owned by a user, not a company, so there is no
 * company filter. Id-keyed lookups include `userId` in the where clause so a
 * request for another user's notification id returns 404 (no existence leak /
 * IDOR). This module is read + mark-read only; the only producer today is
 * Phase 6's low-stock trigger.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: NotificationListQuery): Promise<NotificationResponse[]> {
    const rows = await this.prisma.getClient().notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return rows.map(toNotificationResponse);
  }

  async unreadCount(userId: string): Promise<UnreadCountResponse> {
    const count = await this.prisma.getClient().notification.count({
      where: { userId, read: false },
    });
    return { count };
  }

  async markRead(id: string, userId: string): Promise<NotificationResponse> {
    const existing = await this.prisma.getClient().notification.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException();
    const updated = await this.prisma.getClient().notification.update({
      where: { id },
      data: { read: true },
    });
    return toNotificationResponse(updated);
  }

  async markAllRead(userId: string): Promise<MarkAllReadResponse> {
    const result = await this.prisma.getClient().notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { updated: result.count };
  }
}
