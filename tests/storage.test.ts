import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import { readWallet, resetStorage, save, STORAGE } from "../lib/storage";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
});
afterEach(() => vi.unstubAllGlobals());
describe("demo key persistence", () => {
  it("restores the same public key after saving", () => {
    const key = Keypair.generate();
    save(STORAGE.key, Array.from(key.secretKey));
    expect(readWallet()?.publicKey.toBase58()).toBe(key.publicKey.toBase58());
  });
  it("does not silently replace a corrupted private key", () => {
    save(STORAGE.key, [1, 2, 3]);
    expect(() => readWallet()).toThrow("damaged");
    expect(localStorage.getItem(STORAGE.key)).toBe("[1,2,3]");
  });
  it("reset removes only WhisperPay data", () => {
    localStorage.setItem("another-app", "keep");
    save(STORAGE.key, Array(64).fill(1));
    save(STORAGE.voice, { voiceURI: "test" });
    resetStorage();
    expect(readWallet()).toBeNull();
    expect(localStorage.getItem(STORAGE.voice)).toBeNull();
    expect(localStorage.getItem("another-app")).toBe("keep");
  });
});
