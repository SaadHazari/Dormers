'use client';

import { useEffect } from 'react';
import {
  SUPPORT_EMAIL,
  WHATSAPP_NUMBER,
  WHATSAPP_NUMBER_DISPLAY,
  WHATSAPP_HANDLE_DISPLAY,
  whatsAppHref,
} from '@/lib/contacts';

export default function PrivacyPolicy() {
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
            fontFamily: "'Lora', Georgia, serif",
          }}>
            Privacy Policy
          </h1>
          <p className="text-[#EEE9DA] text-lg">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </div>

        {/* Content Container */}
        <div className="max-w-4xl mx-auto bg-[#031624] rounded-3xl shadow-xl p-6 sm:p-8 md:p-12">
          <div className="space-y-8 text-[#EEE9DA]/80">
            {/* 1. Introduction */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">1. Introduction</h2>
              <p className="mb-4">
                Dormer&apos;s Restaurant LLC (&quot;Dormer&apos;s,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting the privacy and security of our customers&apos; personal data. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our meal subscription services, website, and related platforms.
              </p>
              <p>
                By accessing our services, you acknowledge and consent to the practices described in this Privacy Policy. If you do not agree, please refrain from using our services. We encourage you to review this Privacy Policy regularly to stay informed about how we protect your personal data.
              </p>
            </section>

            {/* 2. Information We Collect */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">2. Information We Collect</h2>
              <p className="mb-4">We may collect the following types of personal information:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Personal Identification Information: Name, phone number, email address, and delivery address.</li>
                <li>Payment Information: Billing details and payment method (processed securely via third-party payment gateways).</li>
                <li>Subscription Preferences: Meal choices, dietary preferences, and order history.</li>
                <li>Technical Information: IP address, device type, browser type, and website usage data.</li>
                <li>Communications: Customer service inquiries, feedback, and reviews.</li>
                <li>Location Information: General location data, when permitted, to optimize delivery efficiency.</li>
                <li>Device Data: How users interact with our website and mobile applications to enhance functionality.</li>
              </ul>
              <p className="mt-4">
                We do not collect or store sensitive personal data such as government-issued IDs or full financial account details.
              </p>
            </section>

            {/* 3. How We Use Your Information */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">3. How We Use Your Information</h2>
              <p className="mb-4">We use collected information to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Process meal orders and subscriptions.</li>
                <li>Manage customer accounts and preferences.</li>
                <li>Improve service quality, menu offerings, and user experience.</li>
                <li>Send notifications regarding order status, promotions, and updates.</li>
                <li>Process payments and prevent fraudulent activities.</li>
                <li>Respond to customer inquiries and support requests.</li>
                <li>Conduct surveys and gather feedback to enhance services.</li>
                <li>Comply with legal and regulatory obligations.</li>
                <li>Offer personalized meal recommendations based on order history.</li>
              </ul>
              <p className="mt-4">
                Your information will not be used for purposes beyond those listed above without your consent.
              </p>
            </section>

            {/* 4. How We Share Your Information */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">4. How We Share Your Information</h2>
              <p className="mb-4">Dormer&apos;s does not sell, rent, or trade personal data with third parties. However, your information may be shared in the following situations:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Payment Processing: Secure third-party payment processors handle transactions.</li>
                <li>Service Providers: Trusted partners assist with logistics, delivery, IT support, or customer service.</li>
                <li>Legal Requirements: If required by law, court orders, or government regulations.</li>
                <li>Business Transfers: In case of a merger, acquisition, or sale of Dormer&apos;s assets.</li>
                <li>Marketing Partners: With your consent, we may share limited, non-sensitive data with trusted partners for relevant offers.</li>
                <li>Operational Necessities: For fraud prevention, security measures, or risk assessment purposes.</li>
              </ul>
            </section>

            {/* 5. Data Security & Protection */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">5. Data Security & Protection</h2>
              <p className="mb-4">We employ industry-standard security measures to protect personal data, including:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Secure encryption for transactions and sensitive data.</li>
                <li>Restricted access to customer data for authorized personnel only.</li>
                <li>Regular security assessments and IT system updates.</li>
                <li>Secure cloud storage solutions to safeguard data.</li>
                <li>Multi-factor authentication for administrative access to sensitive customer records.</li>
              </ul>
              <p className="mt-4">
                While we take stringent precautions, no system is entirely risk-free. Customers should use strong passwords and exercise caution when sharing personal details online.
              </p>
            </section>

            {/* 6. Cookies & Tracking Technologies */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">6. Cookies & Tracking Technologies</h2>
              <p className="mb-4">Our website may use cookies and tracking tools to enhance user experience by:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Remembering user preferences and past orders.</li>
                <li>Analyzing site traffic and performance.</li>
                <li>Customizing promotional content based on customer behavior.</li>
                <li>Measuring the effectiveness of marketing campaigns.</li>
                <li>Detecting and preventing fraudulent activity.</li>
              </ul>
              <p className="mt-4">
                Users may adjust browser settings to disable cookies, though this may impact site functionality.
              </p>
            </section>

            {/* 7. Data Retention */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">7. Data Retention</h2>
              <p>
                We retain customer information only as long as necessary for service fulfillment and legal compliance. The retention period varies based on data type and legal requirements. Customers may request data deletion by contacting us at <a href={`mailto:${SUPPORT_EMAIL}`} className="text-orange-400 hover:underline">{SUPPORT_EMAIL}</a>.
              </p>
            </section>

            {/* 8. Your Rights & Choices */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">8. Your Rights & Choices</h2>
              <p className="mb-4">Customers have the following rights regarding their data:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Access: Request a copy of personal data we hold.</li>
                <li>Correction: Update inaccurate or incomplete information.</li>
                <li>Deletion: Request removal of personal data, subject to legal obligations.</li>
                <li>Marketing Preferences: Opt out of promotional messages via email, SMS, or WhatsApp.</li>
                <li>Data Portability: Request transfer of personal data to another provider when feasible.</li>
                <li>Restriction of Processing: Request limited use of personal data under specific circumstances.</li>
              </ul>
              <p className="mt-4">
                To exercise these rights, contact us at <a href={`mailto:${SUPPORT_EMAIL}`} className="text-orange-400 hover:underline">{SUPPORT_EMAIL}</a>.
              </p>
            </section>

            {/* 9. Children's Privacy */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">9. Children&apos;s Privacy</h2>
              <p>
                Dormer&apos;s services are intended for university students and adults. We do not knowingly collect personal data from individuals under 18. If we discover such data, we will take steps to remove it.
              </p>
            </section>

            {/* 10. Changes to This Privacy Policy */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">10. Changes to This Privacy Policy</h2>
              <p>
                Dormer&apos;s reserves the right to update this Privacy Policy periodically. Any significant changes will be communicated via email or posted on our website. We encourage users to review this Privacy Policy regularly to stay informed about our data practices.
              </p>
            </section>

            {/* 11. Contact Information */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">11. Contact Information</h2>
              <p className="mb-4">For any questions, concerns, or requests related to this Privacy Policy, please contact us:</p>
              <ul className="space-y-2">
                <li>Email: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-orange-400 hover:underline">{SUPPORT_EMAIL}</a></li>
                <li>Phone: <a href={`tel:${WHATSAPP_NUMBER}`} className="text-orange-400 hover:underline">{WHATSAPP_NUMBER_DISPLAY}</a></li>
                <li>WhatsApp: <a href={whatsAppHref()} className="text-orange-400 hover:underline">{WHATSAPP_HANDLE_DISPLAY}</a></li>
              </ul>
            </section>

            <div className="text-center italic pt-8 border-t border-[#EEE9DA]/20">
              By using Dormer&apos;s services, you confirm that you have read, understood, and agreed to this Privacy Policy.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 