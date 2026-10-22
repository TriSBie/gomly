import { setRequestLocale } from "next-intl/server";
import ProjectDetailClient from "@/components/ProjectDetailClient";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <ProjectDetailClient projectId={id} />;
}
