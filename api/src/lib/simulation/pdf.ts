/** PDF generation via Typst — shared by simulation and SITREP. */

import { buildTypstSource } from "./typst-template";
import { execFile } from "node:child_process";
import { writeFile, readFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// ─── Helpers ───

async function compileTypst(typstSource: string): Promise<Buffer> {
  const dir = join(tmpdir(), "geopol-" + randomUUID());
  await mkdir(dir, { recursive: true });
  const inputPath = join(dir, "report.typ");
  const outputPath = join(dir, "report.pdf");

  await writeFile(inputPath, typstSource, "utf-8");

  const pdf = await new Promise<Buffer>((resolve, reject) => {
    execFile("typst", ["compile", inputPath, outputPath], (error) => {
      if (error) {
        reject(new Error(`Typst compilation failed: ${error.message}`));
        return;
      }
      readFile(outputPath).then(resolve).catch(reject);
    });
  });

  await Promise.all([unlink(inputPath), unlink(outputPath)]).catch(() => {});
  return pdf;
}

function getSimulationSaveDir(): string {
  return process.env.SIMULATION_SAVE_DIR || join(process.cwd(), "data", "simulations");
}

function getSitrepSaveDir(): string {
  return process.env.SITREP_SAVE_DIR || join(process.cwd(), "data", "sitreps");
}

// ─── Simulation PDF ───

export async function generatePdf(params: {
  sessionId: string;
  createdAt: string;
  groundTruth: string;
  sitrep: Record<string, string> | null;
  forecasts: Record<string, unknown>;
  summary: unknown;
}): Promise<{ pdf: Buffer; typstSource: string }> {
  const typstSource = buildTypstSource({
    sessionId: params.sessionId,
    createdAt: params.createdAt,
    groundTruth: params.groundTruth,
    sitrep: params.sitrep,
    forecasts: params.forecasts,
    summary: params.summary,
  });

  const pdf = await compileTypst(typstSource);
  return { pdf, typstSource };
}

export async function saveSimulationPdf(pdf: Buffer, sessionId: string, createdAt: string): Promise<string> {
  const saveDir = getSimulationSaveDir();
  await mkdir(saveDir, { recursive: true });

  const ts = new Date(createdAt).toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const filename = `geopol-report-${ts}-${sessionId.slice(0, 8)}.pdf`;
  const filepath = join(saveDir, filename);
  await writeFile(filepath, pdf);
  return filepath;
}

// ─── SITREP PDF ───

function escapeTypst(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/#/g, "\\#")
    .replace(/\$/g, "\\$")
    .replace(/@/g, "\\@")
    .replace(/</g, "\\<")
    .replace(/>/g, "\\>");
}

function markdownToTypstSimple(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      // Headings
      const hm = line.match(/^(#{1,4})\s+(.*)$/);
      if (hm) return `${"=".repeat(hm[1].length + 1)} ${escapeTypst(hm[2])}`;
      // Bullets
      const bm = line.match(/^\s*[-*]\s+(.*)$/);
      if (bm) return `- ${escapeTypst(bm[1])}`;
      // Bold
      let out = line.replace(/\*\*([^*]+)\*\*/g, (_, t) => `*${escapeTypst(t)}*`);
      if (out === line) out = escapeTypst(out);
      return out;
    })
    .join("\n");
}

const SITREP_SECTION_TITLES: Record<string, string> = {
  key_takeaways: "Key Takeaways",
  coalition_ops: "Coalition / US Operations",
  iranian_ops: "Iranian Offensive Operations",
  strikes: "Strike Activity & Battle Damage Assessment",
  northern_front: "Northern Front (Lebanon / Hizballah)",
  gulf_states: "Gulf States & Strait of Hormuz",
  military_technical: "Military & Technical Assessment",
  trajectory: "Strategic Trajectory & Escalation Indicators",
  us_statements: "US Official Statements",
  israel_statements: "Israeli Official Statements",
  home_front: "Israeli Home Front",
  world_reaction: "International Reaction",
  osint_indicators: "OSINT Indicators",
  outlook: "12-24 Hour Outlook",
};

export function buildSitrepTypstSource(params: {
  content: string;
  sections?: Record<string, string>;
  generatedAt: string;
}): string {
  const generatedAtIST = new Date(params.generatedAt).toLocaleString("en-GB", {
    timeZone: "Asia/Jerusalem",
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }) + " IST";
  const generatedAtUTC = new Date(params.generatedAt).toUTCString();

  let body = "";

  if (params.sections && Object.keys(params.sections).length > 0) {
    // Structured SITREP with sections
    for (const [key, title] of Object.entries(SITREP_SECTION_TITLES)) {
      const content = params.sections[key];
      if (!content) continue;

      if (key === "key_takeaways") {
        body += `
== ${title}

#block(inset: 12pt, radius: 4pt, fill: rgb("#edf2f7"), stroke: (left: 3pt + rgb("#1a365d")), width: 100%)[
${markdownToTypstSimple(content)}
]

`;
      } else if (key === "outlook") {
        body += `
== ${title}

#block(inset: 12pt, radius: 4pt, fill: rgb("#fffff0"), stroke: (left: 3pt + rgb("#d69e2e")), width: 100%)[
${markdownToTypstSimple(content)}
]

`;
      } else {
        body += `
== ${title}

${markdownToTypstSimple(content)}

`;
      }
    }
  } else {
    // Plain text SITREP
    body = markdownToTypstSimple(params.content);
  }

  return `
#set document(title: "Situation Report", author: "Red Alert Stack")
#set page(
  paper: "a4",
  margin: (top: 2.5cm, bottom: 2.5cm, left: 2cm, right: 2cm),
  footer: context {
    let current = counter(page).get().first()
    let total = counter(page).final().first()
    set text(font: "IBM Plex Sans", size: 8pt, fill: rgb("#999"))
    grid(
      columns: (1fr, 1fr),
      align(left)[${generatedAtIST} / ${generatedAtUTC}],
      align(right)[Page #current of #total],
    )
  },
)
#set text(font: "IBM Plex Sans", size: 10.5pt)
#set par(justify: true, leading: 0.75em)
#show heading.where(level: 1): it => { v(0.5cm); it; v(0.3cm) }
#show heading.where(level: 2): it => { v(0.3cm); it; v(0.2cm) }

// Title
#align(center)[
  #text(size: 10pt, fill: rgb("#999"), tracking: 0.15em, weight: "medium")[RED ALERT MONITORING STACK]
  #v(0.5cm)
  #line(length: 40%, stroke: 1pt + rgb("#e2e8f0"))
  #v(0.5cm)
  #text(size: 22pt, weight: "bold", fill: rgb("#1a365d"))[Situation Report]
  #v(0.3cm)
  #text(size: 11pt, fill: rgb("#718096"))[${generatedAtIST}]
  #v(0.1cm)
  #text(size: 9pt, fill: rgb("#999"))[${generatedAtUTC}]
]

#v(1cm)

= SITREP

${body}

#v(1cm)
#line(length: 100%, stroke: 0.5pt + rgb("#e2e8f0"))
#text(size: 8pt, fill: rgb("#999"))[Generated by Red Alert Monitoring Stack \\— ${generatedAtIST}]
`;
}

export async function generateSitrepPdf(params: {
  content: string;
  sections?: Record<string, string>;
  generatedAt?: string;
}): Promise<Buffer> {
  const generatedAt = params.generatedAt || new Date().toISOString();
  const typstSource = buildSitrepTypstSource({
    content: params.content,
    sections: params.sections,
    generatedAt,
  });
  return compileTypst(typstSource);
}

export async function saveSitrepPdf(pdf: Buffer, generatedAt?: string): Promise<string> {
  const saveDir = getSitrepSaveDir();
  await mkdir(saveDir, { recursive: true });

  const ts = (generatedAt ? new Date(generatedAt) : new Date())
    .toISOString()
    .slice(0, 16)
    .replace(/[T:]/g, "-");
  const filename = `sitrep-${ts}.pdf`;
  const filepath = join(saveDir, filename);
  await writeFile(filepath, pdf);
  return filepath;
}
