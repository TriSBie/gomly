/**
 * Kiểm tra parity song ngữ VI/EN của Gomly web:
 * - Mọi khóa trong src/messages/vi.json phải có đúng 1 khóa tương ứng trong
 *   src/messages/en.json (và ngược lại).
 * - Không khóa nào được rỗng (chuỗi trống / chỉ khoảng trắng).
 * Chạy: node scripts/check-i18n.mjs  → exit 1 nếu lệch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const msgDir = path.resolve(here, "../src/messages");

function flat(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flat(v, key, out);
    else out[key] = v;
  }
  return out;
}

const vi = flat(JSON.parse(fs.readFileSync(path.join(msgDir, "vi.json"), "utf8")));
const en = flat(JSON.parse(fs.readFileSync(path.join(msgDir, "en.json"), "utf8")));

let fail = 0;
const onlyVi = Object.keys(vi).filter((k) => !(k in en));
const onlyEn = Object.keys(en).filter((k) => !(k in vi));
const emptyVi = Object.keys(vi).filter((k) => !String(vi[k]).trim());
const emptyEn = Object.keys(en).filter((k) => !String(en[k]).trim());

if (onlyVi.length) {
  fail++;
  console.log("Khóa chỉ có ở VI:", onlyVi);
}
if (onlyEn.length) {
  fail++;
  console.log("Khóa chỉ có ở EN:", onlyEn);
}
if (emptyVi.length) {
  fail++;
  console.log("Khóa rỗng ở VI:", emptyVi);
}
if (emptyEn.length) {
  fail++;
  console.log("Khóa rỗng ở EN:", emptyEn);
}

console.log(
  `i18n: vi=${Object.keys(vi).length} khóa, en=${Object.keys(en).length} khóa — ${
    fail ? "LỆCH" : "KHỚP 1-1, không khóa rỗng"
  }`,
);
process.exit(fail ? 1 : 0);
