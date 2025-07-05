'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface OrderFormProps {
  isOpen: boolean;
  onClose: () => void;
}

// Country codes data
const countryCodes = [
  { code: '+971', country: '🇦🇪 UAE' },
  { code: '+91', country: '🇮🇳 India' },
  { code: '+92', country: '🇵🇰 Pakistan' },
  { code: '+94', country: '🇱🇰 Sri Lanka' },
  { code: '+880', country: '🇧🇩 Bangladesh' },
  { code: '+234', country: '🇳🇬 Nigeria' },
  { code: '+20', country: '🇪🇬 Egypt' },
  { code: '+966', country: '🇸🇦 Saudi Arabia' },
  { code: '+968', country: '🇴🇲 Oman' },
  { code: '+973', country: '🇧🇭 Bahrain' },
  { code: '+974', country: '🇶🇦 Qatar' },
  { code: '+965', country: '🇰🇼 Kuwait' },
  { code: '+962', country: '🇯🇴 Jordan' },
  { code: '+961', country: '🇱🇧 Lebanon' },
  { code: '+963', country: '🇸🇾 Syria' },
  { code: '+44', country: '🇬🇧 UK' },
  { code: '+1', country: '🇺🇸 USA' },
  { code: '+86', country: '🇨🇳 China' },
  { code: '+60', country: '🇲🇾 Malaysia' },
  { code: '+63', country: '🇵🇭 Philippines' },
];

export default function OrderForm({ isOpen, onClose }: OrderFormProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    countryCode: '+971',
    phone: '',
    location: '',
    mealType: '',
    duration: '',
    dietaryRestrictions: '',
    startDate: '',
  });

  useEffect(() => {
    if (isOpen) {
      console.log('OrderForm opened');
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      console.log('OrderForm closed');
      // Restore body scroll when modal is closed
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateStep = (currentStep: number) => {
    switch (currentStep) {
      case 1:
        return formData.name.trim() !== '' && 
               formData.email.trim() !== '' && 
               formData.phone.trim() !== '';
      case 2:
        return formData.location !== '' && 
               formData.mealType !== '' &&
               formData.duration !== '';
      case 3:
        return formData.startDate !== '';
      default:
        return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(3)) return;

    try {
      console.log('Form submitted:', formData);
      
      // Format WhatsApp message
      const text = encodeURIComponent(
        `👋 Hey Dormer's! I want to join the club! 🍛🔥\n\nName: ${formData.name}\nEmail: ${formData.email}\nPhone: ${formData.countryCode}${formData.phone}\nLocation: ${formData.location}\nMeal Type: ${formData.mealType}\nDuration: ${formData.duration}\nDietary Restrictions: ${formData.dietaryRestrictions}\nStart Date: ${formData.startDate}`
      );
      
      // Redirect to WhatsApp
      window.location.href = `https://wa.me/+971585556707?text=${text}`;
      
      onClose();
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setStep(prev => prev - 1);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black bg-opacity-50 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="bg-[#1E3A4F] p-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white" style={{
      fontFamily: "Typo Round Bold Demo , sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0.5px",
    }}>
                  JOIN THE CLUB
                </h2>
                <button
                  onClick={onClose}
                  className="text-white hover:text-gray-300 transition-colors"
                  aria-label="Close form"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Progress Steps */}
              <div className="flex justify-between mt-6">
                {[1, 2, 3].map((num) => (
                  <div key={num} className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      step >= num ? 'bg-[#FF6B00]' : 'bg-gray-400'
                    } text-white font-bold transition-colors`}>
                      {num}
                    </div>
                    {num < 3 && (
                      <div className={`h-1 w-24 ${
                        step > num ? 'bg-[#FF6B00]' : 'bg-gray-400'
                      } transition-colors`} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSubmit} className="p-6">
              <style jsx global>{`
                /* Chrome, Safari autofill styles */
                input:-webkit-autofill,
                input:-webkit-autofill:hover,
                input:-webkit-autofill:focus,
                input:-webkit-autofill:active {
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: #111827 !important;
                  transition: background-color 5000s ease-in-out 0s;
                  box-shadow: inset 0 0 20px 20px white !important;
                }

                /* Firefox autofill styles */
                input:autofill {
                  -webkit-text-fill-color: #111827 !important;
                  filter: none;
                  box-shadow: inset 0 0 20px 20px white !important;
                }
              `}</style>
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1"
                      style={{
      fontFamily: "Poppins, sans-serif",
      fontWeight: 400,
      lineHeight: "100%",
      letterSpacing: "0.5px",
    }}>Full Name</label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent text-gray-900 bg-white [&:-webkit-autofill]:bg-white"
                        required
                        placeholder="Enter your full name"
                        autoComplete="name"
                      style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
    }}/>
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1"
                      style={{
      fontFamily: "Poppins, sans-serif",
      fontWeight: 400,
      lineHeight: "100%",
      letterSpacing: "0.5px",
    }}>Email</label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent text-gray-900 bg-white [&:-webkit-autofill]:bg-white"
                        required
                        placeholder="Enter your email address"
                        autoComplete="email"
                      style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
    }}/>
                    </div>
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1"
                      style={{
      fontFamily: "Poppins, sans-serif",
      fontWeight: 400,
      lineHeight: "100%",
      letterSpacing: "0.5px",
    }}>Phone Number</label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          name="countryCode"
                          value={formData.countryCode}
                          onChange={handleChange}
                          className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent text-gray-900 bg-white [&:-webkit-autofill]:bg-white"
                       style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
    }} >
                          {countryCodes.map(({ code, country }) => (
                            <option key={code} value={code} className="text-gray-900">
                              {country} ({code})
                            </option>
                          ))}
                        </select>
                        <input
                          type="tel"
                          id="phone"
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent text-gray-900 bg-white [&:-webkit-autofill]:bg-white"
                          required
                          placeholder="Enter your phone number"
                          autoComplete="tel"
                       style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
    }} />
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    <div>
                      <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1"style={{
      fontFamily: "Poppins, sans-serif",
      fontWeight: 400,
      lineHeight: "100%",
      letterSpacing: "0.5px",
    }}>Delivery Location</label>
                      <select
                        id="location"
                        name="location"
                        value={formData.location}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent text-gray-900 bg-white"
                        required
                      style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
    }}>
                        <option value="" className="text-gray-500">Select a location</option>
                        <option value="myriad" className="text-gray-900">The Myriad</option>
                        <option value="ksk" className="text-gray-900">KSK Homes</option>
                        <option value="yugo" className="text-gray-900">Yugo</option>
                        <option value="dsoa" className="text-gray-900">DSOA Residences</option>
                           <option value="dsoa" className="text-gray-900">Studo World</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="mealType" className="block text-sm font-medium text-gray-700 mb-1"
                      style={{
      fontFamily: "Poppins, sans-serif",
      fontWeight: 400,
      lineHeight: "100%",
      letterSpacing: "0.5px",
    }}>Meal Type</label>
                      <select
                        id="mealType"
                        name="mealType"
                        value={formData.mealType}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent text-gray-900 bg-white"
                        required
                      style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
    }}>
                        <option value="" className="text-gray-500">Select meal type</option>
                        <option value="veg" className="text-gray-900">Vegetarian 🥬</option>
                        <option value="non-veg" className="text-gray-900">Non-Vegetarian 🍖</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-1"
                      style={{
      fontFamily: "Poppins, sans-serif",
      fontWeight: 400,
      lineHeight: "100%",
      letterSpacing: "0.5px",
    }}>Duration</label>
                      <select
                        id="duration"
                        name="duration"
                        value={formData.duration}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent text-gray-900 bg-white"
                        required
                     style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
    }} >
                        <option value="" className="text-gray-500">Select duration</option>
                        <option value="1-week" className="text-gray-900">One Week Plan (6 days)</option>
                        <option value="2-week" className="text-gray-900">Two Week Plan (12 days)</option>
                        <option value="monthly" className="text-gray-900">Monthly Plan (24 days)</option>
                      </select>
                    </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-4"
                  >
                    <div>
                      <label htmlFor="dietaryRestrictions" className="block text-sm font-medium text-gray-700 mb-1"
                      style={{
      fontFamily: "Poppins, sans-serif",
      fontWeight: 400,
      lineHeight: "100%",
      letterSpacing: "0.5px",
    }}>Dietary Restrictions</label>
                      <textarea
                        id="dietaryRestrictions"
                        name="dietaryRestrictions"
                        value={formData.dietaryRestrictions}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent text-gray-900 bg-white resize-none h-32"
                        placeholder="Enter any dietary restrictions or preferences"
                      style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
    }}/>
                    </div>
                    <div>
                      <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1"
                      >Start Date</label>
                      <input
                        type="date"
                        id="startDate"
                        name="startDate"
                        value={formData.startDate}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent text-gray-900 bg-white"
                        required
                      style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
    }}/>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Navigation Buttons */}
              <div className="flex justify-between mt-8">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="px-6 py-2 border-2 border-[#FF6B00] text-[#FF6B00] rounded-lg hover:bg-[#FF6B00] hover:text-white transition-colors"
                  style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
    }}>
                    Back
                  </button>
                )}
                {step < 3 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className={`px-6 py-2 bg-[#FF6B00] text-white rounded-lg hover:bg-[#FF7F00] transition-colors ${
                      !validateStep(step) ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    disabled={!validateStep(step)}
                 style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
    }} >
                    Next
                  </button>
                ) : (
                  <button
                    type="submit"
                    className={`px-6 py-2 bg-[#FF6B00] text-white rounded-lg hover:bg-[#FF7F00] transition-colors ${
                      !validateStep(step) ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    disabled={!validateStep(step)}
                 style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
    }} >
                    Submit
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
} 