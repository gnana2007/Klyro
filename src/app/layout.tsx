import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Klyro — Uniswap v4 hook investigation",
  description:
    "Understand what your hooks can do. Know what has changed. Follow the evidence.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
