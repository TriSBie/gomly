import { setRequestLocale } from "next-intl/server";
import MembersClient from "@/components/MembersClient";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MembersClient />;
}
