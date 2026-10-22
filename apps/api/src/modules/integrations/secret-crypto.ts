import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * Mã hóa đối xứng cho credentials của IntegrationConnection (webhook secret GitHub…).
 *
 * Thuật toán: AES-256-GCM. Định dạng lưu xuống DB (cột `encryptedCredentials`):
 *   v1:<iv base64>:<authTag base64>:<ciphertext base64>
 *
 * Khóa 32 byte được suy ra bằng SHA-256 từ:
 *   1. env INTEGRATION_ENCRYPTION_KEY (ưu tiên — nên đặt ở production), hoặc
 *   2. env JWT_SECRET (fallback dev để chạy được ngay trong monorepo hiện tại), hoặc
 *   3. hằng số dev không an toàn (chỉ để local không sập — TUYỆT ĐỐI không dùng production).
 *
 * Chỉ bản mã hóa được lưu DB; secret gốc không bao giờ xuất hiện trong response/log.
 */
const FORMAT_PREFIX = "v1";
const DEV_FALLBACK_MATERIAL = "gomly-dev-insecure-integration-key";

function encryptionKey(): Buffer {
  const material =
    process.env.INTEGRATION_ENCRYPTION_KEY ??
    process.env.JWT_SECRET ??
    DEV_FALLBACK_MATERIAL;
  return createHash("sha256").update(material).digest();
}

export function encryptSecret(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const cipherText = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    FORMAT_PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    cipherText.toString("base64"),
  ].join(":");
}

/** Giải mã chuỗi do encryptSecret tạo. Trả null nếu định dạng/khóa không khớp. */
export function decryptSecret(stored: string): string | null {
  try {
    const parts = stored.split(":");
    if (parts.length !== 4 || parts[0] !== FORMAT_PREFIX) return null;
    const iv = Buffer.from(parts[1], "base64");
    const authTag = Buffer.from(parts[2], "base64");
    const cipherText = Buffer.from(parts[3], "base64");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(cipherText),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
