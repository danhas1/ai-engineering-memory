// Team workspace — "all" means no filter applied
export type TeamWorkspace = 'all' | 'Platform' | 'Payments' | 'Data' | 'DevOps'

export interface TeamInfo {
  id:          TeamWorkspace
  label:       string
  description: string
}

export interface TeamsResponse {
  teams: TeamInfo[]
}

export interface AskRequest {
  question: string
  team?:    string   // omit or empty string for all-teams search
}

// ── Document metadata (extracted from S3 document headers) ─────────────────────
export interface SourceMetadata {
  author:       string | null
  email:        string | null
  team:         string | null
  last_updated: string | null
  tags:         string[]
}

export interface Source {
  uri:      string
  filename: string
  excerpt:  string
  metadata: SourceMetadata
}

// ── Full enriched response from /ask ──────────────────────────────────────────
export interface AskSuccessResponse {
  answer:  string
  sources: Source[]

  // Owner escalation (shown when confidence is low or documentation gap exists)
  owner?:       string | null
  owner_email?: string | null

  // Enrichment fields used for owner routing logic (not shown in UI)
  confidence_score?:      number | null
  has_documentation_gap?: boolean
  is_stale?:              boolean
}

export interface AskErrorResponse {
  error: string
}

export interface HealthResponse {
  status:            'ok'
  knowledge_base_id: string
  teams?:            string[]
}

// ── Knowledge gaps ────────────────────────────────────────────────────────────
export interface KnowledgeGap {
  id:         string
  topic:      string
  question:   string
  frequency:  number
  last_seen:  string
  created_at: string
}

export interface GapsResponse {
  gaps: KnowledgeGap[]
}

// ── Document type ─────────────────────────────────────────────────────────────
export type DocType = 'ADR' | 'INC' | 'JIRA' | 'RUN' | 'SLACK' | 'ARCH' | 'RETRO' | 'SEC' | 'DOC'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
