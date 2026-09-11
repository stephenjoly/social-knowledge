import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  AnalysisResult,
  AssetKind,
  AssetRecord,
  CaptureRecord,
  JobRecord,
  JobStatus,
  SocialComment,
  SourceType,
} from "./types.js";
import {
  libraryDomains,
  slugifyLibraryLabel,
  unclassified,
  type LibraryClassification,
  type LibraryNode,
} from "./library.js";

type Row = Record<string, unknown>;

export type CaptureCursor = {
  createdAt: string;
  id: string;
};

export type InboxAnalyticsCounts = {
  totalCaptures: number;
  capturesLast24Hours: number;
  failedImports: number;
};

export class JobStore {
  readonly database: Database.Database;
  constructor(filename: string) {
    this.database = new Database(filename);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    this.migrate();
  }
  close() {
    this.database.close();
  }

  recoverInterruptedJobs() {
    const now = new Date().toISOString();
    this.database
      .prepare(
        `UPDATE jobs SET status='queued',updated_at=?,next_attempt_at=?,error=COALESCE(error,'Recovered after service restart') WHERE status IN ('downloading','processing','transcribing','translating','analyzing','writing')`,
      )
      .run(now, now);
  }

  createOrGet(input: {
    ownerUserId: string;
    sourceUrl: string;
    normalizedUrl: string;
    sourceHash: string;
    userNote?: string | undefined;
  }) {
    const existing = this.getByHash(input.ownerUserId, input.sourceHash);
    if (existing) return { job: existing, created: false };
    const now = new Date().toISOString();
    const id = randomUUID();
    this.database
      .prepare(
        `INSERT INTO jobs(id,owner_user_id,source_url,normalized_url,source_hash,user_note,status,attempts,error,result_note_path,created_at,updated_at,next_attempt_at) VALUES(?,?,?,?,?,?,'queued',0,NULL,NULL,?,?,?)`,
      )
      .run(
        id,
        input.ownerUserId,
        input.sourceUrl,
        input.normalizedUrl,
        input.sourceHash,
        input.userNote?.trim() || null,
        now,
        now,
        now,
      );
    this.addEvent(id, "queued", "Capture accepted");
    return { job: this.get(id) as JobRecord, created: true };
  }

  get(id: string) {
    return this.mapJob(
      this.database.prepare("SELECT * FROM jobs WHERE id=?").get(id) as
        Row | undefined,
    );
  }
  getByHash(ownerUserId: string, hash: string) {
    return this.mapJob(
      this.database
        .prepare("SELECT * FROM jobs WHERE owner_user_id=? AND source_hash=?")
        .get(ownerUserId, hash) as Row | undefined,
    );
  }
  getOwned(userId: string, id: string) {
    const job = this.get(id);
    return job?.ownerUserId === userId ? job : null;
  }
  list(userId: string, limit = 50) {
    return (
      this.database
        .prepare(
          "SELECT * FROM jobs WHERE owner_user_id=? ORDER BY created_at DESC LIMIT ?",
        )
        .all(userId, limit) as Row[]
    ).map((row) => this.mapJob(row) as JobRecord);
  }
  inboxAnalytics(ownerUserId: string, cutoffIso: string): InboxAnalyticsCounts {
    const row = this.database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM captures WHERE owner_user_id=?) AS totalCaptures,
           (SELECT COUNT(*) FROM captures WHERE owner_user_id=? AND created_at>=?) AS capturesLast24Hours,
           (SELECT COUNT(*) FROM jobs WHERE owner_user_id=? AND status='failed') AS failedImports`,
      )
      .get(ownerUserId, ownerUserId, cutoffIso, ownerUserId) as Row;
    return {
      totalCaptures: Number(row.totalCaptures ?? 0),
      capturesLast24Hours: Number(row.capturesLast24Hours ?? 0),
      failedImports: Number(row.failedImports ?? 0),
    };
  }
  claimNext() {
    return this.database.transaction(() => {
      const now = new Date().toISOString();
      const row = this.database
        .prepare(
          "SELECT id FROM jobs WHERE status='queued' AND next_attempt_at<=? ORDER BY created_at LIMIT 1",
        )
        .get(now) as { id: string } | undefined;
      if (!row) return null;
      this.database
        .prepare(
          "UPDATE jobs SET status='downloading',attempts=attempts+1,updated_at=? WHERE id=?",
        )
        .run(now, row.id);
      this.addEvent(row.id, "downloading", "Download started");
      return this.get(row.id);
    })();
  }
  setStatus(id: string, status: JobStatus) {
    this.database
      .prepare(
        "UPDATE jobs SET status=?,updated_at=?,error=NULL,error_code=NULL,error_detail=NULL WHERE id=?",
      )
      .run(status, new Date().toISOString(), id);
    this.addEvent(id, status, null);
  }
  setDisplayTitle(id: string, title: string | null, eventMessage?: string) {
    const cleaned = title?.trim();
    if (!cleaned) return;
    this.database
      .prepare("UPDATE jobs SET display_title=?,updated_at=? WHERE id=?")
      .run(cleaned.slice(0, 240), new Date().toISOString(), id);
    if (eventMessage) {
      const status = this.get(id)?.status;
      if (status) this.addEvent(id, status, eventMessage);
    }
  }
  complete(id: string, notePath: string) {
    this.database
      .prepare(
        "UPDATE jobs SET status='complete',result_note_path=?,error=NULL,error_code=NULL,error_detail=NULL,updated_at=? WHERE id=?",
      )
      .run(notePath, new Date().toISOString(), id);
    this.addEvent(id, "complete", "Capture archived");
  }
  fail(
    id: string,
    failure: {
      code: string;
      title: string;
      message: string;
      diagnostic: string;
    },
    maxAttempts: number,
  ) {
    const job = this.get(id);
    if (!job) return;
    const retry = job.attempts < maxAttempts;
    const next = new Date(
      Date.now() +
        Math.min(300, 15 * 2 ** Math.max(0, job.attempts - 1)) * 1000,
    ).toISOString();
    const status = retry ? "queued" : "failed";
    this.database
      .prepare(
        "UPDATE jobs SET status=?,error=?,error_code=?,error_detail=?,updated_at=?,next_attempt_at=? WHERE id=?",
      )
      .run(
        status,
        failure.message.slice(0, 500),
        failure.code,
        failure.diagnostic.slice(0, 4000),
        new Date().toISOString(),
        next,
        id,
      );
    this.addEvent(
      id,
      status,
      `${failure.title}: ${failure.message}`.slice(0, 500),
    );
  }
  retry(id: string) {
    const job = this.get(id);
    if (!job || job.status !== "failed") return false;
    const now = new Date().toISOString();
    this.database
      .prepare(
        "UPDATE jobs SET status='queued',attempts=0,error=NULL,error_code=NULL,error_detail=NULL,next_attempt_at=?,updated_at=? WHERE id=?",
      )
      .run(now, now, id);
    this.addEvent(id, "queued", "Manual retry requested");
    return true;
  }
  addEvent(jobId: string, status: string, message: string | null) {
    this.database
      .prepare(
        "INSERT INTO job_events(id,job_id,status,message,created_at) VALUES(?,?,?,?,?)",
      )
      .run(randomUUID(), jobId, status, message, new Date().toISOString());
  }
  events(jobId: string) {
    return this.database
      .prepare(
        "SELECT id,status,message,created_at AS createdAt FROM job_events WHERE job_id=? ORDER BY created_at",
      )
      .all(jobId);
  }

  createCapture(input: {
    job: JobRecord;
    sourceType: SourceType;
    sourceId: string;
    platform: string;
    title: string;
    creator: string | null;
    creatorUrl: string | null;
    description: string | null;
    transcript: string;
    sourceLanguage: string | null;
    translatedTranscript: string | null;
    translationLanguage: string | null;
    comments: SocialComment[];
    analysis: AnalysisResult;
    publishedAt: string | null;
    durationSeconds: number | null;
    notePath: string;
    assets: Array<{
      kind: AssetKind;
      path: string;
      mimeType: string;
      sizeBytes: number;
      position: number;
    }>;
  }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO captures(id,owner_user_id,job_id,source_hash,source_url,platform,source_type,source_id,title,creator,creator_url,description,transcript,source_language,translated_transcript,translation_language,comments_json,synopsis,why_useful,analysis_json,topics_text,entities_text,published_at,duration_seconds,note_path,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          input.job.ownerUserId,
          input.job.id,
          input.job.sourceHash,
          input.job.sourceUrl,
          input.platform,
          input.sourceType,
          input.sourceId,
          input.title,
          input.creator,
          input.creatorUrl,
          input.description,
          input.transcript,
          input.sourceLanguage,
          input.translatedTranscript,
          input.translationLanguage,
          JSON.stringify(input.comments),
          input.analysis.synopsis,
          input.analysis.whyUseful,
          JSON.stringify(input.analysis),
          input.analysis.topics.join(" "),
          input.analysis.entities.map((e) => e.name).join(" "),
          input.publishedAt,
          input.durationSeconds,
          input.notePath,
          now,
        );
      for (const asset of input.assets)
        this.database
          .prepare(
            "INSERT INTO assets(id,capture_id,kind,path,mime_type,size_bytes,position) VALUES(?,?,?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            id,
            asset.kind,
            asset.path,
            asset.mimeType,
            asset.sizeBytes,
            asset.position,
          );
      this.indexCapture(id);
    })();
    return this.getCapture(id);
  }
  listCaptures(query: {
    userId?: string;
    limit: number;
    cursor?: CaptureCursor;
    search?: string;
    platform?: string;
    sourceType?: string;
    nodeId?: string;
    topic?: string;
  }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.userId) {
      where.push("c.owner_user_id = ?");
      params.push(query.userId);
    }
    if (query.cursor) {
      where.push(
        "(c.created_at < ? OR (c.created_at = ? AND c.id < ?))",
      );
      params.push(
        query.cursor.createdAt,
        query.cursor.createdAt,
        query.cursor.id,
      );
    }
    if (query.platform) {
      where.push("c.platform = ?");
      params.push(query.platform);
    }
    if (query.sourceType) {
      where.push("c.source_type = ?");
      params.push(query.sourceType);
    }
    if (query.nodeId) {
      where.push(`c.id IN (
        WITH RECURSIVE descendants(id) AS (
          SELECT ?
          UNION ALL
          SELECT n.id FROM library_nodes n JOIN descendants d ON n.parent_id=d.id
        )
        SELECT cl.capture_id FROM capture_library cl JOIN descendants d ON d.id=cl.node_id
      )`);
      params.push(query.nodeId);
    }
    if (query.topic) {
      where.push(
        "c.id IN (SELECT capture_id FROM captures_fts WHERE lower(topics) LIKE ?)",
      );
      params.push(`%${query.topic.toLowerCase()}%`);
    }
    if (query.search) {
      where.push(
        "c.id IN (SELECT capture_id FROM captures_fts WHERE captures_fts MATCH ?)",
      );
      params.push(query.search.replace(/["']/g, " ").trim() + "*");
    }
    params.push(query.limit + 1);
    const rows = this.database
      .prepare(
        `SELECT c.* FROM captures c ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY c.created_at DESC,c.id DESC LIMIT ?`,
      )
      .all(...params) as Row[];
    const hasMore = rows.length > query.limit;
    const sliced = rows
      .slice(0, query.limit)
      .map((r) => this.mapCapture(r, false));
    return {
      captures: sliced,
      nextCursor: hasMore
        ? {
            createdAt: String(rows[query.limit - 1]?.created_at),
            id: String(rows[query.limit - 1]?.id),
          }
        : null,
    };
  }
  captureFilterFacets(userId: string) {
    const categories = this.libraryTree(userId)
      .filter(
        (node) =>
          node.captureCount > 0 &&
          (node.kind === "domain" || node.kind === "subcategory"),
      )
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "domain" ? -1 : 1;
        return (
          b.captureCount - a.captureCount || a.label.localeCompare(b.label)
        );
      })
      .filter(
        (node, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.label.toLowerCase() === node.label.toLowerCase(),
          ) === index,
      )
      .slice(0, 12)
      .map(({ id, label, kind, captureCount }) => ({
        id,
        label,
        kind,
        count: captureCount,
      }));
    const topicCounts = this.database
      .prepare(
        `SELECT MIN(trim(CAST(topic.value AS TEXT))) AS label,
          COUNT(DISTINCT c.id) AS count
         FROM captures c
         JOIN json_each(
           CASE
             WHEN json_valid(c.analysis_json) THEN c.analysis_json
             ELSE '{"topics":[]}'
           END,
           '$.topics'
         ) AS topic ON topic.type='text'
         WHERE c.owner_user_id=?
           AND json_type(
             CASE
               WHEN json_valid(c.analysis_json) THEN c.analysis_json
               ELSE '{"topics":[]}'
             END,
             '$.topics'
           )='array'
           AND trim(CAST(topic.value AS TEXT))<>''
         GROUP BY lower(trim(CAST(topic.value AS TEXT)))`,
      )
      .all(userId) as Array<{ label: string; count: number }>;
    const categoryLabels = new Set(
      categories.map((category) => category.label.toLowerCase()),
    );
    const topics = topicCounts
      .filter((topic) => !categoryLabels.has(topic.label.toLowerCase()))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 12);
    return { categories, topics };
  }
  getCapture(id: string) {
    const row = this.database
      .prepare("SELECT * FROM captures WHERE id=?")
      .get(id) as Row | undefined;
    return row ? this.mapCapture(row, true) : null;
  }
  getOwnedCapture(userId: string, id: string) {
    const capture = this.getCapture(id);
    return capture?.ownerUserId === userId ? capture : null;
  }
  getCaptureByJobId(jobId: string) {
    const row = this.database
      .prepare("SELECT * FROM captures WHERE job_id=?")
      .get(jobId) as Row | undefined;
    return row ? this.mapCapture(row, true) : null;
  }
  getCaptureBySource(ownerUserId: string, platform: string, sourceId: string) {
    const row = this.database
      .prepare(
        "SELECT * FROM captures WHERE owner_user_id=? AND platform=? AND source_id=? ORDER BY created_at LIMIT 1",
      )
      .get(ownerUserId, platform, sourceId) as Row | undefined;
    return row ? this.mapCapture(row, true) : null;
  }
  listAllCaptures() {
    return (
      this.database
        .prepare("SELECT * FROM captures ORDER BY created_at")
        .all() as Row[]
    ).map((row) => this.mapCapture(row, true));
  }

  assignClassification(
    captureId: string,
    classification: LibraryClassification,
    assignedBy: "automatic" | "manual" = "automatic",
    force = false,
  ) {
    const existing = this.libraryAssignment(captureId);
    if (
      existing?.assignedBy === "manual" &&
      assignedBy === "automatic" &&
      !force
    )
      return existing;
    if (
      classification.confidence < 0.65 ||
      classification.primaryDomain === "Other"
    ) {
      this.database
        .prepare("DELETE FROM capture_library WHERE capture_id=?")
        .run(captureId);
      return null;
    }
    let parentId = this.ensureLibraryNode(
      null,
      classification.primaryDomain,
      "domain",
    );
    if (classification.primaryDomain === "Travel" && classification.country) {
      parentId = this.ensureLibraryNode(
        parentId,
        normalizePlace(classification.country),
        "country",
      );
      if (classification.city)
        parentId = this.ensureLibraryNode(
          parentId,
          normalizePlace(classification.city),
          "city",
        );
    }
    parentId = this.ensureLibraryNode(
      parentId,
      classification.subcategory,
      "subcategory",
    );
    this.database
      .prepare(
        `INSERT INTO capture_library(capture_id,node_id,confidence,assigned_by,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(capture_id) DO UPDATE SET node_id=excluded.node_id,confidence=excluded.confidence,assigned_by=excluded.assigned_by,updated_at=excluded.updated_at`,
      )
      .run(
        captureId,
        parentId,
        classification.confidence,
        assignedBy,
        new Date().toISOString(),
      );
    this.database
      .prepare("DELETE FROM capture_library_facets WHERE capture_id=?")
      .run(captureId);
    const insertFacet = this.database.prepare(
      "INSERT INTO capture_library_facets(capture_id,label) VALUES(?,?)",
    );
    for (const topic of [
      ...new Set(
        classification.secondaryTopics
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ])
      insertFacet.run(captureId, topic);
    return this.libraryAssignment(captureId);
  }
  moveCapture(captureId: string, nodeId: string) {
    if (!this.getCapture(captureId) || !this.libraryNodeRecord(nodeId))
      throw new Error("Capture or library node not found");
    this.database
      .prepare(
        `INSERT INTO capture_library(capture_id,node_id,confidence,assigned_by,updated_at) VALUES(?,?,1,'manual',?)
      ON CONFLICT(capture_id) DO UPDATE SET node_id=excluded.node_id,confidence=1,assigned_by='manual',updated_at=excluded.updated_at`,
      )
      .run(captureId, nodeId, new Date().toISOString());
  }
  libraryAssignment(captureId: string) {
    return this.database
      .prepare(
        "SELECT node_id AS nodeId,confidence,assigned_by AS assignedBy,updated_at AS updatedAt FROM capture_library WHERE capture_id=?",
      )
      .get(captureId) as
      | {
          nodeId: string;
          confidence: number;
          assignedBy: string;
          updatedAt: string;
        }
      | undefined;
  }
  libraryBreadcrumb(nodeId: string, userId?: string) {
    const result: LibraryNode[] = [];
    let current = this.libraryNodeRecord(nodeId, userId);
    const seen = new Set<string>();
    while (current) {
      if (seen.has(current.id))
        throw new Error("Library taxonomy contains a cycle");
      seen.add(current.id);
      result.unshift(current);
      current = current.parentId
        ? this.libraryNodeRecord(current.parentId, userId)
        : null;
    }
    return result;
  }
  libraryTree(userId?: string) {
    const rows = this.database
      .prepare(
        `WITH RECURSIVE ancestry(descendant_id,ancestor_id) AS (
           SELECT id,id FROM library_nodes
           UNION ALL
           SELECT ancestry.descendant_id,parent.id
           FROM ancestry
           JOIN library_nodes current ON current.id=ancestry.ancestor_id
           JOIN library_nodes parent ON parent.id=current.parent_id
         ),
         child_counts AS (
           SELECT parent_id AS node_id,COUNT(*) AS child_count
           FROM library_nodes
           WHERE parent_id IS NOT NULL
           GROUP BY parent_id
         ),
         capture_counts AS (
           SELECT ancestry.ancestor_id AS node_id,COUNT(*) AS capture_count
           FROM ancestry
           JOIN capture_library cl ON cl.node_id=ancestry.descendant_id
           JOIN captures c ON c.id=cl.capture_id
           ${userId ? "WHERE c.owner_user_id=?" : ""}
           GROUP BY ancestry.ancestor_id
         )
         SELECT n.id,n.parent_id AS parentId,n.label,n.slug,n.kind,
           COALESCE(child_counts.child_count,0) AS childCount,
           COALESCE(capture_counts.capture_count,0) AS captureCount
         FROM library_nodes n
         LEFT JOIN child_counts ON child_counts.node_id=n.id
         LEFT JOIN capture_counts ON capture_counts.node_id=n.id
         ORDER BY n.label COLLATE NOCASE`,
      )
      .all(...(userId ? [userId] : [])) as Row[];
    const nodes = rows.map((row) => ({
      ...row,
      childCount: Number(row.childCount),
      captureCount: Number(row.captureCount),
    })) as unknown as LibraryNode[];
    return nodes;
  }
  libraryNode(id: string, userId?: string) {
    const node = this.libraryNodeRecord(id, userId);
    if (!node) return null;
    const children = this.libraryTree(userId).filter(
      (candidate) => candidate.parentId === id,
    );
    const captures = (
      this.database
        .prepare(
          `SELECT c.* FROM captures c JOIN capture_library cl ON cl.capture_id=c.id WHERE cl.node_id=?${userId ? " AND c.owner_user_id=?" : ""} ORDER BY c.created_at DESC`,
        )
        .all(...(userId ? [id, userId] : [id])) as Row[]
    ).map((row) => this.mapCapture(row, false));
    return {
      ...node,
      breadcrumb: this.libraryBreadcrumb(id, userId),
      children,
      captures,
    };
  }
  unclassifiedCaptures(userId?: string) {
    return (
      this.database
        .prepare(
          `SELECT c.* FROM captures c LEFT JOIN capture_library cl ON cl.capture_id=c.id WHERE cl.capture_id IS NULL${userId ? " AND c.owner_user_id=?" : ""} ORDER BY c.created_at DESC`,
        )
        .all(...(userId ? [userId] : [])) as Row[]
    ).map((row) => this.mapCapture(row, false));
  }
  unclassifiedCaptureCount(userId?: string) {
    const row = this.database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM captures c
         WHERE ${userId ? "c.owner_user_id=? AND " : ""}
           NOT EXISTS(
             SELECT 1 FROM capture_library cl WHERE cl.capture_id=c.id
           )`,
      )
      .get(...(userId ? [userId] : [])) as { count: number };
    return Number(row.count);
  }
  renameLibraryNode(id: string, label: string) {
    const node = this.libraryNodeRecord(id);
    if (!node) throw new Error("Library node not found");
    const cleaned = label.trim();
    if (!cleaned) throw new Error("Node label cannot be empty");
    const slug = slugifyLibraryLabel(cleaned);
    if (
      this.database
        .prepare(
          "SELECT id FROM library_nodes WHERE parent_id IS ? AND slug=? AND id<>?",
        )
        .get(node.parentId, slug, id)
    )
      throw new Error("A sibling with that name already exists");
    this.database
      .prepare(
        "UPDATE library_nodes SET label=?,slug=?,updated_at=? WHERE id=?",
      )
      .run(cleaned, slug, new Date().toISOString(), id);
    return this.libraryNodeRecord(id);
  }
  mergeLibraryNode(sourceId: string, targetId: string) {
    if (sourceId === targetId)
      throw new Error("Cannot merge a node into itself");
    const source = this.libraryNodeRecord(sourceId),
      target = this.libraryNodeRecord(targetId);
    if (!source || !target) throw new Error("Library node not found");
    if (source.kind !== target.kind)
      throw new Error("Only compatible node types can be merged");
    if (this.libraryBreadcrumb(targetId).some((node) => node.id === sourceId))
      throw new Error("Merge would create a cycle");
    this.database.transaction(() => {
      const children = this.database
        .prepare("SELECT label,slug FROM library_nodes WHERE parent_id=?")
        .all(sourceId) as Array<{ label: string; slug: string }>;
      for (const child of children)
        if (
          this.database
            .prepare(
              "SELECT id FROM library_nodes WHERE parent_id=? AND slug=?",
            )
            .get(targetId, child.slug)
        )
          throw new Error(`Merge would create duplicate child ${child.label}`);
      this.database
        .prepare(
          "UPDATE library_nodes SET parent_id=?,updated_at=? WHERE parent_id=?",
        )
        .run(targetId, new Date().toISOString(), sourceId);
      this.database
        .prepare(
          "UPDATE capture_library SET node_id=?,updated_at=? WHERE node_id=?",
        )
        .run(targetId, new Date().toISOString(), sourceId);
      this.database
        .prepare(
          "INSERT OR REPLACE INTO library_aliases(alias,node_id) VALUES(?,?)",
        )
        .run(source.slug, targetId);
      this.database
        .prepare("DELETE FROM library_nodes WHERE id=?")
        .run(sourceId);
    })();
    return this.libraryNodeRecord(targetId);
  }
  private ensureLibraryNode(
    parentId: string | null,
    label: string,
    kind: string,
  ) {
    const slug = slugifyLibraryLabel(label);
    const existing = this.database
      .prepare("SELECT id FROM library_nodes WHERE parent_id IS ? AND slug=?")
      .get(parentId, slug) as { id: string } | undefined;
    if (existing) return existing.id;
    const id = randomUUID(),
      now = new Date().toISOString();
    this.database
      .prepare(
        "INSERT INTO library_nodes(id,parent_id,label,slug,kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(id, parentId, label, slug, kind, now, now);
    return id;
  }
  private libraryNodeRecord(id: string, userId?: string): LibraryNode | null {
    const row = this.database
      .prepare(
        `SELECT id,parent_id AS parentId,label,slug,kind,
      (SELECT COUNT(*) FROM library_nodes x WHERE x.parent_id=library_nodes.id) childCount,
      (SELECT COUNT(*) FROM capture_library cl JOIN captures c ON c.id=cl.capture_id WHERE cl.node_id=library_nodes.id${userId ? " AND c.owner_user_id=?" : ""}) captureCount FROM library_nodes WHERE id=?`,
      )
      .get(...(userId ? [userId, id] : [id])) as Row | undefined;
    return row
      ? ({
          ...row,
          childCount: Number(row.childCount),
          captureCount: Number(row.captureCount),
        } as unknown as LibraryNode)
      : null;
  }
  replaceCaptureAnalysis(
    captureId: string,
    analysis: AnalysisResult,
    notePath: string,
  ) {
    this.database.transaction(() => {
      const capture = this.database
        .prepare("SELECT job_id FROM captures WHERE id=?")
        .get(captureId) as { job_id: string } | undefined;
      if (!capture) throw new Error("Capture not found");
      this.database
        .prepare(
          "UPDATE captures SET title=?,synopsis=?,why_useful=?,analysis_json=?,topics_text=?,entities_text=?,note_path=? WHERE id=?",
        )
        .run(
          analysis.title,
          analysis.synopsis,
          analysis.whyUseful,
          JSON.stringify(analysis),
          analysis.topics.join(" "),
          analysis.entities.map((entity) => entity.name).join(" "),
          notePath,
          captureId,
        );
      this.database
        .prepare("UPDATE jobs SET display_title=?,updated_at=? WHERE id=?")
        .run(analysis.title, new Date().toISOString(), capture.job_id);
      this.indexCapture(captureId);
    })();
  }
  getAsset(captureId: string, assetId: string) {
    const row = this.database
      .prepare("SELECT * FROM assets WHERE id=? AND capture_id=?")
      .get(assetId, captureId) as Row | undefined;
    return row ? this.mapAsset(row) : null;
  }
  getOwnedAsset(userId: string, captureId: string, assetId: string) {
    return this.getOwnedCapture(userId, captureId)
      ? this.getAsset(captureId, assetId)
      : null;
  }
  private assets(captureId: string) {
    return (
      this.database
        .prepare("SELECT * FROM assets WHERE capture_id=? ORDER BY position")
        .all(captureId) as Row[]
    ).map((r) => this.mapAsset(r));
  }
  private indexCapture(id: string) {
    const c = this.database
      .prepare("SELECT * FROM captures WHERE id=?")
      .get(id) as Row;
    this.database
      .prepare("DELETE FROM captures_fts WHERE capture_id=?")
      .run(id);
    this.database
      .prepare(
        "INSERT INTO captures_fts(capture_id,title,creator,description,synopsis,transcript,topics,entities) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        c.title,
        c.creator,
        c.description,
        c.synopsis,
        [c.transcript, c.translated_transcript].filter(Boolean).join("\n"),
        c.topics_text,
        c.entities_text,
      );
    this.database
      .prepare("DELETE FROM captures_fts_v2 WHERE capture_id=?")
      .run(id);
    const analysis = JSON.parse(String(c.analysis_json)) as AnalysisResult;
    this.database
      .prepare(
        "INSERT INTO captures_fts_v2(capture_id,title,takeaways,creator,synopsis,description,topics,entities,transcript) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        c.title,
        (analysis.takeaways ?? []).join(" "),
        c.creator,
        c.synopsis,
        c.description,
        c.topics_text,
        c.entities_text,
        [c.transcript, c.translated_transcript].filter(Boolean).join("\n"),
      );
  }

  userCount() {
    return Number(
      (
        this.database.prepare("SELECT COUNT(*) count FROM users").get() as {
          count: number;
        }
      ).count,
    );
  }
  defaultUserId() {
    return (
      (
        this.database
          .prepare(
            "SELECT id FROM users ORDER BY CASE WHEN username='demo' THEN 0 ELSE 1 END,created_at LIMIT 1",
          )
          .get() as { id: string } | undefined
      )?.id ?? null
    );
  }
  createUser(username: string, passwordHash: string, role = "admin") {
    const id = randomUUID();
    this.database
      .prepare(
        "INSERT INTO users(id,username,password_hash,role,created_at) VALUES(?,?,?,?,?)",
      )
      .run(
        id,
        username.toLowerCase(),
        passwordHash,
        role,
        new Date().toISOString(),
      );
    return { id, username: username.toLowerCase(), role };
  }
  createInitialUser(username: string, passwordHash: string) {
    const normalizedUsername = username.toLowerCase();
    const create = this.database.transaction(() => {
      if (this.userCount() !== 0) return null;
      const id = randomUUID();
      this.database
        .prepare(
          "INSERT INTO users(id,username,password_hash,role,created_at) VALUES(?,?,?,?,?)",
        )
        .run(
          id,
          normalizedUsername,
          passwordHash,
          "admin",
          new Date().toISOString(),
        );
      return { id, username: normalizedUsername, role: "admin" };
    });
    return create();
  }
  deleteUser(username: string) {
    const user = this.getUserByUsername(username);
    if (!user) return false;
    this.database.transaction(() => {
      this.database
        .prepare("DELETE FROM captures WHERE owner_user_id=?")
        .run(user.id);
      this.database
        .prepare("DELETE FROM jobs WHERE owner_user_id=?")
        .run(user.id);
      this.database.prepare("DELETE FROM users WHERE id=?").run(user.id);
      this.database
        .prepare(
          "DELETE FROM oauth_clients WHERE client_id NOT IN (SELECT client_id FROM oauth_grants) AND client_id NOT IN (SELECT client_id FROM oauth_access_tokens) AND client_id NOT IN (SELECT client_id FROM oauth_refresh_tokens) AND client_id NOT IN (SELECT client_id FROM oauth_authorization_codes)",
        )
        .run();
    })();
    return true;
  }
  seedSmokeArchive(userId: string) {
    const sourceOwnerUserId = this.defaultUserId();
    if (!sourceOwnerUserId || sourceOwnerUserId === userId)
      throw new Error("smoke_fixture_owner_missing");
    const restaurantNode = this.database
      .prepare(
        `SELECT leaf.id
         FROM library_nodes leaf
         JOIN library_nodes city ON city.id=leaf.parent_id
         JOIN library_nodes country ON country.id=city.parent_id
         JOIN library_nodes domain ON domain.id=country.parent_id
         WHERE lower(leaf.label)='restaurants' AND lower(city.label)='lisbon'
           AND lower(country.label)='portugal' AND lower(domain.label)='travel'
         LIMIT 1`,
      )
      .get() as { id: string } | undefined;
    const preferred = restaurantNode
      ? (this.database
          .prepare(
            `SELECT c.* FROM captures c
             JOIN capture_library cl ON cl.capture_id=c.id
             WHERE c.owner_user_id=? AND cl.node_id=? AND EXISTS(
               SELECT 1 FROM assets a WHERE a.capture_id=c.id AND a.kind='video'
             ) ORDER BY c.created_at DESC LIMIT 2`,
          )
          .all(sourceOwnerUserId, restaurantNode.id) as Array<
          Record<string, unknown>
        >)
      : [];
    const sources =
      preferred.length >= 2
        ? preferred
        : (this.database
            .prepare(
              `SELECT c.* FROM captures c WHERE c.owner_user_id=? AND EXISTS(
                 SELECT 1 FROM assets a WHERE a.capture_id=c.id AND a.kind='video'
               ) ORDER BY c.created_at DESC LIMIT 2`,
            )
            .all(sourceOwnerUserId) as Array<Record<string, unknown>>);
    if (sources.length < 1) throw new Error("smoke_fixture_source_missing");

    const insert = (table: string, row: Record<string, unknown>) => {
      const columns = Object.keys(row);
      this.database
        .prepare(
          `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
        )
        .run(...columns.map((column) => row[column]));
    };
    this.database.transaction(() => {
      for (const source of sources) {
        const sourceCaptureId = String(source.id);
        const sourceJob = this.database
          .prepare("SELECT * FROM jobs WHERE id=?")
          .get(source.job_id) as Record<string, unknown>;
        const jobId = randomUUID();
        const captureId = randomUUID();
        insert("jobs", { ...sourceJob, id: jobId, owner_user_id: userId });
        insert("captures", {
          ...source,
          id: captureId,
          owner_user_id: userId,
          job_id: jobId,
        });
        const assets = this.database
          .prepare("SELECT * FROM assets WHERE capture_id=?")
          .all(sourceCaptureId) as Array<Record<string, unknown>>;
        for (const asset of assets)
          insert("assets", {
            ...asset,
            id: randomUUID(),
            capture_id: captureId,
          });
        const events = this.database
          .prepare("SELECT * FROM job_events WHERE job_id=?")
          .all(source.job_id) as Array<Record<string, unknown>>;
        for (const event of events)
          insert("job_events", { ...event, id: randomUUID(), job_id: jobId });
        if (restaurantNode)
          this.database
            .prepare(
              "INSERT INTO capture_library(capture_id,node_id,confidence,assigned_by,updated_at) VALUES(?,?,?,?,?)",
            )
            .run(
              captureId,
              restaurantNode.id,
              1,
              "automatic",
              new Date().toISOString(),
            );
        this.indexCapture(captureId);
      }
    })();
    return sources.length;
  }
  preferences(userId: string) {
    const row = this.database
      .prepare(
        "SELECT default_language,translate_foreign FROM users WHERE id=?",
      )
      .get(userId) as
      { default_language: string; translate_foreign: number } | undefined;
    return {
      defaultLanguage: row?.default_language ?? "English",
      translateForeign: row?.translate_foreign !== 0,
    };
  }
  defaultPreferences() {
    const row = this.database
      .prepare(
        "SELECT default_language,translate_foreign FROM users ORDER BY created_at LIMIT 1",
      )
      .get() as
      { default_language: string; translate_foreign: number } | undefined;
    return {
      defaultLanguage: row?.default_language ?? "English",
      translateForeign: row?.translate_foreign !== 0,
    };
  }
  updatePreferences(
    userId: string,
    input: { defaultLanguage: string; translateForeign: boolean },
  ) {
    this.database
      .prepare(
        "UPDATE users SET default_language=?,translate_foreign=? WHERE id=?",
      )
      .run(input.defaultLanguage, input.translateForeign ? 1 : 0, userId);
    return this.preferences(userId);
  }
  getUserByUsername(username: string) {
    return this.database
      .prepare(
        "SELECT id,username,password_hash AS passwordHash,role FROM users WHERE username=?",
      )
      .get(username.toLowerCase()) as
      | { id: string; username: string; passwordHash: string; role: string }
      | undefined;
  }
  createSession(userId: string, tokenHash: string, expiresAt: string) {
    this.database
      .prepare(
        "INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        userId,
        tokenHash,
        expiresAt,
        new Date().toISOString(),
      );
  }
  getSession(tokenHash: string) {
    return this.database
      .prepare(
        "SELECT u.id,u.username,u.role,s.expires_at AS expiresAt FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
      )
      .get(tokenHash, new Date().toISOString()) as
      | { id: string; username: string; role: string; expiresAt: string }
      | undefined;
  }
  deleteSession(tokenHash: string) {
    this.database
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run(tokenHash);
  }
  createApiKey(
    userId: string,
    name: string,
    tokenHash: string,
    prefix: string,
  ) {
    const id = randomUUID();
    this.database
      .prepare(
        "INSERT INTO api_keys(id,user_id,name,token_hash,prefix,created_at,last_used_at) VALUES(?,?,?,?,?,?,NULL)",
      )
      .run(id, userId, name, tokenHash, prefix, new Date().toISOString());
    return {
      id,
      name,
      prefix,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
  }
  listApiKeys(userId: string) {
    return this.database
      .prepare(
        "SELECT id,name,prefix,created_at AS createdAt,last_used_at AS lastUsedAt FROM api_keys WHERE user_id=? ORDER BY created_at DESC",
      )
      .all(userId);
  }
  deleteApiKey(userId: string, id: string) {
    return (
      this.database
        .prepare("DELETE FROM api_keys WHERE id=? AND user_id=?")
        .run(id, userId).changes > 0
    );
  }
  useApiKey(tokenHash: string) {
    const row = this.database
      .prepare(
        "SELECT id,user_id AS userId,last_used_at AS lastUsedAt FROM api_keys WHERE token_hash=?",
      )
      .get(tokenHash) as
      { id: string; userId: string; lastUsedAt: string | null } | undefined;
    if (!row) return null;
    const now = new Date(),
      cutoff = new Date(now.getTime() - 300000).toISOString();
    if (!row.lastUsedAt || row.lastUsedAt < cutoff)
      this.database
        .prepare("UPDATE api_keys SET last_used_at=? WHERE id=?")
        .run(now.toISOString(), row.id);
    return { keyId: row.id, userId: row.userId };
  }

  registerOAuthClient(input: {
    clientId: string;
    name: string;
    redirectUris: string[];
  }) {
    const now = new Date().toISOString();
    this.database
      .prepare(
        "INSERT INTO oauth_clients(client_id,name,redirect_uris_json,created_at) VALUES(?,?,?,?)",
      )
      .run(input.clientId, input.name, JSON.stringify(input.redirectUris), now);
    return { ...input, createdAt: now };
  }
  oauthClient(clientId: string) {
    const row = this.database
      .prepare(
        "SELECT client_id AS clientId,name,redirect_uris_json AS redirectUrisJson,created_at AS createdAt FROM oauth_clients WHERE client_id=?",
      )
      .get(clientId) as
      | {
          clientId: string;
          name: string;
          redirectUrisJson: string;
          createdAt: string;
        }
      | undefined;
    return row
      ? { ...row, redirectUris: JSON.parse(row.redirectUrisJson) as string[] }
      : null;
  }
  createOAuthGrant(input: { userId: string; clientId: string; scope: string }) {
    this.database
      .prepare(
        `INSERT INTO oauth_grants(user_id,client_id,scope,authorized_at,last_used_at)
       VALUES(?,?,?,?,NULL) ON CONFLICT(user_id,client_id) DO UPDATE SET scope=excluded.scope,authorized_at=excluded.authorized_at`,
      )
      .run(input.userId, input.clientId, input.scope, new Date().toISOString());
  }
  createOAuthCode(input: {
    codeHash: string;
    userId: string;
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    resource: string;
    expiresAt: string;
  }) {
    this.database
      .prepare(
        "INSERT INTO oauth_authorization_codes(code_hash,user_id,client_id,redirect_uri,code_challenge,resource,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        input.codeHash,
        input.userId,
        input.clientId,
        input.redirectUri,
        input.codeChallenge,
        input.resource,
        input.expiresAt,
        new Date().toISOString(),
      );
  }
  consumeOAuthCode(codeHash: string) {
    return this.database.transaction(() => {
      const row = this.database
        .prepare(
          `SELECT code_hash AS codeHash,user_id AS userId,client_id AS clientId,redirect_uri AS redirectUri,
         code_challenge AS codeChallenge,resource,expires_at AS expiresAt FROM oauth_authorization_codes
         WHERE code_hash=? AND consumed_at IS NULL AND expires_at>?`,
        )
        .get(codeHash, new Date().toISOString()) as any;
      if (!row) return null;
      this.database
        .prepare(
          "UPDATE oauth_authorization_codes SET consumed_at=? WHERE code_hash=?",
        )
        .run(new Date().toISOString(), codeHash);
      return row;
    })();
  }
  createOAuthTokens(input: {
    userId: string;
    clientId: string;
    accessHash: string;
    refreshHash: string;
    scope: string;
    resource: string;
    accessExpiresAt: string;
    refreshExpiresAt: string;
  }) {
    const familyId = randomUUID(),
      now = new Date().toISOString();
    this.database
      .prepare(
        "INSERT INTO oauth_access_tokens(token_hash,user_id,client_id,scope,resource,expires_at,created_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        input.accessHash,
        input.userId,
        input.clientId,
        input.scope,
        input.resource,
        input.accessExpiresAt,
        now,
      );
    this.database
      .prepare(
        "INSERT INTO oauth_refresh_tokens(token_hash,family_id,user_id,client_id,scope,resource,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        input.refreshHash,
        familyId,
        input.userId,
        input.clientId,
        input.scope,
        input.resource,
        input.refreshExpiresAt,
        now,
      );
  }
  useOAuthAccessToken(tokenHash: string) {
    const row = this.database
      .prepare(
        "SELECT token_hash AS tokenHash,user_id AS userId,client_id AS clientId,scope,resource,last_used_at AS lastUsedAt FROM oauth_access_tokens WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?",
      )
      .get(tokenHash, new Date().toISOString()) as any;
    if (!row) return null;
    this.database
      .prepare(
        "UPDATE oauth_access_tokens SET last_used_at=? WHERE token_hash=?",
      )
      .run(new Date().toISOString(), tokenHash);
    this.database
      .prepare(
        "UPDATE oauth_grants SET last_used_at=? WHERE user_id=? AND client_id=?",
      )
      .run(new Date().toISOString(), row.userId, row.clientId);
    return row;
  }
  rotateOAuthRefreshToken(
    tokenHash: string,
    accessHash: string,
    refreshHash: string,
    accessExpiresAt: string,
    refreshExpiresAt: string,
  ) {
    return this.database.transaction(() => {
      const row = this.database
        .prepare(
          "SELECT * FROM oauth_refresh_tokens WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?",
        )
        .get(tokenHash, new Date().toISOString()) as any;
      if (!row) return null;
      const now = new Date().toISOString();
      this.database
        .prepare(
          "UPDATE oauth_refresh_tokens SET revoked_at=?,replaced_by=? WHERE token_hash=?",
        )
        .run(now, refreshHash, tokenHash);
      this.database
        .prepare(
          "INSERT INTO oauth_access_tokens(token_hash,user_id,client_id,scope,resource,expires_at,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          accessHash,
          row.user_id,
          row.client_id,
          row.scope,
          row.resource,
          accessExpiresAt,
          now,
        );
      this.database
        .prepare(
          "INSERT INTO oauth_refresh_tokens(token_hash,family_id,user_id,client_id,scope,resource,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          refreshHash,
          row.family_id,
          row.user_id,
          row.client_id,
          row.scope,
          row.resource,
          refreshExpiresAt,
          now,
        );
      return {
        userId: row.user_id,
        clientId: row.client_id,
        scope: row.scope,
        resource: row.resource,
      };
    })();
  }
  revokeOAuthToken(tokenHash: string) {
    this.database
      .prepare("UPDATE oauth_access_tokens SET revoked_at=? WHERE token_hash=?")
      .run(new Date().toISOString(), tokenHash);
    this.database
      .prepare(
        "UPDATE oauth_refresh_tokens SET revoked_at=? WHERE token_hash=?",
      )
      .run(new Date().toISOString(), tokenHash);
  }
  listOAuthConnections(userId: string) {
    return this.database
      .prepare(
        `SELECT g.client_id AS clientId,c.name,g.scope,g.authorized_at AS authorizedAt,g.last_used_at AS lastUsedAt
       FROM oauth_grants g JOIN oauth_clients c ON c.client_id=g.client_id WHERE g.user_id=? ORDER BY g.authorized_at DESC`,
      )
      .all(userId);
  }
  revokeOAuthConnection(userId: string, clientId: string) {
    return this.database.transaction(() => {
      this.database
        .prepare(
          "UPDATE oauth_access_tokens SET revoked_at=? WHERE user_id=? AND client_id=?",
        )
        .run(new Date().toISOString(), userId, clientId);
      this.database
        .prepare(
          "UPDATE oauth_refresh_tokens SET revoked_at=? WHERE user_id=? AND client_id=?",
        )
        .run(new Date().toISOString(), userId, clientId);
      return (
        this.database
          .prepare("DELETE FROM oauth_grants WHERE user_id=? AND client_id=?")
          .run(userId, clientId).changes > 0
      );
    })();
  }

  createConversation(userId: string, title = "New conversation") {
    const id = randomUUID(),
      now = new Date().toISOString();
    this.database
      .prepare(
        "INSERT INTO conversations(id,user_id,title,created_at,updated_at) VALUES(?,?,?,?,?)",
      )
      .run(id, userId, title, now, now);
    return this.getConversation(userId, id);
  }
  listConversations(userId: string) {
    return this.database
      .prepare(
        `SELECT c.id,c.title,c.created_at AS createdAt,c.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id=c.id) messageCount
      FROM conversations c WHERE c.user_id=? ORDER BY c.updated_at DESC`,
      )
      .all(userId);
  }
  getConversation(userId: string, id: string) {
    const conversation = this.database
      .prepare(
        "SELECT id,title,created_at AS createdAt,updated_at AS updatedAt FROM conversations WHERE id=? AND user_id=?",
      )
      .get(id, userId) as Row | undefined;
    if (!conversation) return null;
    const messages = this.database
      .prepare(
        "SELECT id,role,content,sources_json AS sourcesJson,sufficient,status,request_id AS requestId,error_code AS errorCode,retry_of AS retryOf,user_message_id AS userMessageId,created_at AS createdAt FROM conversation_messages WHERE conversation_id=? ORDER BY created_at,rowid",
      )
      .all(id) as Row[];
    return {
      id: String(conversation.id),
      title: String(conversation.title),
      createdAt: String(conversation.createdAt),
      updatedAt: String(conversation.updatedAt),
      messages: messages.map((message) => ({
        id: String(message.id),
        role: String(message.role) as "user" | "assistant",
        content: String(message.content),
        createdAt: String(message.createdAt),
        sources: JSON.parse(String(message.sourcesJson ?? "[]")) as unknown[],
        sufficient:
          message.sufficient === null ? null : Boolean(message.sufficient),
        status: String(message.status ?? "complete"),
        requestId: message.requestId as string | null,
        errorCode: message.errorCode as string | null,
        retryOf: message.retryOf as string | null,
        userMessageId: message.userMessageId as string | null,
      })),
    };
  }
  addConversationMessage(
    userId: string,
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    sources: unknown[] = [],
    sufficient: boolean | null = null,
  ) {
    const conversation = this.database
      .prepare("SELECT id,title FROM conversations WHERE id=? AND user_id=?")
      .get(conversationId, userId) as { id: string; title: string } | undefined;
    if (!conversation) throw new Error("Conversation not found");
    const id = randomUUID(),
      now = new Date().toISOString();
    this.database.transaction(() => {
      this.database
        .prepare(
          "INSERT INTO conversation_messages(id,conversation_id,role,content,sources_json,sufficient,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          id,
          conversationId,
          role,
          content,
          JSON.stringify(sources),
          sufficient === null ? null : sufficient ? 1 : 0,
          now,
        );
      const title =
        role === "user" && conversation.title === "New conversation"
          ? content.trim().slice(0, 72)
          : conversation.title;
      this.database
        .prepare("UPDATE conversations SET title=?,updated_at=? WHERE id=?")
        .run(title, now, conversationId);
    })();
    return id;
  }
  beginConversationTurn(
    userId: string,
    conversationId: string,
    question: string,
    requestId: string,
  ) {
    return this.database.transaction(() => {
      const conversation = this.database
        .prepare("SELECT id,title FROM conversations WHERE id=? AND user_id=?")
        .get(conversationId, userId) as
        { id: string; title: string } | undefined;
      if (!conversation) throw new Error("conversation_not_found");
      const existing = this.database
        .prepare(
          "SELECT id,status,user_message_id AS userMessageId FROM conversation_messages WHERE conversation_id=? AND request_id=?",
        )
        .get(conversationId, requestId) as
        { id: string; status: string; userMessageId: string } | undefined;
      if (existing)
        return {
          assistantId: existing.id,
          userMessageId: existing.userMessageId,
          status: existing.status,
          existing: true,
        };
      if (
        this.database
          .prepare(
            "SELECT id FROM conversation_messages WHERE conversation_id=? AND role='assistant' AND status='pending'",
          )
          .get(conversationId)
      )
        throw new Error("conversation_busy");
      const now = new Date().toISOString(),
        userMessageId = randomUUID(),
        assistantId = randomUUID();
      this.database
        .prepare(
          "INSERT INTO conversation_messages(id,conversation_id,role,content,sources_json,sufficient,status,created_at) VALUES(?,?, 'user',?,'[]',NULL,'complete',?)",
        )
        .run(userMessageId, conversationId, question, now);
      this.database
        .prepare(
          "INSERT INTO conversation_messages(id,conversation_id,role,content,sources_json,sufficient,status,request_id,user_message_id,created_at) VALUES(?,?,'assistant','','[]',NULL,'pending',?,?,?)",
        )
        .run(assistantId, conversationId, requestId, userMessageId, now);
      this.database
        .prepare("UPDATE conversations SET title=?,updated_at=? WHERE id=?")
        .run(
          conversation.title === "New conversation"
            ? question.trim().slice(0, 72)
            : conversation.title,
          now,
          conversationId,
        );
      return { assistantId, userMessageId, status: "pending", existing: false };
    })();
  }
  beginConversationRetry(
    userId: string,
    conversationId: string,
    failedId: string,
    requestId: string,
  ) {
    return this.database.transaction(() => {
      const failed = this.database
        .prepare(
          `SELECT a.id,a.status,a.user_message_id AS userMessageId,u.content question FROM conversation_messages a
        JOIN conversations c ON c.id=a.conversation_id JOIN conversation_messages u ON u.id=a.user_message_id WHERE a.id=? AND a.conversation_id=? AND c.user_id=? AND a.role='assistant'`,
        )
        .get(failedId, conversationId, userId) as
        | {
            id: string;
            status: string;
            userMessageId: string;
            question: string;
          }
        | undefined;
      if (!failed || !["failed", "cancelled"].includes(failed.status))
        throw new Error("not_retryable");
      const existing = this.database
        .prepare(
          "SELECT id,status FROM conversation_messages WHERE conversation_id=? AND request_id=?",
        )
        .get(conversationId, requestId) as
        { id: string; status: string } | undefined;
      if (existing)
        return {
          assistantId: existing.id,
          userMessageId: failed.userMessageId,
          question: failed.question,
          status: existing.status,
          existing: true,
        };
      if (
        this.database
          .prepare(
            "SELECT id FROM conversation_messages WHERE conversation_id=? AND role='assistant' AND status='pending'",
          )
          .get(conversationId)
      )
        throw new Error("conversation_busy");
      const assistantId = randomUUID(),
        now = new Date().toISOString();
      this.database
        .prepare(
          "INSERT INTO conversation_messages(id,conversation_id,role,content,sources_json,sufficient,status,request_id,retry_of,user_message_id,created_at) VALUES(?,?,'assistant','','[]',NULL,'pending',?,?,?,?)",
        )
        .run(
          assistantId,
          conversationId,
          requestId,
          failedId,
          failed.userMessageId,
          now,
        );
      return {
        assistantId,
        userMessageId: failed.userMessageId,
        question: failed.question,
        status: "pending",
        existing: false,
      };
    })();
  }
  completeConversationAttempt(
    userId: string,
    conversationId: string,
    assistantId: string,
    content: string,
    sources: unknown[],
    sufficient: boolean,
  ) {
    const result = this.database
      .prepare(
        `UPDATE conversation_messages SET content=?,sources_json=?,sufficient=?,status='complete',error_code=NULL WHERE id=? AND conversation_id=? AND role='assistant' AND EXISTS(SELECT 1 FROM conversations c WHERE c.id=? AND c.user_id=?)`,
      )
      .run(
        content,
        JSON.stringify(sources),
        sufficient ? 1 : 0,
        assistantId,
        conversationId,
        conversationId,
        userId,
      );
    if (!result.changes) throw new Error("attempt_not_found");
    this.database
      .prepare("UPDATE conversations SET updated_at=? WHERE id=?")
      .run(new Date().toISOString(), conversationId);
  }
  failConversationAttempt(
    userId: string,
    conversationId: string,
    assistantId: string,
    status: "failed" | "cancelled",
    errorCode: string,
  ) {
    this.database
      .prepare(
        `UPDATE conversation_messages SET status=?,error_code=? WHERE id=? AND conversation_id=? AND role='assistant' AND EXISTS(SELECT 1 FROM conversations c WHERE c.id=? AND c.user_id=?)`,
      )
      .run(
        status,
        errorCode,
        assistantId,
        conversationId,
        conversationId,
        userId,
      );
  }
  deleteConversation(userId: string, id: string) {
    return (
      this.database
        .prepare("DELETE FROM conversations WHERE id=? AND user_id=?")
        .run(id, userId).changes > 0
    );
  }
  searchKnowledge(userId: string, query: string, limit?: number) {
    const stop = new Set([
      "what",
      "which",
      "where",
      "when",
      "who",
      "why",
      "how",
      "have",
      "has",
      "had",
      "saved",
      "save",
      "show",
      "tell",
      "about",
      "from",
      "that",
      "this",
      "these",
      "those",
      "with",
      "would",
      "could",
      "should",
      "are",
      "was",
      "were",
      "the",
      "and",
      "for",
      "you",
      "your",
      "mine",
    ]);
    const tokens = [
      ...new Set(
        query
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, " ")
          .split(/\s+/)
          .filter((token) => token.length > 1 && !stop.has(token)),
      ),
    ].slice(0, 12);
    if (!tokens.length) return [];
    const match = tokens
      .map((token) => `"${token.replaceAll('"', "")}"*`)
      .join(" OR ");
    const ftsRows = this.database
      .prepare(
        `SELECT c.*,bm25(captures_fts_v2,0,10,9,4,3,2,7,8,1) rank FROM captures_fts_v2 JOIN captures c ON c.id=captures_fts_v2.capture_id WHERE captures_fts_v2 MATCH ? AND c.owner_user_id=? ORDER BY rank`,
      )
      .all(match, userId) as Row[];
    const candidates = new Map<
      string,
      Row & { score?: number; reason?: string }
    >();
    for (const row of ftsRows)
      candidates.set(String(row.id), {
        ...row,
        score: -Number(row.rank),
        reason: "fts",
      });
    const extra = (
      this.database
        .prepare(
          "SELECT c.*,cl.node_id AS nodeId,0 rank FROM captures c JOIN capture_library cl ON cl.capture_id=c.id WHERE c.owner_user_id=? ORDER BY c.created_at DESC",
        )
        .all(userId) as Row[]
    ).filter((row) => {
      const labels = this.libraryBreadcrumb(String(row.nodeId))
        .map((node) => node.label.toLowerCase())
        .join(" ");
      return tokens.some((token) => labels.includes(token));
    });
    for (const row of extra) {
      const id = String(row.id),
        existing = candidates.get(id);
      candidates.set(id, {
        ...(existing ?? row),
        score: (existing?.score ?? 0) + 12,
        reason: existing ? "fts+taxonomy" : "taxonomy",
      });
    }
    const sorted = [...candidates.values()].sort(
      (a, b) =>
        Number(b.score) - Number(a.score) ||
        String(b.created_at).localeCompare(String(a.created_at)) ||
        String(b.id).localeCompare(String(a.id)),
    );
    const rows = limit === undefined ? sorted : sorted.slice(0, limit);
    return rows.map((row) => {
      const capture = this.mapCapture(row, true);
      const assignment = this.libraryAssignment(capture.id);
      return {
        capture,
        breadcrumb: assignment
          ? this.libraryBreadcrumb(assignment.nodeId).map((node) => node.label)
          : [],
        score: Number(row.score ?? 0),
        reason: String(row.reason ?? "fts"),
      };
    });
  }
  ownedCaptures(userId: string) {
    return (
      this.database
        .prepare(
          "SELECT * FROM captures WHERE owner_user_id=? ORDER BY created_at DESC,id DESC",
        )
        .all(userId) as Row[]
    ).map((row) => this.mapCapture(row, true));
  }
  *iterateOwnedCaptures(userId: string) {
    const rows = this.database
      .prepare(
        "SELECT * FROM captures WHERE owner_user_id=? ORDER BY created_at DESC,id DESC",
      )
      .iterate(userId) as IterableIterator<Row>;
    for (const row of rows) yield this.mapCapture(row, true);
  }
  libraryFacets(captureId: string) {
    return (
      this.database
        .prepare(
          "SELECT label FROM capture_library_facets WHERE capture_id=? ORDER BY label",
        )
        .all(captureId) as Array<{ label: string }>
    ).map((row) => row.label);
  }
  createKnowledgeExport(
    userId: string,
    includeTranscript: boolean,
    includeComments: boolean,
    kind = "metadata",
  ) {
    const id = randomUUID(),
      createdAt = new Date().toISOString(),
      expiresAt = new Date(Date.now() + 86400000).toISOString();
    this.database
      .prepare(
        "INSERT INTO knowledge_exports(id,user_id,status,include_transcript,include_comments,path,error_code,record_count,created_at,expires_at,kind) VALUES(?,?,'pending',?,?,NULL,NULL,NULL,?,?,?)",
      )
      .run(
        id,
        userId,
        includeTranscript ? 1 : 0,
        includeComments ? 1 : 0,
        createdAt,
        expiresAt,
        kind,
      );
    return { id, status: "pending", kind, createdAt, expiresAt };
  }
  getKnowledgeExport(userId: string, id: string) {
    return this.database
      .prepare(
        "SELECT id,status,kind,include_transcript AS includeTranscript,include_comments AS includeComments,path,error_code AS errorCode,record_count AS recordCount,created_at AS createdAt,expires_at AS expiresAt FROM knowledge_exports WHERE id=? AND user_id=?",
      )
      .get(id, userId) as
      | {
          id: string;
          status: string;
          kind: string;
          includeTranscript: number;
          includeComments: number;
          path: string | null;
          errorCode: string | null;
          recordCount: number | null;
          createdAt: string;
          expiresAt: string;
        }
      | undefined;
  }
  listKnowledgeExports(userId: string, kind?: string) {
    return this.database
      .prepare(
        `SELECT id,status,kind,error_code AS errorCode,record_count AS recordCount,created_at AS createdAt,expires_at AS expiresAt
       FROM knowledge_exports WHERE user_id=?${kind ? " AND kind=?" : ""} ORDER BY created_at DESC LIMIT 10`,
      )
      .all(...(kind ? [userId, kind] : [userId]));
  }
  completeKnowledgeExport(
    userId: string,
    id: string,
    path: string,
    count: number,
  ) {
    this.database
      .prepare(
        "UPDATE knowledge_exports SET status='complete',path=?,record_count=?,error_code=NULL WHERE id=? AND user_id=?",
      )
      .run(path, count, id, userId);
  }
  failKnowledgeExport(userId: string, id: string, code: string) {
    this.database
      .prepare(
        "UPDATE knowledge_exports SET status='failed',error_code=? WHERE id=? AND user_id=?",
      )
      .run(code, id, userId);
  }
  expiredKnowledgeExports() {
    return this.database
      .prepare("SELECT id,path FROM knowledge_exports WHERE expires_at<=?")
      .all(new Date().toISOString()) as Array<{
      id: string;
      path: string | null;
    }>;
  }
  pendingKnowledgeExports() {
    return this.database
      .prepare(
        "SELECT id,user_id AS userId FROM knowledge_exports WHERE status='pending'",
      )
      .all() as Array<{ id: string; userId: string }>;
  }
  deleteKnowledgeExport(id: string) {
    this.database.prepare("DELETE FROM knowledge_exports WHERE id=?").run(id);
  }

  platformConnection(userId: string, platform: string) {
    return this.database
      .prepare(
        `SELECT platform,status,cookie_count AS cookieCount,last_validated_at AS lastValidatedAt,last_used_at AS lastUsedAt,updated_at AS updatedAt
         FROM platform_connections WHERE user_id=? AND platform=?`,
      )
      .get(userId, platform) as
      | {
          platform: string;
          status: string;
          cookieCount: number;
          lastValidatedAt: string | null;
          lastUsedAt: string | null;
          updatedAt: string;
        }
      | undefined;
  }
  platformConnectionSecret(userId: string, platform: string) {
    return this.database
      .prepare(
        "SELECT encrypted_payload AS encryptedPayload FROM platform_connections WHERE user_id=? AND platform=?",
      )
      .get(userId, platform) as { encryptedPayload: string } | undefined;
  }
  savePlatformConnection(
    userId: string,
    platform: string,
    encryptedPayload: string,
    cookieCount: number,
  ) {
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO platform_connections(user_id,platform,encrypted_payload,status,cookie_count,last_validated_at,last_used_at,last_error_code,created_at,updated_at)
         VALUES(?,?,?,'connected',?,?,NULL,NULL,?,?)
         ON CONFLICT(user_id,platform) DO UPDATE SET encrypted_payload=excluded.encrypted_payload,status='connected',cookie_count=excluded.cookie_count,last_validated_at=excluded.last_validated_at,last_error_code=NULL,updated_at=excluded.updated_at`,
      )
      .run(userId, platform, encryptedPayload, cookieCount, now, now, now);
  }
  deletePlatformConnection(userId: string, platform: string) {
    return (
      this.database
        .prepare(
          "DELETE FROM platform_connections WHERE user_id=? AND platform=?",
        )
        .run(userId, platform).changes > 0
    );
  }
  markPlatformConnectionSuccess(userId: string, platform: string) {
    const now = new Date().toISOString();
    this.database
      .prepare(
        "UPDATE platform_connections SET status='connected',last_used_at=?,last_error_code=NULL,updated_at=? WHERE user_id=? AND platform=?",
      )
      .run(now, now, userId, platform);
  }
  markPlatformConnectionAttention(
    userId: string,
    platform: string,
    errorCode: string,
  ) {
    this.database
      .prepare(
        "UPDATE platform_connections SET status='needs_attention',last_error_code=?,updated_at=? WHERE user_id=? AND platform=?",
      )
      .run(errorCode, new Date().toISOString(), userId, platform);
  }

  private migrate() {
    this.database.exec(`
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,owner_user_id TEXT NOT NULL REFERENCES users(id),source_url TEXT NOT NULL,normalized_url TEXT NOT NULL,source_hash TEXT NOT NULL,user_note TEXT,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,error TEXT,result_note_path TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,next_attempt_at TEXT NOT NULL,UNIQUE(owner_user_id,source_hash));
    CREATE INDEX IF NOT EXISTS idx_jobs_queue ON jobs(status,next_attempt_at,created_at);
    CREATE TABLE IF NOT EXISTS captures(id TEXT PRIMARY KEY,owner_user_id TEXT NOT NULL REFERENCES users(id),job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id),source_hash TEXT NOT NULL,source_url TEXT NOT NULL,platform TEXT NOT NULL,source_type TEXT NOT NULL,source_id TEXT NOT NULL,title TEXT NOT NULL,creator TEXT,creator_url TEXT,description TEXT,transcript TEXT NOT NULL,synopsis TEXT NOT NULL,why_useful TEXT,analysis_json TEXT NOT NULL,topics_text TEXT NOT NULL,entities_text TEXT NOT NULL,published_at TEXT,duration_seconds REAL,note_path TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(owner_user_id,source_hash));
    CREATE UNIQUE INDEX IF NOT EXISTS idx_captures_platform_source ON captures(owner_user_id,platform,source_id);
    CREATE INDEX IF NOT EXISTS idx_captures_owner_created ON captures(owner_user_id,created_at DESC,id DESC);
    CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,kind TEXT NOT NULL,path TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,position INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS job_events(id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,status TEXT NOT NULL,message TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(token_hash);
    CREATE TABLE IF NOT EXISTS api_keys(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,prefix TEXT NOT NULL,created_at TEXT NOT NULL,last_used_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(token_hash);
    CREATE TABLE IF NOT EXISTS oauth_clients(client_id TEXT PRIMARY KEY,name TEXT NOT NULL,redirect_uris_json TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_grants(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,scope TEXT NOT NULL,authorized_at TEXT NOT NULL,last_used_at TEXT,PRIMARY KEY(user_id,client_id));
    CREATE TABLE IF NOT EXISTS oauth_authorization_codes(code_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,redirect_uri TEXT NOT NULL,code_challenge TEXT NOT NULL,resource TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,consumed_at TEXT);
    CREATE TABLE IF NOT EXISTS oauth_access_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,scope TEXT NOT NULL,resource TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,last_used_at TEXT,revoked_at TEXT);
    CREATE TABLE IF NOT EXISTS oauth_refresh_tokens(token_hash TEXT PRIMARY KEY,family_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,scope TEXT NOT NULL,resource TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,revoked_at TEXT,replaced_by TEXT);
    CREATE VIRTUAL TABLE IF NOT EXISTS captures_fts USING fts5(capture_id UNINDEXED,title,creator,description,synopsis,transcript,topics,entities);
    CREATE TABLE IF NOT EXISTS library_nodes(id TEXT PRIMARY KEY,parent_id TEXT REFERENCES library_nodes(id) ON DELETE RESTRICT,label TEXT NOT NULL,slug TEXT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_library_siblings ON library_nodes(COALESCE(parent_id,''),slug);
    CREATE TABLE IF NOT EXISTS library_aliases(alias TEXT PRIMARY KEY,node_id TEXT NOT NULL REFERENCES library_nodes(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS capture_library(capture_id TEXT PRIMARY KEY REFERENCES captures(id) ON DELETE CASCADE,node_id TEXT NOT NULL REFERENCES library_nodes(id) ON DELETE RESTRICT,confidence REAL NOT NULL,assigned_by TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_capture_library_node ON capture_library(node_id);
    CREATE TABLE IF NOT EXISTS capture_library_facets(capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,label TEXT NOT NULL,PRIMARY KEY(capture_id,label));
    CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id,updated_at DESC);
    CREATE TABLE IF NOT EXISTS conversation_messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,role TEXT NOT NULL,content TEXT NOT NULL,sources_json TEXT NOT NULL DEFAULT '[]',sufficient INTEGER,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_conversation_messages ON conversation_messages(conversation_id,created_at);
    CREATE TABLE IF NOT EXISTS knowledge_exports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL,include_transcript INTEGER NOT NULL,include_comments INTEGER NOT NULL,path TEXT,error_code TEXT,record_count INTEGER,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'metadata');
    CREATE INDEX IF NOT EXISTS idx_knowledge_exports_user ON knowledge_exports(user_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS platform_connections(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,platform TEXT NOT NULL CHECK(platform IN ('facebook','instagram')),encrypted_payload TEXT NOT NULL,status TEXT NOT NULL,cookie_count INTEGER NOT NULL,last_validated_at TEXT,last_used_at TEXT,last_error_code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,platform));
  `);
    const exportColumns = (
      this.database
        .prepare("PRAGMA table_info(knowledge_exports)")
        .all() as Array<{ name: string }>
    ).map((column) => column.name);
    if (!exportColumns.includes("kind"))
      this.database.exec(
        "ALTER TABLE knowledge_exports ADD COLUMN kind TEXT NOT NULL DEFAULT 'metadata'",
      );
    this.database.exec(
      "CREATE VIRTUAL TABLE IF NOT EXISTS captures_fts_v2 USING fts5(capture_id UNINDEXED,title,takeaways,creator,synopsis,description,topics,entities,transcript)",
    );
    for (const domain of libraryDomains)
      this.ensureLibraryNode(null, domain, "domain");
    const columns = (
      this.database.prepare("PRAGMA table_info(jobs)").all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);
    if (!columns.includes("error_code"))
      this.database.exec("ALTER TABLE jobs ADD COLUMN error_code TEXT");
    if (!columns.includes("error_detail"))
      this.database.exec("ALTER TABLE jobs ADD COLUMN error_detail TEXT");
    if (!columns.includes("display_title"))
      this.database.exec("ALTER TABLE jobs ADD COLUMN display_title TEXT");
    const userColumns = (
      this.database.prepare("PRAGMA table_info(users)").all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);
    if (!userColumns.includes("default_language"))
      this.database.exec(
        "ALTER TABLE users ADD COLUMN default_language TEXT NOT NULL DEFAULT 'English'",
      );
    if (!userColumns.includes("translate_foreign"))
      this.database.exec(
        "ALTER TABLE users ADD COLUMN translate_foreign INTEGER NOT NULL DEFAULT 1",
      );
    const captureColumns = (
      this.database.prepare("PRAGMA table_info(captures)").all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);
    if (!captureColumns.includes("source_language"))
      this.database.exec(
        "ALTER TABLE captures ADD COLUMN source_language TEXT",
      );
    if (!captureColumns.includes("translated_transcript"))
      this.database.exec(
        "ALTER TABLE captures ADD COLUMN translated_transcript TEXT",
      );
    if (!captureColumns.includes("translation_language"))
      this.database.exec(
        "ALTER TABLE captures ADD COLUMN translation_language TEXT",
      );
    if (!captureColumns.includes("comments_json"))
      this.database.exec(
        "ALTER TABLE captures ADD COLUMN comments_json TEXT NOT NULL DEFAULT '[]'",
      );
    this.migrateOwnership();
    const messageColumns = (
      this.database
        .prepare("PRAGMA table_info(conversation_messages)")
        .all() as Array<{ name: string }>
    ).map((column) => column.name);
    if (!messageColumns.includes("status"))
      this.database.exec(
        "ALTER TABLE conversation_messages ADD COLUMN status TEXT NOT NULL DEFAULT 'complete'",
      );
    if (!messageColumns.includes("request_id"))
      this.database.exec(
        "ALTER TABLE conversation_messages ADD COLUMN request_id TEXT",
      );
    if (!messageColumns.includes("error_code"))
      this.database.exec(
        "ALTER TABLE conversation_messages ADD COLUMN error_code TEXT",
      );
    if (!messageColumns.includes("retry_of"))
      this.database.exec(
        "ALTER TABLE conversation_messages ADD COLUMN retry_of TEXT REFERENCES conversation_messages(id)",
      );
    if (!messageColumns.includes("user_message_id"))
      this.database.exec(
        "ALTER TABLE conversation_messages ADD COLUMN user_message_id TEXT REFERENCES conversation_messages(id)",
      );
    this.database.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_request ON conversation_messages(conversation_id,request_id) WHERE request_id IS NOT NULL; CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_pending ON conversation_messages(conversation_id) WHERE role='assistant' AND status='pending'",
    );
    const indexed = Number(
      (
        this.database
          .prepare("SELECT COUNT(*) n FROM captures_fts_v2")
          .get() as { n: number }
      ).n,
    );
    const captureCount = Number(
      (
        this.database.prepare("SELECT COUNT(*) n FROM captures").get() as {
          n: number;
        }
      ).n,
    );
    if (indexed !== captureCount) {
      this.database.exec("DELETE FROM captures_fts_v2");
      for (const row of this.database
        .prepare("SELECT id FROM captures")
        .all() as Array<{ id: string }>)
        this.indexCapture(row.id);
    }
    this.database.exec(`
      UPDATE jobs
      SET display_title = (SELECT captures.title FROM captures WHERE captures.job_id = jobs.id)
      WHERE display_title IS NULL
        AND EXISTS (SELECT 1 FROM captures WHERE captures.job_id = jobs.id);

      UPDATE jobs
      SET display_title = (SELECT captures.title FROM captures WHERE captures.note_path LIKE '%' || jobs.result_note_path LIMIT 1)
      WHERE display_title IS NULL
        AND result_note_path IS NOT NULL
        AND EXISTS (SELECT 1 FROM captures WHERE captures.note_path LIKE '%' || jobs.result_note_path)
    `);
  }
  private migrateOwnership() {
    const columns = (
      this.database.prepare("PRAGMA table_info(jobs)").all() as Array<{
        name: string;
      }>
    ).map((column) => column.name);
    if (columns.includes("owner_user_id")) return;
    const owner = this.database
      .prepare(
        "SELECT id FROM users ORDER BY CASE WHEN username='demo' THEN 0 ELSE 1 END,created_at LIMIT 1",
      )
      .get() as { id: string } | undefined;
    const count = Number(
      (
        this.database.prepare("SELECT COUNT(*) n FROM jobs").get() as {
          n: number;
        }
      ).n,
    );
    if (count && !owner)
      throw new Error("Cannot migrate owned content without an existing user");
    this.database.pragma("foreign_keys = OFF");
    try {
      this.database.transaction(() => {
        this.database.exec(
          `CREATE TABLE jobs_owned(id TEXT PRIMARY KEY,owner_user_id TEXT NOT NULL REFERENCES users(id),source_url TEXT NOT NULL,normalized_url TEXT NOT NULL,source_hash TEXT NOT NULL,user_note TEXT,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,error TEXT,result_note_path TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,next_attempt_at TEXT NOT NULL,error_code TEXT,error_detail TEXT,display_title TEXT,UNIQUE(owner_user_id,source_hash));`,
        );
        this.database
          .prepare(
            `INSERT INTO jobs_owned SELECT id,?,source_url,normalized_url,source_hash,user_note,status,attempts,error,result_note_path,created_at,updated_at,next_attempt_at,error_code,error_detail,display_title FROM jobs`,
          )
          .run(owner?.id ?? "");
        this.database.exec(
          `CREATE TABLE captures_owned(id TEXT PRIMARY KEY,owner_user_id TEXT NOT NULL REFERENCES users(id),job_id TEXT NOT NULL UNIQUE REFERENCES jobs_owned(id),source_hash TEXT NOT NULL,source_url TEXT NOT NULL,platform TEXT NOT NULL,source_type TEXT NOT NULL,source_id TEXT NOT NULL,title TEXT NOT NULL,creator TEXT,creator_url TEXT,description TEXT,transcript TEXT NOT NULL,synopsis TEXT NOT NULL,why_useful TEXT,analysis_json TEXT NOT NULL,topics_text TEXT NOT NULL,entities_text TEXT NOT NULL,published_at TEXT,duration_seconds REAL,note_path TEXT NOT NULL,created_at TEXT NOT NULL,source_language TEXT,translated_transcript TEXT,translation_language TEXT,comments_json TEXT NOT NULL DEFAULT '[]',UNIQUE(owner_user_id,source_hash),UNIQUE(owner_user_id,platform,source_id));`,
        );
        this.database
          .prepare(
            `INSERT INTO captures_owned SELECT id,?,job_id,source_hash,source_url,platform,source_type,source_id,title,creator,creator_url,description,transcript,synopsis,why_useful,analysis_json,topics_text,entities_text,published_at,duration_seconds,note_path,created_at,source_language,translated_transcript,translation_language,comments_json FROM captures`,
          )
          .run(owner?.id ?? "");
        this.database.exec(
          "DROP TABLE captures; DROP TABLE jobs; ALTER TABLE jobs_owned RENAME TO jobs; ALTER TABLE captures_owned RENAME TO captures; CREATE INDEX idx_jobs_queue ON jobs(status,next_attempt_at,created_at); CREATE UNIQUE INDEX idx_captures_platform_source ON captures(owner_user_id,platform,source_id)",
        );
      })();
    } finally {
      this.database.pragma("foreign_keys = ON");
    }
    const problems = this.database.pragma("foreign_key_check") as unknown[];
    if (problems.length)
      throw new Error("Ownership migration failed foreign-key validation");
  }
  private mapJob(row: Row | undefined): JobRecord | null {
    if (!row) return null;
    return {
      id: String(row.id),
      ownerUserId: String(row.owner_user_id),
      sourceUrl: String(row.source_url),
      normalizedUrl: String(row.normalized_url),
      displayTitle: row.display_title as string | null,
      sourceHash: String(row.source_hash),
      userNote: row.user_note as string | null,
      status: row.status as JobStatus,
      attempts: Number(row.attempts),
      error: row.error as string | null,
      errorCode: row.error_code as string | null,
      errorDetail: row.error_detail as string | null,
      resultNotePath: row.result_note_path as string | null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      nextAttemptAt: String(row.next_attempt_at),
    };
  }
  private mapAsset(row: Row): AssetRecord {
    return {
      id: String(row.id),
      captureId: String(row.capture_id),
      kind: row.kind as AssetKind,
      path: String(row.path),
      mimeType: String(row.mime_type),
      sizeBytes: Number(row.size_bytes),
      position: Number(row.position),
    };
  }
  private mapCapture(row: Row, detail: boolean): CaptureRecord {
    const storedAnalysis = JSON.parse(
      String(row.analysis_json),
    ) as AnalysisResult;
    const analysis: AnalysisResult = {
      ...storedAnalysis,
      takeaways: storedAnalysis.takeaways ?? [],
      classification: storedAnalysis.classification ?? unclassified,
    };
    return {
      id: String(row.id),
      ownerUserId: String(row.owner_user_id),
      jobId: String(row.job_id),
      sourceHash: String(row.source_hash),
      sourceUrl: String(row.source_url),
      platform: String(row.platform),
      sourceType: row.source_type as SourceType,
      sourceId: String(row.source_id),
      title: String(row.title),
      creator: row.creator as string | null,
      creatorUrl: row.creator_url as string | null,
      description: detail ? (row.description as string | null) : null,
      transcript: detail ? String(row.transcript) : "",
      sourceLanguage: row.source_language as string | null,
      translatedTranscript: detail
        ? (row.translated_transcript as string | null)
        : null,
      translationLanguage: row.translation_language as string | null,
      comments: detail
        ? (JSON.parse(String(row.comments_json ?? "[]")) as SocialComment[])
        : [],
      synopsis: String(row.synopsis),
      whyUseful: detail ? (row.why_useful as string | null) : null,
      analysis: detail
        ? analysis
        : {
            ...analysis,
            evidence: [],
            recommendations: [],
            claimsNeedingVerification: [],
          },
      topics: analysis.topics,
      entities: detail ? analysis.entities : [],
      publishedAt: row.published_at as string | null,
      durationSeconds:
        row.duration_seconds === null ? null : Number(row.duration_seconds),
      notePath: String(row.note_path),
      createdAt: String(row.created_at),
      assets: this.assets(String(row.id)),
    };
  }
}

function normalizePlace(value: string) {
  const cleaned = value.trim();
  const aliases: Record<string, string> = {
    lisboa: "Lisbon",
    oporto: "Porto",
    usa: "United States",
    uk: "United Kingdom",
  };
  return (
    aliases[cleaned.toLowerCase()] ??
    cleaned.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase())
  );
}
