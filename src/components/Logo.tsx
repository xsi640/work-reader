export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g transform="translate(12 12)">
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <path
            key={angle}
            transform={`rotate(${angle})`}
            d="M0 -1.6C2.4 -5.2 5.6 -6.4 7.3 -4.3 8.9 -2.3 7.6 .9 4.6 2.2"
          />
        ))}
      </g>
    </svg>
  );
}
