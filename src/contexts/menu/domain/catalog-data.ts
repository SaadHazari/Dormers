import type { StaticImageData } from 'next/image';

type SpiceLevel = 1 | 2 | 3;
export type Week = 'week1' | 'week2' | 'week3' | 'week4';
type AllergenType = 'gluten' | 'dairy' | 'nuts' | 'eggs' | 'soy' | 'peanuts' | 'mustard' | 'fish' | 'sesame';

interface MicroNutrient {
  name: string;
  amount: string;
  percentage: string;
}

// April 13, 2026 (Monday) is the anchor for Week 1
const WEEK1_START_MS = Date.UTC(2026, 3, 13);
const WEEK_NAMES: Week[] = ['week1', 'week2', 'week3', 'week4'];

export function getMenuWeek(date?: Date): Week {
  const now = date ?? new Date()
  const aeMs = now.getTime() + 4 * 60 * 60 * 1000
  const ae = new Date(aeMs)
  const d = new Date(Date.UTC(ae.getUTCFullYear(), ae.getUTCMonth(), ae.getUTCDate()));
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  const weeksElapsed = Math.round((d.getTime() - WEEK1_START_MS) / (7 * 24 * 60 * 60 * 1000));
  return WEEK_NAMES[((weeksElapsed % 4) + 4) % 4];
}

export function findDishForDate(date: Date, isVeg: boolean): Dish | null {
  const jsDow = date.getUTCDay();
  if (jsDow === 0) return null;
  const dayOfWeek = jsDow - 1;
  const week = getMenuWeek(date);
  return (
    MENU_DATA.find(d => d.week === week && d.dayOfWeek === dayOfWeek && d.isVeg === isVeg) ?? null
  );
}

export interface Dish {
  id: number;
  name: string;
  week: Week;
  description: string;
  image: string | StaticImageData;
  isVeg: boolean;
  dayOfWeek: number;
  spiceLevel: SpiceLevel;
  allergens: AllergenType[];
  nutrients: {
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
    microNutrients: MicroNutrient[];
  };
}

export const MENU_DATA: Dish[] = [
  {
    id: 1,
    name: "Chicken Afghani w/ Yellow Rice",
    week: "week1",
    description:
      "Smoky cream-and-cashew marinated chicken grilled golden, paired with fragrant turmeric basmati",
    image: "/images/Week1/NonVeg/Chicken_Afghani_w__Yellow_Rice.jpg",
    isVeg: false,
    dayOfWeek: 0, // Monday
    spiceLevel: 1,
    allergens: ['dairy', 'nuts'],
    nutrients: {
      calories: "655 kcal",
      protein: "35g",
      carbs: "98g",
      fat: "11.5g",
      microNutrients: [
        { name: "Iron", amount: "2.8mg", percentage: "16%" },
        { name: "Vitamin B6", amount: "0.7mg", percentage: "41%" },
        { name: "Selenium", amount: "27mcg", percentage: "49%" },
        { name: "Niacin (B3)", amount: "9.5mg", percentage: "59%" },
        { name: "Phosphorus", amount: "280mg", percentage: "22%" },
      ],
    },
  },
  {
    id: 2,
    name: "Dormer's Chicken w/ Zeera Rice",
    week: "week1",
    description:
      "House-recipe spiced chicken in a rich tomato-onion masala, served over toasted cumin basmati",
    image: "/images/Week1/NonVeg/Dormers_Chicken_w__Zeera_Rice.jpg",
    isVeg: false,
    dayOfWeek: 1, // Tuesday
    spiceLevel: 2,
    allergens: [],
    nutrients: {
      calories: "610 kcal",
      protein: "27g",
      carbs: "82g",
      fat: "14g",
      microNutrients: [
        { name: "Iron", amount: "3.2mg", percentage: "18%" },
        { name: "Vitamin B6", amount: "0.6mg", percentage: "35%" },
        { name: "Selenium", amount: "24mcg", percentage: "44%" },
        { name: "Niacin (B3)", amount: "8.5mg", percentage: "53%" },
        { name: "Phosphorus", amount: "260mg", percentage: "21%" },
      ],
    },
  },
  {
    id: 3,
    name: "Chicken Wanazi w/ Oven Baked Naan",
    week: "week1",
    description:
      "East African coconut milk chicken stew simmered with warm spices, scooped up with pillowy naan",
    image: "/images/Week1/NonVeg/Chicken_Wanazi_w__Oven_Baked_Naan.jpg",
    isVeg: false,
    dayOfWeek: 2, // Wednesday
    spiceLevel: 1,
    allergens: ['gluten', 'dairy'],
    nutrients: {
      calories: "600 kcal",
      protein: "31g",
      carbs: "75g",
      fat: "22g",
      microNutrients: [
        { name: "Iron", amount: "3.5mg", percentage: "19%" },
        { name: "Potassium", amount: "580mg", percentage: "12%" },
        { name: "Vitamin B6", amount: "0.5mg", percentage: "29%" },
        { name: "Manganese", amount: "1.4mg", percentage: "61%" },
        { name: "Selenium", amount: "22mcg", percentage: "40%" },
      ],
    },
  },
  {
    id: 4,
    name: "Meatballs w/ Mashed Potatoes & Mushroom Sauce",
    week: "week1",
    description:
      "Juicy seasoned beef meatballs over buttery mash, drenched in earthy mushroom gravy",
    image: "/images/Week1/NonVeg/Meatballs_w__Mashed_Potatoes_and_Mushroom_Sauce.jpg",
    isVeg: false,
    dayOfWeek: 3, // Thursday
    spiceLevel: 1,
    allergens: ['gluten', 'dairy', 'eggs'],
    nutrients: {
      calories: "575 kcal",
      protein: "36g",
      carbs: "44g",
      fat: "29g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Vitamin B12", amount: "3.1mcg", percentage: "129%" },
        { name: "Zinc", amount: "5.8mg", percentage: "53%" },
        { name: "Selenium", amount: "22mcg", percentage: "40%" },
        { name: "Niacin (B3)", amount: "6.5mg", percentage: "41%" },
      ],
    },
  },
  {
    id: 5,
    name: "Chicken Biryani",
    week: "week1",
    description:
      "Layered basmati and spiced chicken slow-cooked dum-style with saffron, fried onions, and whole spices",
    image: "/images/Week1/NonVeg/Chicken_Biryani.jpg",
    isVeg: false,
    dayOfWeek: 4, // Friday
    spiceLevel: 2,
    allergens: ['dairy'],
    nutrients: {
      calories: "565 kcal",
      protein: "26g",
      carbs: "60g",
      fat: "22g",
      microNutrients: [
        { name: "Iron", amount: "2.5mg", percentage: "14%" },
        { name: "Vitamin B6", amount: "0.6mg", percentage: "35%" },
        { name: "Selenium", amount: "25mcg", percentage: "45%" },
        { name: "Niacin (B3)", amount: "8.2mg", percentage: "51%" },
        { name: "Phosphorus", amount: "245mg", percentage: "20%" },
      ],
    },
  },
  {
    id: 6,
    name: "Chicken Seekh Kebab w/ Mint Dip & Naan",
    week: "week1",
    description:
      "Chargrilled minced-chicken kebabs seasoned with ginger and green chili, with cool mint chutney",
    image: "/images/Week1/NonVeg/Chicken_Seekh_Kebab_w__Mint_Dip_and_Naan.jpg",
    isVeg: false,
    dayOfWeek: 5, // Saturday
    spiceLevel: 2,
    allergens: ['gluten', 'dairy'],
    nutrients: {
      calories: "640 kcal",
      protein: "36g",
      carbs: "74g",
      fat: "22g",
      microNutrients: [
        { name: "Iron", amount: "3.8mg", percentage: "21%" },
        { name: "Vitamin B6", amount: "0.7mg", percentage: "41%" },
        { name: "Selenium", amount: "26mcg", percentage: "47%" },
        { name: "Niacin (B3)", amount: "8.8mg", percentage: "55%" },
        { name: "Phosphorus", amount: "290mg", percentage: "23%" },
      ],
    },
  },
  {
    id: 7,
    name: "Paneer Afghani w/ Middle Eastern Rice",
    week: "week1",
    description:
      "Silky paneer in cashew-cream white gravy paired with cardamom-saffron spiced rice",
    image: "/images/Week1/Veg/Paneer_Afghani_w__Middle_Eastern_Rice.jpg",
    isVeg: true,
    dayOfWeek: 0, // Monday
    spiceLevel: 1,
    allergens: ['dairy', 'nuts', 'sesame'],
    nutrients: {
      calories: "665 kcal",
      protein: "19g",
      carbs: "88g",
      fat: "25g",
      microNutrients: [
        { name: "Calcium", amount: "320mg", percentage: "25%" },
        { name: "Iron", amount: "3.2mg", percentage: "18%" },
        { name: "Vitamin A", amount: "180mcg", percentage: "20%" },
        { name: "Phosphorus", amount: "280mg", percentage: "22%" },
        { name: "Vitamin B12", amount: "0.6mcg", percentage: "25%" },
      ],
    },
  },
  {
    id: 8,
    name: "Dormers' Paneer w/ Zeera Rice",
    week: "week1",
    description:
      "House-recipe spiced paneer in a bold tomato-onion masala over cumin-tempered basmati rice",
    image: "/images/Week1/Veg/Dormers_Paneer_w__Zeera_Rice.jpg",
    isVeg: true,
    dayOfWeek: 1, // Tuesday
    spiceLevel: 2,
    allergens: ['dairy'],
    nutrients: {
      calories: "620 kcal",
      protein: "18g",
      carbs: "84.5g",
      fat: "22.5g",
      microNutrients: [
        { name: "Calcium", amount: "290mg", percentage: "22%" },
        { name: "Iron", amount: "4.8mg", percentage: "27%" },
        { name: "Vitamin E", amount: "3.2mg", percentage: "21%" },
        { name: "Phosphorus", amount: "260mg", percentage: "21%" },
        { name: "Vitamin C", amount: "8mg", percentage: "9%" },
      ],
    },
  },
  {
    id: 9,
    name: "Aaloo Gobi w/ Tandoor Bread",
    week: "week1",
    description:
      "Turmeric-kissed cauliflower and potato dry curry scooped up with charred tandoor flatbreads",
    image: "/images/Week1/Veg/Aaloo_Gobi_w__Tandoor_Bread.jpg",
    isVeg: true,
    dayOfWeek: 2, // Wednesday
    spiceLevel: 2,
    allergens: ['gluten'],
    nutrients: {
      calories: "455 kcal",
      protein: "13g",
      carbs: "70g",
      fat: "13g",
      microNutrients: [
        { name: "Vitamin C", amount: "45mg", percentage: "50%" },
        { name: "Vitamin K", amount: "22mcg", percentage: "18%" },
        { name: "Potassium", amount: "620mg", percentage: "13%" },
        { name: "Fiber", amount: "7.5g", percentage: "27%" },
        { name: "Iron", amount: "3.6mg", percentage: "20%" },
      ],
    },
  },
  {
    id: 10,
    name: "Plantballs w/ Mashed Potatoes & Mushroom Sauce",
    week: "week1",
    description:
      "Herb-seasoned plant-protein balls over buttery mash, draped in earthy mushroom gravy",
    image: "/images/Week1/Veg/Plantballs_w__Mashed_Potatoes_and_Mushroom_Sauce.jpg",
    isVeg: true,
    dayOfWeek: 3, // Thursday
    spiceLevel: 1,
    allergens: ['gluten', 'soy', 'dairy'],
    nutrients: {
      calories: "555 kcal",
      protein: "20.5g",
      carbs: "52g",
      fat: "28g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Fiber", amount: "6.5g", percentage: "23%" },
        { name: "Potassium", amount: "840mg", percentage: "18%" },
        { name: "Selenium", amount: "12mcg", percentage: "22%" },
        { name: "Vitamin B6", amount: "0.4mg", percentage: "24%" },
      ],
    },
  },
  {
    id: 11,
    name: "Chickpea Veg Biryani",
    week: "week1",
    description:
      "Fragrant basmati layered with spiced chickpeas, mixed vegetables, and caramelised onions",
    image: "/images/Week1/Veg/Chickpea_Veg_Biryani.jpg",
    isVeg: true,
    dayOfWeek: 4, // Friday
    spiceLevel: 2,
    allergens: [],
    nutrients: {
      calories: "585 kcal",
      protein: "16g",
      carbs: "90g",
      fat: "16.5g",
      microNutrients: [
        { name: "Fiber", amount: "9.5g", percentage: "34%" },
        { name: "Iron", amount: "4.6mg", percentage: "26%" },
        { name: "Folate", amount: "110mcg", percentage: "28%" },
        { name: "Manganese", amount: "1.8mg", percentage: "78%" },
        { name: "Potassium", amount: "480mg", percentage: "10%" },
      ],
    },
  },
  {
    id: 12,
    name: "Methi Matar Paneer w/ Tandoor Bread",
    week: "week1",
    description:
      "Fenugreek-laced peas and paneer in a velvety curry, served with smoky tandoor bread",
    image: "/images/Week1/Veg/Methi_Matar_Paneer_w__Tandoor_Bread.jpg",
    isVeg: true,
    dayOfWeek: 5, // Saturday
    spiceLevel: 2,
    allergens: ['dairy', 'gluten'],
    nutrients: {
      calories: "520 kcal",
      protein: "17.5g",
      carbs: "63g",
      fat: "20g",
      microNutrients: [
        { name: "Calcium", amount: "275mg", percentage: "21%" },
        { name: "Iron", amount: "5.4mg", percentage: "30%" },
        { name: "Vitamin K", amount: "48mcg", percentage: "40%" },
        { name: "Fiber", amount: "6.5g", percentage: "23%" },
        { name: "Folate", amount: "85mcg", percentage: "21%" },
      ],
    },
  },
  {
    id: 13,
    name: "Lamb Stroganoff w/ Riz Pilaf",
    week: "week2",
    description:
      "Tender lamb strips in velvety sour cream-mushroom sauce over herb-scented buttery rice pilaf",
    image: "/images/Week2/NonVeg/Lamb_Stroganoff_w__Riz_Pilaf.jpg",
    isVeg: false,
    dayOfWeek: 0, // Monday
    spiceLevel: 1,
    allergens: ['dairy', 'gluten'],
    nutrients: {
      calories: "685 kcal",
      protein: "30g",
      carbs: "72g",
      fat: "28.5g",
      microNutrients: [
        { name: "Vitamin B12", amount: "2.8mcg", percentage: "117%" },
        { name: "Iron", amount: "3.2mg", percentage: "18%" },
        { name: "Zinc", amount: "5.1mg", percentage: "46%" },
        { name: "Selenium", amount: "18mcg", percentage: "33%" },
        { name: "Niacin (B3)", amount: "7.5mg", percentage: "47%" },
      ],
    },
  },
  {
    id: 14,
    name: "African Coconut Rice w/ Fried Chicken",
    week: "week2",
    description:
      "Crispy golden fried chicken paired with coconut milk-infused West African jollof-style rice",
    image: "/images/Week2/NonVeg/African_Coconut_Rice_w__Fried_Chicken.jpg",
    isVeg: false,
    dayOfWeek: 1, // Tuesday
    spiceLevel: 2,
    allergens: ['gluten', 'eggs'],
    nutrients: {
      calories: "690 kcal",
      protein: "33g",
      carbs: "76g",
      fat: "27g",
      microNutrients: [
        { name: "Selenium", amount: "28mcg", percentage: "51%" },
        { name: "Phosphorus", amount: "295mg", percentage: "24%" },
        { name: "Vitamin B6", amount: "0.5mg", percentage: "29%" },
        { name: "Iron", amount: "2.4mg", percentage: "13%" },
        { name: "Manganese", amount: "1.6mg", percentage: "70%" },
      ],
    },
  },
  {
    id: 15,
    name: "African Peanut Chicken Stew w/ Indian Bread",
    week: "week2",
    description:
      "Rich West African groundnut stew with tender chicken, scooped up with warm pillowy naan",
    image: "/images/Week2/NonVeg/African_Peanut_Chicken_Stew_w__Indian_Bread.jpg",
    isVeg: false,
    dayOfWeek: 2, // Wednesday
    spiceLevel: 2,
    allergens: ['peanuts', 'gluten', 'dairy'],
    nutrients: {
      calories: "650 kcal",
      protein: "36g",
      carbs: "62g",
      fat: "28g",
      microNutrients: [
        { name: "Vitamin E", amount: "3.8mg", percentage: "25%" },
        { name: "Magnesium", amount: "112mg", percentage: "27%" },
        { name: "Potassium", amount: "540mg", percentage: "11%" },
        { name: "Niacin (B3)", amount: "10.5mg", percentage: "66%" },
        { name: "Phosphorus", amount: "310mg", percentage: "25%" },
      ],
    },
  },
  {
    id: 16,
    name: "Butter Chicken w/ Peas & Carrot Rice",
    week: "week2",
    description:
      "Creamy tomato-butter gravy with succulent chicken over colourful peas-and-carrot basmati",
    image: "/images/Week2/NonVeg/Butter_Chicken_w__Peas_and_Carrot_Rice.jpg",
    isVeg: false,
    dayOfWeek: 3, // Thursday
    spiceLevel: 1,
    allergens: ['dairy', 'nuts'],
    nutrients: {
      calories: "665 kcal",
      protein: "36.5g",
      carbs: "80g",
      fat: "19.5g",
      microNutrients: [
        { name: "Vitamin A", amount: "285mcg", percentage: "32%" },
        { name: "Calcium", amount: "95mg", percentage: "7%" },
        { name: "Iron", amount: "2.8mg", percentage: "16%" },
        { name: "Vitamin B6", amount: "0.6mg", percentage: "35%" },
        { name: "Niacin (B3)", amount: "9.8mg", percentage: "61%" },
      ],
    },
  },
  {
    id: 17,
    name: "Chicken Penne Pasta in White Sauce",
    week: "week2",
    description:
      "Al dente penne tossed with chicken strips in a luscious Parmesan-cream alfredo sauce",
    image: "/images/Week2/NonVeg/Chicken_Penne_Pasta_in_White_Sauce.jpg",
    isVeg: false,
    dayOfWeek: 4, // Friday
    spiceLevel: 1,
    allergens: ['gluten', 'dairy', 'eggs'],
    nutrients: {
      calories: "540 kcal",
      protein: "30g",
      carbs: "52g",
      fat: "22g",
      microNutrients: [
        { name: "Calcium", amount: "245mg", percentage: "19%" },
        { name: "Selenium", amount: "32mcg", percentage: "58%" },
        { name: "Phosphorus", amount: "320mg", percentage: "26%" },
        { name: "Vitamin B12", amount: "0.6mcg", percentage: "25%" },
        { name: "Sodium", amount: "880mg", percentage: "38%" },
      ],
    },
  },
  {
    id: 18,
    name: "Lamb Pilaf w/ Salad",
    week: "week2",
    description:
      "Spiced lamb rice pilaf with toasted almonds and warm cinnamon, served with a crisp fresh salad",
    image: "/images/Week2/NonVeg/Lamb_Pilaf_w__Salad.jpg",
    isVeg: false,
    dayOfWeek: 5, // Saturday
    spiceLevel: 2,
    allergens: ['nuts'],
    nutrients: {
      calories: "580 kcal",
      protein: "29.5g",
      carbs: "69g",
      fat: "18g",
      microNutrients: [
        { name: "Vitamin B12", amount: "2.5mcg", percentage: "104%" },
        { name: "Iron", amount: "3.8mg", percentage: "21%" },
        { name: "Zinc", amount: "4.8mg", percentage: "44%" },
        { name: "Vitamin A", amount: "95mcg", percentage: "11%" },
        { name: "Fiber", amount: "3g", percentage: "11%" },
      ],
    },
  },
  {
    id: 19,
    name: "Dal Makhni w/ Zeera Rice",
    week: "week2",
    description:
      "Velvety slow-cooked black lentils and kidney beans finished with cream, over cumin-tempered rice",
    image: "/images/Week2/Veg/Dal_Makhni_w__Zeera_Rice.jpg",
    isVeg: true,
    dayOfWeek: 0, // Monday
    spiceLevel: 1,
    allergens: ['dairy'],
    nutrients: {
      calories: "600 kcal",
      protein: "17.5g",
      carbs: "94g",
      fat: "15.5g",
      microNutrients: [
        { name: "Iron", amount: "4.8mg", percentage: "27%" },
        { name: "Fiber", amount: "8.5g", percentage: "30%" },
        { name: "Folate", amount: "125mcg", percentage: "31%" },
        { name: "Calcium", amount: "78mg", percentage: "6%" },
        { name: "Potassium", amount: "480mg", percentage: "10%" },
      ],
    },
  },
  {
    id: 20,
    name: "Penne Pasta Pomodoro",
    week: "week2",
    description:
      "Al dente penne tossed in a bright San Marzano tomato-basil sauce with a drizzle of olive oil",
    image: "/images/Week2/Veg/Penne_Pasta_Pomodoro.jpg",
    isVeg: true,
    dayOfWeek: 1, // Tuesday
    spiceLevel: 1,
    allergens: ['gluten'],
    nutrients: {
      calories: "490 kcal",
      protein: "16g",
      carbs: "82g",
      fat: "9g",
      microNutrients: [
        { name: "Vitamin C", amount: "18mg", percentage: "20%" },
        { name: "Iron", amount: "3.5mg", percentage: "19%" },
        { name: "Fiber", amount: "6g", percentage: "21%" },
        { name: "Vitamin K", amount: "22mcg", percentage: "18%" },
        { name: "Potassium", amount: "520mg", percentage: "11%" },
      ],
    },
  },
  {
    id: 21,
    name: "Dum Aaloo & Dal w/ Indian Bread",
    week: "week2",
    description:
      "Spiced baby potatoes in rich gravy alongside homestyle lentil dal, scooped up with warm flatbreads",
    image: "/images/Week2/Veg/Dum_Aaloo_and_Dal_w__Indian_Bread.jpg",
    isVeg: true,
    dayOfWeek: 2, // Wednesday
    spiceLevel: 2,
    allergens: ['gluten'],
    nutrients: {
      calories: "590 kcal",
      protein: "17.5g",
      carbs: "79g",
      fat: "20.5g",
      microNutrients: [
        { name: "Fiber", amount: "9.5g", percentage: "34%" },
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Potassium", amount: "680mg", percentage: "14%" },
        { name: "Vitamin C", amount: "15mg", percentage: "17%" },
        { name: "Folate", amount: "95mcg", percentage: "24%" },
      ],
    },
  },
  {
    id: 22,
    name: "Butter Paneer w/ Carrot & Peas Rice",
    week: "week2",
    description:
      "Creamy tomato-butter paneer curry served over colourful carrot-and-peas pulao",
    image: "/images/Week2/Veg/Butter_Paneer_w__Carrot_and_Peas_Rice.jpg",
    isVeg: true,
    dayOfWeek: 3, // Thursday
    spiceLevel: 1,
    allergens: ['dairy'],
    nutrients: {
      calories: "695 kcal",
      protein: "25g",
      carbs: "84g",
      fat: "27g",
      microNutrients: [
        { name: "Calcium", amount: "350mg", percentage: "27%" },
        { name: "Vitamin A", amount: "485mcg", percentage: "54%" },
        { name: "Iron", amount: "3.2mg", percentage: "18%" },
        { name: "Fiber", amount: "4.5g", percentage: "16%" },
        { name: "Potassium", amount: "410mg", percentage: "9%" },
      ],
    },
  },
  {
    id: 23,
    name: "Penne Veggie w/ White Sauce",
    week: "week2",
    description:
      "Penne and seasonal vegetables enveloped in a silky, buttery bechamel with a hint of nutmeg",
    image: "/images/Week2/Veg/Penne_Veggie_w__White_Sauce.jpg",
    isVeg: true,
    dayOfWeek: 4, // Friday
    spiceLevel: 1,
    allergens: ['gluten', 'dairy'],
    nutrients: {
      calories: "530 kcal",
      protein: "15g",
      carbs: "66g",
      fat: "22g",
      microNutrients: [
        { name: "Calcium", amount: "285mg", percentage: "22%" },
        { name: "Fiber", amount: "5g", percentage: "18%" },
        { name: "Iron", amount: "2.8mg", percentage: "16%" },
        { name: "Vitamin A", amount: "165mcg", percentage: "18%" },
        { name: "Sodium", amount: "620mg", percentage: "27%" },
      ],
    },
  },
  {
    id: 24,
    name: "Rajma Chawal",
    week: "week2",
    description:
      "Slow-simmered Punjabi kidney bean curry spooned over steamed rice — the ultimate North Indian comfort plate",
    image: "/images/Week2/Veg/Rajma_Chawal.jpg",
    isVeg: true,
    dayOfWeek: 5, // Saturday
    spiceLevel: 2,
    allergens: [],
    nutrients: {
      calories: "560 kcal",
      protein: "20.5g",
      carbs: "101g",
      fat: "7.5g",
      microNutrients: [
        { name: "Fiber", amount: "11g", percentage: "39%" },
        { name: "Iron", amount: "5.2mg", percentage: "29%" },
        { name: "Folate", amount: "155mcg", percentage: "39%" },
        { name: "Potassium", amount: "620mg", percentage: "13%" },
        { name: "Magnesium", amount: "72mg", percentage: "17%" },
      ],
    },
  },
  {
    id: 25,
    name: "Chicken Khorma w/ Bagara Rice",
    week: "week3",
    description:
      "Velvety Mughlai korma with cashew-cream sauce paired with Hyderabadi spice-tempered bagara rice",
    image: "/images/Week3/NonVeg/Chicken_Khorma_w__Bagara_Rice.jpg",
    isVeg: false,
    dayOfWeek: 0, // Monday
    spiceLevel: 1,
    allergens: ['dairy', 'nuts'],
    nutrients: {
      calories: "635 kcal",
      protein: "32g",
      carbs: "78g",
      fat: "21g",
      microNutrients: [
        { name: "Iron", amount: "2.8mg", percentage: "16%" },
        { name: "Calcium", amount: "85mg", percentage: "7%" },
        { name: "Vitamin B12", amount: "0.5mcg", percentage: "21%" },
        { name: "Zinc", amount: "2.4mg", percentage: "22%" },
        { name: "Sodium", amount: "680mg", percentage: "30%" },
      ],
    },
  },
  {
    id: 26,
    name: "Chicken Fried Rice",
    week: "week3",
    description:
      "Smoky wok-tossed rice with chicken, scrambled egg, crunchy veg, and a hit of soy",
    image: "/images/Week3/NonVeg/Chicken_Fried_Rice.jpg",
    isVeg: false,
    dayOfWeek: 1, // Tuesday
    spiceLevel: 1,
    allergens: ['eggs', 'soy', 'gluten'],
    nutrients: {
      calories: "680 kcal",
      protein: "31g",
      carbs: "88g",
      fat: "22g",
      microNutrients: [
        { name: "Iron", amount: "3.6mg", percentage: "20%" },
        { name: "Sodium", amount: "1120mg", percentage: "49%" },
        { name: "Vitamin A", amount: "180mcg", percentage: "20%" },
        { name: "Potassium", amount: "385mg", percentage: "8%" },
        { name: "Calcium", amount: "62mg", percentage: "5%" },
      ],
    },
  },
  {
    id: 27,
    name: "Aaloo Kheema w/ Naan",
    week: "week3",
    description:
      "Rustic spiced lamb mince studded with golden potato chunks, scooped up with warm tandoori naan",
    image: "/images/Week3/NonVeg/Aaloo_Kheema_w__Naan.jpg",
    isVeg: false,
    dayOfWeek: 2, // Wednesday
    spiceLevel: 2,
    allergens: ['gluten', 'dairy'],
    nutrients: {
      calories: "645 kcal",
      protein: "28g",
      carbs: "74g",
      fat: "26g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Zinc", amount: "4.8mg", percentage: "44%" },
        { name: "Vitamin B12", amount: "2.1mcg", percentage: "88%" },
        { name: "Potassium", amount: "520mg", percentage: "11%" },
        { name: "Sodium", amount: "790mg", percentage: "34%" },
      ],
    },
  },
  {
    id: 28,
    name: "Malai Tikka w/ Lemon Rice",
    week: "week3",
    description:
      "Silky cream-marinated chicken tikka grilled smoky, served over tangy turmeric lemon rice",
    image: "/images/Week3/NonVeg/Malai_Tikka_w__Lemon_Rice.jpg",
    isVeg: false,
    dayOfWeek: 3, // Thursday
    spiceLevel: 1,
    allergens: ['dairy'],
    nutrients: {
      calories: "595 kcal",
      protein: "31g",
      carbs: "72.5g",
      fat: "19.5g",
      microNutrients: [
        { name: "Vitamin B6", amount: "0.7mg", percentage: "41%" },
        { name: "Calcium", amount: "110mg", percentage: "8%" },
        { name: "Iron", amount: "2.2mg", percentage: "12%" },
        { name: "Selenium", amount: "24mcg", percentage: "44%" },
        { name: "Sodium", amount: "540mg", percentage: "23%" },
      ],
    },
  },
  {
    id: 29,
    name: "Spaghetti Bolognese w/ Marinara Sauce",
    week: "week3",
    description:
      "Al dente spaghetti tossed in slow-simmered beef ragu with rich tomato marinara",
    image: "/images/Week3/NonVeg/Spaghetti_Bolognese_w__Marinara_Sauce.jpg",
    isVeg: false,
    dayOfWeek: 4, // Friday
    spiceLevel: 1,
    allergens: ['gluten'],
    nutrients: {
      calories: "545 kcal",
      protein: "25.5g",
      carbs: "65g",
      fat: "18.5g",
      microNutrients: [
        { name: "Iron", amount: "4.5mg", percentage: "25%" },
        { name: "Vitamin B12", amount: "1.8mcg", percentage: "75%" },
        { name: "Zinc", amount: "4.2mg", percentage: "38%" },
        { name: "Lycopene", amount: "8.5mg", percentage: "—" },
        { name: "Sodium", amount: "720mg", percentage: "31%" },
      ],
    },
  },
  {
    id: 30,
    name: "Chicken Biryani",
    week: "week3",
    description:
      "Fragrant layered biryani with saffron-kissed basmati, fried onions, and tender spiced chicken",
    image: "/images/Week3/NonVeg/Chicken_Biryani.jpg",
    isVeg: false,
    dayOfWeek: 5, // Saturday
    spiceLevel: 2,
    allergens: ['dairy'],
    nutrients: {
      calories: "650 kcal",
      protein: "30.5g",
      carbs: "80g",
      fat: "22g",
      microNutrients: [
        { name: "Iron", amount: "3.2mg", percentage: "18%" },
        { name: "Vitamin B12", amount: "0.6mcg", percentage: "25%" },
        { name: "Zinc", amount: "2.8mg", percentage: "25%" },
        { name: "Sodium", amount: "850mg", percentage: "37%" },
        { name: "Potassium", amount: "380mg", percentage: "8%" },
      ],
    },
  },
  {
    id: 31,
    name: "Veg Aaloo Khorma w/ Bagara Rice",
    week: "week3",
    description:
      "Creamy potato korma in coconut-cashew gravy with clove-and-cumin tempered Hyderabadi rice",
    image: "/images/Week3/Veg/Veg_Aaloo_Khorma_w__Bagara_Rice.jpg",
    isVeg: true,
    dayOfWeek: 0, // Monday
    spiceLevel: 1,
    allergens: ['nuts', 'dairy'],
    nutrients: {
      calories: "585 kcal",
      protein: "12.5g",
      carbs: "88g",
      fat: "20g",
      microNutrients: [
        { name: "Fiber", amount: "5.5g", percentage: "20%" },
        { name: "Iron", amount: "3.2mg", percentage: "18%" },
        { name: "Calcium", amount: "85mg", percentage: "7%" },
        { name: "Potassium", amount: "480mg", percentage: "10%" },
        { name: "Vitamin C", amount: "8mg", percentage: "9%" },
      ],
    },
  },
  {
    id: 32,
    name: "Veg Fried Rice",
    week: "week3",
    description:
      "Wok-tossed basmati rice loaded with crunchy vegetables, soy sauce, and a hint of sesame",
    image: "/images/Week3/Veg/Veg_Fried_Rice.jpg",
    isVeg: true,
    dayOfWeek: 1, // Tuesday
    spiceLevel: 1,
    allergens: ['soy', 'sesame', 'eggs'],
    nutrients: {
      calories: "680 kcal",
      protein: "15g",
      carbs: "118g",
      fat: "13.5g",
      microNutrients: [
        { name: "Fiber", amount: "4.5g", percentage: "16%" },
        { name: "Iron", amount: "3mg", percentage: "17%" },
        { name: "Vitamin A", amount: "300IU", percentage: "10%" },
        { name: "Sodium", amount: "1050mg", percentage: "46%" },
        { name: "Potassium", amount: "320mg", percentage: "7%" },
      ],
    },
  },
  {
    id: 33,
    name: "Paneer Tikka & Dal w/ Roti",
    week: "week3",
    description:
      "Smoky char-grilled paneer tikka with hearty lentil dal and two soft whole-wheat rotis",
    image: "/images/Week3/Veg/Paneer_Tikka_and_Dal_w__Roti.jpg",
    isVeg: true,
    dayOfWeek: 2, // Wednesday
    spiceLevel: 2,
    allergens: ['dairy', 'gluten'],
    nutrients: {
      calories: "640 kcal",
      protein: "27g",
      carbs: "70g",
      fat: "27g",
      microNutrients: [
        { name: "Fiber", amount: "8.5g", percentage: "30%" },
        { name: "Calcium", amount: "420mg", percentage: "32%" },
        { name: "Iron", amount: "5.2mg", percentage: "29%" },
        { name: "Folate", amount: "95mcg", percentage: "24%" },
        { name: "Potassium", amount: "510mg", percentage: "11%" },
      ],
    },
  },
  {
    id: 34,
    name: "Paneer Lababdar w/ Lemon Rice",
    week: "week3",
    description:
      "Velvety paneer in rich tomato-cashew-cream gravy with tangy turmeric lemon rice",
    image: "/images/Week3/Veg/Paneer_Lababdar_w__Lemon_Rice.jpg",
    isVeg: true,
    dayOfWeek: 3, // Thursday
    spiceLevel: 1,
    allergens: ['dairy', 'nuts'],
    nutrients: {
      calories: "600 kcal",
      protein: "17g",
      carbs: "75g",
      fat: "25g",
      microNutrients: [
        { name: "Fiber", amount: "3.5g", percentage: "13%" },
        { name: "Calcium", amount: "350mg", percentage: "27%" },
        { name: "Iron", amount: "2.8mg", percentage: "16%" },
        { name: "Vitamin C", amount: "12mg", percentage: "13%" },
        { name: "Potassium", amount: "390mg", percentage: "8%" },
      ],
    },
  },
  {
    id: 35,
    name: "Spaghetti Pomodoro",
    week: "week3",
    description:
      "Al dente spaghetti tossed in San Marzano tomato sauce with fresh basil and olive oil",
    image: "/images/Week3/Veg/Spaghetti_Pomodoro.jpg",
    isVeg: true,
    dayOfWeek: 4, // Friday
    spiceLevel: 1,
    allergens: ['gluten'],
    nutrients: {
      calories: "420 kcal",
      protein: "15.5g",
      carbs: "71g",
      fat: "7.5g",
      microNutrients: [
        { name: "Fiber", amount: "6.5g", percentage: "23%" },
        { name: "Iron", amount: "4mg", percentage: "22%" },
        { name: "Vitamin C", amount: "18mg", percentage: "20%" },
        { name: "Potassium", amount: "560mg", percentage: "12%" },
        { name: "Calcium", amount: "60mg", percentage: "5%" },
      ],
    },
  },
  {
    id: 36,
    name: "Chickpea Veg Biryani w/ Raita",
    week: "week3",
    description:
      "Fragrant saffron-spiced biryani layered with tender chickpeas and a cool yogurt raita",
    image: "/images/Week3/Veg/Chickpea_Veg_Biryani_w__Raita.jpg",
    isVeg: true,
    dayOfWeek: 5, // Saturday
    spiceLevel: 2,
    allergens: ['dairy'],
    nutrients: {
      calories: "535 kcal",
      protein: "16g",
      carbs: "84g",
      fat: "14g",
      microNutrients: [
        { name: "Fiber", amount: "9.5g", percentage: "34%" },
        { name: "Iron", amount: "4.5mg", percentage: "25%" },
        { name: "Folate", amount: "145mcg", percentage: "36%" },
        { name: "Calcium", amount: "120mg", percentage: "9%" },
        { name: "Potassium", amount: "440mg", percentage: "9%" },
      ],
    },
  },
  {
    id: 37,
    name: "Dormers' Green Kabab w/ Chutney & Flat Bread",
    week: "week4",
    description:
      "Herb-loaded chicken kebab with coriander, mint and green chilli, tangy chutney and rumali roti",
    image: "/images/Week4/NonVeg/Dormers_Green_Kabab_w__Chutney_and_Flat_Bread.jpg",
    isVeg: false,
    dayOfWeek: 0, // Monday
    spiceLevel: 2,
    allergens: ['gluten'],
    nutrients: {
      calories: "545 kcal",
      protein: "38.5g",
      carbs: "55g",
      fat: "17.5g",
      microNutrients: [
        { name: "Iron", amount: "3.2mg", percentage: "18%" },
        { name: "Vitamin C", amount: "12mg", percentage: "13%" },
        { name: "Vitamin B6", amount: "0.7mg", percentage: "41%" },
        { name: "Niacin (B3)", amount: "10.5mg", percentage: "66%" },
        { name: "Phosphorus", amount: "280mg", percentage: "22%" },
      ],
    },
  },
  {
    id: 38,
    name: "Peri-Peri Chicken w/ Jolof Rice",
    week: "week4",
    description:
      "Fiery African bird's-eye chilli chicken over smoky tomato-stewed jollof rice — bold heat meets deep umami",
    image: "/images/Week4/NonVeg/Peri-Peri_Chicken_w__Jolof_Rice.jpg",
    isVeg: false,
    dayOfWeek: 1, // Tuesday
    spiceLevel: 3,
    allergens: [],
    nutrients: {
      calories: "650 kcal",
      protein: "34g",
      carbs: "84g",
      fat: "19g",
      microNutrients: [
        { name: "Vitamin C", amount: "25mg", percentage: "28%" },
        { name: "Vitamin A", amount: "180mcg", percentage: "20%" },
        { name: "Iron", amount: "3.0mg", percentage: "17%" },
        { name: "Niacin (B3)", amount: "11mg", percentage: "69%" },
        { name: "Vitamin B6", amount: "0.65mg", percentage: "38%" },
      ],
    },
  },
  {
    id: 39,
    name: "Moroccan Chicken Tagine w/ Indian Bread",
    week: "week4",
    description:
      "Slow-cooked chicken in warm cinnamon-saffron sauce with apricots and olives, scooped with pillowy naan",
    image: "/images/Week4/NonVeg/Moroccan_Chicken_Tagine_w__Indian_Bread.jpg",
    isVeg: false,
    dayOfWeek: 2, // Wednesday
    spiceLevel: 1,
    allergens: ['gluten', 'dairy'],
    nutrients: {
      calories: "575 kcal",
      protein: "29g",
      carbs: "76g",
      fat: "16g",
      microNutrients: [
        { name: "Iron", amount: "3.8mg", percentage: "21%" },
        { name: "Vitamin A", amount: "145mcg", percentage: "16%" },
        { name: "Niacin (B3)", amount: "8.5mg", percentage: "53%" },
        { name: "Vitamin B6", amount: "0.55mg", percentage: "32%" },
        { name: "Fiber", amount: "4.5g", percentage: "16%" },
      ],
    },
  },
  {
    id: 40,
    name: "Veg Biryani w/ Dormer's Chicken",
    week: "week4",
    description:
      "Saffron-layered vegetable biryani paired with juicy house-spiced grilled chicken on the side",
    image: "/images/Week4/NonVeg/Veg_Biryani_w__Dormers_Chicken.jpg",
    isVeg: false,
    dayOfWeek: 3, // Thursday
    spiceLevel: 2,
    allergens: ['nuts', 'dairy'],
    nutrients: {
      calories: "595 kcal",
      protein: "48g",
      carbs: "62g",
      fat: "15.5g",
      microNutrients: [
        { name: "Niacin (B3)", amount: "13mg", percentage: "81%" },
        { name: "Vitamin B6", amount: "0.8mg", percentage: "47%" },
        { name: "Phosphorus", amount: "340mg", percentage: "27%" },
        { name: "Iron", amount: "3.5mg", percentage: "19%" },
        { name: "Selenium", amount: "32mcg", percentage: "58%" },
      ],
    },
  },
  {
    id: 41,
    name: "Dormer's Style Halal Guys Bowl",
    week: "week4",
    description:
      "NYC halal-cart grilled mutton over turmeric rice, drizzled with creamy white sauce and smoky hot sauce",
    image: "/images/Week4/NonVeg/Dormers_Style_Halal_Guys_Bowl.jpg",
    isVeg: false,
    dayOfWeek: 4, // Friday
    spiceLevel: 2,
    allergens: ['dairy', 'eggs', 'mustard'],
    nutrients: {
      calories: "695 kcal",
      protein: "35g",
      carbs: "77g",
      fat: "24.5g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Vitamin B12", amount: "2.8mcg", percentage: "117%" },
        { name: "Zinc", amount: "5.5mg", percentage: "50%" },
        { name: "Niacin (B3)", amount: "7.5mg", percentage: "47%" },
        { name: "Phosphorus", amount: "310mg", percentage: "25%" },
      ],
    },
  },
  {
    id: 42,
    name: "Thai Chicken Curry w/ Coconut Rice",
    week: "week4",
    description:
      "Creamy Thai curry chicken with basil, lemongrass and kaffir lime ladled over coconut-infused rice",
    image: "/images/Week4/NonVeg/Thai_Chicken_Curry_w__Coconut_Rice.jpg",
    isVeg: false,
    dayOfWeek: 5, // Saturday
    spiceLevel: 2,
    allergens: [],
    nutrients: {
      calories: "695 kcal",
      protein: "31g",
      carbs: "82g",
      fat: "26g",
      microNutrients: [
        { name: "Iron", amount: "3.8mg", percentage: "21%" },
        { name: "Niacin (B3)", amount: "9.5mg", percentage: "59%" },
        { name: "Vitamin B6", amount: "0.6mg", percentage: "35%" },
        { name: "Manganese", amount: "1.8mg", percentage: "78%" },
        { name: "Phosphorus", amount: "295mg", percentage: "24%" },
      ],
    },
  },
  {
    id: 43,
    name: "Classic Tangy Cholay w/ Naan",
    week: "week4",
    description:
      "Punjabi-spiced chickpeas simmered in a tangy tomato-amchur gravy, scooped with pillowy buttered naan",
    image: "/images/Week4/Veg/Classic_Tangy_Cholay_w__Naan.jpg",
    isVeg: true,
    dayOfWeek: 0, // Monday
    spiceLevel: 2,
    allergens: ['gluten', 'dairy'],
    nutrients: {
      calories: "620 kcal",
      protein: "21g",
      carbs: "92g",
      fat: "21.5g",
      microNutrients: [
        { name: "Iron", amount: "4.8mg", percentage: "27%" },
        { name: "Folate", amount: "172mcg", percentage: "43%" },
        { name: "Dietary Fiber", amount: "9.5g", percentage: "34%" },
        { name: "Potassium", amount: "380mg", percentage: "8%" },
        { name: "Manganese", amount: "1.2mg", percentage: "52%" },
      ],
    },
  },
  {
    id: 44,
    name: "Jolof Rice w/ Grilled Veggies",
    week: "week4",
    description:
      "Smoky West African tomato-stewed rice layered with charred seasonal vegetables and warm spices",
    image: "/images/Week4/Veg/Jolof_Rice_w__Grilled_Veggies.jpg",
    isVeg: true,
    dayOfWeek: 1, // Tuesday
    spiceLevel: 2,
    allergens: [],
    nutrients: {
      calories: "555 kcal",
      protein: "11g",
      carbs: "84g",
      fat: "15g",
      microNutrients: [
        { name: "Vitamin C", amount: "22mg", percentage: "24%" },
        { name: "Vitamin A", amount: "185mcg", percentage: "21%" },
        { name: "Lycopene", amount: "6.5mg", percentage: "—" },
        { name: "Iron", amount: "2.4mg", percentage: "13%" },
        { name: "Potassium", amount: "340mg", percentage: "7%" },
      ],
    },
  },
  {
    id: 45,
    name: "Pav Bhaji",
    week: "week4",
    description:
      "Mumbai street-style butter-mashed vegetable curry loaded with spices, served with crisp-toasted pav buns",
    image: "/images/Week4/Veg/Pav_Bhaji.jpg",
    isVeg: true,
    dayOfWeek: 2, // Wednesday
    spiceLevel: 2,
    allergens: ['gluten', 'dairy'],
    nutrients: {
      calories: "590 kcal",
      protein: "15.5g",
      carbs: "82g",
      fat: "22g",
      microNutrients: [
        { name: "Vitamin A", amount: "320mcg", percentage: "36%" },
        { name: "Vitamin C", amount: "35mg", percentage: "39%" },
        { name: "Potassium", amount: "813mg", percentage: "17%" },
        { name: "Iron", amount: "3.2mg", percentage: "18%" },
        { name: "Dietary Fiber", amount: "7.5g", percentage: "27%" },
      ],
    },
  },
  {
    id: 46,
    name: "Veg Biryani w/ Dormers' Paneer",
    week: "week4",
    description:
      "Fragrant basmati layered with saffron, whole spices, and golden-seared paneer cubes",
    image: "/images/Week4/Veg/Veg_Biryani_w__Dormers_Paneer.jpg",
    isVeg: true,
    dayOfWeek: 3, // Thursday
    spiceLevel: 2,
    allergens: ['dairy', 'nuts'],
    nutrients: {
      calories: "575 kcal",
      protein: "17g",
      carbs: "88g",
      fat: "15g",
      microNutrients: [
        { name: "Calcium", amount: "285mg", percentage: "22%" },
        { name: "Phosphorus", amount: "210mg", percentage: "17%" },
        { name: "Vitamin B12", amount: "0.6mcg", percentage: "25%" },
        { name: "Iron", amount: "2.1mg", percentage: "12%" },
        { name: "Dietary Fiber", amount: "3.5g", percentage: "13%" },
      ],
    },
  },
  {
    id: 47,
    name: "Rajma Aaloo w/ Roti",
    week: "week4",
    description:
      "Slow-cooked kidney beans and soft potatoes in a thick masala gravy with whole-wheat tandoori rotis",
    image: "/images/Week4/Veg/Rajma_Aaloo_w__Roti.jpg",
    isVeg: true,
    dayOfWeek: 4, // Friday
    spiceLevel: 2,
    allergens: ['gluten'],
    nutrients: {
      calories: "485 kcal",
      protein: "16g",
      carbs: "80g",
      fat: "10g",
      microNutrients: [
        { name: "Iron", amount: "4.5mg", percentage: "25%" },
        { name: "Folate", amount: "145mcg", percentage: "36%" },
        { name: "Potassium", amount: "520mg", percentage: "11%" },
        { name: "Dietary Fiber", amount: "10.5g", percentage: "38%" },
        { name: "Molybdenum", amount: "65mcg", percentage: "144%" },
      ],
    },
  },
  {
    id: 48,
    name: "Kadhai Paneer w/ Cumin Rice",
    week: "week4",
    description:
      "Wok-tossed paneer and crunchy bell peppers in roasted kadhai spice, served over cumin-tempered rice",
    image: "/images/Week4/Veg/Kadhai_Paneer_w__Cumin_Rice.jpg",
    isVeg: true,
    dayOfWeek: 5, // Saturday
    spiceLevel: 2,
    allergens: ['dairy'],
    nutrients: {
      calories: "575 kcal",
      protein: "15g",
      carbs: "89g",
      fat: "17.5g",
      microNutrients: [
        { name: "Calcium", amount: "310mg", percentage: "24%" },
        { name: "Vitamin C", amount: "28mg", percentage: "31%" },
        { name: "Phosphorus", amount: "195mg", percentage: "16%" },
        { name: "Iron", amount: "2.3mg", percentage: "13%" },
        { name: "Vitamin A", amount: "145mcg", percentage: "16%" },
      ],
    },
  },
]
