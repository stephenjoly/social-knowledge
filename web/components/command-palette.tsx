import { useMemo, useRef, useState } from "react";
import {
  CornerDownLeft,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { AppTab } from "../shared/types";
import { appDestinations } from "../pages/app-shell";
import { Keycap } from "./ui/primitives";
import { useDialogFocus } from "./use-dialog-focus";

type PaletteItem = {
  id: string;
  label: string;
  group: "Actions" | "Go to";
  icon: LucideIcon;
  hint?: string;
  run: () => void;
};

export function CommandPalette({
  onClose,
  onNavigate,
  onCapture,
}: {
  onClose: () => void;
  onNavigate: (tab: AppTab) => void;
  onCapture: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  useDialogFocus(ref, onClose);
  const items = useMemo<PaletteItem[]>(
    () => [
      { id: "capture", label: "Capture a post", group: "Actions", icon: Plus, run: onCapture },
      { id: "ask-action", label: "Ask your archive", group: "Actions", icon: Sparkles, run: () => onNavigate("ask") },
      ...appDestinations.map((item) => ({
        id: item.tab,
        label: item.label,
        group: "Go to" as const,
        icon: item.icon,
        hint: `G ${item.shortcut.toUpperCase()}`,
        run: () => onNavigate(item.tab),
      })),
      { id: "settings", label: "Settings", group: "Go to", icon: SettingsIcon, run: () => onNavigate("settings") },
    ],
    [onCapture, onNavigate],
  );
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? items.filter((item) => item.label.toLowerCase().includes(needle))
    : items;
  const active = Math.min(selected, Math.max(visible.length - 1, 0));
  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };
  return (
    <div className="app-palette-layer" role="presentation" onMouseDown={onClose}>
      <div
        ref={ref}
        className="app-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search or ask"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <label className="app-palette-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search destinations and actions</span>
          <input
            data-autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls="app-palette-list"
            aria-activedescendant={visible[active] ? `palette-${visible[active].id}` : undefined}
            placeholder="Search or ask…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((active + 1) % Math.max(visible.length, 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((active - 1 + visible.length) % Math.max(visible.length, 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(visible[active]);
              }
            }}
          />
          <Keycap aria-hidden="true">Esc</Keycap>
        </label>
        <ul className="app-palette-list" id="app-palette-list" role="listbox" aria-label="Results">
          {visible.length === 0 && <li className="app-palette-empty">No matching destinations</li>}
          {visible.map((item, index) => {
            const Icon = item.icon;
            const showGroup = index === 0 || visible[index - 1]!.group !== item.group;
            return (
              <li key={item.id} role="presentation">
                {showGroup && <span className="app-palette-group" aria-hidden="true">{item.group}</span>}
                <div
                  id={`palette-${item.id}`}
                  role="option"
                  aria-selected={index === active}
                  className="app-palette-option"
                  onMouseMove={() => setSelected(index)}
                  onClick={() => choose(item)}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.hint ? (
                    <span className="app-palette-hint" aria-hidden="true">
                      {item.hint.split(" ").map((key) => <Keycap key={key}>{key}</Keycap>)}
                    </span>
                  ) : index === active ? (
                    <CornerDownLeft className="app-palette-enter" size={13} aria-hidden="true" />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
