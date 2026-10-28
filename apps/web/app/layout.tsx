import type { Metadata, Viewport } from 'next';
import { Geist_Mono, Noto_Sans_Bengali, Public_Sans, Sora } from 'next/font/google';
import { Toaster } from '@erp/ui/components/sonner';
import { cn } from '@erp/ui/lib/cn';
import { QueryProvider } from '@/lib/query-provider';
import { SessionProvider } from '@/lib/session';
import './globals.css';

const sora = Sora({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-heading' });

const publicSans = Public_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-sans' });

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Neither Public Sans nor Sora carries Bengali glyphs, so without a real face the
// browser falls back to whatever the OS has: three typefaces with three metrics.
const notoBengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  variable: '--font-bengali',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ERP',
  description: 'Business management',
};

// Must be its own export: Next.js 16 silently ignores `viewport` nested inside `metadata`.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        'h-full',
        'antialiased',
        geistMono.variable,
        'font-sans',
        publicSans.variable,
        sora.variable,
        notoBengali.variable,
      )}
    >
      {/* Browser extensions (Grammarly, password managers) mutate <body> before hydration; the flag is one level deep,
          so real mismatches inside the tree are still reported. */}
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-canvas text-ink">
        <QueryProvider>
          <SessionProvider>{children}</SessionProvider>
        </QueryProvider>
        <Toaster theme="light" position="top-center" closeButton />
      </body>
    </html>
  );
}
