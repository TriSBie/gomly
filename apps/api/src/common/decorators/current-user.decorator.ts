import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest } from "../guards/jwt-auth.guard";

/** Lấy userId của người dùng đã xác thực (do JwtAuthGuard gắn vào request). */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user.userId;
  },
);
