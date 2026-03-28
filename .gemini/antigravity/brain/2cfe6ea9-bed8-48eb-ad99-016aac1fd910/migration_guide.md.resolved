# AyurStock Pro: Migration Guide (Windows to Manjaro Linux)

This guide explains how to move your project and **Antigravity AI context** from Windows to your new **Manjaro** laptop.

## 1. Project Files (Source Code)

- **Source (Windows):** `c:\Users\vaibh\Documents\Ayur-stock pro`
- **Destination (Manjaro):** `/home/[username]/Documents/Ayur-stock-pro`

- **Do NOT copy `node_modules`**: Reinstall them on Manjaro.
- **On Manjaro**:
  1. Install Node.js & npm: `sudo pacman -S nodejs npm`
  2. Open the terminal in your project folder and run:
     ```bash
     npm install
     ```

## 2. Database (PostgreSQL)

If you're using a local PostgreSQL on Manjaro:
1. Install Postgres: `sudo pacman -S postgresql`
2. Initialize and start the service: `sudo -u postgres initdb -D /var/lib/postgres/data` and `sudo systemctl enable --now postgresql`
3. **Restore your data**:
   - On Windows: `pg_dump -U postgres ayur_stock > backup.sql`
   - On Manjaro: `psql -U postgres ayur_stock < backup.sql`

## 3. Antigravity AI Context (The "Brain")

The AI history and artifacts are stored in a hidden `.gemini` folder.

- **Source (Windows):** `C:\Users\vaibh\.gemini\antigravity`
- **Destination (Manjaro):** `~/.gemini/antigravity` (In your home directory)

**Steps for AI Migration:**
1. Install Antigravity on Manjaro.
2. **Close Antigravity completely** on Manjaro.
3. Replace the `~/.gemini/antigravity` folder with the one from your Windows laptop.

---

### Migration Checklist Summary
- [ ] Copy `Ayur-stock pro` (minus `node_modules`) to your Manjaro home.
- [ ] Install Node.js and Postgres on Manjaro (`pacman`).
- [ ] Sync/Restore PostgreSQL database.
- [ ] Copy `C:\Users\vaibh\.gemini\antigravity` to `~/.gemini/antigravity`.
- [ ] Run `npm install` on Manjaro.
- [ ] Run `npx prisma generate`.
- [ ] Start Antigravity and check history.
