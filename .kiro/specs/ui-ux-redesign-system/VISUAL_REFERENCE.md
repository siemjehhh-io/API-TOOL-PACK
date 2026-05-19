# Visual Reference: UI/UX Design System

## Spacing Scale Visualization

### Spacing Values

```
┌─────────────────────────────────────────────────────────────┐
│ xs (4px)   ▌                                                │
│ sm (8px)   ▌▌                                               │
│ md (16px)  ▌▌▌▌                                             │
│ lg (24px)  ▌▌▌▌▌▌                                           │
│ xl (32px)  ▌▌▌▌▌▌▌▌                                         │
│ xxl (48px) ▌▌▌▌▌▌▌▌▌▌▌▌                                     │
└─────────────────────────────────────────────────────────────┘
```

## Container Hierarchy

### Level 1: Page Container

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  px-6 py-10 (24px / 40px)                                  │
│  max-w-5xl mx-auto                                         │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                                                       │ │
│  │  Content Area                                         │ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Level 2: Section Container

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  px-lg py-lg (24px)                                        │
│  rounded-2xl (20px)                                        │
│  glass effect                                              │
│  border border-white/10                                    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                                                       │ │
│  │  Section Content                                      │ │
│  │  gap-lg (24px)                                        │ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Level 3: Card Container

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  px-lg py-lg (24px)                                        │
│  rounded-xl (16px)                                         │
│  bg-white/5                                                │
│  border border-white/10                                    │
│  shadow-sm                                                 │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                                                       │ │
│  │  px-md py-md (16px)                                   │ │
│  │  gap-md (16px)                                        │ │
│  │                                                       │ │
│  │  Card Content                                         │ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Level 4: Control Panel

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  px-md py-sm (16px / 8px)                                  │
│  rounded-lg (12px)                                         │
│  bg-white/5                                                │
│  border border-white/10                                    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ Control Element                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Button Sizes

### Small Button (xs)

```
┌──────────────────────────┐
│  h-8 (32px)              │
│  px-2.5 py-1 (10px/4px)  │
│  text-xs                 │
│  gap-1.5 (6px)           │
│  rounded-lg (12px)       │
│                          │
│  🔘 Small Button         │
│                          │
└──────────────────────────┘
```

### Medium Button (sm)

```
┌──────────────────────────┐
│  h-10 (40px)             │
│  px-4 py-2.5 (16px/10px) │
│  text-sm                 │
│  gap-2 (8px)             │
│  rounded-xl (16px)       │
│                          │
│  🔘 Medium Button        │
│                          │
└──────────────────────────┘
```

### Large Button (md)

```
┌──────────────────────────┐
│  h-12 (48px)             │
│  px-6 py-3 (24px/12px)   │
│  text-base               │
│  gap-2.5 (10px)          │
│  rounded-xl (16px)       │
│                          │
│  🔘 Large Button         │
│                          │
└──────────────────────────┘
```

## Button States

### Default State

```
┌──────────────────────────┐
│ border-white/10          │
│ text-white/50            │
│ hover:bg-white/5         │
│ hover:border-white/20    │
│ hover:text-white/80      │
│                          │
│  Default Button          │
│                          │
└──────────────────────────┘
```

### Active State

```
┌──────────────────────────┐
│ bg-violet-600            │
│ border-violet-500        │
│ text-white               │
│ shadow-md                │
│ shadow-violet-500/30     │
│                          │
│  Active Button           │
│                          │
└──────────────────────────┘
```

### Disabled State

```
┌──────────────────────────┐
│ opacity-35               │
│ cursor-not-allowed       │
│                          │
│  Disabled Button         │
│                          │
└──────────────────────────┘
```

## Input Field

```
┌──────────────────────────────────────────┐
│ Label (text-xs font-medium)              │
│ mb-sm (8px)                              │
│                                          │
│ ┌────────────────────────────────────┐  │
│ │ h-10 (40px)                        │  │
│ │ px-3 py-2 (12px / 8px)             │  │
│ │ rounded-lg (12px)                  │  │
│ │ bg-white/5                         │  │
│ │ border border-white/10             │  │
│ │ text-sm                            │  │
│ │ placeholder:text-white/25          │  │
│ │ focus:ring-1 focus:ring-violet-400 │  │
│ │                                    │  │
│ │ Enter value...                     │  │
│ └────────────────────────────────────┘  │
│                                          │
│ Helper Text (optional)                   │
│ mt-xs (4px)                              │
│                                          │
└──────────────────────────────────────────┘
```

## Card Component

```
┌─────────────────────────────────────────┐
│                                         │
│  px-lg py-lg (24px)                    │
│  rounded-xl (16px)                     │
│  bg-white/5                            │
│  border border-white/10                │
│  shadow-sm                             │
│                                         │
│  ┌─────────────────────────────────┐  │
│  │ Card Header (optional)          │  │
│  │ py-sm (8px)                     │  │
│  │ border-b border-white/10        │  │
│  └─────────────────────────────────┘  │
│                                         │
│  ┌─────────────────────────────────┐  │
│  │ px-md py-md (16px)              │  │
│  │ gap-md (16px)                   │  │
│  │                                 │  │
│  │ Card Content                    │  │
│  │                                 │  │
│  └─────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

## Stat Card

```
┌─────────────────────────────────────────┐
│                                         │
│  px-lg py-lg (24px)                    │
│  rounded-xl (16px)                     │
│  bg-white/5                            │
│  border border-white/10                │
│  shadow-sm                             │
│                                         │
│  ┌─────────────────────────────────┐  │
│  │ 📊 Icon (top-right)             │  │
│  │                                 │  │
│  │ Label (text-xs)                 │  │
│  │ py-sm (8px)                     │  │
│  │                                 │  │
│  │ 1,234,567                       │  │
│  │ Value (text-2xl bold)           │  │
│  │ py-sm (8px)                     │  │
│  │                                 │  │
│  │ +12.5% from last month          │  │
│  │ Subtitle (text-xs muted)        │  │
│  │ py-sm (8px)                     │  │
│  │                                 │  │
│  └─────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

## Table Layout

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  px-lg py-lg (24px)                                        │
│  rounded-2xl (20px)                                        │
│  glass effect                                              │
│  border border-white/10                                    │
│  overflow-x-auto                                           │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ px-md py-sm (16px / 8px)                              │ │
│  │ border-b border-white/10                              │ │
│  │ bg-white/5                                            │ │
│  │                                                       │ │
│  │ Column 1 | Column 2 | Column 3 | Column 4 | Column 5 │ │
│  │                                                       │ │
│  ├───────────────────────────────────────────────────────┤ │
│  │ px-sm py-md (8px / 16px)                              │ │
│  │ border-b border-white/10                              │ │
│  │ hover:bg-white/5 transition-colors                    │ │
│  │                                                       │ │
│  │ Row 1 Data                                            │ │
│  │                                                       │ │
│  ├───────────────────────────────────────────────────────┤ │
│  │ Row 2 Data                                            │ │
│  │                                                       │ │
│  ├───────────────────────────────────────────────────────┤ │
│  │ Row 3 Data                                            │ │
│  │                                                       │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Grid Layout (3 Columns)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3            │
│  gap-md (16px)                                             │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │              │  │              │  │              │     │
│  │   Card 1     │  │   Card 2     │  │   Card 3     │     │
│  │              │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │              │  │              │  │              │     │
│  │   Card 4     │  │   Card 5     │  │   Card 6     │     │
│  │              │  │              │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Responsive Breakpoints

### Mobile (< 640px)

```
┌─────────────────────────────────────┐
│                                     │
│  px-4 py-6 (16px / 24px)           │
│  gap-sm (8px)                      │
│  grid-cols-1                       │
│                                     │
│  ┌─────────────────────────────┐  │
│  │                             │  │
│  │  Full Width Card            │  │
│  │                             │  │
│  └─────────────────────────────┘  │
│                                     │
│  ┌─────────────────────────────┐  │
│  │                             │  │
│  │  Full Width Card            │  │
│  │                             │  │
│  └─────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

### Tablet (640px - 1024px)

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  px-6 py-8 (24px / 32px)                        │
│  gap-md (16px)                                  │
│  grid-cols-2                                    │
│                                                  │
│  ┌──────────────────┐  ┌──────────────────┐    │
│  │                  │  │                  │    │
│  │  Card 1          │  │  Card 2          │    │
│  │                  │  │                  │    │
│  └──────────────────┘  └──────────────────┘    │
│                                                  │
│  ┌──────────────────┐  ┌──────────────────┐    │
│  │                  │  │                  │    │
│  │  Card 3          │  │  Card 4          │    │
│  │                  │  │                  │    │
│  └──────────────────┘  └──────────────────┘    │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Desktop (> 1024px)

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  px-6 py-10 (24px / 40px)                                │
│  gap-lg (24px)                                           │
│  grid-cols-3                                             │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │              │  │              │  │              │   │
│  │  Card 1      │  │  Card 2      │  │  Card 3      │   │
│  │              │  │              │  │              │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │              │  │              │  │              │   │
│  │  Card 4      │  │  Card 5      │  │  Card 6      │   │
│  │              │  │              │  │              │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## Color Palette

### Primary Colors

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Primary (Violet)                                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │ hsl(248 80% 68%)                                   │ │
│  │ Used for: Active buttons, highlights, accents      │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Primary Dark (Accent)                                   │
│  ┌────────────────────────────────────────────────────┐ │
│  │ hsl(248 50% 22%)                                   │ │
│  │ Used for: Hover states, secondary accents          │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Secondary (Dark Slate)                                  │
│  ┌────────────────────────────────────────────────────┐ │
│  │ hsl(238 28% 16%)                                   │ │
│  │ Used for: Secondary backgrounds, borders           │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Status Colors

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Success (Teal)                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ hsl(175 70% 48%)                                   │ │
│  │ Used for: Success messages, positive actions       │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Warning (Amber)                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │ hsl(35 90% 58%)                                    │ │
│  │ Used for: Warning messages, caution states         │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Danger (Red)                                            │
│  ┌────────────────────────────────────────────────────┐ │
│  │ hsl(0 65% 50%)                                     │ │
│  │ Used for: Error messages, destructive actions      │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Neutral Colors

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Background (Deep Indigo)                                │
│  ┌────────────────────────────────────────────────────┐ │
│  │ hsl(238 35% 7%)                                    │ │
│  │ Used for: Page background                          │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Card (Slightly Lighter)                                 │
│  ┌────────────────────────────────────────────────────┐ │
│  │ hsl(238 30% 10%)                                   │ │
│  │ Used for: Card backgrounds                         │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Border (Light Border)                                   │
│  ┌────────────────────────────────────────────────────┐ │
│  │ hsl(238 28% 18%)                                   │ │
│  │ Used for: Borders, dividers                        │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Text Primary (Off-White)                                │
│  ┌────────────────────────────────────────────────────┐ │
│  │ hsl(240 25% 93%)                                   │ │
│  │ Used for: Primary text                             │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Text Secondary (Muted)                                  │
│  ┌────────────────────────────────────────────────────┐ │
│  │ hsl(238 18% 52%)                                   │ │
│  │ Used for: Secondary text, labels                   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Shadow Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  No Shadow (z-0)                                        │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Background elements                               │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  Shadow Small (z-10)                                    │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Cards, subtle depth                               │ │
│  │ 0 1px 2px rgba(0,0,0,0.05)                        │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  Shadow Medium (z-30/40)                                │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Dropdowns, tooltips                               │ │
│  │ 0 4px 6px rgba(0,0,0,0.1)                         │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  Shadow Large (z-50)                                    │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Modals, dialogs                                   │ │
│  │ 0 10px 15px rgba(0,0,0,0.1)                       │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Typography Scale

```
Display (text-3xl)
████████████████████████████████ 30px

Heading 1 (text-2xl)
██████████████████████████ 24px

Heading 2 (text-xl)
████████████████████ 20px

Heading 3 (text-lg)
██████████████ 18px

Body Large (text-base)
████████████ 16px

Body (text-sm)
██████████ 14px

Body Small (text-xs)
████████ 12px

Label (text-xs)
████████ 12px

Caption (text-xs)
████████ 12px
```

## Before & After Comparison

### Before (Inconsistent Spacing)

```
┌─────────────────────────────────────────┐
│ Header                                  │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │ Section 1 (p-2)                     │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ Card (p-1)                      │ │ │
│ │ │ Content (gap-1)                 │ │ │
│ │ └─────────────────────────────────┘ │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Section 2 (p-3)                     │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ Card (p-2)                      │ │ │
│ │ │ Content (gap-2)                 │ │ │
│ │ └─────────────────────────────────┘ │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘

❌ Issues:
- Inconsistent padding (p-1, p-2, p-3)
- Inconsistent gaps (gap-1, gap-2)
- Looks cramped and unprofessional
- No visual hierarchy
```

### After (Consistent Design System)

```
┌─────────────────────────────────────────┐
│ Header (px-6 py-3)                      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│                                         │
│  px-6 py-10 (Page Container)            │
│                                         │
│  ┌─────────────────────────────────┐  │
│  │                                 │  │
│  │  px-lg py-lg (Section 1)        │  │
│  │  gap-lg (24px)                  │  │
│  │                                 │  │
│  │  ┌─────────────────────────┐   │  │
│  │  │                         │   │  │
│  │  │  px-lg py-lg (Card)     │   │  │
│  │  │  gap-md (16px)          │   │  │
│  │  │                         │   │  │
│  │  │  Content                │   │  │
│  │  │                         │   │  │
│  │  └─────────────────────────┘   │  │
│  │                                 │  │
│  └─────────────────────────────────┘  │
│                                         │
│  gap-lg (24px)                         │
│                                         │
│  ┌─────────────────────────────────┐  │
│  │                                 │  │
│  │  px-lg py-lg (Section 2)        │  │
│  │  gap-lg (24px)                  │  │
│  │                                 │  │
│  │  ┌─────────────────────────┐   │  │
│  │  │                         │   │  │
│  │  │  px-lg py-lg (Card)     │   │  │
│  │  │  gap-md (16px)          │   │  │
│  │  │                         │   │  │
│  │  │  Content                │   │  │
│  │  │                         │   │  │
│  │  └─────────────────────────┘   │  │
│  │                                 │  │
│  └─────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘

✅ Benefits:
- Consistent spacing throughout
- Clear visual hierarchy
- Professional appearance
- Breathing room for content
- Scalable and maintainable
```

## Implementation Checklist

Use this checklist when implementing the design system:

```
□ Spacing
  □ All padding uses design scale (xs, sm, md, lg, xl, xxl)
  □ All gaps use design scale
  □ Container hierarchy is correct
  □ Responsive padding is applied

□ Containers
  □ Border radius matches design system
  □ Border color is correct
  □ Background color is correct
  □ Shadow is applied correctly

□ Components
  □ Button sizes are correct
  □ Button states are styled correctly
  □ Input fields have correct styling
  □ Cards have correct padding and spacing

□ Colors
  □ Primary colors are used correctly
  □ Status colors are used correctly
  □ Neutral colors are used correctly
  □ Text contrast is sufficient

□ Typography
  □ Font sizes match design scale
  □ Font weights are correct
  □ Line heights are appropriate
  □ Text colors are correct

□ Responsive
  □ Mobile layout is correct
  □ Tablet layout is correct
  □ Desktop layout is correct
  □ No horizontal scroll

□ Quality
  □ No visual regressions
  □ Looks professional
  □ Consistent across all panels
  □ Accessibility standards met
```
