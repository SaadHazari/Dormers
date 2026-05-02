'use client';

import { useEffect } from 'react';

export default function TermsAndConditions() {
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
            Terms & Conditions
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
              <p>
                Welcome to Dormer&apos;s! These Terms & Conditions govern your use of our services, including meal subscriptions, delivery, and transactions. By subscribing to Dormer&apos;s, you agree to abide by these terms. If you do not agree, please refrain from using our services. Our goal is to provide high-quality, convenient, and nutritious meal solutions tailored to students&apos; needs.
              </p>
            </section>

            {/* 2. Service Overview */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">2. Service Overview</h2>
              <p>
                Dormer&apos;s provides meal subscription services to students, offering a diverse selection of vegetarian and non-vegetarian options with a rotating monthly menu. Meals are delivered directly to dormitories, adhering to the highest standards of quality, hygiene, and sustainability. We continuously refine our offerings based on customer feedback to ensure a top-tier dining experience.
              </p>
            </section>

            {/* 3. Subscription Plans & Payments */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">3. Subscription Plans & Payments</h2>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">3.1 Subscription Options</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Monthly Plan: 24 meals per month, delivered 6 days a week.</li>
                    <li>Weekly Plan: 6 meals per week.</li>
                    <li>Daily Plan: On-demand, subject to availability.</li>
                    <li>Customized Plans: Tailored meal plans based on dietary requirements and frequency preferences.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">3.2 Payment Terms</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Payments must be made in advance via credit/debit card, Apple Pay, bank transfer, or cash.</li>
                    <li>Refunds are not available once a subscription cycle begins, except in extraordinary cases at Dormer&apos;s discretion.</li>
                    <li>Customers must notify Dormer&apos;s at least one day in advance to skip a meal (up to 3 skips per month) and receive a meal credit.</li>
                    <li>Dormer&apos;s reserves the right to update pricing with prior notice.</li>
                    <li>The customer can pause their subscription, for a maximum of 1 time per month, in the event of a vacation, or a holiday break. The Subscription resumes once the customer returns & the remaining amount of meals are delivered accordingly.</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 4. Meal Delivery */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">4. Meal Delivery</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Meals are delivered Monday to Saturday according to the chosen subscription plan.</li>
                <li>Dormer&apos;s prioritizes timely delivery, though delays due to unforeseen circumstances (traffic, weather, etc.) will be communicated in advance.</li>
                <li>Customers must ensure availability to receive their delivery or provide clear alternative drop-off instructions.</li>
                <li>Meals are packaged in eco-friendly, biodegradable containers to support sustainability.</li>
                <li>Additional delivery specifications may be accommodated upon request.</li>
              </ul>
            </section>

            {/* 5. Food Quality & Allergies */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">5. Food Quality & Allergies</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Dormer&apos;s meals do not contain pork or alcohol.</li>
                <li>Customers with dietary restrictions or allergies must specify their preferences at the time of subscription.</li>
                <li>While precautions are taken, cross-contamination risks exist. Customers with severe allergies should exercise discretion.</li>
                <li>Our food safety protocols ensure that meals remain fresh and properly stored during transit.</li>
                <li>Special dietary meals, such as vegan or gluten-free options, may be available upon prior request.</li>
              </ul>
            </section>

            {/* 6. Cancellation & Modifications */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">6. Cancellation & Modifications</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Subscription Cancellation: Requests must be submitted at least 7 days before the renewal date.</li>
                <li>Meal Preferences: Customers may update their meal preferences once per month.</li>
                <li>Delivery Address Changes: Must be communicated at least 48 hours in advance.</li>
                <li>Paused Subscriptions: Customers may temporarily pause their subscription for up to 14 days within a billing cycle.</li>
              </ul>
            </section>

            {/* 7. Refund & Compensation Policy */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">7. Refund & Compensation Policy</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>No refunds are available for partially used subscription plans.</li>
                <li>In case of a missed or incorrect meal delivery, Dormer&apos;s will compensate with an additional meal credit.</li>
                <li>Refunds will only be considered for payment processing errors attributable to Dormer&apos;s.</li>
                <li>Compensation claims must be submitted within 48 hours of the issue.</li>
              </ul>
            </section>

            {/* 8. Customer Conduct & Responsibilities */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">8. Customer Conduct & Responsibilities</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Customers must provide accurate and up-to-date information when subscribing.</li>
                <li>Any misuse of Dormer&apos;s services, including fraudulent transactions or abuse of discounts, may result in account suspension.</li>
                <li>Customers must follow Dormer&apos;s food safety guidelines and store meals properly before consumption.</li>
                <li>Inappropriate or abusive behavior toward Dormer&apos;s staff may result in service termination.</li>
              </ul>
            </section>

            {/* 9. Privacy & Data Protection */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">9. Privacy & Data Protection</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Dormer&apos;s securely collects and stores customer data solely for service-related purposes.</li>
                <li>Customer information will not be shared with third parties, except for payment processing and delivery coordination.</li>
                <li>Customers may request data deletion upon termination of service.</li>
                <li>Stringent security measures are in place to safeguard customer data from unauthorized access.</li>
              </ul>
            </section>

            {/* 10. Marketing & Communication */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">10. Marketing & Communication</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Dormer&apos;s may send SMS, email, or WhatsApp updates regarding promotions, service improvements, and meal updates.</li>
                <li>Customers may opt out of marketing communications at any time.</li>
                <li>Promotional campaigns and referral programs are subject to periodic changes based on company policies.</li>
              </ul>
            </section>

            {/* 11. Liability & Disclaimers */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">11. Liability & Disclaimers</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Dormer&apos;s is not liable for health-related issues arising from undisclosed allergies or improper food storage by the customer.</li>
                <li>Dormer&apos;s reserves the right to modify meal options based on ingredient availability.</li>
                <li>Force Majeure Clause: Dormer&apos;s is not responsible for service disruptions caused by events beyond its control, including natural disasters, government regulations, or logistical failures.</li>
                <li>While we strive for uninterrupted service, Dormer&apos;s reserves the right to pause operations for necessary maintenance or improvements.</li>
              </ul>
            </section>

            {/* 12. Amendments & Termination */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">12. Amendments & Termination</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Dormer&apos;s reserves the right to modify these Terms & Conditions at any time, with customers being notified in advance of major changes.</li>
                <li>Dormer&apos;s may terminate a subscription for policy violations, fraudulent activities, or service misuse.</li>
                <li>Customers found violating health and safety regulations may be permanently restricted from Dormer&apos;s services.</li>
              </ul>
            </section>

            {/* 13. Contact Information */}
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">13. Contact Information</h2>
              <p className="mb-4">For inquiries, support, or complaints, please contact us:</p>
              <ul className="space-y-2">
                <li>Email: <a href="mailto:care@dormers.ae" className="text-orange-400 hover:underline">care@dormers.ae</a></li>
                <li>Phone: <a href="tel:+971504619384" className="text-orange-400 hover:underline">+971 504 619 384</a></li>
                <li>WhatsApp: <a href="https://wa.me/dormers" className="text-orange-400 hover:underline">wa.me/dormers</a></li>
              </ul>
            </section>

            <div className="text-center italic pt-8 border-t border-[#EEE9DA]/20">
              By subscribing to Dormer&apos;s meal service, you acknowledge and agree to these Terms & Conditions.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 