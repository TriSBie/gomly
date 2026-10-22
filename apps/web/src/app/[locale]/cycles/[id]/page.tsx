import { setRequestLocale } from "next-intl/server";
import CycleDetailClient from "@/components/CycleDetailClient";

export default async function CycleDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <CycleDetailClient cycleId={id} />;
}
