import { setRequestLocale } from "next-intl/server";
import IssueDetailClient from "@/components/IssueDetailClient";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <IssueDetailClient issueId={id} />;
}
