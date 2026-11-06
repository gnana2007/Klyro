"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Wallet, LogOut, TriangleAlert, ChevronDown, Check } from "lucide-react";
import {
  connect,
  connectedAccount,
  currentChainId,
  onAccountsChanged,
  onChainChanged,
  shortAddress,
  switchNetwork,
  discoverWallets,
  selectWallet,
  networkName,
  isSupportedNetwork,
  NETWORKS,
  type WalletInfo,
} from "./wallet";

/**
 * Header wallet control.
 *
 * Read-only pages never depend on this component: scanning, analysis, history
 * and passports all work with no wallet at all. A connection grants no spending
 * authority — every deployment or publication still raises its own approval
 * prompt in the wallet, and this module never asks for a key or a phrase.
 */
export default function WalletButton({
  onWallet,
}: {
  onWallet?: (wallet: WalletInfo | null) => void;
}) {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [installHint, setInstallHint] = useState(false);
  const [error, setError] = useState("");
  const control = useRef<HTMLDivElement | null>(null);

  const publish = useCallback(
    (next: WalletInfo | null) => {
      setWallet(next);
      // Other views (Operate) read the same state instead of holding a second
      // copy that could disagree with the header.
      if (typeof window !== "undefined")
        (window as unknown as { klyroWallet?: WalletInfo | null }).klyroWallet =
          next;
      window.dispatchEvent(new Event("klyro:wallet"));
      onWallet?.(next);
    },
    [onWallet],
  );

  useEffect(() => {
    // Detection runs after mount because there is no window during SSR. Some
    // wallets inject slightly after first paint, so discovery waits briefly.
    let live = true;
    discoverWallets().then((wallets) => {
      if (live) setAvailable(wallets.length > 0);
    });
    // Silent reconnect: only when this site was already authorized for the
    // account. This never opens a prompt.
    connectedAccount().then(async (address) => {
      if (!live || !address) return;
      const chainId = (await currentChainId()) ?? 0;
      publish({ address, chainId });
    });
    const stopAccounts = onAccountsChanged((address) => {
      // Switching or locking an account in the wallet updates the header, and a
      // locked wallet clears it rather than showing a stale address.
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
        (window as unknown as { klyroWallet?: WalletInfo | null }).klyroWallet =
          next;
        window.dispatchEvent(new Event("klyro:wallet"));
        onWallet?.(next);
        return next;
      }),
    );
    return () => {
      live = false;
      stopAccounts();
      stopChain();
    };
  }, [publish, onWallet]);

  // Close the network menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!control.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function start() {
    setError("");
    setInstallHint(false);
    const wallets = await discoverWallets();
    setAvailable(wallets.length > 0);
    if (!wallets.length) {
      // No injected provider: never dead-end on "No wallet". Explain what to
      // install and keep everything else usable.
      setInstallHint(true);
      return;
    }
    // With several wallets installed the user chooses; with one this is a
    // no-op.
    if (wallets.length > 1 && wallets.find((w) => w.info.name === "MetaMask"))
      selectWallet(wallets.find((w) => w.info.name === "MetaMask")!.info.uuid);
    setBusy(true);
    try {
      publish(await connect());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeNetwork(chainId: number) {
    setError("");
    setSwitching(true);
    try {
      await switchNetwork(chainId);
      // The wallet may or may not emit chainChanged after a switch; reading the
      // chain back keeps the header truthful either way.
      const live = await currentChainId();
      if (live !== null && wallet) publish({ ...wallet, chainId: live });
      setMenuOpen(false);
    } catch (e) {
      setError((e as Error).message);
      setMenuOpen(false);
    } finally {
      setSwitching(false);
    }
  }

  if (available === false || installHint)
    return (
      <div className="wallet-control" ref={control}>
        <button className="quiet wallet-button" type="button" onClick={start}>
          <Wallet size={15} />
          Connect wallet
        </button>
        {installHint && (
          <span className="wallet-error" role="status">
            <TriangleAlert size={13} />
            <span>
              No browser wallet detected.{" "}
              <a href="https://metamask.io/" target="_blank" rel="noreferrer">
                Install MetaMask
              </a>{" "}
              (or another EVM wallet) and reload. Scanning works without one.
            </span>
          </span>
        )}
        {error && (
          <span className="wallet-error" role="alert">
            <TriangleAlert size={13} /> {error}
          </span>
        )}
      </div>
    );

  if (!wallet)
    return (
      <div className="wallet-control" ref={control}>
        <button
          className="quiet wallet-button"
          onClick={start}
          disabled={busy || available === null}
          type="button"
        >
          <Wallet size={15} />
          {busy
            ? "Connecting…"
            : available === null
              ? "Connect wallet"
              : "Connect wallet"}
        </button>
        {error && (
          <span className="wallet-error" role="alert">
            <TriangleAlert size={13} /> {error}
          </span>
        )}
      </div>
    );

  const supported = isSupportedNetwork(wallet.chainId);
  return (
    <div className="wallet-control" ref={control}>
      <span
        className="wallet-chip"
        title={"Connected as " + wallet.address}
        aria-label={"Connected wallet " + wallet.address}
      >
        <span className="wallet-dot" aria-hidden="true" />
        {shortAddress(wallet.address)}
      </span>
      <div className="wallet-net-wrap">
        <button
          className={
            "quiet wallet-button wallet-net" + (supported ? "" : " wallet-net--unsupported")
          }
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={
            supported
              ? "Current network: " + networkName(wallet.chainId)
              : "This network is not one Klyro supports"
          }
          onClick={() => setMenuOpen((open) => !open)}
          disabled={switching}
        >
          {!supported && <TriangleAlert size={13} />}
          {switching ? "Switching…" : networkName(wallet.chainId)}
          <ChevronDown size={13} />
        </button>
        {menuOpen && (
          <div className="wallet-menu" role="menu" aria-label="Switch network">
            <span className="wallet-menu-title">Switch network</span>
            {NETWORKS.map((n) => (
              <button
                key={n.id}
                role="menuitem"
                type="button"
                className="wallet-menu-item"
                aria-current={n.id === wallet.chainId}
                onClick={() => changeNetwork(n.id)}
              >
                <span>{n.name}</span>
                <span className="wallet-menu-meta">
                  {n.id === wallet.chainId ? (
                    <Check size={14} />
                  ) : (
                    "Chain " + n.id
                  )}
                </span>
              </button>
            ))}
            <span className="wallet-menu-note">
              Your wallet asks for confirmation. Klyro never switches your
              network on its own.
            </span>
          </div>
        )}
      </div>
      <button
        className="icon-button"
        title="Disconnect Klyro from this wallet"
        aria-label="Disconnect wallet"
        type="button"
        onClick={() => {
          publish(null);
          setMenuOpen(false);
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
