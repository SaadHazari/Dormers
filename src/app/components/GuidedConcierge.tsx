'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle, MapPin, X } from 'lucide-react';

interface GuidedConciergeProps {
  isOpen: boolean;
  onClose: () => void;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Mixed-plan pricing lookup tables (index = number of veg days selected, 0–6)
const MIXED_MONTHLY_PER_MEAL = [22, 22, 21, 20, 19, 18, 17];
const MIXED_WEEKLY_PER_MEAL  = [23, 21.67, 21.67, 21, 21, 20, 19];
const MIXED_MONTHLY_TOTAL    = [528, 528, 504, 480, 456, 432, 408];
const MIXED_WEEKLY_TOTAL     = [138, 130, 130, 126, 126, 120, 114];

export default function GuidedConcierge({ isOpen, onClose }: GuidedConciergeProps) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [formData, setFormData] = useState({
    preference: '',
    location: '',
    customDorm: '',
    plan: '',
    name: '',
    phone: '',
    email: '',
    vegDays: [] as string[],
  });

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setDirection(1);
      setFormData({
        preference: '',
        location: '',
        customDorm: '',
        plan: '',
        name: '',
        phone: '',
        email: '',
        vegDays: [],
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // ─── derived state ───────────────────────────────────────────────────────────
  const isReligious = formData.preference === 'Religious Preference';
  const isVeg       = formData.preference === 'Plant-Based';
  const vegCount    = formData.vegDays.length;
  const totalSteps  = isReligious ? 6 : 5;

  // Maps internal step → display step for progress bar.
  // Non-religious users skip internal step 2, so steps 3–6 show as 2–5.
  const getDisplayStep = (s: number) => (isReligious || s < 3 ? s : s - 1);

  // Back navigation skips the veg-day step for non-religious users.
  const getPreviousStep = (s: number) => (!isReligious && s === 3 ? 1 : s - 1);

  const navigateToStep = (newStep: number) => {
    setDirection(newStep > step ? 1 : -1);
    setStep(newStep);
  };

  const toggleVegDay = (day: string) => {
    setFormData((prev) => ({
      ...prev,
      vegDays: prev.vegDays.includes(day)
        ? prev.vegDays.filter((d) => d !== day)
        : [...prev.vegDays, day],
    }));
  };

  const handleSelection = (field: 'preference' | 'location' | 'plan', value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'preference') {
      navigateToStep(value === 'Religious Preference' ? 2 : 3);
      return;
    }
    if (field === 'location' && value === 'Other Dorm') return; // manual continue
    navigateToStep(step + 1);
  };

  // ─── pricing helpers ─────────────────────────────────────────────────────────
  const getPricePerMeal = (): number => {
    if (isReligious) {
      if (formData.plan.includes('Monthly Premium')) return MIXED_MONTHLY_PER_MEAL[vegCount] ?? 22;
      if (formData.plan.includes('Weekly Flex'))     return MIXED_WEEKLY_PER_MEAL[vegCount]  ?? 23;
      return 0;
    }
    if (formData.plan.includes('Monthly Premium')) return isVeg ? 18 : 22;
    if (formData.plan.includes('Weekly Flex'))     return isVeg ? 19 : 23;
    if (formData.plan.includes('One-Time Trial'))  return isVeg ? 20 : 25;
    return 0;
  };

  const getTotal = (): number => {
    if (isReligious) {
      if (formData.plan.includes('Monthly Premium')) return MIXED_MONTHLY_TOTAL[vegCount] ?? 528;
      if (formData.plan.includes('Weekly Flex'))     return MIXED_WEEKLY_TOTAL[vegCount]  ?? 138;
      return 0;
    }
    const price = getPricePerMeal();
    if (formData.plan.includes('Monthly Premium')) return price * 24;
    if (formData.plan.includes('Weekly Flex'))     return price * 6;
    if (formData.plan.includes('One-Time Trial'))  return price;
    return 0;
  };

  const getTotalLabel = () => {
    if (formData.plan.includes('Monthly Premium')) return '/ Month';
    if (formData.plan.includes('Weekly Flex'))     return '/ Week';
    if (formData.plan.includes('One-Time Trial'))  return '/ Trial';
    return '';
  };

  const getMealType = () => {
    if (isReligious) {
      if (vegCount === 0) return 'Non-Veg';
      if (vegCount === 6) return 'Veg';
      return `Mixed (${vegCount} veg + ${6 - vegCount} non-veg)`;
    }
    return isVeg ? 'Veg' : 'Non-Veg';
  };

  const finalLocationStr = formData.location === 'Other Dorm' && formData.customDorm
    ? formData.customDorm
    : formData.location;

  const isOtherDorm = formData.location === 'Other Dorm';

  // ─── animation variants ──────────────────────────────────────────────────────
  const slideVariants = {
    initial: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
    animate: {
      x: '0%',
      opacity: 1,
      transition: { type: 'spring' as const, stiffness: 300, damping: 30 },
    },
    exit: (dir: number) => ({
      x: dir > 0 ? '-100%' : '100%',
      opacity: 0,
      transition: { type: 'spring' as const, stiffness: 300, damping: 30 },
    }),
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-[#091825]/40 backdrop-blur-sm"
        onClick={() => {
          onClose();
          window.dispatchEvent(new CustomEvent('close-chat'));
        }}
      />

      {/* Modal */}
      <motion.div
        initial={{ y: '100%', scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: '100%', scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full sm:w-[440px] h-[80vh] sm:h-[580px] min-h-[480px] max-h-[85vh] bg-[#091825]/40 backdrop-blur-[28px] saturate-[1.5] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_1px_0_0_rgba(255,255,255,0.06),0_8px_32px_0_rgba(0,0,0,0.25)] rounded-[24px] border border-white/20 overflow-hidden flex flex-col font-montserrat"
        style={{ WebkitBackdropFilter: 'blur(28px) saturate(1.5)', backdropFilter: 'blur(28px) saturate(1.5)' }}
      >
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 w-full h-[4px] bg-white/5 z-20">
          <motion.div
            className="h-full bg-[#f57f20]"
            initial={{ width: 0 }}
            animate={{ width: `${(getDisplayStep(step) / totalSteps) * 100}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between p-4 px-5 z-20 mt-1">
          <button
            onClick={() => step > 1 && navigateToStep(getPreviousStep(step))}
            className={`text-white/40 hover:text-white transition-opacity ${step === 1 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
          <button
            onClick={() => {
              onClose();
              window.dispatchEvent(new CustomEvent('close-chat'));
            }}
            className="text-white/40 hover:text-white transition-colors"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        {/* Steps */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="absolute inset-0 flex flex-col px-5 sm:px-8 pb-6 sm:pb-8 overflow-y-auto custom-scrollbar"
            >

              {/* ── Step 1: Preference ── */}
              {step === 1 && (
                <div className="flex flex-col h-full justify-center space-y-6">
                  <h2 className="text-[#ede8da] text-[22px] sm:text-[24px] leading-snug font-semibold pb-2">
                    Hungry? Let&apos;s fix that.<br />
                    <span className="text-[#f57f20]">What&apos;s the vibe?</span>
                  </h2>
                  <div className="space-y-3">
                    {[
                      { emoji: '🥩', text: 'Carnivore' },
                      { emoji: '🥗', text: 'Plant-Based' },
                      { emoji: '☪️', text: 'Religious Preference' },
                    ].map((opt) => (
                      <button
                        key={opt.text}
                        onClick={() => handleSelection('preference', opt.text)}
                        className={`w-full flex items-center p-4 rounded-2xl border ${
                          formData.preference === opt.text
                            ? 'border-[#f57f20] bg-[#f57f20]/10'
                            : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/10'
                        } transition-all text-left group`}
                      >
                        <span className="text-xl mr-3 group-hover:scale-110 transition-transform">{opt.emoji}</span>
                        <span className="text-[#ede8da] text-[15px] sm:text-[16px] font-medium">{opt.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Step 2: Veg Day Selector (Religious Preference only) ── */}
              {step === 2 && isReligious && (
                <div className="flex flex-col h-full justify-center space-y-5">
                  <div>
                    <h2 className="text-[#ede8da] text-[22px] sm:text-[24px] leading-snug font-semibold pb-1">
                      <span className="text-[#f57f20]">Which days</span> do you want veg?
                    </h2>
                    <p className="text-white/40 text-[13px] mt-1">
                      Select all that apply — leave blank for all non-veg.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {DAYS_OF_WEEK.map((day) => {
                      const selected = formData.vegDays.includes(day);
                      return (
                        <button
                          key={day}
                          onClick={() => toggleVegDay(day)}
                          className={`p-4 rounded-2xl border ${
                            selected
                              ? 'border-[#f57f20] bg-[#f57f20]/10'
                              : 'border-white/5 bg-white/[0.03] hover:border-white/10'
                          } transition-all flex items-center justify-center`}
                        >
                          <span className="text-[#ede8da] text-[13px] sm:text-[14px] font-medium">{day}</span>
                        </button>
                      );
                    })}
                  </div>
                  {vegCount > 0 && (
                    <p className="text-white/40 text-[12px] text-center -mt-2">
                      {vegCount} veg day{vegCount > 1 ? 's' : ''} · {6 - vegCount} non-veg day{6 - vegCount !== 1 ? 's' : ''}
                    </p>
                  )}
                  <button
                    onClick={() => navigateToStep(3)}
                    className="w-full bg-[#f57f20] text-[#091825] p-3.5 rounded-xl font-semibold text-[15px] flex justify-center items-center hover:bg-[#ff8f36] transition-all"
                  >
                    Continue
                  </button>
                </div>
              )}

              {/* ── Step 3: Location ── */}
              {step === 3 && (
                <div className="flex flex-col h-full justify-center space-y-6 pt-4">
                  <h2 className="text-[#ede8da] text-[22px] sm:text-[24px] leading-snug font-semibold pb-1">
                    Solid choice.<br />
                    <span className="text-[#f57f20]">Where are we dropping this?</span>
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    {['The Myriad', 'KSK Homes', 'Yugo', 'DSOA Residence', 'Study World', 'Other Dorm'].map((loc) => (
                      <button
                        key={loc}
                        onClick={() => handleSelection('location', loc)}
                        className={`p-4 rounded-2xl border ${
                          formData.location === loc
                            ? 'border-[#f57f20] bg-[#f57f20]/10'
                            : 'border-white/5 bg-white/[0.03] hover:border-white/10'
                        } transition-all flex items-center justify-center text-center`}
                      >
                        <span className="text-[#ede8da] py-2 text-[13px] sm:text-[14px] font-medium leading-tight">{loc}</span>
                      </button>
                    ))}
                  </div>
                  <AnimatePresence>
                    {formData.location === 'Other Dorm' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 pt-2 overflow-hidden"
                      >
                        <input
                          type="text"
                          placeholder="Type your dorm name..."
                          value={formData.customDorm}
                          onChange={(e) => setFormData({ ...formData, customDorm: e.target.value })}
                          className="w-full bg-white/5 text-[#ede8da] p-4 rounded-xl border border-white/10 focus:outline-none focus:border-[#f57f20] transition-colors text-[15px] font-medium placeholder-white/30"
                        />
                        <button
                          disabled={!formData.customDorm.trim()}
                          onClick={() => navigateToStep(4)}
                          className="w-full bg-[#f57f20] text-[#091825] p-3.5 rounded-xl font-semibold text-[15px] flex justify-center items-center hover:bg-[#ff8f36] disabled:opacity-40 disabled:hover:bg-[#f57f20] transition-all"
                        >
                          Next
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ── Step 4: Plan ── */}
              {step === 4 && (
                <div className="flex flex-col h-full justify-center space-y-6">
                  <h2 className="text-[#ede8da] text-[22px] sm:text-[24px] leading-snug font-semibold pb-2">
                    <span className="text-[#f57f20]">How long</span> are we feeding you?
                  </h2>
                  <div className="space-y-3">

                    {/* Monthly Premium */}
                    <button
                      onClick={() => handleSelection('plan', 'Monthly Premium 💎')}
                      className={`relative w-full flex justify-between items-center p-4 sm:p-5 rounded-2xl border ${
                        formData.plan === 'Monthly Premium 💎'
                          ? 'border-[#0088cc] bg-[#0088cc]/10'
                          : 'border-[#0088cc]/30 bg-[#0088cc]/5 hover:border-[#0088cc]/50'
                      } transition-all text-left overflow-hidden`}
                    >
                      <div className="absolute top-0 right-0 bg-[#0088cc] text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg uppercase tracking-wider">
                        Best Value
                      </div>
                      <div>
                        <span className="block text-[#ede8da] text-[15px] sm:text-[16px] font-medium">Monthly Premium 💎</span>
                        {isReligious && (
                          <span className="block text-[#0088cc] text-[10px] font-medium mt-0.5">
                            {vegCount} veg · {6 - vegCount} non-veg days
                          </span>
                        )}
                      </div>
                      <div className="text-right mt-1">
                        <span className="block text-[#ede8da] text-[18px] sm:text-[20px] font-semibold">
                          {isReligious ? MIXED_MONTHLY_PER_MEAL[vegCount] : (isVeg ? 18 : 22)}{' '}
                          <span className="text-[12px] text-white/50 font-normal">AED</span>
                        </span>
                        <span className="text-[#0088cc] text-[10px] font-semibold uppercase tracking-wide">Per Meal</span>
                      </div>
                    </button>

                    {/* Weekly Flex */}
                    <button
                      onClick={() => handleSelection('plan', 'Weekly Flex ✨')}
                      className={`w-full flex justify-between items-center p-4 sm:p-5 rounded-2xl border ${
                        formData.plan === 'Weekly Flex ✨'
                          ? 'border-[#f57f20] bg-[#f57f20]/10'
                          : 'border-white/5 bg-white/[0.03] hover:border-white/10'
                      } transition-all text-left`}
                    >
                      <div>
                        <span className="block text-[#ede8da] text-[15px] sm:text-[16px] font-medium">Weekly Flex ✨</span>
                        {isReligious && (
                          <span className="block text-white/40 text-[10px] font-medium mt-0.5">
                            {vegCount} veg · {6 - vegCount} non-veg days
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="block text-[#ede8da] text-[18px] sm:text-[20px] font-semibold">
                          {isReligious ? MIXED_WEEKLY_PER_MEAL[vegCount] : (isVeg ? 19 : 23)}{' '}
                          <span className="text-[12px] text-white/50 font-normal">AED</span>
                        </span>
                        <span className="text-white/40 text-[10px] font-medium uppercase tracking-wide">Per Meal</span>
                      </div>
                    </button>

                    {/* One-Time Trial — hidden for Religious Preference */}
                    {!isReligious && (
                      <button
                        onClick={() => handleSelection('plan', 'One-Time Trial')}
                        className={`w-full flex justify-between items-center p-4 sm:p-5 rounded-2xl border ${
                          formData.plan === 'One-Time Trial'
                            ? 'border-[#f57f20] bg-[#f57f20]/10'
                            : 'border-white/5 bg-white/[0.03] hover:border-white/10'
                        } transition-all text-left`}
                      >
                        <div>
                          <span className="block text-[#ede8da] text-[15px] sm:text-[16px] font-medium">One-Time Trial</span>
                        </div>
                        <div className="text-right">
                          <span className="block text-[#ede8da] text-[18px] sm:text-[20px] font-semibold">
                            {isVeg ? 20 : 25}{' '}
                            <span className="text-[12px] text-white/50 font-normal">AED</span>
                          </span>
                          <span className="text-white/40 text-[10px] font-medium uppercase tracking-wide">Per Meal</span>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Step 5: Contact Info ── */}
              {step === 5 && (
                <div className="flex flex-col h-full justify-center space-y-5">
                  <h2 className="text-[#ede8da] text-[22px] sm:text-[24px] leading-snug font-semibold pb-1">
                    Almost done.<br />
                    <span className="text-[#f57f20]">Who should we send the meals to?</span>
                  </h2>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="First Name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-white/5 text-[#ede8da] p-3.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#f57f20] transition-colors text-[15px] font-medium placeholder-white/30"
                    />
                    <input
                      type="email"
                      placeholder="Email Address"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full bg-white/5 text-[#ede8da] p-3.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#f57f20] transition-colors text-[15px] font-medium placeholder-white/30"
                    />
                    <input
                      type="tel"
                      placeholder="WhatsApp Number"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-white/5 text-[#ede8da] p-3.5 rounded-xl border border-white/10 focus:outline-none focus:border-[#f57f20] transition-colors text-[15px] font-medium placeholder-white/30"
                    />
                  </div>
                  <div className="mt-4 pt-2">
                    <button
                      disabled={!formData.name.trim() || !formData.phone.trim() || !formData.email.trim()}
                      onClick={() => navigateToStep(6)}
                      className="w-full bg-[#f57f20] text-[#091825] p-4 rounded-xl font-semibold text-[15px] sm:text-[16px] flex justify-center items-center gap-2 hover:bg-[#ff8f36] disabled:opacity-40 disabled:hover:bg-[#f57f20] transition-all"
                    >
                      Show my total
                      <span className="text-[18px] leading-none ml-1">&rarr;</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 6: Summary ── */}
              {step === 6 && (
                <div className="flex flex-col py-2">
                  <div className="text-center mb-3">
                    {isOtherDorm ? (
                      <div className="w-10 h-10 mx-auto bg-[#f57f20]/10 text-[#f57f20] rounded-full flex items-center justify-center mb-2 border border-[#f57f20]/20">
                        <MapPin size={20} strokeWidth={1.5} />
                      </div>
                    ) : (
                      <div className="w-10 h-10 mx-auto bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-2 border border-green-500/20">
                        <CheckCircle size={20} strokeWidth={1.5} />
                      </div>
                    )}
                    <h2 className="text-[#ede8da] text-[22px] sm:text-[24px] font-semibold">
                      {isOtherDorm ? "Let's check." : "Boom. You're set."}
                    </h2>
                    <p className="text-[#ede8da]/60 mt-2 text-[14px] leading-relaxed mx-auto max-w-[90%]">
                      {isOtherDorm
                        ? "We aren't 100% sure we can deliver to your location yet. Before we take your payment, let's confirm through our team."
                        : "We've locked in your preferences. Securely complete your order below."}
                    </p>
                  </div>

                  <div className="bg-white/[0.02] border border-white/5 p-3 rounded-2xl mx-auto w-full space-y-2 mb-3">
                    {/* Plan + Meal Type */}
                    <div className="flex justify-between items-start border-b border-white/5 pb-2">
                      <div>
                        <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Plan</span>
                        <div className="text-[#ede8da] text-[14px] font-medium mt-0.5">{formData.plan}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Meal Type</span>
                        <div className="text-[#ede8da] text-[13px] font-medium mt-0.5">{getMealType()}</div>
                      </div>
                    </div>

                    {/* Veg Days row (Religious Preference only) */}
                    {isReligious && vegCount > 0 && (
                      <div className="border-b border-white/5 pb-2">
                        <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Veg Days</span>
                        <div className="text-[#ede8da] text-[13px] font-medium mt-0.5">{formData.vegDays.join(', ')}</div>
                      </div>
                    )}

                    {/* Location */}
                    <div className="border-b border-white/5 pb-2">
                      <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Location</span>
                      <div className="text-[#ede8da] text-[14px] font-medium mt-0.5">{finalLocationStr}</div>
                    </div>

                    {/* Per Meal + Total */}
                    <div className="flex justify-between items-end pt-1">
                      <div>
                        <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Per Meal</span>
                        <div className="text-[#ede8da] text-[16px] font-semibold mt-0.5">
                          {getPricePerMeal()} <span className="text-[11px] text-white/40 font-normal">AED</span>
                        </div>
                      </div>
                      <div className="text-right flex items-end gap-1">
                        <span className="text-[24px] text-[#f57f20] font-semibold">{getTotal()}</span>
                        <div className="flex flex-col items-start translate-y-[-3px]">
                          <span className="text-[11px] text-white/50 font-normal leading-none">AED</span>
                          <span className="text-white/40 text-[10px] font-medium uppercase tracking-wide">{getTotalLabel()}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2">
                    {isOtherDorm ? (
                      <a
                        href={`https://wa.me/971504619384?text=${encodeURIComponent(
                          `Hey! I'm interested in the ${formData.plan} (${getMealType()})${isReligious && vegCount > 0 ? `. Veg days: ${formData.vegDays.join(', ')}` : ''}. My location is ${finalLocationStr}. Could you confirm delivery? Name: ${formData.name}. Email: ${formData.email}.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full bg-[#25D366] text-white p-4 rounded-xl font-semibold text-[15px] flex justify-center items-center gap-2 hover:bg-[#20bd59] transition-colors"
                        onClick={() => {
                          setTimeout(() => {
                            onClose();
                            window.dispatchEvent(new CustomEvent('close-chat'));
                          }, 1000);
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.487-1.761-1.66-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                        </svg>
                        Talk to Customer Service
                      </a>
                    ) : (
                      <button
                        onClick={() => {
                          alert('Redirecting to secure Stripe checkout...');
                        }}
                        className="w-full bg-[#f57f20] text-[#091825] p-4 rounded-xl font-semibold text-[15px] flex justify-center items-center hover:bg-[#ff8f36] transition-colors"
                      >
                        Checkout Securely
                      </button>
                    )}
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
