# Security

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Report it privately through GitHub's **Security → Report a vulnerability** flow after the repository is published.

Include the affected version or commit, reproduction steps, impact, and any suggested mitigation. Avoid including real access tokens, social-media cookies, personal archive content, or other sensitive data.

## Deployment model

Social Knowledge is designed as a private, self-hosted application. Keep the application on loopback or a private network, terminate TLS at a trusted reverse proxy, and configure `TRUSTED_PROXIES` with only the proxy addresses or CIDRs that directly connect to the app.

The first administrator setup requires the deployment's `API_TOKEN`. Store that token, the OpenAI key, social-media cookie files, runtime databases, media, exports, and knowledge-vault content outside Git. The checked-in `.gitignore` excludes the standard local paths, but operators are responsible for validating custom deployment paths.

Public GitHub Pages documentation is separate from the running application and does not require making the application publicly reachable.
