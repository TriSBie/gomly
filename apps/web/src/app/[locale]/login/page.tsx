import { setRequestLocale } from "next-intl/server";
import AuthForm from "@/components/AuthForm";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AuthForm mode="login" />;
}
