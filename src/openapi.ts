const filterParameters = [
  "topic",
  "country",
  "city",
  "creator",
  "platform",
  "sourceType",
  "from",
  "to",
].map((name) => ({
  name,
  in: "query",
  required: false,
  schema: { type: "string" },
}));

const paging = [
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 100 },
  },
  { name: "cursor", in: "query", schema: { type: "string" } },
];

const errors = {
  "400": {
    description: "Invalid request",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
      },
    },
  },
  "401": { description: "Missing, invalid, or revoked account API key" },
  "404": { description: "Owned resource not found" },
  "429": {
    description: "Rate limit exceeded",
    headers: { "Retry-After": { schema: { type: "integer" } } },
  },
};

const refContent = (ref: string) => ({
  "application/json": { schema: { $ref: ref } },
});

export const openApiDocument = (appUrl: string) =>
  ({
    openapi: "3.1.0",
    info: {
      title: "Social Knowledge Agent API",
      version: "1.0.0",
      description:
        "Search, browse, and export an account-owned Social Knowledge archive. Account API keys can also submit captures through POST /api/v1/jobs.",
    },
    servers: [{ url: appUrl.replace(/\/$/, "") }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "sk_…" },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "string" },
            message: { type: "string" },
          },
        },
        KnowledgeCapture: {
          type: "object",
          required: [
            "schemaVersion",
            "id",
            "title",
            "platform",
            "sourceType",
            "sourceUrl",
            "synopsis",
            "takeaways",
            "topics",
            "breadcrumb",
            "capturedAt",
          ],
          properties: {
            schemaVersion: { const: "1" },
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            creator: { type: ["string", "null"] },
            platform: { type: "string" },
            sourceType: { enum: ["video", "image", "carousel", "mixed"] },
            sourceUrl: { type: "string", format: "uri" },
            synopsis: { type: "string" },
            bottomLine: { type: ["string", "null"] },
            takeaways: { type: "array", items: { type: "string" } },
            topics: { type: "array", items: { type: "string" } },
            secondaryFacets: { type: "array", items: { type: "string" } },
            breadcrumb: { type: "array", items: { type: "string" } },
            publishedAt: { type: ["string", "null"] },
            capturedAt: { type: "string", format: "date-time" },
            transcript: {
              type: "string",
              description: "Present only when include=transcript",
            },
            comments: {
              type: "array",
              description: "Present only when include=comments",
            },
          },
        },
        SearchResult: {
          allOf: [
            { $ref: "#/components/schemas/KnowledgeCapture" },
            {
              type: "object",
              required: ["score", "matchReasons"],
              properties: {
                score: { type: "number" },
                matchReasons: { type: "array", items: { type: "string" } },
              },
            },
          ],
        },
        SearchPage: {
          type: "object",
          required: ["schemaVersion", "results", "nextCursor"],
          properties: {
            schemaVersion: { const: "1" },
            results: {
              type: "array",
              items: { $ref: "#/components/schemas/SearchResult" },
            },
            nextCursor: { type: ["string", "null"] },
          },
        },
        CapturePage: {
          type: "object",
          required: ["schemaVersion", "captures", "nextCursor"],
          properties: {
            schemaVersion: { const: "1" },
            captures: {
              type: "array",
              items: { $ref: "#/components/schemas/KnowledgeCapture" },
            },
            nextCursor: { type: ["string", "null"] },
          },
        },
        Export: {
          type: "object",
          required: ["id", "status", "createdAt", "expiresAt"],
          properties: {
            id: { type: "string", format: "uuid" },
            status: { enum: ["pending", "complete", "failed"] },
            errorCode: { type: ["string", "null"] },
            recordCount: { type: ["integer", "null"] },
            createdAt: { type: "string", format: "date-time" },
            expiresAt: { type: "string", format: "date-time" },
          },
        },
        ExportEnvelope: {
          type: "object",
          required: ["export"],
          properties: { export: { $ref: "#/components/schemas/Export" } },
        },
        TopicsResponse: {
          type: "object",
          required: ["schemaVersion", "nodes", "facets"],
          properties: {
            schemaVersion: { const: "1" },
            nodes: { type: "array", items: { type: "object" } },
            facets: {
              type: "array",
              items: {
                type: "object",
                required: ["label", "count"],
                properties: {
                  label: { type: "string" },
                  count: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
    paths: {
      "/api/v1/jobs": {
        post: {
          summary: "Submit a social URL for capture",
          description:
            "Compatible with the Apple Shortcut contract. Limited to 60 requests per hour.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: { type: "string", format: "uri" },
                    note: { type: "string" },
                  },
                },
                example: {
                  url: "https://www.instagram.com/reel/example/",
                  note: "Portugal ideas",
                },
              },
            },
          },
          responses: { "202": { description: "Accepted" }, ...errors },
        },
      },
      "/api/v1/knowledge/search": {
        get: {
          summary: "Search owned knowledge",
          description:
            "Weighted FTS5 and taxonomy search. Limited to 120 requests per minute.",
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 200 },
              example: "lisbon restaurants",
            },
            ...paging,
            ...filterParameters,
          ],
          responses: {
            "200": {
              description:
                "Ranked compact captures with score, matchReasons, and an opaque nextCursor",
              content: refContent("#/components/schemas/SearchPage"),
            },
            ...errors,
          },
        },
      },
      "/api/v1/knowledge/captures": {
        get: {
          summary: "Traverse owned captures",
          description:
            "Chronological cursor pagination; full transcripts and comments are omitted.",
          parameters: [...paging, ...filterParameters],
          responses: {
            "200": {
              description: "Compact capture page and opaque nextCursor",
              content: refContent("#/components/schemas/CapturePage"),
            },
            ...errors,
          },
        },
      },
      "/api/v1/knowledge/captures/{id}": {
        get: {
          summary: "Get structured capture knowledge",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
            {
              name: "include",
              in: "query",
              description: "Comma-separated or repeated values",
              schema: {
                type: "array",
                items: { enum: ["transcript", "comments"] },
              },
              example: "transcript,comments",
            },
          ],
          responses: {
            "200": {
              description:
                "Owned capture; assets contain metadata only and never paths or download URLs",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      capture: {
                        $ref: "#/components/schemas/KnowledgeCapture",
                      },
                    },
                  },
                },
              },
            },
            ...errors,
          },
        },
      },
      "/api/v1/knowledge/topics": {
        get: {
          summary: "Discover taxonomy nodes and secondary facets",
          responses: {
            "200": {
              description: "Owner-filtered taxonomy and counts",
              content: refContent("#/components/schemas/TopicsResponse"),
            },
            ...errors,
          },
        },
      },
      "/api/v1/knowledge/exports": {
        post: {
          summary: "Create a point-in-time JSONL gzip snapshot",
          description:
            "Limited to 5 creations per hour; snapshots expire after 24 hours.",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    include: {
                      type: "array",
                      uniqueItems: true,
                      maxItems: 2,
                      items: { enum: ["transcript", "comments"] },
                    },
                  },
                },
                example: { include: ["transcript", "comments"] },
              },
            },
          },
          responses: {
            "202": {
              description: "Export accepted",
              content: refContent("#/components/schemas/ExportEnvelope"),
            },
            ...errors,
          },
        },
      },
      "/api/v1/knowledge/exports/{id}": {
        get: {
          summary: "Get owned export status",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description: "pending, complete, or failed status",
              content: refContent("#/components/schemas/ExportEnvelope"),
            },
            ...errors,
          },
        },
      },
      "/api/v1/knowledge/exports/{id}/download": {
        get: {
          summary: "Download a completed owned snapshot",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": {
              description:
                "Gzip-compressed JSONL, one schemaVersion=1 capture per line",
              content: {
                "application/gzip": {
                  schema: { type: "string", contentEncoding: "binary" },
                },
              },
            },
            "409": { description: "Export is not ready" },
            "410": { description: "Export expired" },
            ...errors,
          },
        },
      },
    },
  }) as const;
