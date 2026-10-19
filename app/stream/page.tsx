import PageShell from "@/components/layout/PageShell";
import StreamView from "@/components/drip/StreamView";
import { NAV } from "@/lib/nav";

export const metadata = {
  title: "View a stream — Drip",
  description: "Watch a BOT Chain stream pay out by the second. No wallet needed.",
};

export default function StreamPage() {
  return (
    <PageShell nav={NAV} title="A stream, live" description="Enter its number. The figure moves every second, because the contract does.">
      <StreamView />
    </PageShell>
  );
}
