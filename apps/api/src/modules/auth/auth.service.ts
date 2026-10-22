import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../common/prisma.service";
import { hashPassword, verifyPassword } from "./password";
import type { LoginDto, RegisterDto } from "./dto/auth.dto";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 phút (ADR-07)
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày

type PublicUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  locale: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  ping() {
    return { module: "auth", status: "ok" };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("Email đã được đăng ký");
    }
    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: { email, name: dto.name.trim(), passwordHash },
    });
    return this.issueTokens(user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, dto.password))) {
      throw new UnauthorizedException("Email hoặc mật khẩu không đúng");
    }
    return this.issueTokens(user);
  }

  /**
   * Xoay vòng refresh token: token cũ bị thu hồi ngay, cấp cặp token mới.
   * Phía server chỉ lưu hash SHA-256 của refresh token.
   */
  async refresh(rawToken: string) {
    const tokenHash = this.hashRefreshToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Refresh token không hợp lệ hoặc đã hết hạn");
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(stored.user);
  }

  async logout(rawToken?: string) {
    if (rawToken) {
      const tokenHash = this.hashRefreshToken(rawToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { success: true };
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException("Người dùng không tồn tại");
    }
    return this.toPublicUser(user);
  }

  private async issueTokens(user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    locale: string;
  }) {
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id },
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
    const refreshToken = randomBytes(48).toString("base64url");
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return {
      user: this.toPublicUser(user),
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private hashRefreshToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    locale: string;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
    };
  }
}
