import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "iHobbyWorld - RC marketplace",
  description: "RC vehicles and components marketplace for auctions, seller tools, buyer workflows, and moderation.",
  ...(process.env.DEPLOYMENT_MODE === "demo" ? { robots: { index: false, follow: false } } : {})
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const document = (
    <html lang="en">
      <body>
        {process.env.DEPLOYMENT_MODE === "demo" && (
          <aside className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950" aria-label="Demo notice">
            Demo site — use test information. Payments and email delivery are unavailable; AI guidance is simulated.
          </aside>
        )}
        {children}
      </body>
    </html>
  );

  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY) {
    return <ClerkProvider>{document}</ClerkProvider>;
  }

  return document;
}
