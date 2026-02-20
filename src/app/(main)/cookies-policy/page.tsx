'use client';

import { useEffect } from 'react';

export default function CookiesPolicy() {
  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-[#1E3A4F] py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4" style={{ 
            fontFamily: "'Typo Round Bold Demo', sans-serif",
          }}>
            Cookies Policy
          </h1>
          <p className="text-[#EEE9DA] text-lg">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Content Container */}
        <div className="max-w-4xl mx-auto bg-[#031624] rounded-3xl shadow-xl p-6 sm:p-8 md:p-12">
          <div className="space-y-8 text-[#EEE9DA]/80"
             style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 300,
                lineHeight: "160%",
              }}
          >
            {/* 1. Introduction */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4" style={{ fontFamily: "Montserrat, sans-serif" }}>
                1. What Are Cookies?
              </h2>
              <p className="mb-4">
                Cookies are small text files that are placed on your computer, smartphone, or other device when you visit our website. They are widely used to make websites work more efficiently, as well as to provide reporting information and personalized experiences.
              </p>
              <p>
                At Dormer&apos;s, we use cookies to understand how you interact with our menu, ensure our website runs smoothly, and serve you relevant advertisements.
              </p>
            </section>

            {/* 2. Types of Cookies We Use */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4" style={{ fontFamily: "Montserrat, sans-serif" }}>
                2. Types of Cookies We Use
              </h2>
              <ul className="space-y-4">
                <li>
                  <strong className="text-white">Strictly Necessary Cookies:</strong> These cookies are essential for you to browse our website and use its features, such as accessing secure areas or managing your meal subscription. The website cannot function properly without these cookies.
                </li>
                <li>
                  <strong className="text-white">Performance and Analytics Cookies:</strong> These cookies collect information about how visitors use our website, like which pages are visited most often and if they get error messages. We use this data to improve how our website works.
                </li>
                <li>
                  <strong className="text-white">Functionality Cookies:</strong> These allow the website to remember choices you make (such as your language, region, or your Veg/Non-Veg menu toggle preferences) and provide enhanced, more personal features.
                </li>
                <li>
                  <strong className="text-white">Targeting and Advertising Cookies:</strong> These cookies track your browsing habits to enable us to show advertising which is more likely to be of interest to you. For example, we use Google Ads to promote our meal plans to students who have previously visited our site.
                </li>
              </ul>
            </section>

            {/* 3. Third-Party Cookies */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4" style={{ fontFamily: "Montserrat, sans-serif" }}>
                3. Third-Party Cookies
              </h2>
              <p>
                In some special cases, we also use cookies provided by trusted third parties. For example, our site uses Google Analytics and Google Ads, which are among the most widespread and trusted analytics solutions on the web. These cookies may track things such as how long you spend on the site and the pages that you visit so we can continue to produce engaging content and relevant offers.
              </p>
            </section>

            {/* 4. How Long Do Cookies Last? */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4" style={{ fontFamily: "Montserrat, sans-serif" }}>
                4. How Long Do Cookies Last?
              </h2>
              <p className="mb-4">
                The length of time a cookie will stay on your browsing device depends on whether it is a &quot;persistent&quot; or &quot;session&quot; cookie.
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong className="text-white">Session Cookies:</strong> These are temporary and are deleted from your device when your web browser closes.</li>
                <li><strong className="text-white">Persistent Cookies:</strong> These stay on your device until they expire or are deleted manually. They are used to remember your preferences for your next visit.</li>
              </ul>
            </section>

            {/* 5. Managing Your Cookies */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4" style={{ fontFamily: "Montserrat, sans-serif" }}>
                5. How to Manage Your Cookies
              </h2>
              <p>
                You have the right to decide whether to accept or reject cookies. You can set or amend your web browser controls to accept or refuse cookies. If you choose to reject cookies, you may still use our website though your access to some functionality and areas of our website may be restricted. As the means by which you can refuse cookies through your web browser controls vary from browser-to-browser, you should visit your browser&apos;s help menu for more information.
              </p>
            </section>

            {/* 6. Contact Information */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4" style={{ fontFamily: "Montserrat, sans-serif" }}>
                6. Contact Us
              </h2>
              <p className="mb-4">If you have any questions about our use of cookies or other technologies, please contact us at:</p>
              <ul className="space-y-2">
                <li>Email: <a href="mailto:support@dormers.ae" className="text-orange-400 hover:underline">support@dormers.ae</a></li>
                <li>Phone: <a href="tel:+971504619384" className="text-orange-400 hover:underline">+971 504 619 384</a></li>
              </ul>
            </section>

            <div className="text-center italic pt-8 border-t border-[#EEE9DA]/20">
              By continuing to browse our site, you consent to our use of cookies.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
