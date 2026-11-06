import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'DocPilot',
  description: 'Agentic RAG over your documents, with citations, evals and an MCP server.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            Doc<span>Pilot</span>
          </Link>
          <span className="muted small">Agentic RAG with citations</span>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
