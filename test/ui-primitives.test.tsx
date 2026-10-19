import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Plus } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import {
  ActionButton,
  Avatar,
  CardRow,
  Chip,
  ChipButton,
  IconBox,
  Input,
  Keycap,
  SectionHeading,
  Select,
  StatusPill,
  Toggle,
  avatarFontSize,
  avatarInitial,
  cx,
  iconSizeFor,
  type ActionButtonVariant,
  type StatusTone,
} from "../web/components/ui/primitives";

type AnyProps = Record<string, unknown> & { children?: ReactNode };

function findElement(
  node: ReactNode,
  match: (element: ReactElement<AnyProps>) => boolean,
): ReactElement<AnyProps> {
  const queue: ReactNode[] = [node];
  while (queue.length) {
    const next = queue.shift();
    if (!isValidElement<AnyProps>(next)) continue;
    if (match(next)) return next;
    queue.push(...Children.toArray(next.props.children));
  }
  throw new Error("element not found");
}

type FakeKeyEvent = {
  key: string;
  defaultPrevented: boolean;
  preventDefault: () => void;
  currentTarget: { click: () => void };
};

function keyEvent(key: string, click: () => void): FakeKeyEvent {
  const event: FakeKeyEvent = {
    key,
    defaultPrevented: false,
    preventDefault: () => {
      event.defaultPrevented = true;
    },
    currentTarget: { click },
  };
  return event;
}

describe("ActionButton", () => {
  const variants: ActionButtonVariant[] = [
    "default",
    "primary",
    "danger",
    "ghost",
  ];

  it.each(variants)(
    "renders the %s variant as a clickable button with its label",
    (variant) => {
      const onClick = vi.fn();
      const element = ActionButton({
        variant,
        onClick,
        children: "Save changes",
      });
      const html = renderToStaticMarkup(element);
      expect(html).toContain("Save changes");
      expect(html).toContain(`class="ui-btn ui-btn-${variant}"`);
      expect(html).toContain('type="button"');
      expect(html).not.toContain("disabled");
      const button = findElement(element, (el) => el.type === "button");
      (button.props.onClick as () => void)();
      expect(onClick).toHaveBeenCalledOnce();
    },
  );

  it("hides the leading icon from assistive tech and keeps the label as the name", () => {
    const html = renderToStaticMarkup(
      <ActionButton icon={Plus}>Connect</ActionButton>,
    );
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toMatch(/<span>Connect<\/span>/);
  });

  it("does not use the legacy ui-button class still styled in styles.css", () => {
    expect(renderToStaticMarkup(<ActionButton>Go</ActionButton>)).not.toContain(
      "ui-button",
    );
  });
});

describe("Toggle", () => {
  it("is a native checkbox exposed as a named switch reporting its checked state", () => {
    const on = renderToStaticMarkup(
      <Toggle label="Translate captions" checked onCheckedChange={() => {}} />,
    );
    expect(on).toMatch(/<input[^>]*type="checkbox"[^>]*role="switch"/);
    expect(on).toContain('aria-label="Translate captions"');
    expect(on).toMatch(/<input[^>]*checked=""/);
    const off = renderToStaticMarkup(
      <Toggle
        label="Translate captions"
        checked={false}
        onCheckedChange={() => {}}
      />,
    );
    expect(off).not.toMatch(/<input[^>]*checked/);
  });

  it("toggles through change events and activates on Enter without blocking native Space", () => {
    let checked = false;
    const onCheckedChange = vi.fn((next: boolean) => {
      checked = next;
    });
    const input = findElement(
      Toggle({ label: "Translate", checked, onCheckedChange }),
      (el) => el.type === "input",
    );
    const onChange = input.props.onChange as (event: {
      currentTarget: { checked: boolean };
    }) => void;
    const onKeyDown = input.props.onKeyDown as (event: FakeKeyEvent) => void;
    const browserClick = () =>
      onChange({ currentTarget: { checked: !checked } });

    const enter = keyEvent("Enter", browserClick);
    onKeyDown(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);

    const space = keyEvent(" ", browserClick);
    onKeyDown(space);
    expect(space.defaultPrevented).toBe(false);
    expect(onCheckedChange).toHaveBeenCalledOnce();

    onChange({ currentTarget: { checked: false } });
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
  });

  it("leaves other keys alone and lets a caller's handler cancel activation", () => {
    const click = vi.fn();
    const onKeyDown = (
      handler?: (event: { preventDefault: () => void }) => void,
    ) =>
      findElement(
        Toggle({
          label: "Translate",
          checked: false,
          onCheckedChange: () => {},
          ...(handler ? { onKeyDown: handler } : {}),
        }),
        (el) => el.type === "input",
      ).props.onKeyDown as (event: FakeKeyEvent) => void;
    onKeyDown()(keyEvent("a", click));
    onKeyDown((event) => event.preventDefault())(keyEvent("Enter", click));
    expect(click).not.toHaveBeenCalled();
  });
});

describe("StatusPill", () => {
  const tones: StatusTone[] = ["ok", "off", "warn"];

  it.each(tones)(
    "renders the %s tone with a decorative dot and its label",
    (tone) => {
      const html = renderToStaticMarkup(
        <StatusPill tone={tone}>Connected</StatusPill>,
      );
      expect(html).toBe(
        `<span class="ui-status ui-status-${tone}"><span class="ui-status-dot" aria-hidden="true"></span>Connected</span>`,
      );
    },
  );
});

describe("Input", () => {
  it("is actually disabled, uses the disabled frame, and swaps in the lock icon", () => {
    const html = renderToStaticMarkup(
      <Input aria-label="Username" defaultValue="stephen" disabled />,
    );
    expect(html).toMatch(/<input[^>]*disabled=""/);
    expect(html).toContain("ui-input-disabled");
    expect(html).toContain("lucide-lock");
  });

  it("stays enabled by default with its leading icon and accessible name", () => {
    const html = renderToStaticMarkup(
      <Input aria-label="Search" icon={Plus} />,
    );
    expect(html).not.toContain("disabled");
    expect(html).toContain("lucide-plus");
    expect(html).toContain('aria-label="Search"');
  });

  it("offers the 40px sign-in size", () => {
    expect(
      renderToStaticMarkup(<Input aria-label="Password" size="large" />),
    ).toContain("ui-input ui-input-large");
  });
});

describe("Avatar", () => {
  it("renders the uppercase initial at 40% of the diameter", () => {
    const html = renderToStaticMarkup(
      <Avatar name="stephen" size={44} color="#4f6fa8" />,
    );
    expect(html).toContain(">S</span>");
    expect(html).toContain("font-size:18px");
    expect(html).toContain("background:#4f6fa8");
    expect(html).toContain('aria-hidden="true"');
  });

  it("can be announced by name when no visible name sits beside it", () => {
    const html = renderToStaticMarkup(<Avatar name="Ana" decorative={false} />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Ana"');
  });

  it("derives the initial from the first visible character", () => {
    expect(avatarInitial("  émile ")).toBe("É");
    expect(avatarInitial("😀 face")).toBe("😀");
    expect(avatarInitial("   ")).toBe("?");
    expect(avatarFontSize(28)).toBe(11);
  });
});

describe("other primitives", () => {
  it("renders a real select with an optional dot and decorative chevron", () => {
    const html = renderToStaticMarkup(
      <Select
        aria-label="Transcription provider"
        dotColor="#18181b"
        defaultValue="openai"
      >
        <option value="openai">OpenAI</option>
      </Select>,
    );
    expect(html).toMatch(/<select[^>]*aria-label="Transcription provider"/);
    expect(html).toContain("ui-select ui-select-has-dot");
    expect(html).toMatch(
      /<svg[^>]*lucide-chevrons-up-down[^>]*aria-hidden="true"/,
    );
  });

  it("renders chips as static labels and filter chips as pressed buttons", () => {
    expect(renderToStaticMarkup(<Chip selected>All</Chip>)).toBe(
      '<span class="ui-chip ui-chip-selected">All</span>',
    );
    const filter = renderToStaticMarkup(
      <ChipButton selected={false}>Cooking</ChipButton>,
    );
    expect(filter).toContain('aria-pressed="false"');
    expect(filter).toContain('type="button"');
  });

  it("renders keycaps as kbd elements", () => {
    expect(renderToStaticMarkup(<Keycap>⌘K</Keycap>)).toBe(
      '<kbd class="ui-keycap">⌘K</kbd>',
    );
  });

  it("sizes the icon box icon at half the box", () => {
    expect(iconSizeFor(28)).toBe(14);
    expect(iconSizeFor(30)).toBe(15);
    expect(iconSizeFor(34)).toBe(17);
    expect(iconSizeFor(44)).toBe(22);
    const html = renderToStaticMarkup(
      <IconBox icon={Plus} size={44} tone="green" />,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/<svg[^>]*width="22"/);
  });

  it("drops the divider on the last card row", () => {
    expect(renderToStaticMarkup(<CardRow title="Password" last />)).toContain(
      'class="ui-card-row ui-card-row-last"',
    );
    expect(
      renderToStaticMarkup(
        <CardRow title="Password" description="Last changed" />,
      ),
    ).toContain('<p class="ui-card-row-description">Last changed</p>');
  });

  it("renders a section heading at the requested level with its action slot", () => {
    const html = renderToStaticMarkup(
      <SectionHeading
        title="Providers"
        level={3}
        headingId="providers"
        actions={<ActionButton>Add</ActionButton>}
      />,
    );
    expect(html).toContain(
      '<h3 id="providers" class="ui-section-heading-title">Providers</h3>',
    );
    expect(html).toContain("ui-section-heading-actions");
  });

  it("joins only truthy class names", () => {
    expect(cx("a", false, undefined, null, "", "b")).toBe("a b");
  });
});
