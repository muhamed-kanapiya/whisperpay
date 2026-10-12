# WhisperPay Corporate Actions

A voice-guided issuer desk for the Superteam Kazakhstan × KASE corporate-actions challenge. This repository contains both the original payment wallet and the corporate-actions module; they share the same browser demo issuer and Solana connection.

- [Corporate Actions demo](https://muhamed-kanapiya.github.io/whisperpay/corporate/)
- [Source](https://github.com/muhamed-kanapiya/whisperpay)
- [Public audit with terms, holders, snapshots and signatures](../public/corporate/verified-audit.json)
- [Recorded final balances](../public/corporate/verified-result.json)
- [Official challenge](https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain)

## Implemented and verified

The funded integration test completed all three scenarios on Solana Devnet. It verified actual token balances after each settlement, actual bond burns, a final bond supply of zero, and rejection of a duplicate receipt at instruction zero in an on-chain simulation. This is a functioning issuer-controlled prototype, not an audited financial-market integration.

| Scenario | Settlement across all holders | Bond supply after settlement | Proof |
|---|---:|---:|---|
| Semi-annual coupon | 3,000 testUSD | 60 | [Transaction](https://solscan.io/tx/2JphGu7VuKGiG4cLycdSnABGZUijeVcuSpiHkBdz1UBM61XCj1dbxao2ma5wJ5oQ61wV57Y3qhN32nnHrYLdBrd9?cluster=devnet) |
| 20% partial redemption | 12,000 testUSD principal | 48 | [Transaction](https://solscan.io/tx/4tsrPDUZ2RCjSXCHiqHfSVa2a9LoNAXCYzcAc1ym4dhhzxDiBJiyqSUJkGsCDrGVVNTjZLCQ3dSWCyr9EMrxyXoE?cluster=devnet) |
| Maturity redemption | 48,000 principal + 2,400 final coupon | 0 | [Transaction](https://solscan.io/tx/5KBRMZBrCGLCNgXhhmzV1LaXgBrvsemKUo5nJsUeZJPGMxPobTA95C8g4mCDGxZtBxhbPM58YMFWqMpcGGvPqj4o?cluster=devnet) |

Investor A/B/C received cumulative balances of **10,900 / 21,800 / 32,700 testUSD**. The issuer treasury retained **34,600 testUSD**. Final balances were read at finalized slot **510411591**. testUSD has no monetary value and is not USDC, USDG, a bank balance, or a dollar-backed stablecoin.

## Architecture and Solana components

The Next.js 14 / TypeScript application exports static files and runs on GitHub Pages. No backend, API key, hosted AI model, wallet extension, or custom deployed program is required.

```text
Voice or typed command → deterministic intent → read-only review
                                              ↓ explicit button approval
Browser issuer key → simulate → sign → persist signature → broadcast
                                              ↓
Solana System + Token-2022 + SPL Token + Memo programs
                                              ↓
Confirm / reconcile → explorer receipts + public audit export
```

- **Token-2022:** a zero-decimal bond mint with `NonTransferable` and `PermanentDelegate` extensions. Sixty bonds are issued to three fixture investors (10 / 20 / 30). Mint authority is revoked after the registry is checked. The issuer retains permanent burn authority for redemption. Non-transferability keeps this small registry closed; there is no secondary-market transfer flow.
- **SPL Token:** a separate six-decimal settlement mint with a fixed supply of 100,000 testUSD. Mint authority is revoked during creation. Payouts use `TransferChecked`.
- **System program:** deterministic seeded mint addresses and one permanent marker account per instrument/operation. Each marker is created in the same transaction as the associated action.
- **Memo program:** issuer-signed SHA-256 commitments to instrument terms and record-date inputs. Zero-data marker accounts are owned by the Memo program. They cannot be closed by the normal issuer flow. Creating the same address again fails, making identical operation IDs single-use on-chain.
- **Web Speech API:** guided commands and optional browser speech synthesis. Voice can explain and prepare; it never signs corporate actions. There is no generative AI claim.

Relevant code: `lib/corporate/model.ts`, `lib/corporate/solana.ts`, `lib/corporate/storage.ts`, `hooks/useCorporate.ts`, and `components/corporate/`.

## Record-date mechanism

The operator captures a new record date at the **current finalized Solana slot**. Bond mint, cash mint, all three holder accounts, treasury and settlement balances are fetched together using `getMultipleAccountsInfoAndContext`. The RPC context supplies the slot; `getBlockTime` supplies its timestamp. No historical balances are invented or reconstructed from today's balances.

The client checks the bond extensions and authorities, expected owners/mints, expected lifecycle quantities, and that registered holdings sum to the entire bond supply. The snapshot contains the instrument mint, action, slot, timestamp, and exact address/quantity pairs. Its canonical JSON hash is anchored in an issuer-signed memo alongside a single-use snapshot marker.

Before settlement, the application reads the finalized snapshot transaction, checks the issuer signature and marker address, matches the memo commitment against the local snapshot, verifies the original instrument terms, and rereads the registry. Any changed holding blocks settlement. Every action has its own snapshot. This mechanism supports a controlled non-transferable fixture; arbitrary historical record dates and transferable securities require an indexer or program-level balance checkpoints.

## Entitlements and settlement

All accounting uses `bigint` base units. A bond has face value 1,000 testUSD, a 10% annual coupon and two payments per year.

```text
Coupon = bonds × 1,000 × 10% ÷ 2
Partial principal = redeemed whole bonds × 1,000
Final principal = remaining bonds × 1,000
Final coupon = remaining bonds × 1,000 × 10% ÷ 2
```

The fixture retires exactly 20% of each holder's units: 2 / 4 / 6. Fractional bond redemptions are rejected rather than silently rounded. The remaining 8 / 16 / 24 bonds are fully retired at maturity. Both coupon periods are paid exactly once in the prescribed lifecycle: first coupon, partial redemption, then final principal plus final coupon.

The demo maturity is three minutes after terms are prepared, based on a Solana block timestamp. Full semi-annual coupon amounts are used to compress the demonstration; this is not accrued interest over three minutes. The client checks maturity against a fresh finalized Solana timestamp.

Each settlement is a **single atomic transaction** containing marker creation, all three cash transfers, any bond burns, and a snapshot-hash memo. A failure aborts the whole transaction. Issuance is six resumable transactions; the instrument cannot settle until the fixed supply is sealed. Transaction sizes observed were 669 bytes for coupon, 878 for partial redemption and 882 for maturity redemption, below Solana's 1,232-byte limit.

Pending signatures and block-height expiry are saved before broadcast. An RPC timeout remains pending until reconciliation; it is never treated as a failed payment that is safe to repeat. The shared Web Lock prevents wallet mutations in another cooperating tab. A fresh review is required after two minutes. Exported audits include public data only, and restore requires the same issuer wallet.

## Implemented vs simulated vs future

| Component | Status |
|---|---|
| Mints, balances, transfers, burns, signed memos, replay markers | Real Solana Devnet operations; tested with a funded issuer |
| Holder eligibility and entitlement arithmetic | Functional deterministic client logic; checked against on-chain accounts |
| Record-date proof | Finalized snapshot with on-chain commitment and verification |
| Coupon, partial redemption, maturity redemption | Implemented and demonstrated on-chain |
| Cash settlement | Simulated cash economics using real transfers of a custom testUSD token |
| Issuer, bond issue, investor identities and schedule | Demo fixtures; accelerated clock; generated investor private keys are discarded |
| KASE, banks, CSD, KYC and custody integration | Not implemented |
| Program-enforced financial policy | Future work; no custom corporate-actions program is deployed |

The issuer is trusted: its key can burn bonds or move treasury tokens outside the UI. Entitlement amounts, action ordering and maturity checks are enforced by the client, not by a custom on-chain financial-policy program. Marker replay protection applies to the fixed operation IDs; it does not constrain arbitrary transactions signed by a malicious issuer. Public marker prefunding could deny an action; the demo fails closed and has no recovery protocol. This is not suitable for real instruments or mainnet funds.

## Reproduce and judge access

1. Open the corporate demo and choose **Inspect completed run**. All three settlement and snapshot links are available without signing in or funding a wallet. **Verify against Solana** rereads the public evidence.
2. To issue a fresh instrument, create the browser demo wallet at `/app`, fund it with at least 0.1 Devnet SOL, then open `/corporate` on the same origin.
3. Prepare the instrument, then review and confirm the six setup steps. Allow finality when prompted. The public RPC may rate-limit; refresh instead of repeating a pending operation.
4. Select coupon; capture and confirm its snapshot, then review and confirm settlement. Repeat for partial redemption and then maturity redemption. The last action waits until demo maturity.
5. Refresh balances, inspect each explorer receipt, and export the audit JSON.

```sh
npm install
npm test
npm run build
```

An opt-in funded integration test is in `tests/corporate-devnet.test.ts`. Set `WHISPERPAY_TEST_DEVNET=1` and run `npx vitest run tests/corporate-devnet.test.ts`. It generates an isolated test key under ignored `test-results/corporate/`, prints only its public address, and requires manual Devnet funding. Never commit that private test key. Reruns resume from the saved audit. Normal `npm test` skips network operations.

## Next steps for real-market applicability

1. Move lifecycle state, entitlements, maturity gates and payout claims into a reviewed Solana program with issuer/custodian roles and durable action PDAs.
2. Add transferable instruments with historical ownership checkpoints, record-date scheduling, ex-coupon rules, day-count conventions and fractional entitlement policy.
3. Add institution-controlled signing, dual approvals, an escrowed treasury, an authenticated holder registry and recovery procedures.
4. Integrate a settlement provider and distinguish initiated, acknowledged, paid, failed and reconciled external payment states.
5. Add an indexed reporting service and audited speech/AI tooling whose outputs remain proposals requiring approval.
