import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '오레곤벧엘교회 장소 예약',
  description: '회의실 등 교회 장소 예약 시스템',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
