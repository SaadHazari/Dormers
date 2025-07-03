'use client';

import Link from 'next/link';
// import Image from 'next/image';
import { FaInstagram, FaFacebook  } from 'react-icons/fa';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';

export default function Footer() {
  const router = useRouter();
  const { theme } = useTheme();
  
  const deliveryLocations = [
    'The Myriad',
    'KSK Homes',
    'Yugo',
    'DSOA Residences',
  ];

  const quickLinks = [
  { name: 'MENU', href: '/home#menu' },
  { name: 'FAQ’S', href: '/home#faq' },
  { name: 'About US', href: '/home#about' },
  { name: 'TESTIMONIALS', href: '/home#testimonials' },
];

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const isHomeHash = href.startsWith('/home#');
    
    if (isHomeHash) {
      const hash = href.split('#')[1];
      if (window.location.pathname === '/home') {
        // If already on home page, just scroll
        const element = document.querySelector(`#${hash}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        // If not on home page, navigate and then scroll
        router.push(href);
      }
    } else {
      router.push(href);
    }
  };

  return (
    <footer className={`${theme === 'light' ? 'bg-[#031624] text-[#1E3A4F]' : 'bg-[#031624] text-white'} py-10`}>
  <div className="container mx-auto px-4">

    {/* Force 2 columns always */}
    <div className="grid grid-cols-2 gap-6">
      {/* Delivery Locations */}
      <div>
        <h3 className="font-semibold mb-4"
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 700,
              lineHeight: "100%",
              fontSize:'13px',
              letterSpacing: "0",
            }}>
          Delivery Locations
        </h3>
        <ul className="space-y-2">
          {deliveryLocations.map((location) => (
            <li
              key={location}
              className={`${theme === 'light' ? 'text-[#1E3A4F] hover:text-[#FF6B00]' : 'text-gray-300 hover:text-orange-400'} transition-colors`}
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 400,
                lineHeight: "100%",
                fontSize:'12px',
                letterSpacing: "0.5px",
              }}>
              {location}
            </li>
          ))}
        </ul>
      </div>

      {/* Menu / Quick Links */}
      <div>
        {/* <h3 className="font-semibold mb-4"
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontWeight: 700,
              lineHeight: "100%",
              fontSize:'15px',
              letterSpacing: "0",
            }}>
          Menu
        </h3> */}
        <ul className="space-y-2">
          {quickLinks.map((link) => (
            <li key={link.name}>
              <a
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="hover:text-orange-400 transition-colors"
                style={{
                  fontFamily: 'Montserrat, sans-serif',
                 fontSize:'12px',
                  fontWeight: 700,
                  lineHeight: '2px',
                }}>
                {link.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>

    {/* Follow Us */}
<div className="mt-10 md:justify-start">
  <div>
    <h3
      className="text-left font-semibold mb-4"
      style={{
        fontFamily: "Montserrat, sans-serif",
        fontWeight: 700,
        lineHeight: "100%",
        fontSize: '13px',
        letterSpacing: "0",
      }}
    >
      Follow Us
    </h3>
    <div className="flex items-center space-x-4">

      <a
        href=""
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center space-x-2 ${theme === 'light' ? 'text-[#1E3A4F] hover:text-[#FF6B00]' : 'text-gray-300 hover:text-orange-400'} transition-colors`}
      >
        <FaFacebook className="w-4 h-4"/>
      </a>
      <a
        href="https://instagram.com/dormers"
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center space-x-2 ${theme === 'light' ? 'text-[#1E3A4F] hover:text-[#FF6B00]' : 'text-gray-300 hover:text-orange-400'} transition-colors`}
      >
        <FaInstagram className="w-4 h-4"/>
      </a>
      
    </div>
  </div>
</div>


    {/* Footer Bottom */}
<div
  className="mt-8 pt-8 border-t border-white/30 text-sm text-center"
  style={{
    fontFamily: 'Poppins, sans-serif',
    fontWeight: 400,
    lineHeight: '100%',
    letterSpacing: '0.5px',
    fontSize: '11px'
  }}
>
  <div className="flex flex-row justify-center items-center gap-6 flex-wrap">
    <Link href="/cookies-policy" className="hover:text-orange-400">
      Cookies Policy
    </Link>
    <Link href="/legal-terms" className="hover:text-orange-400">
      Legal Terms
    </Link>
    <Link href="/privacy" className="hover:text-orange-400">
      Privacy Policy
    </Link>
  </div>
</div>

  </div>
</footer>



  );
} 