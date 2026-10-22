import { setRequestLocale } from "next-intl/server";
import IssuesClient from "@/components/IssuesClient";

export default async function IssuesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <IssuesClient />;
}
