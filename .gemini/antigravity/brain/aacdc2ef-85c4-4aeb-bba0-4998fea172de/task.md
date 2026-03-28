# Task: Settings Upgrades & Backup System

- [x] Build **Database Admin: Backup & Restore**
  - [x] Implement `GET /api/database/backup` route (Medicines, Suppliers, Rack Locations)
  - [x] Implement `POST /api/database/restore` route (UPSERT, Auto-Backup, Shop Validation)
  - [x] Implement `POST /api/database/restore?dryRun=true` logic (Validation & Summary)
  - [x] Upgrade `database-admin.tsx` UI with Dry-Run Popup, Red Zone Danger UI, and Warning Text
- [x] Upgrade **General Settings**
  - [x] Add "Live Receipt Preview" to `shop-settings.tsx`
  - [x] Build Mobile-Responsive "Bento Grid" layout in `invoice-settings.tsx`
  - [x] Implement visual Color-Coded Sliders in `inventory-settings.tsx`
- [x] Upgrade **Account Settings**
  - [x] Apply Stitch styling to `profile-settings.tsx`
  - [x] Add pill badges and Glassmorphism to `user-settings.tsx`
- [x] Upgrade **Advanced Settings**
  - [x] Add Gemini, Groq, and OpenRouter gauges + Time to Reset in `ai-usage-tab.tsx`
- [x] Inform User to verify functionality
