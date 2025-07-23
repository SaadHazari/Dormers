import { useState, useRef, useEffect } from "react";

const CustomSelect = ({selectedWeek , setSelectedWeek}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const weeks = [
    { value: "week1", label: "Week One" },
    { value: "week2", label: "Week Two" },
    { value: "week3", label: "Week Three" },
    { value: "week4", label: "Week Four" },
  ];

  const toggleDropdown = () => setIsOpen(!isOpen);

  const handleSelect = (value) => {
    setSelectedWeek(value);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="select-wrapper relative" ref={dropdownRef}>
      <button
        className="custom-select flex items-center justify-between w-full"
        onClick={toggleDropdown}
      >
        {weeks.find((week) => week.value === selectedWeek)?.label}
        <svg
          className={`w-4 h-4 text-[#1e3a4f] transform transition-transform ${
            isOpen ? "rotate-180" : ""
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

      {isOpen && (
        <ul className="absolute z-10 w-full mt-1 bg-[#f5f2e9] rounded-lg shadow-lg overflow-hidden border border-[rgba(30,58,79,0.1)]">
          {weeks.map((week) => (
            <li
              key={week.value}
              className={`px-4 py-2 cursor-pointer hover:bg-[#e8e4d8] transition-colors ${
                selectedWeek === week.value ? "bg-[#e8e4d8]" : ""
              }`}
              onClick={() => handleSelect(week.value)}
            >
              {week.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CustomSelect;
