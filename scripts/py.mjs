#!/usr/bin/env node
// Runs a Python script under the right interpreter name for this OS
// (`python3` on macOS/Linux, `python` on Windows), so npm scripts work everywhere.
//   node scripts/py.mjs scripts/master.py <args...>
import { spawnSync } from "node:child_process";
import { PYTHON } from "../hub/lib/plateforme.mjs";

const r = spawnSync(PYTHON, process.argv.slice(2), { stdio: "inherit" });
if (r.error) {
  console.error(`${PYTHON} introuvable : installe Python 3 (https://www.python.org/downloads/)`);
  process.exit(1);
}
process.exit(r.status ?? 1);
