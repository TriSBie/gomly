import { setRequestLocale } from "next-intl/server";
import CyclesClient from "@/components/CyclesClient";

export default async function CyclesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CyclesClient />;
}
