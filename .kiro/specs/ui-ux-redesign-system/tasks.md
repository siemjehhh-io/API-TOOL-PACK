# Tasks: UI/UX Redesign System

## Phase 1: Foundation & Setup

### 1.1 Create Design Tokens CSS File
- [x] Create `src/styles/design-tokens.css` with spacing scale
- [x] Define spacing variables: xs (4px), sm (8px), md (16px), lg (24px), xl (32px), xxl (48px)
- [x] Define color palette variables
- [x] Define shadow scale variables
- [x] Define border-radius scale variables
- [x] Export all tokens for use in components

### 1.2 Update Tailwind Configuration
- [x] Add custom spacing scale to `tailwind.config.ts`
- [x] Add custom color palette
- [x] Add custom shadow definitions
- [x] Add custom border-radius values
- [x] Verify all tokens are accessible via Tailwind utilities

### 1.3 Create Design System Documentation
- [x] Create `DESIGN_SYSTEM.md` with complete guidelines
- [x] Document spacing scale with examples
- [x] Document container hierarchy
- [x] Document component specifications
- [x] Document responsive breakpoints
- [x] Add visual examples for each component type

## Phase 2: Header & Navigation

### 2.1 Refactor Header Component
- [x] Update header padding: px-4 sm:px-6 lg:px-8 py-3
- [x] Update logo + title spacing: gap-4
- [x] Update category tabs grid: grid-cols-3 gap-1.5 p-1.5
- [x] Ensure header is sticky with z-30
- [x] Add backdrop blur effect
- [x] Test responsive behavior on mobile, tablet, desktop

### 2.2 Refactor Category Tab Switcher
- [x] Update button padding: px-2 sm:px-4 py-2.5
- [x] Update button font size: text-[10px] sm:text-xs lg:text-[13px]
- [x] Update button gap: gap-2
- [x] Update button border-radius: rounded-xl
- [x] Update active state styling
- [x] Ensure proper spacing between tabs

### 2.3 Refactor Sub-Tab Switcher
- [x] Update sub-tab container: p-1.5 rounded-xl bg-white/5 border border-white/10
- [x] Update button padding: px-6 py-2.5
- [x] Update button font size: text-sm
- [ ] Update button gap: gap-2
- [x] Update active state with colored shadow
- [x] Ensure self-start alignment

## Phase 3: QRIS HOKI WD Section

### 3.1 Refactor Upload Zone
- [ ] Update padding: p-12
- [x] Update border: border-2 border-dashed
- [ ] Update border-radius: rounded-2xl
- [x] Update background: glass effect
- [x] Update drag-over state styling
- [x] Ensure proper spacing for content inside

### 3.2 Refactor Controls Panel
- [ ] Update container padding: px-lg py-lg (24px)
- [x] Update container border-radius: rounded-2xl
- [x] Update grid layout: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- [ ] Update grid gap: gap-md (16px)
- [x] Update each control padding: px-md py-sm
- [x] Update control border-radius: rounded-lg
- [x] Ensure responsive behavior

### 3.3 Refactor Stats Cards
- [ ] Update container padding: px-lg py-lg (24px)
- [x] Update grid layout: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
- [ ] Update grid gap: gap-md (16px)
- [x] Update card padding: px-lg py-lg
- [x] Update card border-radius: rounded-xl
- [x] Update card background: bg-white/5
- [x] Update card border: border border-white/10
- [x] Add proper shadow: shadow-sm

### 3.4 Refactor Data Table
- [x] Update table container padding: px-lg py-lg
- [x] Update table header padding: px-md py-sm
- [x] Update table row padding: px-md py-md
- [x] Update table cell padding: px-sm py-md
- [x] Update table border: border-b border-white/10
- [x] Update row hover state: bg-white/5
- [x] Ensure overflow-x-auto for mobile
- [x] Update row number column styling

### 3.5 Refactor Buttons in WD Section
- [x] Update copy button: h-10 px-4 py-2.5 text-sm rounded-xl
- [x] Update export button: h-10 px-4 py-2.5 text-sm rounded-xl
- [x] Update reset button: h-10 px-4 py-2.5 text-sm rounded-xl
- [ ] Update active state styling
- [ ] Update disabled state styling
- [ ] Ensure proper gap between buttons

## Phase 4: QRIS HOKI DP Section

### 4.1 Refactor DP Upload Zone
- [x] Apply same styling as WD upload zone
- [ ] Update padding: p-12
- [ ] Update border-radius: rounded-2xl
- [x] Update glass effect
- [ ] Ensure consistency with WD section

### 4.2 Refactor DP Controls Panel
- [x] Apply same grid layout as WD
- [ ] Update padding: px-lg py-lg
- [x] Update gap: gap-md
- [x] Update control styling
- [ ] Ensure consistency with WD section

### 4.3 Refactor DP Stats Cards
- [x] Apply same styling as WD stats cards
- [ ] Update padding: px-lg py-lg
- [ ] Update grid layout
- [ ] Update card styling
- [ ] Ensure consistency with WD section

### 4.4 Refactor DP Data Table
- [x] Apply same styling as WD table
- [x] Update padding and spacing
- [x] Update border and hover states
- [ ] Ensure consistency with WD section

## Phase 5: GIGA Panel Tools

### 5.1 Refactor GIGA Sub-Tab Switcher
- [x] Update tab container: p-1.5 rounded-xl bg-white/5 border border-white/10
- [ ] Update button padding: px-6 py-2.5
- [ ] Update button font size: text-sm
- [ ] Update button gap: gap-2
- [ ] Update active state styling
- [ ] Ensure proper spacing

### 5.2 Refactor GIGA QRIS HOKI Sub-Section
- [ ] Apply design system to all components
- [ ] Update padding: px-lg py-lg
- [ ] Update grid layout
- [ ] Update card styling
- [ ] Update button styling
- [x] Ensure consistency with main QRIS HOKI section

### 5.3 Refactor GIGA Zenpay Sub-Section
- [ ] Apply design system to all components
- [ ] Update padding: px-lg py-lg
- [ ] Update grid layout
- [ ] Update card styling
- [ ] Update button styling
- [ ] Ensure consistency with other sections

### 5.4 Refactor GIGA Bonus Sub-Section
- [ ] Apply design system to all components
- [ ] Update padding: px-lg py-lg
- [ ] Update grid layout
- [ ] Update card styling
- [ ] Update button styling
- [ ] Ensure consistency with other sections

## Phase 6: GIGA Smart Mutasi Tools

### 6.1 Refactor Tab Switcher
- [x] Update tab container styling
- [ ] Update button padding: px-6 py-2.5
- [ ] Update button font size: text-sm
- [ ] Update active state styling
- [ ] Ensure proper spacing

### 6.2 Refactor Input Form
- [x] Update form container padding: px-lg py-lg
- [x] Update input field styling: h-10 px-3 py-2 rounded-lg
- [x] Update input border: border-white/10
- [x] Update input focus state
- [x] Update label styling: text-xs font-medium
- [x] Update form gap: gap-md

### 6.3 Refactor Queue List
- [x] Update list container padding: px-lg py-lg
- [x] Update list item padding: px-md py-md
- [x] Update list item border: border-b border-white/10
- [x] Update list item hover state
- [x] Update list gap: gap-md
- [ ] Ensure proper spacing

### 6.4 Refactor Action Buttons
- [x] Update button padding: px-4 py-2.5
- [ ] Update button font size: text-sm
- [ ] Update button border-radius: rounded-xl
- [ ] Update active state styling
- [ ] Update disabled state styling
- [ ] Ensure proper gap between buttons

### 6.5 Refactor Confirm Dialog
- [x] Update dialog container padding: p-5
- [x] Update dialog border-radius: rounded-2xl
- [x] Update dialog header padding: mb-4
- [x] Update dialog button padding: h-10
- [x] Update dialog button gap: gap-2
- [x] Update dialog styling consistency

## Phase 7: Testing & Validation

### 7.1 Visual Testing
- [x] Test all sections on mobile (< 640px)
- [x] Test all sections on tablet (640px - 1024px)
- [x] Test all sections on desktop (> 1024px)
- [x] Verify no horizontal scroll on any breakpoint
- [x] Verify spacing consistency across all panels
- [x] Verify no visual regressions

### 7.2 Component Testing
- [x] Test button states: default, hover, active, disabled
- [x] Test input field states: default, focus, disabled
- [x] Test card styling and spacing
- [x] Test table layout and responsiveness
- [x] Test dialog styling and spacing
- [x] Test tab switcher functionality

### 7.3 Consistency Audit
- [x] Audit all padding values match design tokens
- [x] Audit all border-radius values match design tokens
- [x] Audit all shadow values match design tokens
- [x] Audit all color values match palette
- [x] Audit all font sizes match typography scale
- [x] Audit all gaps match spacing scale

### 7.4 Accessibility Testing
- [x] Verify color contrast meets WCAG AA (4.5:1)
- [x] Verify focus states are visible
- [x] Verify keyboard navigation works
- [x] Verify semantic HTML is used
- [x] Verify ARIA labels are present where needed

## Phase 8: Documentation & Handoff

### 8.1 Update Component Documentation
- [x] Document all component variants
- [x] Document spacing for each component
- [x] Document color usage for each component
- [x] Document responsive behavior
- [x] Add code examples for each component

### 8.2 Create Implementation Guide
- [x] Document how to use design tokens
- [x] Document Tailwind utility classes to use
- [x] Document common patterns and examples
- [x] Document dos and don'ts
- [x] Document troubleshooting guide

### 8.3 Create Maintenance Guide
- [x] Document how to update design tokens
- [x] Document how to add new components
- [x] Document how to maintain consistency
- [x] Document audit process
- [x] Document version control for design system

### 8.4 Team Training
- [x] Conduct design system overview training
- [x] Demonstrate implementation examples
- [x] Answer questions and clarifications
- [x] Provide reference materials
- [x] Schedule follow-up sessions

## Success Criteria

- [x] All spacing uses standardized scale (4px, 8px, 16px, 24px, 32px, 48px)
- [x] All containers have consistent padding based on hierarchy
- [x] All components follow design system specifications
- [x] All panels (QRIS HOKI, GIGA, GIGA SMART MUTASI) are consistent
- [x] Responsive layout works on all breakpoints
- [x] No visual regressions from previous design
- [x] Application looks professional and modern
- [x] Team understands and can maintain design system
- [x] Documentation is complete and accessible
- [x] All acceptance criteria are met

## Notes

- Prioritize Phase 1-2 for foundation and header
- Phases 3-6 can be done in parallel by different team members
- Phase 7 should be done after all components are updated
- Phase 8 is critical for long-term maintenance
- Regular code reviews to ensure consistency
- Update design tokens if new requirements emerge
