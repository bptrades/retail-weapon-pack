import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold">Help / FAQ</div>
            <div className="text-sm text-slate-400">
              How the Retail Weapon Pack works (and what it doesn’t do).
            </div>
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
              <CardTitle className="text-sm">What this app does</CardTitle>
              <CardDescription>Fast intraday snapshot + bias + plan formatting.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-200 space-y-2">
              <ul className="list-disc pl-5 space-y-1">
                <li>Fetches live (or last-session) market snapshot data for a ticker.</li>
                <li>Computes an explainable momentum score (0–10).</li>
                <li>Turns that snapshot into a mechanical playbook with an AI prompt.</li>
                <li>Stores snapshot history per symbol and raises “bias flip” alerts.</li>
                <li>Includes a simple risk calculator for shares and R targets.</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Momentum score (0–10)</CardTitle>
              <CardDescription>Simple, transparent scoring (not “magic”).</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-200 space-y-2">
              <p>
                The score starts at <b>5</b> (neutral), then adjusts based on:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><b>VWAP state</b> (above adds, below subtracts)</li>
                <li><b>EMA trend</b> on 5m and 15m (bull adds, bear subtracts)</li>
                <li><b>RSI state</b> (bullish adds, bearish subtracts)</li>
                <li><b>Volume state</b> (above avg adds, below avg subtracts)</li>
              </ul>
              <p className="text-slate-400">
                This is an MVP scoring model meant to be understandable. You can upgrade weights and signals later.
              </p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Confidence (1–5)</CardTitle>
              <CardDescription>Derived from the momentum score.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-200 space-y-2">
              <p>
                Confidence is just a normalized view of the 0–10 score:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>1–2: <b>Low</b></li>
                <li>3: <b>Moderate</b></li>
                <li>4: <b>Strong</b></li>
                <li>5: <b>High Conviction</b></li>
              </ul>
              <p className="text-slate-400">
                This avoids meaningless decimals and makes the UI easier to read.
              </p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Bias flip alerts</CardTitle>
              <CardDescription>What triggers an alert.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-200 space-y-2">
              <p>
                Every snapshot produces a <b>bias_guess</b> from the score:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><b>Bullish</b> if score ≥ 6.5</li>
                <li><b>Bearish</b> if score ≤ 3.5</li>
                <li><b>Neutral</b> otherwise</li>
              </ul>
              <p className="text-slate-400">
                If the new snapshot bias differs from the previous one for that symbol, you get an alert (optionally with sound).
              </p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">AI quota / 429 errors</CardTitle>
              <CardDescription>Free-tier Gemini limits are normal.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-200 space-y-2">
              <p>
                If Gemini returns a <b>429 quota</b> error, the app will cool down briefly and you can still:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Fetch snapshots</li>
                <li>Use history</li>
                <li>Use bias flip alerts</li>
                <li>Use risk calculator</li>
              </ul>
              <p className="text-slate-400">
                To avoid burning quota: keep “Auto AI on watchlist click” off, and only run AI when you’re ready to post.
              </p>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5">
            <CardHeader>
              <CardTitle className="text-sm">Disclaimer</CardTitle>
              <CardDescription>Important.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-200 space-y-2">
              <p>
                This tool is for education and workflow support. It is <b>not financial advice</b>. Market data may be delayed
                depending on your feed.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 text-xs text-slate-500">
          Tip: link this Help page from your Gumroad product description as “Documentation”.
        </div>
      </div>
    </div>
  );
}