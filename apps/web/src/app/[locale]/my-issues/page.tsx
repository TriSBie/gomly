import { setRequestLocale } from "next-intl/server";
import MyIssuesClient from "@/components/MyIssuesClient";

export default async function MyIssuesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MyIssuesClient />;
}
