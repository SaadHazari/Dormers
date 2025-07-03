'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface Nutrient {
  name: string;
  amount: string;
  percentage?: string;
}

interface Dish {
  id: number;
  name: string;
  description: string;
  image: string;
  isVeg: boolean;
  dayOfWeek: number;
  nutrients: {
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
    microNutrients: Nutrient[];
  };
}

// This would typically come from an API or database
const MENU_DATA: Dish[] = [
  {
    id: 1,
    name: 'CHICKEN AFGHANI W/ YELLOW RICE',
    description: 'Tender, creamy grilled chicken marinated in rich spices, served with tangy yellow basmati rice.',
    image: '/images/chicken-afghani.jpg',
    isVeg: false,
    dayOfWeek: 0, // Sunday
    nutrients: {
      calories: '650 kcal',
      protein: '45g',
      carbs: '72g',
      fat: '22g',
      microNutrients: [
        { name: 'Iron', amount: '4.2mg', percentage: '23%' },
        { name: 'Calcium', amount: '120mg', percentage: '12%' },
        { name: 'Vitamin A', amount: '380mcg', percentage: '42%' },
        { name: 'Vitamin C', amount: '12mg', percentage: '13%' },
        { name: 'Fiber', amount: '4g', percentage: '16%' }
      ]
    }
  },
  {
    id: 2,
    name: 'GRILLED SALMON W/ QUINOA',
    description: 'Fresh Atlantic salmon fillet with herb-infused quinoa and roasted vegetables.',
    image: '/images/salmon-quinoa.jpg',
    isVeg: false,
    dayOfWeek: 1, // Monday
    nutrients: {
      calories: '580 kcal',
      protein: '42g',
      carbs: '48g',
      fat: '28g',
      microNutrients: [
        { name: 'Omega-3', amount: '2.6g', percentage: '160%' },
        { name: 'Vitamin D', amount: '15mcg', percentage: '75%' },
        { name: 'Selenium', amount: '40mcg', percentage: '73%' },
        { name: 'Vitamin B12', amount: '4.8mcg', percentage: '200%' },
        { name: 'Potassium', amount: '800mg', percentage: '17%' }
      ]
    }
  },
  {
    id: 3,
    name: 'BEEF TERIYAKI BOWL',
    description: 'Tender sliced beef glazed with homemade teriyaki sauce, served with steamed rice and Asian vegetables.',
    image: '/images/beef-teriyaki.jpg',
    isVeg: false,
    dayOfWeek: 2, // Tuesday
    nutrients: {
      calories: '620 kcal',
      protein: '38g',
      carbs: '65g',
      fat: '25g',
      microNutrients: [
        { name: 'Iron', amount: '4.8mg', percentage: '27%' },
        { name: 'Zinc', amount: '6.2mg', percentage: '56%' },
        { name: 'Vitamin B6', amount: '0.8mg', percentage: '47%' },
        { name: 'Vitamin B12', amount: '3.2mcg', percentage: '133%' },
        { name: 'Magnesium', amount: '120mg', percentage: '29%' }
      ]
    }
  },
  {
    id: 4,
    name: 'MEDITERRANEAN CHICKEN BOWL',
    description: 'Grilled chicken breast with hummus, tabbouleh, and Greek salad on a bed of mixed grains.',
    image: '/images/mediterranean-chicken.jpg',
    isVeg: false,
    dayOfWeek: 3, // Wednesday
    nutrients: {
      calories: '550 kcal',
      protein: '40g',
      carbs: '55g',
      fat: '20g',
      microNutrients: [
        { name: 'Fiber', amount: '8g', percentage: '32%' },
        { name: 'Vitamin C', amount: '45mg', percentage: '50%' },
        { name: 'Folate', amount: '220mcg', percentage: '55%' },
        { name: 'Iron', amount: '3.8mg', percentage: '21%' },
        { name: 'Calcium', amount: '150mg', percentage: '15%' }
      ]
    }
  },
  {
    id: 5,
    name: 'BUTTER CHICKEN',
    description: 'Classic Indian butter chicken in rich tomato-cream sauce with aromatic basmati rice and naan bread.',
    image: '/images/butter-chicken.jpg',
    isVeg: false,
    dayOfWeek: 4, // Thursday
    nutrients: {
      calories: '680 kcal',
      protein: '42g',
      carbs: '58g',
      fat: '32g',
      microNutrients: [
        { name: 'Vitamin A', amount: '450mcg', percentage: '50%' },
        { name: 'Calcium', amount: '180mg', percentage: '18%' },
        { name: 'Iron', amount: '3.5mg', percentage: '19%' },
        { name: 'Vitamin D', amount: '2.5mcg', percentage: '13%' },
        { name: 'Potassium', amount: '650mg', percentage: '14%' }
      ]
    }
  },
  {
    id: 6,
    name: 'GRILLED FISH W/ HERB SAUCE',
    description: 'Fresh sea bass fillet with Mediterranean herb sauce, roasted potatoes, and seasonal vegetables.',
    image: '/images/grilled-fish.jpg',
    isVeg: false,
    dayOfWeek: 5, // Friday
    nutrients: {
      calories: '520 kcal',
      protein: '35g',
      carbs: '45g',
      fat: '24g',
      microNutrients: [
        { name: 'Omega-3', amount: '1.8g', percentage: '120%' },
        { name: 'Vitamin D', amount: '12mcg', percentage: '60%' },
        { name: 'Selenium', amount: '35mcg', percentage: '64%' },
        { name: 'Iodine', amount: '120mcg', percentage: '80%' },
        { name: 'Vitamin B12', amount: '3.6mcg', percentage: '150%' }
      ]
    }
  },
  {
    id: 7,
    name: 'MOROCCAN LAMB TAGINE',
    description: 'Slow-cooked lamb with aromatic spices, dried fruits, and vegetables, served with fluffy couscous.',
    image: '/images/lamb-tagine.jpg',
    isVeg: false,
    dayOfWeek: 6, // Saturday
    nutrients: {
      calories: '690 kcal',
      protein: '48g',
      carbs: '62g',
      fat: '30g',
      microNutrients: [
        { name: 'Iron', amount: '5.2mg', percentage: '29%' },
        { name: 'Zinc', amount: '7.5mg', percentage: '68%' },
        { name: 'Vitamin B12', amount: '4.2mcg', percentage: '175%' },
        { name: 'Selenium', amount: '45mcg', percentage: '82%' },
        { name: 'Potassium', amount: '850mg', percentage: '18%' }
      ]
    }
  },
  {
    id: 8,
    name: 'PANEER TIKKA MASALA',
    description: 'Grilled cottage cheese cubes in a rich, creamy tomato sauce with aromatic Indian spices.',
    image: '/images/paneer-tikka.jpg',
    isVeg: true,
    dayOfWeek: 0,
    nutrients: {
      calories: '500 kcal',
      protein: '30g',
      carbs: '50g',
      fat: '20g',
      microNutrients: [
        { name: 'Iron', amount: '3.5mg', percentage: '18%' },
        { name: 'Calcium', amount: '100mg', percentage: '10%' },
        { name: 'Vitamin A', amount: '280mcg', percentage: '32%' },
        { name: 'Vitamin C', amount: '10mg', percentage: '11%' },
        { name: 'Fiber', amount: '3g', percentage: '12%' }
      ]
    }
  },
  {
    id: 9,
    name: 'VEGETABLE BIRYANI',
    description: 'Fragrant basmati rice cooked with mixed vegetables, aromatic spices, and fresh herbs.',
    image: '/images/veg-biryani.jpg',
    isVeg: true,
    dayOfWeek: 1,
    nutrients: {
      calories: '480 kcal',
      protein: '12g',
      carbs: '82g',
      fat: '14g',
      microNutrients: [
        { name: 'Iron', amount: '3.2mg', percentage: '18%' },
        { name: 'Fiber', amount: '6g', percentage: '24%' },
        { name: 'Vitamin C', amount: '28mg', percentage: '31%' },
        { name: 'Folate', amount: '165mcg', percentage: '41%' },
        { name: 'Potassium', amount: '420mg', percentage: '9%' }
      ]
    }
  },
  {
    id: 10,
    name: 'MUSHROOM RISOTTO',
    description: 'Creamy Italian arborio rice with wild mushrooms, parmesan, and fresh herbs.',
    image: '/images/mushroom-risotto.jpg',
    isVeg: true,
    dayOfWeek: 2,
    nutrients: {
      calories: '520 kcal',
      protein: '18g',
      carbs: '76g',
      fat: '16g',
      microNutrients: [
        { name: 'Vitamin D', amount: '8mcg', percentage: '40%' },
        { name: 'Iron', amount: '2.8mg', percentage: '16%' },
        { name: 'Zinc', amount: '3.2mg', percentage: '29%' },
        { name: 'Selenium', amount: '28mcg', percentage: '51%' },
        { name: 'Fiber', amount: '4g', percentage: '16%' }
      ]
    }
  },
  {
    id: 11,
    name: 'MEDITERRANEAN FALAFEL BOWL',
    description: 'Crispy chickpea falafels with hummus, tabbouleh, and Greek salad on mixed grains.',
    image: '/images/falafel-bowl.jpg',
    isVeg: true,
    dayOfWeek: 3,
    nutrients: {
      calories: '490 kcal',
      protein: '22g',
      carbs: '68g',
      fat: '18g',
      microNutrients: [
        { name: 'Iron', amount: '4.5mg', percentage: '25%' },
        { name: 'Fiber', amount: '12g', percentage: '48%' },
        { name: 'Folate', amount: '180mcg', percentage: '45%' },
        { name: 'Vitamin C', amount: '35mg', percentage: '39%' },
        { name: 'Calcium', amount: '180mg', percentage: '18%' }
      ]
    }
  },
  {
    id: 12,
    name: 'THAI GREEN CURRY',
    description: 'Aromatic coconut curry with tofu, bamboo shoots, and mixed vegetables served with jasmine rice.',
    image: '/images/thai-curry.jpg',
    isVeg: true,
    dayOfWeek: 4,
    nutrients: {
      calories: '510 kcal',
      protein: '20g',
      carbs: '65g',
      fat: '22g',
      microNutrients: [
        { name: 'Vitamin K', amount: '75mcg', percentage: '63%' },
        { name: 'Vitamin C', amount: '42mg', percentage: '47%' },
        { name: 'Iron', amount: '3.8mg', percentage: '21%' },
        { name: 'Calcium', amount: '200mg', percentage: '20%' },
        { name: 'Fiber', amount: '8g', percentage: '32%' }
      ]
    }
  },
  {
    id: 13,
    name: 'QUINOA BUDDHA BOWL',
    description: 'Protein-rich quinoa with roasted vegetables, avocado, and tahini dressing.',
    image: '/images/quinoa-bowl.jpg',
    isVeg: true,
    dayOfWeek: 5,
    nutrients: {
      calories: '470 kcal',
      protein: '16g',
      carbs: '58g',
      fat: '24g',
      microNutrients: [
        { name: 'Iron', amount: '4.2mg', percentage: '23%' },
        { name: 'Fiber', amount: '10g', percentage: '40%' },
        { name: 'Vitamin E', amount: '8mg', percentage: '53%' },
        { name: 'Magnesium', amount: '140mg', percentage: '33%' },
        { name: 'Zinc', amount: '3mg', percentage: '27%' }
      ]
    }
  },
  {
    id: 14,
    name: 'EGGPLANT PARMIGIANA',
    description: 'Layers of grilled eggplant with tomato sauce, mozzarella, and fresh basil.',
    image: '/images/eggplant-parm.jpg',
    isVeg: true,
    dayOfWeek: 6,
    nutrients: {
      calories: '460 kcal',
      protein: '18g',
      carbs: '42g',
      fat: '26g',
      microNutrients: [
        { name: 'Vitamin C', amount: '18mg', percentage: '20%' },
        { name: 'Calcium', amount: '320mg', percentage: '32%' },
        { name: 'Iron', amount: '2.5mg', percentage: '14%' },
        { name: 'Vitamin K', amount: '45mcg', percentage: '38%' },
        { name: 'Fiber', amount: '7g', percentage: '28%' }
      ]
    }
  }
];

export default function Menu() {
  const [isVegOnly, setIsVegOnly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(() => new Date().getDay()); // Initialize with current day
  const [showNutritionHint, setShowNutritionHint] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);

  // Filter dishes based on veg/non-veg selection
  const availableDishes = MENU_DATA.filter(dish => dish.isVeg === isVegOnly);

  // Get current dish based on selected day
  const currentDish = selectedDay !== null ? availableDishes.find(dish => dish.dayOfWeek === selectedDay) : null;

  // Show nutrition hint when day is selected
  useEffect(() => {
    if (selectedDay !== null) {
      setShowNutritionHint(true);
      const timer = setTimeout(() => setShowNutritionHint(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [selectedDay]);

  // Reset flip state when changing days or diet type
  useEffect(() => {
    setIsFlipped(false);
  }, [selectedDay, isVegOnly]);

  return (
    <div className="bg-[#1E3A4F] w-full py-8">
      <div className="container mx-auto px-4">
        {/* Menu Header */}
        <div className="mb-5 mt-0 flex items-center justify-between max-w-4xl mx-auto">
          <h2 className="text-white text-[32px] font-medium" style={{
    fontFamily: 'Montserrat',
    fontWeight: 500,
    lineHeight: '100%',
    letterSpacing: '0%',
    fontSize: '18px',
  }}>MENU</h2>

          {/* Diet Toggle */}
          <button
            onClick={() => {
              setIsVegOnly(v => !v);
              setSelectedDay(new Date().getDay()); // Reset to current day when switching diet type
            }}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none bg-transparent border-2 border-white"
            aria-label="Toggle veg/non-veg"
          >
            <span className="sr-only">Toggle veg/non-veg</span>
            <div className={`${isVegOnly ? 'translate-x-7' : 'translate-x-1'} inline-block h-3 w-3 transform rounded-full transition-transform duration-200 ease-in-out bg-white`}>
              <span className="absolute inset-0 flex items-center justify-center text-xs text-[#1E3A4F]">
                {isVegOnly ? '🥬' : '🍖'}
              </span>
            </div>
          </button>
        </div>

        {/* Menu Card */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-[#1E3A4F] rounded-xl p-5 perspective-1000" style={{
  boxShadow: '0px 0px 24.2px 1px #000000B5'
}}>
            {/* Day Indicators - Keep outside the flip container */}
            {/* <div className="flex justify-between mb-4 w-full md:w-[280px]">
              {[
                { day: 'S', key: 'sun', index: 0 },
                { day: 'M', key: 'mon', index: 1 },
                { day: 'T', key: 'tue', index: 2 },
                { day: 'W', key: 'wed', index: 3 },
                { day: 'T', key: 'thu', index: 4 },
                { day: 'F', key: 'fri', index: 5 },
                { day: 'S', key: 'sat', index: 6 }
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setSelectedDay(item.index)}
                  style={{
        fontFamily: 'Montserrat',
        fontWeight: 700,
        lineHeight: '100%',
        letterSpacing: '0%',
      }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-medium border-2 transition-colors ${
                    selectedDay === item.index 
                      ? 'bg-white text-[#1E3A4F] border-white' 
                      : 'bg-transparent text-white border-white hover:bg-white/10'
                  }`}
                >
                  {item.day}
                </button>
              ))}
            </div> */}

            {currentDish ? (
  <div className={`relative w-full min-h-[180px] md:min-h-[260px] transition-transform duration-500 preserve-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
    
    {/* Front of Card */}
<div className="backface-hidden w-full absolute inset-0 overflow-hidden rounded-3xl">
  <div className="flex flex-row items-start gap-4 w-full h-full">

  {/* Left Section: Day Buttons + Image */}
  <div className="flex flex-col items-center justify-start w-[140px] shrink-0">
    {/* Day Buttons */}
    <div className="flex justify-center gap-1 mb-3">
      {[
        { day: 'S', index: 0 },
        { day: 'M', index: 1 },
        { day: 'T', index: 2 },
        { day: 'W', index: 3 },
        { day: 'T', index: 4 },
        { day: 'F', index: 5 },
        { day: 'S', index: 6 }
      ].map((item) => (
        <button
          key={item.index}
          onClick={() => setSelectedDay(item.index)}
          className={`w-4 h-4 mt-2 rounded-full border flex items-center justify-center text-[12px] font-bold transition-colors ${
            selectedDay === item.index
              ? 'bg-white text-[#1E3A4F] border-white'
              : 'bg-transparent text-white border-white hover:bg-white/20'
          }`}
          style={{ fontFamily: 'Montserrat', lineHeight: '100%', fontSize:'7px' }}
        >
          {item.day}
        </button>
      ))}
    </div>

    {/* Dish Image */}
    <div className="relative w-35 h-[130px] rounded-2xl overflow-hidden bg-[#EEE9DA]">
      <Image
        src={currentDish.image}
        alt={currentDish.name}
        fill
        className="object-cover rounded-2xl"
      />
    </div>
  </div>

  {/* Right Section: Text Content */}
  <div className="flex-1 flex flex-col justify-center min-w-0 overflow-visible">
    <h3
      className="text-white text-base font-bold uppercase mb-1 break-words mt-10"
      style={{
        fontFamily: 'Montserrat',
        fontWeight: 700,
        lineHeight: '130%',
        fontSize: '13px',
      }}
    >
      {currentDish.name}
    </h3>

    <p
      className="text-white text-xs mb-2 mt-2"
      style={{
        fontFamily: 'Poppins',
        fontWeight: 300,
        fontSize: '12px',
        lineHeight: '130%',
      }}
    >
      {currentDish.description}
    </p>

    <button
      onClick={() => setIsFlipped(!isFlipped)}
      className={`flex items-center gap-1 text-white/80 text-xs transition-opacity ${
        showNutritionHint ? 'animate-pulse' : ''
      }`}
    >
      <span style={{ fontFamily: 'Montserrat', fontWeight: 600, fontSize: '8px'}} className='mt-1'>
        Nutrition Info
      </span>
      <svg
        className={`w-3 h-3 mt-1 transform transition-transform ${
          showNutritionHint ? 'animate-bounce' : ''
        }`}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6 9l6 6 6-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  </div>
</div>

</div>


                {/* Back of Card - Nutrition Info */}
                <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180">
                  <div className="bg-[#1E3A4F] rounded-3xl p-8 h-full border-2 border-white">
                    <div className="flex flex-col h-full">
                      <div className="flex justify-between items-start mb-6">
                        <h3 className="text-white text-2xl font-bold" style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
      fontSize:'18px'
    }}>Nutrition Facts</h3>
                        <button 
                          onClick={() => setIsFlipped(!isFlipped)}
                          className="text-white/80 hover:text-white transition-colors"
                        >
                          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>

                      {/* Scrollable content container */}
                      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                        <div className="grid md:grid-cols-2 gap-6">
                          {/* Main Nutrients */}
                          <div className="space-y-3">
                            <h4 className="text-white text-lg font-semibold mb-3"
                            style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
      fontSize:'15px'
    }}>Main Nutrients</h4>
                            <div className="space-y-2"
                            style={{
      fontFamily: "Poppins, sans-serif",
      fontWeight: 400,
      lineHeight: "100%",
      letterSpacing: "0.5px",
      fontSize:'12px'
    }}>
                              <div className="flex justify-between items-center py-2 border-b border-white/20">
                                <span className="text-white/90">Calories</span>
                                <span className="text-white font-medium">{currentDish.nutrients.calories}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-white/20">
                                <span className="text-white/90">Protein</span>
                                <span className="text-white font-medium">{currentDish.nutrients.protein}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-white/20">
                                <span className="text-white/90">Carbs</span>
                                <span className="text-white font-medium">{currentDish.nutrients.carbs}</span>
                              </div>
                              <div className="flex justify-between items-center py-2 border-b border-white/20">
                                <span className="text-white/90">Fat</span>
                                <span className="text-white font-medium">{currentDish.nutrients.fat}</span>
                              </div>
                            </div>
                          </div>

                          {/* Micronutrients */}
                          <div className="space-y-3">
                            <h4 className="text-white text-lg font-semibold mb-3" style={{
      fontFamily: "Montserrat, sans-serif",
      fontWeight: 700,
      lineHeight: "100%",
      letterSpacing: "0",
      fontSize:'15px'
    }}>Micronutrients</h4>
                            <div className="space-y-2">
                              {currentDish.nutrients.microNutrients.map((nutrient, index) => (
                                <div key={index} className="flex justify-between items-center py-2 border-b border-white/20">
                                  <span className="text-white/90"
                                  style={{
      fontFamily: "Poppins, sans-serif",
      fontWeight: 400,
      lineHeight: "100%",
      letterSpacing: "0",
      fontSize:'12px'
    }}>{nutrient.name}</span>
                                  <div className="text-right" style={{
      fontFamily: "Poppins, sans-serif",
      fontWeight: 300,
      lineHeight: "100%",
      letterSpacing: "0.5px",
      fontSize:'12px'
    }}>
                                    <span className="text-white font-medium">{nutrient.amount}</span>
                                    <span className="text-white/60 text-sm ml-2" style={{fontSize:'12px'}}>({nutrient.percentage})</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row gap-8 min-h-[350px]">
                <div className="relative h-[280px] rounded-3xl overflow-hidden bg-[#EEE9DA]/10 flex items-center justify-center w-full md:w-[280px]">
                  <p className="text-white/60 text-center px-4">Select a day to view the menu</p>
                </div>
                <div className="flex-grow flex items-center justify-center">
                  <p className="text-white/60 text-center">Select a day to view the menu details</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <style jsx>{`
          .perspective-1000 {
            perspective: 1000px;
          }
          .preserve-3d {
            transform-style: preserve-3d;
          }
          .backface-hidden {
            backface-visibility: hidden;
          }
          .rotate-y-180 {
            transform: rotateY(180deg);
          }
          .custom-scrollbar {
            scrollbar-width: thin;
            scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
          }
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background-color: rgba(255, 255, 255, 0.3);
            border-radius: 3px;
          }
        `}</style>
      </div>
    </div>
  );
} 