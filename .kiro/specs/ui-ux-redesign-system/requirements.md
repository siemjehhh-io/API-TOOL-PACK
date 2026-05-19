# Requirements: UI/UX Redesign System

## Feature Overview

Implementasi design system yang seragam dan profesional untuk seluruh aplikasi API Formula Tools. Sistem ini mencakup standardisasi spacing, padding, container design, layout grid, dan visual consistency di semua panel/section (GIGA PANEL TOOLS, QRIS HOKI TOOLS, GIGA SMART MUTASI TOOLS).

## Acceptance Criteria

### 1. Spacing & Padding System

**1.1 Standardized Spacing Scale**
- [ ] Aplikasi menggunakan skala spacing konsisten: xs (4px), sm (8px), md (16px), lg (24px), xl (32px), xxl (48px)
- [ ] Semua padding horizontal minimum adalah md (16px)
- [ ] Semua padding vertikal minimum adalah md (16px)
- [ ] Gap antar elemen menggunakan md (16px) sebagai standar
- [ ] Pemisahan section menggunakan lg (24px)

**1.2 Spacing Application**
- [ ] Semua container memiliki padding yang konsisten sesuai level hierarki
- [ ] Nested elements mengurangi padding satu level (md → sm)
- [ ] Tidak ada spacing yang tidak termasuk dalam skala standar
- [ ] Spacing diterapkan konsisten di semua panel

### 2. Container & Box Design

**2.1 Container Specifications**
- [ ] Border radius standar: 0.625rem (10px) untuk container normal
- [ ] Border radius besar: 0.875rem (14px) untuk container besar
- [ ] Border radius extra besar: 1.25rem (20px) untuk section besar
- [ ] Semua container memiliki border: 1px solid rgba(255, 255, 255, 0.1)
- [ ] Hover state border: rgba(255, 255, 255, 0.15)

**2.2 Container Hierarchy**
- [ ] Page Container: px-6 py-10, max-w-5xl, gap-6
- [ ] Section Container: px-lg py-lg (24px), rounded-2xl, glass effect
- [ ] Card Container: px-md py-md (16px), rounded-xl, bg-white/5
- [ ] Control Panel: px-md py-sm (16px/8px), rounded-lg, bg-white/5
- [ ] Setiap level memiliki padding yang berbeda dan konsisten

**2.3 Shadow & Depth**
- [ ] Shadow small: 0 1px 2px rgba(0,0,0,0.05)
- [ ] Shadow medium: 0 4px 6px rgba(0,0,0,0.1)
- [ ] Shadow large: 0 10px 15px rgba(0,0,0,0.1)
- [ ] Colored shadows untuk elemen aktif (violet, emerald, amber, red)
- [ ] Z-index sesuai dengan shadow depth

### 3. Layout Grid System

**3.1 Main Layout Structure**
- [ ] Header sticky dengan z-30, max-width sesuai content
- [ ] Main content max-w-5xl, centered dengan mx-auto
- [ ] Sub-tab switcher self-start alignment
- [ ] Upload zone dengan padding px-12 py-12
- [ ] Controls panel grid responsive: 1 col mobile, 2 col tablet, 3 col desktop

**3.2 Responsive Breakpoints**
- [ ] Mobile (< 640px): single column, px-4 py-6, gap-sm
- [ ] Tablet (640px - 1024px): 2 columns, px-6 py-8, gap-md
- [ ] Desktop (> 1024px): 3 columns, px-6 py-10, gap-lg
- [ ] Font sizes berkurang 1 step di mobile
- [ ] Semua layout responsive dan tidak ada horizontal scroll

**3.3 Section Separation**
- [ ] Gap antar section utama: gap-lg (24px)
- [ ] Gap antar sub-section: gap-md (16px)
- [ ] Gap antar elemen kecil: gap-sm (8px)
- [ ] Konsistensi gap di semua panel

### 4. Component Hierarchy

**4.1 Cards**
- [ ] Standard card: px-lg py-lg outer, px-md py-md inner
- [ ] Card header dengan border-bottom border-white/10
- [ ] Stat card dengan icon, label, value, subtitle
- [ ] Semua card memiliki padding konsisten

**4.2 Buttons**
- [ ] Small button: h-8, px-2.5 py-1, text-xs, gap-1.5, rounded-lg
- [ ] Medium button: h-10, px-4 py-2.5, text-sm, gap-2, rounded-xl
- [ ] Large button: h-12, px-6 py-3, text-base, gap-2.5, rounded-xl
- [ ] Default state: border-white/10, text-white/50
- [ ] Active state: bg-violet-600, shadow-md shadow-violet-500/30
- [ ] Disabled state: opacity-35, cursor-not-allowed

**4.3 Input Fields**
- [ ] Height: h-10 (40px)
- [ ] Padding: px-3 py-2 (12px / 8px)
- [ ] Border-radius: rounded-lg (12px)
- [ ] Background: bg-white/5
- [ ] Border: border-white/10
- [ ] Focus state: ring-1 ring-violet-400/50, border-violet-400/40
- [ ] Placeholder: text-white/25

**4.4 Tables**
- [ ] Header padding: px-md py-sm
- [ ] Row padding: px-md py-md
- [ ] Cell padding: px-sm py-md
- [ ] Border-bottom: border-white/10
- [ ] Hover state: bg-white/5
- [ ] Responsive: overflow-x-auto di mobile

### 5. Visual Consistency

**5.1 Color Palette**
- [ ] Primary: hsl(248 80% 68%) - Violet
- [ ] Primary Dark: hsl(248 50% 22%) - Accent
- [ ] Secondary: hsl(238 28% 16%) - Dark slate
- [ ] Success: hsl(175 70% 48%) - Teal
- [ ] Warning: hsl(35 90% 58%) - Amber
- [ ] Danger: hsl(0 65% 50%) - Red
- [ ] Background: hsl(238 35% 7%)
- [ ] Text Primary: hsl(240 25% 93%)
- [ ] Text Secondary: hsl(238 18% 52%)

**5.2 Typography**
- [ ] Font family: Inter (sans-serif)
- [ ] Display: text-3xl font-bold
- [ ] Heading 1: text-2xl font-bold
- [ ] Heading 2: text-xl font-semibold
- [ ] Body: text-sm font-normal
- [ ] Label: text-xs font-medium
- [ ] Button: text-sm font-semibold
- [ ] Line heights: tight (1.25), normal (1.5), relaxed (1.625), loose (2)

**5.3 Shadows & Depth**
- [ ] Z-index 0: background, no shadow
- [ ] Z-index 10: cards, shadow-sm
- [ ] Z-index 30: dropdowns, shadow-md
- [ ] Z-index 40: tooltips, shadow-md
- [ ] Z-index 50: modals, shadow-lg
- [ ] Colored shadows untuk elemen aktif

### 6. Application Across All Panels

**6.1 QRIS HOKI TOOLS**
- [ ] WD section menggunakan design system
- [ ] DP section menggunakan design system
- [ ] Upload zone konsisten
- [ ] Controls panel konsisten
- [ ] Stats cards konsisten
- [ ] Data table konsisten

**6.2 GIGA PANEL TOOLS**
- [ ] QRIS HOKI sub-tab menggunakan design system
- [ ] Zenpay sub-tab menggunakan design system
- [ ] Bonus sub-tab menggunakan design system
- [ ] Semua section memiliki spacing konsisten

**6.3 GIGA SMART MUTASI TOOLS**
- [ ] Tab switcher menggunakan design system
- [ ] Input form menggunakan design system
- [ ] Queue list menggunakan design system
- [ ] Action buttons menggunakan design system
- [ ] Confirm dialog menggunakan design system

**6.4 Header & Navigation**
- [ ] Logo + title spacing konsisten
- [ ] Category tabs menggunakan design system
- [ ] Sub-tab switcher menggunakan design system
- [ ] Header sticky dengan backdrop blur

### 7. Consistency & Quality

**7.1 No Visual Regressions**
- [ ] Tidak ada elemen yang terlihat "menumpuk"
- [ ] Spacing visual konsisten di semua panel
- [ ] Tidak ada padding yang terlalu rapat
- [ ] Tidak ada padding yang terlalu lebar

**7.2 Professional Appearance**
- [ ] Aplikasi terlihat modern dan profesional
- [ ] Visual hierarchy jelas dan mudah dipahami
- [ ] Spacing menciptakan "breathing room" untuk setiap elemen
- [ ] Layout terasa balanced dan harmonis

**7.3 Responsive Quality**
- [ ] Mobile layout tidak ada horizontal scroll
- [ ] Tablet layout optimal untuk ukuran layar
- [ ] Desktop layout memanfaatkan space dengan baik
- [ ] Semua breakpoint terlihat profesional

## Validation Criteria

- [ ] Semua spacing menggunakan skala standar (4px, 8px, 16px, 24px, 32px, 48px)
- [ ] Tidak ada padding/margin yang tidak termasuk dalam skala
- [ ] Semua container memiliki border-radius yang konsisten
- [ ] Semua shadow menggunakan skala standar
- [ ] Color palette diterapkan konsisten
- [ ] Typography mengikuti standar
- [ ] Responsive layout bekerja di semua breakpoint
- [ ] Tidak ada visual regression dari design sebelumnya
- [ ] Aplikasi terlihat profesional dan seragam

## Notes

- Design system ini adalah foundation untuk semua UI improvements di masa depan
- Semua developer harus mengikuti spacing scale ini untuk konsistensi
- Tailwind CSS utility classes harus digunakan untuk implementasi
- Dokumentasi design system harus diakses oleh semua tim
- Regular audit diperlukan untuk memastikan konsistensi
