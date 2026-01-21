# Tracker - نظام إدارة الشحنات والتكاليف والمدفوعات

## Overview
Tracker is a comprehensive multi-user Arabic (RTL) web application designed for managing shipment costing, inventory, and payment settlements. It streamlines the shipment process through a 5-step workflow (Import, Shipping, Customs & Takhreej, Missing Pieces, Summary), offering dual-currency support (RMB/EGP), multiple payment methods with overpayment tracking, supplier management, exchange rate management, and role-based access control. The platform aims to provide efficient and accurate financial tracking for international shipments.

## User Preferences
- All UI is in Arabic with RTL layout
- Cairo and Tajawal fonts for Arabic text
- Dual-currency display throughout the application
- Real-time cost calculations in the shipment wizard
- Overpayment tracking with negative balance display

## System Architecture
The application is built as a full-stack web application with a clear separation between frontend and backend.

### Technical Stack
- **Frontend**: React, TypeScript, Vite, Wouter (routing), shadcn/ui, Tailwind CSS, TanStack Query.
- **Backend**: Express.js, Node.js.
- **Database**: PostgreSQL (Neon-backed, via Drizzle ORM).
- **Authentication**: Replit Auth (OpenID Connect).

### Key Features
- **Shipment Workflow**: A 5-step wizard (Import, Shipping, Customs & Takhreej, Missing Pieces, Summary) guides users through the shipment process, calculating costs at each stage.
- **Dual-Currency System**: Supports RMB (purchase), EGP (final accounting), and USD (reference) with historical exchange rate management.
- **Role-Based Access Control**: Defines user roles (Admin, Accountant, Inventory Manager, Viewer) with specific permissions.
- **Inventory Management**: Tracks product movements and calculates per-piece costs, including purchase, shipping, customs, and clearance shares.
- **Payment Management**: Supports various payment methods, tracks overpayments, and allows for supplier attribution.
- **Reporting & Accounting**: Includes an accounting dashboard, supplier balances, movement reports, and payment method reports with CSV/Excel export capabilities.
- **Data Persistence**: Utilizes Replit Object Storage for persistent storage of item images and payment attachments.
- **Backup and Restore**: Admin-only feature for comprehensive system backup (database, media files) and restore functionality with progress tracking.
- **Local Trade Module (التجارة المحلية)**: Comprehensive EGP-only module for managing local merchants (تاجر) and customers (عميل):
  - Party management with contact info, payment terms (كاش/آجل), credit limits
  - Purchase invoices with two-step workflow (create → receive)
  - Ledger-based balance tracking with running totals
  - Return cases and margin management
  - Seasonal settlement and archiving

### UI/UX Decisions
- Consistent Arabic RTL layout using Cairo and Tajawal fonts.
- Sticky shipment details and item list pagination in the wizard for improved usability.
- Real-time cost calculation display at every step of the shipment process.
- Intuitive UI for tracking missing pieces and automatic cost recalculation.

### Key Design Decisions
- Chunked bulk inserts for handling large shipments efficiently.
- Stable `lineNo` for shipment items ensuring consistent ordering.
- Transactional deletion for payments, ensuring data integrity.
- Apply to All feature in Customs step for quick data entry.

## Recent Changes
- **January 2026**: Party-Centric Workflow
  - Removed الفواتير, المدفوعات, الهوامش from main sidebar navigation
  - All actions now performed from within party profile pages
  - Users must navigate to a party's profile to create invoices, record payments, or manage margins
- **January 2026**: Added Third Party Type "مزدوج"
  - New party type "both" (مزدوج) allows executing purchase and sale transactions with same party
  - Available alongside existing "تاجر" (merchant) and "عميل" (customer) types
  - "مزدوج" type parties appear in both purchase and sale invoice creation dropdowns
  - Updated party creation/edit dialogs and profile pages
- **January 2026**: Per-Line Invoice Receiving with Automatic Margin Cases
  - Per-line quantity input: Enter actual received quantity for each line item
  - Automatic shortage detection: System calculates difference between ordered and received
  - Visual indicators: Checkmark (تمام) for full receipt, warning (ناقص) for shortages
  - Automatic margin case creation: Creates "حالة هامش" for each line with shortage
  - Inventory impact: Only received quantities affect inventory, not ordered
  - Renamed "المرتجعات" to "الهوامش" throughout the system (sidebar, tabs, dialogs)
  - receivedPieces field added to track actual received quantities per line
- **January 2026**: Enhanced Invoice Receiving & Viewing
  - Redesigned receive dialog to match invoice creation format
  - Product images with hover preview for all line items
  - Summary cards showing: lines count, total cartons, total pieces, total amount
  - Each line displays: image, name, cartons, pieces/carton, unit mode, unit price, line total
  - Clear inventory impact message (add for purchase, subtract for sale)
  - Unified visual design across create, view, and receive dialogs
- **January 2026**: Comprehensive Invoice Creation Wizard
  - New dedicated page for creating local trade invoices (/local-trade/invoices/new)
  - Sticky header with: merchant dropdown, auto-filled date, reference name, auto-generated reference number
  - Quick summary cards showing: lines count, total cartons, total pieces (real-time updates)
  - Line items with: image upload (Object Storage), product type dropdown, product name, cartons, pieces/carton
  - Selling unit toggle (piece/dozen) with automatic calculations
  - Auto-generated reference number format: 10001+counter-DDMMYYYY
  - Image preview on hover with HoverCard component
  - Backend presigned URL upload for images
- **January 2026**: Customer 360 Page Enhancement
  - Sticky header with customer avatar, badges, and quick action buttons
  - 6 KPI cards showing: total invoices, total paid, balance, under inspection, last invoice date, last collection date
  - 7 tabs: نظرة عامة (Overview), الفواتير (Invoices), المدفوعات (Payments), التحصيل (Collections), الهوامش (Margins), كشف الحساب (Statement), الأرشيف (Archive)
  - Collections linked to payments: clicking "تم التحصيل" opens payment dialog with pre-filled data
  - Statement export: PDF and CSV download with Arabic RTL formatting
  - Notifications system for due/overdue collections with in-app alerts
  - New notifications table and API endpoints
  - Optimized batch queries for collection reminders
- **January 2026**: Enhanced Party Profile as Comprehensive Hub
  - Party profile page is now a complete, independent interface for all party data
  - Added "التحصيل" (Collections) tab with 4 consecutive collection date slots, reminders, status tracking
  - Added "الحركات" (Timeline) tab showing chronological activity view of invoices, payments, returns, collections
  - New party_collections table: partyId, collectionOrder (1-4), date, amount, notes, reminderSent, status
  - New APIs: collections CRUD, status updates, reminder marking, timeline aggregation
  - Removed collection info from parties list - now managed exclusively in party profile
- **January 2026**: Added Local Trade Module (التجارة المحلية)
  - New database schema: 9 tables (parties, party_seasons, party_collections, local_invoices, local_invoice_lines, local_receipts, party_ledger_entries, local_payments, return_cases)
  - Backend: 23+ API routes with RBAC under /api/local-trade
  - Frontend: 5 new pages (parties, invoices, party profile, payments, returns)
  - Features: Party management, purchase invoices with two-step workflow, ledger tracking, returns/margins, seasonal settlement
  - Business logic: Credit limit enforcement, atomic ledger entries, zero-balance settlement validation
- **January 2026**: Added backup file upload and restore from external storage
  - Users can now upload a previously downloaded backup ZIP file
  - The uploaded backup is stored in Object Storage and can be restored
  - Confirmation dialog warns users before restoring from uploaded file
- **January 2026**: Added three new payment methods: نواقص (Shortages), AliPay, WeChat
  - Updated payments page, movement report, and payment methods report
  - AliPay and WeChat use reference number field (like other non-cash methods)
  - نواقص shows in red/destructive color in reports for visibility
- **January 2026**: System Backup and Restore Feature with progress tracking

## External Dependencies
- **Replit Auth**: For user authentication and session management (OpenID Connect).
- **Neon**: Managed PostgreSQL database service.
- **Replit Object Storage**: For persistent storage of uploaded images and attachments (e.g., item images, payment attachments).
- **html2canvas & jsPDF**: Used for generating PDF exports of shipment summaries.