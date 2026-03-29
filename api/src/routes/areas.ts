import { Router } from "express";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export const areasRouter = Router();

// Load area translations once at startup
let areaTranslations: Record<string, string> = {};
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const data = readFileSync(join(__dirname, "../lib/area_translations.json"), "utf-8");
  areaTranslations = JSON.parse(data);
} catch {
  console.warn("Could not load area_translations.json");
}

// Returns array of { hebrew, english } sorted by English name
areasRouter.get("/", (_req, res) => {
  const areas = Object.entries(areaTranslations)
    .map(([hebrew, english]) => ({ hebrew, english }))
    .sort((a, b) => a.english.localeCompare(b.english));
  res.json(areas);
});
