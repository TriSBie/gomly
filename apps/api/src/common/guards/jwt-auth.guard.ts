import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

export interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

/**
 * Guard dùng chung: yêu cầu header `Authorization: Bearer <access token>`.
 * Access JWT chỉ chứa `sub` = user_id (theo ADR-07 trong architecture.md) —
 * quyền workspace KHÔNG nằm trong token, luôn tra membership từ DB.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Thiếu access token");
    }
    const token = header.slice("Bearer ".length).trim();
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token);
      if (!payload?.sub) {
        throw new Error("Payload không có sub");
      }
      request.user = { userId: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException("Access token không hợp lệ hoặc đã hết hạn");
    }
  }
}
