export const testPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Social Knowledge</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #101417; color: #edf3f6; }
    main { width: min(760px, calc(100% - 32px)); margin: 48px auto; }
    h1 { margin-bottom: 8px; }
    p { color: #aebbc2; line-height: 1.5; }
    form, section { background: #182025; border: 1px solid #2a373e; border-radius: 14px; padding: 20px; margin-top: 20px; }
    label { display: block; font-size: 14px; margin: 14px 0 6px; color: #cbd6db; }
    input, textarea, button { box-sizing: border-box; width: 100%; font: inherit; border-radius: 9px; }
    input, textarea { padding: 11px 12px; border: 1px solid #3a4a52; background: #0f1518; color: inherit; }
    textarea { min-height: 76px; resize: vertical; }
    button { margin-top: 16px; border: 0; padding: 12px; background: #59c3a5; color: #08130f; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .55; cursor: wait; }
    .toolbar { display: flex; gap: 10px; align-items: center; }
    .toolbar h2 { flex: 1; }
    .toolbar button { width: auto; margin: 0; padding: 8px 12px; }
    article { border-top: 1px solid #2a373e; padding: 14px 0; }
    article:first-of-type { border-top: 0; }
    code { color: #8bd7c1; }
    .error { color: #ff9e9e; white-space: pre-wrap; }
    .status { text-transform: capitalize; font-weight: 700; }
  </style>
</head>
<body>
<main>
  <h1>Social Knowledge</h1>
  <p>Submit a Facebook or Instagram Reel and watch it become a sourced Obsidian note. Your API token is kept only in this browser tab.</p>
  <form id="capture-form">
    <label for="token">API token</label>
    <input id="token" type="password" autocomplete="off" required>
    <label for="url">Reel URL</label>
    <input id="url" type="url" inputmode="url" placeholder="https://www.instagram.com/reel/..." required>
    <label for="note">Optional capture note</label>
    <textarea id="note" placeholder="Why did this catch your attention?"></textarea>
    <button id="submit" type="submit">Capture Reel</button>
    <p id="message" role="status"></p>
  </form>
  <section>
    <div class="toolbar"><h2>Recent jobs</h2><button id="refresh" type="button">Refresh</button></div>
    <div id="jobs"><p>Enter the API token and refresh.</p></div>
  </section>
</main>
<script>
  const token = document.querySelector('#token');
  const url = document.querySelector('#url');
  const note = document.querySelector('#note');
  const form = document.querySelector('#capture-form');
  const submit = document.querySelector('#submit');
  const message = document.querySelector('#message');
  const jobs = document.querySelector('#jobs');
  token.value = sessionStorage.getItem('social-knowledge-token') || '';

  async function request(path, options = {}) {
    const apiToken = token.value.trim();
    if (!apiToken) throw new Error('Enter the API token first.');
    sessionStorage.setItem('social-knowledge-token', apiToken);
    const response = await fetch(path, {
      ...options,
      headers: { 'Authorization': 'Bearer ' + apiToken, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || body.error || 'Request failed');
    return body;
  }

  async function refresh() {
    jobs.innerHTML = '<p>Loading…</p>';
    try {
      const body = await request('/api/v1/jobs?limit=20');
      jobs.replaceChildren(...body.jobs.map(job => {
        const article = document.createElement('article');
        const title = document.createElement('div');
        const status = document.createElement('span');
        status.className = 'status';
        status.textContent = job.status;
        title.append(status, document.createTextNode(' — ' + job.normalizedUrl));
        const detail = document.createElement('p');
        detail.textContent = job.resultNotePath || job.error || ('Attempt ' + job.attempts);
        article.append(title, detail);
        return article;
      }));
      if (!body.jobs.length) jobs.innerHTML = '<p>No jobs yet.</p>';
    } catch (error) {
      jobs.innerHTML = '';
      const paragraph = document.createElement('p');
      paragraph.className = 'error';
      paragraph.textContent = error.message;
      jobs.append(paragraph);
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    message.className = '';
    message.textContent = 'Submitting…';
    try {
      const body = await request('/api/v1/jobs', {
        method: 'POST',
        body: JSON.stringify({ url: url.value, note: note.value || undefined })
      });
      message.textContent = body.created ? 'Captured. Processing has started.' : 'This Reel was already captured.';
      url.value = '';
      note.value = '';
      await refresh();
    } catch (error) {
      message.className = 'error';
      message.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  document.querySelector('#refresh').addEventListener('click', refresh);
  setInterval(() => { if (token.value) void refresh(); }, 5000);
</script>
</body>
</html>`;
