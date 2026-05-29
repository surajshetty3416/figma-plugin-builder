import { readFileSync, writeFileSync } from "fs";

const template = readFileSync("src/ui/index.html", "utf8");
const styles   = readFileSync("src/ui/style.css",  "utf8");
const script   = readFileSync("src/ui/script.js",  "utf8");

const html = template
  .replace("/* STYLES */", styles)
  .replace("/* SCRIPT */", script);

writeFileSync("ui.html", html);
console.log("✓ ui.html assembled");
