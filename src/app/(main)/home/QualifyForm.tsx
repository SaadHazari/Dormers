'use client';

import { useState } from 'react';

interface QualifyFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QualifyForm({ isOpen, onClose }: QualifyFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    university: '',
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission
    console.log(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1E3A4F] rounded-2xl w-full max-w-md overflow-hidden">
        {/* Form Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-white text-xl font-bold">Qualify Now</h3>
          <button 
            onClick={onClose}
            className="text-white hover:opacity-75"
          >
            <span className="text-2xl">×</span>
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-white text-sm">Full Name</label>
            <input
              type="text"
              id="name"
              className="w-full px-4 py-2 rounded-lg bg-white text-gray-800"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-white text-sm">Email Address</label>
            <input
              type="email"
              id="email"
              className="w-full px-4 py-2 rounded-lg bg-white text-gray-800"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="phone" className="text-white text-sm">Phone Number</label>
            <input
              type="tel"
              id="phone"
              className="w-full px-4 py-2 rounded-lg bg-white text-gray-800"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="university" className="text-white text-sm">University</label>
            <input
              type="text"
              id="university"
              className="w-full px-4 py-2 rounded-lg bg-white text-gray-800"
              value={formData.university}
              onChange={(e) => setFormData(prev => ({ ...prev, university: e.target.value }))}
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-[#FF6B00] hover:bg-[#E65000] text-white font-bold py-3 rounded-lg transition-colors"
          >
            Submit Application
          </button>
        </form>
      </div>
    </div>
  );
} 