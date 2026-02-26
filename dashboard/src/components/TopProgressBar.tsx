"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

interface ProgressContextValue {
  isLoading: boolean;
  startLoading: () => void;
  stopLoading: () => void;
}

const ProgressContext = createContext<ProgressContextValue>({
  isLoading: false,
  startLoading: () => {},
  stopLoading: () => {},
});

export function useProgress() {
  return useContext(ProgressContext);
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const startLoading = useCallback(() => setCount((c) => c + 1), []);
  const stopLoading = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);
  const isLoading = count > 0;

  return (
    <ProgressContext.Provider value={{ isLoading, startLoading, stopLoading }}>
      {children}
    </ProgressContext.Provider>
  );
}

export default function TopProgressBar() {
  const { isLoading } = useProgress();

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed top-0 left-0 right-0 z-[55] h-[2px] overflow-hidden lg:left-60"
        >
          <motion.div
            className="h-full rounded-r-full"
            style={{ background: "linear-gradient(90deg, #3B90FF, #1A5CDB)" }}
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{
              repeat: Infinity,
              duration: 1.2,
              ease: "easeInOut",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
