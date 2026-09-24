import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Assay — The price behind the ticker",
  description:
    "Compare tokenized stock exposure on Solana. Understand the premium before you trade.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var saved=localStorage.getItem('assay-theme');document.documentElement.dataset.theme=saved==='light'||saved==='dark'?saved:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){document.documentElement.dataset.theme='light'}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
