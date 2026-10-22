import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HomeContent />;
}

function HomeContent() {
  const t = useTranslations("Home");
  const tagline = useTranslations()("Tagline");

  return (
    <div>
      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          margin: "0 0 8px",
        }}
      >
        Gomly
      </h1>
      <p style={{ color: "#9ba0aa", margin: "0 0 28px", fontSize: 16 }}>
        {tagline}
      </p>
      <section
        style={{
          border: "1px solid #1e2025",
          borderRadius: 10,
          padding: 20,
          background: "#0f1011",
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>{t("channelsTitle")}</h2>
        <p style={{ color: "#9ba0aa", margin: 0, lineHeight: 1.6 }}>
          {t("description")}
        </p>
      </section>
    </div>
  );
}
