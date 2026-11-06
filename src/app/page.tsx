import { redirect } from "next/navigation";
import Landing from "@/components/landing";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (params.scan || params.view || params.tab) {
    const query = new URLSearchParams();
    for (const key of ["scan", "view", "tab"])
      if (typeof params[key] === "string") query.set(key, params[key]);
    redirect("/app?" + query.toString());
  }
  return <Landing />;
}
