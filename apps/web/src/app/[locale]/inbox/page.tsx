import { setRequestLocale } from "next-intl/server";
import InboxClient from "@/components/InboxClient";

export default async function InboxPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <InboxClient />;
}
