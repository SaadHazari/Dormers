import { useState, useEffect } from "react";

function useResize() {
  const [windowWidth, setWindowWidth] = useState(0); // Initialize with 0 or a fallback value

  useEffect(() => {
    // Guard for environments without 'window' (e.g., SSR)
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    handleResize(); // Set initial width on mount

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return { windowWidth };
}

export default useResize;
