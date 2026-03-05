import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold">Changelog</div>
            <div className="text-sm text-slate-400">What changed between versions.</div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              ← Back to Dashboard
            </Link>
            <Badge variant="outline" className="border-white/10 bg-white/5">
              v0.1.0
            </Badge>
          </div>
        </div>

        <Separator className="my-6 bg-white/10" />

        <div className="grid gap-4">
          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">v0.1.0</CardTitle>
              <CardDescription>Initial public MVP.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-200 space-y-2">
              <ul className="list-disc pl-5 space-y-1">
                <li>Dashboard UI (Tailwind + shadcn)</li>
                <li>Symbol search + TradingView chart embed</li>
                <li>Watchlist</li>
                <li>Snapshot history (per symbol)</li>
                <li>Bias flip alerts (optional sound)</li>
                <li>Risk calculator (shares + R targets)</li>
                <li>Copy-to-X post generation</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-xs text-slate-500">
          Next planned: options contract sizing, ATR-based targets, and alert thresholds per symbol.
        </div>
      </div>
    </div>
  );
}