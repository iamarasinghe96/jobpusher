import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JobPusher — AI-Powered Job Matching",
  description: "Find jobs on Seek, LinkedIn and Indeed matched to your CV by Claude AI. Albury-Wodonga, V/Line corridor and Melbourne.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
