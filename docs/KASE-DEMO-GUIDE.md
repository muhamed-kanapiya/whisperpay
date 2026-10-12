# Record the KASE demonstration

Aim for a 3–4 minute screen recording. Use the Corporate Actions route. Keep all explorer links on **Devnet** and say **testUSD**, not dollars received in a bank account.

## Prepare before recording

- Create/fund the browser demo wallet and finish all six instrument setup steps. At least 0.1 Devnet SOL is enough for this small fixture; the faucet can be unavailable.
- Keep the corporate page, a Solscan tab and the technical overview ready.
- Ensure the microphone works, or use typed commands. Browser voice quality is device-dependent.
- The three-minute maturity starts when instrument terms are prepared. Preparing the recording can take longer than this; partial redemption remains a valid partial action even after that demo timestamp.

## Suggested sequence

**0:00–0:20 — Introduction.** “I'm Muhamed-Kanapiya, founder of WhisperPay. We started with voice-guided payments on Solana. For the KASE challenge, we added a corporate-actions desk that turns a holder registry into reviewed, verifiable settlements.”

**0:20–0:45 — Instrument and holders.** Show the 1,000 testUSD face value, 10% annual coupon, three investors and 60 bonds. Explain that the clock is compressed and the tokens are non-transferable fixtures. Ask “Show holders” or “Show summary.”

**0:45–1:30 — Coupon.** Say or type “Prepare coupon.” Show the finalized record slot, holder addresses and 500 / 1,000 / 1,500 entitlements. Confirm the snapshot, allow finality, then prepare and confirm settlement. Open the receipt with all three transfers.

**1:30–2:10 — Additional action.** Select 20% partial redemption. Record the new snapshot and settle 2,000 / 4,000 / 6,000 testUSD. Show that 2 / 4 / 6 bonds are burned and 48 remain.

**2:10–2:55 — Maturity.** Record the last snapshot. Show 8,400 / 16,800 / 25,200 testUSD due, including the final coupon. Settle, refresh and show zero outstanding bonds. Open the final transaction.

**2:55–3:20 — Evidence and boundaries.** Download the public audit, show the on-chain snapshot commitments, and explain that testUSD simulates cash; transfers and burns are real. Entitlements and schedule checks currently run in the trusted issuer client. KASE, banks, KYC and production custody are future integrations.

**Closing.** Show the live demo, repository and technical overview links. Describe the next step: reviewed program-enforced entitlements and institutional signing.

## If the public RPC is slow

Do not claim a pending action succeeded. Wait, refresh, or transparently show **Inspect completed run**, which contains a previously verified Devnet lifecycle with public receipts. Label that segment as recorded evidence of a completed run.

## Before submission

- Confirm main-hackathon registration and Kazakhstan regional eligibility.
- Link a video that actually shows all three corporate actions. A wallet-only payment video does not demonstrate the new KASE requirements.
- Include the working `/corporate/` URL, source repository and `docs/KASE-TECHNICAL.md`.
- Review the entry and the organizer's current rules before submitting.
