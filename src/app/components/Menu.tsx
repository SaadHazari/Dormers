"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Box, Modal } from "@mui/material";
import { useTheme } from "next-themes";
import CustomSelect from "@/app/components/CustomSelect";
import ChickenAfghani from '../../../public/images/Week1/nonveg1/chickenAfghan.png';
import DormersChicken from '../../../public/images/Week1/nonveg1/DormersChicken.png';
import PeriPeri from '../../../public/images/Week1/nonveg1/PeriPeri.png';
import Meatballs from '../../../public/images/Week1/nonveg1/MeatballsMashe.png';
import ChickenFried from '../../../public/images/Week1/nonveg1/ChickenFried.png';
import ChickenBiryani from '../../../public/images/Week1/nonveg1/ChickenBiryani.png';

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
  // --- WEEK 1 NON-VEG ---
  {
    id: 1, name: "Chicken Afghani w/ Yellow Rice", week: "week1", isVeg: false, dayOfWeek: 0,
    description: "Tender, creamy grilled chicken marinated in rich spices, served with tangy yellow basmati rice.",
    image: ChickenAfghani,
    nutrients: { calories: "640 kcal", protein: "42g", carbs: "75g", fat: "18g", microNutrients: [{ name: "Iron", amount: "3.5mg", percentage: "19%" }, { name: "Calcium", amount: "120mg", percentage: "12%" }, { name: "Vitamin A", amount: "280mcg", percentage: "31%" }] }
  },
  {
    id: 2, name: "Dormer's Chicken w/ Zeera Rice", week: "week1", isVeg: false, dayOfWeek: 1,
    description: "Juicy, spiced chicken with a signature marinade, paired perfectly with aromatic cumin-flavored basmati rice.",
    image: DormersChicken,
    nutrients: { calories: "610 kcal", protein: "45g", carbs: "78g", fat: "14g", microNutrients: [{ name: "Iron", amount: "3.2mg", percentage: "18%" }, { name: "Fiber", amount: "6g", percentage: "24%" }, { name: "Vitamin C", amount: "28mg", percentage: "31%" }] }
  },
  {
    id: 3, name: "Chicken Wanazi w/ Oven Baked Naan", week: "week1", isVeg: false, dayOfWeek: 2,
    description: "Mild coconut chicken stew, gently spiced and fragrant, served with warm naan for dipping.",
    image: "/images/Week1/nonveg1/ChickenWanazi.png",
    nutrients: { calories: "680 kcal", protein: "38g", carbs: "65g", fat: "28g", microNutrients: [{ name: "Calcium", amount: "150mg", percentage: "15%" }, { name: "Iron", amount: "4.1mg", percentage: "22%" }, { name: "Potassium", amount: "420mg", percentage: "9%" }] }
  },
  {
    id: 4, name: "Meatballs w/ Mashed Potatoes & Mushroom Sauce", week: "week1", isVeg: false, dayOfWeek: 3,
    description: "Tender meatballs smothered in a rich mushroom sauce, served with creamy mashed potatoes.",
    image: Meatballs,
    nutrients: { calories: "620 kcal", protein: "32g", carbs: "55g", fat: "30g", microNutrients: [{ name: "Iron", amount: "4.5mg", percentage: "25%" }, { name: "Vitamin C", amount: "35mg", percentage: "39%" }, { name: "Calcium", amount: "180mg", percentage: "18%" }] }
  },
  {
    id: 5, name: "Chicken Biryani", week: "week1", isVeg: false, dayOfWeek: 4,
    description: "A fragrant and flavorful rice dish layered with tender, spiced chicken, aromatic basmati rice, and a blend of traditional spices.",
    image: ChickenBiryani,
    nutrients: { calories: "690 kcal", protein: "40g", carbs: "82g", fat: "22g", microNutrients: [{ name: "Iron", amount: "4.2mg", percentage: "23%" }, { name: "Vitamin E", amount: "8mg", percentage: "53%" }, { name: "Magnesium", amount: "140mg", percentage: "33%" }] }
  },
  {
    id: 6, name: "Chicken Seekh Kebab w/ Mint Dip & Naan", week: "week1", isVeg: false, dayOfWeek: 5,
    description: "Grilled spiced chicken skewers, smoky and juicy, served with cooling mint dip and naan.",
    image: "/images/Week1/nonveg1/SeekhKebab.png",
    nutrients: { calories: "580 kcal", protein: "44g", carbs: "52g", fat: "20g", microNutrients: [{ name: "Iron", amount: "3.8mg", percentage: "21%" }, { name: "Calcium", amount: "200mg", percentage: "20%" }, { name: "Fiber", amount: "5g", percentage: "20%" }] }
  },

  // --- WEEK 1 VEG ---
  {
    id: 7, name: "Paneer Afghani w/ Middle Eastern Rice", week: "week1", isVeg: true, dayOfWeek: 0,
    description: "Tender, creamy grilled Cottage cheese marinated in rich spices, served with Tangy Middle Eastern basmati rice.",
    image: "/images/Week1/Veg/Paneer_Afghani.jpg",
    nutrients: { calories: "680 kcal", protein: "24g", carbs: "70g", fat: "34g", microNutrients: [{ name: "Calcium", amount: "350mg", percentage: "35%" }, { name: "Vitamin A", amount: "380mcg", percentage: "42%" }] }
  },
  {
    id: 8, name: "Dormers' Paneer w/ Zeera Rice", week: "week1", isVeg: true, dayOfWeek: 1,
    description: "Juicy, spiced cottage cheese with a signature marinade, paired perfectly with aromatic cumin-flavored basmati rice.",
    image: "/images/Week1/Veg/Dormers_Paneer.jpg",
    nutrients: { calories: "650 kcal", protein: "22g", carbs: "72g", fat: "30g", microNutrients: [{ name: "Calcium", amount: "300mg", percentage: "30%" }, { name: "Iron", amount: "3.2mg", percentage: "18%" }] }
  },
  {
    id: 9, name: "Aaloo Gobi w/ Tandoor Bread", week: "week1", isVeg: true, dayOfWeek: 2,
    description: "Spiced cauliflower and potato, slow-simmered with tomatoes and spices; served with warm tandoor bread.",
    image: "/images/Week1/Veg/AalooGobi.jpg",
    nutrients: { calories: "480 kcal", protein: "12g", carbs: "75g", fat: "16g", microNutrients: [{ name: "Vitamin C", amount: "65mg", percentage: "72%" }, { name: "Fiber", amount: "12g", percentage: "48%" }] }
  },
  {
    id: 10, name: "Plantballs w/ Mashed Potatoes & Mushroom Sauce", week: "week1", isVeg: true, dayOfWeek: 3,
    description: "Tender plantballs smothered in a rich mushroom sauce, served with creamy mashed potatoes.",
    image: "/images/Week1/Veg/Plantballs.jpg",
    nutrients: { calories: "510 kcal", protein: "18g", carbs: "60g", fat: "22g", microNutrients: [{ name: "Iron", amount: "4.5mg", percentage: "25%" }, { name: "Calcium", amount: "180mg", percentage: "18%" }] }
  },
  {
    id: 11, name: "Chickpea Veg Biryani", week: "week1", isVeg: true, dayOfWeek: 4,
    description: "A fragrant and flavorful rice dish layered with tender, spiced Veggies, Chickpeas, aromatic basmati rice, and a blend of traditional spices.",
    image: "/images/Week1/Veg/ChickpeaBiryani.jpg",
    nutrients: { calories: "590 kcal", protein: "16g", carbs: "95g", fat: "14g", microNutrients: [{ name: "Fiber", amount: "15g", percentage: "60%" }, { name: "Iron", amount: "5.1mg", percentage: "28%" }] }
  },
  {
    id: 12, name: "Methi Matar Paneer w/ Tandoor bread", week: "week1", isVeg: true, dayOfWeek: 5,
    description: "A flavorful curry of tender paneer, fresh green peas, and aromatic fenugreek leaves in a spiced, creamy gravy.",
    image: "/images/Week1/Veg/MethiMatarPaneer.jpg",
    nutrients: { calories: "610 kcal", protein: "25g", carbs: "55g", fat: "32g", microNutrients: [{ name: "Calcium", amount: "320mg", percentage: "32%" }, { name: "Vitamin A", amount: "400mcg", percentage: "44%" }] }
  },

  // --- WEEK 2 NON-VEG ---
  {
    id: 13, name: "Lamb Stroganoff w/ Riz Pilaf", week: "week2", isVeg: false, dayOfWeek: 0,
    description: "Tender beef strips in a rich, creamy mushroom sauce, served alongside fragrant, buttery rice pilaf.",
    image: "/images/Week2/NonVeg/Lamb_Pilaf.jpg",
    nutrients: { calories: "780 kcal", protein: "38g", carbs: "65g", fat: "42g", microNutrients: [{ name: "Iron", amount: "4.2mg", percentage: "23%" }, { name: "Vitamin B12", amount: "3.2mcg", percentage: "133%" }] }
  },
  {
    id: 14, name: "African Coconut Rice w/ Fried Chicken", week: "week2", isVeg: false, dayOfWeek: 1,
    description: "Creamy, coconut-infused rice paired with crispy, golden fried chicken for a perfect blend of flavors.",
    image: "/images/Week2/NonVeg/African_coconut_rice.jpg",
    nutrients: { calories: "740 kcal", protein: "35g", carbs: "78g", fat: "32g", microNutrients: [{ name: "Iron", amount: "3.5mg", percentage: "19%" }, { name: "Selenium", amount: "28mcg", percentage: "51%" }] }
  },
  {
    id: 15, name: "African Peanut Chicken Stew w/ Indian Bread", week: "week2", isVeg: false, dayOfWeek: 2,
    description: "Hearty, slow-cooked chicken stew in a rich Peanut sauce, served with indian flatbread.",
    image: "/images/Week2/NonVeg/African_Peanut.jpg",
    nutrients: { calories: "720 kcal", protein: "42g", carbs: "58g", fat: "35g", microNutrients: [{ name: "Niacin", amount: "12mg", percentage: "75%" }, { name: "Magnesium", amount: "120mg", percentage: "29%" }] }
  },
  {
    id: 16, name: "Butter Chicken w/ Peas & Carrot Rice", week: "week2", isVeg: false, dayOfWeek: 3,
    description: "Juicy, marinated chicken simmered in a creamy, spiced tomato gravy, served with fluffy Peas & carrots rice.",
    image: "/images/Week2/NonVeg/Butter_chicken.png",
    nutrients: { calories: "710 kcal", protein: "40g", carbs: "75g", fat: "26g", microNutrients: [{ name: "Vitamin A", amount: "380mcg", percentage: "42%" }, { name: "Calcium", amount: "120mg", percentage: "12%" }] }
  },
  {
    id: 17, name: "Chicken Penne Pasta in White Sauce", week: "week2", isVeg: false, dayOfWeek: 4,
    description: "Creamy white-sauce penne tossed with tender chicken, finished with parmesan and cracked pepper.",
    image: "/images/Week2/NonVeg/ChickenPenne.jpg",
    nutrients: { calories: "680 kcal", protein: "38g", carbs: "72g", fat: "28g", microNutrients: [{ name: "Calcium", amount: "200mg", percentage: "20%" }, { name: "Iron", amount: "2.5mg", percentage: "14%" }] }
  },
  {
    id: 18, name: "Lamb Pilaf w/ Salad", week: "week2", isVeg: false, dayOfWeek: 5,
    description: "Aromatic rice cooked with tender, spiced lamb, served with a refreshing side salad for a balanced meal.",
    image: "/images/Week2/NonVeg/Lamb_Pilaf_Salad.jpg",
    nutrients: { calories: "750 kcal", protein: "35g", carbs: "80g", fat: "32g", microNutrients: [{ name: "Zinc", amount: "7.5mg", percentage: "68%" }, { name: "Vitamin B12", amount: "4.2mcg", percentage: "175%" }] }
  },

  // --- WEEK 2 VEG ---
  {
    id: 19, name: "Dal Makhni w/ Zeera Rice", week: "week2", isVeg: true, dayOfWeek: 0,
    description: "Rich and creamy lentils cooked in aromatic spices, served with fragrant cumin-flavored basmati rice.",
    image: "/images/Week2/Veg/Dal_Makhni.jpg",
    nutrients: { calories: "580 kcal", protein: "18g", carbs: "95g", fat: "16g", microNutrients: [{ name: "Iron", amount: "4.2mg", percentage: "23%" }, { name: "Fiber", amount: "16g", percentage: "64%" }] }
  },
  {
    id: 20, name: "Penne Pasta Pomodoro", week: "week2", isVeg: true, dayOfWeek: 1,
    description: "Al dente penne in a fresh tomato-basil Pomodoro, finished with olive oil and parmesan.",
    image: "/images/Week2/Veg/Penne_Pomodoro.png",
    nutrients: { calories: "480 kcal", protein: "14g", carbs: "82g", fat: "12g", microNutrients: [{ name: "Vitamin C", amount: "42mg", percentage: "47%" }, { name: "Lycopene", amount: "12mg", percentage: "N/A" }] }
  },
  {
    id: 21, name: "Dum Aaloo & Dal w/ Indian Bread", week: "week2", isVeg: true, dayOfWeek: 2,
    description: "Slow-cooked baby potatoes in a spiced yogurt gravy, paired with flavorful lentils and soft, Indian flatbread.",
    image: "/images/Week2/Veg/Dum_aaloo.jpg",
    nutrients: { calories: "520 kcal", protein: "16g", carbs: "88g", fat: "14g", microNutrients: [{ name: "Potassium", amount: "900mg", percentage: "19%" }, { name: "Fiber", amount: "12g", percentage: "48%" }] }
  },
  {
    id: 22, name: "Butter Paneer w/ Carrot & Peas Rice", week: "week2", isVeg: true, dayOfWeek: 3,
    description: "Soft paneer cubes simmered in a rich, buttery tomato gravy, served with fragrant cumin-infused basmati rice.",
    image: "/images/Week2/Veg/Butter_paneer.png",
    nutrients: { calories: "660 kcal", protein: "22g", carbs: "70g", fat: "32g", microNutrients: [{ name: "Calcium", amount: "300mg", percentage: "30%" }, { name: "Vitamin A", amount: "450mcg", percentage: "50%" }] }
  },
  {
    id: 23, name: "Penne Veggie w/ White Sauce", week: "week2", isVeg: true, dayOfWeek: 4,
    description: "Classic Italian pasta tossed in a fresh, tangy White sauce with garlic, basil, and olive oil.",
    image: "/images/Week2/Veg/Penne_Veggie.png",
    nutrients: { calories: "550 kcal", protein: "15g", carbs: "80g", fat: "20g", microNutrients: [{ name: "Calcium", amount: "250mg", percentage: "25%" }, { name: "Vitamin C", amount: "35mg", percentage: "39%" }] }
  },
  {
    id: 24, name: "Rajma Chawal", week: "week2", isVeg: true, dayOfWeek: 5,
    description: "Hearty red kidney beans cooked in a spiced tomato gravy, served over a bed of steamed basmati rice.",
    image: "/images/Week2/Veg/Rajma_chawal.jpg",
    nutrients: { calories: "540 kcal", protein: "20g", carbs: "95g", fat: "10g", microNutrients: [{ name: "Iron", amount: "4.8mg", percentage: "27%" }, { name: "Folate", amount: "230mcg", percentage: "58%" }] }
  },

  // --- WEEK 3 NON-VEG ---
  {
    id: 25, name: "Chicken Khorma w/ Bagara Rice", week: "week3", isVeg: false, dayOfWeek: 0,
    description: "Fragrant, spiced chicken cooked in a rich, creamy gravy, served with flavorful bagara rice.",
    image: "/images/Week4/NonVeg/chicken_Korma.jpg",
    nutrients: { calories: "720 kcal", protein: "40g", carbs: "70g", fat: "30g", microNutrients: [{ name: "Calcium", amount: "120mg", percentage: "12%" }, { name: "Iron", amount: "4.2mg", percentage: "23%" }] }
  },
  {
    id: 26, name: "Chicken Fried Rice", week: "week3", isVeg: false, dayOfWeek: 1,
    description: "Stir-fried rice with tender chicken, fresh vegetables, and savory soy sauce, perfectly seasoned for a flavorful bite.",
    image: "/images/Week1/nonveg1/ChickenFried.png",
    nutrients: { calories: "650 kcal", protein: "35g", carbs: "85g", fat: "18g", microNutrients: [{ name: "Vitamin C", amount: "42mg", percentage: "47%" }, { name: "Iron", amount: "3.8mg", percentage: "21%" }] }
  },
  {
    id: 27, name: "Aaloo Kheema w/ Naan", week: "week3", isVeg: false, dayOfWeek: 2,
    description: "Spiced minced meat cooked with potatoes, served with soft, tandoor Naan.",
    image: "/images/Week3/NonVeg/Aaloo_keema.jpg",
    nutrients: { calories: "710 kcal", protein: "38g", carbs: "65g", fat: "32g", microNutrients: [{ name: "Iron", amount: "5.2mg", percentage: "29%" }, { name: "Zinc", amount: "7.5mg", percentage: "68%" }] }
  },
  {
    id: 28, name: "Malai Tikka w/ Lemon Rice", week: "week3", isVeg: false, dayOfWeek: 3,
    description: "Creamy, tender chicken marinated in rich spices, paired with fragrant lemon-infused rice.",
    image: "/images/Week3/NonVeg/Malai_tikka.jpg",
    nutrients: { calories: "680 kcal", protein: "42g", carbs: "68g", fat: "26g", microNutrients: [{ name: "Calcium", amount: "180mg", percentage: "18%" }, { name: "Phosphorus", amount: "400mg", percentage: "57%" }] }
  },
  {
    id: 29, name: "Spaghetti Bolognese w/ Marinara Sauce", week: "week3", isVeg: false, dayOfWeek: 4,
    description: "Classic spaghetti tossed in a rich, savory marinara sauce, topped with hearty Bolognese meat sauce.",
    image: "/images/Week4/NonVeg/spaghetti_bolognese.jpg",
    nutrients: { calories: "690 kcal", protein: "35g", carbs: "85g", fat: "22g", microNutrients: [{ name: "Lycopene", amount: "15mg", percentage: "N/A" }, { name: "Iron", amount: "4.8mg", percentage: "27%" }] }
  },
  {
    id: 30, name: "Chicken Biryani", week: "week3", isVeg: false, dayOfWeek: 5,
    description: "Fragrant basmati rice layered with spiced, tender chicken, cooked to perfection with traditional biryani spices.",
    image: "/images/Week3/NonVeg/Chicken_Biryani.jpg",
    nutrients: { calories: "690 kcal", protein: "40g", carbs: "82g", fat: "22g", microNutrients: [{ name: "Iron", amount: "4.2mg", percentage: "23%" }, { name: "Magnesium", amount: "140mg", percentage: "33%" }] }
  },

  // --- WEEK 3 VEG ---
  {
    id: 31, name: "Veg Aaloo Khorma w/ Bagara Rice", week: "week3", isVeg: true, dayOfWeek: 0,
    description: "A rich, spiced curry of potatoes and vegetables, served with flavorful bagara rice.",
    image: "/images/Week4/Veg/Veg_aaloo_korma.jpg",
    nutrients: { calories: "520 kcal", protein: "12g", carbs: "85g", fat: "16g", microNutrients: [{ name: "Vitamin C", amount: "45mg", percentage: "50%" }, { name: "Potassium", amount: "900mg", percentage: "19%" }] }
  },
  {
    id: 32, name: "Veg Fried Rice", week: "week3", isVeg: true, dayOfWeek: 1,
    description: "Stir-fried rice with tender, fresh vegetables, and savory soy sauce, perfectly seasoned for a flavorful bite.",
    image: "/images/Week1/Veg/Veg_Fried_Rice.jpg",
    nutrients: { calories: "490 kcal", protein: "12g", carbs: "88g", fat: "14g", microNutrients: [{ name: "Vitamin K", amount: "75mcg", percentage: "63%" }, { name: "Fiber", amount: "8g", percentage: "32%" }] }
  },
  {
    id: 33, name: "Paneer Tikka & Dal w/ Roti", week: "week3", isVeg: true, dayOfWeek: 2,
    description: "Grilled paneer tikka marinated in spices, served with flavorful lentils and soft, whole wheat roti.",
    image: "/images/Week3/Veg/Paneer_tikka.jpg",
    nutrients: { calories: "640 kcal", protein: "28g", carbs: "65g", fat: "28g", microNutrients: [{ name: "Calcium", amount: "350mg", percentage: "35%" }, { name: "Iron", amount: "4.5mg", percentage: "25%" }] }
  },
  {
    id: 34, name: "Paneer Lababdar w/ Lemon Rice", week: "week3", isVeg: true, dayOfWeek: 3,
    description: "Rich, creamy paneer curry simmered in a spiced tomato gravy, paired with fragrant lemon-infused rice.",
    image: "/images/Week3/Veg/Paneer_lababdaar.jpg",
    nutrients: { calories: "660 kcal", protein: "22g", carbs: "72g", fat: "32g", microNutrients: [{ name: "Calcium", amount: "300mg", percentage: "30%" }, { name: "Vitamin A", amount: "450mcg", percentage: "50%" }] }
  },
  {
    id: 35, name: "Spaghetti Pomodoro", week: "week3", isVeg: true, dayOfWeek: 4,
    description: "Classic Italian spaghetti tossed in a fresh tomato sauce, topped with tender grilled paneer.",
    image: "/images/Week4/Veg/spaghetti_pomodoro.jpg",
    nutrients: { calories: "550 kcal", protein: "18g", carbs: "82g", fat: "18g", microNutrients: [{ name: "Lycopene", amount: "15mg", percentage: "N/A" }, { name: "Calcium", amount: "150mg", percentage: "15%" }] }
  },
  {
    id: 36, name: "Chickpea Veg Biryani w/ Raita", week: "week3", isVeg: true, dayOfWeek: 5,
    description: "Fragrant basmati rice cooked with mixed veggies, Chickpeas and aromatic spices, served with cooling yogurt raita.",
    image: "/images/Week3/Veg/Chickpea_Biryani.jpg",
    nutrients: { calories: "580 kcal", protein: "18g", carbs: "95g", fat: "14g", microNutrients: [{ name: "Fiber", amount: "16g", percentage: "64%" }, { name: "Calcium", amount: "150mg", percentage: "15%" }] }
  },

  // --- WEEK 4 NON-VEG ---
  {
    id: 37, name: "Dormers' Green Kabab w/ Chutney & Flat Bread", week: "week4", isVeg: false, dayOfWeek: 0,
    description: "Herb-forward green kebab, pan-seared, paired with tangy chutney and delicate rumali roti.",
    image: "/images/Week4/NonVeg/Green_Kebab.jpg",
    nutrients: { calories: "590 kcal", protein: "42g", carbs: "55g", fat: "18g", microNutrients: [{ name: "Iron", amount: "4.5mg", percentage: "25%" }, { name: "Vitamin C", amount: "35mg", percentage: "39%" }] }
  },
  {
    id: 38, name: "Peri-Peri Chicken w/ Jolof Rice", week: "week4", isVeg: false, dayOfWeek: 1,
    description: "Tangy Peri Peri chicken served alongside flavorful, spicy West African tomato-infused rice.",
    image: "/images/Week1/nonveg1/PeriPeri.png",
    nutrients: { calories: "640 kcal", protein: "45g", carbs: "75g", fat: "16g", microNutrients: [{ name: "Vitamin D", amount: "8mcg", percentage: "40%" }, { name: "Selenium", amount: "28mcg", percentage: "51%" }] }
  },
  {
    id: 39, name: "Moroccan Chicken Tagine w/ Indian Bread", week: "week4", isVeg: false, dayOfWeek: 2,
    description: "Aromatic chicken slow cooked with spices and vegetables, served with fluffy Indian Bread.",
    image: "/images/Week3/NonVeg/Morrocan_chicken.png",
    nutrients: { calories: "660 kcal", protein: "40g", carbs: "65g", fat: "24g", microNutrients: [{ name: "Iron", amount: "4.8mg", percentage: "27%" }, { name: "Vitamin A", amount: "450mcg", percentage: "50%" }] }
  },
  {
    id: 40, name: "Veg Biryani w/ Dormer's Chicken", week: "week4", isVeg: false, dayOfWeek: 3,
    description: "Aromatic vegetable biryani paired with Dormer's tender, spiced grilled chicken.",
    image: "/images/Week4/NonVeg/Dormer_Chicken_Veg_Biryani.jpg",
    nutrients: { calories: "680 kcal", protein: "42g", carbs: "85g", fat: "18g", microNutrients: [{ name: "Iron", amount: "4.2mg", percentage: "23%" }, { name: "Fiber", amount: "10g", percentage: "40%" }] }
  },
  {
    id: 41, name: "Dormer's Style Halal Guys Bowl", week: "week4", isVeg: false, dayOfWeek: 4,
    description: "Juicy grilled Mutton served with rice, lettuce, and Dormer's signature white sauce and hot sauce.",
    image: "/images/Week4/NonVeg/Dormers_Halal_guys_Bowl.jpg",
    nutrients: { calories: "750 kcal", protein: "35g", carbs: "78g", fat: "34g", microNutrients: [{ name: "Vitamin K", amount: "75mcg", percentage: "63%" }, { name: "Calcium", amount: "150mg", percentage: "15%" }] }
  },
  {
    id: 42, name: "Thai Chicken Curry w/ Coconut Rice", week: "week4", isVeg: false, dayOfWeek: 5,
    description: "Tangy Asian curry slow cooked with tender chicken, served with flaky coconut rice for a rich and hearty Food bowl.",
    image: "/images/Week4/NonVeg/Thai_chicken_curry.jpg",
    nutrients: { calories: "720 kcal", protein: "38g", carbs: "75g", fat: "30g", microNutrients: [{ name: "Vitamin C", amount: "45mg", percentage: "50%" }, { name: "Iron", amount: "3.5mg", percentage: "19%" }] }
  },

  // --- WEEK 4 VEG ---
  {
    id: 43, name: "Classic Tangy Cholay w/ Naan", week: "week4", isVeg: true, dayOfWeek: 0,
    description: "Tangy spiced chickpeas simmered with tamarind and spices, served with warm buttered naan.",
    image: "/images/Week4/Veg/Tangy_Cholay.jpg",
    nutrients: { calories: "550 kcal", protein: "18g", carbs: "85g", fat: "14g", microNutrients: [{ name: "Iron", amount: "5.5mg", percentage: "30%" }, { name: "Fiber", amount: "18g", percentage: "72%" }] }
  },
  {
    id: 44, name: "Jolof Rice w/ Grilled Veggies", week: "week4", isVeg: true, dayOfWeek: 1,
    description: "Perfectly char grilled Veggies served alongside flavorful, spicy West African tomato-infused rice.",
    image: "/images/Week1/Veg/Jolof_rice.jpg",
    nutrients: { calories: "480 kcal", protein: "10g", carbs: "88g", fat: "12g", microNutrients: [{ name: "Vitamin A", amount: "450mcg", percentage: "50%" }, { name: "Vitamin C", amount: "45mg", percentage: "50%" }] }
  },
  {
    id: 45, name: "Pav Bhaji", week: "week4", isVeg: true, dayOfWeek: 2,
    description: "A spicy, mashed vegetable curry served with buttered, soft buns for a comforting street food experience.",
    image: "/images/Week4/Veg/Pav_Bhaji.jpg",
    nutrients: { calories: "520 kcal", protein: "12g", carbs: "78g", fat: "18g", microNutrients: [{ name: "Vitamin C", amount: "42mg", percentage: "47%" }, { name: "Calcium", amount: "120mg", percentage: "12%" }] }
  },
  {
    id: 46, name: "Veg Biryani w/ Dormers' Paneer", week: "week4", isVeg: true, dayOfWeek: 3,
    description: "Aromatic basmati rice cooked with mixed vegetables, served with tangy, Dormer's paneer curry.",
    image: "/images/Week4/Veg/Dormers_Paneer_veg_Biryani.jpg",
    nutrients: { calories: "650 kcal", protein: "22g", carbs: "85g", fat: "26g", microNutrients: [{ name: "Calcium", amount: "300mg", percentage: "30%" }, { name: "Iron", amount: "4.2mg", percentage: "23%" }] }
  },
  {
    id: 47, name: "Rajma Aaloo w/ Roti", week: "week4", isVeg: true, dayOfWeek: 4,
    description: "Hearty red kidney beans and potatoes cooked in a spiced tomato gravy, served with soft roti.",
    image: "/images/Week4/Veg/Rajma_aaloo.jpg",
    nutrients: { calories: "540 kcal", protein: "18g", carbs: "85g", fat: "12g", microNutrients: [{ name: "Iron", amount: "4.8mg", percentage: "27%" }, { name: "Fiber", amount: "16g", percentage: "64%" }] }
  },
  {
    id: 48, name: "Kadhai Paneer w/ Cumin Rice", week: "week4", isVeg: true, dayOfWeek: 5,
    description: "Stir-fried paneer and bell peppers cooked in a flavorful, spiced gravy, served with Cumin infused rice.",
    image: "/images/Week3/Veg/Kadhai_Paneer.jpg",
    nutrients: { calories: "640 kcal", protein: "22g", carbs: "75g", fat: "28g", microNutrients: [{ name: "Calcium", amount: "300mg", percentage: "30%" }, { name: "Vitamin C", amount: "120mg", percentage: "133%" }] }
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
  const [selectedWeek, setSelectedWeek] = useState(() => {
    // Get today's date (e.g., the 24th)
    const dayOfMonth = new Date().getDate();
    
    // Divide by 7 and round up to find the week number (1, 2, 3, or 4)
    let weekNum = Math.ceil(dayOfMonth / 7);
    
    // If the month has 29, 30, or 31 days, serve the Week 4 menu
    if (weekNum > 4) weekNum = 4; 
    
    return `week${weekNum}`;
  });
  
  const availableDishes = MENU_DATA.filter(
    (dish) => dish.isVeg === isVegOnly && dish.week === selectedWeek
  );

  const currentDish =
    selectedDay !== null
      ? availableDishes.find((dish) => dish.dayOfWeek === selectedDay) || availableDishes[availableDishes.length - 1] || null
      : null;

  useEffect(() => {
    if (selectedDay !== null) {
      setShowNutritionHint(true);
      const timer = setTimeout(() => setShowNutritionHint(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [selectedDay]);

  const [isFlipped, setIsFlipped] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
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

  // Helper styles for the toggle labels
  const labelStyle = {
    fontFamily: "Montserrat, sans-serif",
    fontWeight: 700,
    fontSize: "10px", // Mobile size
    lineHeight: "100%",
  };

  const desktopLabelStyle = {
    fontFamily: "Montserrat, sans-serif",
    fontWeight: 700,
    fontSize: "14px", // Desktop size
    lineHeight: "100%",
  };

  return (
    <>
      <div
        className={`relative w-full py-[24px] lg:py-[40px] ${
          theme === "light" ? "bg-[#EEE9DA]" : "bg-[#1E3A4F]"
        } overflow-hidden`}
      >
        <div className="container mx-auto px-4">
          
          {/* --- MENU HEADER & TOGGLES --- */}
          <div className="mb-5 mt-0 flex items-center justify-between lg:max-w-[987px] mx-auto">
            
            {/* Title (Mobile) */}
            <h2
              className={`text-[32px] font-medium lg:hidden block ${
                theme === "light" ? "text-[#1E3A4F]" : "text-white"
              }`}
              style={{
                fontFamily: "Montserrat",
                fontWeight: 500,
                lineHeight: "100%",
                fontSize: "18px",
              }}
            >
              MENU
            </h2>
            
            {/* Title (Desktop) */}
            <h2
              className={`menu-heading_icon lg:block hidden ${
                theme === "light" ? "!text-[#1E3A4F]" : "!text-white"
              }`}
            >
              MENU
            </h2>

            {/* --- MOBILE TOGGLE WITH LABELS --- */}
            <div className="flex items-center gap-2 lg:hidden">
              <span 
                className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"} opacity-80`}
                style={labelStyle}
              >
                Non Veg
              </span>
              
              <button
                onClick={() => {
                  setIsVegOnly((v) => !v);
                  const jsDay = new Date().getDay();
                  setSelectedDay(jsDay === 0 ? null : jsDay - 1);
                }}
                className={`relative w-15 h-7 rounded-full flex items-center bg-transparent transition-colors duration-300 px-1 border-2 
                ${theme === "light" ? "border-[#1E3A4F]" : "border-white"}`}
                aria-label="Toggle veg/non-veg"
              >
                <div
                  className={`absolute top-0.5 left-0.5 h-5 w-6 rounded-full shadow-md flex items-center justify-center transition-transform duration-300
                  ${isVegOnly ? "translate-x-7" : "translate-x-0"}
                  ${theme === "light" ? "bg-[#1E3A4F]" : "bg-[#FAF6EB]"}`}
                >
                  <span className="text-[16px]">
                    <img
                      src={isVegOnly ? "/images/VegIcon.svg" : "/images/NonVeg.svg"}
                      className="w-[16px]"
                      alt=""
                    />
                  </span>
                </div>
              </button>

              <span 
                className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"} opacity-80`}
                style={labelStyle}
              >
                Veg
              </span>
            </div>

            {/* --- DESKTOP TOGGLE WITH LABELS --- */}
            <div className="hidden lg:flex items-center gap-3">
              <span 
                className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"} opacity-90`}
                style={desktopLabelStyle}
              >
                Non Veg
              </span>

              <button
                onClick={() => {
                  setIsVegOnly((v) => !v);
                  const jsDay = new Date().getDay();
                  setSelectedDay(jsDay === 0 ? null : jsDay - 1);
                }}
                className={`relative rounded-full flex items-center bg-transparent transition-colors duration-300 px-1 border-2 
                h-[43px] w-[90px]
                ${theme === "light" ? "border-[#1E3A4F]" : "border-white"}`}
                aria-label="Toggle veg/non-veg"
              >
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

              <span 
                className={`${theme === "light" ? "text-[#1E3A4F]" : "text-white"} opacity-90`}
                style={desktopLabelStyle}
              >
                Veg
              </span>
            </div>
          </div>

          {/* Menu Card Content (Kept exactly as before) */}
          <div className="lg:max-w-[987px] mx-auto">
            <div
              className={`bg-[#1E3A4F] perspective-1000 ${
                theme === "light" ? "MenuCardBoxConatinerlight" : "MenuCardBoxConatiner"
              }`}
            >
              {currentDish ? (
                <div className={`relative w-full min-h-[180px] md:min-h-[260px] transition-transform duration-500 preserve-3d`}>
                  <div>
                    <div className="flex justify-between">
                      <div className="flex justify-center gap-1 mb-3 lg:gap-[23px] ">
                        {[
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
                      <div className="flex-1 flex flex-col min-w-0 overflow-visible">
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
                        <div className="bg-[#1E3A4F] rounded-3xl p-8 border-2 border-white md:max-w-[420px] lg:max-w-[700px] lg:w-[700px] max-h-[90vh] overflow-y-auto w-[358px]">
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
