import PassportView from "@/components/passport";
import { Brand } from "@/components/brand";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="report-page">
      <header className="report-nav">
        <a href="/">
          <Brand />
        </a>
        <a href="/app?view=passports">Open workbench</a>
      </header>
      <main id="main" className="container">
        <PassportView id={id} />
      </main>
    </div>
  );
}
