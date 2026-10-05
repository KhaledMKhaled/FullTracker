// Run only in a VPS release checkout. Preserve every version and integrity hash.
// Replit's internal package proxy is not resolvable outside its network.
import fs from "node:fs";
const filename = "package-lock.json";
const lock = JSON.parse(fs.readFileSync(filename, "utf8"));
let updated = 0;
for (const pkg of Object.values(lock.packages || {})) {
  if (typeof pkg.resolved === "string" &&
      pkg.resolved.startsWith("http://package-firewall.replit.local/npm/")) {
    pkg.resolved = pkg.resolved.replace(
      "http://package-firewall.replit.local/npm/", "https://registry.npmjs.org/");
    updated++;
  }
}
fs.writeFileSync(filename, JSON.stringify(lock, null, 2) + "\n");
console.log(`Updated ${updated} internal registry URLs; versions and integrity hashes unchanged.`);
