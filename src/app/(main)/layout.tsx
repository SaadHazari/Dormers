import Navbar from "@/app/components/Navbar";
import Footer from "@/app/components/Footer";
import AboutUs from "../components/AboutUs";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#1E3A4F" }}
    >
      <div className="main_content">
        <Navbar />
        <main className="flex-grow">{children}</main>
      </div>
      <div id="footer">
        <div className="slide-in-section">
          <AboutUs />
        </div>
      </div>
      <div className="slide-in-section" id="sidefotter">
        <Footer />
      </div>
    </div>
  );
}
