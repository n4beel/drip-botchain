"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";

export type NavItem = { href: string; label: string };

interface PageShellProps {
  children: React.ReactNode;
  nav?: NavItem[];
  title?: string;
  description?: string;
}

/**
 * Ticker shell: a thin live bar over a full-width surface.
 *
 * The flowing rule under the header is the one ornament in this project, and it earns its place:
 * a stream is the only thing here that changes while you look at it, and a page that looks static
 * misrepresents that. It stops entirely under `prefers-reduced-motion`.
 */
export default function PageShell({ children, nav = [], title, description }: PageShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col" style={{ minHeight: "100dvh" }}>
      <header className="flex-shrink-0 sticky top-0 z-30" style={{ background: "rgba(7,16,15,0.94)", backdropFilter: "blur(6px)" }}>
        <div className="flex items-center gap-4 px-4 md:px-7 h-14">
          <Link href="/" className="flex items-center gap-2.5 no-underline flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 2 C10 2 4 9 4 13 a6 6 0 0 0 12 0 C16 9 10 2 10 2 Z" fill="var(--accent)" />
            </svg>
            <span className="text-[17px] font-semibold tracking-[-0.03em]">{app.name}</span>
          </Link>

          {nav.length > 1 && (
            <nav className="flex items-center gap-4 overflow-x-auto">
              {nav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className="nav-link text-[13px] no-underline whitespace-nowrap"
                    style={{ color: active ? "var(--accent)" : "var(--text-tertiary)" }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="flex-1" />
          <NetworkBadge />
          <div className="w-[150px] md:w-[170px] flex-shrink-0"><ConnectButton /></div>
        </div>
        <div className="flowline" aria-hidden="true" />
      </header>

      <main className="flex-1 w-full mx-auto px-4 md:px-7 py-8" style={{ maxWidth: "960px" }}>
        {title && <h1 className="text-[28px] md:text-[32px]" style={{ color: "var(--text-primary)" }}>{title}</h1>}
        {description && (
          <p className="mt-2 text-[14px]" style={{ color: "var(--text-secondary)", maxWidth: "64ch" }}>
            {description}
          </p>
        )}
        <div className={title || description ? "mt-7" : ""}>{children}</div>
      </main>

      <footer className="flex-shrink-0 w-full mx-auto px-4 md:px-7 py-6 flex flex-wrap items-center gap-x-5 gap-y-2" style={{ maxWidth: "960px", borderTop: "1px solid var(--border-subtle)" }}>
        <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{app.tagline}</span>
        <div className="flex-1" />
        <BuiltOnBotChain className="text-[12px]" style={{ color: "var(--text-secondary)" }} />
        <a href="https://botchain.ai" target="_blank" rel="noreferrer" className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>botchain.ai</a>
        <a href="https://scan.botchain.ai" target="_blank" rel="noreferrer" className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>BOT Chain Explorer</a>
      </footer>
    </div>
  );
}
