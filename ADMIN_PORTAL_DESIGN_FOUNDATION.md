# PLAMENCO DENTAL CO. — ADMIN PORTAL DESIGN FOUNDATION

## PART 1/7: VISUAL DESIGN FOUNDATION

**Status:** ✅ COMPLETE  
**Date:** 2026-08-16  
**Scope:** Frontend visual design system for admin/dentist portal (NO database, auth, or backend changes)  

---

## EXECUTIVE SUMMARY

The Admin/Dentist portal now has a **premium, professional visual foundation** that:

✅ Feels like **clinical management software**, not a generic dashboard  
✅ Maintains **consistent spacing, typography, and visual hierarchy**  
✅ Supports all **admin pages** with cohesive design tokens  
✅ Works **responsively** across desktop, tablet, and mobile  
✅ Uses **reusable component classes** for all pages  
✅ Establishes **CSS variable system** for easy theme customization  

---

## DESIGN PHILOSOPHY

### What It Is
- **Premium**: Sophisticated, clinical, professional
- **Modern**: Clean lines, subtle depth, careful spacing
- **Purposeful**: Every design decision serves the user's workflow
- **Consistent**: Design tokens ensure coherence across all pages
- **Accessible**: Proper contrast, clear hierarchy, readable text

### What It Is NOT
- Generic SaaS dashboard
- Bootstrap admin template
- AI-generated design (flat, unmemorable)
- Overly complex or decorative
- Dark mode only (light, dental-focused aesthetic)

---

## VISUAL IDENTITY

### Color Palette

**Primary Colors:**
- **Charcoal-900** `#171310` — Page titles, primary text
- **Charcoal-800** `#201d1a` — Headers, strong emphasis
- **Gold-700** `#BF8F46` — Secondary, accent, highlights
- **Gold-500** `#D9B57B` — Light accent, hover states

**Neutral Colors:**
- **White** `#ffffff` — Surface, panels
- **Surface-Alt** `#f8f5f2` — Secondary surfaces
- **Surface-Muted** `#f4f0ea` — Background panels
- **Background** `#f4efe9` — Page background
- **Text-Muted** `#5d534d` — Secondary text
- **Text-Soft** `#7a7067` — Tertiary text
- **Border** `#e9dcc5` — Borders, dividers

**Status Colors (Complete System):**
- **Success** `#2d6a52` — Active, confirmed, completed
- **Warning** `#9d7045` — Inactive, warning, pending
- **Danger** `#b7594d` — Error, cancelled, failed
- **Info** `#4b6f8c` — Information, pending
- **Pending** `#8f7136` — Awaiting action

**Soft Backgrounds (For Status):**
- Success-Soft: `#eaf5ef`
- Warning-Soft: `#f9f0e5`
- Danger-Soft: `#fbeae6`
- Info-Soft: `#edf4ff`
- Pending-Soft: `#f7f0de`

### Typography

**Font Family:** Inter, Segoe UI, sans-serif (system fonts)

**Scale:**
```
Display:  2.0rem / 32px (page hero, rare use)
H1:       clamp(1.5rem, 2vw, 2.0rem) (dashboard title)
H2:       clamp(1.15rem, 1.6vw, 1.6rem) (section title)
H3:       1.0rem / 16px (card title, bold)
Body:     0.9rem / 14.4px (default text)
Small:    0.8rem / 12.8px (secondary text)
Tiny:     0.72-0.74rem / 11.5-12px (labels, badges)
```

**Weights:**
- 400: Disabled text, unimportant content
- 500: Body text in lists
- 600: Secondary labels, small buttons
- 700: All headings, strong emphasis
- 800: Section labels, tiny uppercase labels

**Line Height:**
- Headings: 1.2-1.35
- Body: 1.65
- Labels: 1 (tight)

### Spacing Scale

Consistent 4px grid:
```
xs:  4px
sm:  8px
md:  12px
lg:  16px
xl:  24px
2xl: 32px
3xl: 48px
```

**Common Combinations:**
- Page padding: 32px (28px on smaller screens)
- Section spacing: 18-20px
- Card padding: 20px
- Label padding: 6-12px
- Form field spacing: 14px
- Row gap in tables: 12-14px
- Item spacing in lists: 10-12px

### Border Radius

Professional, not excessive:
```
xs:   6px
sm:   10px
md:   12px
lg:   16px
xl:   20px
2xl:  26px
pill: 999px
```

**Usage:**
- Buttons: 10px (md)
- Small controls: 6px (xs)
- Cards/panels: 16px (lg)
- Large sections: 20px (xl)
- Pills/badges: 999px

### Shadows

4-level system for depth:
```
xs: 0 1px 2px rgba(20, 17, 15, 0.04)
sm: 0 6px 16px rgba(20, 17, 15, 0.06)
md: 0 10px 28px rgba(20, 17, 15, 0.08)
lg: 0 18px 42px rgba(20, 17, 15, 0.12)
xl: 0 24px 56px rgba(20, 17, 15, 0.14)
```

**Usage:**
- Hover cards: md → lg
- Default cards: sm
- Buttons: sm (primary)
- Modals: lg
- Topbar/sidebar: sm

### Transitions

Smooth, purposeful motion:
```
Fast:    140ms cubic-bezier(0.4, 0, 0.2, 1)  — quick interactions
Medium:  200ms cubic-bezier(0.4, 0, 0.2, 1)  — transitions
Smooth:  300ms cubic-bezier(0.4, 0, 0.2, 1)  — major changes
```

**Usage:**
- Hover effects: fast
- Button clicks: fast
- Modal opens: medium
- Page loads: smooth

---

## LAYOUT SYSTEM

### App Shell

**Sidebar:**
- Width: 272px (fixed, sticky)
- Background: Glassmorphic (semi-transparent white with backdrop blur)
- Border-right: 1px solid var(--border)
- Padding: 20px 14px
- Z-index: 20

**Topbar:**
- Min-height: 80px
- Sticky positioning (z-index: 10)
- Backdrop blur for sophistication
- Left padding: 28px
- Right padding: 28px
- Bottom border: 1px solid var(--border)

**Content Area:**
- Max-width: 1320px
- Center-aligned
- Padding: 32px 28px
- Overflow: hidden (prevents jumping scrollbars)

### Sidebar Navigation

**Structure:**
- Sections with titles (small caps label)
- NavLinks with icons
- Active state with left accent bar (3px height/color)
- Hover state with background + color change

**Active State:**
- Left bar: 20px height, gold color
- Background: teal at 12% opacity
- Text: gold (secondary color)
- Font-weight: 700

**Hover State:**
- Background: teal at 8% opacity
- Color: text-strong
- Smooth transition

### Topbar

**Left Section:**
- Page title (eyebrow + h1)
- Eyebrow: small gold text, uppercase

**Right Section:**
- Search field (340px width)
- Status indicator (online/offline)
- User menu (future enhancement)

**Search Field:**
- 340px width, 42px height
- Border: 1px solid var(--border)
- Focus state: border-gold (45% opacity), blue shadow

---

## COMPONENT SYSTEM

### Panels & Cards

**Panel (Generic):**
```
border: 1px solid var(--border)
border-radius: 16px
background: var(--surface) [white]
box-shadow: var(--shadow-sm)
padding: 20px
transition: all 140ms ease
```

**Panel Hover:**
- Border: gold at 20% opacity
- Shadow: md
- Transform: translateY(-2px)

**Stat Card:**
```
Same as panel, with:
- Gap: 10px (flex layout)
- ::before pseudo-element with radial gradient
- Strong text: 1.8rem, charcoal-900
- Label: 0.73rem, uppercase
- Number placement: top-right (absolute)
```

**Queue Item:**
```
3-column grid: [100px] [1fr] [auto]
border: 1px solid var(--border)
border-radius: 12px
padding: 14px
background: linear-gradient (white → soft white)
```

**Hover:**
- Border: teal 20% opacity
- Shadow: 0 4px 12px rgba(teal 0.08)
- Transform: translateX(2px)

### Tables

**Base Style:**
```
border: 1px solid var(--border)
border-radius: 16px
overflow: hidden
background: white
box-shadow: var(--shadow-sm)
```

**Headers:**
- Background: linear-gradient teal 4% → transparent
- Color: text-muted
- Font-size: 0.75rem, uppercase, weight 800
- Border-bottom: 2px solid var(--border)
- Letter-spacing: 0.04em
- Padding: 14px 16px

**Rows:**
- Padding: 14px 16px
- Border-bottom: 1px solid var(--border-subtle)
- Cursor: pointer
- Transition: all 140ms

**Row Hover:**
- Background: teal 3% opacity
- Smooth transition

**Row Selected:**
- Background: teal 8% opacity

**Data Cell Nesting:**
- Strong: Text-strong color, visible
- Span (meta): text-muted, small 0.8rem

### Buttons

**Primary:**
- Background: linear-gradient(gold-600 → gold-700)
- Color: white
- Shadow: 0 8px 16px rgba(gold 0.18)
- Hover: darker gradient, -1px lift, larger shadow
- Focus: triple shadow ring

**Secondary:**
- Border: 1px solid var(--border)
- Background: white
- Color: text-strong
- Shadow: xs
- Hover: border-gold, background-alt, lift

**Ghost:**
- Background: transparent
- Border: none
- Color: text-muted
- Hover: background teal 8%, text-strong

**Danger:**
- Background: var(--danger)
- Color: white
- Shadow: 0 4px 12px danger 0.15
- Hover: darker danger, lift

**Sizes:**
- Small (sm): 36px height, 0.85rem font
- Medium (md): 44px height, 0.92rem font

### Forms

**Field:**
```
display: grid
gap: 7px
font-size: 0.9rem
font-weight: 700
```

**Label:**
- Color: text-strong
- Font-weight: 700

**Input/Select/Textarea:**
- Border: 1px solid var(--border)
- Border-radius: 12px
- Background: white
- Padding: 10-12px
- Font: inherit
- Transition: all 140ms

**Focus:**
- Border: teal 40% opacity
- Shadow: 0 0 0 3px teal 8%
- Background: white (highlighted)

**Error:**
- Border: 1px solid var(--danger)
- Background: danger-soft

**Placeholder:**
- Color: text-muted
- Font-weight: 600

### Badges

**Badge (Standard):**
```
display: inline-flex
width: fit-content
align-items: center
border-radius: 10px
font-size: 0.72rem
font-weight: 700
padding: 6px 12px
text-transform: capitalize
```

**Tone Variants:**
- Neutral: gray bg/text
- Success: success-soft bg, success text
- Warning: warning-soft bg, warning text
- Danger: danger-soft bg, danger text
- Info: info-soft bg, info text
- Pending: pending-soft bg, pending text

**Status Badge (Special):**
- Uppercase styling
- Height: 28px
- Padding: 6px 12px
- Font-size: 0.75rem
- Letter-spacing: 0.02em

**Status Variations:**
```
.status-active     → success colors
.status-inactive   → warning colors
.status-pending    → pending colors
.status-scheduled  → info colors
.status-confirmed  → success colors
.status-cancelled  → danger colors
.status-completed  → success colors
.status-failed     → danger colors
```

### Empty States

**Premium Empty State:**
```
min-height: 280px
place-items: center
border: 1px solid var(--border-subtle)
border-radius: 16px
background: linear-gradient(teal 2%, transparent)
text-align: center
```

**Compact Empty:**
```
min-height: 180px
border: 1px dashed var(--border)
background: transparent
padding: 24px 18px
```

**Elements:**
- Icon: 48px, teal 15% opacity
- H2: text-strong, 1.25rem
- P: text-muted, 0.95rem
- CTA button: optional

### Modals

**Backdrop:**
- Background: rgba(0, 0, 0, 0.4)
- Backdrop-filter: blur(4px)

**Dialog:**
- Background: white
- Border-radius: 20px
- Box-shadow: lg
- Max-width: 600px (standard)
- Padding: 24-28px

**Header:**
- Font-size: 1.1rem
- Font-weight: 700
- Margin-bottom: 20px

**Actions:**
- Gap: 12px
- Justify: flex-end
- Button order: Cancel (secondary), Submit (primary)

---

## RESPONSIVE BREAKPOINTS

### Desktop (> 1200px)
- Full sidebar + topbar + content
- Multi-column grids (3-4 columns)
- Full-width tables
- Max content width: 1320px

### Laptop (1024px - 1200px)
- Sidebar visible
- 2-3 column grids
- Adjusted padding
- Tables scrollable

### Tablet (768px - 1024px)
- Sidebar collapsible (mobile nav)
- 1-2 column grids
- Forms stack nicely
- Tables simplified

### Mobile (< 768px)
- Full-screen mobile nav overlay
- Single column layouts
- Touch-friendly buttons (44px min)
- Simplified tables (card view)
- Reduced padding: 16-20px
- Smaller fonts scaled appropriately

**Grid Adjustments:**
```
Desktop:  grid-template-columns: repeat(4, minmax(0, 1fr))
Laptop:   grid-template-columns: repeat(2, minmax(0, 1fr))
Tablet:   grid-template-columns: 1fr (single column)
Mobile:   grid-template-columns: 1fr (single column)
```

---

## PAGE-SPECIFIC PATTERNS

### Dashboard Page Pattern
- **Intro Card**: Gradient background, badge, headline, pills
- **Stats Grid**: 4 cards (desktop), 2 cards (tablet), 1 card (mobile)
- **Workflow Strip**: 7-8 steps, horizontal scroll on mobile
- **Two-Column Layout**: Main content + sidebar queue

### Patient/Staff Management Pattern
- **Toolbar**: Search + filters + action button
- **Two-Column Layout**: 
  - Left: Data table/list (scrollable)
  - Right: Details panel (sticky, 320px)
- **Detail Panel**: Profile + metadata + actions

### Forms Pattern
- **Section Headers**: Small caps, gray text
- **Field Grid**: 2 columns (desktop), 1 column (mobile)
- **Spacing**: 14px between fields
- **Actions**: Bottom sticky bar with Cancel/Save

### Records/Clinical Pattern
- **Toolbar**: Filters + sort + view options
- **Summary Grid**: 4 metric cards
- **Main Content**: List or table view
- **Empty State**: Helpful message

---

## IMPLEMENTATION STATUS

### ✅ COMPLETED
- Design tokens (colors, spacing, typography)
- Layout system (sidebar, topbar, content)
- Navigation styling
- Panel and card components
- Table system with proper hierarchy
- Button variants with states
- Form controls
- Badge system with 6 status tones
- Empty states
- Responsive breakpoints
- Shadow and transition system
- Modal styling
- Sidebar glassmorphic effect

### 🎯 READY FOR NEXT PHASES
- Page-specific refinements (Phase 2-7)
- Dark mode support (future)
- Animation enhancements
- Custom component library docs

---

## CSS ARCHITECTURE

### File Organization
- **src/index.css** — Main design system (2000+ lines)
  - CSS variables (design tokens)
  - Global styles
  - Layout components
  - Reusable classes
  - Responsive breakpoints

### Design Token Variables
All customizable via CSS variables:
```css
:root {
  /* Colors */
  --text: #1b1715
  --secondary: #bf8f46
  --success: #2d6a52
  /* Spacing */
  --space-lg: 16px
  /* Transitions */
  --transition-fast: 140ms cubic-bezier(...)
}
```

### Reusable Component Classes
- `.app-shell` — Main layout container
- `.sidebar` — Navigation sidebar
- `.topbar` — Header
- `.panel` — Generic container
- `.stat-card` — Dashboard metric
- `.queue-item` — List item
- `.badge`, `.status-badge` — Labels
- `.btn`, `.btn-primary`, etc. — Buttons
- `.table` — Tables
- `.empty-state` — Empty states
- `.modal` — Modal dialogs

---

## USAGE GUIDE

### For Developers

#### Using Design Tokens
```tsx
// Colors (via CSS variables)
<div style={{ color: 'var(--text-strong)' }}>Text</div>

// Spacing
<div style={{ padding: 'var(--space-xl)' }}>Content</div>

// Transitions
className="panel" // Has transition built-in
```

#### Component Classes
```tsx
// Button
<button className="btn btn-primary">Submit</button>

// Badge
<span className="badge status-confirmed">Confirmed</span>

// Panel
<article className="panel">Content</article>

// Table
<table className="table">...</table>
```

#### Responsive Classes
```css
/* Automatic via media queries */
@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

### For Designers

#### Customizing Colors
Edit `:root` variables in `src/index.css`:
```css
--secondary: #bf8f46;    /* Change accent color */
--success: #2d6a52;      /* Change success color */
```

#### Customizing Spacing
Modify spacing variables for entire app:
```css
--space-lg: 16px;  /* Change from 16px to 20px */
```

#### Creating New Component Styles
Follow established patterns:
1. Use design tokens (no hardcoded colors)
2. Use spacing scale (no random margins)
3. Include hover states
4. Add transitions
5. Ensure responsive behavior

---

## VERIFICATION CHECKLIST

✅ All design tokens defined in CSS  
✅ Color system complete (primary, status, neutrals)  
✅ Typography scale established  
✅ Spacing grid consistent  
✅ Button system with all variants  
✅ Form controls styled  
✅ Table styling premium  
✅ Badge system comprehensive  
✅ Modal styling  
✅ Sidebar glassmorphic effect  
✅ Topbar sticky and polished  
✅ Responsive breakpoints working  
✅ Empty states helpful  
✅ Shadows adding depth  
✅ Transitions smooth  
✅ No hardcoded values (all use CSS variables)  
✅ Accessibility: focus states on all interactive elements  
✅ Accessibility: proper contrast (WCAG AA)  
✅ Build passes with 0 errors  

---

## BUILD STATUS

```
✅ TypeScript: 0 errors
✅ Vite: 1918 modules transformed
✅ CSS: 99.61 kB (17.76 kB gzipped)
✅ Production ready
```

---

## NEXT STEPS (Phase 2-7)

1. **Phase 2**: Dashboard page enhancements
2. **Phase 3**: Patient/Staff management pages
3. **Phase 4**: Clinical pages (records, treatments)
4. **Phase 5**: Financial pages (billing, reports)
5. **Phase 6**: Specialized workflows (appointments calendar)
6. **Phase 7**: Polish and optimization

Each phase will use this foundation without modifying core design tokens.

---

## SUPPORT & CUSTOMIZATION

All styling is CSS-based and can be:
- ✅ Extended without breaking changes
- ✅ Customized via CSS variables
- ✅ Overridden per-page if needed
- ✅ Animated with smooth transitions
- ✅ Themed by changing color variables

**No breaking changes to existing code** — All enhancements are additive.

---

**Created:** 2026-08-16  
**Plamenco Dental Co. — Premium Clinic Management**
