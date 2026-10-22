import { setRequestLocale } from "next-intl/server";
import TriageClient from "@/components/TriageClient";

export default async function TriagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TriageClient />;
}
