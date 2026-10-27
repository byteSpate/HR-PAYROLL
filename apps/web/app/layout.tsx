import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Inter, Noto_Sans_Bengali } from 'next/font/google';
import { Toaster } from '@erp/ui/components/sonner';
import { cn } from '@erp/ui/lib/cn';
import { QueryProvider } from '@/lib/query-provider';
import { SessionProvider } from '@/lib/session';
import './globals.css';

const geistHeading = Geist({ subsets: ['latin'], variable: '--font-heading' });

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Neither Geist nor Inter carries Bengali glyphs, so without a real face the
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
        geistSans.variable,
        geistMono.variable,
        'font-sans',
        inter.variable,
        geistHeading.variable,
        notoBengali.variable,
      )}
    >
      {/* Browser extensions (Grammarly, password managers) mutate <body> before hydration; the flag is one level deep,
          so real mismatches inside the tree are still reported. */}
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <QueryProvider>
          <SessionProvider>{children}</SessionProvider>
        </QueryProvider>
        <Toaster theme="light" position="top-center" closeButton />
      </body>
    </html>
  );
}
