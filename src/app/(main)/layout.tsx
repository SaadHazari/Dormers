import Navbar from '@/app/components/Navbar';
import Footer from '@/app/components/Footer';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#1E3A4F' }}>
      <Navbar />
      <main className="flex-grow">{children}</main>
      <Footer />
    </div>
  );
} 