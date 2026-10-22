import { setRequestLocale } from "next-intl/server";
import ProjectsClient from "@/components/ProjectsClient";

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ProjectsClient />;
}
