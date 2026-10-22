"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default function LanguageSwitcher() {
  const t = useTranslations("Locale");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(next: Locale) {
    if (next !== locale) {
      router.replace(pathname, { locale: next });
    }
  }

  return (
    <div
      aria-label={t("label")}
      style={{ display: "flex", gap: 4, alignItems: "center" }}
    >
      {(["vi", "en"] as Locale[]).map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          aria-pressed={l === locale}
          style={{
            background: l === locale ? "#5e6ad2" : "transparent",
            color: l === locale ? "#fff" : "#9ba0aa",
            border: "1px solid #26282e",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            textTransform: "uppercase",
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
