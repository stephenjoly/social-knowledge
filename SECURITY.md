# Security

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Report it privately through GitHub's **Security → Report a vulnerability** flow after the repository is published.

Include the affected version or commit, reproduction steps, impact, and any suggested mitigation. Avoid including real access tokens, social-media cookies, personal archive content, or other sensitive data.

## Deployment model

Social Knowledge is designed as a private, self-hosted application. Keep the application on loopback or a private network, terminate TLS at a trusted reverse proxy, and configure `TRUSTED_PROXIES` with only the proxy addresses or CIDRs that directly connect to the app.

The first successful registration claims the administrator account without requiring the deployment's `API_TOKEN`. Therefore, an unclaimed instance exposed to the internet can be taken over by its first visitor. Keep a fresh deployment on loopback or a private network until its intended administrator has completed registration, then confirm browser login before widening access.

After the archive is claimed, only administrators can create accounts through 24-hour, single-use invitation links. Treat each invitation link as a password: share it only through a trusted private channel, never include it in tickets, logs, source control, or chat transcripts, and revoke it if it might have been disclosed. Administrator invitations grant account-management authority; use member invitations by default.

Store `API_TOKEN`, the OpenAI key, social-media cookie files, runtime databases, media, exports, invitation links, and knowledge-vault content outside Git. `API_TOKEN` remains for legacy Shortcut capture and an encryption-compatibility fallback; it is no longer a setup or browser-login credential. The checked-in `.gitignore` excludes the standard local paths, but operators are responsible for validating custom deployment paths.

Public GitHub Pages documentation is separate from the running application and does not require making the application publicly reachable.
