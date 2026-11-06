"use client";
import { useCallback, useEffect, useState } from "react";
import { Wallet, LogOut, TriangleAlert } from "lucide-react";
import {
  connect,
  connectedAccount,
  currentChainId,
  onAccountsChanged,
  onChainChanged,
  shortAddress,
  switchNetwork,
  walletAvailable,
  NETWORK_NAMES,
  type WalletInfo,
} from "./wallet";

/**
 * Header wallet control.
 *
 * Read-only pages never depend on this component. Connecting grants no
 * spending authority: each transaction still needs its own approval prompt.
 */
export default function WalletButton({
  onWallet,
}: {
  onWallet?: (wallet: WalletInfo | null) => void;
}) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const publish = useCallback(
    (next: WalletInfo | null) => {
      setWallet(next);
      onWallet?.(next);
    },
    [onWallet],
  );

  useEffect(() => {
    setAvailable(walletAvailable());
    // Silent reconnect: only if this site was already authorized. This never
    // opens a prompt.
    connectedAccount().then(async (address) => {
      if (!address) return;
      const chainId = (await currentChainId()) ?? 0;
      publish({ address, chainId });
    });
    const stopAccounts = onAccountsChanged((address) => {
      if (!address) publish(null);
      else
        currentChainId().then((chainId) =>
          publish({ address, chainId: chainId ?? 0 }),
        );
    });
    const stopChain = onChainChanged((chainId) =>
      setWallet((current) => {
        if (!current) return current;
        const next = { ...current, chainId };
        onWallet?.(next);
        return next;
      }),
    );
    return () => {
      stopAccounts();
      stopChain();
    };
  }, [publish, onWallet]);

  async function start() {
    setError("");
    setBusy(true);
    try {
      publish(await connect());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (available === false)
    return (
      <span className="wallet-hint" title="Install MetaMask or another EVM wallet">
        No wallet
      </span>
    );

  if (!wallet)
    return (
      <div className="wallet-control">
        <button
          className="quiet wallet-button"
          onClick={start}
          disabled={busy}
          type="button"
        >
          <Wallet size={15} />
          {busy ? "Connecting…" : "Connect wallet"}
        </button>
        {error && (
          <span className="wallet-error" role="alert">
            <TriangleAlert size={13} /> {error}
          </span>
        )}
      </div>
    );

  const known = NETWORK_NAMES[wallet.chainId];
  return (
    <div className="wallet-control">
      <span className="wallet-chip" title={"Connected " + wallet.address}>
        <span className="wallet-dot" aria-hidden="true" />
        {shortAddress(wallet.address)}
      </span>
      <button
        className={
          "quiet wallet-button wallet-net" +
          (known ? "" : " wallet-net--unsupported")
        }
        type="button"
        title={
          known
            ? "Switch your wallet to another supported network"
            : "This network is not one Klyro supports"
        }
        onClick={async () => {
          setError("");
          const target = wallet.chainId === 11155111 ? 1 : 11155111;
          try {
            await switchNetwork(target);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {known ?? "Chain " + wallet.chainId}
        {!known && <TriangleAlert size={13} />}
      </button>
      <button
        className="icon-button"
        title="Disconnect in Klyro (your wallet keeps the site authorization)"
        aria-label="Disconnect wallet"
        type="button"
        onClick={() => {
          publish(null);
          setError("");
        }}
      >
        <LogOut size={15} />
      </button>
      {error && (
        <span className="wallet-error" role="alert">
          <TriangleAlert size={13} /> {error}
        </span>
      )}
    </div>
  );
}
