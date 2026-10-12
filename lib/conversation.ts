import { amountDigits, cleanCommand, parseIntent, parseToken, paymentAmount, toBaseUnits, TOKEN_PATTERN } from "./parseIntent";
import type { Intent, ResolvedIntent, Token } from "./types";

export type PaymentDraft = { amount?: string; token?: Token; recipient?: string };
export type PaymentTurn = { draft: PaymentDraft; prompt: string; intent?: Intent };

function finish(draft: PaymentDraft): PaymentTurn {
  if (!draft.amount) return { draft, prompt: "How much would you like to send? You can say ‘zero point one SOL’ or ‘five USDC’." };
  if (!draft.token) return { draft, prompt: "Which token would you like to send: SOL, USDC, or WHISPER?" };
  // Validate precision again when a token arrives after the amount.
  const amount = paymentAmount(draft.amount, draft.token);
  if (!draft.recipient) return { draft, prompt: "Who should receive it? Say a saved contact name, or paste a full wallet address." };
  return { draft, prompt: "Let's review that payment.", intent: { action: "send", amount, token: draft.token, recipient: draft.recipient } };
}

function amountAndToken(text: string): Pick<PaymentDraft, "amount" | "token"> {
  const match = text.match(new RegExp(`^(?:(.+?) )?(${TOKEN_PATTERN})$`, "i"));
  const token = match ? parseToken(match[2])! : undefined;
  const value = match ? match[1] : text;
  if (!value) return { token };
  const amount = amountDigits(value);
  paymentAmount(amount, token ?? "SOL");
  return { amount, token };
}

/** Each reply fills only the requested fields. No transfer or approval occurs here. */
export function paymentTurn(text: string, previous: PaymentDraft | null = null): PaymentTurn {
  const cleaned = cleanCommand(text);
  if (/^(?:make a payment|send a payment|start a payment|send|pay|transfer)$/i.test(cleaned)) return finish({});
  const start = cleaned.match(/^(?:send|pay|transfer) (.+)$/i);
  if (start) {
    // Recipient-first wording is accepted only as a complete payment.
    try {
      const intent = parseIntent(cleaned);
      return finish({ amount: intent.amount.toFixed(intent.token === "SOL" ? 9 : 6).replace(/0+$/, "").replace(/\.$/, ""), token: intent.token, recipient: intent.recipient });
    } catch { /* Incomplete commands are clarified below; invalid amounts still fail validation. */ }
    const to = start[1].match(/^(?:(.*?) )?to (.+)$/i);
    const recipient = to?.[2];
    const value = to ? to[1] : start[1];
    return finish({ ...(value ? amountAndToken(value) : {}), ...(recipient ? { recipient } : {}) });
  }
  if (!previous) throw new Error("Try ‘Send 0.1 SOL to mom’, or say ‘Make a payment’ and I'll guide you.");
  if (!previous.amount) {
    const reply = amountAndToken(cleaned);
    return finish({ ...previous, ...reply, token: reply.token ?? previous.token });
  }
  if (!previous.token) {
    const token = parseToken(cleaned);
    if (!token) throw new Error("Please choose SOL, USDC, or WHISPER. I won't guess the currency.");
    return finish({ ...previous, token });
  }
  if (!previous.recipient) {
    const recipient = cleaned.replace(/^to /i, "");
    if (!recipient || /^(confirm|yes|no|send)$/i.test(recipient)) throw new Error("Tell me a contact name or paste the recipient's full address first.");
    return finish({ ...previous, recipient });
  }
  throw new Error("Please review the payment, or start a new one.");
}

export function revisePayment(text: string, previous: ResolvedIntent): Intent | null {
  const cleaned = cleanCommand(text);
  const recipient = cleaned.match(/^(?:change (?:the )?recipient to|send (?:it|that) to) (.+)$/i);
  if (recipient) return { ...previous, recipient: recipient[1] };
  const token = cleaned.match(/^(?:change (?:the )?(?:token|asset) to|use) (.+)$/i);
  if (token) {
    const next = parseToken(token[1]);
    if (!next) throw new Error("Choose SOL, USDC, or WHISPER.");
    toBaseUnits(previous.amount, next === "SOL" ? 9 : 6);
    return { ...previous, token: next };
  }
  return null;
}

export function paymentReadback(intent: ResolvedIntent): string {
  const recipient = intent.recipient.length > 25 ? "the wallet shown on screen" : intent.recipient;
  return `You're sending ${intent.amount} ${intent.token} to ${recipient}. Address ending ${intent.address.slice(-6).split("").join(" ")}. Check the full address and costs on screen. When the balance check passes, tap the microphone and say confirm, or use Confirm and Send. You can also change the amount or cancel. Nothing has been sent.`;
}
