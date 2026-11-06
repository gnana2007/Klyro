import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Klyro — Hook intelligence, with evidence",
  description:
    "Inspect Uniswap v4 hook permissions, trace findings, compare versions and verify analysis passports.",
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
        <header className="topbar">
          <div className="topbar-inner">
            <a className="wordmark" href="/" aria-label="Klyro home">
              <span className="brand-mark" aria-hidden="true">
                ⌗
              </span>
              Klyro
            </a>
            <nav aria-label="Main navigation">
              <a href="/">Scanner</a>
              <a href="/?view=history">Scan history</a>
              <a href="/?view=registry">Registry</a>
              <a
                href="https://github.com/gnana2007/Klyro"
                target="_blank"
                rel="noreferrer"
              >
                Source code
              </a>
            </nav>
            <span className="header-note">Uniswap v4 intelligence</span>
          </div>
        </header>
        {children}
        <footer>
          <div className="footer-inner">
            <span>
              Know what a hook does. See what changed. Verify what you trust.
            </span>
            <span>Bounded analysis. Every claim needs evidence.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
