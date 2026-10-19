import { cp, readFile, writeFile } from "node:fs/promises";

// site/ contains only the reviewed, whitelisted public files. Namespace these
// independently of Vite's application assets; no design notes enter the image.
await cp("site", "dist-ui/landing", { recursive: true });
let html = await readFile("dist-ui/landing/index.html", "utf8");
html = html.replaceAll('href="landing.css"', 'href="/landing/landing.css"')
  .replaceAll('src="data.js"', 'src="/landing/data.js"')
  .replaceAll('src="landing.js"', 'src="/landing/landing.js"')
  .replace('</head>', '<script defer src="/landing/session.js"></script>\n</head>');
// Reuse existing link treatment. The design source and standalone public site
// remain host-independent; only the integrated app offers instance sign-in.
html = html.replace('<a href="#receipts">Privacy</a>', '<a href="#receipts">Privacy</a>\n        <a href="/login" data-session-link>Sign in</a>');
html = html.replace(/(<button[^>]+data-try>.*?<\/button>)/, '$1\n          <a class="link-arrow" href="/login" data-session-link>Sign in</a>');
await writeFile("dist-ui/landing/index.html", html);
await cp("web/landing-session.js", "dist-ui/landing/session.js");
