# Security

## Security boundaries

- Only allowlisted HTTPS Facebook and Instagram hostnames enter media capture. Other valid HTTPS submissions are retained as unsupported Activity bookmarks and are never downloaded.
- Shell execution is never used; subprocess arguments are passed as arrays.
- Playlists, overlong videos, and oversized downloads are rejected.
- Cookie authentication is optional. Deployment cookie files must be mounted read-only; user-uploaded platform cookies are filtered and encrypted at rest.
- The container runs unprivileged, drops Linux capabilities, and has a read-only root filesystem.
- The source URL and creator attribution remain in every note.

Do not use the service to bypass DRM, paywalls, access controls, or platform permissions.

## First administrator and invitations

Keep a fresh deployment on loopback or a private network until its intended administrator completes registration. The first successful registration claims administrator authority without requiring `API_TOKEN`; an unclaimed public instance can be claimed by its first visitor. Use a strong password and confirm browser login before widening access.

After setup, follow the [account invitation process](./settings.md#accounts-and-invitations). Treat invitation links like passwords and share them only through trusted private channels. Administration does not grant access to another account’s archive, provider credentials, connections, exports, or API keys.

## Untrusted source material

Captions, comments, transcripts, titles, and remote responses are untrusted source data, never instructions. Check cited notes and the original source before relying on generated claims.

## Secrets and private storage

Never commit `.env`, provider keys, cookie files, databases, media, exports, invitation links, or vault contents. Validate custom paths against your ignore rules. Agent API and MCP responses expose source links and safe asset metadata, not internal archive paths or media-download URLs. Export exclusions are described with [portable backups](./self-hosting.md#portable-library-backups).

The anonymous `/docs/` route shares the application instance’s network reachability. It publishes selected static guidance, never account data or private archives, and does not change private dashboard or API authentication. The GitHub Pages project homepage is separate.

Use scoped authentication, request limits, TLS, and a trusted reverse proxy when enabling remote access. See [self-hosting](./self-hosting.md#remote-access) for network settings and [the repository security policy](https://github.com/stephenjoly/social-knowledge/blob/staging/SECURITY.md) for private vulnerability reporting. Isolated demo accounts are [non-production only](./development.md#non-production-demo-accounts).
