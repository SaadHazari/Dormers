'use client';
import { useState } from 'react';

export default function PaymentPage() {
  const [amount, setAmount] = useState('199');

  const handlePay = async () => {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseInt(amount) * 100 }), // in paise
    });

    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || 'Payment failed');
    }
  };

  return (
    <div className="p-10">
      <h1 className="text-2xl mb-4">Pay Now</h1>
      <select
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="border p-2 rounded"
      >
        <option value="199">₹199</option>
        <option value="499">₹499</option>
        <option value="999">₹999</option>
      </select>
      <button
        onClick={handlePay}
        className="ml-4 px-4 py-2 bg-blue-600 text-white rounded"
      >
        Pay ₹{amount}
      </button>
    </div>
  );
}
