"use client";

/**
 * Minimal injected-wallet client.
 *
 * Scope is deliberate: Klyro needs a wallet only for two operator actions that
 * the user must approve in their own wallet — deploying the report registry and
 * publishing a report to it. Everything else (scanning, analysis, history) is
 * read-only and must keep working with no wallet at all.
 *
 * Rules this module follows:
 * - It never asks for, stores or transmits a private key or recovery phrase.
 *   The provider is the browser's injected wallet (MetaMask and compatible).
 * - A connection carries no spending authority on its own. Every transaction
 *   goes through `writeContract`, which returns the moment the wallet pops up
 *   its own approval prompt; the app cannot sign or send anything silently.
 * - A rejected prompt is a normal outcome, reported as such, not as an error
 *   in the app.
 */

export type WalletInfo = {
  address: `0x${string}`;
  chainId: number;
};

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
};

/**
 * The networks Klyro can read and scan. These are the only ids the server
 * accepts, so the same table is used to label the wallet chip and to build the
 * switch-network menu. A wallet on any other chain is shown as unsupported
 * rather than silently relabelled.
 */
export const NETWORKS: { id: number; name: string; short: string }[] = [
  { id: 1, name: "Ethereum Mainnet", short: "Ethereum" },
  { id: 11155111, name: "Sepolia", short: "Sepolia" },
  { id: 8453, name: "Base Mainnet", short: "Base" },
  { id: 31337, name: "Local Anvil", short: "Anvil" },
];

export const NETWORK_NAMES: Record<number, string> = Object.fromEntries(
  NETWORKS.map((n) => [n.id, n.short]),
);

export function networkName(chainId: number | null | undefined) {
  if (chainId === null || chainId === undefined) return "Unknown network";
  return NETWORK_NAMES[chainId] ?? "Chain " + chainId;
}

export function isSupportedNetwork(chainId: number | null | undefined) {
  return chainId !== null && chainId !== undefined && chainId in NETWORK_NAMES;
}

function legacyProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193Provider }).ethereum ?? null;
}

/** A wallet announced through EIP-6963. */
export type DiscoveredWallet = {
  info: { uuid: string; name: string; icon?: string; rdns?: string };
  provider: Eip1193Provider;
};

let discovered: DiscoveredWallet[] = [];

/**
 * Discover injected wallets.
 *
 * `window.ethereum` only exposes one provider, so a user with two wallets
 * installed (or a wallet that injects late) can end up with no usable provider
 * and a dead "Connect" button. EIP-6963 fixes that with an event-based
 * handshake; the legacy property stays as a fallback for wallets that do not
 * implement it.
 */
export function discoverWallets(timeoutMs = 300): Promise<DiscoveredWallet[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  return new Promise((resolve) => {
    const found = new Map<string, DiscoveredWallet>();
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent).detail as DiscoveredWallet | undefined;
      if (detail?.info?.uuid && detail.provider)
        found.set(detail.info.uuid, detail);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      discovered = [...found.values()];
      if (!discovered.length && legacyProvider())
        discovered = [
          {
            info: { uuid: "legacy", name: "Injected wallet" },
            provider: legacyProvider()!,
          },
        ];
      resolve(discovered);
    }, timeoutMs);
  });
}

let selectedUuid: string | null = null;

/** Pick which discovered wallet the app talks to. */
export function selectWallet(uuid: string) {
  selectedUuid = uuid;
}

export function selectedWallet(): DiscoveredWallet | null {
  return (
    discovered.find((w) => w.info.uuid === selectedUuid) ??
    discovered[0] ??
    null
  );
}

export function walletProvider(): Eip1193Provider | null {
  return selectedWallet()?.provider ?? legacyProvider();
}

// Kept for callers that only need a yes/no answer.
export function walletAvailable() {
  return walletProvider() !== null;
}

/** True when the user has already authorized this site in the wallet. */
export async function connectedAccount(): Promise<`0x${string}` | null> {
  const p = walletProvider();
  if (!p) return null;
  try {
    const accounts = (await p.request({ method: "eth_accounts" })) as string[];
    return (accounts?.[0] as `0x${string}`) ?? null;
  } catch {
    return null;
  }
}

/**
 * Ask the wallet for permission to read the account. This is the only prompt
 * that is not a transaction, and the user can decline it safely.
 */
export async function connect(): Promise<WalletInfo> {
  const p = walletProvider();
  if (!p)
    throw new Error(
      "No browser wallet detected. Install MetaMask (or another EVM wallet) and reload this page.",
    );
  let accounts: string[];
  try {
    accounts = (await p.request({ method: "eth_requestAccounts" })) as string[];
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 4001)
      throw new Error("You rejected the connection request in your wallet.");
    throw new Error(
      "The wallet could not connect. Unlock it and try again.",
    );
  }
  if (!accounts?.length)
    throw new Error("The wallet returned no account.");
  const chainId = Number(
    (await p.request({ method: "eth_chainId" })) as string,
  );
  return { address: accounts[0] as `0x${string}`, chainId };
}

export async function currentChainId(): Promise<number | null> {
  const p = walletProvider();
  if (!p) return null;
  try {
    return Number((await p.request({ method: "eth_chainId" })) as string);
  } catch {
    return null;
  }
}

/**
 * Ask the wallet to switch network. The app never makes this call on its own:
 * a surprise network prompt is confusing, so the operator clicks it.
 */
export async function switchNetwork(chainId: number): Promise<void> {
  const p = walletProvider();
  if (!p) throw new Error("No browser wallet detected.");
  try {
    await p.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + chainId.toString(16) }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 4001)
      throw new Error("You declined the network switch in your wallet.");
    if (code === 4902)
      throw new Error(
        "Your wallet does not have " +
          (NETWORK_NAMES[chainId] || "chain " + chainId) +
          " added. Add that network in your wallet, then try again.",
      );
    throw new Error("The wallet could not switch network.");
  }
}

export function onAccountsChanged(handler: (account: `0x${string}` | null) => void) {
  const p = walletProvider();
  if (!p?.on) return () => {};
  const listener = (...args: unknown[]) => {
    const accounts = args[0] as string[] | undefined;
    handler((accounts?.[0] as `0x${string}`) ?? null);
  };
  p.on("accountsChanged", listener);
  return () => p.removeListener?.("accountsChanged", listener);
}

export function onChainChanged(handler: (chainId: number) => void) {
  const p = walletProvider();
  if (!p?.on) return () => {};
  const listener = (...args: unknown[]) => handler(Number(args[0]));
  p.on("chainChanged", listener);
  return () => p.removeListener?.("chainChanged", listener);
}

/**
 * Send one contract transaction through the wallet.
 *
 * `eth_sendTransaction` resolves with a transaction hash only after the user
 * approves the prompt in their wallet. A rejection (code 4001) is surfaced as
 * a plain sentence. The caller still has to wait for the receipt to claim
 * success — a hash is not a confirmation.
 */
export async function writeContract(params: {
  abi: unknown;
  address: `0x${string}`;
  functionName: string;
  args: unknown[];
  from: `0x${string}`;
  chainId: number;
  value?: bigint;
}): Promise<`0x${string}`> {
  const p = walletProvider();
  if (!p) throw new Error("No browser wallet detected.");
  const live = await currentChainId();
  if (live !== params.chainId)
    throw new Error(
      "Your wallet is on " +
        (live ? NETWORK_NAMES[live] || "chain " + live : "an unknown network") +
        ". Switch it to " +
        (NETWORK_NAMES[params.chainId] || "chain " + params.chainId) +
        " before sending.",
    );
  try {
    return (await p.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: params.from,
          to: params.address,
          data: encodeCall(params.abi, params.functionName, params.args),
          ...(params.value ? { value: "0x" + params.value.toString(16) } : {}),
        },
      ],
    })) as `0x${string}`;
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 4001)
      throw new Error("You rejected the transaction in your wallet.");
    const message = error instanceof Error ? error.message : "";
    throw new Error(
      "The wallet could not send the transaction" +
        (message ? ": " + message.slice(0, 200) : "."),
    );
  }
}

// Encoding the calldata here (rather than importing an encoder into the
// browser bundle at module scope) keeps this file small; viem's encoder is
// loaded on demand because only deploy/publish needs it.
async function encodeCall(abi: unknown, functionName: string, args: unknown[]) {
  const { encodeFunctionData } = await import("viem");
  return encodeFunctionData({
    abi: abi as readonly unknown[],
    functionName,
    args,
  } as Parameters<typeof encodeFunctionData>[0]);
}

export function shortAddress(address: string) {
  return address.slice(0, 6) + "…" + address.slice(-4);
}
