import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';

interface TestimonialsBubblesProps {
  testimonialImages: string[];
}

export default function TestimonialsBubbles({ testimonialImages }: TestimonialsBubblesProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const [scrollPosition, setScrollPosition] = useState(0);

  // Auto-scroll effect when expanded
  useEffect(() => {
    if (!isExpanded || !scrollContainerRef.current) return;

    const interval = setInterval(() => {
      if (scrollContainerRef.current) {
        const { scrollHeight, clientHeight } = scrollContainerRef.current;
        const maxScroll = scrollHeight - clientHeight;

        setScrollPosition(prev => {
          const nextPosition = prev + 1;
          if (nextPosition >= maxScroll) return 0;
          return nextPosition;
        });
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isExpanded]);

  // Apply scroll position
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollPosition;
    }
  }, [scrollPosition]);

  // Reset scroll position on collapse
  useEffect(() => {
    if (!isExpanded) {
      setScrollPosition(0);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    }
  }, [isExpanded]);

  return (
    <div className="relative bg-[#031624] py-6 w-screen -mx-[calc((100vw_-_100%)/2)]">
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4 items-center cursor-pointer"
            onClick={() => setIsExpanded(true)}
          >
            {/* Chat Bubble 1 */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className={`max-w-[200px] p-4 rounded-2xl ${
                theme === 'light' ? 'bg-[#1E3A4F] text-white' : 'bg-[#EEE9DA] text-[#1E3A4F]'
              } self-start ml-8 relative animate-float`}
            >
              <p className="text-sm font-medium" style={{ fontFamily: 'Montserrat', fontWeight: 600, lineHeight: '100%' }}>
                I got my free meal today! 🎉
              </p>
              <div className={`absolute -bottom-2 left-4 w-4 h-4 transform rotate-45 ${
                theme === 'light' ? 'bg-[#1E3A4F]' : 'bg-[#EEE9DA]'
              }`} />
            </motion.div>

            {/* Chat Bubble 2 */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className={`max-w-[200px] p-4 rounded-2xl ${
                theme === 'light' ? 'bg-[#1E3A4F] text-white' : 'bg-[#EEE9DA] text-[#1E3A4F]'
              } self-end mr-8 relative animate-float`}
              style={{ animationDelay: '0.2s' }}
            >
              <p className="text-sm font-medium" style={{ fontFamily: 'Montserrat', fontWeight: 600, lineHeight: '100%' }}>
                Very good and tasty food! 😋
              </p>
              <div className={`absolute -bottom-2 right-4 w-4 h-4 transform rotate-45 ${
                theme === 'light' ? 'bg-[#1E3A4F]' : 'bg-[#EEE9DA]'
              }`} />
            </motion.div>

           {/* See more indicator – smaller circle and arrow */}
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 0.6 }}
  transition={{ delay: 0.6 }}
  className="text-center mt-4"
>
  <div
    className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center border ${
      theme === 'light' ? 'border-[#EEE9DA]' : 'border-[#EEE9DA]'
    }`}
    style={{
      lineHeight: 0, // ensures tight vertical alignment
    }}
  >
    <svg
      className="w-4 h-4 animate-bounce"
      fill="none"
      viewBox="0 0 24 24"
      stroke={theme === 'light' ? '#EEE9DA' : '#EEE9DA'}
      style={{ marginTop: '1px' }} // nudges the icon down slightly
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  </div>
</motion.div>



          </motion.div>
        ) : (
          isExpanded && (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="relative overflow-hidden"
            >
              {/* Close Button */}
              <button
                onClick={() => setIsExpanded(false)}
                className={`absolute top-4 right-4 z-10 p-2 rounded-full ${
                  theme === 'light' ? 'bg-[#1E3A4F] text-white' : 'bg-[#EEE9DA] text-[#1E3A4F]'
                } hover:opacity-80 transition-opacity`}
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Scrollable Testimonials */}
              <div
                ref={scrollContainerRef}
                className="max-h-[70vh] overflow-y-auto p-6 rounded-3xl"
                style={{ scrollBehavior: 'smooth' }}
              >
                <div className="flex flex-col gap-6">
                  {testimonialImages.map((img, i) => (
                    <motion.div
                      key={img}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
                    >
                      <div className={`max-w-[300px] rounded-2xl overflow-hidden ${
                        theme === 'light' ? 'bg-[#1E3A4F]' : 'bg-[#EEE9DA]'
                      } shadow-lg`}>
                        <Image
                          src={`/testimonials/${img}`}
                          alt={`Testimonial ${i + 1}`}
                          width={300}
                          height={300}
                          className="w-full h-auto"
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}
