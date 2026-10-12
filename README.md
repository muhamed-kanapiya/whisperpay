# WhisperPay

**Just whisper to pay.** A complete browser-based Solana Devnet wallet with a premium landing page, voice commands, contacts, real SOL and SPL token transfers, and explicit confirmation.

Live demo: https://muhamed-kanapiya.github.io/whisperpay/

Wallet: https://muhamed-kanapiya.github.io/whisperpay/app/

Project logo: [1024×1024 PNG](public/whisperpay-logo.png)

## Run locally

Use Node.js 20.19+ (Node.js 22 or 24 recommended) and npm.

```sh
npm install
npm run dev
```

Open http://localhost:3000 for the landing page, or http://localhost:3000/app for the wallet. No environment variables, account, API key, database, or backend is required. Inter is packaged locally; builds do not fetch Google Fonts.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

`npm run build` generates a static website in `out/`. `npm start` serves that export locally. `next start` does not support static exports.

## Try a real payment

1. Open `/app` in Chrome or Edge on localhost or HTTPS.
2. Click **Create Demo Wallet**. A fresh keypair is generated and saved as a byte array under `whisperpay_key` in localStorage.
3. The wallet automatically requests **2 Devnet SOL** from `https://api.devnet.solana.com`. The public faucet can reject or rate-limit requests. If it does, copy the wallet address, open https://faucet.solana.com, request Devnet funds, then click Refresh.
4. Once the automatic airdrop confirms, the wallet creates an actual SPL mint and associated token account, mints **1,000 WHISPER**, and revokes the mint authority in one atomic transaction. Minting and token account rent consume a small amount of SOL, so the displayed SOL balance will be slightly below 2. If you funded manually, click **Create 1,000 WHISPER tokens**.
5. Edit **mom** or **alice** in Contacts to use a recipient address you control. Defaults are freshly generated test destination addresses whose private keys are discarded; do not expect to recover tokens sent to them. Contact names are local nicknames, not `.sol` domain resolution.
6. Click the microphone and say **“Send 0.1 SOL to mom”**. Review the full address and amount. Click **Confirm & Send**, or click the microphone again and say exactly **“confirm”**, **“yes”**, or **“send”**.
7. Open the confirmed signature in Solscan, always with `?cluster=devnet`. You can also send **“Send 25 WHISPER to alice”**.

You can type the same command. Full base58 addresses are accepted, preserving case; voice recognition of long addresses is inherently unreliable. Save them once as contacts for reliable voice use. A single spoken command containing a transfer and a confirmation is never treated as approval.

## Expanded payment features

- **Devnet USDC:** balances and checked SPL transfers use Circle's official test mint, `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. Copy your address, open https://faucet.circle.com/, select Solana Devnet, request test USDC, and refresh. Keep Devnet SOL for fees and token-account rent. No fake USDC balance or replacement mint is used. These tokens have no dollar value.
- **Send form:** the Type tab supports SOL, USDC, and WHISPER with a contact name or full address. It shares the same review and transaction flow as voice input.
- **Receive/request:** generate a SOL or USDC link that opens an explicit payment review. Links contain the public recipient, amount, asset, and Devnet network marker. Opening a link never sends funds. Links are editable and unauthenticated, not signed invoices or payment receipts; verify the recipient separately. Localhost links only work on the same computer. WHISPER requests are excluded because each wallet has a different mint.
- **Cost preview:** before approval, query live balances, network fees, and any recipient token-account rent. Show total SOL debit and estimated remaining SOL. An unavailable or failed estimate blocks confirmation; estimates older than 60 seconds require a refresh and another confirmation. Estimates are not fee guarantees. Simulation still runs before broadcast, and changed/deleted contact mappings abort signing.
- **Wallet commands:** “What is my balance?”, “Show contacts”, and “Help” return read-only responses. “Pay twenty five USDC to alice” and explicit decimal amounts are supported. “Change amount to five” or “Make it 0.05” during review creates another review and estimate, never approval. Unsupported currencies such as “dollars” are not inferred to mean USDC.
- **Readback:** click Read payment aloud or Read aloud for browser speech synthesis. The microphone and approval controls are disabled while readback is active. Readback is optional and never automatically opens the microphone.

The USDC mint is sourced from https://developers.circle.com/stablecoins/usdc-contract-addresses. Browser readback uses https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis.

## Deployment on Vercel

Import this directory from your own Git repository. Use the Next.js preset, `npm run build`, and output directory `out` (already declared in `vercel.json`). There are no environment variables. Vercel provides HTTPS for microphone access. The static export makes all wallet logic run in the browser and requires no server functions. The included security headers restrict network requests to the fixed Devnet RPC.

The supplied reference HTML is retained unchanged and is not copied into the published `out` directory. Project source and the app's GitHub buttons point to https://github.com/muhamed-kanapiya/whisperpay.

## GitHub Pages

The public demo uses the `gh-pages` branch. `main` contains the complete application source; `gh-pages` contains only its generated static export. The original `Voxa-Landing-Voice-Wallet.html` is a design reference, not a second product. Local video-production materials are excluded from the repository.

Run `npm run deploy:pages` from a checkout with GitHub push access to rebuild for `/whisperpay`, disable Jekyll, and publish the static export. This uses a separate Git index and keeps the source checkout on its current branch. Pushing `main` alone does not rebuild the public demo. `npm run build` still creates the normal localhost/Vercel export with no base path. GitHub Pages does not apply the custom response headers in `vercel.json`.

### Judge access

No account, login credentials, wallet extension, or API key is required. Open the wallet link, click **Create Demo Wallet**, and allow microphone access if using voice in Chrome or Edge. If the automatic Devnet faucet is unavailable, copy the public wallet address and use https://faucet.solana.com, then refresh. Add a recipient address you control to Contacts, say or type **Send 0.1 SOL to mom**, review the address and costs, and confirm separately. The typed flow remains available without microphone access. All funds are Devnet test assets with no real value.

## Architecture

```text
app/page.tsx                  Landing page
app/app/page.tsx              Wallet route
app/globals.css               Responsive dark design system
components/landing/           Landing sections and animated voice illustration
components/wallet/            Wallet, voice, contacts, history
components/ui/                shadcn-style Button, Card, Input
hooks/useVoice.ts             Web Speech API lifecycle and error handling
hooks/useSolana.ts            Wallet persistence and transaction state
lib/parseIntent.ts            Strict grammar, exact amounts, contact lookup
lib/solana.ts                 Fixed Devnet connection, mint/transfer, confirmation
lib/storage.ts                Validated browser persistence
tests/                        Parser, signing/confirmation, and storage regression tests
```

Stack: Next.js 14 App Router, TypeScript, React 18, Tailwind CSS, Framer Motion, Radix Slot/CVA components, `@solana/web3.js`, `@solana/spl-token`, and the Web Speech API. No wallet extension is necessary.

## Transaction behavior

- Every transfer needs a separate explicit approval. The reviewed recipient and amount are frozen for signing.
- Decimal amounts are converted to base units using BigInt; excess precision and invalid amounts are rejected.
- Transactions are simulated before broadcast. The wallet checks funds and leaves room for fees; Solana verifies the complete transaction including any token-account rent.
- The signed signature is persisted **before** broadcast. RPC timeouts are shown as pending, never as successful payments. Do not re-send while a transaction is pending. Refresh reconciles signatures with Devnet and checks block-height expiry.
- The newest five activity entries are displayed; up to 50 are stored. Pending transfers block a second transfer to avoid accidental duplicates.
- Web Locks serialize operations between tabs where supported; storage events invalidate stale wallet state.
- Each demo wallet creates its own WHISPER mint. WHISPER is a local display label; no Metaplex name/logo metadata is created. Tokens received from a different demo wallet's mint are visible in explorers but are not aggregated into this wallet's own-mint balance.

## Demo security and limits

**DEMO WALLET — Devnet only — Stored in browser — Do not send real funds.**

The private key is deliberately stored **unencrypted** in localStorage as requested. Same-origin scripts, browser extensions, or anyone with access to this browser may read it. No seed phrase onboarding does not mean there is no private key. Clearing browser storage or resetting the wallet permanently removes local access; on-chain history remains. Reset affects only WhisperPay storage keys.

This is deployable demo software, not an audited custody product or a mainnet wallet. There is no network switch. Devnet and its shared faucet have no availability guarantee, and their data may reset. There is no fake balance or fake transaction fallback in the wallet. The landing illustration is explicitly labeled as a preview.

Browser speech recognition requires microphone permission, HTTPS/localhost, a compatible browser, and sometimes the browser vendor's online speech service. WhisperPay has no transcription backend, but audio may be processed by the browser vendor. Unsupported browsers retain the typed flow. Voice approval recognizes words, not a user's identity.

**Framework support:** Next.js 14 was explicitly required and is pinned to its latest compatible patch via the lockfile. Next.js now lists 14 as unsupported: https://nextjs.org/support-policy. This project uses a static export with no production Next.js request server, API routes, middleware, or Server Actions. Upgrade to a supported Next.js release and re-audit dependencies before extending it into an internet-facing server or a real-money product.

The dependency audit is not clean: the mandated Next.js 14 and legacy Solana dependency tree still have advisories. Next.js server features are absent from the exported deployment; native `bigint-buffer` code is not used by the browser bundle. These deployment facts do not constitute a complete security audit. Compatible overrides update PostCSS and the local static server's compression dependency. The development server binds to `127.0.0.1`; do not expose it publicly.

## Verification

Unit tests cover strict command parsing, separate confirmation, address preservation, exact lamport/token amounts, real serialized signing, fixed-supply mint instructions, failed/uncertain confirmation, persistence-before-broadcast, corrupted keys, and scoped reset. RPC tests are mocked and do **not** prove live Devnet availability. A live microphone and funded Devnet end-to-end test still depend on the browser and public faucet.

Local verification on October 8, 2026: production build and type checking passed; lint passed without warnings; all 47 tests passed. Added tests cover spoken amounts, USDC mint selection and transfer instructions, request validation, fee/rent estimates, and aborting a transfer before signing. Browser checks verified creation, reload persistence, contact saving, typed-command review, reset cancellation, mobile navigation, USDC balance display, request-link generation/opening without automatic payment, self-payment rejection, amount corrections, insufficient-balance approval blocking, and the readback UI's microphone guard. The live airdrop RPC initially returned `Internal error` and a later retry was rate-limited; no funded SOL/USDC transfer or live token mint was claimed as verified. Narrow-screen review controls were checked with no horizontal overflow. Actual spoken input and audible readback were not tested. The production dependency audit reported 10 advisories (6 moderate, 3 high, 1 critical); remaining packages require upstream migration or further review.

Primary references: https://solana.com/docs/rpc/http/requestairdrop, https://solana.com/docs/tokens/basics, https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition.
