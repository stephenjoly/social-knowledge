/* Social Knowledge — "Unfold" landing mockup behaviour.
   Content lives in data.js; this file owns rendering, motion and the local search demo. */
(() => {
  "use strict";

  const DATA = window.SK_DATA;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = reduceMQ.matches;

  /* ------------------------------------------------------------------ *
   * Flat SVG thumbnails (all invented, no real media)
   * ------------------------------------------------------------------ */
  const MOTIFS = {
    recipe: () => `<rect width="80" height="100" fill="#E58A5A"/><rect y="70" width="80" height="30" fill="#D47548"/>
      <ellipse cx="40" cy="58" rx="28" ry="22" fill="#FFF4E4"/><ellipse cx="40" cy="56" rx="21" ry="15" fill="#C9472B"/>
      ${[[32,52],[38,49],[45,53],[34,59],[42,60],[49,58],[28,56],[46,47],[39,55]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3.2" fill="#F2C46B"/>`).join("")}
      <path d="M30 50l4 2M44 61l4-2M36 62l3 1" stroke="#5FA35A" stroke-width="2" stroke-linecap="round"/>
      <path d="M58 18L44 44M64 20L50 45" stroke="#3B2A20" stroke-width="2.4" stroke-linecap="round"/>`,
    recipe2: () => `<rect width="80" height="100" fill="#D2703E"/><circle cx="40" cy="52" r="27" fill="#2A2522"/><rect x="62" y="48" width="18" height="7" rx="3" fill="#2A2522"/>
      <circle cx="40" cy="52" r="21" fill="#3A322C"/>${[[32,48],[40,44],[47,50],[35,56],[44,58],[30,53],[50,56],[39,51]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3.4" fill="#F0B65C"/>`).join("")}`,
    recipe3: () => `<rect width="80" height="100" fill="#F2A76B"/><path d="M14 52h52a26 22 0 0 1-52 0z" fill="#FFF4E4"/><ellipse cx="40" cy="52" rx="26" ry="6" fill="#FBFAF6"/>
      ${[[30,50],[38,48],[46,50],[52,52]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3.4" fill="#C9472B"/>`).join("")}<path d="M24 24c4 6 8 6 12 0s8-6 12 0" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/>`,
    workout: () => `<rect width="80" height="100" fill="#9DBE98"/><rect y="74" width="80" height="26" fill="#86A982"/><rect x="8" y="78" width="64" height="8" rx="4" fill="#5E7F64"/>
      <path d="M31 46a9 11 0 0 1 18 0" stroke="#26322B" stroke-width="5" fill="none"/><circle cx="40" cy="60" r="15" fill="#26322B"/><rect x="34" y="56" width="12" height="4" rx="2" fill="#F2B33D"/>`,
    hinge: () => `<rect width="80" height="100" fill="#BACB8C"/><rect y="80" width="80" height="20" fill="#A4B676"/>
      <circle cx="22" cy="34" r="6" fill="#26322B"/><path d="M27 38L50 50M50 50L46 80M50 50L56 80M30 40l4 14" stroke="#26322B" stroke-width="4" stroke-linecap="round"/>
      <path d="M14 30L60 52" stroke="#F2B33D" stroke-width="3" stroke-linecap="round"/>`,
    travel: () => `<rect width="80" height="100" fill="#F3B98C"/><rect y="40" width="80" height="60" fill="#E79A7A"/><circle cx="56" cy="34" r="10" fill="#FFE2A8"/>
      <path d="M0 64L18 42L30 54L46 34L62 52L80 40V100H0z" fill="#5E6F9E"/><path d="M0 76L22 60L40 72L58 58L80 70V100H0z" fill="#37466F"/>
      <ellipse cx="40" cy="86" rx="22" ry="6" fill="#9FC1E3"/><path d="M32 78c-3-4 3-6 0-10M40 78c-3-4 3-6 0-10M48 78c-3-4 3-6 0-10" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".85"/>`,
    pasta: () => `<rect width="80" height="100" fill="#F5D466"/><circle cx="40" cy="54" r="27" fill="#FFFDF6"/>
      <path d="M24 50c6-8 10 8 16 0s10 8 16 0M24 57c6-8 10 8 16 0s10 8 16 0M27 64c6-8 10 8 14 0s8 8 12 0" stroke="#E7B23A" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M58 32a10 10 0 0 1 14 10h-14z" fill="#F7E04E" stroke="#E2C12A" stroke-width="1.5"/>`,
    shoulder: () => `<rect width="80" height="100" fill="#C8B6E6"/><rect y="78" width="80" height="22" fill="#B39FD8"/>
      <path d="M14 50Q40 32 66 50" stroke="#F2B33D" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="14" cy="50" r="6" fill="#4A3B6B"/><circle cx="66" cy="50" r="6" fill="#4A3B6B"/>
      <circle cx="40" cy="30" r="7" fill="#4A3B6B"/><path d="M40 38v26M26 46l14 4 14-4" stroke="#4A3B6B" stroke-width="4" stroke-linecap="round" fill="none"/>`,
    coast: () => `<rect width="80" height="100" fill="#A6D6E8"/><rect y="56" width="80" height="44" fill="#2F7FA8"/><circle cx="20" cy="22" r="7" fill="#FFF1C2"/>
      <path d="M44 100V48L54 36L80 30V100z" fill="#D8B887"/><rect x="56" y="24" width="14" height="12" fill="#FFFDF6"/><path d="M54 25l9-7 9 7" fill="#E07A52"/>
      <path d="M8 70h12M14 80h16M6 90h10" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`,
    plant: () => `<rect width="80" height="100" fill="#DDE7C9"/><path d="M27 70h26l-4 22H31z" fill="#C8693F"/>
      <path d="M40 70V40" stroke="#3F6B3A" stroke-width="2.5"/><ellipse cx="28" cy="42" rx="13" ry="8" transform="rotate(-30 28 42)" fill="#4F8A47"/><ellipse cx="52" cy="38" rx="14" ry="9" transform="rotate(25 52 38)" fill="#3F7A3A"/><ellipse cx="40" cy="26" rx="9" ry="12" fill="#5C9A52"/>`,
    coffee: () => `<rect width="80" height="100" fill="#E8D3B6"/><path d="M24 30h32l-4 58H28z" fill="#fff" opacity=".6"/><path d="M25.5 46h29l-3 42H28.5z" fill="#6B3E22"/>
      <rect x="31" y="50" width="8" height="8" rx="1.5" fill="#fff" opacity=".7"/><rect x="42" y="56" width="8" height="8" rx="1.5" fill="#fff" opacity=".6"/><path d="M48 18L44 60" stroke="#F2B33D" stroke-width="3" stroke-linecap="round"/>`
  };
  const thumb = (motif) => `<svg viewBox="0 0 80 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${(MOTIFS[motif] || MOTIFS.recipe)()}</svg>`;
  $$("[data-thumb]").forEach((el) => { el.innerHTML = thumb(el.dataset.thumb); });

  /* ------------------------------------------------------------------ *
   * Segmented tabs (shared by hero + examples)
   * ------------------------------------------------------------------ */
  function makeTabs(list, onSelect) {
    const tabs = $$('[role="tab"]', list);
    const pill = $(".seg__pill", list);
    const place = () => {
      const t = tabs.find((b) => b.getAttribute("aria-selected") === "true") || tabs[0];
      list.style.setProperty("--x", t.offsetLeft + "px");
      list.style.setProperty("--w", t.offsetWidth + "px");
    };
    const select = (key, { focus = false, user = false } = {}) => {
      tabs.forEach((b) => {
        const on = b.dataset.example === key;
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
      place();
      if (user) onSelect(key);
    };
    tabs.forEach((b, i) => {
      b.addEventListener("click", () => select(b.dataset.example, { user: true }));
      b.addEventListener("keydown", (e) => {
        let n = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % tabs.length;
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + tabs.length) % tabs.length;
        if (e.key === "Home") n = 0;
        if (e.key === "End") n = tabs.length - 1;
        if (n === null) return;
        e.preventDefault();
        select(tabs[n].dataset.example, { focus: true, user: true });
      });
    });
    list.classList.add("no-anim");
    place();
    requestAnimationFrame(() => requestAnimationFrame(() => list.classList.remove("no-anim")));
    return { select, place, pill };
  }

  /* ------------------------------------------------------------------ *
   * Hero: share → fly → unfold, cycling through examples
   * ------------------------------------------------------------------ */
  const stage = $("[data-hero-stage]");
  const phone = $("[data-phone]");
  const grid = $("[data-phone-grid]");
  const note = $("[data-note]");
  const media = $("[data-note-media]");
  const flyer = $("[data-flyer]");
  const skApp = $("[data-sk-app]");
  const pauseBtn = $("[data-hero-pause]");
  const heroTabsEl = $("[data-hero-tabs]");
  const ORDER = ["recipe", "workout", "travel"];
  const GRID_MOTIFS = ["coast", "workout", "pasta", "plant", "recipe", "shoulder", "coffee", "travel", "hinge", "pasta", "coast", "plant"];
  grid.innerHTML = GRID_MOTIFS.map((m) => `<div class="tile">${thumb(m)}</div>`).join("");
  const tiles = $$(".tile", grid);

  const hero = { idx: 0, token: 0, paused: false, inView: true, flight: null };
  const CANCEL = Symbol("cancel");

  function fillNote(ex) {
    note.querySelector('[data-f="avatar"]').style.setProperty("--hue", ex.hue);
    note.querySelector('[data-f="handle"]').textContent = ex.handle;
    note.querySelector('[data-f="platform"]').textContent = ex.platform;
    note.querySelector('[data-f="title"]').textContent = ex.title;
    note.querySelector('[data-f="quote"]').textContent = ex.quote;
    const steps = note.querySelector('[data-f="steps"]');
    steps.replaceChildren(...ex.steps.map((s, i) => { const li = document.createElement("li"); li.textContent = s; li.style.setProperty("--s", i); return li; }));
    const tags = note.querySelector('[data-f="tags"]');
    tags.replaceChildren(...ex.tags.map((t) => { const s = document.createElement("span"); s.textContent = "#" + t.replace(/\s+/g, ""); return s; }));
    stage.setAttribute("aria-label", `Animation: a saved ${ORDER[hero.idx]} video is shared from a phone to Social Knowledge and unfolds into a note: “${ex.title}” by the example creator ${ex.handle}, with transcript, steps and topics.`);
  }
  function setMedia(ex) {
    media.innerHTML = thumb(ex.thumb);
    media.classList.add("is-filled");
  }
  function clearMedia() {
    media.innerHTML = '<span class="note__media-empty">Waiting for a share…</span>';
    media.classList.remove("is-filled");
  }
  function resetPhone() {
    phone.classList.remove("is-sharing", "is-toast");
    skApp.classList.remove("is-tapped", "is-hint");
    tiles.forEach((t) => t.classList.remove("is-picked", "is-gone"));
    if (hero.flight) { hero.flight.cancel(); hero.flight = null; }
    flyer.style.visibility = "hidden";
  }

  function fly(from, to, ex) {
    const s = stage.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    flyer.innerHTML = thumb(ex.thumb);
    flyer.style.visibility = "visible";
    const box = (r) => ({ left: r.left - s.left + "px", top: r.top - s.top + "px", width: r.width + "px", height: r.height + "px" });
    const A = box(a), B = box(b);
    const stacked = b.top > a.bottom; // mobile: note sits under phone, so the tile drops
    const midLeft = (a.left + b.left) / 2 - s.left + (stacked ? 30 : 0);
    const midTop = Math.min(a.top, b.top) - s.top - (stacked ? -40 : 70);
    hero.flight = flyer.animate([
      { ...A, borderRadius: "5px", transform: "rotate(-2.5deg)" },
      { left: midLeft + "px", top: midTop + "px", width: (a.width + b.width) / 2 + "px", height: (a.height + b.height) / 2 + "px", borderRadius: "12px", transform: "rotate(4deg)", offset: 0.5 },
      { ...B, borderRadius: "15px", transform: "rotate(0deg)" }
    ], { duration: 820, easing: "cubic-bezier(.45,.05,.2,1)", fill: "forwards" });
    return hero.flight.finished.then(() => {
      setMedia(ex);
      flyer.style.visibility = "hidden";
      hero.flight.cancel();
      hero.flight = null;
    }, () => {});
  }

  function setCycle(v) { heroTabsEl.style.setProperty("--cycle", v.toFixed(3)); }

  async function play(key) {
    const my = ++hero.token;
    const live = () => { if (my !== hero.token) throw CANCEL; };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms)).then(live);
    // Holds only advance while visible, unpaused and the tab is shown.
    const hold = (ms) => new Promise((resolve, reject) => {
      let last = performance.now(), t = 0;
      const step = (now) => {
        if (my !== hero.token) return reject(CANCEL);
        const dt = now - last; last = now;
        if (!hero.paused && hero.inView && !document.hidden) t += Math.min(dt, 64);
        setCycle(t / ms);
        if (t >= ms) return resolve();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const ex = DATA.examples[key];
    hero.idx = ORDER.indexOf(key);
    heroControls.select(key);
    setCycle(0);
    try {
      if (reduced) {
        resetPhone();
        note.classList.remove("is-open");
        await wait(150);
        fillNote(ex); setMedia(ex);
        tiles[ex.tile].classList.add("is-picked");
        note.classList.add("is-open");
        return;
      }
      const wasOpen = note.classList.contains("is-open");
      note.classList.remove("is-open");
      resetPhone();
      if (wasOpen) await wait(380);
      clearMedia();
      fillNote(ex);
      const tile = tiles[ex.tile];
      tile.classList.add("is-picked");
      await wait(wasOpen ? 380 : 260);
      phone.classList.add("is-sharing");
      skApp.classList.add("is-hint");
      await wait(560);
      skApp.classList.add("is-tapped");
      await wait(340);
      phone.classList.remove("is-sharing");
      phone.classList.add("is-toast");
      const flight = fly(tile, media, ex);
      tile.classList.remove("is-picked");
      tile.classList.add("is-gone");
      await flight;
      live();
      note.classList.add("is-open");
      await wait(1000);
      phone.classList.remove("is-toast");
      skApp.classList.remove("is-tapped", "is-hint");
      await hold(4600);
      play(ORDER[(hero.idx + 1) % ORDER.length]);
    } catch (err) {
      if (err !== CANCEL) throw err;
    }
  }

  const heroControls = makeTabs(heroTabsEl, (key) => play(key));
  pauseBtn.addEventListener("click", () => {
    hero.paused = !hero.paused;
    pauseBtn.setAttribute("aria-pressed", String(hero.paused));
    $(".pause__label", pauseBtn).textContent = hero.paused ? "Play" : "Pause";
  });
  new IntersectionObserver(([e]) => { hero.inView = e.isIntersecting; }, { threshold: 0.15 }).observe(stage);

  function startHero() {
    pauseBtn.hidden = reduced;
    play(ORDER[hero.idx]);
  }

  /* ------------------------------------------------------------------ *
   * Problem wall
   * ------------------------------------------------------------------ */
  const wall = $("[data-wall]");
  const WALL_MOTIFS = ["pasta", "coast", "shoulder", "plant", "coffee", "recipe2", "travel", "hinge", "workout", "recipe3", "recipe"];
  const wallCount = 60;
  const keyTile = 34;
  wall.innerHTML = Array.from({ length: wallCount }, (_, i) => {
    const t = ((i * 37) % wallCount) / wallCount; // deterministic scatter
    return `<div class="tile${i === keyTile ? " is-key" : ""}" style="--t:${(0.04 + t * 0.4).toFixed(3)}">${thumb(WALL_MOTIFS[(i * 7) % WALL_MOTIFS.length])}</div>`;
  }).join("");
  const problemEl = $('[data-scene="problem"]');
  const problemSticky = $(".problem__sticky");
  function updateProblem(p) {
    const st = problemSticky.style;
    wall.style.setProperty("--p", p.toFixed(4));
    st.setProperty("--head", seg(p, 0.3, 0.44).toFixed(3));
    st.setProperty("--dim", seg(p, 0.42, 0.58).toFixed(3));
    st.setProperty("--w0", seg(p, 0.52, 0.62).toFixed(3));
    st.setProperty("--w1", seg(p, 0.6, 0.7).toFixed(3));
    st.setProperty("--w2", seg(p, 0.68, 0.78).toFixed(3));
    wall.style.setProperty("--key", seg(p, 0.82, 0.94).toFixed(3));
  }

  /* ------------------------------------------------------------------ *
   * How it works: three accumulating steps
   * ------------------------------------------------------------------ */
  const howEl = $('[data-scene="how"]');
  const steps = $$(".step", howEl);
  const railItems = $$(".rail li", howEl);
  const typedEl = $("[data-typed]", howEl);
  const TYPED = "that chickpea thing";
  const ART = [
    (el, a) => {
      el.style.setProperty("--sheet", (seg(a, 0, 0.28) * (1 - seg(a, 0.5, 0.64))).toFixed(3));
      el.style.setProperty("--tap", (seg(a, 0.3, 0.4) * (1 - seg(a, 0.5, 0.6))).toFixed(3));
      el.style.setProperty("--rcpt", seg(a, 0.58, 0.8).toFixed(3));
    },
    (el, a) => {
      el.style.setProperty("--rail", seg(a, 0, 0.9).toFixed(3));
      railItems.forEach((li, i) => li.classList.toggle("is-done", a >= ((i + 0.02) / 4) * 0.9));
      el.style.setProperty("--x", seg(a, 0.12, 0.38).toFixed(3));
      el.style.setProperty("--f", seg(a, 0.34, 0.58).toFixed(3));
      el.style.setProperty("--c", seg(a, 0.54, 0.76).toFixed(3));
      el.style.setProperty("--lang", seg(a, 0.8, 0.94).toFixed(3));
    },
    (el, a) => {
      const n = Math.round(seg(a, 0.02, 0.3) * TYPED.length);
      if (typedEl.textContent.length !== n) typedEl.textContent = TYPED.slice(0, n);
      el.style.setProperty("--hit", seg(a, 0.3, 0.44).toFixed(3));
      el.style.setProperty("--q", seg(a, 0.5, 0.6).toFixed(3));
      el.style.setProperty("--ans", seg(a, 0.62, 0.84).toFixed(3));
      el.style.setProperty("--cite", seg(a, 0.84, 0.94).toFixed(3));
    }
  ];
  function setStep(k, local, on) {
    const el = steps[k];
    el.style.setProperty("--on", on.toFixed(3));
    el.style.setProperty("--sp", local.toFixed(3));
    el.classList.toggle("is-done", local >= 0.97);
    ART[k](el, local);
  }
  function updateHowPinned(p) {
    const pp = clamp(p / 0.92);
    steps.forEach((el, k) => {
      const local = clamp(pp * 3 - k);
      setStep(k, local, k === 0 ? 1 : clamp((pp * 3 - k) * 8 + 1));
      el.classList.toggle("is-current", local > 0 && local < 1 || (k === 0 && local === 0));
    });
  }

  /* ------------------------------------------------------------------ *
   * Receipts thread + export bundle
   * ------------------------------------------------------------------ */
  const threadEl = $(".thread");
  const bundleEl = $(".bundle");

  /* ------------------------------------------------------------------ *
   * Scroll engine: one rAF reader; every scene derives state from progress,
   * so fast, interrupted and reversed scrolling always land on a coherent frame.
   * ------------------------------------------------------------------ */
  const nav = $("[data-nav]");
  const stackMQ = matchMedia("(max-width: 960px), (max-height: 700px)");
  let ticking = false;
  const enterProgress = (r, vh) => clamp((vh - r.top) / r.height);            // section enters → leaves
  const pinProgress = (r, vh) => clamp(-r.top / Math.max(1, r.height - vh));  // sticky span only
  const viewProgress = (r, vh, k = 0.7) => clamp((vh * 0.9 - r.top) / (Math.min(r.height, vh) * k));

  function frame() {
    ticking = false;
    const vh = innerHeight;
    nav.classList.toggle("is-scrolled", scrollY > 8);
    if (reduced) return;
    // read
    const rProblem = problemEl.getBoundingClientRect();
    const stacked = howEl.classList.contains("is-stacked");
    const rHow = stacked ? null : howEl.getBoundingClientRect();
    const rSteps = stacked ? steps.map((s) => s.getBoundingClientRect()) : null;
    const rThread = threadEl.getBoundingClientRect();
    const rBundle = bundleEl.getBoundingClientRect();
    // write
    updateProblem(enterProgress(rProblem, vh));
    if (stacked) rSteps.forEach((r, k) => setStep(k, viewProgress(r, vh, 0.75), 1));
    else updateHowPinned(pinProgress(rHow, vh));
    threadEl.style.setProperty("--d", viewProgress(rThread, vh, 0.85).toFixed(3));
    bundleEl.style.setProperty("--e", clamp((vh * 0.95 - rBundle.top) / (vh * 0.6)).toFixed(3));
  }
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };

  function applyMode() {
    howEl.classList.toggle("is-stacked", reduced || stackMQ.matches);
    if (reduced) {
      updateProblem(1);
      steps.forEach((_, k) => setStep(k, 1, 1));
      threadEl.style.setProperty("--d", "1");
      bundleEl.style.setProperty("--e", "1");
    }
    request();
  }
  addEventListener("scroll", request, { passive: true });
  addEventListener("resize", () => { heroControls.place(); exControls.place(); sizeExNote(); request(); });
  stackMQ.addEventListener("change", applyMode);

  /* ------------------------------------------------------------------ *
   * Local search demo (nothing leaves the page)
   * ------------------------------------------------------------------ */
  const input = $("[data-search]");
  const results = $("[data-results]");
  const status = $("[data-status]");
  const clearBtn = $("[data-clear]");
  const chipBtns = $$("[data-chips] .chip-btn");
  const STOP = new Set("the and that this thing things with for what did save saved my was about from some those one".split(" "));
  const words = (s) => s.toLowerCase().replace(/[’']/g, "").match(/[a-z0-9]+/g) || [];
  const hits = (word, group) => group.some((t) => word.startsWith(t) || (t.length > 4 && t.startsWith(word) && word.length >= t.length - 1));

  function queryGroups(q) {
    const raw = q.toLowerCase().trim();
    const toks = words(raw).filter((t) => t.length >= 3 && !STOP.has(t));
    return toks.map((t) => {
      const g = [t];
      Object.entries(DATA.synonyms).forEach(([k, v]) => { if (k === t || k.split(/\W/).includes(t)) g.push(...v); });
      return g;
    });
  }
  function score(cap, groups) {
    const fields = { title: 3, tags: 2, summary: 1.5, transcript: 1.5, handle: 1 };
    let total = 0, covered = 0;
    groups.forEach((g) => {
      let best = 0;
      Object.entries(fields).forEach(([f, w]) => {
        const text = Array.isArray(cap[f]) ? cap[f].join(" ") : cap[f];
        if (words(text).some((wd) => hits(wd, g))) best = Math.max(best, w);
      });
      if (best) { covered++; total += best; }
    });
    return { covered, total };
  }
  function highlighted(text, groups) {
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(/[A-Za-z0-9’']+/g)) {
      const w = m[0].toLowerCase().replace(/[’']/g, "");
      if (groups.some((g) => hits(w, g))) {
        frag.append(text.slice(last, m.index));
        const mk = document.createElement("mark"); mk.textContent = m[0]; frag.append(mk);
        last = m.index + m[0].length;
      }
    }
    frag.append(text.slice(last));
    return frag;
  }
  function evidenceField(cap, groups) {
    if (!groups.length) return ["Summary", cap.summary];
    const n = (t) => words(t).filter((w) => groups.some((g) => hits(w, g))).length;
    return n(cap.transcript) >= n(cap.summary) && n(cap.transcript) > 0 ? ["Transcript", cap.transcript] : ["Summary", cap.summary];
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function renderResults() {
    const q = input.value;
    const groups = queryGroups(q);
    clearBtn.hidden = !q;
    chipBtns.forEach((c) => c.setAttribute("aria-pressed", String(c.textContent.trim() === q.trim())));
    let list = DATA.captures.map((c, i) => ({ c, i, ...score(c, groups) }));
    if (groups.length) {
      list = list.filter((r) => r.covered > 0).sort((a, b) => b.covered - a.covered || b.total - a.total || a.i - b.i);
    }
    results.replaceChildren();
    if (!q.trim()) status.textContent = `Sample library · ${DATA.captures.length} saves`;
    else if (!groups.length) status.textContent = "Keep typing…";
    else status.textContent = list.length ? `${list.length} ${list.length === 1 ? "save matches" : "saves match"} “${q.trim()}”` : "";

    if (q.trim() && groups.length && !list.length) {
      const li = el("li", "empty");
      li.append(el("span", "empty__fold"), el("strong", null, "Nothing saved about that yet."), el("span", null, "Try “pasta”, “coffee” or one of the suggestions."));
      results.append(li);
      return;
    }
    list.forEach(({ c }, n) => {
      const li = el("li", "result");
      const th = el("span", "result__thumb"); th.innerHTML = thumb(c.thumb);
      const body = el("div");
      const title = el("p", "result__title"); title.append(highlighted(c.title, groups));
      const meta = el("p", "result__meta");
      const av = el("span", "source__avatar"); av.style.setProperty("--hue", c.hue);
      meta.append(av, el("span", null, `${c.handle} · ${c.platform}`), el("span", "result__ex", "Example"));
      const [kind, text] = evidenceField(c, groups);
      const ev = el("p", "result__evidence"); ev.append(el("b", null, kind)); ev.append(highlighted(text, groups));
      body.append(title, meta, ev);
      li.append(th, body);
      results.append(li);
      if (!reduced) li.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 360, delay: n * 45, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
    });
    results.scrollTop = 0;
  }
  input.addEventListener("input", renderResults);
  clearBtn.addEventListener("click", () => { input.value = ""; renderResults(); input.focus(); });
  chipBtns.forEach((c) => c.addEventListener("click", () => { input.value = c.textContent.trim(); renderResults(); }));

  /* CTA: scroll to the demo and focus the search box */
  const searchbox = $(".searchbox");
  $$("[data-try]").forEach((btn) => btn.addEventListener("click", () => {
    btn.classList.add("is-pressed");
    setTimeout(() => btn.classList.remove("is-pressed"), 120);
    const navH = nav.offsetHeight;
    const y = searchbox.getBoundingClientRect().top + scrollY - navH - 24;
    const focus = () => { if (document.activeElement !== input) input.focus({ preventScroll: true }); };
    // Focus immediately so typing works at once; the scroll only moves the view.
    focus();
    if (reduced) { scrollTo(0, y); return; }
    // Bound the smooth scroll: jump most of a long distance, glide the final screen.
    const gap = y - scrollY, vh = innerHeight;
    if (Math.abs(gap) > vh * 1.2) scrollTo(0, y - Math.sign(gap) * vh * 0.9);
    scrollTo({ top: y, behavior: "smooth" });
    addEventListener("scrollend", focus, { once: true });
    setTimeout(focus, 700);
  }));

  /* ------------------------------------------------------------------ *
   * Examples: fanned videos + unfolding note
   * ------------------------------------------------------------------ */
  const exNote = $("[data-ex-note]");
  const fanCards = $$("[data-fan-card]");
  fanCards.forEach((c) => { c.innerHTML = thumb(DATA.examples[c.dataset.fanCard].thumb); });
  function exContent(key) {
    const ex = DATA.examples[key], d = ex.detail;
    const frag = document.createDocumentFragment();
    const L = (node, i) => { node.classList.add("layer"); node.style.setProperty("--i", i); frag.append(node); return node; };
    const top = L(el("div", "exn__top"), 0);
    top.append(el("span", "exn__kicker", d.kicker), el("span", "result__ex", "Example"));
    L(el("h3", "exn__title", ex.title), 0);
    const src = L(el("p", "exn__source"), 1);
    const av = el("span", "source__avatar"); av.style.setProperty("--hue", ex.hue);
    src.append(av, el("span", null, `${ex.handle} · ${ex.platform}`), el("span", "source__link", "Original ↗"));
    const blocks = L(el("div", "exn__blocks"), 2);
    d.blocks.forEach((b) => {
      const wrap = el("div", "exn__block");
      const ul = el(b.ordered ? "ol" : "ul");
      b.items.forEach((t) => ul.append(el("li", null, t)));
      wrap.append(el("h4", null, b.label), ul);
      blocks.append(wrap);
    });
    const evd = L(el("p", "exn__evidence"), 3);
    evd.append(el("b", null, "From the video"), el("span", null, d.evidence));
    L(el("p", "exn__foot", d.note), 4);
    return frag;
  }
  let exTimer = 0;
  function renderEx(key, instant = false) {
    const order = [key, ...ORDER.filter((k) => k !== key)];
    fanCards.forEach((c) => { c.dataset.pos = String(order.indexOf(c.dataset.fanCard)); });
    exNote.setAttribute("aria-labelledby", "ex-tab-" + key);
    clearTimeout(exTimer);
    const swap = () => {
      exNote.replaceChildren(exContent(key));
      void exNote.offsetWidth;
      exNote.classList.add("is-open");
    };
    if (instant) { exNote.replaceChildren(exContent(key)); return; }
    exNote.classList.remove("is-open");
    exTimer = setTimeout(swap, reduced ? 150 : 260);
  }
  // Fixed height = tallest example at the current width, so switching never shifts the page.
  function sizeExNote() {
    const probe = exNote.cloneNode(false);
    probe.removeAttribute("id");
    Object.assign(probe.style, { position: "absolute", visibility: "hidden", left: "-9999px", width: exNote.offsetWidth + "px", minHeight: "0" });
    probe.classList.add("is-open");
    document.body.append(probe);
    let max = 0;
    ORDER.forEach((k) => { probe.replaceChildren(exContent(k)); max = Math.max(max, probe.offsetHeight); });
    probe.remove();
    exNote.style.minHeight = max + "px";
  }
  const exControls = makeTabs($("[data-ex-tabs]"), (key) => renderEx(key));
  fanCards.forEach((c) => c.addEventListener("click", () => { exControls.select(c.dataset.fanCard, { user: true }); }));

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  renderEx("recipe", true);
  // First unfold happens when the example section scrolls into view.
  const exIO = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { exNote.classList.add("is-open"); exIO.disconnect(); }
  }, { threshold: 0.35 });
  exIO.observe(exNote);
  renderResults();
  applyMode();
  sizeExNote();
  startHero();
  document.fonts && document.fonts.ready.then(() => { heroControls.place(); exControls.place(); sizeExNote(); });
  reduceMQ.addEventListener("change", (e) => { reduced = e.matches; applyMode(); startHero(); });
})();
