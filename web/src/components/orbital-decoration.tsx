export function OrbitalDecoration() {
  return (
    <div
      className="absolute top-12 right-0 w-[300px] h-[300px] lg:w-[400px] lg:h-[400px] opacity-20 dark:opacity-30 pointer-events-none hidden lg:block"
      aria-hidden="true"
    >
      <svg viewBox="0 0 400 400" className="w-full h-full text-gray-600 dark:text-gray-300">
        <circle
          cx="200" cy="200" r="120"
          fill="none" stroke="currentColor" strokeWidth="0.5"
          className="text-accent/40"
          style={{ animation: "orbit-spin 30s linear infinite" }}
        />
        <circle
          cx="200" cy="200" r="80"
          fill="none" stroke="currentColor" strokeWidth="0.5"
          className="text-warm/30"
          style={{ animation: "orbit-spin 20s linear infinite reverse" }}
        />
        <circle
          cx="200" cy="200" r="160"
          fill="none" stroke="currentColor" strokeWidth="0.3" strokeDasharray="4 8"
          className="text-accent/20"
          style={{ animation: "orbit-spin 40s linear infinite" }}
        />
        <circle
          cx="320" cy="200" r="3"
          className="fill-accent/60"
          style={{ animation: "dot-pulse 3s ease-in-out infinite" }}
        />
        <circle
          cx="200" cy="120" r="2.5"
          className="fill-warm/50"
          style={{ animation: "dot-pulse 3s ease-in-out infinite 1s" }}
        />
        <circle
          cx="120" cy="260" r="2"
          className="fill-accent/40"
          style={{ animation: "dot-pulse 3s ease-in-out infinite 2s" }}
        />
      </svg>
    </div>
  );
}
