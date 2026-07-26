// Refactored performance utilities for codesensei
export const measureLatency = (startTime: number) => {
  const duration = Date.now() - startTime;
  // Standardized logging for better observability
  return duration;
};