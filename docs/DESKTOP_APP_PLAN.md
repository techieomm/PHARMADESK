# PharmaDesk — Windows Desktop Native App Architecture Plan (.exe)
**Target**: Bajrang Pharmacy, Lucknow, Uttar Pradesh (GSTIN: `09CMVPM3439A1ZS`)  
**Document Version**: 1.0.0  
**Target Runtime**: Windows 10 / 11 (64-bit), Counter PCs (1366x768, 4GB–8GB RAM)  
**Deliverable**: Standalone offline-capable desktop `.exe` installer (Tauri 2.0 + SQLite + React 18)

---

## 1. Executive Summary & Stack Justification

### 1.1 Stack Comparison: Tauri 2.0 vs. Electron

| Architectural Dimension | Electron | Tauri 2.0 (Selected) | Benefit for Pharmacy Counters |
| :--- | :--- | :--- | :--- |
| **Binary / Installer Size** | 120MB – 180MB | **8MB – 14MB** | Instant distribution over modest 4G/counter broadband; rapid automatic updates. |
| **Idle RAM Footprint** | 250MB – 450MB (Chromium + Node) | **35MB – 65MB** (WebView2 + Rust) | Leaves counter PC memory free for OS, thermal printer spoolers, and barcode drivers on 4GB RAM machines. |
| **UI Web Engine** | Bundled Chromium | **Windows Evergreen WebView2** | Hardware-accelerated native rendering pre-installed on modern Windows 10 & 11. |
| **Native Peripheral Access** | Node.js native addons (`node-serialport`, `node-printer`) | **Rust Crate Ecosystem** (`rusqlite`, `serialport`, `windows-rs`, `escposify`) | Zero DLL drift, compile-time memory safety, direct access to Windows Win32 HID and Raw Spooler APIs without browser sandbox traps. |
| **Startup Latency** | 3.5 – 6.0 seconds | **< 600 ms** | Counter staff can cold-boot the billing terminal immediately when power resumes. |

### 1.2 Desktop Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                           PHARMADESK TAURI 2.0 DESKTOP                            |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                     FRONTEND (React 18 + Vite + TS)                         |  |
|  |  * PosBilling.tsx (F1-F9 Keyboard First, FEFO previews)                    |  |
|  |  * Purchases, Inventory, Customers, Day Close, Returns, Discrepancies        |  |
|  |  * BarcodeScannerContext (USB HID keyboard interception <35ms)             |  |
|  |  * Repository Provider (LocalSqliteRepository <=> SupabaseRepository)      |  |
|  +-----------------------------------------------------------------------------+  |
|                                     │ Tauri IPC (invoke / emit)                    |
|  +──────────────────────────────────▼──────────────────────────────────────────+  |
|  |                   TAURI 2.0 RUST BACKEND CORE (src-tauri)                   |  |
|  |  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  |  |
|  |  |  SQLite Storage     |  |  Sync Engine Daemon |  | Hardware Manager    |  |  |
|  |  |  * Local DB Mirror  |  |  * Outbox Processor |  | * Raw USB ESC/POS   |  |  |
|  |  |  * Offline Sequences|  |  * RPC pull_changes |  | * Direct Win32 HID  |  |  |
|  |  |  * UUIDv7 Generator |  |  * RPC push_changes |  | * Cash Drawer Pulse |  |  |
|  |  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  |  |
|  +─────────────────────────────────────────────────────────────────────────────+  |
+-----------------------------------------------------------------------------------+
                                      ▲
                                      │ HTTPS / WebSocket TLS 1.3
                                      ▼
+-----------------------------------------------------------------------------------+
|                        SUPABASE CLOUD / CENTRAL SERVER                            |
|  * Postgres 16 with Row-Level Security (RLS) & Multi-Tenant Partitioning          |
|  * RPC create_invoice_atomic, pull_changes, push_changes, close_day               |
|  * Central Ledger, Discrepancies Audit, GSTR-1, Multi-Branch Stock Consolidation   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Local SQLite Schema (Mirroring Postgres)

The local SQLite database resides in `%APPDATA%\PharmaDesk\pharmadesk_local.db`. It implements SQLite **WAL (Write-Ahead Logging)** mode with `PRAGMA synchronous = NORMAL;` to achieve maximum write throughput and crash resilience during counter power cuts.

```sql
-- Pragmas for High Concurrency and Integrity
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

-- 1. Sync Outbox Table (Tracks Local Mutations Awaiting Upstream Push)
CREATE TABLE IF NOT EXISTS sync_outbox (
    outbox_id TEXT PRIMARY KEY,             -- UUIDv7
    entity_name TEXT NOT NULL,              -- 'invoices', 'customers', 'day_close', etc.
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,                   -- 'insert', 'update', 'delete'
    payload TEXT NOT NULL,                  -- Serialized JSON
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'in_flight', 'synced', 'failed'
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON sync_outbox(status, created_at);

-- 2. Sync Inbound Watermarks (Tracks Last Pulled Timestamp per Entity)
CREATE TABLE IF NOT EXISTS sync_watermarks (
    entity_name TEXT PRIMARY KEY,
    last_synced_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 3. Local Invoices (Offline Immutable Invoices)
CREATE TABLE IF NOT EXISTS local_invoices (
    id TEXT PRIMARY KEY,                    -- UUIDv7
    branch_id TEXT NOT NULL,
    counter_code TEXT NOT NULL,
    invoice_number TEXT NOT NULL UNIQUE,
    financial_year TEXT NOT NULL,
    customer_id TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_gstin TEXT,
    subtotal_taxable REAL NOT NULL,
    total_cgst REAL NOT NULL,
    total_sgst REAL NOT NULL,
    total_igst REAL NOT NULL,
    total_gst REAL NOT NULL,
    round_off REAL NOT NULL,
    total_amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    split_payments TEXT,                   -- JSON array
    status TEXT NOT NULL DEFAULT 'issued',
    doctor_id TEXT,
    patient_name TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    is_interstate INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    synced_at TEXT
);

-- 4. Local Invoice Items
CREATE TABLE IF NOT EXISTS local_invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES local_invoices(id) ON DELETE CASCADE,
    medicine_id TEXT NOT NULL,
    medicine_name TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    batch_no TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    hsn_code TEXT NOT NULL,
    quantity_pieces INTEGER NOT NULL,
    unit_type TEXT NOT NULL,
    unit_quantity INTEGER NOT NULL,
    pieces_per_unit INTEGER NOT NULL,
    unit_mrp REAL NOT NULL,
    unit_selling_price REAL NOT NULL,
    gst_rate REAL NOT NULL,
    taxable_amount REAL NOT NULL,
    cgst_amount REAL NOT NULL,
    sgst_amount REAL NOT NULL,
    igst_amount REAL NOT NULL,
    total_amount REAL NOT NULL,
    created_at TEXT NOT NULL
);

-- 5. Local Inventory Batches (FEFO Tracking)
CREATE TABLE IF NOT EXISTS local_inventory_batches (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    medicine_id TEXT NOT NULL,
    batch_no TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    qty_pieces INTEGER NOT NULL,
    mrp REAL NOT NULL,
    purchase_rate REAL NOT NULL,
    rack_location TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_batches_fefo ON local_inventory_batches(medicine_id, expiry_date ASC);

-- 6. Local Sequence Generator (Lock-Free per Counter)
CREATE TABLE IF NOT EXISTS local_counter_sequences (
    branch_id TEXT NOT NULL,
    counter_code TEXT NOT NULL,
    financial_year TEXT NOT NULL,
    current_sequence INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (branch_id, counter_code, financial_year)
);
```

---

## 3. Bidirectional Sync Algorithm

### 3.1 Principles
1. **Never Block Counter Billing**: An Indian retail pharmacy counter cannot wait for cloud roundtrips while a line of patients waits. Sales are finalized locally in SQLite in < 50ms, assigned a collision-free UUIDv7, and allocated against local batch stock.
2. **Gap-Free Series per Counter**: Series is `{BranchPrefix}-{CounterCode}-{FinancialYear}-{Sequence}` (e.g., `LKO1-C1-2627-000042`). Because sequence numbering is isolated to each counter, two PCs at Bajrang Pharmacy never conflict or block each other.
3. **Idempotency Guarantee**: Every invoice mutation payload carries an immutable `idempotency_key` (UUIDv7). If network drops after the server commits the transaction, resending the batch never duplicates the invoice.

### 3.2 Sync Protocol State Machine

```
   [Offline Transaction Created]
                │
                ▼
      [Saved to Local SQLite]
                │
                ▼
     [Appended to sync_outbox]
                │
                ├──────────────────────────────────────────┐
                │ If Offline                               │ If Online
                ▼                                          ▼
     [Sleep with Jitter Backoff]               [Tauri Rust Background Worker]
                ▲                                          │
                │ Internet Reconnected                    ▼
                └──────────────────────────  [Call Postgres RPC push_changes()]
                                                           │
                                            ┌──────────────┴──────────────┐
                                            ▼                             ▼
                                   [RPC Succeeded]               [RPC Error / Discrepancy]
                                            │                             │
                                            ▼                             ▼
                                [Mark outbox 'synced']       [Log to discrepancies table]
                                [Update Watermarks]          [Alert Branch Manager]
```

### 3.3 Conflict Resolution Rules
- **Negative Stock Reconciliation**: If Counter 1 and Counter 2 sold the last 5 strips of Dolo 650 simultaneously while offline, the server records both sales (protecting customer receipts) and creates an automatic entry in `discrepancies` with `discrepancy_type = 'oversold_batch'`. The branch manager resolves this on the `/discrepancies` screen by physical shelf audit or vendor purchase entry.
- **Master Data (Catalog & Customers)**: Server always wins for prices and master tax rules (`updated_at` timestamp comparison). Local customer name/phone edits are merged non-destructively.

---

## 4. Native Hardware Direct Integration (Rust Core)

### 4.1 Direct ESC/POS Thermal Printing (No Web Print Dialog)

Web browsers force a print confirmation dialog (`window.print()`), which slows down pharmacy billing queues. In the Tauri desktop application, printing is executed through direct Win32 raw spooling or USB interface in < 100ms.

#### Rust Raw Print Module (`src-tauri/src/printer.rs`):
```rust
use std::io::Write;
use tauri::command;

#[command]
pub async fn print_receipt_raw(
    printer_name: String,
    raw_escpos_bytes: Vec<u8>
) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use winspool::Printer; // or direct win32 OpenPrinterW / StartDocPrinterW
        let printer = Printer::open(&printer_name).map_err(|e| e.to_string())?;
        let mut job = printer.start_job("PharmaDesk Receipt").map_err(|e| e.to_string())?;
        job.write_all(&raw_escpos_bytes).map_err(|e| e.to_string())?;
        job.finish().map_err(|e| e.to_string())?;
        Ok(true)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[command]
pub async fn kick_cash_drawer(printer_name: String) -> Result<bool, String> {
    // ESC/POS Cash Drawer Kick Pulse: ESC p 0 25 250
    let kick_bytes = vec![0x1B, 0x70, 0x00, 0x19, 0xFA];
    print_receipt_raw(printer_name, kick_bytes).await
}
```

### 4.2 Raw USB HID Barcode Scanner Interception

While web browsers require the cursor to be focused on an input element, Tauri hooks into Windows Raw Input (`WM_INPUT` via `windows-rs`). Any barcode scanned on the USB scanner is captured globally, parsed via GS1 DataMatrix rules, and routed to the POS cart even if the staff is reading a report.

---

## 5. Build, Packaging & Auto-Update Pipeline

### 5.1 Tauri Configuration (`src-tauri/tauri.conf.json`)
```json
{
  "productName": "PharmaDesk",
  "version": "1.0.0",
  "identifier": "com.bajrangpharmacy.pharmadesk",
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.ico"
    ],
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com",
      "nsis": {
        "installMode": "perMachine",
        "languages": ["English"],
        "displayLanguageSelector": false
      }
    }
  },
  "plugins": {
    "updater": {
      "endpoints": [
        "https://releases.bajrangpharmacy.com/desktop/{{target}}/{{current_version}}"
      ],
      "pubkey": "dGVzdC1wdWJrZXktdGF1cmktYmFqcmFuZy1waGFybWFjeQ=="
    }
  }
}
```

### 5.2 Release & Signing Steps
1. **Compilation**: `npm run build && cargo tauri build --target x86_64-pc-windows-msvc`.
2. **Code Signing**: Sign the generated `.exe` installer using Microsoft Azure Trusted Signing or a hardware EV USB token (DigiCert / Sectigo) to eliminate Windows SmartScreen warnings.
3. **Distribution**: Upload installer to S3/Cloudflare R2.
4. **Auto-Updater**: The application polls the updater endpoint on startup; if a patch is found, it downloads in the background and prompts the cashier: *"PharmaDesk updated. Restart now to apply."*

---

## 6. Offline Readiness Audit Checklist

- [x] **RFC 9562 UUIDv7 Primary Keys**: All records generated offline are globally unique and timestamp-ordered.
- [x] **Isolated Counter Series**: Sequences are scoped to `{branch_id}-{counter_code}-{financial_year}`, eliminating lock waits.
- [x] **Local FEFO Stock Allocation**: Pure FEFO algorithm runs in both TypeScript and Postgres RPC with zero variance.
- [x] **Dual Unit Mathematics**: Strips and loose pieces handled uniformly across offline and online environments.
- [x] **Discrepancy Reporting System**: Server reconciliation catches oversold batches without canceling customer bills.
- [x] **Tauri Native Spooling Architecture**: ESC/POS thermal printing and cash drawer pulse designed for sub-100ms hardware response.
