import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { JobStore } from "./db.js";
import { LibraryPublisher } from "./library-publisher.js";
import { libraryDomains, librarySubcategories, type LibraryClassification } from "./library.js";

const config = loadConfig();
const store = new JobStore(config.databasePath);
const planPath = path.join(config.dataDir, "library-classification-plan.json");
const mode = process.argv.includes("--apply") ? "apply" : "dry-run";

if (mode === "dry-run") {
  const client = new OpenAI({ apiKey: config.openAiApiKey });
  const proposals: Array<{ captureId: string; classification: LibraryClassification; breadcrumb: string }> = [];
  for (const capture of store.listAllCaptures()) {
    const response = await client.responses.create({
      model: config.analysisModel,
      instructions: `Classify the social capture into the controlled knowledge library. Domains: ${libraryDomains.join(", ")}. Subcategories: ${librarySubcategories.join(", ")}. Destination-planning restaurants belong to Travel. Recipes and general food knowledge belong to Food & Drink. Use country and city only when supported. Use Other and confidence below 0.65 when uncertain.`,
      input: `Title: ${capture.title}\nSynopsis: ${capture.synopsis}\nTopics: ${capture.topics.join(", ")}\nDescription: ${capture.description ?? ""}\nTranscript: ${capture.transcript.slice(0, 12000)}`,
      text: { format: { type: "json_schema", name: "library_classification", strict: true, schema: { type: "object", additionalProperties: false, required: ["primaryDomain", "country", "city", "subcategory", "secondaryTopics", "confidence"], properties: { primaryDomain: { type: "string", enum: libraryDomains }, country: { type: ["string", "null"] }, city: { type: ["string", "null"] }, subcategory: { type: "string", enum: librarySubcategories }, secondaryTopics: { type: "array", items: { type: "string" }, maxItems: 8 }, confidence: { type: "number", minimum: 0, maximum: 1 } } } } },
    });
    const classification = z.object({ primaryDomain: z.enum(libraryDomains), country: z.string().nullable(), city: z.string().nullable(), subcategory: z.enum(librarySubcategories), secondaryTopics: z.array(z.string()).max(8), confidence: z.number().min(0).max(1) }).parse(JSON.parse(response.output_text));
    const parts = classification.confidence < 0.65 || classification.primaryDomain === "Other" ? ["Unclassified"] : [classification.primaryDomain, ...(classification.primaryDomain === "Travel" ? [classification.country, classification.city].filter(Boolean) : []), classification.subcategory];
    proposals.push({ captureId: capture.id, classification, breadcrumb: parts.join(" → ") });
    console.log(`${capture.title}: ${parts.join(" → ")} (${Math.round(classification.confidence * 100)}%)`);
  }
  await writeFile(planPath, JSON.stringify({ createdAt: new Date().toISOString(), proposals }, null, 2), "utf8");
  console.log(`Recorded ${proposals.length} proposals at ${planPath}`);
} else {
  const plan = JSON.parse(await readFile(planPath, "utf8")) as { proposals: Array<{ captureId: string; classification: LibraryClassification }> };
  const captures = store.listAllCaptures();
  if (plan.proposals.length !== captures.length) throw new Error("Classification plan does not match the current catalog; run dry-run again");
  await mkdir(path.join(config.vaultDir, "Social Knowledge", "Captures"), { recursive: true });
  for (const proposal of plan.proposals) {
    const capture = store.getCapture(proposal.captureId); if (!capture) throw new Error(`Missing capture ${proposal.captureId}`);
    const filename = `${slug(capture.platform)}-${slug(capture.sourceId)}.md`;
    const relative = path.join("Social Knowledge", "Captures", filename);
    if (capture.notePath !== relative) await rename(path.join(config.vaultDir, capture.notePath), path.join(config.vaultDir, relative));
    store.replaceCaptureAnalysis(capture.id, { ...capture.analysis, classification: proposal.classification }, relative);
    store.assignClassification(capture.id, proposal.classification, "automatic", false);
  }
  const publisher = new LibraryPublisher(store, config.vaultDir);
  for (const capture of captures) await publisher.refreshCapture(capture.id);
  await publisher.regenerateAll();
  console.log(`Migrated ${captures.length} captures and generated library maps`);
}
store.close();

function slug(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "unknown";
}
