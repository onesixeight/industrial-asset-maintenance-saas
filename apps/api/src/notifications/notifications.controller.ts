import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { JwtPayload, NotificationListQuery } from "@iam/shared";
import { notificationListQuerySchema } from "@iam/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { NotificationsService } from "./notifications.service";

/**
 * Per-user notification consumer. Any authenticated user manages their own
 * notifications; the service scopes every query by `user.sub` (notifications
 * are user-owned, not company-owned). Static routes (`unread-count`,
 * `read-all`) are declared before `:id` so Nest doesn't route them as ids.
 */
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(notificationListQuerySchema)) q: NotificationListQuery,
  ) {
    return this.notifications.list(user.sub, q);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: JwtPayload) {
    return this.notifications.unreadCount(user.sub);
  }

  @Patch("read-all")
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notifications.markAllRead(user.sub);
  }

  @Patch(":id/read")
  @HttpCode(HttpStatus.OK)
  markRead(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.notifications.markRead(id, user.sub);
  }
}
