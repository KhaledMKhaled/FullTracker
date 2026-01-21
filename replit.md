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