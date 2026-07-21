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
    "id": 1,
    "name": "Chicken Afghani w/ Yellow Rice",
    "week": "week1",
    "description": "Tender, creamy grilled chicken marinated in rich spices, served with tangy yellow basmati rice.",
    "image": "/images/Week1/nonveg1/ChickenAfghan.jpg",
    "isVeg": false,
    "dayOfWeek": 0,
    "spiceLevel": 1,
    "allergens": [
      "dairy",
      "nuts"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "3.5mg",
          "percentage": "19%"
        },
        {
          "name": "Calcium",
          "amount": "120mg",
          "percentage": "12%"
        },
        {
          "name": "Vitamin A",
          "amount": "280mcg",
          "percentage": "31%"
        },
        {
          "name": "Vitamin C",
          "amount": "10mg",
          "percentage": "11%"
        },
        {
          "name": "Fiber",
          "amount": "3g",
          "percentage": "12%"
        }
      ]
    }
  },
  {
    "id": 7,
    "name": "Paneer Afghani w/ Middle Eastern Rice",
    "week": "week1",
    "description": "Tender, creamy grilled cottage cheese marinated in rich spices, served with tangy Middle Eastern basmati rice.",
    "image": "/images/Week1/Veg/Paneer_Afghani_w__Yellow_rice.jpg",
    "isVeg": true,
    "dayOfWeek": 0,
    "spiceLevel": 1,
    "allergens": [
      "dairy",
      "nuts"
    ],
    "nutrients": {
      "calories": "650 kcal",
      "protein": "26g",
      "carbs": "63.56g",
      "fat": "31.41g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "3.5mg",
          "percentage": "19%"
        },
        {
          "name": "Calcium",
          "amount": "280mg",
          "percentage": "28%"
        },
        {
          "name": "Vitamin A",
          "amount": "380mcg",
          "percentage": "42%"
        },
        {
          "name": "Vitamin C",
          "amount": "12mg",
          "percentage": "13%"
        },
        {
          "name": "Fiber",
          "amount": "4g",
          "percentage": "16%"
        }
      ]
    }
  },
  {
    "id": 2,
    "name": "Dormers' Chicken w/ Zeera Rice",
    "week": "week1",
    "description": "Juicy, spiced chicken with a signature marinade, paired perfectly with aromatic cumin-flavored basmati rice.",
    "image": "/images/Week1/nonveg1/DormersChicken.jpg",
    "isVeg": false,
    "dayOfWeek": 1,
    "spiceLevel": 2,
    "allergens": [
      "dairy",
      "mustard"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "3.2mg",
          "percentage": "18%"
        },
        {
          "name": "Fiber",
          "amount": "6g",
          "percentage": "24%"
        },
        {
          "name": "Vitamin C",
          "amount": "28mg",
          "percentage": "31%"
        },
        {
          "name": "Folate",
          "amount": "165mcg",
          "percentage": "41%"
        },
        {
          "name": "Potassium",
          "amount": "420mg",
          "percentage": "9%"
        }
      ]
    }
  },
  {
    "id": 8,
    "name": "Dormers' Paneer w/ Zeera Rice",
    "week": "week1",
    "description": "Juicy, spiced cottage cheese with a signature marinade, paired perfectly with aromatic cumin-flavored basmati rice.",
    "image": "/images/Week1/Veg/Dormers_Paneer_Zeera_Rice.jpg",
    "isVeg": true,
    "dayOfWeek": 1,
    "spiceLevel": 2,
    "allergens": [
      "dairy",
      "nuts"
    ],
    "nutrients": {
      "calories": "650 kcal",
      "protein": "26g",
      "carbs": "63.56g",
      "fat": "31.41g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "3.2mg",
          "percentage": "18%"
        },
        {
          "name": "Calcium",
          "amount": "300mg",
          "percentage": "30%"
        },
        {
          "name": "Vitamin C",
          "amount": "28mg",
          "percentage": "31%"
        },
        {
          "name": "Folate",
          "amount": "165mcg",
          "percentage": "41%"
        },
        {
          "name": "Fiber",
          "amount": "6g",
          "percentage": "24%"
        }
      ]
    }
  },
  {
    "id": 50,
    "name": "Chicken Wanazi w/ Oven Baked Naan",
    "week": "week1",
    "description": "Mild coconut chicken stew, gently spiced and fragrant, served with warm naan for dipping.",
    "image": "/images/Week2/NonVeg/African_Peanut_Chicken_Stew_2.jpg",
    "isVeg": false,
    "dayOfWeek": 2,
    "spiceLevel": 1,
    "allergens": [
      "gluten",
      "dairy"
    ],
    "nutrients": {
      "calories": "640 kcal",
      "protein": "36g",
      "carbs": "58g",
      "fat": "26g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "3.5mg",
          "percentage": "19%"
        },
        {
          "name": "Vitamin A",
          "amount": "120mcg",
          "percentage": "13%"
        },
        {
          "name": "Calcium",
          "amount": "90mg",
          "percentage": "9%"
        },
        {
          "name": "Fiber",
          "amount": "4g",
          "percentage": "16%"
        }
      ]
    }
  },
  {
    "id": 53,
    "name": "Aaloo Gobi w/ Tandoor Bread",
    "week": "week1",
    "description": "Spiced cauliflower and potato, slow-simmered with tomatoes and spices, served with warm tandoor bread.",
    "image": "/images/Week2/Veg/Dum_aaloo_2.jpg",
    "isVeg": true,
    "dayOfWeek": 2,
    "spiceLevel": 2,
    "allergens": [
      "gluten"
    ],
    "nutrients": {
      "calories": "520 kcal",
      "protein": "12g",
      "carbs": "66g",
      "fat": "20g",
      "microNutrients": [
        {
          "name": "Vitamin C",
          "amount": "48mg",
          "percentage": "53%"
        },
        {
          "name": "Iron",
          "amount": "2.4mg",
          "percentage": "13%"
        },
        {
          "name": "Potassium",
          "amount": "620mg",
          "percentage": "13%"
        },
        {
          "name": "Fiber",
          "amount": "7g",
          "percentage": "28%"
        }
      ]
    }
  },
  {
    "id": 4,
    "name": "Meatballs w/ Mashed Potatoes & Mushroom Sauce",
    "week": "week1",
    "description": "Tender meatballs smothered in a rich mushroom sauce, served with creamy mashed potatoes.",
    "image": "/images/Week1/nonveg1/MeatballsMashe.jpg",
    "isVeg": false,
    "dayOfWeek": 3,
    "spiceLevel": 1,
    "allergens": [
      "gluten",
      "dairy"
    ],
    "nutrients": {
      "calories": "601.5 kcal",
      "protein": "52.2g",
      "carbs": "60g",
      "fat": "15.7g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.5mg",
          "percentage": "25%"
        },
        {
          "name": "Fiber",
          "amount": "12g",
          "percentage": "48%"
        },
        {
          "name": "Folate",
          "amount": "180mcg",
          "percentage": "45%"
        },
        {
          "name": "Vitamin C",
          "amount": "35mg",
          "percentage": "39%"
        },
        {
          "name": "Calcium",
          "amount": "180mg",
          "percentage": "18%"
        }
      ]
    }
  },
  {
    "id": 10,
    "name": "Plantballs w/ Mashed Potatoes & Mushroom Sauce",
    "week": "week1",
    "description": "Tender plantballs smothered in a rich mushroom sauce, served with creamy mashed potatoes.",
    "image": "/images/Week1/Veg/Veg_Kofta_Mashed_Potato_Mushroom_sauce.jpg",
    "isVeg": true,
    "dayOfWeek": 3,
    "spiceLevel": 1,
    "allergens": [
      "dairy",
      "gluten"
    ],
    "nutrients": {
      "calories": "429 kcal",
      "protein": "8.7g",
      "carbs": "75g",
      "fat": "10.6g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.5mg",
          "percentage": "25%"
        },
        {
          "name": "Fiber",
          "amount": "12g",
          "percentage": "48%"
        },
        {
          "name": "Folate",
          "amount": "180mcg",
          "percentage": "45%"
        },
        {
          "name": "Vitamin C",
          "amount": "35mg",
          "percentage": "39%"
        },
        {
          "name": "Calcium",
          "amount": "180mg",
          "percentage": "18%"
        }
      ]
    }
  },
  {
    "id": 6,
    "name": "Chicken Biryani",
    "week": "week1",
    "description": "A fragrant and flavorful rice dish layered with tender, spiced chicken, aromatic basmati rice, and a blend of traditional spices.",
    "image": "/images/Week1/nonveg1/ChickenBiryani.jpg",
    "isVeg": false,
    "dayOfWeek": 4,
    "spiceLevel": 2,
    "allergens": [
      "dairy"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.2mg",
          "percentage": "23%"
        },
        {
          "name": "Fiber",
          "amount": "10g",
          "percentage": "40%"
        },
        {
          "name": "Vitamin E",
          "amount": "8mg",
          "percentage": "53%"
        },
        {
          "name": "Magnesium",
          "amount": "140mg",
          "percentage": "33%"
        },
        {
          "name": "Zinc",
          "amount": "3mg",
          "percentage": "27%"
        }
      ]
    }
  },
  {
    "id": 54,
    "name": "Chickpea Veg Biryani",
    "week": "week1",
    "description": "A fragrant and flavorful rice dish layered with spiced vegetables, chickpeas, aromatic basmati rice, and a blend of traditional spices.",
    "image": "/images/Week4/Veg/Dormers_Paneer_veg_Biryani.jpg",
    "isVeg": true,
    "dayOfWeek": 4,
    "spiceLevel": 2,
    "allergens": [
      "dairy"
    ],
    "nutrients": {
      "calories": "600 kcal",
      "protein": "16g",
      "carbs": "92g",
      "fat": "16g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.0mg",
          "percentage": "22%"
        },
        {
          "name": "Folate",
          "amount": "180mcg",
          "percentage": "45%"
        },
        {
          "name": "Magnesium",
          "amount": "110mg",
          "percentage": "26%"
        },
        {
          "name": "Fiber",
          "amount": "11g",
          "percentage": "44%"
        }
      ]
    }
  },
  {
    "id": 51,
    "name": "Chicken Seekh Kebab w/ Mint Dip & Naan",
    "week": "week1",
    "description": "Grilled spiced chicken skewers, smoky and juicy, served with cooling mint dip and naan.",
    "image": "/images/Week2/NonVeg/Dormer's_Kebab.jpg",
    "isVeg": false,
    "dayOfWeek": 5,
    "spiceLevel": 2,
    "allergens": [
      "gluten",
      "dairy"
    ],
    "nutrients": {
      "calories": "620 kcal",
      "protein": "40g",
      "carbs": "46g",
      "fat": "30g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "3.8mg",
          "percentage": "21%"
        },
        {
          "name": "Zinc",
          "amount": "3.2mg",
          "percentage": "29%"
        },
        {
          "name": "Calcium",
          "amount": "110mg",
          "percentage": "11%"
        },
        {
          "name": "Fiber",
          "amount": "3g",
          "percentage": "12%"
        }
      ]
    }
  },
  {
    "id": 24,
    "name": "Methi Matar Paneer w/ Tandoor Bread",
    "week": "week1",
    "description": "A flavorful curry of tender paneer, fresh green peas, and aromatic fenugreek leaves in a spiced, creamy gravy, served with warm tandoor bread.",
    "image": "/images/Week2/Veg/Methi_Matar_paneer.jpg",
    "isVeg": true,
    "dayOfWeek": 5,
    "spiceLevel": 1,
    "allergens": [
      "dairy",
      "gluten",
      "nuts"
    ],
    "nutrients": {
      "calories": "637.5 kcal",
      "protein": "33g",
      "carbs": "31.8g",
      "fat": "42.1g",
      "microNutrients": [
        {
          "name": "Vitamin A",
          "amount": "450mcg",
          "percentage": "50%"
        },
        {
          "name": "Vitamin K",
          "amount": "60mcg",
          "percentage": "50%"
        },
        {
          "name": "Calcium",
          "amount": "350mg",
          "percentage": "35%"
        },
        {
          "name": "Iron",
          "amount": "4.5mg",
          "percentage": "25%"
        },
        {
          "name": "Fiber",
          "amount": "8g",
          "percentage": "32%"
        }
      ]
    }
  },
  {
    "id": 13,
    "name": "Lamb Stroganoff w/ Riz Pilaf",
    "week": "week2",
    "description": "Tender beef strips in a rich, creamy mushroom sauce, served alongside fragrant, buttery rice pilaf.",
    "image": "/images/Week2/NonVeg/Lamb_Pilaf.jpg",
    "isVeg": false,
    "dayOfWeek": 0,
    "spiceLevel": 1,
    "allergens": [
      "dairy",
      "gluten"
    ],
    "nutrients": {
      "calories": "855 kcal",
      "protein": "47.1g",
      "carbs": "84g",
      "fat": "36.4g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.2mg",
          "percentage": "23%"
        },
        {
          "name": "Zinc",
          "amount": "6.2mg",
          "percentage": "56%"
        },
        {
          "name": "Vitamin B12",
          "amount": "3.2mcg",
          "percentage": "133%"
        },
        {
          "name": "Vitamin D",
          "amount": "2.5mcg",
          "percentage": "13%"
        },
        {
          "name": "Calcium",
          "amount": "120mg",
          "percentage": "12%"
        }
      ]
    }
  },
  {
    "id": 56,
    "name": "Dal Makhni w/ Zeera Rice",
    "week": "week2",
    "description": "Rich and creamy lentils cooked in aromatic spices, served with fragrant cumin-flavored basmati rice.",
    "image": "/images/Week2/Veg/Dal_Nawabi_w__zeera_rice.jpg",
    "isVeg": true,
    "dayOfWeek": 0,
    "spiceLevel": 1,
    "allergens": [
      "dairy"
    ],
    "nutrients": {
      "calories": "590 kcal",
      "protein": "20g",
      "carbs": "76g",
      "fat": "20g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.5mg",
          "percentage": "25%"
        },
        {
          "name": "Folate",
          "amount": "160mcg",
          "percentage": "40%"
        },
        {
          "name": "Calcium",
          "amount": "140mg",
          "percentage": "14%"
        },
        {
          "name": "Fiber",
          "amount": "12g",
          "percentage": "48%"
        }
      ]
    }
  },
  {
    "id": 17,
    "name": "African Coconut Rice w/ Fried Chicken",
    "week": "week2",
    "description": "Creamy, coconut-infused rice paired with crispy, golden fried chicken for a perfect blend of flavors.",
    "image": "/images/Week2/NonVeg/African_coconut_rice_with_fried_chicken.jpg",
    "isVeg": false,
    "dayOfWeek": 1,
    "spiceLevel": 2,
    "allergens": [
      "dairy",
      "eggs",
      "gluten"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "3.5mg",
          "percentage": "19%"
        },
        {
          "name": "Manganese",
          "amount": "1.8mg",
          "percentage": "78%"
        },
        {
          "name": "Copper",
          "amount": "0.4mg",
          "percentage": "44%"
        },
        {
          "name": "Selenium",
          "amount": "28mcg",
          "percentage": "51%"
        },
        {
          "name": "Fiber",
          "amount": "4g",
          "percentage": "16%"
        }
      ]
    }
  },
  {
    "id": 23,
    "name": "Penne Pasta Pomodoro",
    "week": "week2",
    "description": "Al dente penne in a fresh tomato-basil pomodoro, finished with olive oil and parmesan.",
    "image": "/images/Week2/Veg/Penne_pomodoro.jpg",
    "isVeg": true,
    "dayOfWeek": 1,
    "spiceLevel": 1,
    "allergens": [
      "gluten",
      "dairy"
    ],
    "nutrients": {
      "calories": "315 kcal",
      "protein": "9g",
      "carbs": "45g",
      "fat": "10.9g",
      "microNutrients": [
        {
          "name": "Vitamin C",
          "amount": "42mg",
          "percentage": "47%"
        },
        {
          "name": "Lycopene",
          "amount": "12mg",
          "percentage": "N/A"
        },
        {
          "name": "Vitamin K",
          "amount": "15mcg",
          "percentage": "13%"
        },
        {
          "name": "Folate",
          "amount": "80mcg",
          "percentage": "20%"
        },
        {
          "name": "Fiber",
          "amount": "6g",
          "percentage": "24%"
        }
      ]
    }
  },
  {
    "id": 16,
    "name": "African Peanut Chicken Stew w/ Indian Bread",
    "week": "week2",
    "description": "Hearty, slow-cooked chicken stew in a rich Peanut sauce, served with indian flatbread.",
    "image": "/images/Week2/NonVeg/African_Peanut_Chicken_Stew_2.jpg",
    "isVeg": false,
    "dayOfWeek": 2,
    "spiceLevel": 2,
    "allergens": [
      "dairy",
      "gluten",
      "nuts"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.2mg",
          "percentage": "23%"
        },
        {
          "name": "Niacin",
          "amount": "12mg",
          "percentage": "75%"
        },
        {
          "name": "Vitamin E",
          "amount": "6mg",
          "percentage": "40%"
        },
        {
          "name": "Magnesium",
          "amount": "120mg",
          "percentage": "29%"
        },
        {
          "name": "Phosphorus",
          "amount": "400mg",
          "percentage": "57%"
        }
      ]
    }
  },
  {
    "id": 22,
    "name": "Dum Aloo & Dal w/ Indian Bread",
    "week": "week2",
    "description": "Slow-cooked baby potatoes in a spiced yogurt gravy, paired with flavorful lentils and soft Indian flatbread.",
    "image": "/images/Week2/Veg/Dum_aaloo_2.jpg",
    "isVeg": true,
    "dayOfWeek": 2,
    "spiceLevel": 2,
    "allergens": [
      "dairy",
      "gluten"
    ],
    "nutrients": {
      "calories": "414 kcal",
      "protein": "19.5g",
      "carbs": "60g",
      "fat": "12.1g",
      "microNutrients": [
        {
          "name": "Vitamin C",
          "amount": "35mg",
          "percentage": "39%"
        },
        {
          "name": "Potassium",
          "amount": "900mg",
          "percentage": "19%"
        },
        {
          "name": "Vitamin B6",
          "amount": "0.6mg",
          "percentage": "35%"
        },
        {
          "name": "Manganese",
          "amount": "1.2mg",
          "percentage": "52%"
        },
        {
          "name": "Fiber",
          "amount": "12g",
          "percentage": "48%"
        }
      ]
    }
  },
  {
    "id": 14,
    "name": "Butter Chicken w/ Peas & Carrot Rice",
    "week": "week2",
    "description": "Juicy, marinated chicken simmered in a creamy, spiced tomato gravy, served with fluffy peas & carrots rice.",
    "image": "/images/Week2/NonVeg/Butter_chicken_peas_carrot_rice.jpg",
    "isVeg": false,
    "dayOfWeek": 3,
    "spiceLevel": 1,
    "allergens": [
      "dairy",
      "nuts"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.2mg",
          "percentage": "23%"
        },
        {
          "name": "Vitamin A",
          "amount": "380mcg",
          "percentage": "42%"
        },
        {
          "name": "Vitamin C",
          "amount": "12mg",
          "percentage": "13%"
        },
        {
          "name": "Calcium",
          "amount": "120mg",
          "percentage": "12%"
        },
        {
          "name": "Fiber",
          "amount": "4g",
          "percentage": "16%"
        }
      ]
    }
  },
  {
    "id": 20,
    "name": "Butter Paneer w/ Carrot & Peas Rice",
    "week": "week2",
    "description": "Soft paneer cubes simmered in a rich, buttery tomato gravy, served with fragrant cumin-infused basmati rice.",
    "image": "/images/Week2/Veg/Butter_paneer.jpg",
    "isVeg": true,
    "dayOfWeek": 3,
    "spiceLevel": 1,
    "allergens": [
      "dairy",
      "nuts"
    ],
    "nutrients": {
      "calories": "650 kcal",
      "protein": "26g",
      "carbs": "63.56g",
      "fat": "31.41g",
      "microNutrients": [
        {
          "name": "Calcium",
          "amount": "300mg",
          "percentage": "30%"
        },
        {
          "name": "Vitamin A",
          "amount": "450mcg",
          "percentage": "50%"
        },
        {
          "name": "Vitamin K",
          "amount": "45mcg",
          "percentage": "38%"
        },
        {
          "name": "Phosphorus",
          "amount": "350mg",
          "percentage": "50%"
        },
        {
          "name": "Zinc",
          "amount": "3.2mg",
          "percentage": "29%"
        }
      ]
    }
  },
  {
    "id": 52,
    "name": "Chicken Penne Pasta in White Sauce",
    "week": "week2",
    "description": "Creamy white-sauce penne tossed with tender chicken, finished with parmesan and cracked pepper.",
    "image": "/images/Week2/Veg/Penne_pomodoro.jpg",
    "isVeg": false,
    "dayOfWeek": 4,
    "spiceLevel": 1,
    "allergens": [
      "gluten",
      "dairy"
    ],
    "nutrients": {
      "calories": "720 kcal",
      "protein": "35g",
      "carbs": "72g",
      "fat": "32g",
      "microNutrients": [
        {
          "name": "Calcium",
          "amount": "210mg",
          "percentage": "21%"
        },
        {
          "name": "Iron",
          "amount": "2.6mg",
          "percentage": "14%"
        },
        {
          "name": "Vitamin A",
          "amount": "150mcg",
          "percentage": "17%"
        },
        {
          "name": "Fiber",
          "amount": "4g",
          "percentage": "16%"
        }
      ]
    }
  },
  {
    "id": 55,
    "name": "Penne Veggie w/ White Sauce",
    "week": "week2",
    "description": "Classic Italian pasta tossed in a fresh, tangy white sauce with garlic, basil and olive oil.",
    "image": "/images/Week2/Veg/Penne_pomodoro.jpg",
    "isVeg": true,
    "dayOfWeek": 4,
    "spiceLevel": 1,
    "allergens": [
      "gluten",
      "dairy"
    ],
    "nutrients": {
      "calories": "650 kcal",
      "protein": "18g",
      "carbs": "80g",
      "fat": "26g",
      "microNutrients": [
        {
          "name": "Calcium",
          "amount": "200mg",
          "percentage": "20%"
        },
        {
          "name": "Vitamin A",
          "amount": "160mcg",
          "percentage": "18%"
        },
        {
          "name": "Iron",
          "amount": "2.5mg",
          "percentage": "14%"
        },
        {
          "name": "Fiber",
          "amount": "5g",
          "percentage": "20%"
        }
      ]
    }
  },
  {
    "id": 15,
    "name": "Lamb Pilaf w/ Salad",
    "week": "week2",
    "description": "Aromatic rice cooked with tender, spiced lamb, served with a refreshing side salad for a balanced meal.",
    "image": "/images/Week2/NonVeg/Lamb_Pilaf.jpg",
    "isVeg": false,
    "dayOfWeek": 5,
    "spiceLevel": 1,
    "allergens": [
      "nuts"
    ],
    "nutrients": {
      "calories": "921 kcal",
      "protein": "45.6g",
      "carbs": "84g",
      "fat": "42.4g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "5.2mg",
          "percentage": "29%"
        },
        {
          "name": "Zinc",
          "amount": "7.5mg",
          "percentage": "68%"
        },
        {
          "name": "Vitamin B12",
          "amount": "4.2mcg",
          "percentage": "175%"
        },
        {
          "name": "Selenium",
          "amount": "45mcg",
          "percentage": "82%"
        },
        {
          "name": "Potassium",
          "amount": "850mg",
          "percentage": "18%"
        }
      ]
    }
  },
  {
    "id": 21,
    "name": "Rajma Chawal",
    "week": "week2",
    "description": "Hearty red kidney beans cooked in a spiced tomato gravy, served over a bed of steamed basmati rice.",
    "image": "/images/Week2/Veg/Rajma_chawal.jpg",
    "isVeg": true,
    "dayOfWeek": 5,
    "spiceLevel": 2,
    "allergens": [],
    "nutrients": {
      "calories": "430.5 kcal",
      "protein": "19.5g",
      "carbs": "64.5g",
      "fat": "11.35g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.8mg",
          "percentage": "27%"
        },
        {
          "name": "Folate",
          "amount": "230mcg",
          "percentage": "58%"
        },
        {
          "name": "Magnesium",
          "amount": "140mg",
          "percentage": "33%"
        },
        {
          "name": "Potassium",
          "amount": "850mg",
          "percentage": "18%"
        },
        {
          "name": "Fiber",
          "amount": "16g",
          "percentage": "64%"
        }
      ]
    }
  },
  {
    "id": 39,
    "name": "Chicken Khorma w/ Bagara Rice",
    "week": "week3",
    "description": "Fragrant, spiced chicken cooked in a rich, creamy gravy, served with flavorful bagara rice.",
    "image": "/images/Week4/NonVeg/chicken_Korma_bagara_rice.jpg",
    "isVeg": false,
    "dayOfWeek": 0,
    "spiceLevel": 1,
    "allergens": [
      "dairy",
      "nuts"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.2mg",
          "percentage": "23%"
        },
        {
          "name": "Zinc",
          "amount": "6.2mg",
          "percentage": "56%"
        },
        {
          "name": "Vitamin B12",
          "amount": "3.2mcg",
          "percentage": "133%"
        },
        {
          "name": "Vitamin D",
          "amount": "2.5mcg",
          "percentage": "13%"
        },
        {
          "name": "Calcium",
          "amount": "120mg",
          "percentage": "12%"
        }
      ]
    }
  },
  {
    "id": 45,
    "name": "Veg Aaloo Khorma w/ Bagara Rice",
    "week": "week3",
    "description": "A rich, spiced curry of potatoes and vegetables, served with flavorful bagara rice.",
    "image": "/images/Week4/Veg/Veg_aaloo_korma_bagara_Rice.jpg",
    "isVeg": true,
    "dayOfWeek": 0,
    "spiceLevel": 1,
    "allergens": [
      "dairy",
      "nuts"
    ],
    "nutrients": {
      "calories": "555 kcal",
      "protein": "11.1g",
      "carbs": "99g",
      "fat": "11.2g",
      "microNutrients": [
        {
          "name": "Vitamin C",
          "amount": "45mg",
          "percentage": "50%"
        },
        {
          "name": "Potassium",
          "amount": "900mg",
          "percentage": "19%"
        },
        {
          "name": "Vitamin B6",
          "amount": "0.6mg",
          "percentage": "35%"
        },
        {
          "name": "Manganese",
          "amount": "1.2mg",
          "percentage": "52%"
        },
        {
          "name": "Fiber",
          "amount": "12g",
          "percentage": "48%"
        }
      ]
    }
  },
  {
    "id": 5,
    "name": "Chicken Fried Rice",
    "week": "week3",
    "description": "Stir-fried rice with tender chicken, fresh vegetables, and savory soy sauce, perfectly seasoned for a flavorful bite.",
    "image": "/images/Week1/nonveg1/ChickenFried.jpg",
    "isVeg": false,
    "dayOfWeek": 1,
    "spiceLevel": 2,
    "allergens": [
      "eggs",
      "gluten",
      "sesame",
      "soy"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Vitamin K",
          "amount": "75mcg",
          "percentage": "63%"
        },
        {
          "name": "Vitamin C",
          "amount": "42mg",
          "percentage": "47%"
        },
        {
          "name": "Iron",
          "amount": "3.8mg",
          "percentage": "21%"
        },
        {
          "name": "Calcium",
          "amount": "200mg",
          "percentage": "20%"
        },
        {
          "name": "Fiber",
          "amount": "8g",
          "percentage": "32%"
        }
      ]
    }
  },
  {
    "id": 11,
    "name": "Veg Fried Rice",
    "week": "week3",
    "description": "Stir-fried rice with tender, fresh vegetables and savory soy sauce, perfectly seasoned for a flavorful bite.",
    "image": "/images/Week1/Veg/Veg_Fried_Rice.jpg",
    "isVeg": true,
    "dayOfWeek": 1,
    "spiceLevel": 2,
    "allergens": [
      "gluten",
      "sesame",
      "soy"
    ],
    "nutrients": {
      "calories": "555 kcal",
      "protein": "11.1g",
      "carbs": "99g",
      "fat": "11.2g",
      "microNutrients": [
        {
          "name": "Vitamin K",
          "amount": "75mcg",
          "percentage": "63%"
        },
        {
          "name": "Vitamin C",
          "amount": "42mg",
          "percentage": "47%"
        },
        {
          "name": "Iron",
          "amount": "3.8mg",
          "percentage": "21%"
        },
        {
          "name": "Calcium",
          "amount": "200mg",
          "percentage": "20%"
        },
        {
          "name": "Fiber",
          "amount": "8g",
          "percentage": "32%"
        }
      ]
    }
  },
  {
    "id": 26,
    "name": "Aaloo Kheema w/ Naan",
    "week": "week3",
    "description": "Spiced minced meat cooked with potatoes, served with soft, tandoor naan.",
    "image": "/images/Week3/NonVeg/Aaloo_keema.jpg",
    "isVeg": false,
    "dayOfWeek": 2,
    "spiceLevel": 2,
    "allergens": [
      "gluten",
      "dairy"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "5.2mg",
          "percentage": "29%"
        },
        {
          "name": "Zinc",
          "amount": "7.5mg",
          "percentage": "68%"
        },
        {
          "name": "Vitamin B6",
          "amount": "0.8mg",
          "percentage": "47%"
        },
        {
          "name": "Potassium",
          "amount": "850mg",
          "percentage": "18%"
        },
        {
          "name": "Fiber",
          "amount": "6g",
          "percentage": "24%"
        }
      ]
    }
  },
  {
    "id": 32,
    "name": "Paneer Tikka & Dal w/ Roti",
    "week": "week3",
    "description": "Grilled paneer tikka marinated in spices, served with flavorful lentils and soft, whole wheat roti.",
    "image": "/images/Week3/Veg/Paneer_tikka_W_Lemon_rice.jpg",
    "isVeg": true,
    "dayOfWeek": 2,
    "spiceLevel": 2,
    "allergens": [
      "gluten",
      "dairy"
    ],
    "nutrients": {
      "calories": "637.5 kcal",
      "protein": "33g",
      "carbs": "31.8g",
      "fat": "42.1g",
      "microNutrients": [
        {
          "name": "Calcium",
          "amount": "350mg",
          "percentage": "35%"
        },
        {
          "name": "Vitamin A",
          "amount": "280mcg",
          "percentage": "31%"
        },
        {
          "name": "Iron",
          "amount": "3.5mg",
          "percentage": "19%"
        },
        {
          "name": "Vitamin B12",
          "amount": "1.2mcg",
          "percentage": "50%"
        },
        {
          "name": "Fiber",
          "amount": "6g",
          "percentage": "24%"
        }
      ]
    }
  },
  {
    "id": 25,
    "name": "Malai Tikka w/ Lemon Rice",
    "week": "week3",
    "description": "Creamy, tender chicken marinated in rich spices, paired with fragrant lemon-infused rice.",
    "image": "/images/Week3/NonVeg/Malai_tikka_Lemon_Rice.jpg",
    "isVeg": false,
    "dayOfWeek": 3,
    "spiceLevel": 1,
    "allergens": [
      "dairy",
      "nuts"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Calcium",
          "amount": "180mg",
          "percentage": "18%"
        },
        {
          "name": "Vitamin D",
          "amount": "2.5mcg",
          "percentage": "13%"
        },
        {
          "name": "Vitamin B12",
          "amount": "3.2mcg",
          "percentage": "133%"
        },
        {
          "name": "Phosphorus",
          "amount": "400mg",
          "percentage": "57%"
        },
        {
          "name": "Selenium",
          "amount": "35mcg",
          "percentage": "64%"
        }
      ]
    }
  },
  {
    "id": 31,
    "name": "Paneer Lababdar w/ Lemon Rice",
    "week": "week3",
    "description": "Rich, creamy paneer curry simmered in a spiced tomato gravy, paired with fragrant lemon-infused rice.",
    "image": "/images/Week3/Veg/Paneer_lababdaar_W_Lemon_rice.jpg",
    "isVeg": true,
    "dayOfWeek": 3,
    "spiceLevel": 1,
    "allergens": [
      "dairy",
      "nuts"
    ],
    "nutrients": {
      "calories": "650 kcal",
      "protein": "26g",
      "carbs": "63.56g",
      "fat": "31.41g",
      "microNutrients": [
        {
          "name": "Calcium",
          "amount": "300mg",
          "percentage": "30%"
        },
        {
          "name": "Vitamin A",
          "amount": "450mcg",
          "percentage": "50%"
        },
        {
          "name": "Vitamin K",
          "amount": "45mcg",
          "percentage": "38%"
        },
        {
          "name": "Phosphorus",
          "amount": "350mg",
          "percentage": "50%"
        },
        {
          "name": "Zinc",
          "amount": "3.2mg",
          "percentage": "29%"
        }
      ]
    }
  },
  {
    "id": 42,
    "name": "Spaghetti Bolognese w/ Marinara Sauce",
    "week": "week3",
    "description": "Classic spaghetti tossed in a rich, savory marinara sauce, topped with hearty Bolognese meat sauce.",
    "image": "/images/Week4/NonVeg/spaghetti_bolognese_2.jpg",
    "isVeg": false,
    "dayOfWeek": 4,
    "spiceLevel": 1,
    "allergens": [
      "gluten",
      "dairy"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Lycopene",
          "amount": "15mg",
          "percentage": "N/A"
        },
        {
          "name": "Vitamin C",
          "amount": "28mg",
          "percentage": "31%"
        },
        {
          "name": "Iron",
          "amount": "4.8mg",
          "percentage": "27%"
        },
        {
          "name": "Folate",
          "amount": "120mcg",
          "percentage": "30%"
        },
        {
          "name": "Fiber",
          "amount": "8g",
          "percentage": "32%"
        }
      ]
    }
  },
  {
    "id": 48,
    "name": "Spaghetti Pomodoro",
    "week": "week3",
    "description": "Classic Italian spaghetti tossed in a fresh tomato sauce, topped with tender grilled paneer.",
    "image": "/images/Week4/Veg/spaghetti_bolognese_3.jpg",
    "isVeg": true,
    "dayOfWeek": 4,
    "spiceLevel": 1,
    "allergens": [
      "gluten",
      "dairy"
    ],
    "nutrients": {
      "calories": "315 kcal",
      "protein": "9g",
      "carbs": "45g",
      "fat": "10.9g",
      "microNutrients": [
        {
          "name": "Vitamin C",
          "amount": "42mg",
          "percentage": "47%"
        },
        {
          "name": "Lycopene",
          "amount": "12mg",
          "percentage": "N/A"
        },
        {
          "name": "Vitamin K",
          "amount": "15mcg",
          "percentage": "13%"
        },
        {
          "name": "Folate",
          "amount": "80mcg",
          "percentage": "20%"
        },
        {
          "name": "Fiber",
          "amount": "6g",
          "percentage": "24%"
        }
      ]
    }
  },
  {
    "id": 6,
    "name": "Chicken Biryani",
    "week": "week3",
    "description": "A fragrant and flavorful rice dish layered with tender, spiced chicken, aromatic basmati rice, and a blend of traditional spices.",
    "image": "/images/Week1/nonveg1/ChickenBiryani.jpg",
    "isVeg": false,
    "dayOfWeek": 5,
    "spiceLevel": 2,
    "allergens": [
      "dairy"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.2mg",
          "percentage": "23%"
        },
        {
          "name": "Fiber",
          "amount": "10g",
          "percentage": "40%"
        },
        {
          "name": "Vitamin E",
          "amount": "8mg",
          "percentage": "53%"
        },
        {
          "name": "Magnesium",
          "amount": "140mg",
          "percentage": "33%"
        },
        {
          "name": "Zinc",
          "amount": "3mg",
          "percentage": "27%"
        }
      ]
    }
  },
  {
    "id": 54,
    "name": "Chickpea Veg Biryani",
    "week": "week3",
    "description": "A fragrant and flavorful rice dish layered with spiced vegetables, chickpeas, aromatic basmati rice, and a blend of traditional spices.",
    "image": "/images/Week4/Veg/Dormers_Paneer_veg_Biryani.jpg",
    "isVeg": true,
    "dayOfWeek": 5,
    "spiceLevel": 2,
    "allergens": [
      "dairy"
    ],
    "nutrients": {
      "calories": "600 kcal",
      "protein": "16g",
      "carbs": "92g",
      "fat": "16g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.0mg",
          "percentage": "22%"
        },
        {
          "name": "Folate",
          "amount": "180mcg",
          "percentage": "45%"
        },
        {
          "name": "Magnesium",
          "amount": "110mg",
          "percentage": "26%"
        },
        {
          "name": "Fiber",
          "amount": "11g",
          "percentage": "44%"
        }
      ]
    }
  },
  {
    "id": 18,
    "name": "Dormers' Green Kabab w/ Chutney & Flat Bread",
    "week": "week4",
    "description": "Herb-forward green kebab, pan-seared, paired with tangy chutney and delicate rumali roti.",
    "image": "/images/Week2/NonVeg/Dormer's_Kebab.jpg",
    "isVeg": false,
    "dayOfWeek": 0,
    "spiceLevel": 2,
    "allergens": [
      "gluten",
      "dairy"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.2mg",
          "percentage": "23%"
        },
        {
          "name": "Vitamin B6",
          "amount": "0.8mg",
          "percentage": "47%"
        },
        {
          "name": "Niacin",
          "amount": "10mg",
          "percentage": "63%"
        },
        {
          "name": "Zinc",
          "amount": "6.2mg",
          "percentage": "56%"
        },
        {
          "name": "Selenium",
          "amount": "35mcg",
          "percentage": "64%"
        }
      ]
    }
  },
  {
    "id": 57,
    "name": "Classic Tangy Cholay w/ Naan",
    "week": "week4",
    "description": "Tangy spiced chickpeas simmered with tamarind and spices, served with warm buttered naan.",
    "image": "/images/Week3/Veg/Rajma_aaloo.jpg",
    "isVeg": true,
    "dayOfWeek": 0,
    "spiceLevel": 2,
    "allergens": [
      "gluten",
      "dairy"
    ],
    "nutrients": {
      "calories": "560 kcal",
      "protein": "18g",
      "carbs": "84g",
      "fat": "15g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.6mg",
          "percentage": "26%"
        },
        {
          "name": "Folate",
          "amount": "200mcg",
          "percentage": "50%"
        },
        {
          "name": "Magnesium",
          "amount": "120mg",
          "percentage": "29%"
        },
        {
          "name": "Fiber",
          "amount": "13g",
          "percentage": "52%"
        }
      ]
    }
  },
  {
    "id": 3,
    "name": "Peri-Peri Chicken w/ Jolof Rice",
    "week": "week4",
    "description": "Tangy Peri Peri chicken served alongside flavorful, spicy West African tomato-infused rice.",
    "image": "/images/Week1/nonveg1/PeriPeri.jpg",
    "isVeg": false,
    "dayOfWeek": 1,
    "spiceLevel": 3,
    "allergens": [],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Vitamin D",
          "amount": "8mcg",
          "percentage": "40%"
        },
        {
          "name": "Iron",
          "amount": "2.8mg",
          "percentage": "16%"
        },
        {
          "name": "Zinc",
          "amount": "3.2mg",
          "percentage": "29%"
        },
        {
          "name": "Selenium",
          "amount": "28mcg",
          "percentage": "51%"
        },
        {
          "name": "Fiber",
          "amount": "4g",
          "percentage": "16%"
        }
      ]
    }
  },
  {
    "id": 9,
    "name": "Jolof Rice w/ Grilled Veggies",
    "week": "week4",
    "description": "Perfectly char grilled Veggies served alongside flavorful, spicy West African tomato-infused rice.",
    "image": "/images/Week1/Veg/Jolof_rice_grill_veggies_2.jpg",
    "isVeg": true,
    "dayOfWeek": 1,
    "spiceLevel": 2,
    "allergens": [],
    "nutrients": {
      "calories": "555 kcal",
      "protein": "11.1g",
      "carbs": "99g",
      "fat": "11.2g",
      "microNutrients": [
        {
          "name": "Vitamin A",
          "amount": "450mcg",
          "percentage": "50%"
        },
        {
          "name": "Vitamin C",
          "amount": "45mg",
          "percentage": "50%"
        },
        {
          "name": "Iron",
          "amount": "2.8mg",
          "percentage": "16%"
        },
        {
          "name": "Calcium",
          "amount": "150mg",
          "percentage": "15%"
        },
        {
          "name": "Fiber",
          "amount": "8g",
          "percentage": "32%"
        }
      ]
    }
  },
  {
    "id": 29,
    "name": "Moroccan Chicken Tagine w/ Indian Bread",
    "week": "week4",
    "description": "Aromatic chicken slow cooked with spices and vegetables, served with fluffy Indian bread.",
    "image": "/images/Week3/NonVeg/Moroccan_chicken.jpg",
    "isVeg": false,
    "dayOfWeek": 2,
    "spiceLevel": 2,
    "allergens": [
      "gluten"
    ],
    "nutrients": {
      "calories": "673.5 kcal",
      "protein": "57.9g",
      "carbs": "69g",
      "fat": "16g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.8mg",
          "percentage": "27%"
        },
        {
          "name": "Vitamin A",
          "amount": "450mcg",
          "percentage": "50%"
        },
        {
          "name": "Vitamin E",
          "amount": "6mg",
          "percentage": "40%"
        },
        {
          "name": "Magnesium",
          "amount": "140mg",
          "percentage": "33%"
        },
        {
          "name": "Fiber",
          "amount": "8g",
          "percentage": "32%"
        }
      ]
    }
  },
  {
    "id": 43,
    "name": "Pav Bhaji",
    "week": "week4",
    "description": "A spicy, mashed vegetable curry served with buttered, soft buns for a comforting street food experience.",
    "image": "/images/Week4/Veg/Pav_Bhaji.jpg",
    "isVeg": true,
    "dayOfWeek": 2,
    "spiceLevel": 2,
    "allergens": [
      "gluten",
      "dairy"
    ],
    "nutrients": {
      "calories": "315 kcal",
      "protein": "9g",
      "carbs": "45g",
      "fat": "10.9g",
      "microNutrients": [
        {
          "name": "Vitamin C",
          "amount": "42mg",
          "percentage": "47%"
        },
        {
          "name": "Vitamin A",
          "amount": "450mcg",
          "percentage": "50%"
        },
        {
          "name": "Iron",
          "amount": "3.5mg",
          "percentage": "19%"
        },
        {
          "name": "Calcium",
          "amount": "120mg",
          "percentage": "12%"
        },
        {
          "name": "Fiber",
          "amount": "8g",
          "percentage": "32%"
        }
      ]
    }
  },
  {
    "id": 41,
    "name": "Veg Biryani w/ Dormers' Chicken",
    "week": "week4",
    "description": "Aromatic vegetable biryani paired with Dormers' tender, spiced grilled chicken.",
    "image": "/images/Week4/NonVeg/Dormer_Chicken_Veg_Biryani.jpg",
    "isVeg": false,
    "dayOfWeek": 3,
    "spiceLevel": 2,
    "allergens": [
      "dairy",
      "nuts"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.2mg",
          "percentage": "23%"
        },
        {
          "name": "Vitamin A",
          "amount": "380mcg",
          "percentage": "42%"
        },
        {
          "name": "Vitamin C",
          "amount": "12mg",
          "percentage": "13%"
        },
        {
          "name": "Calcium",
          "amount": "120mg",
          "percentage": "12%"
        },
        {
          "name": "Fiber",
          "amount": "8g",
          "percentage": "32%"
        }
      ]
    }
  },
  {
    "id": 47,
    "name": "Veg Biryani w/ Dormers' Paneer",
    "week": "week4",
    "description": "Aromatic basmati rice cooked with mixed vegetables, served with tangy, Dormers' paneer curry.",
    "image": "/images/Week4/Veg/Dormers_Paneer_veg_Biryani.jpg",
    "isVeg": true,
    "dayOfWeek": 3,
    "spiceLevel": 2,
    "allergens": [
      "dairy"
    ],
    "nutrients": {
      "calories": "650 kcal",
      "protein": "26g",
      "carbs": "63.56g",
      "fat": "31.41g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.2mg",
          "percentage": "23%"
        },
        {
          "name": "Calcium",
          "amount": "300mg",
          "percentage": "30%"
        },
        {
          "name": "Vitamin A",
          "amount": "450mcg",
          "percentage": "50%"
        },
        {
          "name": "Fiber",
          "amount": "8g",
          "percentage": "32%"
        },
        {
          "name": "Folate",
          "amount": "220mcg",
          "percentage": "55%"
        }
      ]
    }
  },
  {
    "id": 38,
    "name": "Dormers' Style Halal Guys Bowl",
    "week": "week4",
    "description": "Juicy grilled chicken served with rice, lettuce, and Dormers' signature white sauce and hot sauce.",
    "image": "/images/Week4/NonVeg/Dormers_Halal_guys_Bowl_correct3.jpg",
    "isVeg": false,
    "dayOfWeek": 4,
    "spiceLevel": 2,
    "allergens": [
      "dairy",
      "eggs",
      "sesame"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Vitamin K",
          "amount": "75mcg",
          "percentage": "63%"
        },
        {
          "name": "Vitamin C",
          "amount": "28mg",
          "percentage": "31%"
        },
        {
          "name": "Folate",
          "amount": "165mcg",
          "percentage": "41%"
        },
        {
          "name": "Iron",
          "amount": "4.2mg",
          "percentage": "23%"
        },
        {
          "name": "Fiber",
          "amount": "8g",
          "percentage": "32%"
        }
      ]
    }
  },
  {
    "id": 35,
    "name": "Rajma Aaloo w/ Roti",
    "week": "week4",
    "description": "Hearty red kidney beans and potatoes cooked in a spiced tomato gravy, served with soft roti.",
    "image": "/images/Week3/Veg/Rajma_aaloo.jpg",
    "isVeg": true,
    "dayOfWeek": 4,
    "spiceLevel": 2,
    "allergens": [
      "dairy",
      "gluten"
    ],
    "nutrients": {
      "calories": "430.5 kcal",
      "protein": "19.5g",
      "carbs": "64.5g",
      "fat": "11.35g",
      "microNutrients": [
        {
          "name": "Iron",
          "amount": "4.8mg",
          "percentage": "27%"
        },
        {
          "name": "Folate",
          "amount": "230mcg",
          "percentage": "58%"
        },
        {
          "name": "Magnesium",
          "amount": "140mg",
          "percentage": "33%"
        },
        {
          "name": "Potassium",
          "amount": "850mg",
          "percentage": "18%"
        },
        {
          "name": "Fiber",
          "amount": "16g",
          "percentage": "64%"
        }
      ]
    }
  },
  {
    "id": 37,
    "name": "Thai Chicken Curry w/ Coconut Rice",
    "week": "week4",
    "description": "Tangy asian curry slow-cooked with tender chicken, served with flaky coconut rice for a rich and hearty food bowl.",
    "image": "/images/Week4/NonVeg/Thai_chicken_curry_w_cocnut_rice.jpg",
    "isVeg": false,
    "dayOfWeek": 5,
    "spiceLevel": 2,
    "allergens": [
      "dairy",
      "fish",
      "gluten",
      "soy"
    ],
    "nutrients": {
      "calories": "727.5 kcal",
      "protein": "54.6g",
      "carbs": "84g",
      "fat": "16.3g",
      "microNutrients": [
        {
          "name": "Vitamin C",
          "amount": "45mg",
          "percentage": "50%"
        },
        {
          "name": "Vitamin A",
          "amount": "450mcg",
          "percentage": "50%"
        },
        {
          "name": "Iron",
          "amount": "3.5mg",
          "percentage": "19%"
        },
        {
          "name": "Calcium",
          "amount": "120mg",
          "percentage": "12%"
        },
        {
          "name": "Fiber",
          "amount": "6g",
          "percentage": "24%"
        }
      ]
    }
  },
  {
    "id": 34,
    "name": "Kadhai Paneer w/ Cumin Rice",
    "week": "week4",
    "description": "Stir-fried paneer and bell peppers cooked in a flavorful, spiced gravy, served with cumin-infused rice.",
    "image": "/images/Week3/Veg/Kadhai_Paneer_w_Rice.jpg",
    "isVeg": true,
    "dayOfWeek": 5,
    "spiceLevel": 2,
    "allergens": [
      "dairy",
      "nuts"
    ],
    "nutrients": {
      "calories": "650 kcal",
      "protein": "26g",
      "carbs": "63.56g",
      "fat": "31.41g",
      "microNutrients": [
        {
          "name": "Vitamin C",
          "amount": "120mg",
          "percentage": "133%"
        },
        {
          "name": "Vitamin A",
          "amount": "450mcg",
          "percentage": "50%"
        },
        {
          "name": "Calcium",
          "amount": "300mg",
          "percentage": "30%"
        },
        {
          "name": "Iron",
          "amount": "4.2mg",
          "percentage": "23%"
        },
        {
          "name": "Fiber",
          "amount": "8g",
          "percentage": "32%"
        }
      ]
    }
  }
]
