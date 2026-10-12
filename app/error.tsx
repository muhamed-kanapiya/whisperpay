"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <main id="main" className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center"><h1 className="text-2xl font-semibold">Something interrupted this whisper.</h1><p className="max-w-md text-sm text-muted">Your saved demo wallet stays in this browser. Try reloading the page.</p><Button onClick={reset}>Try again</Button></main>; }
