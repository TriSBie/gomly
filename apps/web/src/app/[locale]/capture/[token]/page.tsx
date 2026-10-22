import { setRequestLocale } from "next-intl/server";
import CapturePublicClient from "@/components/CapturePublicClient";

export default async function CapturePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  return <CapturePublicClient token={token} />;
}
