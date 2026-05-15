# Structure & Flow — Stellar Casino Contracts

This document covers what is implemented in the `contract` repo and how the `backend` and `frontend` repos connect to it.

---

## 1. What's Implemented

### Contract Overview

```
contracts/
├── treasury/    — Fund custody, bet locking, payout release
├── rng/         — Commit-reveal provably fair RNG
├── coinflip/    — Heads or tails game
└── dice/        — Roll-under dice game (prediction 2–100)
```

---

### Treasury Contract

Holds all player funds. Games never touch tokens directly — they go through treasury.

**Storage:**
- `Balance(Address)` → `i128` — available (unlocked) balance per player
- `LockedBet(Address)` → `i128` — funds locked during an active bet
- `Admin` → `Address` — privileged account for bet operations

**Functions:**

| Function | Auth | Description |
|----------|------|-------------|
| `initialize(admin)` | — | One-time setup |
| `deposit(from, token, amount)` | player | Transfers tokens in, credits balance |
| `withdraw(to, token, amount)` | player | Debits balance, transfers tokens out |
| `lock_bet(player, amount)` | admin | Moves balance → locked for active bet |
| `release_payout(player, token, payout)` | admin | Clears lock, sends payout to player |
| `reserve_balance(player) -> i128` | — | Read-only balance query |

**Events emitted:**
```
("treasury", "deposit")        → (player, amount)
("treasury", "withdraw")       → (player, amount)
("treasury", "lock_bet")       → (player, amount)
("treasury", "release_payout") → (player, payout)
```

---

### RNG Contract

Commit-reveal scheme. The casino commits a hashed seed before the round; the player provides their own seed; the result is computed on-chain and verifiable by anyone.

**Storage:**
- `SeedHash` → `BytesN<32>` — SHA256 of the server seed
- `Nonce` → `u64` — increments each call to prevent replay

**Functions:**

| Function | Description |
|----------|-------------|
| `commit_seed(seed_hash)` | Casino stores `SHA256(server_seed)` before round starts |
| `generate_random(client_seed, range) -> u64` | Returns `SHA256(seed_hash \|\| client_seed \|\| nonce) % range`, increments nonce |
| `reveal_seed(server_seed) -> bool` | Casino reveals original seed; returns true if hash matches |
| `verify_randomness(server_seed, client_seed, nonce, range, expected) -> bool` | Anyone can independently verify a past result |

**RNG formula:**
```
result = SHA256( SHA256(server_seed) || client_seed || nonce ) % range
```

**Events emitted:**
```
("rng", "commit_seed") → seed_hash
```

---

### CoinFlip Contract

Simplest game. Player picks heads (0) or tails (1). Payout is 2x on win.

**Storage:**
- `Bet(Address)` → `{ player, token, amount, prediction }` — one active bet per player
- `Admin` → `Address`

**Functions:**

| Function | Auth | Description |
|----------|------|-------------|
| `initialize(admin)` | — | One-time setup |
| `place_bet(player, token, amount, prediction)` | player | Locks tokens in contract, stores bet |
| `resolve_bet(player, client_seed) -> bool` | admin | Flips coin, pays 2x if won, returns `true` if player won |

**RNG used:** `SHA256(ledger_sequence || client_seed) % 2`

**Payout:** `amount × 2` on win. House keeps bet on loss.

**Events emitted:**
```
("coinflip", "bet_placed")    → (player, amount, prediction)
("coinflip", "bet_resolved")  → (player, won, outcome)
```

---

### Dice Contract

Roll-under game. Player picks a prediction (2–100). They win if `roll < prediction`. Higher prediction = higher win chance = lower payout.

**Storage:**
- `Bet(Address)` → `{ player, token, amount, prediction }` — one active bet per player
- `Admin` → `Address`

**Functions:**

| Function | Auth | Description |
|----------|------|-------------|
| `initialize(admin)` | — | One-time setup |
| `place_bet(player, token, amount, prediction)` | player | Validates prediction in [2,100], locks tokens |
| `resolve_bet(player, client_seed) -> u32` | admin | Rolls dice, pays out if won, returns roll value |

**RNG used:** `SHA256(ledger_sequence || client_seed) % 100 + 1` → result in [1, 100]

**Payout formula:** `amount × 99 / prediction` (1% house edge)

**Events emitted:**
```
("dice", "bet_placed")    → (player, amount, prediction)
("dice", "bet_resolved")  → (player, won, roll)
```

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        FRONTEND                         │
│  (Next.js + Freighter wallet)                           │
│                                                         │
│  deposit()  place_bet()  reserve_balance()              │
│       │          │              │                       │
│       └──────────┴──────────────┘                       │
│              Soroban SDK (JS)                           │
└─────────────────────┬───────────────────────────────────┘
                      │  signed transactions
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    STELLAR NETWORK                      │
│                                                         │
│  ┌─────────────┐  ┌─────────┐  ┌──────────┐  ┌──────┐ │
│  │  Treasury   │  │   RNG   │  │ CoinFlip │  │ Dice │ │
│  └─────────────┘  └─────────┘  └──────────┘  └──────┘ │
│         ▲                            ▲            ▲     │
│         └────────────────────────────┴────────────┘     │
│                  contract calls + events                │
└─────────────────────▲───────────────────────────────────┘
                      │  commit_seed / resolve_bet / reveal_seed
                      │  (admin-signed transactions)
┌─────────────────────┴───────────────────────────────────┐
│                        BACKEND                          │
│  (Node.js — seed manager + resolver service)            │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Full Game Flow (Dice Example)

```
FRONTEND                    STELLAR NETWORK              BACKEND
   │                               │                        │
   │  1. Player connects wallet    │                        │
   │                               │                        │
   │  2. deposit(player,           │                        │
   │     token, amount) ──────────►│ treasury.deposit()     │
   │                               │ balance credited       │
   │                               │                        │
   │                               │◄── commit_seed() ──────│ 3. Backend generates
   │                               │    SHA256(server_seed) │    server_seed, commits
   │                               │    stored on-chain     │    hash to RNG contract
   │                               │                        │
   │  4. place_bet(player,         │                        │
   │     token, 100, 60) ─────────►│ dice.place_bet()       │
   │                               │ tokens locked in       │
   │                               │ contract               │
   │                               │                        │
   │  5. Player provides           │                        │
   │     client_seed ─────────────────────────────────────►│
   │                               │                        │
   │                               │◄── resolve_bet() ──────│ 6. Backend calls
   │                               │    (player,            │    resolve_bet with
   │                               │     client_seed)       │    client_seed
   │                               │                        │
   │                               │ roll = SHA256(seq||    │
   │                               │   client_seed)%100+1   │
   │                               │                        │
   │                               │ if roll < 60:          │
   │                               │   payout transferred   │
   │                               │   to player            │
   │                               │                        │
   │◄── event: bet_resolved ───────│                        │
   │    (player, won, roll)        │                        │
   │                               │                        │
   │                               │◄── reveal_seed() ──────│ 7. Backend reveals
   │                               │    server_seed         │    original seed
   │                               │    verified on-chain   │    (provably fair)
   │                               │                        │
   │  8. Anyone can call           │                        │
   │     verify_randomness() ─────►│ returns true/false     │
```

---

## 4. Backend Integration

The backend is a **privileged admin service**. It holds the admin keypair and is responsible for:

| Responsibility | Contract Call |
|----------------|---------------|
| Generate server seed, commit hash before each round | `rng.commit_seed(SHA256(server_seed))` |
| Resolve bets after player submits client seed | `coinflip.resolve_bet(player, client_seed)` / `dice.resolve_bet(player, client_seed)` |
| Reveal server seed post-round for verification | `rng.reveal_seed(server_seed)` |
| Index on-chain events for leaderboards/analytics | Subscribe to contract events |

**Connecting to contracts (Node.js / TypeScript):**

```ts
import { Contract, SorobanRpc, TransactionBuilder, Networks, Keypair } from "@stellar/stellar-sdk";

const server = new SorobanRpc.Server("https://soroban-testnet.stellar.org");
const adminKeypair = Keypair.fromSecret(process.env.ADMIN_SECRET_KEY);

// Call resolve_bet on dice contract
const contract = new Contract(DICE_CONTRACT_ID);
const tx = new TransactionBuilder(adminAccount, { fee: "100", networkPassphrase: Networks.TESTNET })
  .addOperation(contract.call("resolve_bet", playerAddress, clientSeedBytes))
  .setTimeout(30)
  .build();

const preparedTx = await server.prepareTransaction(tx);
preparedTx.sign(adminKeypair);
const result = await server.sendTransaction(preparedTx);
```

**Listening to contract events:**

```ts
// Poll for events from the dice contract
const events = await server.getEvents({
  startLedger: fromLedger,
  filters: [{ type: "contract", contractIds: [DICE_CONTRACT_ID] }],
});

for (const event of events.events) {
  const [topic1, topic2] = event.topic; // e.g. "dice", "bet_resolved"
  const [player, won, roll] = event.value;
  // update DB, push to websocket, etc.
}
```

---

## 5. Frontend Integration

The frontend connects **directly to contracts** for player-signed actions (deposit, place_bet). Admin-only actions (resolve_bet) go through the backend.

**Player-signed calls (via Freighter wallet):**

```ts
import { Contract, SorobanRpc, TransactionBuilder, Networks } from "@stellar/stellar-sdk";
import { getPublicKey, signTransaction } from "@stellar/freighter-api";

const playerPublicKey = await getPublicKey();
const contract = new Contract(DICE_CONTRACT_ID);

// place_bet
const tx = new TransactionBuilder(playerAccount, { fee: "100", networkPassphrase: Networks.TESTNET })
  .addOperation(contract.call(
    "place_bet",
    playerAddress,   // Address
    tokenAddress,    // Address (USDC or XLM)
    xdr.Int128Parts, // amount
    xdr.Uint32,      // prediction (2–100)
  ))
  .setTimeout(30)
  .build();

const preparedTx = await server.prepareTransaction(tx);
const signedXdr = await signTransaction(preparedTx.toXDR(), { network: "TESTNET" });
await server.sendTransaction(TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET));
```

**Read-only queries (no wallet needed):**

```ts
// Check player balance in treasury
const result = await server.simulateTransaction(
  new TransactionBuilder(dummyAccount, { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(treasuryContract.call("reserve_balance", playerAddress))
    .setTimeout(30)
    .build()
);
const balance = scValToNative(result.result.retval); // i128
```

---

## 6. Auth Model

| Action | Who Signs | How |
|--------|-----------|-----|
| `deposit` | Player | Freighter wallet in browser |
| `withdraw` | Player | Freighter wallet in browser |
| `place_bet` | Player | Freighter wallet in browser |
| `lock_bet` | Admin | Backend keypair (server-side) |
| `resolve_bet` | Admin | Backend keypair (server-side) |
| `release_payout` | Admin | Backend keypair (server-side) |
| `commit_seed` | Admin | Backend keypair (server-side) |
| `reveal_seed` | Admin | Backend keypair (server-side) |
| `reserve_balance` | None | Read-only simulation |

---

## 7. Contract IDs (fill in after deployment)

```env
# .env (backend + frontend)
TREASURY_CONTRACT_ID=C...
RNG_CONTRACT_ID=C...
COINFLIP_CONTRACT_ID=C...
DICE_CONTRACT_ID=C...
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
```
