"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    section: "学习",
    items: [
      { label: "首页", href: "/", icon: "home", enabled: true },
      { label: "题库管理", href: "/banks", icon: "book", enabled: true },
      { label: "练习模式", href: "/practice/new", icon: "play", enabled: true },
    ],
  },
  {
    section: "进行中",
    items: [
      { label: "自适应刷题", href: "#", icon: "check", enabled: false },
      { label: "微学习", href: "/micro-learning/history", icon: "monitor", enabled: true },
      { label: "掌握报告", href: "#", icon: "chart", enabled: false },
    ],
  },
];

function NavIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    home: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9,22 9,12 15,12 15,22" />
      </svg>
    ),
    book: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
      </svg>
    ),
    play: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polygon points="10,8 16,12 10,16 10,8" />
      </svg>
    ),
    check: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
    monitor: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    chart: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  };
  return <span className="opacity-65">{icons[name]}</span>;
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[232px] flex-shrink-0 bg-white border-r border-border flex flex-col h-screen overflow-hidden">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center flex-shrink-0">
            <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
            </svg>
          </div>
          <div>
            <div className="font-display text-[14.5px] font-semibold text-foreground tracking-tight">
              PointMaster
            </div>
            <div className="text-[10px] text-text-muted uppercase tracking-widest">
              慧刷题
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-4 overflow-y-auto scrollbar-thin">
        {navItems.map((section) => (
          <div key={section.section} className="mb-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-muted px-2.5 mb-1">
              {section.section}
            </div>
            {section.items.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              if (!item.enabled) {
                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-sm text-[13px] font-medium text-text-muted/50 cursor-not-allowed"
                  >
                    <NavIcon name={item.icon} />
                    {item.label}
                  </div>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-sm text-[13px] font-medium transition-all relative ${
                    isActive
                      ? "bg-primary/15 text-primary-dark"
                      : "text-text-secondary hover:bg-background hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] bg-primary-dark rounded-r-sm" />
                  )}
                  <NavIcon name={item.icon} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center text-[12px] font-bold text-primary-dark flex-shrink-0">
            倪
          </div>
          <div>
            <div className="text-[12.5px] font-semibold text-foreground">倪镭</div>
            <div className="text-[11px] text-text-muted">连续 7 天</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
