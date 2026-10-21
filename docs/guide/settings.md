# Settings and AI

## Provider connections and task selections

Connect keys in Settings → AI & models, then assign tasks and save changes. Connecting a provider does not automatically assign it to a task. Transcription and Analysis are separate; Analysis also powers Ask. Supported thinking levels depend on the selected model. Queued captures retain their saved task selections.

Transcription and analysis are separate account-scoped selections. Provider definitions and routing live in `src/ai-providers.ts`. OpenAI supplies transcription and can also supply analysis; Cerebras supplies analysis only. `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_ANALYSIS_MODEL`, and `CEREBRAS_ANALYSIS_MODEL` define the supported model catalog, while credentials remain encrypted per user. The application does not require or fall back to a deployment-wide `OPENAI_API_KEY`.

Use **Test connection** after saving to explicitly test transcription, structured analysis, or streaming Ask. Transcription requires a short audio file you choose; analysis and Ask use synthetic text. These checks can incur provider usage, create no captures or conversations, and do not certify social downloads or the full capture pipeline.

Operators must preserve the [credential encryption keys](./self-hosting.md#credential-encryption) across restarts and backups.

## Languages

Language preferences live under Settings → Data & export. Changes apply to new captures; existing notes retain their language. Each user can select a default language and independently enable or disable translation of foreign-language captures. Both the original and translated transcript remain visible and searchable.

## Accounts and invitations

The first successful registration creates the archive administrator. Once claimed, new accounts are created only from an administrator-issued invitation in **Settings → People & access**. Invitations are single-use bearer links that expire after 24 hours; they can grant either member access or administrator access, and an administrator can revoke or regenerate them.

Treat an invitation link like a password: send it only through a trusted private channel, do not place it in tickets or chat transcripts, and revoke it if it may have been exposed. Administrators manage accounts and invitations, but every archive, provider credential, connection, export, and API key remains scoped to its owning account.

For connection revocation, see [MCP](./api-and-mcp.md#chatgpt-and-codex-via-mcp). For platform-cookie uploads, see [social connections](./self-hosting.md#social-connections). API key permissions and guided capture-only key setup are described in [Capture and Shortcuts](./capture.md#guided-shortcut-setup).
