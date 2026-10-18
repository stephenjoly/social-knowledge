import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { hash } from "@node-rs/argon2";
import type { AppConfig } from "../src/config.js";
import { JobStore } from "../src/db.js";
import type { AnalysisResult } from "../src/types.js";

export const fixtureAccount = {
  username: "stephen",
  password: "a-strong-design-review-password",
  displayName: "Stephen",
};

type SeedCapture = {
  slug: string;
  platform: "instagram" | "facebook";
  sourceType: "video" | "image";
  title: string;
  creator: string;
  domain: string;
  subcategory: string;
  topics: string[];
  synopsis: string;
  whyUseful: string;
  takeaways: string[];
  recommendations: string[];
  claims: string[];
  entities: Array<{ name: string; type: string; location: string | null }>;
  sourceLanguage: string;
  translationLanguage: string | null;
  durationSeconds: number;
  ageMinutes: number;
};

const captures: SeedCapture[] = [
  {
    slug: "pastel-de-nata",
    platform: "instagram",
    sourceType: "video",
    title: "Pastel de nata: the bakery locals actually queue for",
    creator: "lisbonfoodie",
    domain: "Travel",
    subcategory: "Lisbon",
    topics: ["restaurants", "pastry"],
    synopsis:
      "Manteigaria in Chiado makes the pastel de nata locals rate above the famous Belem version.",
    whyUseful: "Names a specific bakery and the best time to arrive.",
    takeaways: [
      "Fresh batches come out every 20 to 30 minutes; ask for one from the newest tray.",
      "The Chiado shop is faster than the Time Out Market branch.",
      "Each tart is about EUR 1.30 and a box of six travels well for a day.",
    ],
    recommendations: [
      "Add Manteigaria on Rua do Loreto to the Lisbon trip list.",
      "Compare it with Pasteis de Belem on the same morning if there is time.",
    ],
    claims: ["Open until midnight every day. Opening hours may have changed."],
    entities: [
      { name: "Manteigaria", type: "place", location: "Chiado, Lisbon" },
      { name: "Pasteis de Belem", type: "place", location: "Belem, Lisbon" },
    ],
    sourceLanguage: "pt",
    translationLanguage: "en",
    durationSeconds: 48,
    ageMinutes: 310,
  },
  {
    slug: "deadlift-mistakes",
    platform: "instagram",
    sourceType: "video",
    title: "The 3 mistakes quietly ruining your deadlift",
    creator: "coachmarta",
    domain: "Health & Wellness",
    subcategory: "Strength Training",
    topics: ["strength training", "technique"],
    synopsis: "Three setup errors that cost power and strain the lower back.",
    whyUseful: "Gives a concrete cue for each mistake.",
    takeaways: [
      "Set the bar over mid-foot before gripping, not against the shins.",
      "Brace by pushing out against the belt line rather than sucking in.",
      "Finish by squeezing the glutes instead of leaning back at the top.",
    ],
    recommendations: ["Film a set from the side and check bar path."],
    claims: [],
    entities: [],
    sourceLanguage: "en",
    translationLanguage: null,
    durationSeconds: 62,
    ageMinutes: 1500,
  },
  {
    slug: "miso-salmon",
    platform: "facebook",
    sourceType: "video",
    title: "One-pan miso salmon in 15 minutes",
    creator: "weeknightkitchen",
    domain: "Food & Cooking",
    subcategory: "Weeknight",
    topics: ["weeknight", "fish"],
    synopsis: "A miso and maple glaze that caramelises under the grill.",
    whyUseful: "Short ingredient list with pantry staples.",
    takeaways: [
      "Mix white miso, maple syrup, and rice vinegar in equal parts.",
      "Grill on the top shelf for six minutes without turning the fish.",
    ],
    recommendations: ["Serve with the greens already in the fridge."],
    claims: [],
    entities: [],
    sourceLanguage: "en",
    translationLanguage: null,
    durationSeconds: 54,
    ageMinutes: 1800,
  },
  {
    slug: "weekly-planning",
    platform: "instagram",
    sourceType: "video",
    title: "How I plan my whole week in 20 minutes",
    creator: "calmproductive",
    domain: "Productivity",
    subcategory: "Weekly planning",
    topics: ["weekly planning", "focus"],
    synopsis: "A Sunday review that fits in one sitting.",
    whyUseful: "Turns a vague review habit into a timed checklist.",
    takeaways: [
      "List the three outcomes that would make the week a success.",
      "Block the hardest task first thing on two mornings.",
    ],
    recommendations: ["Try the three-outcome list next Sunday."],
    claims: [],
    entities: [],
    sourceLanguage: "en",
    translationLanguage: null,
    durationSeconds: 71,
    ageMinutes: 2900,
  },
  {
    slug: "zone-2-cardio",
    platform: "instagram",
    sourceType: "video",
    title: "Zone 2 cardio, explained without the jargon",
    creator: "drlenahart",
    domain: "Health & Wellness",
    subcategory: "Zone 2",
    topics: ["zone 2", "endurance"],
    synopsis: "Why easy aerobic work builds the base for everything else.",
    whyUseful: "Gives a talk-test rule instead of a heart-rate formula.",
    takeaways: [
      "You should be able to hold a conversation the whole session.",
      "Three sessions of 45 minutes a week is a sensible starting point.",
    ],
    recommendations: ["Add one easy 45 minute session this week."],
    claims: ["Burns the most fat of any training zone. Worth checking."],
    entities: [],
    sourceLanguage: "en",
    translationLanguage: null,
    durationSeconds: 83,
    ageMinutes: 4300,
  },
  {
    slug: "lisboetas-eat",
    platform: "instagram",
    sourceType: "video",
    title: "Where Lisboetas actually eat",
    creator: "eatlisboa",
    domain: "Travel",
    subcategory: "Lisbon",
    topics: ["restaurants"],
    synopsis: "Small plates spots that take no bookings.",
    whyUseful: "Names arrival times that avoid the queue.",
    takeaways: [
      "Taberna da Rua das Flores takes no bookings; arrive at 7pm.",
      "Campo de Ourique market is calmer than Time Out at lunch.",
    ],
    recommendations: ["Plan dinner for 7pm on the first night."],
    claims: [],
    entities: [
      {
        name: "Taberna da Rua das Flores",
        type: "place",
        location: "Bairro Alto, Lisbon",
      },
    ],
    sourceLanguage: "pt",
    translationLanguage: "en",
    durationSeconds: 65,
    ageMinutes: 6000,
  },
  {
    slug: "index-funds",
    platform: "instagram",
    sourceType: "video",
    title: "Index funds, explained in one minute",
    creator: "plainmoney",
    domain: "Personal Finance",
    subcategory: "Index funds",
    topics: ["index funds", "investing"],
    synopsis: "What a total-market fund holds and why fees matter.",
    whyUseful: "Compares two real expense ratios.",
    takeaways: ["A 0.8 percent fee compounds into real money over 20 years."],
    recommendations: ["Check the expense ratio on the current pension fund."],
    claims: [],
    entities: [],
    sourceLanguage: "en",
    translationLanguage: null,
    durationSeconds: 58,
    ageMinutes: 8600,
  },
  {
    slug: "houseplants",
    platform: "facebook",
    sourceType: "image",
    title: "The only three houseplants that survive a dark flat",
    creator: "leafandlight",
    domain: "Home & DIY",
    subcategory: "Houseplants",
    topics: ["houseplants"],
    synopsis: "Low-light plants that tolerate irregular watering.",
    whyUseful: "Matches plants to a north-facing room.",
    takeaways: ["ZZ plants tolerate three weeks without water."],
    recommendations: [],
    claims: [],
    entities: [],
    sourceLanguage: "en",
    translationLanguage: null,
    durationSeconds: 0,
    ageMinutes: 11000,
  },
];

function analysisFor(seed: SeedCapture): AnalysisResult {
  return {
    title: seed.title,
    synopsis: seed.synopsis,
    whyUseful: seed.whyUseful,
    takeaways: seed.takeaways,
    topics: seed.topics,
    entities: seed.entities.map((entity) => ({
      ...entity,
      description: null,
    })),
    recommendations: seed.recommendations,
    claimsNeedingVerification: seed.claims,
    evidence: [],
    classification: {
      primaryDomain: seed.domain,
      country: seed.domain === "Travel" ? "Portugal" : null,
      city: seed.subcategory === "Lisbon" ? "Lisbon" : null,
      subcategory: seed.subcategory,
      secondaryTopics: seed.topics,
      confidence: 0.9,
    },
  } as AnalysisResult;
}

/**
 * Fills a disposable store with a synthetic archive dense enough to review every
 * redesigned screen. Never point this at a real database.
 */
export async function seedUiFixture(store: JobStore, config: AppConfig) {
  const user = store.createUser(
    fixtureAccount.username,
    await hash(fixtureAccount.password),
  );
  store.updateProfile(user.id, {
    displayName: fixtureAccount.displayName,
    avatarColor: "#3f6b52",
  });

  for (const seed of captures) {
    const sourceUrl =
      seed.platform === "instagram"
        ? `https://www.instagram.com/reel/${seed.slug}/`
        : `https://www.facebook.com/share/r/${seed.slug}/`;
    const { job } = store.createOrGet({
      ownerUserId: user.id,
      sourceUrl,
      normalizedUrl: sourceUrl,
      sourceHash: `fixture-${seed.slug}`,
      userNote: "",
    });
    const notePath = `Social Knowledge/Captures/${seed.slug}.md`;
    const noteFile = path.join(config.vaultDir, notePath);
    await mkdir(path.dirname(noteFile), { recursive: true });
    await writeFile(
      noteFile,
      `# ${seed.title}\n\n${seed.synopsis}\n\n## Key takeaways\n\n${seed.takeaways
        .map((line) => `- ${line}`)
        .join("\n")}\n`,
    );
    const capture = store.createCapture({
      job,
      sourceType: seed.sourceType,
      sourceId: seed.slug,
      platform: seed.platform,
      title: seed.title,
      creator: seed.creator,
      creatorUrl: null,
      description: seed.synopsis,
      transcript: `${seed.synopsis} ${seed.takeaways.join(" ")}`,
      sourceLanguage: seed.sourceLanguage,
      translatedTranscript: seed.translationLanguage ? seed.synopsis : null,
      translationLanguage: seed.translationLanguage,
      comments: [],
      analysis: analysisFor(seed),
      publishedAt: null,
      durationSeconds: seed.durationSeconds || null,
      notePath,
      assets: [],
    })!;
    store.assignClassification(capture.id, capture.analysis.classification);
    store.setDisplayTitle(job.id, seed.title);
    store.complete(job.id, notePath);
  }

  // Work in flight, so Activity and the sidebar processing card have live state.
  const transcribing = store.createOrGet({
    ownerUserId: user.id,
    sourceUrl: "https://www.instagram.com/reel/fixture-in-flight/",
    normalizedUrl: "https://www.instagram.com/reel/fixture-in-flight/",
    sourceHash: "fixture-in-flight",
    userNote: "",
  }).job;
  store.setDisplayTitle(transcribing.id, "Alfama at golden hour");
  store.setStatus(transcribing.id, "transcribing");

  const downloading = store.createOrGet({
    ownerUserId: user.id,
    sourceUrl: "https://www.instagram.com/reel/fixture-downloading/",
    normalizedUrl: "https://www.instagram.com/reel/fixture-downloading/",
    sourceHash: "fixture-downloading",
    userNote: "",
  }).job;
  store.setDisplayTitle(downloading.id, "A perfect Sintra day");
  store.setStatus(downloading.id, "downloading");

  store.createOrGet({
    ownerUserId: user.id,
    sourceUrl: "https://www.instagram.com/p/fixture-queued/",
    normalizedUrl: "https://www.instagram.com/p/fixture-queued/",
    sourceHash: "fixture-queued",
    userNote: "",
  });

  const failed = store.createOrGet({
    ownerUserId: user.id,
    sourceUrl: "https://www.facebook.com/share/r/fixture-failed/",
    normalizedUrl: "https://www.facebook.com/share/r/fixture-failed/",
    sourceHash: "fixture-failed",
    userNote: "",
  }).job;
  store.fail(
    failed.id,
    {
      code: "platform_session_expired",
      title: "Facebook session expired",
      message: "New Facebook captures will fail until you reconnect.",
      diagnostic: "fixture: synthetic session expiry",
    },
    1,
  );

  store.updatePreferences(user.id, {
    defaultLanguage: "English",
    translateForeign: true,
  });

  store.createApiKey(
    user.id,
    "iPhone Shortcut",
    await hash("fixture-shortcut-key"),
    "sk_live_7Q2c",
  );
  store.createApiKey(
    user.id,
    "Obsidian sync script",
    await hash("fixture-obsidian-key"),
    "sk_live_aa91",
  );

  store.registerOAuthClient({
    clientId: "11111111-1111-4111-8111-111111111111",
    name: "Claude",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  });
  store.createOAuthGrant({
    userId: user.id,
    clientId: "11111111-1111-4111-8111-111111111111",
    scope: "archive.read",
  });
  store.registerOAuthClient({
    clientId: "22222222-2222-4222-8222-222222222222",
    name: "ChatGPT",
    redirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
  });
  store.createOAuthGrant({
    userId: user.id,
    clientId: "22222222-2222-4222-8222-222222222222",
    scope: "archive.read",
  });

  store.createKnowledgeExport(user.id, true, true, "full");

  return user;
}
