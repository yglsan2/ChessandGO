const fs = require("fs");
const path = require("path");

function walk(d, acc = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (/node_modules|vendor|\.git|sounds/.test(p)) continue;
      walk(p, acc);
    } else if (/\.(html|js)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const root = path.resolve(__dirname, "..");
const files = walk(root);
const htmlFiles = files.filter((f) => f.endsWith(".html"));
const jsFiles = files.filter((f) => f.endsWith(".js") && !f.includes("vendor") && !f.includes("audit-buttons"));

const btnRe = /<(button|input)([^>]*)>/gi;
const idRe = /\bid\s*=\s*["']([^"']+)["']/i;
const typeRe = /\btype\s*=\s*["']([^"']+)["']/i;

const ids = new Map();
for (const f of htmlFiles) {
  const t = fs.readFileSync(f, "utf8");
  let m;
  const re = new RegExp(btnRe);
  while ((m = re.exec(t))) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const idm = attrs.match(idRe);
    if (!idm) continue;
    const id = idm[1];
    if (tag === "input") {
      const typ = (attrs.match(typeRe) || [, "text"])[1].toLowerCase();
      if (!["button", "submit", "reset", "checkbox", "file", "range"].includes(typ) && typ !== "checkbox") {
        // keep checkboxes/range/file that are interactive controls with handlers
        if (!["checkbox", "file", "range"].includes(typ)) continue;
      }
    }
    if (!ids.has(id)) ids.set(id, []);
    ids.get(id).push(path.relative(root, f).replace(/\\/g, "/"));
  }
}

const jsAll = jsFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");

function referenced(id) {
  if (jsAll.includes('"' + id + '"') || jsAll.includes("'" + id + "'")) return true;
  if (jsAll.includes("#" + id)) return true;
  // data attributes / dataset selectors less common
  return false;
}

function hasListenerHint(id) {
  const patterns = [
    new RegExp("getElementById\\([\"']" + id + "[\"']\\)[\\s\\S]{0,200}addEventListener"),
    new RegExp("getElementById\\([\"']" + id + "[\"']\\)[\\s\\S]{0,80}\\?\\.addEventListener"),
    new RegExp("el\\." + id + "[\\s\\S]{0,80}addEventListener"),
    new RegExp("['\"]#" + id + "['\"][\\s\\S]{0,120}addEventListener"),
    new RegExp("querySelector(All)?\\([\"']#" + id),
  ];
  return patterns.some((re) => re.test(jsAll));
}

const missing = [];
const noListener = [];
const ok = [];
for (const [id, locs] of [...ids.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (!referenced(id)) missing.push({ id, locs });
  else if (!hasListenerHint(id) && /^(btn|btn)/i.test(id)) noListener.push({ id, locs });
  else ok.push(id);
}

console.log("=== Boutons/inputs avec id :", ids.size);
console.log("=== Référencés + listener probable :", ok.length);
console.log("\n=== ID jamais mentionné dans le JS ===");
missing.forEach((x) => console.log("MISSING", x.id, "<=", x.locs.join(", ")));
console.log("\n=== btn* référencé mais pas de addEventListener évident ===");
noListener.forEach((x) => console.log("NOLISTENER", x.id, "<=", x.locs.join(", ")));
