import * as argon2 from "argon2";

/**
 * Hash mật khẩu bằng argon2id (theo ADR-07 / architecture.md mục 5.3).
 * argon2 bản hiện tại đóng gói sẵn prebuilt binary nên không cần build native.
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
