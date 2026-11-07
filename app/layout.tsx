import type { Metadata } from "next";
import { B612_Mono, Hanken_Grotesk, Newsreader } from "next/font/google";
import "./globals.css";

const serif = Newsreader({ variable: "--font-newsreader", subsets: ["latin"] });
const mono = B612_Mono({ variable: "--font-b612", weight: ["400", "700"], subsets: ["latin"] });
const sans = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bring your own logs to Codag's log MCP",
  description:
    "codag-log-mcp 0.1.0 opens two exact CSV layouts. This page converts docker/kubectl --timestamps output and JSON lines into one, with a recorded Postgres incident run. Unofficial demo by Cheryl Aurelia.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable} ${sans.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
