import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import OpenStreamForm from "@/components/drip/OpenStreamForm";
import { NAV } from "@/lib/nav";

export default function Home() {
  return (
    <PageShell
      nav={NAV}
      title="Pay by the second"
      description="Lock an amount, name a recipient, choose how long. It releases continuously from the moment you sign, and either side can stop it."
    >
      <BotChainGate noWalletNote="You can watch any stream here without a wallet; opening one needs a wallet to sign.">
        <OpenStreamForm />
      </BotChainGate>
    </PageShell>
  );
}
