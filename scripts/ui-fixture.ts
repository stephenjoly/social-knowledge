import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { hash } from "@node-rs/argon2";
import type { AppConfig } from "../src/config.js";
import { JobStore } from "../src/db.js";
import type { AnalysisResult } from "../src/types.js";
import { normalizeSubmissionUrl } from "../src/url.js";

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
  entities: Array<{ name: string; type: AnalysisResult["entities"][number]["type"]; location: string | null }>;
  sourceLanguage: string;
  translationLanguage: string | null;
  durationSeconds: number;
  ageMinutes: number;
  commentCount?: number;
  confidence?: number;
};

/** A thinner seed for captures that only need to exist in the knowledge base. */
function brief(
  slug: string,
  title: string,
  creator: string,
  domain: string,
  subcategory: string,
  ageMinutes: number,
  takeaways: string[] = [],
  extra: Partial<SeedCapture> = {},
): SeedCapture {
  return {
    slug,
    platform: "instagram",
    sourceType: "video",
    title,
    creator,
    domain,
    subcategory,
    topics: [subcategory.toLowerCase()],
    synopsis: title,
    whyUseful: "",
    takeaways,
    recommendations: [],
    claims: [],
    entities: [],
    sourceLanguage: "en",
    translationLanguage: null,
    durationSeconds: 45,
    ageMinutes,
    ...extra,
  };
}

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
      "Manteigaria in Chiado makes the pastel de nata locals rate above the famous Belém version.",
    whyUseful: "Go before 10am, eat it warm at the counter, and add cinnamon, not sugar.",
    takeaways: [
      "Fresh batches come out every 20 to 30 minutes; ask for one from the newest tray.",
      "The Chiado shop is faster than the Time Out Market branch.",
      "€1.30 each; a box of six travels well for about a day.",
    ],
    recommendations: [
      "Add Manteigaria (Rua do Loreto 2) to the Lisbon trip list.",
      "Compare with Pastéis de Belém on the same day if you have time.",
    ],
    claims: ["“Open until midnight every day.” Opening hours may have changed."],
    entities: [
      { name: "Manteigaria", type: "place", location: "Chiado, Lisbon" },
      { name: "Pastéis de Belém", type: "place", location: "Belém, Lisbon" },
    ],
    sourceLanguage: "pt",
    translationLanguage: "en",
    durationSeconds: 48,
    ageMinutes: 310,
    commentCount: 12,
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
      "Taberna da Rua das Flores takes no bookings. Arrive at 7pm or expect an hour's wait.",
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
  // Knowledge base density: the rest of the Lisbon topic, a few more topics per
  // category for the home cards, and captures the AI could not place.
  brief(
    "lisbon-tourist-traps",
    "Lisbon tourist traps (and what to do instead)",
    "slowtravelpt",
    "Travel",
    "Lisbon",
    7000,
    [
      "Skip Time Out Market at lunch; go mid-afternoon or eat in Campo de Ourique instead.",
      "Tram 28 is quieter before 9am or from the Martim Moniz end.",
    ],
    { platform: "facebook", topics: ["restaurants"] },
  ),
  brief(
    "sintra-day",
    "A perfect Sintra day",
    "wanderingana",
    "Travel",
    "Lisbon",
    9000,
    [
      "Sintra is best as an early weekday train trip. Buy palace tickets online the night before.",
      "Walk down from Pena rather than queueing for the shuttle bus.",
    ],
    { topics: ["day trips"] },
  ),
  brief("alfama-golden-hour", "Alfama at golden hour", "lisboalight", "Travel", "Lisbon", 10000, [], {
    topics: ["neighbourhoods"],
  }),
  brief("kyoto-temples", "Kyoto temples before the crowds", "slowjapan", "Travel", "Kyoto", 12000),
  brief("carry-on-packing", "Packing a week into one carry-on", "lightpacker", "Travel", "Packing", 12100),
  brief("deadlift-cues", "Two cues that fixed my deadlift lockout", "coachmarta", "Health & Wellness", "Strength Training", 12200),
  brief("zone-2-pace", "Finding your Zone 2 pace without a monitor", "drlenahart", "Health & Wellness", "Zone 2", 12300),
  brief("sleep-routine", "A wind-down routine for better sleep", "sleepwell", "Health & Wellness", "Sleep", 12400),
  brief("hip-hinge", "Learning the hip hinge with a dowel", "coachmarta", "Health & Wellness", "Strength Training", 12410),
  brief("zone-2-walks", "Incline walking as Zone 2", "drlenahart", "Health & Wellness", "Zone 2", 12420),
  brief("caffeine-cutoff", "When to stop caffeine for better sleep", "sleepwell", "Health & Wellness", "Sleep", 12430),
  brief("tray-bake", "Three weeknight tray bakes", "weeknightkitchen", "Food & Cooking", "Weeknight", 12500),
  brief("focaccia", "No-knead focaccia", "breadathome", "Food & Cooking", "Baking", 12600),
  brief("miso-butter", "Miso butter, five ways", "umamiclub", "Food & Cooking", "Miso", 12700),
  brief("weekly-review", "The Friday review that sets up Monday", "calmproductive", "Productivity", "Weekly planning", 12800),
  brief("planning-template", "A one-page weekly planning template", "calmproductive", "Productivity", "Weekly planning", 12850),
  brief("deep-focus", "Ninety-minute focus blocks", "deepworkdaily", "Productivity", "Focus", 12900),
  brief("index-fund-fees", "What index fund fees really cost", "plainmoney", "Personal Finance", "Index funds", 13000),
  brief("budget-buckets", "A three-bucket budget", "plainmoney", "Personal Finance", "Budgeting", 13100),
  brief("tap-washer", "Fix a dripping tap in ten minutes", "fixitfriday", "Home & DIY", "Repairs", 13200),
  brief("desk-mobility", "A 10-minute mobility flow for desk workers", "movedaily", "Other", "Other", 13300, [], { confidence: 0.4 }),
  brief("starter-smell", "Why your sourdough starter smells like nail polish", "breadathome", "Other", "Other", 13400, [], { confidence: 0.4 }),
  brief("museum-pass", "The museum pass that actually pays for itself", "citysaver", "Other", "Other", 13500, [], { confidence: 0.4 }),
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
      confidence: 0.9,
    })),
    recommendations: seed.recommendations,
    claimsNeedingVerification: seed.claims,
    evidence: [],
    classification: {
      primaryDomain: seed.domain,
      country: seed.subcategory === "Lisbon" ? "Portugal" : null,
      city: seed.subcategory === "Lisbon" ? "Lisbon" : null,
      subcategory: seed.subcategory,
      secondaryTopics: seed.topics,
      confidence: seed.confidence ?? 0.9,
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

  const ensureLibraryNode = (parentId: string | null, label: string, kind: string): string =>
    store["ensureLibraryNode"](parentId, label, kind);
  const lisbonNodeId = ensureLibraryNode(
    ensureLibraryNode(null, "Travel", "domain"),
    "Lisbon",
    "city",
  );

  for (const seed of captures) {
    const sourceUrl =
      seed.platform === "instagram"
        ? `https://www.instagram.com/reel/${seed.slug}/`
        : `https://www.facebook.com/share/r/${seed.slug}/`;
    const { job } = store.createOrGet({
      ownerUserId: user.id,
      sourceUrl,
      normalizedUrl: sourceUrl,
      sourceHash: normalizeSubmissionUrl(sourceUrl).hash,
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
    // Two local synthetic images exercise stored-thumbnail delivery; the rest
    // deliberately have no image so fallback coverage remains deterministic.
    const thumbnail = captures.indexOf(seed) < 2
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="${seed.slug === "pastel-de-nata" ? "#e6bd73" : "#628d91"}"/><circle cx="120" cy="80" r="46" fill="#674b35"/></svg>`
      : null;
    const thumbnailPath = path.join(config.mediaDir, `${seed.slug}-thumbnail.svg`);
    if (thumbnail) {
      await mkdir(config.mediaDir, { recursive: true });
      await writeFile(thumbnailPath, thumbnail);
    }
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
      comments: Array.from({ length: seed.commentCount ?? 0 }, (_, index) => ({
        author: `reader${index + 1}`,
        text: `Synthetic comment ${index + 1} about ${seed.title}.`,
        likeCount: 12 - index,
        isPinned: index === 0,
      })),
      analysis: analysisFor(seed),
      publishedAt: null,
      durationSeconds: seed.durationSeconds || null,
      notePath,
      assets: thumbnail ? [{
        kind: "thumbnail", path: thumbnailPath, mimeType: "image/svg+xml",
        sizeBytes: Buffer.byteLength(thumbnail), position: 0,
      }] : [],
    })!;
    store.database
      .prepare("UPDATE captures SET created_at=? WHERE id=?")
      .run(new Date(Date.now() - seed.ageMinutes * 60_000).toISOString(), capture.id);
    // The drawings file Lisbon directly under Travel as a place, which the
    // automatic classifier only reaches through a country node.
    if (seed.domain === "Travel" && seed.subcategory === "Lisbon")
      store.moveCapture(capture.id, lisbonNodeId);
    else store.assignClassification(capture.id, capture.analysis.classification);
    store.setDisplayTitle(job.id, seed.title);
    for (const status of ["downloading", "processing", "transcribing"] as const)
      store.setStatus(job.id, status);
    store.complete(job.id, notePath);
  }

  // Work in flight, so Activity and the sidebar processing card have live state.
  // Created oldest first, a few milliseconds apart, so Activity lists them in a
  // stable newest-first order.
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  const failed = store.createOrGet({
    ownerUserId: user.id,
    sourceUrl: "https://www.facebook.com/share/r/fixture-failed/",
    normalizedUrl: "https://www.facebook.com/share/r/fixture-failed/",
    sourceHash: normalizeSubmissionUrl("https://www.facebook.com/share/r/fixture-failed/").hash,
    userNote: "",
  }).job;
  store.setStatus(failed.id, "downloading");
  store.fail(
    failed.id,
    {
      code: "authentication_required",
      title: "Facebook session expired",
      message: "New Facebook captures will fail until you reconnect.",
      diagnostic: "fixture: synthetic session expiry",
    },
    0,
  );
  await tick();

  store.createOrGet({
    ownerUserId: user.id,
    sourceUrl: "https://www.instagram.com/p/fixture-queued/",
    normalizedUrl: "https://www.instagram.com/p/fixture-queued/",
    sourceHash: normalizeSubmissionUrl("https://www.instagram.com/p/fixture-queued/").hash,
    userNote: "",
  });
  await tick();

  const downloading = store.createOrGet({
    ownerUserId: user.id,
    sourceUrl: "https://www.instagram.com/reel/fixture-downloading/",
    normalizedUrl: "https://www.instagram.com/reel/fixture-downloading/",
    sourceHash: normalizeSubmissionUrl("https://www.instagram.com/reel/fixture-downloading/").hash,
    userNote: "",
  }).job;
  store.setDisplayTitle(downloading.id, "How I plan my whole week in 20 minutes");
  store.setStatus(downloading.id, "downloading");
  await tick();

  const transcribing = store.createOrGet({
    ownerUserId: user.id,
    sourceUrl: "https://www.instagram.com/reel/fixture-in-flight/",
    normalizedUrl: "https://www.instagram.com/reel/fixture-in-flight/",
    sourceHash: normalizeSubmissionUrl("https://www.instagram.com/reel/fixture-in-flight/").hash,
    userNote: "",
  }).job;
  store.setDisplayTitle(
    transcribing.id,
    "Pastel de nata: the bakery locals actually queue for",
  );
  store.setStatus(transcribing.id, "downloading");
  store.setStatus(transcribing.id, "processing");
  store.setStatus(transcribing.id, "transcribing");

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

  await seedSettingsFixture(store, user.id);

  return user;
}

const isoAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();
const isoAhead = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

/**
 * Settings state drawn in screens 10–15: a connected OpenAI key, an expired
 * Facebook session, two more members, open invitations, and used keys. Every
 * credential is a placeholder that no provider would accept.
 */
async function seedSettingsFixture(store: JobStore, ownerId: string) {
  const db = store.database;

  store.saveAiProviderConnection(
    ownerId,
    "openai",
    "fixture-not-a-real-ciphertext",
    "sk-fx…a91F",
  );
  db.prepare(
    "UPDATE ai_provider_connections SET verified_at=?,updated_at=? WHERE user_id=? AND provider='openai'",
  ).run(isoAgo(36 * 24 * 60), isoAgo(36 * 24 * 60), ownerId);
  store.saveAiTaskSelections(ownerId, {
    transcriptionProvider: "openai",
    transcriptionModel: "gpt-4o-transcribe",
    analysisProvider: "openai",
    analysisModel: "gpt-6-luna",
    analysisThinkingLevel: "medium",
  });

  store.savePlatformConnection(ownerId, "instagram", "fixture-not-a-real-ciphertext", 14);
  db.prepare(
    "UPDATE platform_connections SET last_validated_at=?,last_used_at=? WHERE user_id=? AND platform='instagram'",
  ).run(isoAgo(3 * 24 * 60), isoAgo(5 * 60), ownerId);
  store.savePlatformConnection(ownerId, "facebook", "fixture-not-a-real-ciphertext", 9);
  store.markPlatformConnectionAttention(ownerId, "facebook", "platform_session_expired");
  db.prepare(
    "UPDATE platform_connections SET updated_at=? WHERE user_id=? AND platform='facebook'",
  ).run(isoAgo(4 * 24 * 60), ownerId);

  const ownerJoined = isoAgo(220 * 24 * 60);
  db.prepare("UPDATE users SET created_at=? WHERE id=?").run(ownerJoined, ownerId);
  const members = [
    { username: "maya", displayName: "Maya Chen", colour: "#4f6fa8", joinedDaysAgo: 120 },
    { username: "joao", displayName: "João Ribeiro", colour: "#c08a3e", joinedDaysAgo: 45 },
  ];
  for (const member of members) {
    const created = store.createUser(
      member.username,
      await hash(`fixture-${member.username}-password`),
      "member",
    );
    store.updateProfile(created.id, {
      displayName: member.displayName,
      avatarColor: member.colour,
    });
    db.prepare("UPDATE users SET created_at=? WHERE id=?").run(
      isoAgo(member.joinedDaysAgo * 24 * 60),
      created.id,
    );
  }
  store.createInvitation({
    createdByUserId: ownerId,
    role: "member",
    tokenHash: "fixture-member-invitation",
    expiresAt: isoAhead(20 * 60),
  });
  store.createInvitation({
    createdByUserId: ownerId,
    role: "admin",
    tokenHash: "fixture-admin-invitation",
    expiresAt: isoAhead(3 * 60),
  });
  db.prepare("UPDATE invitations SET created_at=? WHERE token_hash=?").run(
    isoAgo(21 * 60),
    "fixture-admin-invitation",
  );
  db.prepare("UPDATE invitations SET created_at=? WHERE token_hash=?").run(
    isoAgo(4 * 60),
    "fixture-member-invitation",
  );

  store.createApiKey(ownerId, "Old laptop", await hash("fixture-laptop-key"), "sk_live_0f3d");
  const keyTimes: Record<string, [number, number | null]> = {
    "iPhone Shortcut": [27 * 24 * 60, 2 * 60],
    "Obsidian sync script": [76 * 24 * 60, 12 * 24 * 60],
    "Old laptop": [139 * 24 * 60, null],
  };
  for (const [name, [createdAgo, usedAgo]] of Object.entries(keyTimes))
    db.prepare(
      "UPDATE api_keys SET created_at=?,last_used_at=? WHERE user_id=? AND name=?",
    ).run(isoAgo(createdAgo), usedAgo === null ? null : isoAgo(usedAgo), ownerId, name);

  const pending = store.listKnowledgeExports(ownerId, "full") as Array<{ id: string }>;
  const older = store.createKnowledgeExport(ownerId, true, true, "full");
  const backups: Array<[string, number, number]> = [
    ...pending.map((item): [string, number, number] => [item.id, 2 * 60, 8]),
    [older.id, 19 * 60, 8],
  ];
  for (const [id, createdAgo, captureCount] of backups) {
    store.completeKnowledgeExport(ownerId, id, "fixture-not-a-real-archive.zip", captureCount);
    db.prepare("UPDATE knowledge_exports SET created_at=?,expires_at=? WHERE id=?").run(
      isoAgo(createdAgo),
      isoAhead(24 * 60 - createdAgo),
      id,
    );
  }

  const oauthTimes: Record<string, [number, number]> = {
    "11111111-1111-4111-8111-111111111111": [16 * 24 * 60, 2 * 60],
    "22222222-2222-4222-8222-222222222222": [30 * 24 * 60, 26 * 60],
  };
  for (const [clientId, [authorizedAgo, usedAgo]] of Object.entries(oauthTimes))
    db.prepare(
      "UPDATE oauth_grants SET authorized_at=?,last_used_at=? WHERE user_id=? AND client_id=?",
    ).run(isoAgo(authorizedAgo), isoAgo(usedAgo), ownerId, clientId);
}
