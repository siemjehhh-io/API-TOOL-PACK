# Implementation Guide: UI/UX Design System

## Quick Start

### 1. Spacing Scale Reference

Use these values consistently throughout the application:

```
xs:  4px   (0.25rem)  - Minimal spacing, icon gaps
sm:  8px   (0.5rem)   - Tight spacing, small components
md:  16px  (1rem)     - Standard spacing, most elements
lg:  24px  (1.5rem)   - Generous spacing, section separation
xl:  32px  (2rem)     - Large spacing, major sections
xxl: 48px  (3rem)     - Extra large, page-level spacing
```

### 2. Container Padding Quick Reference

```
Page Container:     px-6 py-10
Section Container:  px-lg py-lg (24px)
Card Container:     px-md py-md (16px)
Control Panel:      px-md py-sm (16px / 8px)
```

### 3. Common Tailwind Classes

```
Padding:
  px-4 py-6    → 16px horizontal, 24px vertical
  px-6 py-10   → 24px horizontal, 40px vertical
  px-lg py-lg  → 24px all sides
  px-md py-md  → 16px all sides

Gap:
  gap-sm       → 8px
  gap-md       → 16px
  gap-lg       → 24px

Border Radius:
  rounded-lg   → 12px
  rounded-xl   → 16px
  rounded-2xl  → 20px

Shadow:
  shadow-sm    → Small shadow
  shadow-md    → Medium shadow
  shadow-lg    → Large shadow
```

## Component Implementation Examples

### Example 1: Section Container

```tsx
// ✅ CORRECT - Using design system
<section className="px-lg py-lg rounded-2xl glass border border-white/10 gap-lg flex flex-col">
  {/* Content */}
</section>

// ❌ WRONG - Not using design system
<section className="p-2 rounded-md bg-gray-800 gap-1 flex flex-col">
  {/* Content */}
</section>
```

### Example 2: Card Component

```tsx
// ✅ CORRECT - Using design system
<div className="px-lg py-lg rounded-xl bg-white/5 border border-white/10 shadow-sm">
  <div className="px-md py-md gap-md flex flex-col">
    {/* Card content */}
  </div>
</div>

// ❌ WRONG - Inconsistent spacing
<div className="p-3 rounded-md bg-white/5 border border-white/10">
  <div className="p-2 gap-1 flex flex-col">
    {/* Card content */}
  </div>
</div>
```

### Example 3: Button Group

```tsx
// ✅ CORRECT - Using design system
<div className="flex items-center gap-md">
  <button className="h-10 px-4 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white">
    Action
  </button>
  <button className="h-10 px-4 py-2.5 rounded-xl text-sm font-semibold border border-white/10 text-white/50">
    Cancel
  </button>
</div>

// ❌ WRONG - Inconsistent button sizing
<div className="flex items-center gap-2">
  <button className="px-3 py-1 rounded-md text-xs bg-violet-600">
    Action
  </button>
  <button className="px-2 py-1 rounded-md text-xs border border-white/10">
    Cancel
  </button>
</div>
```

### Example 4: Input Field with Label

```tsx
// ✅ CORRECT - Using design system
<div className="flex flex-col gap-sm">
  <label className="text-xs font-medium text-white/90">
    Label Text
  </label>
  <input
    type="text"
    className="h-10 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/25 focus:ring-1 focus:ring-violet-400/50 focus:border-violet-400/40 transition-all"
    placeholder="Enter value"
  />
</div>

// ❌ WRONG - Inconsistent spacing
<div className="flex flex-col gap-1">
  <label className="text-sm text-white">
    Label Text
  </label>
  <input
    type="text"
    className="px-2 py-1 rounded-md bg-gray-800 border border-gray-600 text-sm"
    placeholder="Enter value"
  />
</div>
```

### Example 5: Grid Layout

```tsx
// ✅ CORRECT - Using design system
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
  {items.map((item) => (
    <div key={item.id} className="px-lg py-lg rounded-xl bg-white/5 border border-white/10">
      {/* Card content */}
    </div>
  ))}
</div>

// ❌ WRONG - Inconsistent grid spacing
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
  {items.map((item) => (
    <div key={item.id} className="p-3 rounded-md bg-white/5">
      {/* Card content */}
    </div>
  ))}
</div>
```

### Example 6: Table

```tsx
// ✅ CORRECT - Using design system
<div className="px-lg py-lg rounded-2xl glass border border-white/10 overflow-x-auto">
  <table className="w-full">
    <thead>
      <tr className="border-b border-white/10">
        <th className="px-md py-sm text-xs font-semibold uppercase text-white/90">
          Column 1
        </th>
        <th className="px-md py-sm text-xs font-semibold uppercase text-white/90">
          Column 2
        </th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={row.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
          <td className="px-sm py-md text-sm text-white/90">
            {row.col1}
          </td>
          <td className="px-sm py-md text-sm text-white/90">
            {row.col2}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>

// ❌ WRONG - Inconsistent table spacing
<div className="p-2 rounded-md bg-white/5 overflow-x-auto">
  <table className="w-full">
    <thead>
      <tr className="border-b border-white/10">
        <th className="p-1 text-xs text-white">Column 1</th>
        <th className="p-1 text-xs text-white">Column 2</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={row.id} className="border-b border-white/10">
          <td className="p-1 text-xs">{row.col1}</td>
          <td className="p-1 text-xs">{row.col2}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

## Responsive Design Patterns

### Pattern 1: Responsive Padding

```tsx
// ✅ CORRECT - Responsive padding
<div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
  {/* Content */}
</div>

// ❌ WRONG - Fixed padding
<div className="px-6 py-10">
  {/* Content */}
</div>
```

### Pattern 2: Responsive Grid

```tsx
// ✅ CORRECT - Responsive grid
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-sm sm:gap-md lg:gap-lg">
  {items.map((item) => (
    <div key={item.id}>{/* Card */}</div>
  ))}
</div>

// ❌ WRONG - Fixed grid
<div className="grid grid-cols-3 gap-4">
  {items.map((item) => (
    <div key={item.id}>{/* Card */}</div>
  ))}
</div>
```

### Pattern 3: Responsive Font Size

```tsx
// ✅ CORRECT - Responsive font
<h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">
  Heading
</h1>

// ❌ WRONG - Fixed font
<h1 className="text-3xl font-bold">
  Heading
</h1>
```

## Common Mistakes to Avoid

### ❌ Mistake 1: Mixing Spacing Scales

```tsx
// WRONG - Mixing different spacing values
<div className="px-4 py-6 gap-3">
  <div className="px-2 py-1 gap-1">
    {/* Content */}
  </div>
</div>

// CORRECT - Using consistent scale
<div className="px-md py-lg gap-md">
  <div className="px-sm py-sm gap-sm">
    {/* Content */}
  </div>
</div>
```

### ❌ Mistake 2: Inconsistent Border Radius

```tsx
// WRONG - Different border radius values
<div className="rounded-md">
  <div className="rounded-lg">
    <div className="rounded-2xl">
      {/* Content */}
    </div>
  </div>
</div>

// CORRECT - Using consistent scale
<div className="rounded-2xl">
  <div className="rounded-xl">
    <div className="rounded-lg">
      {/* Content */}
    </div>
  </div>
</div>
```

### ❌ Mistake 3: Hardcoded Colors

```tsx
// WRONG - Hardcoded colors
<div className="bg-gray-800 border border-gray-600 text-gray-200">
  {/* Content */}
</div>

// CORRECT - Using design system colors
<div className="bg-white/5 border border-white/10 text-white/90">
  {/* Content */}
</div>
```

### ❌ Mistake 4: Inconsistent Shadow Usage

```tsx
// WRONG - Inconsistent shadows
<div className="shadow-sm">
  <div className="shadow-lg">
    <div className="shadow-md">
      {/* Content */}
    </div>
  </div>
</div>

// CORRECT - Using shadow hierarchy
<div className="shadow-lg">
  <div className="shadow-md">
    <div className="shadow-sm">
      {/* Content */}
    </div>
  </div>
</div>
```

## Tailwind Configuration

### Custom Spacing in tailwind.config.ts

```typescript
export default {
  theme: {
    extend: {
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
        'xxl': '48px',
      },
      colors: {
        'primary': 'hsl(248 80% 68%)',
        'primary-dark': 'hsl(248 50% 22%)',
        'secondary': 'hsl(238 28% 16%)',
        'success': 'hsl(175 70% 48%)',
        'warning': 'hsl(35 90% 58%)',
        'danger': 'hsl(0 65% 50%)',
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
        'md': '0 4px 6px rgba(0, 0, 0, 0.1)',
        'lg': '0 10px 15px rgba(0, 0, 0, 0.1)',
      },
      borderRadius: {
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
      },
    },
  },
}
```

## Checklist for Code Review

When reviewing code, ensure:

- [ ] All padding uses design system scale (xs, sm, md, lg, xl, xxl)
- [ ] All gaps use design system scale
- [ ] All border-radius uses design system values
- [ ] All shadows use design system values
- [ ] All colors use design system palette
- [ ] All font sizes use design system scale
- [ ] Responsive breakpoints are used correctly
- [ ] No hardcoded spacing values
- [ ] No hardcoded colors
- [ ] Container hierarchy is correct
- [ ] No visual regressions
- [ ] Accessibility standards are met

## Troubleshooting

### Issue: Spacing looks too tight

**Solution**: Increase padding by one level (md → lg)

```tsx
// Before
<div className="px-md py-md">

// After
<div className="px-lg py-lg">
```

### Issue: Spacing looks too loose

**Solution**: Decrease padding by one level (lg → md)

```tsx
// Before
<div className="px-lg py-lg">

// After
<div className="px-md py-md">
```

### Issue: Elements look misaligned

**Solution**: Check gap values and ensure they match spacing scale

```tsx
// Before
<div className="flex gap-3">

// After
<div className="flex gap-md">
```

### Issue: Border radius looks inconsistent

**Solution**: Use appropriate border-radius for container level

```tsx
// Before
<div className="rounded-md">

// After
<div className="rounded-xl">
```

### Issue: Colors don't match design

**Solution**: Use design system color values

```tsx
// Before
<div className="bg-gray-800 text-gray-200">

// After
<div className="bg-white/5 text-white/90">
```

## Resources

- Design System Document: `design.md`
- Requirements: `requirements.md`
- Tasks: `tasks.md`
- Tailwind CSS Docs: https://tailwindcss.com/docs
- Design Tokens: See `design-tokens.css`

## Support

For questions or clarifications:
1. Check this implementation guide
2. Review design system documentation
3. Look at existing component examples
4. Ask team lead or design system maintainer
