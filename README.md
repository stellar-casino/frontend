# 🎰 Stellar Casino — Frontend

Provably fair, fully on-chain casino built on the **Stellar** blockchain using **Soroban** smart contracts. All game logic, payouts, and randomness are transparent and independently verifiable.

## Tech Stack

- **Framework** — Next.js 14 (App Router) + TypeScript
- **Blockchain** — Stellar Testnet via `@stellar/stellar-sdk`
- **Wallet** — Freighter (`@stellar/freighter-api`)
- **State** — Zustand + TanStack React Query
- **Styling** — Tailwind CSS

## Games

| Route | Game |
|-------|------|
| `/coinflip` | Coin Flip |
| `/dice` | Dice |
| `/jackpots` | Live Jackpot Tracker |
| `/leaderboard` | Top Players |
| `/bets` | Bet History |
| `/players` | Player Profiles |

## Getting Started

### Prerequisites

- Node.js 18+
- [Freighter wallet](https://www.freighter.app/) browser extension

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

Copy `.env.local` and fill in your contract addresses:

```env
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
NEXT_PUBLIC_TREASURY_CONTRACT_ID=<your_contract_id>
NEXT_PUBLIC_COINFLIP_CONTRACT_ID=<your_contract_id>
NEXT_PUBLIC_DICE_CONTRACT_ID=<your_contract_id>
NEXT_PUBLIC_TOKEN_ADDRESS=<your_token_address>
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3002
```

## Project Structure

```
src/
├── app/
│   ├── coinflip/       # Coin flip game page
│   ├── dice/           # Dice game page
│   ├── jackpots/       # Jackpot tracker
│   ├── leaderboard/    # Leaderboard
│   ├── bets/           # Bet history
│   └── players/        # Player profiles
├── components/         # Shared UI components
├── hooks/              # Custom React hooks
├── lib/
│   ├── soroban.ts      # Contract invocation helpers
│   └── treasury.ts     # Treasury contract interface
└── store/
    └── wallet.ts       # Zustand wallet state
```

## How It Works

Games use a **commit-reveal RNG** scheme for provable fairness:

1. Casino commits `hash(server_seed)` on-chain before the round
2. Player submits a `client_seed`
3. Contract computes `SHA256(server_seed + client_seed + nonce)` → outcome
4. Casino reveals `server_seed` post-round — anyone can verify

## Scripts

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Related

- [Soroban Docs](https://soroban.stellar.org)
- [Stellar SDK](https://github.com/stellar/js-stellar-sdk)
- [Freighter API](https://github.com/stellar/freighter)
