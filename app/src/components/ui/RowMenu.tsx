"use client";

import { useEffect, useId, useRef, useState } from "react";

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "danger" | "default";
};

export default function RowMenu({
  items,
  label = "More actions",
}: {
  items: RowMenuItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const visible = items.filter((item) => item.label);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  if (visible.length === 0) return null;

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 196;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const estimated = visible.length * 40 + 12;
    const below = rect.bottom + 6;
    const top = below + estimated > window.innerHeight - 8 ? Math.max(8, rect.top - estimated - 6) : below;
    setPosition({ top, left });
    setOpen(true);
  };

  return (
    <div className={`row-menu${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="row-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        onClick={toggle}
      >
        <span aria-hidden="true">···</span>
      </button>
      {open && (
        <div id={menuId} role="menu" className="row-menu-panel" style={{ top: position.top, left: position.left }}>
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`row-menu-item${item.tone === "danger" ? " is-danger" : ""}`}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
