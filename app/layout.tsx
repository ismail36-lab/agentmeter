import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentMeter - LLM Telemetry & Cost Analytics",
  description: "Real-time usage tracking, token monitoring, and cost calculation for OpenAI and Anthropic models.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark w-full max-w-full overflow-x-hidden">
      <body className="bg-[#090d16] text-slate-100 antialiased min-h-screen w-full max-w-full overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
