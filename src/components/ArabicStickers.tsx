import { useState } from "react";

const arabicStickers = [
  { id: "1", image: "/stickers/religious/mosque.png", name: "مسجد", category: "ديني" },
  { id: "2", image: "/stickers/religious/moon.png", name: "هلال", category: "ديني" },
  { id: "3", image: "/stickers/religious/star.png", name: "نجمة", category: "ديني" },
  { id: "4", image: "/stickers/religious/prayer.png", name: "دعاء", category: "ديني" },
  { id: "5", image: "/stickers/religious/quran.png", name: "قرآن", category: "ديني" },
  { id: "6", image: "/stickers/religious/kaaba.png", name: "كعبة", category: "ديني" },
  { id: "7", image: "/stickers/food/coffee.png", name: "قهوة", category: "طعام" },
  { id: "8", image: "/stickers/food/falafel.png", name: "فلافل", category: "طعام" },
  { id: "9", image: "/stickers/food/shawarma.png", name: "شاورما", category: "طعام" },
  { id: "10", image: "/stickers/food/dates.png", name: "تمر", category: "طعام" },
  { id: "11", image: "/stickers/nature/rose.png", name: "ورد", category: "طبيعة" },
  { id: "12", image: "/stickers/nature/palm.png", name: "نخلة", category: "طبيعة" },
  { id: "13", image: "/stickers/nature/desert.png", name: "صحراء", category: "طبيعة" },
  { id: "14", image: "/stickers/nature/camel.png", name: "جمل", category: "طبيعة" },
  { id: "15", image: "/stickers/sports/football.png", name: "كرة", category: "رياضة" },
  { id: "16", image: "/stickers/sports/trophy.png", name: "كأس", category: "رياضة" },
  { id: "17", image: "/stickers/sports/target.png", name: "هدف", category: "رياضة" },
  { id: "18", image: "/stickers/sports/medal.png", name: "ميدالية", category: "رياضة" },
  { id: "19", image: "/stickers/arts/art.png", name: "فن", category: "فنون" },
  { id: "20", image: "/stickers/arts/drawing.png", name: "رسم", category: "فنون" },
  { id: "21", image: "/stickers/arts/theater.png", name: "مسرح", category: "فنون" },
  { id: "22", image: "/stickers/arts/circus.png", name: "سيرك", category: "فنون" },
  { id: "23", image: "/stickers/vehicles/car.png", name: "سيارة", category: "مركبات" },
  { id: "24", image: "/stickers/vehicles/racing.png", name: "سباق", category: "مركبات" },
  { id: "25", image: "/stickers/vehicles/plane.png", name: "طائرة", category: "مركبات" },
  { id: "26", image: "/stickers/vehicles/ship.png", name: "سفينة", category: "مركبات" },
  { id: "27", image: "/stickers/jewelry/diamond.png", name: "ماسة", category: "مجوهرات" },
  { id: "28", image: "/stickers/jewelry/ring.png", name: "خاتم", category: "مجوهرات" },
  { id: "29", image: "/stickers/jewelry/crown.png", name: "تاج", category: "مجوهرات" },
  { id: "30", image: "/stickers/jewelry/watch.png", name: "ساعة", category: "مجوهرات" },
  { id: "31", image: "/stickers/custom/sticker1.svg", name: "ملصق مخصص 1", category: "مخصص" },
  { id: "32", image: "/stickers/custom/sticker2.svg", name: "ملصق مخصص 2", category: "مخصص" },
  { id: "33", image: "/stickers/custom/sticker3.svg", name: "ملصق مخصص 3", category: "مخصص" }
];

interface Props {
  onStickerSelect: (sticker: typeof arabicStickers[0]) => void;
  className?: string;
}

export function ArabicStickers({ onStickerSelect, className = "" }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string>("الكل");
  
  const categories = ["الكل", "ديني", "طعام", "طبيعة", "رياضة", "فنون", "مركبات", "مجوهرات", "مخصص"];
  const filteredStickers = selectedCategory === "الكل" 
    ? arabicStickers 
    : arabicStickers.filter(s => s.category === selectedCategory);

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl p-4 ${className}`}>
      <h3 className="text-lg font-bold mb-3 text-center">ملصقات عربية</h3>
      
      {/* Category Filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
        {categories.map(category => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === category
                ? "bg-primary text-primary-foreground"
                : "bg-secondary hover:bg-secondary/80"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Stickers Grid */}
      <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto">
        {filteredStickers.map(sticker => (
          <button
            key={sticker.id}
            onClick={() => onStickerSelect(sticker)}
            className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors p-1"
            title={sticker.name}
          >
            <img 
              src={sticker.image} 
              alt={sticker.name}
              className="w-full h-full object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  parent.innerHTML = `<span class="text-2xl">📷</span>`;
                }
              }}
            />
          </button>
        ))}
      </div>

      <div className="text-xs text-muted-foreground mt-2 text-center">
        {filteredStickers.length} ملصق
      </div>
    </div>
  );
}
