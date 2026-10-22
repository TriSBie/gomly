import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

/** User tối thiểu mà guard gắn vào request sau khi xác thực Bearer JWT. */
export interface AuthenticatedUser {
  id: string;
  email?: string;
}

export interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
  [key: string]: unknown;
}

function base64UrlDecode(input: string): Buffer {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

/**
 * Tên biến môi trường chứa secret ký access token, theo thứ tự ưu tiên.
 * Kiến trúc chốt JWT access chứa `user_id` (ADR-07); module auth ký bằng secret
 * trong env — guard thử lần lượt các tên phổ biến để không phụ thuộc cứng vào
 * cách đặt tên của module auth.
 */
const SECRET_ENV_CANDIDATES = [
  "JWT_SECRET",
  "JWT_ACCESS_SECRET",
  "AUTH_JWT_SECRET",
  "JWT_ACCESS_TOKEN_SECRET",
];

function configuredSecrets(): string[] {
  return SECRET_ENV_CANDIDATES.map((name) => process.env[name]).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function verifyHs256(token: string, secret: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecode(headerPart).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(payloadPart).toString("utf8"));
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;

  const expected = createHmac("sha256", secret)
    .update(`${headerPart}.${payloadPart}`)
    .digest();
  const actual = base64UrlDecode(signaturePart);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  const exp = payload.exp;
  if (typeof exp === "number" && exp * 1000 <= Date.now()) return null;
  return payload;
}

/**
 * Guard Bearer JWT tự chứa trong module intake (kiểm chứng HS256 bằng node:crypto,
 * không thêm dependency, không import gì từ module auth).
 * Payload theo kiến trúc chỉ chứa user_id → chấp nhận claim `sub` | `userId` | `id`.
 */
@Injectable()
export class BearerAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers["authorization"];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value || !value.startsWith("Bearer ")) {
      throw new UnauthorizedException("Thiếu Bearer token");
    }
    const token = value.slice("Bearer ".length).trim();

    const secrets = configuredSecrets();
    if (secrets.length === 0) {
      throw new UnauthorizedException(
        "Server chưa cấu hình secret JWT (JWT_SECRET) — không thể xác thực",
      );
    }

    let payload: Record<string, unknown> | null = null;
    for (const secret of secrets) {
      payload = verifyHs256(token, secret);
      if (payload) break;
    }
    if (!payload) {
      throw new UnauthorizedException("Bearer token không hợp lệ hoặc đã hết hạn");
    }

    const rawId = payload.sub ?? payload.userId ?? payload.id;
    if (typeof rawId !== "string" || rawId.length === 0) {
      throw new UnauthorizedException("Token không chứa user_id");
    }

    request.user = {
      id: rawId,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
    return true;
  }
}
