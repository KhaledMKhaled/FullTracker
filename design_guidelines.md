# Design Guidelines: Repit.AI Shipment Management System

## Design Approach: Enterprise Data System

**Selected Framework**: Material Design + Carbon Design System principles adapted for Arabic RTL
**Justification**: Data-intensive business application requiring clean information hierarchy, robust form patterns, and professional credibility. Material's structured approach combined with Carbon's enterprise focus provides optimal foundation for complex financial workflows.

**Core Principles**:
- Information clarity over visual flair
- Predictable, consistent patterns across all modules
- Efficient data entry and review workflows
- Professional credibility for financial operations

---

## RTL (Right-to-Left) Implementation

**Critical RTL Requirements**:
- All layouts mirror horizontally: navigation on right, content flows right-to-left
- Form labels positioned to the right of inputs
- Icons and chevrons flip direction (back arrow points right →)
- Tables read right-to-left with primary columns on right
- Number formatting: keep Arabic-Indic numerals with RTL directionality
- Breadcrumbs flow right-to-left with appropriate separators (← not →)

---

## Typography System

**Font Family**: 
- Primary: 'Cairo' or 'Tajawal' from Google Fonts (excellent Arabic readability)
- Fallback: system Arabic fonts

**Type Scale**:
- Page Titles: text-3xl (30px) font-semibold
- Section Headers: text-xl (20px) font-semibold  
- Card/Module Titles: text-lg (18px) font-medium
- Body Text: text-base (16px) font-normal
- Labels/Captions: text-sm (14px) font-medium
- Helper Text: text-xs (12px) font-normal

**Special Considerations**:
- Increase line-height by 0.1-0.2 for Arabic text (leading-relaxed)
- Use font-semibold for emphasis rather than bold to maintain readability

---

## Layout & Spacing System

**Spacing Primitives** (Tailwind units):
- Use: 2, 4, 6, 8, 12, 16 for consistency
- Component padding: p-4 to p-6
- Section spacing: py-8 to py-12
- Card gaps: gap-4 to gap-6
- Form field spacing: space-y-4

**Grid Structure**:
- Dashboard: 12-column responsive grid (grid-cols-12)
- Forms: 2-column on desktop (md:grid-cols-2), single column mobile
- Data tables: Full-width with horizontal scroll on mobile
- Cards: 2-3 column grids (md:grid-cols-2 lg:grid-cols-3)

**Container Widths**:
- Full application: max-w-7xl mx-auto
- Forms/Detail views: max-w-4xl
- Narrow content: max-w-2xl

---

## Application Structure

**Main Layout**:
- Right-side navigation drawer (280px width) with collapsible sections
- Top app bar: 64px height with breadcrumbs, user menu, notifications
- Main content area: p-6 with max-w-7xl container

**Navigation Patterns**:
- Primary nav: Vertical menu on right with icons + labels + tooltips
- Secondary nav: Horizontal tabs within modules
- Breadcrumbs: Always visible showing hierarchy
- Action buttons: Top-right of content sections (primary actions sticky)

---

## Component Library

**Forms**:
- Input fields: h-10 with border, rounded-md, clear focus states
- Labels: Above inputs (mb-2) in RTL context
- Required indicators: Red asterisk after label (on left side in RTL)
- Validation: Inline error messages below fields (text-sm)
- Multi-step forms: Progress stepper at top showing 4 steps

**Data Display**:
- Tables: Striped rows, hover states, sticky headers, right-aligned primary columns
- Cards: Rounded-lg with shadow-sm, p-4 to p-6 internal padding
- Stats cards: Large number display with supporting label and trend indicator
- Summary panels: Background treatment with border, organized key-value pairs

**Action Components**:
- Primary buttons: h-10 px-6 rounded-md font-medium
- Secondary buttons: Outlined variant, same sizing
- Icon buttons: w-10 h-10 rounded-full for compact actions
- Dropdown menus: Right-aligned in RTL, consistent with navigation

**Data Entry**:
- Add item rows: Repeatable form sections with delete action
- Inline editing: Click-to-edit pattern for table cells
- Autocomplete: Dropdown suggestions for suppliers, products
- Date pickers: Arabic calendar support with RTL layout

**Feedback**:
- Toast notifications: Top-left (RTL adjusted) with auto-dismiss
- Modal dialogs: Centered, max-w-lg, clear hierarchy
- Loading states: Skeleton screens for data-heavy sections
- Empty states: Centered icon + message + action button

---

## Module-Specific Patterns

**Dashboard/Overview**:
- Top: 4-stat summary cards (shipments count, total costs, payments, balance)
- Middle: Recent shipments table with quick actions
- Bottom: Split view - payment summary + pending actions

**Shipment Detail (4-Step Process)**:
- Horizontal progress stepper showing: الاستيراد → بيانات الشحن → الجمارك والتخريج → ملخص الشحنة
- Each step: Full-width form with section groupings
- Right sidebar: Sticky summary showing running totals
- Bottom: Action bar with "حفظ" (Save) and navigation buttons

**Items Entry Table**:
- Spreadsheet-like interface with inline editing
- Calculated fields auto-update (COU, totals)
- Row actions: Duplicate, Delete on right edge
- Add row button: Prominent at table bottom

**Payments Module**:
- Split layout: Left (RTL = right) shows shipment list with balances, Right shows payment form
- Payment history: Timeline view with payment method icons
- Balance indicators: Clear visual treatment for overpaid/underpaid states

---

## Visual Hierarchy

**Emphasis Patterns**:
- Financial totals: Larger text (text-2xl), semibold, distinct spacing
- Status badges: Rounded-full px-3 py-1 with meaningful treatments per status
- Critical actions: Visually distinct, positioned consistently top-right
- Secondary info: Reduced opacity (opacity-70) or smaller text

**Information Density**:
- Balance white space with data density
- Group related fields with background panels
- Use dividers sparingly (border-t opacity-10)
- Collapsible sections for optional/advanced fields

---

## Accessibility & Usability

- Consistent tab order (RTL-aware)
- Clear focus indicators on all interactive elements  
- Proper ARIA labels in Arabic
- Keyboard shortcuts for common actions (documented in tooltips)
- Minimum touch target: 44x44px for mobile
- High contrast text (minimum WCAG AA)

---

## Professional Polish

- Subtle shadows: shadow-sm for cards, shadow-md for elevated elements
- Consistent border radius: rounded-md (6px) for most elements
- Hover states: Slight opacity change or subtle background shift
- Transitions: duration-200 for interactive elements
- Loading spinners: Centered with contextual message

This design system prioritizes **efficient workflows, data clarity, and professional credibility** over decorative elements, perfectly suited for a business-critical financial management application.