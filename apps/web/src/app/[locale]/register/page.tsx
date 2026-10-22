import { setRequestLocale } from "next-intl/server";
import AuthForm from "@/components/AuthForm";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AuthForm mode="register" />;
}
