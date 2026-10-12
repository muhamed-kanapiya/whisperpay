import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
export default function NotFound() { return <main id="main" className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center"><Logo /><h1 className="text-4xl font-semibold tracking-tight">This whisper got lost.</h1><p className="text-muted">We couldn’t find that page.</p><Button asChild><Link href="/">Back to home</Link></Button></main>; }
