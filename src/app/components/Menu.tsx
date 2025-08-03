"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Box, Modal } from "@mui/material";
import { useTheme } from "next-themes";
import CustomSelect from "@/app/components/CustomSelect";

// interface Nutrient {
//   name: string;
//   amount: string;
//   percentage?: string;
// }

// interface Dish {
//   id: number;

//   name: string;
//   description: string;
//   image: string;
//   isVeg: boolean;
//   dayOfWeek: number;
//   nutrients: {
//     calories: string;
//     protein: string;
//     carbs: string;
//     fat: string;
//     microNutrients: Nutrient[];
//   };
// }

// This would typically come from an API or database
const MENU_DATA = [
  // Week 1 Non-Veg
  {
    id: 1,
    name: "Chicken Afghani w/ Yellow Rice",
    week: "week1",
    description:
      "Tender, creamy grilled chicken marinated in rich spices, served with tangy yellow basmati rice.",
    // image: "/images/Week1/NonVeg/Chicken_Afghani_Yello_Rice.jpg",
    image: "https://iili.io/Fl2Sj8N.md.jpg",
    isVeg: false,
    dayOfWeek: 0, // Monday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Iron", amount: "3.5mg", percentage: "19%" },
        { name: "Calcium", amount: "120mg", percentage: "12%" },
        { name: "Vitamin A", amount: "280mcg", percentage: "31%" },
        { name: "Vitamin C", amount: "10mg", percentage: "11%" },
        { name: "Fiber", amount: "3g", percentage: "12%" },
      ],
    },
  },
  {
    id: 2,
    name: "Dormer's Chicken w/ Zeera Rice",
    week: "week1",
    description:
      "Juicy, spiced chicken with a signature marinade, paired perfectly with aromatic cumin-flavored basmati rice.",
    // image: "/images/Week1/NonVeg/Dormers_chicken_with zeera_rice.jpg",
    image: "https://iili.io/Fl2SOut.md.jpg",
    isVeg: false,
    dayOfWeek: 1, // Tuesday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Iron", amount: "3.2mg", percentage: "18%" },
        { name: "Fiber", amount: "6g", percentage: "24%" },
        { name: "Vitamin C", amount: "28mg", percentage: "31%" },
        { name: "Folate", amount: "165mcg", percentage: "41%" },
        { name: "Potassium", amount: "420mg", percentage: "9%" },
      ],
    },
  },
  {
    id: 3,
    name: "Peri-Peri Chicken w/ Jolof Rice",
    week: "week1",
    description:
      "Tangy Peri Peri chicken served alongside flavorful, spicy West African tomato-infused rice.",
    // image: "/images/Week1/NonVeg/Peri_peri_chicken.jpg",
    image: "https://iili.io/Fl2SDMb.md.jpg",
    isVeg: false,
    dayOfWeek: 2, // Wednesday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Vitamin D", amount: "8mcg", percentage: "40%" },
        { name: "Iron", amount: "2.8mg", percentage: "16%" },
        { name: "Zinc", amount: "3.2mg", percentage: "29%" },
        { name: "Selenium", amount: "28mcg", percentage: "51%" },
        { name: "Fiber", amount: "4g", percentage: "16%" },
      ],
    },
  },
  {
    id: 4,
    name: "Meatballs w/ Mashed Potatoes & Mushroom Sauce",
    week: "week1",
    description:
      "Tender meatballs smothered in a rich mushroom sauce, served with creamy mashed potatoes.",
    // image: "/images/Week1/NonVeg/Meatballs_Mashed_Potatoes_Mushroom_sauce.jpg",
    image: "https://iili.io/Fl2SLN9.md.jpg",
    isVeg: false,
    dayOfWeek: 3, // Thursday
    nutrients: {
      calories: "601.5 kcal",
      protein: "52.2g",
      carbs: "60g",
      fat: "15.7g",
      microNutrients: [
        { name: "Iron", amount: "4.5mg", percentage: "25%" },
        { name: "Fiber", amount: "12g", percentage: "48%" },
        { name: "Folate", amount: "180mcg", percentage: "45%" },
        { name: "Vitamin C", amount: "35mg", percentage: "39%" },
        { name: "Calcium", amount: "180mg", percentage: "18%" },
      ],
    },
  },
  {
    id: 5,
    name: "Chicken Fried Rice",
    week: "week1",
    description:
      "Stir-fried rice with tender chicken, fresh vegetables, and savory soy sauce, perfectly seasoned for a flavorful bite.",
    // image: "/images/Week1/NonVeg/Chicken_Fried_Rice.jpg",
    image: "https://iili.io/Fl2Sktn.md.jpg",
    isVeg: false,
    dayOfWeek: 4, // Friday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Vitamin K", amount: "75mcg", percentage: "63%" },
        { name: "Vitamin C", amount: "42mg", percentage: "47%" },
        { name: "Iron", amount: "3.8mg", percentage: "21%" },
        { name: "Calcium", amount: "200mg", percentage: "20%" },
        { name: "Fiber", amount: "8g", percentage: "32%" },
      ],
    },
  },
  {
    id: 6,
    name: "Chicken Biryani",
    week: "week1",
    description:
      "A fragrant and flavorful rice dish layered with tender, spiced chicken, aromatic basmati rice, and a blend of traditional spices.",
    // image: "/images/Week1/NonVeg/Chicken_Biryani_2.jpg",
    image: "https://iili.io/Fl2SN9I.md.jpg",
    isVeg: false,
    dayOfWeek: 5, // Saturday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Fiber", amount: "10g", percentage: "40%" },
        { name: "Vitamin E", amount: "8mg", percentage: "53%" },
        { name: "Magnesium", amount: "140mg", percentage: "33%" },
        { name: "Zinc", amount: "3mg", percentage: "27%" },
      ],
    },
  },

  // Week 1 Veg
  {
    id: 7,
    name: "Paneer Afghani w/ Yellow Rice",
    week: "week1",
    description:
      "Tender, creamy grilled Cottage cheese marinated in rich spices, served with fragrant cumin-infused basmati rice.",
    image: "/images/Week1/Veg/Paneer_Afghani_w__Yellow_rice.jpg",
    isVeg: true,
    dayOfWeek: 0, // Monday
    nutrients: {
      calories: "650 kcal",
      protein: "26g",
      carbs: "63.56g",
      fat: "31.41g",
      microNutrients: [
        { name: "Iron", amount: "3.5mg", percentage: "19%" },
        { name: "Calcium", amount: "280mg", percentage: "28%" },
        { name: "Vitamin A", amount: "380mcg", percentage: "42%" },
        { name: "Vitamin C", amount: "12mg", percentage: "13%" },
        { name: "Fiber", amount: "4g", percentage: "16%" },
      ],
    },
  },
  {
    id: 8,
    name: "Dormer's Paneer w/ Zeera Rice",
    week: "week1",
    description:
      "Juicy, spiced cottage cheese with a signature marinade, paired perfectly with aromatic cumin-flavored basmati rice.",
    image: "/images/Week1/Veg/Dormers_Paneer_Zeera_Rice.jpg",
    isVeg: true,
    dayOfWeek: 1, // Tuesday
    nutrients: {
      calories: "650 kcal",
      protein: "26g",
      carbs: "63.56g",
      fat: "31.41g",
      microNutrients: [
        { name: "Iron", amount: "3.2mg", percentage: "18%" },
        { name: "Calcium", amount: "300mg", percentage: "30%" },
        { name: "Vitamin C", amount: "28mg", percentage: "31%" },
        { name: "Folate", amount: "165mcg", percentage: "41%" },
        { name: "Fiber", amount: "6g", percentage: "24%" },
      ],
    },
  },
  {
    id: 9,
    name: "Jolof Rice w/ Grilled Veggies",
    week: "week1",
    description:
      "Perfectly char grilled Veggies served alongside flavorful, spicy West African tomato-infused rice.",
    image: "/images/Week1/Veg/Jolof_rice_grill_veggies_2.jpg",
    isVeg: true,
    dayOfWeek: 2, // Wednesday
    nutrients: {
      calories: "555 kcal",
      protein: "11.1g",
      carbs: "99g",
      fat: "11.2g",
      microNutrients: [
        { name: "Vitamin A", amount: "450mcg", percentage: "50%" },
        { name: "Vitamin C", amount: "45mg", percentage: "50%" },
        { name: "Iron", amount: "2.8mg", percentage: "16%" },
        { name: "Calcium", amount: "150mg", percentage: "15%" },
        { name: "Fiber", amount: "8g", percentage: "32%" },
      ],
    },
  },
  {
    id: 10,
    name: "Plantballs w/ Mashed Potatoes & Mushroom Sauce",
    week: "week1",
    description:
      "Tender plantballs smothered in a rich mushroom sauce, served with creamy mashed potatoes.",
    image: "/images/Week1/Veg/Veg_Kofta_Mashed_Potato_Mushroom_sauce.jpg",
    isVeg: true,
    dayOfWeek: 3, // Thursday
    nutrients: {
      calories: "429 kcal",
      protein: "8.7g",
      carbs: "75g",
      fat: "10.6g",
      microNutrients: [
        { name: "Iron", amount: "4.5mg", percentage: "25%" },
        { name: "Fiber", amount: "12g", percentage: "48%" },
        { name: "Folate", amount: "180mcg", percentage: "45%" },
        { name: "Vitamin C", amount: "35mg", percentage: "39%" },
        { name: "Calcium", amount: "180mg", percentage: "18%" },
      ],
    },
  },
  {
    id: 11,
    name: "Veg Fried Rice",
    week: "week1",
    description:
      "Stir-fried rice with tender, fresh vegetables and savory soy sauce, perfectly seasoned for a flavorful bite.",
    image: "/images/Week1/Veg/Veg_Fried_Rice.jpg",
    isVeg: true,
    dayOfWeek: 4, // Friday
    nutrients: {
      calories: "555 kcal",
      protein: "11.1g",
      carbs: "99g",
      fat: "11.2g",
      microNutrients: [
        { name: "Vitamin K", amount: "75mcg", percentage: "63%" },
        { name: "Vitamin C", amount: "42mg", percentage: "47%" },
        { name: "Iron", amount: "3.8mg", percentage: "21%" },
        { name: "Calcium", amount: "200mg", percentage: "20%" },
        { name: "Fiber", amount: "8g", percentage: "32%" },
      ],
    },
  },
  {
    id: 12,
    name: "Veg Soya Biryani w/ Raita",
    week: "week1",
    description:
      "A fragrant and flavorful rice dish layered with tender, spiced Veggies, aromatic basmati rice, and a blend of traditional spices.",
    image: "/images/Week1/Veg/Soya_Biryani_3.jpg",
    isVeg: true,
    dayOfWeek: 5, // Saturday
    nutrients: {
      calories: "650 kcal",
      protein: "56.11g",
      carbs: "86.99g",
      fat: "7.59g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Fiber", amount: "10g", percentage: "40%" },
        { name: "Vitamin E", amount: "8mg", percentage: "53%" },
        { name: "Magnesium", amount: "140mg", percentage: "33%" },
        { name: "Zinc", amount: "3mg", percentage: "27%" },
      ],
    },
  },

  // Week 2 Non-Veg
  {
    id: 13,
    name: "Lamb Stroganoff w/ Riz Pilaf",
    week: "week2",
    description:
      "Tender beef strips in a rich, creamy mushroom sauce, served alongside fragrant, buttery rice pilaf.",
    image: "/images/Week2/NonVeg/Lamb_Pilaf.jpg",
    isVeg: false,
    dayOfWeek: 0, // Monday
    nutrients: {
      calories: "855 kcal",
      protein: "47.1g",
      carbs: "84g",
      fat: "36.4g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Zinc", amount: "6.2mg", percentage: "56%" },
        { name: "Vitamin B12", amount: "3.2mcg", percentage: "133%" },
        { name: "Vitamin D", amount: "2.5mcg", percentage: "13%" },
        { name: "Calcium", amount: "120mg", percentage: "12%" },
      ],
    },
  },
  {
    id: 14,
    name: "Butter Chicken w/ Peas & Carrot Rice",
    week: "week2",
    description:
      "Juicy, marinated chicken simmered in a creamy, spiced tomato gravy, served with fluffy peas & carrots rice.",
    image: "/images/Week2/NonVeg/Butter chicken with peas and carrot rice.png",
    isVeg: false,
    dayOfWeek: 1, // Tuesday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Vitamin A", amount: "380mcg", percentage: "42%" },
        { name: "Vitamin C", amount: "12mg", percentage: "13%" },
        { name: "Calcium", amount: "120mg", percentage: "12%" },
        { name: "Fiber", amount: "4g", percentage: "16%" },
      ],
    },
  },
  {
    id: 15,
    name: "Lamb Pilaf w/ Salad",
    week: "week2",
    description:
      "Aromatic rice cooked with tender, spiced lamb, served with a refreshing side salad for a balanced meal.",
    image: "/images/Week2/NonVeg/Lamb_Pilaf.jpg",
    isVeg: false,
    dayOfWeek: 2, // Wednesday
    nutrients: {
      calories: "921 kcal",
      protein: "45.6g",
      carbs: "84g",
      fat: "42.4g",
      microNutrients: [
        { name: "Iron", amount: "5.2mg", percentage: "29%" },
        { name: "Zinc", amount: "7.5mg", percentage: "68%" },
        { name: "Vitamin B12", amount: "4.2mcg", percentage: "175%" },
        { name: "Selenium", amount: "45mcg", percentage: "82%" },
        { name: "Potassium", amount: "850mg", percentage: "18%" },
      ],
    },
  },
  {
    id: 16,
    name: "African Peanut Chicken Stew w/ Indian Bread",
    week: "week2",
    description:
      "Hearty, slow-cooked chicken stew in a rich Peanut sauce, served with indian flatbread.",
    image: "/images/Week2/NonVeg/African_Peanut_Chicken_Stew_2.jpg",
    isVeg: false,
    dayOfWeek: 3, // Thursday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Niacin", amount: "12mg", percentage: "75%" },
        { name: "Vitamin E", amount: "6mg", percentage: "40%" },
        { name: "Magnesium", amount: "120mg", percentage: "29%" },
        { name: "Phosphorus", amount: "400mg", percentage: "57%" },
      ],
    },
  },
  {
    id: 17,
    name: "African Coconut Rice w/ Fried Chicken",
    week: "week2",
    description:
      "Creamy, coconut-infused rice paired with crispy, golden fried chicken for a perfect blend of flavors.",
    image: "/images/Week2/NonVeg/African_coconut_rice_with_fried_chicken.jpg",
    isVeg: false,
    dayOfWeek: 4, // Friday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Iron", amount: "3.5mg", percentage: "19%" },
        { name: "Manganese", amount: "1.8mg", percentage: "78%" },
        { name: "Copper", amount: "0.4mg", percentage: "44%" },
        { name: "Selenium", amount: "28mcg", percentage: "51%" },
        { name: "Fiber", amount: "4g", percentage: "16%" },
      ],
    },
  },
  {
    id: 18,
    name: "Dormer's Kabab w/ Chutney & Arabic Bread",
    week: "week2",
    description:
      "Juicy, spiced kababs grilled to perfection, served with tangy chutney and warm, soft bread.",
    image: "/images/Week2/NonVeg/Dormer's_Kebab.jpg",
    isVeg: false,
    dayOfWeek: 5, // Saturday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Vitamin B6", amount: "0.8mg", percentage: "47%" },
        { name: "Niacin", amount: "10mg", percentage: "63%" },
        { name: "Zinc", amount: "6.2mg", percentage: "56%" },
        { name: "Selenium", amount: "35mcg", percentage: "64%" },
      ],
    },
  },

  // Week 2 Veg
  {
    id: 19,
    name: "Dal Nawabi w/ Zeera Rice",
    week: "week2",
    description:
      "Rich and creamy lentils cooked in aromatic spices, served with fragrant cumin-flavored basmati rice.",
    image: "/images/Week2/Veg/Dal_Nawabi_w__zeera_rice.jpg",
    isVeg: true,
    dayOfWeek: 0, // Monday
    nutrients: {
      calories: "654 kcal",
      protein: "21.6g",
      carbs: "114g",
      fat: "12.4g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Folate", amount: "220mcg", percentage: "55%" },
        { name: "Magnesium", amount: "120mg", percentage: "29%" },
        { name: "Potassium", amount: "800mg", percentage: "17%" },
        { name: "Fiber", amount: "16g", percentage: "64%" },
      ],
    },
  },
  {
    id: 20,
    name: "Butter Paneer w/ Carrot & Peas Rice",
    week: "week2",
    description:
      "Soft paneer cubes simmered in a rich, buttery tomato gravy, served with fragrant cumin-infused basmati rice.",
    image: "/images/Week2/Veg/Butter paneer.png",
    isVeg: true,
    dayOfWeek: 1, // Tuesday
    nutrients: {
      calories: "650 kcal",
      protein: "26g",
      carbs: "63.56g",
      fat: "31.41g",
      microNutrients: [
        { name: "Calcium", amount: "300mg", percentage: "30%" },
        { name: "Vitamin A", amount: "450mcg", percentage: "50%" },
        { name: "Vitamin K", amount: "45mcg", percentage: "38%" },
        { name: "Phosphorus", amount: "350mg", percentage: "50%" },
        { name: "Zinc", amount: "3.2mg", percentage: "29%" },
      ],
    },
  },
  {
    id: 21,
    name: "Rajma Chawal",
    week: "week2",
    description:
      "Hearty red kidney beans cooked in a spiced tomato gravy, served over a bed of steamed basmati rice.",
    image: "/images/Week2/Veg/Rajma_chawal.jpg",
    isVeg: true,
    dayOfWeek: 2, // Wednesday
    nutrients: {
      calories: "430.5 kcal",
      protein: "19.5g",
      carbs: "64.5g",
      fat: "11.35g",
      microNutrients: [
        { name: "Iron", amount: "4.8mg", percentage: "27%" },
        { name: "Folate", amount: "230mcg", percentage: "58%" },
        { name: "Magnesium", amount: "140mg", percentage: "33%" },
        { name: "Potassium", amount: "850mg", percentage: "18%" },
        { name: "Fiber", amount: "16g", percentage: "64%" },
      ],
    },
  },
  {
    id: 22,
    name: "Dum Aloo & Dal w/ Arabic Bread",
    week: "week2",
    description:
      "Slow-cooked baby potatoes in a spiced yogurt gravy, paired with flavorful lentils and soft, whole wheat flatbread.",
    image: "/images/Week2/Veg/Dum_aaloo_2.jpg",
    isVeg: true,
    dayOfWeek: 3, // Thursday
    nutrients: {
      calories: "414 kcal",
      protein: "19.5g",
      carbs: "60g",
      fat: "12.1g",
      microNutrients: [
        { name: "Vitamin C", amount: "35mg", percentage: "39%" },
        { name: "Potassium", amount: "900mg", percentage: "19%" },
        { name: "Vitamin B6", amount: "0.6mg", percentage: "35%" },
        { name: "Manganese", amount: "1.2mg", percentage: "52%" },
        { name: "Fiber", amount: "12g", percentage: "48%" },
      ],
    },
  },
  {
    id: 23,
    name: "Penne Pomodoro",
    week: "week2",
    description:
      "Classic Italian pasta tossed in a fresh, tangy tomato sauce with garlic, basil and olive oil.",
    image: "/images/Week2/Veg/penne pmodorp.png",
    isVeg: true,
    dayOfWeek: 4, // Friday
    nutrients: {
      calories: "315 kcal",
      protein: "9g",
      carbs: "45g",
      fat: "10.9g",
      microNutrients: [
        { name: "Vitamin C", amount: "42mg", percentage: "47%" },
        { name: "Lycopene", amount: "12mg", percentage: "N/A" },
        { name: "Vitamin K", amount: "15mcg", percentage: "13%" },
        { name: "Folate", amount: "80mcg", percentage: "20%" },
        { name: "Fiber", amount: "6g", percentage: "24%" },
      ],
    },
  },
  {
    id: 24,
    name: "Methi Matar Paneer w/ Arabic Bread",
    week: "week2",
    description:
      "A flavorful curry of tender paneer, fresh green peas and aromatic fenugreek leaves in a spiced, creamy gravy.",
    image: "/images/Week2/Veg/Methi_Matar_paneer.jpg",
    isVeg: true,
    dayOfWeek: 5, // Saturday
    nutrients: {
      calories: "637.5 kcal",
      protein: "33g",
      carbs: "31.8g",
      fat: "42.1g",
      microNutrients: [
        { name: "Vitamin A", amount: "450mcg", percentage: "50%" },
        { name: "Vitamin K", amount: "60mcg", percentage: "50%" },
        { name: "Calcium", amount: "350mg", percentage: "35%" },
        { name: "Iron", amount: "4.5mg", percentage: "25%" },
        { name: "Fiber", amount: "8g", percentage: "32%" },
      ],
    },
  },

  // Week 3 Non-Veg
  {
    id: 25,
    name: "Malai Tikka w/ Lemon Rice",
    week: "week3",
    description:
      "Creamy, tender chicken marinated in rich spices, paired with fragrant lemon-infused rice.",
    image: "/images/Week3/NonVeg/Malai_tikka_Lemon_Rice.jpg",
    isVeg: false,
    dayOfWeek: 0, // Monday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Calcium", amount: "180mg", percentage: "18%" },
        { name: "Vitamin D", amount: "2.5mcg", percentage: "13%" },
        { name: "Vitamin B12", amount: "3.2mcg", percentage: "133%" },
        { name: "Phosphorus", amount: "400mg", percentage: "57%" },
        { name: "Selenium", amount: "35mcg", percentage: "64%" },
      ],
    },
  },
  {
    id: 26,
    name: "Aloo Kheema w/ Arabic Bread",
    week: "week3",
    description:
      "Spiced minced meat cooked with potatoes, served with soft, flaky paratha.",
    image: "/images/Week3/NonVeg/Aaloo_keema.jpg",
    isVeg: false,
    dayOfWeek: 1, // Tuesday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Iron", amount: "5.2mg", percentage: "29%" },
        { name: "Zinc", amount: "7.5mg", percentage: "68%" },
        { name: "Vitamin B6", amount: "0.8mg", percentage: "47%" },
        { name: "Potassium", amount: "850mg", percentage: "18%" },
        { name: "Fiber", amount: "6g", percentage: "24%" },
      ],
    },
  },
  {
    id: 27,
    name: "Chicken Fricassee w/ Mashed Potato",
    week: "week3",
    description:
      "A hearty, flavorful chicken stew slow-cooked with spices, served over steamed rice.",
    image: "/images/Week3/NonVeg/Chicken_fricasse-W_mashed_Potato_1.jpg",
    isVeg: false,
    dayOfWeek: 2, // Wednesday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Vitamin A", amount: "380mcg", percentage: "42%" },
        { name: "Vitamin C", amount: "12mg", percentage: "13%" },
        { name: "Calcium", amount: "120mg", percentage: "12%" },
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Fiber", amount: "4g", percentage: "16%" },
      ],
    },
  },
  {
    id: 28,
    name: "Chicken Shawarma Bowl",
    week: "week3",
    description:
      "Succulent, spiced chicken served over a bed of rice with fresh veggies, drizzled with tangy garlic sauce.",
    image: "/images/Week3/NonVeg/Chicken_shawarma_Bowl_2.jpg",
    isVeg: false,
    dayOfWeek: 3, // Thursday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Vitamin C", amount: "45mg", percentage: "50%" },
        { name: "Vitamin K", amount: "75mcg", percentage: "63%" },
        { name: "Folate", amount: "165mcg", percentage: "41%" },
        { name: "Magnesium", amount: "120mg", percentage: "29%" },
        { name: "Zinc", amount: "3.2mg", percentage: "29%" },
      ],
    },
  },
  {
    id: 29,
    name: "Moroccan Chicken Tagine w/ Couscous",
    week: "week3",
    description:
      "Aromatic chicken slow-cooked with spices and vegetables, served with fluffy couscous.",
    image: "/images/Week3/NonVeg/Morrocan chicken.png",
    isVeg: false,
    dayOfWeek: 4, // Friday
    nutrients: {
      calories: "673.5 kcal",
      protein: "57.9g",
      carbs: "69g",
      fat: "16g",
      microNutrients: [
        { name: "Iron", amount: "4.8mg", percentage: "27%" },
        { name: "Vitamin A", amount: "450mcg", percentage: "50%" },
        { name: "Vitamin E", amount: "6mg", percentage: "40%" },
        { name: "Magnesium", amount: "140mg", percentage: "33%" },
        { name: "Fiber", amount: "8g", percentage: "32%" },
      ],
    },
  },
  {
    id: 30,
    name: "Chicken Biryani",
    week: "week3",
    description:
      "Fragrant basmati rice layered with spiced, tender chicken, cooked to perfection with traditional biryani spices.",
    image: "/images/Week3/NonVeg/Chicken_Biryani_2.jpg",
    isVeg: false,
    dayOfWeek: 5, // Saturday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Iron", amount: "5.2mg", percentage: "29%" },
        { name: "Zinc", amount: "7.5mg", percentage: "68%" },
        { name: "Vitamin B12", amount: "4.2mcg", percentage: "175%" },
        { name: "Selenium", amount: "45mcg", percentage: "82%" },
        { name: "Potassium", amount: "850mg", percentage: "18%" },
      ],
    },
  },

  // Week 3 Veg
  {
    id: 31,
    name: "Paneer Lababdar w/ Lemon Rice",
    week: "week3",
    description:
      "Rich, creamy paneer curry simmered in a spiced tomato gravy, paired with fragrant lemon-infused rice.",
    image: "/images/Week3/Veg/Paneer_lababdaar_W_Lemon_rice.jpg",
    isVeg: true,
    dayOfWeek: 0, // Monday
    nutrients: {
      calories: "650 kcal",
      protein: "26g",
      carbs: "63.56g",
      fat: "31.41g",
      microNutrients: [
        { name: "Calcium", amount: "300mg", percentage: "30%" },
        { name: "Vitamin A", amount: "450mcg", percentage: "50%" },
        { name: "Vitamin K", amount: "45mcg", percentage: "38%" },
        { name: "Phosphorus", amount: "350mg", percentage: "50%" },
        { name: "Zinc", amount: "3.2mg", percentage: "29%" },
      ],
    },
  },
  {
    id: 32,
    name: "Paneer Tikka w/ Arabic Bread",
    week: "week3",
    description:
      "Grilled paneer tikka marinated in spices, served with flavorful lentils and soft, whole wheat roti.",
    image: "/images/Week3/Veg/Paneer_tikka_W_Lemon_rice.jpg",
    isVeg: true,
    dayOfWeek: 1, // Tuesday
    nutrients: {
      calories: "637.5 kcal",
      protein: "33g",
      carbs: "31.8g",
      fat: "42.1g",
      microNutrients: [
        { name: "Calcium", amount: "350mg", percentage: "35%" },
        { name: "Vitamin A", amount: "280mcg", percentage: "31%" },
        { name: "Iron", amount: "3.5mg", percentage: "19%" },
        { name: "Vitamin B12", amount: "1.2mcg", percentage: "50%" },
        { name: "Fiber", amount: "6g", percentage: "24%" },
      ],
    },
  },
  {
    id: 33,
    name: "Mashed Potatoes w/ Tangy Beans",
    week: "week3",
    description:
      "Creamy mashed potatoes paired with rich, tangy baked beans for a hearty, comforting meal.",
    image: "/images/Week3/Veg/Mashed_potatoes_w_tangy_beans.jpg",
    isVeg: true,
    dayOfWeek: 2, // Wednesday
    nutrients: {
      calories: "429 kcal",
      protein: "8.7g",
      carbs: "75g",
      fat: "10.6g",
      microNutrients: [
        { name: "Vitamin C", amount: "35mg", percentage: "39%" },
        { name: "Potassium", amount: "900mg", percentage: "19%" },
        { name: "Vitamin B6", amount: "0.6mg", percentage: "35%" },
        { name: "Manganese", amount: "1.2mg", percentage: "52%" },
        { name: "Fiber", amount: "12g", percentage: "48%" },
      ],
    },
  },
  {
    id: 34,
    name: "Kadhai Paneer with Rice",
    week: "week3",
    description:
      "Stir-fried paneer and bell peppers cooked in a flavorful, spiced gravy, served with steamed rice.",
    image: "/images/Week3/Veg/Kadhai_Paneer_w_Rice.jpg",
    isVeg: true,
    dayOfWeek: 3, // Thursday
    nutrients: {
      calories: "650 kcal",
      protein: "26g",
      carbs: "63.56g",
      fat: "31.41g",
      microNutrients: [
        { name: "Vitamin C", amount: "120mg", percentage: "133%" },
        { name: "Vitamin A", amount: "450mcg", percentage: "50%" },
        { name: "Calcium", amount: "300mg", percentage: "30%" },
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Fiber", amount: "8g", percentage: "32%" },
      ],
    },
  },
  {
    id: 35,
    name: "Rajma Aloo w/ Tandoori Roti",
    week: "week3",
    description:
      "Hearty red kidney beans and potatoes cooked in a spiced tomato gravy, served with soft roti.",
    image: "/images/Week3/Veg/Rajma_aaloo.jpg",
    isVeg: true,
    dayOfWeek: 4, // Friday
    nutrients: {
      calories: "430.5 kcal",
      protein: "19.5g",
      carbs: "64.5g",
      fat: "11.35g",
      microNutrients: [
        { name: "Iron", amount: "4.8mg", percentage: "27%" },
        { name: "Folate", amount: "230mcg", percentage: "58%" },
        { name: "Magnesium", amount: "140mg", percentage: "33%" },
        { name: "Potassium", amount: "850mg", percentage: "18%" },
        { name: "Fiber", amount: "16g", percentage: "64%" },
      ],
    },
  },
  {
    id: 36,
    name: "Veg Soya Biryani w/ Raita",
    week: "week3",
    description:
      "Fragrant basmati rice cooked with mixed vegetables and aromatic spices, served with cooling yogurt raita.",
    image: "/images/Week3/Veg/Soya_Biryani_3.jpg",
    isVeg: true,
    dayOfWeek: 5, // Saturday
    nutrients: {
      calories: "650 kcal",
      protein: "56.11g",
      carbs: "86.99g",
      fat: "7.59g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Fiber", amount: "10g", percentage: "40%" },
        { name: "Vitamin E", amount: "8mg", percentage: "53%" },
        { name: "Magnesium", amount: "140mg", percentage: "33%" },
        { name: "Zinc", amount: "3mg", percentage: "27%" },
      ],
    },
  },

  // Week 4 Non-Veg
  {
    id: 37,
    name: "Thai Chicken Curry w/ Coconut Rice",
    week: "week4",
    description:
      "Tangy asian curry slow-cooked with tender chicken, served with flaky coconut rice for a rich and hearty food bowl.",
    image: "/images/Week4/NonVeg/Thai_chicken_curry_w_cocnut_rice.jpg",
    isVeg: false,
    dayOfWeek: 0, // Monday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Vitamin C", amount: "45mg", percentage: "50%" },
        { name: "Vitamin A", amount: "450mcg", percentage: "50%" },
        { name: "Iron", amount: "3.5mg", percentage: "19%" },
        { name: "Calcium", amount: "120mg", percentage: "12%" },
        { name: "Fiber", amount: "6g", percentage: "24%" },
      ],
    },
  },
  {
    id: 38,
    name: "Dormer's Style Halal Guys Bowl",
    week: "week4",
    description:
      "Juicy grilled chicken served with rice, lettuce, and Dormer's signature white sauce and hot sauce.",
    image: "/images/Week4/NonVeg/Dormers_Halal_guys_Bowl_correct3.jpg",
    isVeg: false,
    dayOfWeek: 1, // Tuesday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Vitamin K", amount: "75mcg", percentage: "63%" },
        { name: "Vitamin C", amount: "28mg", percentage: "31%" },
        { name: "Folate", amount: "165mcg", percentage: "41%" },
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Fiber", amount: "8g", percentage: "32%" },
      ],
    },
  },
  {
    id: 39,
    name: "Chicken Khorma w/ Bagara Rice",
    week: "week4",
    description:
      "Fragrant, spiced chicken cooked in a rich, creamy gravy, served with flavorful bagara rice.",
    image: "/images/Week4/NonVeg/chicken_Korma_bagara_rice.jpg",
    isVeg: false,
    dayOfWeek: 2, // Wednesday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Zinc", amount: "6.2mg", percentage: "56%" },
        { name: "Vitamin B12", amount: "3.2mcg", percentage: "133%" },
        { name: "Vitamin D", amount: "2.5mcg", percentage: "13%" },
        { name: "Calcium", amount: "120mg", percentage: "12%" },
      ],
    },
  },
  {
    id: 40,
    name: "Mexican Beef Burrito Bowl",
    week: "week4",
    description:
      "A Mexican Beef Burrito Bowl combines spiced beef, rice, beans and fresh toppings for a flavorful, customizable meal.",
    image: "/images/Week4/NonVeg/Mexican_Burrito-Bowl.jpg",
    isVeg: false,
    dayOfWeek: 3, // Thursday
    nutrients: {
      calories: "855 kcal",
      protein: "47.1g",
      carbs: "84g",
      fat: "36.4g",
      microNutrients: [
        { name: "Iron", amount: "5.2mg", percentage: "29%" },
        { name: "Fiber", amount: "16g", percentage: "64%" },
        { name: "Vitamin C", amount: "45mg", percentage: "50%" },
        { name: "Folate", amount: "220mcg", percentage: "55%" },
        { name: "Magnesium", amount: "140mg", percentage: "33%" },
      ],
    },
  },
  {
    id: 41,
    name: "Veg Biryani w/ Dormer's Chicken",
    week: "week4",
    description:
      "Aromatic vegetable biryani paired with Dormer's tender, spiced grilled chicken.",
    image: "/images/Week4/NonVeg/Dormer_Chicken_Veg_Biryani.jpg",
    isVeg: false,
    dayOfWeek: 4, // Friday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Vitamin A", amount: "380mcg", percentage: "42%" },
        { name: "Vitamin C", amount: "12mg", percentage: "13%" },
        { name: "Calcium", amount: "120mg", percentage: "12%" },
        { name: "Fiber", amount: "8g", percentage: "32%" },
      ],
    },
  },
  {
    id: 42,
    name: "Spaghetti Bolognese w/ Marinara Sauce",
    week: "week4",
    description:
      "Classic spaghetti tossed in a rich, savory marinara sauce, topped with hearty Bolognese meat sauce.",
    image: "/images/Week4/NonVeg/spaghetti_bolognese_2.jpg",
    isVeg: false,
    dayOfWeek: 5, // Saturday
    nutrients: {
      calories: "727.5 kcal",
      protein: "54.6g",
      carbs: "84g",
      fat: "16.3g",
      microNutrients: [
        { name: "Lycopene", amount: "15mg", percentage: "N/A" },
        { name: "Vitamin C", amount: "28mg", percentage: "31%" },
        { name: "Iron", amount: "4.8mg", percentage: "27%" },
        { name: "Folate", amount: "120mcg", percentage: "30%" },
        { name: "Fiber", amount: "8g", percentage: "32%" },
      ],
    },
  },

  // Week 4 Veg
  {
    id: 43,
    name: "Pav Bhaji",
    week: "week4",
    description:
      "A spicy, mashed vegetable curry served with buttered, soft buns for a comforting street food experience.",
    image: "/images/Week4/Veg/Pav_Bhaji.jpg",
    isVeg: true,
    dayOfWeek: 0, // Monday
    nutrients: {
      calories: "315 kcal",
      protein: "9g",
      carbs: "45g",
      fat: "10.9g",
      microNutrients: [
        { name: "Vitamin C", amount: "42mg", percentage: "47%" },
        { name: "Vitamin A", amount: "450mcg", percentage: "50%" },
        { name: "Iron", amount: "3.5mg", percentage: "19%" },
        { name: "Calcium", amount: "120mg", percentage: "12%" },
        { name: "Fiber", amount: "8g", percentage: "32%" },
      ],
    },
  },
  {
    id: 44,
    name: "Soya Chunk Masala w/ Orange Rice",
    week: "week4",
    description:
      "Protein-rich Soya chunks in a spiced masala gravy, paired with fragrant orange rice for a wholesome and flavorful meal.",
    image: "/images/Week4/Veg/Soya_chunk_masala_w_orange_rice_1.jpg",
    isVeg: true,
    dayOfWeek: 1, // Tuesday
    nutrients: {
      calories: "650 kcal",
      protein: "56.11g",
      carbs: "86.99g",
      fat: "7.59g",
      microNutrients: [
        { name: "Iron", amount: "4.8mg", percentage: "27%" },
        { name: "Fiber", amount: "12g", percentage: "48%" },
        { name: "Folate", amount: "220mcg", percentage: "55%" },
        { name: "Magnesium", amount: "140mg", percentage: "33%" },
        { name: "Zinc", amount: "4.2mg", percentage: "38%" },
      ],
    },
  },
  {
    id: 45,
    name: "Veg Aloo Khorma w/ Bagara Rice",
    week: "week4",
    description:
      "A rich, spiced curry of potatoes and vegetables, served with flavorful bagara rice.",
    image: "/images/Week4/Veg/Veg_aaloo_korma_bagara_Rice.jpg",
    isVeg: true,
    dayOfWeek: 2, // Wednesday
    nutrients: {
      calories: "555 kcal",
      protein: "11.1g",
      carbs: "99g",
      fat: "11.2g",
      microNutrients: [
        { name: "Vitamin C", amount: "45mg", percentage: "50%" },
        { name: "Potassium", amount: "900mg", percentage: "19%" },
        { name: "Vitamin B6", amount: "0.6mg", percentage: "35%" },
        { name: "Manganese", amount: "1.2mg", percentage: "52%" },
        { name: "Fiber", amount: "12g", percentage: "48%" },
      ],
    },
  },
  {
    id: 46,
    name: "Baigan Ka Bhatta w/ Roti",
    week: "week4",
    description:
      "Smoky, mashed roasted eggplant cooked with spices and tomatoes, served with soft roti.",
    image: "/images/Week4/Veg/spaghetti_bolognese_2.jpg",
    isVeg: true,
    dayOfWeek: 3, // Thursday
    nutrients: {
      calories: "315 kcal",
      protein: "9g",
      carbs: "45g",
      fat: "10.9g",
      microNutrients: [
        { name: "Vitamin K", amount: "15mcg", percentage: "13%" },
        { name: "Folate", amount: "80mcg", percentage: "20%" },
        { name: "Iron", amount: "3.2mg", percentage: "18%" },
        { name: "Magnesium", amount: "80mg", percentage: "19%" },
        { name: "Fiber", amount: "8g", percentage: "32%" },
      ],
    },
  },
  {
    id: 47,
    name: "Veg Biryani w/ Dormer's Paneer",
    week: "week4",
    description:
      "Aromatic basmati rice cooked with mixed vegetables, served with tangy, Dormer's paneer curry.",
    image: "/images/Week4/Veg/Dormers_Paneer_veg_Biryani.jpg",
    isVeg: true,
    dayOfWeek: 4, // Friday
    nutrients: {
      calories: "650 kcal",
      protein: "26g",
      carbs: "63.56g",
      fat: "31.41g",
      microNutrients: [
        { name: "Iron", amount: "4.2mg", percentage: "23%" },
        { name: "Calcium", amount: "300mg", percentage: "30%" },
        { name: "Vitamin A", amount: "450mcg", percentage: "50%" },
        { name: "Fiber", amount: "8g", percentage: "32%" },
        { name: "Folate", amount: "220mcg", percentage: "55%" },
      ],
    },
  },
  {
    id: 48,
    name: "Spaghetti Pomodoro",
    week: "week4",
    description:
      "Classic Italian spaghetti tossed in a fresh tomato sauce, topped with tender grilled paneer.",
    image: "/images/Week4/Veg/spaghetti_bolognese_3.jpg",
    isVeg: true,
    dayOfWeek: 5, // Saturday
    nutrients: {
      calories: "315 kcal",
      protein: "9g",
      carbs: "45g",
      fat: "10.9g",
      microNutrients: [
        { name: "Vitamin C", amount: "42mg", percentage: "47%" },
        { name: "Lycopene", amount: "12mg", percentage: "N/A" },
        { name: "Vitamin K", amount: "15mcg", percentage: "13%" },
        { name: "Folate", amount: "80mcg", percentage: "20%" },
        { name: "Fiber", amount: "6g", percentage: "24%" },
      ],
    },
  },
];

export default function Menu() {
  const { theme } = useTheme();
  const [isVegOnly, setIsVegOnly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(() => {
    const day = new Date().getDay();
    return day === 0 ? null : day - 1;
  });
  const [, setShowNutritionHint] = useState(false);
  // const [isFlipped, setIsFlipped] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState("week1");

  // Filter dishes based on veg/non-veg selection
  // const availableDishes = MENU_DATA.filter((dish) => dish.isVeg === isVegOnly);

  // // Get current dish based on selected day
  // const currentDish =
  //   selectedDay !== null
  //     ? availableDishes.find((dish) => dish.dayOfWeek === selectedDay)
  //     : null;
  const availableDishes = MENU_DATA.filter(
    (dish) => dish.isVeg === isVegOnly && dish.week === selectedWeek
  );

  const currentDish =
    selectedDay !== null
      ? availableDishes.find((dish) => dish.dayOfWeek === selectedDay)
      : null;
  // Show nutrition hint when day is selected
  useEffect(() => {
    if (selectedDay !== null) {
      setShowNutritionHint(true);
      const timer = setTimeout(() => setShowNutritionHint(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [selectedDay]);

  // Reset flip state when changing days or diet type
  // useEffect(() => {
  //   setIsFlipped(false);
  // }, [selectedDay, isVegOnly]);

  const [isFlipped, setIsFlipped] = useState(false);
  // const modalRef = useRef(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Use a type guard to ensure modalRef.current is not null
      if (
        isFlipped &&
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        setIsFlipped(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isFlipped]);
  const style = {
    position: "absolute" as const,
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  };

  return (
    <>
      <div
        className={`relative w-full py-[24px] lg:py-[40px]  ${
          theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"
        } overflow-hidden`}
      >
        <div className="container mx-auto px-4">
          {/* Menu Header */}
          <div className="mb-5 mt-0 flex items-center justify-between lg:max-w-[987px] mx-auto">
            <h2
              className={` text-[32px] font-medium lg:hidden block  ${
                theme === "light" ? "text-[#1E3A4F]" : "text-white"
              }`}
              style={{
                fontFamily: "Montserrat",
                fontWeight: 500,
                lineHeight: "100%",
                letterSpacing: "0%",
                fontSize: "18px",
              }}
            >
              MENU
            </h2>
            <h2
              className={`menu-heading_icon lg:block hidden  ${
                theme === "light" ? "!text-[#1E3A4F]" : "!text-white"
              }`}
            >
              MENU
            </h2>
            <button
              onClick={() => {
                setIsVegOnly((v) => !v);
                const jsDay = new Date().getDay();
                setSelectedDay(jsDay === 0 ? null : jsDay - 1);
              }}
              className={`relative w-15 h-7 rounded-full flex items-center bg-transparent transition-colors duration-300 px-1 border-2  lg:hidden 
    ${theme === "light" ? "border-[#1E3A4F]" : "border-white"}`}
              aria-label="Toggle veg/non-veg"
            >
              <span className="sr-only">Toggle veg/non-veg</span>

              {/* Toggle knob */}
              <div
                className={`absolute top-0.5 left-0.5 h-5 w-6 rounded-full  shadow-md flex items-center justify-center transition-transform duration-300
      ${isVegOnly ? "translate-x-7" : "translate-x-0"}
       ${theme === "light" ? "bg-[#1E3A4F]" : "bg-[#FAF6EB] "}
    `}
              >
                <span className="text-[16px]">
                  {isVegOnly ? (
                    <img
                      src="/images/VegIcon.svg"
                      className="w-[16px]"
                      alt=""
                    />
                  ) : (
                    <img src="/images/NonVeg.svg" className="w-[16px]" alt="" />
                  )}
                </span>
              </div>
            </button>

            <button
              onClick={() => {
                setIsVegOnly((v) => !v);
                const jsDay = new Date().getDay();
                setSelectedDay(jsDay === 0 ? null : jsDay - 1);
              }}
              className={`relative rounded-full hidden items-center bg-transparent transition-colors duration-300 px-1 border-2 
    lg:flex lg:h-[43px] lg:w-[90px]
    ${theme === "light" ? "border-[#1E3A4F]" : "border-white"}`}
              aria-label="Toggle veg/non-veg"
            >
              {/* Toggle knob */}
              <div
                className={`absolute top-[4px] left-[4px] h-8 w-8 rounded-full shadow-md flex items-center justify-center transition-transform duration-300
      ${isVegOnly ? "translate-x-[45px]" : "translate-x-0"}
      ${theme === "light" ? "bg-[#1E3A4F]" : "bg-[#FAF6EB]"}`}
              >
                <img
                  src={isVegOnly ? "/images/VegIcon.svg" : "/images/NonVeg.svg"}
                  className="w-[20px] h-[20px]"
                  alt=""
                />
              </div>
            </button>
          </div>

          {/* Menu Card */}
          <div className="lg:max-w-[987px] mx-auto">
            <div
              className={`bg-[#1E3A4F] perspective-1000 ${
                theme === "light"
                  ? "MenuCardBoxConatinerlight"
                  : "MenuCardBoxConatiner"
              }`}
            >
              {currentDish ? (
                <div
                  className={`relative w-full min-h-[180px] md:min-h-[260px] transition-transform duration-500 preserve-3d ${
                    isFlipped ? "" : ""
                  }`}
                >
                  {/* Front of Card */}
                  <div>
                    <div className="flex justify-between">
                      <div className="flex justify-center gap-1 mb-3 lg:gap-[23px] ">
                        {[
                          // { day: "S", index: 0 },
                          { day: "M", index: 0 },
                          { day: "T", index: 1 },
                          { day: "W", index: 2 },
                          { day: "T", index: 3 },
                          { day: "F", index: 4 },
                          { day: "S", index: 5 },
                        ].map((item) => (
                          <button
                            key={item.index}
                            onClick={() => setSelectedDay(item.index)}
                            className={`w-5 h-5 rounded-full border flex items-center justify-center text-[7px] font-bold transition-colors lg:w-[33px] lg:h-[33px] lg:text-[14px] ${
                              selectedDay === item.index
                                ? "bg-white text-[#1E3A4F] border-white"
                                : "bg-transparent text-white border-white hover:bg-white/20"
                            }`}
                            style={{
                              fontFamily: "Montserrat",
                              lineHeight: "100%",
                            }}
                          >
                            {item.day}
                          </button>
                        ))}
                      </div>
                      <div className="select-wrapper relative md:hidden block">
                        <select
                          className="custom-select"
                          onChange={(e) => setSelectedWeek(e.target.value)}
                        >
                          <option value="week1">Week One</option>
                          <option value="week2">Week Two</option>
                          <option value="week3">Week Three</option>
                          <option value="week4">Week Four</option>
                        </select>
                        <span>
                          <svg
                            className={`absolute top-[7px] right-[8px] w-4 h-4 text-[#1e3a4f] transform transition-transform`}
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
                        </span>
                      </div>
                      <div className="md:block hidden">
                        {" "}
                        <CustomSelect
                          setSelectedWeek={setSelectedWeek}
                          selectedWeek={selectedWeek}
                        />
                      </div>
                    </div>
                    <div className="flex gap-3 lg:gap-[30px] lg:mt-[12px]">
                      {/* Dish Image */}
                      <div className="relative w-35 h-[147px] rounded-2xl overflow-hidden bg-[#EEE9DA] lg:h-[300px] lg:w-[336px] md:rounded-[33px]">
                        <Image
                          src={currentDish.image}
                          alt={currentDish.name}
                          fill
                          className="object-cover rounded-2xl"
                        />
                      </div>
                      <div className="flex-1 flex flex-col  min-w-0 overflow-visible">
                        <h3
                          className="text-white text-base font-bold uppercase mb-1 break-words lg:hidden block"
                          style={{
                            fontFamily: "Montserrat",
                            fontWeight: 700,
                            lineHeight: "130%",
                            fontSize: "13px",
                          }}
                        >
                          {currentDish.name}
                        </h3>
                        <p
                          className="text-white text-xs mb-2 mt-2 lg:hidden block"
                          style={{
                            fontFamily: "Poppins",
                            fontWeight: 300,
                            fontSize: "12px",
                            lineHeight: "130%",
                          }}
                        >
                          {currentDish.description}
                        </p>
                        <div className="flex flex-col h-full justify-between">
                          <div>
                            <h3 className="currentdish_name_title lg:block hidden">
                              {currentDish.name}
                            </h3>

                            <p className="currentDish_paramenu text-xs mb-2 mt-2 lg:block hidden">
                              {currentDish.description}
                            </p>
                          </div>

                          <button
                            onClick={() => setIsFlipped(true)}
                            className={`flex items-center gap-1 text-white/80 text-xs transition-opacity lg:mb-[8px] ${
                              isFlipped ? "animate-pulse" : ""
                            }`}
                          >
                            <span className="mt-1 buttonNutrition_info">
                              Nutrition Info
                            </span>
                            <svg
                              className={`w-3 h-3 mt-1 transform transition-transform lg:h-[32px] lg:w-[26px] ${
                                isFlipped ? "animate-bounce" : ""
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
                  </div>

                  {/* Back of Card - Nutrition Info */}
                  <Modal
                    open={isFlipped}
                    onClose={() => setIsFlipped(false)}
                    aria-labelledby="modal-modal-title"
                    aria-describedby="modal-modal-description"
                  >
                    <Box sx={style}>
                      <div className="flex items-center justify-center">
                        <div className="bg-[#1E3A4F] rounded-3xl p-8 border-2 border-white md:max-w-[420px] lg:max-w-[700px] lg:w-[700px]  max-h-[90vh] overflow-y-auto w-[358px]">
                          {/* Modal Header */}
                          <div className="flex justify-between items-start mb-6">
                            <h3
                              className="text-white text-2xl font-bold"
                              style={{
                                fontFamily: "Montserrat, sans-serif",
                                fontWeight: 700,
                                lineHeight: "100%",
                                letterSpacing: "0",
                                fontSize: "18px",
                              }}
                            >
                              Nutrition Facts
                            </h3>
                            <button
                              onClick={() => setIsFlipped(false)}
                              className="text-white/80 hover:text-white transition-colors"
                            >
                              <svg
                                className="w-6 h-6"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  d="M6 18L18 6M6 6l12 12"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </div>

                          {/* Nutrient Info */}
                          <div className="grid md:grid-cols-2 gap-6">
                            {/* Main Nutrients */}
                            <div className="space-y-3">
                              <h4 className="text-white text-lg font-semibold mb-3">
                                Main Nutrients
                              </h4>
                              <div className="space-y-2 text-sm">
                                <NutrientRow
                                  label="Calories"
                                  value={currentDish.nutrients.calories}
                                />
                                <NutrientRow
                                  label="Protein"
                                  value={currentDish.nutrients.protein}
                                />
                                <NutrientRow
                                  label="Carbs"
                                  value={currentDish.nutrients.carbs}
                                />
                                <NutrientRow
                                  label="Fat"
                                  value={currentDish.nutrients.fat}
                                />
                              </div>
                            </div>

                            {/* Micronutrients */}
                            <div className="space-y-3">
                              <h4 className="text-white text-lg font-semibold mb-3">
                                Micronutrients
                              </h4>
                              <div className="space-y-2 text-sm">
                                {currentDish.nutrients.microNutrients.map(
                                  (nutrient, index) => (
                                    <div
                                      key={index}
                                      className="flex justify-between items-center py-2 border-b border-white/20"
                                    >
                                      <span className="text-white/90">
                                        {nutrient.name}
                                      </span>
                                      <div className="text-right">
                                        <span className="text-white font-medium">
                                          {nutrient.amount}
                                        </span>
                                        <span className="text-white/60 ml-2">
                                          ({nutrient.percentage})
                                        </span>
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Box>
                  </Modal>
                </div>
              ) : (
                // <div className="flex flex-col md:flex-row gap-8 min-h-[350px]">
                //   <div className="relative h-[280px] rounded-3xl overflow-hidden bg-[#EEE9DA]/10 flex items-center justify-center w-full md:w-[280px]">
                //     <p className="text-white/60 text-center px-4">
                //       Select a day to view the menu
                //     </p>
                //   </div>
                //   <div className="flex-grow flex items-center justify-center">
                //     <p className="text-white/60 text-center">
                //       Select a day to view the menu details
                //     </p>
                //   </div>
                // </div>
                <div className="flex flex-col md:flex-row gap-8 min-h-[350px]">
                  <div className="relative h-[280px] md:h-[330px] rounded-3xl overflow-hidden bg-[#EEE9DA]/10 flex items-center justify-center w-full md:w-[280px]">
                    <p className="text-white/60 text-center px-4">
                      Menu service is closed on Sundays.
                    </p>
                  </div>
                  <div className="flex-grow flex items-center justify-center">
                    <p className="text-white/60 text-center">
                      Please check back tomorrow. We serve menus from Monday to
                      Saturday.
                    </p>
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
    </>
  );
}
function NutrientRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-white/20">
      <span className="text-white/90">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}
