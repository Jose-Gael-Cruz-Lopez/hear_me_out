import type { Metadata, Viewport } from 'next';
import { Anton, Nunito } from 'next/font/google';
import './globals.css';

const display = Anton({ weight: '400', subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Nunito({ weight: ['600', '700', '800', '900'], subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'Pitch Fight',
  description: 'Argue for where to go. The AI host runs the show. The winner becomes the plan.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0e1116',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="ambient" aria-hidden />
        {children}
      </body>
    </html>
  );
}
