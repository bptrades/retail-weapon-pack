// app/layout.tsx
import type { Metadata } from "next";
import { Toaster } from "sonner";
import GlobalNav from "@/components/GlobalNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Retail Weapon Pack",
  description: "0-DTE options bias engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--bg-2)",
              border: "1px solid var(--border-2)",
              color: "var(--t-1)",
              fontFamily: "var(--font-sans)",
              fontSize: 12,
            },
          }}
        />
        {/* Global nav renders on EVERY page automatically */}
        <GlobalNav />
        {/* paddingTop offsets the fixed 48px nav so content isn't hidden behind it */}
        <div style={{ paddingTop: 48 }}>
          {children}
        </div>
      </body>
    </html>
  );
}