export function FieldIllustration() {
  return (
    <svg
      className="h-full w-full"
      viewBox="0 0 390 520"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="390" height="520" fill="url(#fieldGrad)" />
      <ellipse cx="300" cy="90" rx="70" ry="70" fill="#E9B44C" opacity="0.35" className="animate-pulse-soft" />
      <path
        d="M0 320C60 290 120 340 180 320C240 300 300 250 390 280V520H0V320Z"
        fill="#1B4332"
        opacity="0.35"
      />
      <path
        d="M0 360C70 330 140 380 210 355C280 330 330 300 390 330V520H0V360Z"
        fill="#2D6A4F"
        opacity="0.55"
      />
      <g className="animate-leaf origin-bottom">
        <path
          d="M70 410C70 370 95 335 130 320C110 360 105 390 115 430C95 425 70 425 70 410Z"
          fill="#95D5B2"
        />
        <path
          d="M130 320C150 345 155 385 145 430"
          stroke="#1B4332"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <g className="animate-leaf origin-bottom" style={{ animationDelay: "0.8s" }}>
        <path
          d="M210 395C215 350 250 315 295 305C265 350 255 385 260 430C240 422 212 415 210 395Z"
          fill="#74C69D"
        />
        <path
          d="M295 305C300 345 290 390 275 430"
          stroke="#1B4332"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <g className="animate-leaf origin-bottom" style={{ animationDelay: "1.4s" }}>
        <path
          d="M320 420C335 380 365 355 390 350V450C360 445 330 440 320 420Z"
          fill="#40916C"
        />
      </g>
      <defs>
        <linearGradient id="fieldGrad" x1="0" y1="0" x2="390" y2="520" gradientUnits="userSpaceOnUse">
          <stop stopColor="#74C69D" />
          <stop offset="0.45" stopColor="#2D6A4F" />
          <stop offset="1" stopColor="#1B4332" />
        </linearGradient>
      </defs>
    </svg>
  );
}
