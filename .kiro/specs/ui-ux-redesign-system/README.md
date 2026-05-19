# UI/UX Redesign System - Complete Specification

## Overview

Comprehensive design system untuk API Formula Tools yang mencakup standardisasi spacing, padding, container design, layout grid, dan visual consistency di semua panel/section aplikasi.

**Tujuan Utama:**
- Menghilangkan tampilan "menumpuk" dan tidak profesional
- Menciptakan spacing yang konsisten di seluruh aplikasi
- Membangun visual hierarchy yang jelas
- Memastikan responsive design yang optimal
- Menyediakan foundation untuk future UI improvements

## Document Structure

### 1. **design.md** - Technical Design Document
Dokumen teknis lengkap yang mencakup:
- Architecture dan component hierarchy
- Spacing & padding system dengan skala standar
- Container & box design specifications
- Layout grid system dengan responsive breakpoints
- Component specifications (cards, buttons, inputs, tables)
- Visual consistency (colors, typography, shadows)
- Data models dan error handling
- Testing strategy

**Gunakan untuk:** Memahami design system secara menyeluruh, referensi teknis, code review

### 2. **requirements.md** - Acceptance Criteria
Daftar lengkap acceptance criteria yang harus dipenuhi:
- Spacing & padding system requirements
- Container & box design requirements
- Layout grid system requirements
- Component hierarchy requirements
- Visual consistency requirements
- Application across all panels
- Consistency & quality requirements
- Validation criteria

**Gunakan untuk:** Memastikan semua requirement terpenuhi, testing checklist, project tracking

### 3. **tasks.md** - Implementation Tasks
Breakdown lengkap dari semua tasks yang perlu dikerjakan:
- Phase 1: Foundation & Setup
- Phase 2: Header & Navigation
- Phase 3: QRIS HOKI WD Section
- Phase 4: QRIS HOKI DP Section
- Phase 5: GIGA Panel Tools
- Phase 6: GIGA Smart Mutasi Tools
- Phase 7: Testing & Validation
- Phase 8: Documentation & Handoff

**Gunakan untuk:** Project planning, task assignment, progress tracking

### 4. **IMPLEMENTATION_GUIDE.md** - Practical Guide
Panduan praktis untuk implementasi dengan:
- Quick start reference
- Component implementation examples
- Responsive design patterns
- Common mistakes to avoid
- Tailwind configuration
- Code review checklist
- Troubleshooting guide

**Gunakan untuk:** Development, code examples, troubleshooting

### 5. **VISUAL_REFERENCE.md** - Visual Examples
Referensi visual dengan:
- Spacing scale visualization
- Container hierarchy diagrams
- Button sizes dan states
- Input field examples
- Card components
- Table layouts
- Grid layouts
- Responsive breakpoints
- Color palette
- Shadow hierarchy
- Typography scale
- Before & after comparison
- Implementation checklist

**Gunakan untuk:** Visual reference, design validation, team communication

## Quick Start

### For Developers

1. **Read:** IMPLEMENTATION_GUIDE.md (Quick Start section)
2. **Reference:** VISUAL_REFERENCE.md (Component examples)
3. **Code:** Use Tailwind classes from design system
4. **Review:** Check against Code Review Checklist

### For Designers

1. **Read:** design.md (Complete overview)
2. **Reference:** VISUAL_REFERENCE.md (All visual examples)
3. **Validate:** Check against requirements.md
4. **Communicate:** Use visual diagrams for team discussions

### For Project Managers

1. **Read:** tasks.md (All phases and tasks)
2. **Track:** Use success criteria from requirements.md
3. **Monitor:** Check Phase completion
4. **Report:** Use acceptance criteria for status updates

## Key Design Tokens

### Spacing Scale

```
xs:  4px   (0.25rem)
sm:  8px   (0.5rem)
md:  16px  (1rem)
lg:  24px  (1.5rem)
xl:  32px  (2rem)
xxl: 48px  (3rem)
```

### Container Hierarchy

```
Page Container:     px-6 py-10
Section Container:  px-lg py-lg (24px)
Card Container:     px-md py-md (16px)
Control Panel:      px-md py-sm (16px / 8px)
```

### Color Palette

```
Primary:        hsl(248 80% 68%)  - Violet
Primary Dark:   hsl(248 50% 22%)  - Accent
Secondary:      hsl(238 28% 16%)  - Dark slate
Success:        hsl(175 70% 48%)  - Teal
Warning:        hsl(35 90% 58%)   - Amber
Danger:         hsl(0 65% 50%)    - Red
Background:     hsl(238 35% 7%)   - Deep indigo
Text Primary:   hsl(240 25% 93%)  - Off-white
Text Secondary: hsl(238 18% 52%)  - Muted
```

### Border Radius

```
lg:  12px
xl:  16px
2xl: 20px
```

### Shadow Scale

```
sm: 0 1px 2px rgba(0,0,0,0.05)
md: 0 4px 6px rgba(0,0,0,0.1)
lg: 0 10px 15px rgba(0,0,0,0.1)
```

## Implementation Phases

### Phase 1: Foundation & Setup (Week 1)
- Create design tokens CSS file
- Update Tailwind configuration
- Create design system documentation

### Phase 2: Header & Navigation (Week 1)
- Refactor header component
- Refactor category tab switcher
- Refactor sub-tab switcher

### Phase 3: QRIS HOKI WD Section (Week 2)
- Refactor upload zone
- Refactor controls panel
- Refactor stats cards
- Refactor data table
- Refactor buttons

### Phase 4: QRIS HOKI DP Section (Week 2)
- Apply same styling as WD section
- Ensure consistency

### Phase 5: GIGA Panel Tools (Week 3)
- Refactor sub-tab switcher
- Refactor all sub-sections
- Ensure consistency

### Phase 6: GIGA Smart Mutasi Tools (Week 3)
- Refactor all components
- Ensure consistency

### Phase 7: Testing & Validation (Week 4)
- Visual testing on all breakpoints
- Component testing
- Consistency audit
- Accessibility testing

### Phase 8: Documentation & Handoff (Week 4)
- Update component documentation
- Create implementation guide
- Create maintenance guide
- Team training

## Success Criteria

✅ All spacing uses standardized scale
✅ All containers have consistent padding
✅ All components follow design system
✅ All panels are consistent
✅ Responsive layout works on all breakpoints
✅ No visual regressions
✅ Application looks professional
✅ Team understands design system
✅ Documentation is complete
✅ All acceptance criteria met

## Common Patterns

### Pattern 1: Section with Cards

```tsx
<section className="px-lg py-lg rounded-2xl glass border border-white/10 gap-lg flex flex-col">
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
    {items.map((item) => (
      <div key={item.id} className="px-lg py-lg rounded-xl bg-white/5 border border-white/10 shadow-sm">
        {/* Card content */}
      </div>
    ))}
  </div>
</section>
```

### Pattern 2: Form with Inputs

```tsx
<form className="px-lg py-lg rounded-2xl glass border border-white/10 gap-lg flex flex-col">
  <div className="flex flex-col gap-sm">
    <label className="text-xs font-medium">Label</label>
    <input className="h-10 px-3 py-2 rounded-lg bg-white/5 border border-white/10" />
  </div>
  <button className="h-10 px-4 py-2.5 rounded-xl bg-violet-600 text-white">
    Submit
  </button>
</form>
```

### Pattern 3: Data Table

```tsx
<div className="px-lg py-lg rounded-2xl glass border border-white/10 overflow-x-auto">
  <table className="w-full">
    <thead>
      <tr className="border-b border-white/10">
        <th className="px-md py-sm text-xs font-semibold">Column</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={row.id} className="border-b border-white/10 hover:bg-white/5">
          <td className="px-sm py-md text-sm">{row.value}</td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

## Maintenance & Updates

### Regular Audits

- Monthly: Check for spacing consistency
- Quarterly: Review color usage
- Quarterly: Validate responsive behavior
- Annually: Update design tokens if needed

### Adding New Components

1. Follow design system spacing scale
2. Use design system colors
3. Apply appropriate border-radius
4. Add shadow if needed
5. Test on all breakpoints
6. Document in component library

### Updating Design Tokens

1. Update design-tokens.css
2. Update tailwind.config.ts
3. Update design.md
4. Communicate changes to team
5. Update all affected components

## Resources

- **Tailwind CSS:** https://tailwindcss.com/docs
- **Design Tokens:** See design-tokens.css
- **Component Library:** See components/ directory
- **Figma Design:** [Link to Figma file if available]

## Support & Questions

For questions or clarifications:

1. **Check Documentation:** Review relevant document
2. **Check Examples:** Look at IMPLEMENTATION_GUIDE.md
3. **Check Visual Reference:** Review VISUAL_REFERENCE.md
4. **Ask Team:** Contact design system maintainer

## Team Responsibilities

### Developers
- Follow design system in all code
- Use Tailwind utility classes
- Test on all breakpoints
- Participate in code reviews

### Designers
- Validate designs against system
- Communicate changes clearly
- Update design documentation
- Provide visual feedback

### Project Managers
- Track implementation progress
- Ensure quality standards
- Manage timeline
- Communicate status

### QA/Testers
- Test visual consistency
- Test responsive behavior
- Test accessibility
- Report issues

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024 | Initial design system creation |

## License & Attribution

This design system is proprietary to API Formula Tools and should not be shared outside the organization without permission.

---

**Last Updated:** 2024
**Maintained By:** Design System Team
**Status:** Active
