/**
 * Delete cloud-sync duplicate files before typechecking.
 *
 * Something syncing ~/Documents (iCloud Drive, most likely) copies files as "name 2.ext". The
 * copies inside apps/web/.next are picked up by tsc as real source, and every declaration in them
 * collides with the original — so `pnpm verify` fails with a wall of "Duplicate identifier" errors
 * that look like a code problem and are not. It has cost three debugging detours.
 *
 * The generated ones are always disposable, so deleting them is safe and unconditional. This is a
 * workaround for an environment problem; the actual fix is excluding the project from cloud sync.
 */
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

// scripts/ too: duplicates there are real source files that get edited by accident.
const ROOTS = ["apps/web/.next", "apps/web", "scripts", "packages"];
const DUPLICATE = / \d+\.[^.]+$/;

let removed = 0;

function sweep(dir, depth = 0) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    const path = join(dir, name);
    if (DUPLICATE.test(name)) {
      rmSync(path, { recursive: true, force: true });
      removed += 1;
      continue;
    }
    // Only descend inside .next; sweeping the whole app would be slow and pointless.
    if (depth < 8 && (dir.includes(".next") || dir.startsWith("packages"))) {
      let isDir = false;
      try {
        isDir = statSync(path).isDirectory();
      } catch {
        continue;
      }
      if (isDir) sweep(path, depth + 1);
    }
  }
}

for (const root of ROOTS) sweep(root);
if (removed > 0) console.log(`Removed ${removed} cloud-sync duplicate file(s) before typecheck.`);
