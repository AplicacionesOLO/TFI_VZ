import { ReactNode } from 'react';
import TopNav from './TopNav';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50/60 font-sans">
      <TopNav />
      <main className="pt-16">
        {children}
      </main>
    </div>
  );
}