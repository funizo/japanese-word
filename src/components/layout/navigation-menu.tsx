"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

const menuItems = [
  { href: "/", label: "서비스 소개", description: "주분주분 알아보기" },
  { href: "/learn", label: "단어 학습", description: "오늘의 일본어 한 조각" },
  { href: "/saved", label: "내 단어장", description: "저장한 단어 다시 보기" },
];

export function NavigationMenu({ children }: { children: ReactNode }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const pathname = usePathname();

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <div
      ref={menuRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeMenu();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={isOpen ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((open) => !open)}
        className={`inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-line hover:bg-canvas ${isOpen ? "bg-canvas text-accent" : "bg-surface"}`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div
        id={menuId}
        hidden={!isOpen}
        aria-labelledby={`${menuId}-title`}
        className="absolute top-full right-0 z-50 mt-3 w-[min(22rem,calc(100vw-2.5rem))] rounded-2xl border border-line bg-surface text-ink shadow-xl"
      >
        <span aria-hidden="true" className="absolute -top-1.5 right-4 size-3 rotate-45 border-t border-l border-line bg-surface" />
        <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
            <h2 id={`${menuId}-title`} className="text-lg font-bold">메뉴</h2>
            <button
              type="button"
              aria-label="메뉴 닫기"
              onClick={() => {
                closeMenu();
                buttonRef.current?.focus();
              }}
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xl border border-line hover:bg-canvas"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <path d="m6 6 12 12M6 18 18 6" />
              </svg>
            </button>
          </div>

          <nav
            aria-label="메인 메뉴"
            className="flex flex-col gap-2 py-4"
            onClick={(event) => {
              if (event.target instanceof Element && event.target.closest("a[href]")) closeMenu();
            }}
          >
            {menuItems.map(({ href, label, description }) => {
              const isActive = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center justify-between gap-4 rounded-xl border p-3 hover:border-accent hover:bg-canvas ${isActive ? "border-accent bg-canvas" : "border-line"}`}
                >
                  <span>
                    <span className="block font-semibold">{label}</span>
                    <span className="mt-1 block text-sm text-muted">{description}</span>
                  </span>
                  <span aria-hidden="true" className="text-xl text-accent">→</span>
                </Link>
              );
            })}
            <div className="mt-2 border-t border-line pt-3 text-sm font-medium">
              {children}
            </div>
          </nav>
          <p className="text-xs text-muted">일상에 일본어 한 조각</p>
        </div>
      </div>
    </div>
  );
}
