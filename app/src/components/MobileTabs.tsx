"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Home" },
  { href: "/expenses", label: "Calendar" },
  { href: "/transactions", label: "Ledger" },
  { href: "/manage", label: "Accounts" },
  { href: "/trends", label: "Trends" },
];

function Icon({ name }: { name: string }) {
  const common = {
    fill: "none" as const,
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.5,
    className: "h-5 w-5",
    "aria-hidden": true as const,
  };

  switch (name) {
    case "Home":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 11 12 4l8 7" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 10.5V20h12v-9.5" />
        </svg>
      );
    case "Calendar":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        </svg>
      );
    case "Ledger":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 12h8M8 17h5M6 3h12a1 1 0 0 1 1 1v16l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Z" />
        </svg>
      );
    case "Accounts":
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M6 6h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
          <path strokeLinecap="round" d="M7 15h4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 19V10M12 19V5M19 19v-7" />
        </svg>
      );
  }
}

export default function MobileTabs() {
  const pathname = usePathname();

  return (
    <nav className="tabbar md:hidden" aria-label="Primary">
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}>
            <Icon name={link.label} />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
