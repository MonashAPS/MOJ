# `@moj/ui`

MOJ's component kit. Radix primitives and `cmdk` restyled onto the tokens in
[`docs/design/DESIGN.md`](../../docs/design/DESIGN.md), on Tailwind v4.

```tsx
import { Button, Panel, Table, TitleRow } from "@moj/ui";
```

Stylesheets, imported once in `apps/web/src/app/globals.css` in this order:

```css
@import "tailwindcss";
@import "@moj/ui/fonts.css";   /* Bai Jamjuree, IBM Plex Sans, JetBrains Mono */
@import "@moj/ui/tokens.css";  /* the design tokens; light and dark */
@import "@moj/ui/theme.css";   /* the Tailwind bridge: --color-*, text scale, z-scale */
@import "@moj/ui/skin.css";    /* element defaults, ratings, .label, the royal grid */
```

## The rules a page builder has to keep

1. **No native `<select>`, `<input type="checkbox">`, `<input type="radio">`,
   `<input type="date">`, `<input type="file">` or `<input type="range">`,
   anywhere.** Use `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Combobox`.
   Native `text`/`email`/`password`/`number`/`search` inputs, `<textarea>` and
   `<button>` are fine — they are styled, not replaced.
2. **No hard-coded hex, and no `z-index` literal.** Colours come from the
   `--color-*` bridge (`bg-card`, `text-muted-foreground`, `border-border`);
   layers come from `z-(--z-dialog)` and its siblings.
3. **Nothing moves on hover.** Hover changes `background-color`, `border-color`
   or `color`, and nothing else. No `transition: all`, and no bezier that is not
   one of `ease-house` / `ease-out-house` / `ease-in-house` / `ease-curtain`.
4. **Every number is `font-mono tabular-nums`** — points, scores, times, memory,
   ids, dates, ranks, ratings. Prose is `font-sans`. Nothing in between.
5. **The only uppercase text in the product is `MicroLabel` / `.label`.**
6. **Colour is never the only signal.** A verdict pill always shows its code.

## The type scale

Tailwind's scale is replaced by MOJ's, so a ported class string lands on the
right size: `text-xs` 11px (pills, micro-labels), `text-sm` 12.5px (secondary
row text), `text-base` 14px (all UI and table text), `text-md` 16px (prose),
`text-mono` 13px, `text-h3` 16, `text-h2` 20, `text-h1` 26. The one place 16px
is wanted on purpose is an input on mobile, and those write `text-[16px]
md:text-base` so iOS does not zoom on focus.

Sizes that are not on the 4px scale come from the tokens with Tailwind v4's
variable shorthand: `h-(--control-h)` 32px, `h-(--control-h-sm)` 26px,
`h-(--row-h)` 34px, `h-(--row-h-dense)` 28px. Note that `h-[--control-h]` — the
v3 spelling that appears in DESIGN.md's recipes — silently produces invalid CSS
in Tailwind v4; always use the parentheses form.

## Shared class fragments

Composed with `cn()` rather than retyped, so a control cannot invent its own
focus ring:

| Export | What it is |
| --- | --- |
| `focusRing` | the one ring: 3px royal at 45%, plus a border recolour, no offset. Also carries `aria-invalid:` |
| `focusRingInset` | the same, drawn inside, for rows and cells inside an `overflow: hidden` wrapper |
| `controlIcons` | icons in a control are never a click target and never stretch |
| `disabledAction` / `disabledField` / `disabledItem` / `disabledCmdkItem` | 50% opacity plus the right pointer treatment for each kind of thing |
| `overlayPanel` / `overlayMotion` | the popover surface and its enter/leave |
| `menuItem` | a 32px menu row |
| `microLabel` / `monoData` | the two type recipes that recur |

`cn(...)` is `clsx` + `tailwind-merge`.

## Motion

`EASE` `[.22,1,.36,1]` (the house curve), `EASE_OUT`, `EASE_IN`, `EASE_CURTAIN`,
`EASE_SMOOTH`, and `DUR_FAST` / `DUR` / `DUR_SLOW` / `DUR_CURTAIN` in seconds for
framer-motion. `stagger(i)` caps at 300ms, never linear. The CSS mirrors are
`--ease*` and `--dur*`; the Tailwind names are `ease-house`, `duration-(--dur)`.

## Components

Every component takes `className` and forwards the rest of its props to the
element or Radix primitive it wraps. Radix compositions also export their parts;
the table lists the everyday entry point first.

### Actions

| Component | Props that matter |
| --- | --- |
| `Button` | `variant`: `primary` (default) · `secondary` · `outline` · `ghost` · `danger` · `link` · `canary`. `size`: `default` 32px · `sm` 26px · `lg` 36px · `icon` · `icon-sm` · `pill`. `full` stretches it, `icon` puts a node before the label, `busy` swaps that node for a spinner and keeps the width, `asChild` renders a link instead. `buttonVariants` / `buttonClass` for anything that needs the classes alone |
| `Badge` | `variant`: `neutral` · `accent` · `primary` · `outline` · `good` · `bad` · `warn` · `run` · `ie`. `shape`: `pill` (values) · `square` (dense rows). `size`: `default` 18px · `lg`. `mono` for codes and counts |
| `VerdictPill` | `verdict` (any DMOJ code), optional `label`, `judging` for the pulse. Resolves through `verdictTone(code)`, the one resolver; nothing else may map a verdict to a colour |
| `RatingName` | `username`, `rating`, `href`, `isAdmin`. `RatingDelta` for a signed delta. `ratingClass` / `ratingTitle` for the raw values |

### Fields

| Component | Props that matter |
| --- | --- |
| `Input` | `invalid`, `icon` (renders as an input group), `trailing`, `mono` |
| `Textarea` | `invalid`, `mono` |
| `Label` | sentence case, 12.5/600. `MicroLabel` for the uppercase device (`rail`, `tight`, `onDark`) |
| `Field` | `label`, `htmlFor`, `hint`, `error`, `optional`. The uncontrolled sibling of `FormItem`, for forms that are not on react-hook-form |
| `FieldGroup` | `columns`: 1 or 2, collapsing to 1 under 640px |
| `FormFooter` | a rule, an optional `note` on the left, buttons right-aligned with the primary right-most |
| `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField` | react-hook-form. `FormControl` is the piece that wires `aria-describedby` and `aria-invalid`; every `aria-invalid:` style in the kit depends on it |
| `Select` | `options: {value,label,disabled}[]`, `value`, `onValueChange`, `placeholder`, `size`, `invalid`, `ariaLabel`. Parts: `SelectRoot`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator` |
| `Checkbox` | Radix props plus `label`, which makes the whole row the hit area |
| `RadioGroup` | Radix props plus `options: {value,label,hint,disabled}[]`; or compose `RadioGroupItem` |
| `Switch` / `Toggle` | Radix props plus `label`. Instant, reversible settings only |
| `Combobox` | `Popover` + `Command`. `options`, `value`, `onValueChange`, `searchPlaceholder`, `emptyText` |
| `MultiSelect` | the same with removable chips above the trigger: `values`, `onChange`, `max`. Backspace on an empty filter removes the last chip |
| `InputGroup` / `InputGroupInput` | a field with `leading` and `trailing` slots — the problem search box is this plus a `search` glyph and a `Kbd` |
| `Kbd` / `KbdGroup` | a key cap |

### Surfaces

| Component | Props that matter |
| --- | --- |
| `Panel` | the club's window motif: `title`, `icon`, `action`, `framed`, `bodyClassName`. This is the side box, the info box, the sample case and the batch block. `InfoBox` is the same component under the foundation's name |
| `Card` | `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`. No shadow, ever |
| `Table` | `striped` (default true), `scrollable` (default true, the framed wrapper), `dense`, `containerClassName`. Parts: `TableHeader`, `TableBody`, `TableFooter`, `TableRow` (`selected`), `TableHead` (`numeric`), `TableCell` (`numeric` → mono, tabular, right-aligned, nowrap), `TableCaption`, `EmptyRow` |
| `TwoColumn` | DMOJ's `common-content`: `side` is the sticky sidebar, stacking under 960px |
| `ContentDescription` | prose. `html` for sanitised output from `@moj/content`, or children |
| `Separator`, `ScrollArea`, `ScrollBar`, `Skeleton`, `Spinner`, `Progress` (`tone`), `Avatar` / `AvatarImage` / `AvatarFallback` | |
| `EmptyState` | `icon`, `title`, `description`, `action`. A dashed frame, a display-face title, one specific sentence and at most one action. Parts: `Empty`, `EmptyMedia`, `EmptyTitle`, `EmptyDescription`, `EmptyContent` |

### Navigation

| Component | Props that matter |
| --- | --- |
| `TitleRow` | `title`, `breadcrumb`, `tabs`, `active`, `action`, `ruler`. DMOJ's title row: h1 left, page tabs right, primary action furthest right |
| `PageTabs` | the tab strip alone. The active tab keeps DMOJ's 3px accent rule on its top edge |
| `TabBar` | the foundation's name for a title row that always carries tabs |
| `Tabs` | segmented tabs inside a panel: `panels: {key,label,icon,content}[]`. Parts: `TabsRoot`, `TabsList`, `TabsTrigger`, `TabsContent` |
| `Breadcrumb` | `items: {label,href}[]`, or compose `BreadcrumbList` / `BreadcrumbItem` / `BreadcrumbLink` / `BreadcrumbPage` / `BreadcrumbSeparator` / `BreadcrumbEllipsis` |
| `Pagination` | `page`, `totalPages`, `hrefFor(page)`. Parts: `PaginationRoot`, `PaginationContent`, `PaginationItem`, `PaginationLink`, `PaginationPrevious`, `PaginationNext`, `PaginationEllipsis`. `paginationRange(page,total,adjacent)` for the window |

### Overlays

| Component | Props that matter |
| --- | --- |
| `Dialog` / `DialogRoot` | `DialogTrigger`, `DialogContent` (`title`, `description` and `width` are conveniences; `showCloseButton`), `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose` |
| `AlertDialog` | the same shell for every irreversible action. `AlertDialogAction` is a danger button, `AlertDialogCancel` a secondary one and takes focus on open |
| `DropdownMenu` | `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` (`variant="destructive"`, `inset`), `DropdownMenuCheckboxItem`, `DropdownMenuRadioGroup` / `RadioItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuShortcut`, `DropdownMenuSub` / `SubTrigger` / `SubContent` |
| `Popover` | `PopoverTrigger`, `PopoverContent`, `PopoverAnchor` |
| `Tooltip` | `content`, `side`, `align`. Mount `TooltipProvider` once at the root; parts are `TooltipRoot` / `TooltipTrigger` / `TooltipContent`. 300ms delay, deliberately |
| `Sheet` | the mobile nav and the mobile filter panel: `SheetContent` takes `side`, plus `SheetHeader` / `SheetTitle` / `SheetDescription` / `SheetFooter` / `SheetClose` |
| `Command` | `CommandDialog` (the palette), `CommandInput` (`showEscHint`), `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator`, `CommandShortcut` |
| `ContextMenu` | staff console only. `HoverCard` for a preview on intent |
| `Accordion` / `Collapsible` | `AccordionItem`, `AccordionTrigger`, `AccordionContent` |
| `Toaster` / `toast` | `sonner`. Mount `<Toaster />` once in the root layout. Toasts are for things that happened elsewhere or asynchronously — a copy button shows an inline check, and a form error belongs on the field |
| `Alert` | a strip on the page: `variant` `info` · `success` · `warning` · `danger`, plus `AlertTitle` and `AlertDescription` |
| `ToggleButton` / `ToggleGroup` / `ToggleGroupItem` | the pressed-state button and the segmented control |

## Compatibility with the foundation's names

Every name the foundation exported still resolves, and with the same call
signature: `Button` (`variant`/`full`/`inline`/`icon`), `Input` (`invalid`,
`icon`), `Textarea`, `Field`, `Select` (`options`), `MultiSelect` (`values`,
`onChange`, `max`), `Checkbox` (`label`), `RadioGroup` (`options`), `Toggle`,
`Tooltip` (`content`), `Table` (`striped`, `scrollable`), `EmptyRow`,
`Pagination`, `paginationRange`, `Tabs` (`panels`), `TabBar`, `TitleRow`,
`Breadcrumb` (`items`), `InfoBox`, `TwoColumn`, `ContentDescription`,
`VerdictPill`, `RatingName`, `ratingClass`, `ratingTitle`, `Badge` (`accent`),
`DialogRoot` / `DialogTrigger` / `DialogContent` / `DialogClose`, `cn`.

Where shadcn's name for a primitive collided with the foundation's name for a
convenience wrapper, the convenience wrapper kept the short name and the Radix
root took the `…Root` suffix: `SelectRoot`, `TabsRoot`, `TooltipRoot`,
`BreadcrumbRoot`, `PaginationRoot`. `Toggle` is a labelled `Switch`, as it was;
shadcn's pressed-state button is `ToggleButton`.
