# Frontend Implementation Guide — Stellar Casino

This document describes exactly what the backend exposes today and how the frontend should be built against it.

---

## Part 1 — What the Backend Provides

### REST API

Base URL: `http://localhost:3001`

#### `GET /health`
```json
{ "status": "ok" }
```

#### `GET /api/leaderboard`
Returns top 20 players ordered by `total_wagered`.
```json
[
  { "wallet_address": "G...", "vip_level": 0, "total_wagered": "1500.0000000" }
]
```

#### `GET /api/players/:address`
Returns player profile + aggregate stats.
```json
{
  "id": 1,
  "wallet_address": "G...",
  "vip_level": 0,
  "total_wagered": "500.0000000",
  "created_at": "2026-05-15T15:00:00Z",
  "stats": {
    "total_bets": "42",
    "wins": "20",
    "losses": "22",
    "total_payout": "480.0000000"
  }
}
```
Returns `404 { "error": "Player not found" }` if address has never played.

#### `GET /api/bets`
Query params: `address` (optional), `game` (optional, `"coinflip"` or `"dice"`), `limit` (optional, default 50, max 200).
```json
[
  {
    "id": 1,
    "wallet_address": "G...",
    "game": "dice",
    "amount": "10.0000000",
    "prediction": 60,
    "result": 42,
    "payout": "16.5000000",
    "won": true,
    "nonce": 7,
    "created_at": "2026-05-15T15:10:00Z"
  }
]
```

#### `GET /api/jackpots`
Returns last 10 jackpot events.
```json
[
  { "id": 1, "pool_size": "5000.0000000", "winner": "G...", "created_at": "..." }
]
```

---

### WebSocket

Connect to `ws://localhost:3002`. The server pushes JSON events — no subscription message needed.

#### `bet_resolved`
Emitted after every resolved bet (coinflip or dice).
```json
{
  "type": "bet_resolved",
  "contract": "dice",
  "player": "G...",
  "won": true,
  "roll": 42,
  "ledger": 12345
}
```
For coinflip, `roll` is `0` (tails) or `1` (heads) instead of a 1–100 value.

#### `jackpot_won`
```json
{
  "type": "jackpot_won",
  "winner": "G...",
  "amount": "5000.0000000",
  "ledger": 12346
}
```

---

### What the Backend Does NOT Expose (frontend must do directly)

The backend has no endpoint for placing bets or depositing funds. Those are **player-signed transactions** sent directly to Soroban contracts via the player's wallet. See Part 2.

---

## Part 2 — Frontend Implementation

### Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Wallet | `@stellar/freighter-api` |
| Blockchain SDK | `@stellar/stellar-sdk` v12 |
| State | Zustand |
| Data fetching | TanStack Query (React Query) |
| Styling | Tailwind CSS |
| WebSocket | Native browser `WebSocket` |

### Environment Variables

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3002
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
NEXT_PUBLIC_TREASURY_CONTRACT_ID=C...
NEXT_PUBLIC_COINFLIP_CONTRACT_ID=C...
NEXT_PUBLIC_DICE_CONTRACT_ID=C...
```

---

### Pages / Routes

```
/                  → lobby (game cards)
/dice              → dice game
/coinflip          → coinflip game
/leaderboard       → leaderboard table
/players/[address] → player profile
/bets              → bet history (filterable)
/jackpots          → jackpot history + live feed
```

---

### Wallet Connection

Use `@stellar/freighter-api`. Wrap in a Zustand store so wallet state is global.

```ts
// store/wallet.ts
import { create } from "zustand";
import { getPublicKey, isConnected } from "@stellar/freighter-api";

type WalletStore = {
  address: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
};

export const useWallet = create<WalletStore>((set) => ({
  address: null,
  connect: async () => {
    if (!(await isConnected())) throw new Error("Freighter not installed");
    const address = await getPublicKey();
    set({ address });
  },
  disconnect: () => set({ address: null }),
}));
```

---

### Soroban Helper

Shared utility for building, simulating, signing, and submitting transactions.

```ts
// lib/soroban.ts
import {
  Contract, SorobanRpc, TransactionBuilder, Networks, xdr, scValToNative, Address
} from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";

const server = new SorobanRpc.Server(process.env.NEXT_PUBLIC_SOROBAN_RPC_URL!);
const PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!;

export async function invokeContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  signerAddress: string
) {
  const account = await server.getAccount(signerAddress);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, { fee: "1000", networkPassphrase: PASSPHRASE })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);
  const signedXdr = await signTransaction(prepared.toXDR(), { network: "TESTNET" });
  const signed = TransactionBuilder.fromXDR(signedXdr, PASSPHRASE);
  return server.sendTransaction(signed);
}

export async function simulateContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  signerAddress: string
) {
  const account = await server.getAccount(signerAddress);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, { fee: "1000", networkPassphrase: PASSPHRASE })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const result = await server.simulateTransaction(tx);
  if (!("result" in result)) throw new Error("Simulation failed");
  return scValToNative((result as SorobanRpc.Api.SimulateTransactionSuccessResponse).result!.retval);
}
```

---

### Treasury: Deposit & Withdraw

These are player-signed calls — no backend involved.

```ts
// lib/treasury.ts
import { Address, xdr } from "@stellar/stellar-sdk";
import { invokeContract, simulateContract } from "./soroban";

const TREASURY = process.env.NEXT_PUBLIC_TREASURY_CONTRACT_ID!;

// Deposit tokens into the casino treasury
export function deposit(playerAddress: string, tokenAddress: string, amount: bigint) {
  return invokeContract(TREASURY, "deposit", [
    new Address(playerAddress).toScVal(),
    new Address(tokenAddress).toScVal(),
    xdr.ScVal.scvI128(new xdr.Int128Parts({ hi: xdr.Int64.fromString("0"), lo: xdr.Uint64.fromString(amount.toString()) })),
  ], playerAddress);
}

// Read available balance (no wallet needed — pass any valid address as dummy)
export function getBalance(playerAddress: string) {
  return simulateContract(TREASURY, "reserve_balance", [
    new Address(playerAddress).toScVal(),
  ], playerAddress);
}
```

---

### Dice Game Flow

This is the critical flow. Follow the exact sequence.

```ts
// lib/dice.ts
import { Address, xdr } from "@stellar/stellar-sdk";
import { invokeContract } from "./soroban";
import { randomBytes } from "crypto"; // or use Web Crypto API in browser

const DICE = process.env.NEXT_PUBLIC_DICE_CONTRACT_ID!;
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL!;

export async function placeDiceBet(
  playerAddress: string,
  tokenAddress: string,
  amount: bigint,
  prediction: number   // 2–100
) {
  // Step 1: player signs place_bet directly on-chain
  return invokeContract(DICE, "place_bet", [
    new Address(playerAddress).toScVal(),
    new Address(tokenAddress).toScVal(),
    xdr.ScVal.scvI128(new xdr.Int128Parts({ hi: xdr.Int64.fromString("0"), lo: xdr.Uint64.fromString(amount.toString()) })),
    xdr.ScVal.scvU32(prediction),
  ], playerAddress);
}

export async function resolveDiceBet(playerAddress: string): Promise<number> {
  // Step 2: generate client seed in browser
  const clientSeed = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  // Step 3: send client_seed to backend — backend calls resolve_bet on-chain
  const res = await fetch(`${BACKEND}/api/bets/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game: "dice", player: playerAddress, clientSeed }),
  });

  if (!res.ok) throw new Error("Resolution failed");
  const { roll } = await res.json();
  return roll; // 1–100
}
```

> **Note:** `POST /api/bets/resolve` is not yet implemented in the backend. It is the next endpoint to build. The frontend should call it and expect `{ roll: number, won: boolean }` for dice and `{ outcome: number, won: boolean }` for coinflip.

---

### CoinFlip Game Flow

Same pattern as dice.

```ts
// lib/coinflip.ts
import { Address, xdr } from "@stellar/stellar-sdk";
import { invokeContract } from "./soroban";

const COINFLIP = process.env.NEXT_PUBLIC_COINFLIP_CONTRACT_ID!;
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL!;

export async function placeCoinflipBet(
  playerAddress: string,
  tokenAddress: string,
  amount: bigint,
  prediction: 0 | 1   // 0 = tails, 1 = heads
) {
  return invokeContract(COINFLIP, "place_bet", [
    new Address(playerAddress).toScVal(),
    new Address(tokenAddress).toScVal(),
    xdr.ScVal.scvI128(new xdr.Int128Parts({ hi: xdr.Int64.fromString("0"), lo: xdr.Uint64.fromString(amount.toString()) })),
    xdr.ScVal.scvU32(prediction),
  ], playerAddress);
}

export async function resolveCoinflipBet(playerAddress: string): Promise<{ outcome: number; won: boolean }> {
  const clientSeed = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  const res = await fetch(`${BACKEND}/api/bets/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game: "coinflip", player: playerAddress, clientSeed }),
  });

  if (!res.ok) throw new Error("Resolution failed");
  return res.json(); // { outcome: 0|1, won: boolean }
}
```

---

### WebSocket — Live Feed

Connect once at app level, share via context or Zustand.

```ts
// lib/ws.ts
import { create } from "zustand";

type LiveEvent =
  | { type: "bet_resolved"; contract: string; player: string; won: boolean; roll: number; ledger: number }
  | { type: "jackpot_won"; winner: string; amount: string; ledger: number };

type WsStore = {
  events: LiveEvent[];
  connect: () => void;
};

export const useLiveFeed = create<WsStore>((set, get) => ({
  events: [],
  connect: () => {
    const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL!);
    ws.onmessage = (e) => {
      const event: LiveEvent = JSON.parse(e.data);
      set({ events: [event, ...get().events].slice(0, 50) }); // keep last 50
    };
    ws.onclose = () => setTimeout(() => get().connect(), 3000); // auto-reconnect
  },
}));
```

Call `useLiveFeed.getState().connect()` once in your root layout.

---

### Data Fetching — React Query

```ts
// hooks/useLeaderboard.ts
import { useQuery } from "@tanstack/react-query";

const API = process.env.NEXT_PUBLIC_BACKEND_URL;

export const useLeaderboard = () =>
  useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fetch(`${API}/api/leaderboard`).then(r => r.json()),
    refetchInterval: 30_000,
  });

export const usePlayer = (address: string) =>
  useQuery({
    queryKey: ["player", address],
    queryFn: () => fetch(`${API}/api/players/${address}`).then(r => r.json()),
    enabled: !!address,
  });

export const useBets = (params?: { address?: string; game?: string; limit?: number }) =>
  useQuery({
    queryKey: ["bets", params],
    queryFn: () => {
      const qs = new URLSearchParams(params as Record<string, string>).toString();
      return fetch(`${API}/api/bets?${qs}`).then(r => r.json());
    },
  });

export const useJackpots = () =>
  useQuery({
    queryKey: ["jackpots"],
    queryFn: () => fetch(`${API}/api/jackpots`).then(r => r.json()),
    refetchInterval: 10_000,
  });
```

---

### Auth Model Summary

| Action | Signed by | Goes to |
|---|---|---|
| `deposit` | Player (Freighter) | Soroban contract directly |
| `withdraw` | Player (Freighter) | Soroban contract directly |
| `place_bet` | Player (Freighter) | Soroban contract directly |
| `reserve_balance` | Nobody (simulation) | Soroban RPC read |
| Resolve bet | Nobody from frontend | `POST /api/bets/resolve` → backend signs |
| Leaderboard / stats / history | Nobody | `GET /api/*` |
| Live events | Nobody | WebSocket `ws://` |

---

### Backend Endpoint Still Needed

Before the full game loop works, the backend must implement:

```
POST /api/bets/resolve
Body: { game: "dice" | "coinflip", player: string, clientSeed: string }

Response (dice):    { roll: number, won: boolean }
Response (coinflip): { outcome: 0 | 1, won: boolean }
```

This endpoint should:
1. Call `SeedManager.commitSeed()` if no seed is active
2. Call `BetResolver.resolveDice()` or `BetResolver.resolveCoinflip()`
3. Call `SeedManager.revealSeed()` after resolution
4. Return the result to the frontend

The frontend should poll or listen on the WebSocket for the `bet_resolved` event as confirmation, since the on-chain transaction may take a few seconds.

