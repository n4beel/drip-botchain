"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BaseError, type Address, type Hex } from "viem";
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import Panel from "@/components/ui/Panel";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import TxStatus, { type TxStage } from "@/components/ui/TxStatus";
import { useToast } from "@/components/ui/Toast";
import { activeBotChain, addressUrl, isBotChainId } from "@/lib/botchain/chain";
import { formatNativeAmount } from "@/lib/botchain/amount";
import { getDeployment, isDeployed } from "@/lib/botchain/deployment";
import { dripAbi } from "@/lib/botchain/abi";
import { progressBy, refundableBy, remaining, streamedBy, withdrawableBy, type Stream } from "@/lib/stream";

/**
 * Watch a stream, and act on it.
 *
 * The figure ticks locally on a one-second timer rather than polling the chain. A stream settles
 * by elapsed seconds, so a number that only moved when a block arrived would be stale almost all
 * the time — and `lib/stream.ts` reproduces the contract's integer maths exactly, so what is shown
 * is what a withdrawal would actually pay.
 */
function StreamBody() {
  const chainId = useChainId();
  const { address } = useAccount();
  const { toast } = useToast();
  const { writeContractAsync } = useWriteContract();
  const search = useSearchParams();
  const fromQuery = search.get("id") ?? "";

  const [typed, setTyped] = useState(fromQuery);
  const [stage, setStage] = useState<TxStage>("idle");
  const [hash, setHash] = useState<Hex | null>(null);
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)));

  useEffect(() => setTyped(fromQuery), [fromQuery]);

  // One tick a second. Cheap, and the only thing that makes a per-second product read as one.
  useEffect(() => {
    const timer = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000))), 1000);
    return () => clearInterval(timer);
  }, []);

  const id = /^\d+$/.test(typed.trim()) ? BigInt(typed.trim()) : null;
  const deployment = isBotChainId(chainId) ? getDeployment(chainId) : null;
  const ready = id !== null && isBotChainId(chainId) && isDeployed(chainId);

  const read = useReadContract({
    address: deployment?.address,
    abi: dripAbi,
    functionName: "streamOf",
    args: id !== null ? [id] : undefined,
    query: { enabled: ready },
  });

  const stream = read.data as Stream | undefined;
  const exists = stream && stream.stopTime > 0n;

  const receipt = useWaitForTransactionReceipt({ hash: hash ?? undefined, query: { enabled: Boolean(hash) } });
  const settled = useRef<Hex | null>(null);
  const refetch = read.refetch;

  useEffect(() => {
    if (!hash || settled.current === hash) return;
    if (!receipt.isSuccess && !receipt.isError) return;
    settled.current = hash;
    if (receipt.isSuccess) {
      setStage("confirmed");
      toast("success", "Done", "The stream has been updated.");
      void refetch();
    } else {
      setStage("failed");
      toast("error", "Transaction failed", "Nothing changed.");
    }
  }, [hash, receipt.isSuccess, receipt.isError, toast, refetch]);

  const act = useCallback(
    async (functionName: "withdraw" | "cancel", args: readonly unknown[]) => {
      if (!deployment || !isBotChainId(chainId)) return;
      setStage("signing");
      setHash(null);
      settled.current = null;
      try {
        const txHash = await writeContractAsync({
          address: deployment.address, abi: dripAbi, functionName, args: args as never, chainId,
        });
        setHash(txHash);
        setStage("pending");
      } catch (err) {
        setStage("idle");
        const message = err instanceof BaseError ? err.shortMessage : "Something went wrong.";
        if (/rejected|denied/i.test(message)) toast("info", "Cancelled", "Nothing was sent.");
        else toast("error", "Could not send", message);
      }
    },
    [deployment, chainId, writeContractAsync, toast],
  );

  const symbol = activeBotChain.nativeCurrency.symbol;
  const isRecipient = Boolean(address && stream && address.toLowerCase() === stream.recipient.toLowerCase());
  const isSender = Boolean(address && stream && address.toLowerCase() === stream.sender.toLowerCase());
  const withdrawable = stream ? withdrawableBy(stream, now) : 0n;
  const busy = stage === "signing" || stage === "pending";

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <Input label="Stream number" value={typed} onChange={(e) => setTyped(e.target.value)}
          placeholder="0" mono hint="No wallet needed to watch one." />
      </Panel>

      {ready && read.isLoading && <Panel><Spinner label="Reading the chain" /></Panel>}

      {ready && read.isError && (
        <Panel>
          <p className="text-[13px]" style={{ color: "var(--warning)" }}>
            Could not reach the chain. This is unknown, not missing — try again.
          </p>
        </Panel>
      )}

      {ready && read.isSuccess && !exists && (
        <Panel>
          <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
            No stream with that number.
          </p>
        </Panel>
      )}

      {ready && exists && stream && (
        <>
          <Panel>
            <div className="flex flex-col gap-5">
              <div>
                <p className="mono text-[11px] uppercase tracking-[0.08em] mb-2" style={{ color: "var(--text-tertiary)" }}>
                  {stream.cancelled ? "Cancelled" : now >= stream.stopTime ? "Finished" : "Streaming"}
                </p>
                {/* The live figure. Ticks every second because the contract settles every second. */}
                <p className="mono text-[34px] md:text-[42px] leading-none" style={{ color: "var(--accent)" }}>
                  {formatNativeAmount(streamedBy(stream, now), 8)}
                </p>
                <p className="mono text-[13px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                  of {formatNativeAmount(stream.deposit)} {symbol}
                  {!stream.cancelled && now < stream.stopTime && ` · ${remaining(stream, now)} left`}
                </p>
              </div>

              <div style={{ height: "4px", background: "var(--bg-elevated)" }}>
                <div style={{ height: "100%", width: `${progressBy(stream, now) * 100}%`, background: "var(--accent)" }} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mono text-[11px] uppercase tracking-[0.08em] mb-1" style={{ color: "var(--text-tertiary)" }}>From</p>
                  <a href={addressUrl(chainId, stream.sender)} target="_blank" rel="noreferrer"
                    className="mono text-[12px] break-all" style={{ color: isSender ? "var(--accent)" : "var(--text-secondary)" }}>
                    {stream.sender}{isSender ? " (you)" : ""}
                  </a>
                </div>
                <div>
                  <p className="mono text-[11px] uppercase tracking-[0.08em] mb-1" style={{ color: "var(--text-tertiary)" }}>To</p>
                  <a href={addressUrl(chainId, stream.recipient)} target="_blank" rel="noreferrer"
                    className="mono text-[12px] break-all" style={{ color: isRecipient ? "var(--accent)" : "var(--text-secondary)" }}>
                    {stream.recipient}{isRecipient ? " (you)" : ""}
                  </a>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 pt-1">
                <div>
                  <p className="mono text-[11px] uppercase tracking-[0.08em] mb-1" style={{ color: "var(--text-tertiary)" }}>Already withdrawn</p>
                  <p className="mono text-[14px]">{formatNativeAmount(stream.withdrawn)} {symbol}</p>
                </div>
                <div>
                  <p className="mono text-[11px] uppercase tracking-[0.08em] mb-1" style={{ color: "var(--text-tertiary)" }}>
                    {isSender && !stream.cancelled ? "Returns to you if cancelled now" : "Available to withdraw"}
                  </p>
                  <p className="mono text-[14px]" style={{ color: "var(--text-primary)" }}>
                    {formatNativeAmount(isSender && !stream.cancelled ? refundableBy(stream, now) : withdrawable)} {symbol}
                  </p>
                </div>
              </div>
            </div>
          </Panel>

          {(isRecipient || isSender) && !stream.cancelled && (
            <Panel>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {isRecipient && (
                    <Button disabled={busy || withdrawable === 0n} onClick={() => id !== null && act("withdraw", [id, withdrawable])}>
                      Withdraw {formatNativeAmount(withdrawable)} {symbol}
                    </Button>
                  )}
                  <Button variant="ghost" disabled={busy} onClick={() => id !== null && act("cancel", [id])}>
                    Cancel the stream
                  </Button>
                </div>
                <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                  Cancelling settles immediately: the recipient keeps everything streamed up to that
                  second, the sender gets the rest back. Either side may do it.
                </p>
                <TxStatus stage={stage} hash={hash} confirmedLabel="Done" failedLabel="Transaction failed — nothing changed." />
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

export default function StreamView() {
  return (
    <Suspense fallback={<Panel><Spinner label="Loading" /></Panel>}>
      <StreamBody />
    </Suspense>
  );
}
