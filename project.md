# 🎰 Decentralized Casino on Stellar

> A provably fair, fully on-chain casino built with **Soroban smart contracts** on the Stellar network. All betting logic, payouts, and randomness are transparent and independently verifiable.

---

## Table of Contents

1. [Core Idea](#1-core-idea)
2. [Why Stellar + Soroban?](#2-why-stellar--soroban)
3. [Supported Games](#3-supported-games)
4. [Architecture Overview](#4-architecture-overview)
5. [Smart Contracts](#5-smart-contracts)
6. [Provably Fair RNG](#6-provably-fair-rng)
7. [Token Economy](#7-token-economy)
8. [Liquidity Pool Model](#8-liquidity-pool-model)
9. [Revenue Model](#9-revenue-model)
10. [Security Architecture](#10-security-architecture)
11. [Frontend Stack](#11-frontend-stack)
12. [Backend Services](#12-backend-services)
13. [Database Schema](#13-database-schema)
14. [Event System](#14-event-system)
15. [Example: Dice Game Flow](#15-example-dice-game-flow)
16. [DAO Governance](#16-dao-governance)
17. [Compliance Considerations](#17-compliance-considerations)
18. [MVP Roadmap](#18-mvp-roadmap)
19. [Full Tech Stack](#19-full-tech-stack)
20. [Development Order](#20-development-order)

---

## 1. Core Idea

Traditional online casinos are **centralized and opaque**:

- Users must blindly trust the platform
- RNG can be silently manipulated
- Payouts and house reserves are hidden

**This project flips that model:**

| Traditional Casino | This Project |
|--------------------|--------------|
| Centralized RNG | Verifiable on-chain RNG |
| Opaque treasury | Transparent liquidity pool |
| Custodial funds | Users keep custody |
| Immutable trust | Immutable code |

---

## 2. Why Stellar + Soroban?

| Feature | Benefit |
|---------|---------|
| ⚡ Fast Settlement | ~5s finality — ideal for real-time games |
| 💸 Low Fees | Fractions of a cent — enables micro-bets |
| 🔒 Smart Contracts | Soroban handles game logic, RNG, treasury, rewards |
| 🪙 Token Support | Native XLM, USDC, or custom casino tokens |
| 🌍 Global Access | Anyone with a Stellar wallet can play |
| 🔁 Composability | Contracts can interoperate within the Stellar ecosystem |

---

## 3. Supported Games

| Game | Complexity | MVP Priority |
|------|-----------|--------------|
| 🪙 Coin Flip | Low | ✅ Phase 1 |
| 🎲 Dice | Low | ✅ Phase 1 |
| 🎡 Roulette | Medium | Phase 2 |
| 💥 Crash Game | Medium | Phase 2 |
| 🎰 Slot Machine | High | Phase 2 |
| 🎟️ Lottery | Medium | Phase 2 |
| ♠️ Blackjack | High | Phase 3 |
| 🃏 Multiplayer Poker | Very High | Phase 3 |

---

## 4. Architecture Overview

```
Frontend (Next.js / React)
         │
         ▼
Soroban SDK / Stellar Wallet Kit
         │
         ▼
  Game Gateway API (optional)
         │
         ▼
  Soroban Smart Contracts
  ├── Treasury Contract
  ├── RNG Oracle Contract
  ├── Game Contracts (Dice, Roulette, Slots…)
  ├── Jackpot Contract
  ├── Leaderboard Contract
  └── Token / Chip Contract
         │
         ▼
    Stellar Network
```

### Recommended Monorepo Layout

```
stellar-casino/
├── contracts/
│   ├── treasury/
│   ├── rng/
│   ├── dice/
│   ├── roulette/
│   ├── coinflip/
│   ├── slots/
│   ├── jackpot/
│   ├── leaderboard/
│   └── token/
├── frontend/
│   ├── app/
│   ├── components/
│   ├── hooks/
│   └── styles/
├── backend/
│   ├── oracle/
│   ├── indexer/
│   ├── websocket/
│   └── analytics/
├── sdk/
│   ├── typescript/
│   └── rust/
├── scripts/
│   ├── deploy.ts
│   ├── initialize.ts
│   └── seed.ts
└── tests/
    ├── unit/
    ├── integration/
    └── fuzz/
```

---

## 5. Smart Contracts

### Treasury Contract

Manages all funds flowing through the casino.

```
deposit()           — Player deposits funds
withdraw()          — Player withdraws winnings
lock_bet()          — Reserves payout before game resolves
release_payout()    — Sends winnings to player
reserve_balance()   — Returns current house reserve
deposit_liquidity() — LP adds funds to pool
withdraw_liquidity()— LP removes funds from pool
```

### RNG Contract

```rust
pub struct RNGState {
    pub server_seed_hash: BytesN<32>,
    pub nonce: u64,
}

// Functions
commit_seed()        — Casino commits hashed server seed
generate_random()    — Combines seeds to produce result
reveal_seed()        — Casino reveals original seed post-round
verify_randomness()  — Anyone can verify the outcome
```

### Dice Contract

```
place_bet(player, amount, prediction, client_seed)
resolve_bet()
claim_reward()
```

### Jackpot Contract

```
add_to_pool()   — Portion of each bet feeds the jackpot
draw_winner()   — RNG selects winner
claim_jackpot() — Winner claims prize
```

---

## 6. Provably Fair RNG

### Option 1 — Commit-Reveal (Recommended for MVP)

The simplest, cheapest, and fully on-chain approach.

```
Step 1: Casino commits   →  hash(server_seed) stored on-chain
Step 2: Player submits   →  client_seed + nonce
Step 3: Contract computes→  result = SHA256(server_seed + client_seed + nonce)
Step 4: Casino reveals   →  original server_seed published post-round
Step 5: Anyone verifies  →  recompute hash and confirm result
```

**Verification formula:**
```
SHA256(server_seed + client_seed + nonce) → outcome
```

**Example:**
```
server_seed = "abc123"
client_seed = "player777"
nonce       = 10
result      = 83   →  roll_under(90) → Player wins ✅
```

### Option 2 — Oracle-Based RNG

Use an external randomness provider for stronger guarantees.

```
Player Bet → Soroban Contract → Oracle Request
         → Randomness Signed → Soroban Verifies → Payout
```

Possible integrations: `drand`, `Chainlink VRF bridge`, custom validator quorum.

### Option 3 — Multi-Party RNG

Combines entropy from player seed + validator seed + casino seed + block timestamp. More decentralized, more complex.

---

## 7. Token Economy

### Casino Token (`CASINO`)

A native Stellar asset used across the platform.

| Utility | Description |
|---------|-------------|
| 🗳️ Governance | Vote on house edge, game additions, upgrades |
| 📈 Staking | Earn yield from house profits |
| 👑 VIP Rewards | Tiered benefits for high-volume players |
| 💰 Cashback | % of losses returned in CASINO tokens |
| 🏷️ Fee Discounts | Reduced house edge when betting with CASINO |

---

## 8. Liquidity Pool Model

Users can become the house by providing liquidity.

```
LP deposits USDC / XLM
       ↓
Funds enter the treasury pool
       ↓
Pool backs all game payouts
       ↓
LP earns proportional share of house profits
```

- LP tokens represent pool share
- Withdrawals subject to timelock to prevent bank-run attacks
- Pool utilization ratio tracked on-chain

---

## 9. Revenue Model

| Source | Details |
|--------|---------|
| House Edge | Dice: 1% · Roulette: 2.7% · Slots: 3–5% |
| Treasury Fees | Split between LPs, jackpot pool, and DAO treasury |
| NFT VIP Passes | Reduced fees, exclusive tournaments, cosmetics |
| Referral Program | % of referred player volume |

---

## 10. Security Architecture

> ⚠️ Casino contracts are among the highest-risk smart contract systems. Security is non-negotiable.

| Threat | Mitigation |
|--------|-----------|
| Reentrancy attacks | Check-effects-interactions pattern |
| RNG manipulation | Commit-reveal + client seed |
| Treasury drain | Bet limits (`min_bet` / `max_bet`) + solvency checks |
| Admin abuse | Multisig on treasury admin keys |
| Malicious upgrades | Timelocks on all contract upgrades |
| Undetected exploits | Full audit logging via Soroban events |
| Flash loan attacks | Per-block bet limits |

**Required before mainnet:**
- [ ] Independent smart contract audit
- [ ] Fuzz testing on RNG and payout logic
- [ ] Bug bounty program

---

## 11. Frontend Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js + React + TypeScript |
| Wallet | Freighter, Albedo, WalletConnect Stellar |
| Contract SDK | `@stellar/stellar-sdk`, Soroban SDK |
| State | Zustand or React Query |
| Styling | Tailwind CSS |

### UI Routes

```
/lobby          — Game selection
/dice           — Dice game
/roulette       — Roulette table
/slots          — Slot machine
/crash          — Crash game
/lottery        — Lottery tickets
/leaderboard    — Top players
/jackpots       — Live jackpot tracker
/vip            — VIP dashboard
/treasury       — Pool stats & LP management
/governance     — DAO voting
```

---

## 12. Backend Services

All optional but recommended for production.

| Service | Purpose |
|---------|---------|
| RNG Oracle | External randomness if not using commit-reveal |
| Indexer | Tracks bets, wins, leaderboards, analytics |
| WebSocket Server | Real-time live bets, jackpot updates, crash multiplier |
| Analytics Engine | RTP tracking, profit/loss, active users |

---

## 13. Database Schema

```sql
-- Users
id, wallet_address, vip_level, total_wagered, created_at

-- Bets
id, player_id, game, amount, prediction, result, payout, client_seed, nonce, timestamp

-- Jackpots
id, pool_size, winner_id, winning_ticket, timestamp

-- Liquidity Positions
id, provider_id, amount_deposited, lp_tokens, joined_at
```

---

## 14. Event System

Soroban events emitted on every game action — frontend subscribes in real time.

```rust
event::bet_placed(player, game, amount, nonce)
event::bet_resolved(player, game, result, payout)
event::jackpot_won(winner, amount)
event::liquidity_added(provider, amount)
event::liquidity_removed(provider, amount)
event::seed_committed(hash)
event::seed_revealed(seed)
```

---

## 15. Example: Dice Game Flow

```
1. User connects Freighter wallet
2. User places bet: 10 USDC, prediction: roll_under(60)
3. Contract locks payout in treasury
4. RNG generates: SHA256(server_seed + client_seed + nonce) → 42
5. 42 < 60 → Player wins
6. Payout transferred instantly on-chain
7. server_seed revealed — anyone can verify
```

---

## 16. DAO Governance

Token holders govern the casino via on-chain proposals.

**DAO controls:**
- House edge per game
- Supported games list
- Treasury allocation
- Jackpot pool percentage
- Contract upgrade approvals
- Fee distribution ratios

---

## 17. Compliance Considerations

> ⚠️ Gambling regulations vary significantly by jurisdiction. Consult legal counsel before launch.

| Requirement | Implementation |
|-------------|---------------|
| Geo-blocking | IP + wallet screening at frontend layer |
| KYC / AML | Optional off-chain identity layer |
| Age verification | Attestation service integration |
| Gaming license | Jurisdiction-dependent |
| Responsible gambling | Deposit limits, self-exclusion, cool-down periods |

---

## 18. MVP Roadmap

| Phase | Features | Duration |
|-------|----------|----------|
| **Phase 1 — Core** | Treasury, RNG (commit-reveal), Coin Flip, Dice | 3–4 weeks |
| **Phase 2 — Expand** | Roulette, Crash, Jackpot, LP staking, Leaderboard | 4–5 weeks |
| **Phase 3 — Polish** | Frontend, Indexer, WebSocket, Audit | 4–6 weeks |
| **Testnet** | Full integration testing on Stellar testnet | 1–2 weeks |
| **Mainnet** | Audited production launch | — |

### Recommended MVP Scope

Start lean. Ship fast. Expand after validation.

✅ Coin Flip  
✅ Dice  
✅ Commit-Reveal RNG  
✅ Single Treasury Pool  
✅ LP Deposits  
✅ Leaderboard  
✅ Wallet Auth (Freighter)  

❌ Skip slots initially — RTP balancing is complex and error-prone.

---

## 19. Full Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Stellar |
| Smart Contracts | Soroban |
| Contract Language | Rust |
| Frontend | Next.js + TypeScript |
| Wallet | Freighter / Albedo |
| Backend | Node.js |
| Database | PostgreSQL |
| Cache / Queue | Redis + Kafka |
| Hosting | Docker + Kubernetes |
| Monitoring | Grafana + Prometheus |

---

## 20. Development Order

```
Step 1  →  Setup Soroban environment (soroban-cli, wasm32 target)
Step 2  →  Build & test Treasury contract
Step 3  →  Build & test RNG contract (commit-reveal)
Step 4  →  Build Coin Flip game contract
Step 5  →  Build Dice game contract
Step 6  →  Integrate frontend (Next.js + Freighter)
Step 7  →  Add indexing backend
Step 8  →  Security testing + fuzz tests
Step 9  →  Deploy to Stellar testnet
Step 10 →  External audit
Step 11 →  Mainnet launch
```

### Install Prerequisites

```bash
cargo install --locked soroban-cli
rustup target add wasm32-unknown-unknown
```

---

> Built on [Stellar](https://stellar.org) · Powered by [Soroban](https://soroban.stellar.org) · Open Source
