# Database Setup & Migration Guide

This document outlines how to initialize and maintain the Operix AI database schema using the deterministic migration system.

## 🛠 Overview

The project uses a sequential SQL migration system. Each migration is a versioned SQL file located in `apps/api/migrations`. The system tracks applied migrations in a `migrations_history` table to prevent duplicate execution and detects schema drift using SHA-256 checksums.

## 🚀 Quick Start

### 1. Prerequisites
- PostgreSQL instance running.
- `DATABASE_URL` configured in your `.env` file.

### 2. Initialize Schema
To apply all pending migrations to your database:

```bash
cd apps/api
npx ts-node scripts/migrate.ts up
```

### 3. Check Migration Status
To see which migrations have been applied and which are pending:

```bash
cd apps/api
npx ts-node scripts/migrate.ts status
```

## 📝 Adding New Migrations

When modifying the schema, **do not edit existing migration files**. Instead:

1. Create a new `.sql` file in `apps/api/migrations`.
2. Use a 3-digit numeric prefix (e.g., `022_add_new_feature.sql`).
3. Wrap your changes in a transaction if the migration runner does not do so automatically (though the current runner wraps each file in a transaction).
4. Commit the file to version control.

## ⚠️ Troubleshooting

### Checksum Mismatch
If you see a `CRITICAL: Migration [file] has been modified after application!` error:
- This means a migration file was changed after it was already applied to your local database.
- **Fix**: Revert the change to the migration file, or manually remove the record from `migrations_history` if the change was intentional and you are in a development environment.

### Connection Issues
Ensure your `DATABASE_URL` is correct and the PostgreSQL server is reachable.
