const fs = require('fs');
const file = "src/app/components/Menu.tsx";
let content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

const startIndex = lines.findIndex(l => l.includes('{/* Menu Card Content - Desktop'));
const endIndex = lines.findIndex((l, i) => i > startIndex && l.includes('`}</style>'));

if (startIndex !== -1 && endIndex !== -1) {
  const newChunk = [
  '          {/* --- NEW DESKTOP CAROUSEL UI --- */}',
  '          <div className="hidden lg:block w-full">',
  '            <DesktopMenuCarousel ',
  '              availableDishes={availableDishes as any}',
  '              selectedWeek={selectedWeek}',
  '              setSelectedWeek={setSelectedWeek}',
  '              selectedDay={selectedDay}',
  '              setSelectedDay={setSelectedDay}',
  '            />',
  '          </div>'
  ];
  
  const modified = [
    ...lines.slice(0, startIndex),
    ...newChunk,
    ...lines.slice(endIndex + 1)
  ];
  fs.writeFileSync(file, modified.join('\n'));
  console.log("Updated Menu.tsx successfully!");
} else {
  console.log("Could not find start or end index", startIndex, endIndex);
}
