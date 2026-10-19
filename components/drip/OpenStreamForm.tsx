"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BaseError, ContractFunctionRevertedError, decodeEventLog, isAddress, type Address, type Hex } from "viem";
import { useAccount, useBalance, useChainId, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import Panel from "@/components/ui/Panel";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import TxStatus, { type TxStage } from "@/components/ui/TxStatus";
import { useToast } from "@/components/ui/Toast";
import { activeBotChain, isBotChainId } from "@/lib/botchain/chain";
import { formatNativeAmount, parseNativeAmount } from "@/lib/botchain/amount";
import { getDeployment } from "@/lib/botchain/deployment";
import { dripAbi } from "@/lib/botchain/abi";

const DURATIONS = [
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86400 },
  { label: "1 week", seconds: 604800 },
  { label: "30 days", seconds: 2592000 },
];

/**
 * Open a stream.
 *
 * Duration is chosen rather than typed as a timestamp. A stop time is what the contract takes,
 * but nobody thinks in epoch seconds, and a mistyped one either reverts or opens a stream that
 * finishes in the year 2106 — so the UI converts and shows the resulting per-second rate, which
 * is the number a payer actually wants to sanity-check.
 */
export default function OpenStreamForm() {
  const chainId = useChainId();
  const { address } = useAccount();
  const { toast } = useToast();
  const { writeContractAsync } = useWriteContract();
  const { data: balance } = useBalance({ address, query: { enabled: Boolean(address) } });

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [seconds, setSeconds] = useState(86400);
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState<Hex | null>(null);
  const [streamId, setStreamId] = useState<bigint | null>(null);

  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : null;
  const parsed = parseNativeAmount(amount);
  const symbol = activeBotChain.nativeCurrency.symbol;

  const recipientProblem = useMemo(() => {
    const v = recipient.trim();
    if (v === "") return undefined;
    if (!isAddress(v)) return "Not an address.";
    if (address && v.toLowerCase() === address.toLowerCase()) return "A stream cannot pay its own sender.";
    return undefined;
  }, [recipient, address]);

  const insufficient = balance !== undefined && parsed !== null && parsed > balance.value;
  const perSecond = parsed !== null ? parsed / BigInt(seconds) : null;

  const receipt = useWaitForTransactionReceipt({ hash: hash ?? undefined, query: { enabled: Boolean(hash) } });
  const settled = useRef<Hex | null>(null);

  useEffect(() => {
    if (!hash || settled.current === hash) return;
    if (!receipt.isSuccess && !receipt.isError) return;
    settled.current = hash;

    if (receipt.isError) {
      setStage("failed");
      toast("error", "Could not open the stream", "Nothing was sent.");
      return;
    }
    let id: bigint | null = null;
    for (const log of receipt.data?.logs ?? []) {
      try {
        const parsedLog = decodeEventLog({ abi: dripAbi, ...log });
        if (parsedLog.eventName === "StreamOpened") id = parsedLog.args.id;
      } catch {
        // Not our log.
      }
    }
    setStreamId(id);
    setStage("confirmed");
    toast("success", "Stream open", "It is paying out every second from now.");
  }, [hash, receipt.isSuccess, receipt.isError, receipt.data, toast]);

  const handleOpen = useCallback(async () => {
    if (!deployment || !isBotChainId(chainId) || parsed === null || recipientProblem || insufficient) return;
    if (!isAddress(recipient.trim())) return;

    setStage("signing");
    setHash(null);
    setStreamId(null);
    settled.current = null;

    const stopTime = BigInt(Math.floor(Date.now() / 1000) + seconds);

    try {
      const txHash = await writeContractAsync({
        address: deployment.address,
        abi: dripAbi,
        functionName: "open",
        args: [recipient.trim() as Address, stopTime],
        value: parsed,
        chainId,
      });
      setHash(txHash);
      setStage("pending");
    } catch (err) {
      setStage("idle");
      const reverted = err instanceof BaseError ? err.walk((e) => e instanceof ContractFunctionRevertedError) : null;
      if (reverted instanceof ContractFunctionRevertedError) {
        toast("error", "Refused", reverted.data?.errorName ?? "The contract did not say why.");
        return;
      }
      const message = err instanceof BaseError ? err.shortMessage : "Something went wrong.";
      if (/rejected|denied/i.test(message)) toast("info", "Cancelled", "Nothing was sent.");
      else toast("error", "Could not open", message);
    }
  }, [deployment, chainId, parsed, recipient, recipientProblem, insufficient, seconds, writeContractAsync, toast]);

  if (stage === "confirmed") {
    return (
      <Panel>
        <div className="flex flex-col gap-4">
          <TxStatus stage="confirmed" hash={hash} confirmedLabel="Stream open" />
          {streamId !== null && (
            <>
              <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
                Stream <span className="mono">#{streamId.toString()}</span> is paying{" "}
                {formatNativeAmount(parsed ?? 0n)} {symbol} over {DURATIONS.find((d) => d.seconds === seconds)?.label}.
              </p>
              <Link href={`/stream?id=${streamId}`} className="text-[13px] underline" style={{ color: "var(--accent)" }}>
                Watch it
              </Link>
            </>
          )}
          <Button variant="ghost" onClick={() => { setStage("idle"); setHash(null); setRecipient(""); setAmount(""); }}>
            Open another
          </Button>
        </div>
      </Panel>
    );
  }

  const busy = stage === "signing" || stage === "pending";
  const ready = parsed !== null && !recipientProblem && isAddress(recipient.trim()) && !insufficient;

  return (
    <Panel>
      <div className="flex flex-col gap-5">
        <Input label="Recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)}
          placeholder="0x…" mono disabled={busy} error={recipientProblem} />

        <Input label={`Total (${symbol})`} value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="10" mono disabled={busy}
          error={amount.trim() !== "" && parsed === null ? "Not an amount this app will send." : insufficient ? "More than you hold." : undefined}
          hint={!insufficient && parsed !== null ? `${formatNativeAmount(parsed)} ${symbol} locked up front` : undefined} />

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-secondary)" }}>
            Over
          </span>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button key={d.seconds} onClick={() => setSeconds(d.seconds)} disabled={busy}
                className="mono px-3 py-2 text-[12px]"
                style={{
                  border: `1px solid ${seconds === d.seconds ? "var(--accent)" : "var(--border-default)"}`,
                  color: seconds === d.seconds ? "var(--accent)" : "var(--text-secondary)",
                  background: "transparent", cursor: "pointer", borderRadius: "2px",
                }}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {perSecond !== null && perSecond > 0n && (
          <p className="mono text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            ≈ {formatNativeAmount(perSecond, 12)} {symbol} per second
          </p>
        )}

        {stage === "idle" || stage === "failed" ? (
          <Button onClick={handleOpen} disabled={!ready}>Open the stream</Button>
        ) : null}

        <TxStatus stage={stage} hash={hash} failedLabel="Could not open the stream — nothing was sent." />

        <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          The whole amount is locked now and released by the second. Either side can cancel: the
          recipient keeps what has streamed so far, and the rest returns to you. Nothing is stuck.
        </p>
      </div>
    </Panel>
  );
}
