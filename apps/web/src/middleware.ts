import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Bỏ qua API routes, file tĩnh và file có đuôi mở rộng
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
