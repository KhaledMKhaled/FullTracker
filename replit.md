# Tracker - نظام إدارة الشحنات والتكاليف والمدفوعات

## Overview
Tracker is a comprehensive multi-user Arabic (RTL) web application designed for managing shipment costing, inventory, and payment settlements. It streamlines the shipment process through a 5-step workflow (Import, Shipping, Customs & Takhreej, Missing Pieces, Summary), offering dual-currency support (RMB/EGP), multiple payment methods with overpayment tracking, supplier management, exchange rate management, and role-based access control. The platform aims to provide efficient and accurate financial tracking for international shipments, including a robust Local Trade Module for managing local merchants and customers.

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
- **Authentication**: Passport.js local strategy (username/password). Initial admin account uses username `root` with the password set in the `ROOT_PASSWORD` secret.

### Key Features
- **Shipment Workflow**: A 5-step wizard (Import, Shipping, Customs & Takhreej, Missing Pieces, Summary) guides users through the shipment process, calculating costs at each stage.
- **Dual-Currency System**: Supports RMB (purchase), EGP (final accounting), and USD (reference) with historical exchange rate management.
- **Role-Based Access Control**: Defines user roles (Admin, Accountant, Inventory Manager, Viewer) with specific permissions.
- **Inventory Management**: Tracks product movements and calculates per-piece costs, including purchase, shipping, customs, and clearance shares.
- **Payment Management**: Supports various payment methods, tracks overpayments, and allows for supplier attribution, including FIFO auto-settlement for local trade payments.
- **Reporting & Accounting**: Includes an accounting dashboard, supplier balances, movement reports, and payment method reports with CSV/Excel export capabilities, and redesigned comprehensive account statements.
- **Data Persistence**: Utilizes Replit Object Storage for persistent storage of item images and payment attachments.
- **Backup and Restore**: Admin-only feature for comprehensive system backup (database, media files) and restore functionality.
- **Local Trade Module (التجارة المحلية)**: Comprehensive EGP-only module for managing local merchants (تاجر) and customers (عميل). Features include:
  - Party management with contact info, payment terms, credit limits, and "both" (مزدوج) party type.
  - Purchase and Sale invoices with a two-step workflow (create → receive) supporting per-line receiving, automatic margin/return case creation, and linked payment tracking (paid, partially paid, unpaid statuses).
  - Ledger-based balance tracking with running totals and opening balance management.
  - Return cases resolution with various types (deduct_value, accepted_return, etc.) and impact on invoice balances.
  - Party-centric workflow where all actions (invoices, payments, margins, collections) are managed from within a party's profile.
  - Customer 360 page enhancements with KPIs, collection tracking with reminders, and timeline views.

### UI/UX Decisions
- Consistent Arabic RTL layout using Cairo and Tajawal fonts.
- Sticky shipment details and item list pagination in the wizard.
- Real-time cost calculation display at every step.
- Intuitive UI for tracking missing pieces and automatic cost recalculation.
- Redesigned invoice type selector using visual card buttons.
- Enhanced invoice receiving and viewing with product images, summary cards, and clear inventory impact messages.
- Comprehensive invoice creation wizard with image upload, product type selection, and unit toggles.

### Key Design Decisions
- Chunked bulk inserts for large shipments.
- Stable `lineNo` for consistent item ordering.
- Transactional deletion for payments to ensure data integrity.
- "Apply to All" feature in Customs step for quick data entry.
- Atomic ledger entries for financial operations in local trade.
- FIFO auto-allocation of payments to outstanding invoices in local trade.

## External Dependencies
- **Passport.js**: Local username/password authentication. Sessions stored in PostgreSQL via `connect-pg-simple`.
- **Neon**: Managed PostgreSQL database service.
- **Replit Object Storage**: For persistent storage of uploaded images and attachments (e.g., item images, payment attachments).
- **html2canvas & jsPDF**: Used for generating PDF exports of shipment summaries and account statements.