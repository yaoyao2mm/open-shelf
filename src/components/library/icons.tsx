import type { SVGProps } from "react";

export function DiscIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="19"
      fill="none"
      viewBox="0 0 18 19"
      aria-hidden="true"
      {...props}
    >
      <circle cx="9" cy="9.5" r="8.1" stroke="currentColor" strokeWidth="1.35" />
      <circle cx="9" cy="9.5" r="2.15" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M9 1.4a8.1 8.1 0 0 1 8.1 8.1"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M3.2 4.6c1.2-1.5 2.9-2.5 4.8-2.9"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity=".5"
      />
    </svg>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      fill="none"
      viewBox="0 0 16 16"
      aria-hidden="true"
      {...props}
    >
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10.6 10.6 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
      {...props}
    >
      <path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
