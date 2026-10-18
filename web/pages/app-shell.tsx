import {
  Activity,
  Inbox,
  LibraryBig,
  MessageSquare,
  Settings as SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import type { AppTab } from "../shared/types";

const appNavigation: Array<{
  tab: Exclude<AppTab, "capture">;
  label: string;
  icon: LucideIcon;
}> = [
  { tab: "inbox", label: "Inbox", icon: Inbox },
  { tab: "activity", label: "Activity", icon: Activity },
  { tab: "library", label: "Knowledge base", icon: LibraryBig },
  { tab: "ask", label: "Ask", icon: MessageSquare },
  { tab: "settings", label: "Settings", icon: SettingsIcon },
];

export function AppNavigation({
  tab,
  activeCount,
  onNavigate,
}: {
  tab: AppTab;
  activeCount: number;
  onNavigate: (nextTab: AppTab) => void;
}) {
  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {appNavigation.map(({ tab: nextTab, label, icon: Icon }) => (
        <button
          type="button"
          className={tab === nextTab ? "active" : ""}
          data-tab={nextTab}
          aria-label={label}
          aria-current={tab === nextTab ? "page" : undefined}
          onClick={() => onNavigate(nextTab)}
          key={nextTab}
        >
          <Icon className="app-nav-icon" aria-hidden="true" />
          <span className="app-nav-desktop-label">{label}</span>
          <span className="app-nav-mobile-label" aria-hidden="true">
            {nextTab === "library" ? "Knowledge" : label}
          </span>
          {nextTab === "activity" && activeCount > 0 && (
            <span className="app-nav-badge" aria-hidden="true">
              {activeCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
