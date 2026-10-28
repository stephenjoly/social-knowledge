/*
 * Shared data, app shell and note-viewer content for both mock-ups.
 * Every note, creator, handle, comment and clip is invented. The demo clips
 * are silent; transcript lines are synced to their on-screen slides.
 */
(() => {
const S = (d, x = '') => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" ${x}>${d}</svg>`;
const I = {
  mark: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h2.2v11H3zM6.8 2.5H9v11H6.8zM10.3 3.2l2.1-.6 2.6 10.5-2.1.6z" fill="#fff"/></svg>',
  panelL: S('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'),
  panelR: S('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  compass: S('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
  inbox: S('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>'),
  pulse: S('<path d="M22 12h-4l-3 8-6-16-3 8H2"/>'),
  lib: S('<path d="M4 4v16M8 4v16M12 4l4 16M18 4v16"/>'),
  pen: S('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  search: S('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  sparkles: S('<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  gear: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  chev: S('<path d="m6 9 6 6 6-6"/>', 'style="width:14px;height:14px"'),
  left: S('<path d="m15 18-6-6 6-6"/>'),
  right: S('<path d="m9 18 6-6-6-6"/>'),
  back: S('<path d="M19 12H5M12 19l-7-7 7-7"/>', 'style="width:15px;height:15px"'),
  up: S('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  x: S('<path d="M18 6 6 18M6 6l12 12"/>'),
  copy: S('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  retry: S('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  ext: S('<path d="M7 17 17 7M8 7h9v9"/>', 'style="width:13px;height:13px"'),
  folder: S('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  warn: S('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>'),
  menu: S('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  share: S('<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/>'),
  text: S('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  play: '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  expand: S('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
};

const M = 'assets/media/';
const NOTES = {
  skip: {
    title: '10 skip-level questions to ask your boss’s boss',
    creator: { name: 'Leadwell Daily', handle: '@leadwell.daily', ini: 'L', color: '#2f4a3c' },
    platform: 'Instagram reel', length: '0:16', saved: 'Saved today at 08:12', filed: 'Career / Leadership',
    url: 'instagram.com/reel/SYNTHETIC-skip-01',
    media: { kind: 'video', src: M + 'skip.mp4', poster: M + 'skip-poster.jpg', w: 540, h: 960 },
    caption: 'Save this for your next skip-level. Questions 5–10 are below, part 2 tomorrow. #leadership #newmanager #careergrowth',
    syn: 'Use skip-levels to show strategic curiosity: risks, untapped opportunities, success metrics.',
    bottom: 'Leadwell Daily lists ten questions to ask your manager’s manager in a skip-level meeting. The advice is to show strategic curiosity rather than to impress: ask two or three, listen, and follow up a month later. Four questions appear on screen in part 1; the other six are in the caption. Treat it as a prompt list from one creator, not research on what gets people promoted.',
    takeaways: [
      ['What risk keeps you up at night right now?', 'signals that you think about the business, not only your team.'],
      ['Where do you think we are under-investing?', 'points you at work that leadership already wants done.'],
      ['What does success look like in three years?', 'lets you anchor your team’s plans to their horizon.'],
      ['Which initiative are you most excited about?', 'gives you a reason to follow up a month later.'],
      ['What would you want my team to stop doing?', 'listed in the caption; the creator calls it the boldest one.'],
      ['Where do teams like mine usually get stuck?', 'surfaces patterns your manager may not mention.'],
      ['Who should I learn from outside my reporting line?', 'widens your network with an introduction.'],
      ['What do you wish managers told you earlier?', 'shows how they want bad news delivered.'],
      ['How do you decide what gets escalated to you?', 'clarifies when to bring something up a level.'],
      ['What is one thing I could take off your plate?', 'ends the meeting with an offer instead of an ask.'],
    ],
    actions: ['Pick two or three questions before your next skip-level.', 'Write the answers down and follow up within a month.', 'Check with your manager that a skip-level is expected.', 'Save part 2 when it is posted.'],
    claims: ['Asking skip-level questions improves your chances of promotion.', 'Most senior leaders welcome skip-level requests.', 'Part 2 will cover the remaining questions.'],
    evidence: [[0, '“10 skip-level questions to ask your boss’s boss. Part 1 of 2.”'], [2.6, '“What risk keeps you up at night right now?”'], [7.8, '“What does success look like in three years?”'], [13, '“Ask two or three. Not all ten.”']],
    transcript: [[0, 'If you’ve got a skip-level coming up, here are ten questions to ask your boss’s boss.'], [2.6, 'One. What risk keeps you up at night right now? It shows you’re thinking about the business, not just your team.'], [5.2, 'Two. Where do you think we’re under-investing? That’s usually where the interesting work is.'], [7.8, 'Three. What does success look like in three years?'], [10.4, 'Four. Which initiative are you most excited about? Then follow up a month later.'], [13, 'Don’t ask all ten. Pick two or three. Part two tomorrow.']],
    topics: ['Skip-level meetings', 'Managing up', 'Career growth', 'Promotion strategy', 'Executive communication'],
    language: 'English',
    mentions: [['Skip-level meeting', 'Concept'], ['Leadwell Daily', 'Organization'], ['Instagram', 'Organization'], ['One-to-one', 'Concept'], ['Director', 'Role'], ['VP of Engineering', 'Role'], ['Three-year plan', 'Concept'], ['Roadmap', 'Concept'], ['OKRs', 'Concept'], ['Quarterly business review', 'Event'], ['Hiring plan', 'Concept'], ['Retention', 'Concept'], ['Staff engineer', 'Role'], ['Part 2', 'Other']],
    comments: [['@ana.builds', 'Number 5 is bold, but it worked for me.'], ['@devon.k', 'Asked #1 last week and got a thirty-minute answer.'], ['@mira.leads', 'Following up a month later is the real tip here.']],
    time: '2h',
  },
  oneone: {
    title: 'Three questions to ask your manager in a one-to-one',
    creator: { name: 'Manager Moves', handle: '@managermoves', ini: 'M', color: '#4a3a2e' },
    platform: 'Facebook reel', length: '0:13', saved: 'Saved yesterday at 21:40', filed: 'Career / Leadership',
    url: 'facebook.com/reel/SYNTHETIC-1to1-02',
    media: { kind: 'video', src: M + 'oneone.mp4', poster: M + 'oneone-poster.jpg', w: 540, h: 960 },
    caption: 'Steal these for your next 1:1. Which one would you ask first?',
    syn: 'Bring two or three focused questions, in your own words. “Is there anything I do that makes your job harder?”',
    bottom: 'Manager Moves suggests bringing two or three focused questions to a one-to-one with your manager, phrased in your own words. If you only ask one, ask whether anything you do makes their job harder. The other two agree where you can decide alone and what great looks like in six months.',
    takeaways: [['“Is there anything I do that makes your job harder?”', 'is the one question to keep if time is short.'], ['“Where can I decide without checking with you?”', 'agrees your decision space early.'], ['“What does great look like in six months?”', 'gives you a target you can write down.']],
    actions: ['Add one of the three questions to your next one-to-one agenda.', 'Write down your manager’s six-month answer.'],
    claims: ['Asking about friction builds trust faster than status updates.'],
    evidence: [[2.6, '“Is there anything I do that makes your job harder?”'], [10.4, '“Bring two or three. In your own words.”']],
    transcript: [[0, 'Ask your manager this in your next one-to-one.'], [2.6, 'Is there anything I do that makes your job harder? If you only ask one question, ask this one.'], [5.2, 'Where can I decide without checking with you?'], [7.8, 'What does great look like in six months? Write the answer down.'], [10.4, 'Bring two or three, in your own words.']],
    topics: ['One-to-ones', 'Managing up', 'New managers'], language: 'English',
    mentions: [['Manager Moves', 'Organization'], ['Facebook', 'Organization'], ['One-to-one', 'Concept']],
    comments: [['@sam.r', 'The first one is uncomfortable but so useful.']],
    time: 'Yesterday',
  },
  own: {
    title: 'Give leadership updates with the OWN structure',
    creator: { name: 'Clear Updates', handle: '@clearupdates', ini: 'C', color: '#2e3850' },
    platform: 'Facebook reel', length: '0:13', saved: 'Saved 19 Oct at 12:05', filed: 'Career / Communication',
    url: 'facebook.com/reel/SYNTHETIC-own-03',
    media: { kind: 'video', src: M + 'own.mp4', poster: M + 'own-poster.jpg', w: 540, h: 960 },
    caption: 'OWN your next update. Outcome, Why, Next.',
    syn: 'Outcome, Why, what’s Next. Name blockers, offer options A and B, and share bad news early.',
    bottom: 'Clear Updates proposes a three-part structure for updates to senior leaders: lead with the Outcome, give one sentence on Why it matters, then say what’s Next with an owner and date. When blocked, bring two options and say which you lean toward.',
    takeaways: [['Outcome first', '— the result or the decision you need.'], ['Why it matters', '— one sentence of context, no history.'], ['What’s next', '— owner, date, and the risk you are watching.'], ['When blocked', ', bring option A and option B and say which you prefer.']],
    actions: ['Rewrite your next status update in OWN order.'],
    claims: ['Leaders prefer options over open questions.'],
    evidence: [[2.6, '“O — Outcome. Lead with the result or the decision you need.”'], [10.4, '“Blocked? Bring option A and option B.”']],
    transcript: [[0, 'Updating leadership? Use OWN.'], [2.6, 'O is outcome. Lead with the result, or the decision you need.'], [5.2, 'W is why it matters. One sentence, no history lesson.'], [7.8, 'N is what’s next: owner, date, and the risk you’re watching.'], [10.4, 'Blocked? Bring option A and option B, and say which one you lean toward.']],
    topics: ['Status updates', 'Executive communication', 'Writing'], language: 'English',
    mentions: [['Clear Updates', 'Organization'], ['OWN framework', 'Concept'], ['Facebook', 'Organization']],
    comments: [],
    time: '19 Oct',
  },
  lisbon: {
    title: 'Four Lisbon viewpoints worth timing for sunset',
    creator: { name: 'Tram 28 Notes', handle: '@tram28.notes', ini: 'T', color: '#6c5a6e' },
    platform: 'Instagram carousel', length: '4 photos', saved: 'Saved 17 Oct at 19:22', filed: 'Travel / Portugal',
    url: 'instagram.com/p/SYNTHETIC-lisbon-04',
    media: { kind: 'images', items: [1, 2, 3, 4].map(n => M + `lisbon-${n}.jpg`), w: 540, h: 675 },
    caption: 'Four miradouros, one evening. Start high, finish with a drink at São Pedro.',
    bottom: 'A four-photo carousel naming Lisbon viewpoints in the order the creator walks them at sunset: Senhora do Monte, Santa Luzia, Portas do Sol and São Pedro de Alcântara. Timing tips come from the caption and slide text; there is no spoken audio.',
    takeaways: [['Senhora do Monte', 'is the highest; arrive about 40 minutes before sunset.'], ['Santa Luzia', 'has tiles and a river view and is busiest at midday.'], ['Portas do Sol', 'is a five-minute walk from Santa Luzia.'], ['São Pedro de Alcântara', 'has a kiosk and benches and works after dark.']],
    actions: ['Add the four viewpoints to your Lisbon list in walking order.'],
    claims: ['Senhora do Monte is the highest viewpoint in the city.'],
    evidence: [[null, 'Slide 1: “Highest viewpoint. Go 40 minutes before sunset.”'], [null, 'Caption: “Start high, finish with a drink at São Pedro.”']],
    transcript: [[null, 'Slide 1 · Miradouro da Senhora do Monte. Highest viewpoint. Go 40 minutes before sunset.'], [null, 'Slide 2 · Miradouro de Santa Luzia. Tiles, bougainvillea, river view. Busy at noon.'], [null, 'Slide 3 · Portas do Sol. Five minutes on foot from Santa Luzia.'], [null, 'Slide 4 · São Pedro de Alcântara. Kiosk, benches, castle view. Good after dark.']],
    textLabel: 'Slide text',
    topics: ['Lisbon', 'Viewpoints', 'Sunset'], language: 'English',
    mentions: [['Lisbon', 'Place'], ['Miradouro da Senhora do Monte', 'Place'], ['Miradouro de Santa Luzia', 'Place'], ['Portas do Sol', 'Place'], ['São Pedro de Alcântara', 'Place']],
    comments: [['@lia.travels', 'Did this route in May, Santa Luzia was packed at 7pm.']],
    time: '17 Oct',
  },
  sourdough: {
    title: 'Reviving a sluggish sourdough starter in a week',
    creator: { name: 'Crumb Lab', handle: '@crumb.lab', ini: 'C', color: '#5a4630' },
    platform: 'YouTube video', length: '0:11', saved: 'Saved 15 Oct at 09:30', filed: 'Food / Baking',
    url: 'youtube.com/watch?v=SYNTHETIC-sd-05',
    media: { kind: 'video', src: M + 'sourdough.mp4', poster: M + 'sourdough-poster.jpg', w: 960, h: 540 },
    caption: 'Starter not rising? Three changes, one week.',
    bottom: 'Crumb Lab gives three changes for a starter that has stopped rising: feed at 1:5:5 by weight, keep it near 26 °C, and use it at its peak four to six hours after feeding.',
    takeaways: [['Feed 1:5:5', 'starter to flour to water, by weight.'], ['Keep it warm', '— around 26 °C, such as an oven with the light on.'], ['Use it at peak', '— domed and bubbly, four to six hours after feeding.']],
    actions: ['Switch to a 1:5:5 feed for a week.'],
    claims: ['A warmer spot alone revives most starters.'],
    evidence: [[2.6, '“Feed at one to five to five.”'], [7.8, '“Use it at peak, four to six hours after feeding.”']],
    transcript: [[0, 'Your starter isn’t rising? Here are three changes for one week.'], [2.6, 'One: feed it one to five to five — starter, flour, water, by weight.'], [5.2, 'Two: keep it near twenty-six degrees. The top of the fridge works.'], [7.8, 'Three: use it at peak, four to six hours after feeding.']],
    topics: ['Sourdough', 'Baking'], language: 'English',
    mentions: [['Crumb Lab', 'Organization'], ['YouTube', 'Organization'], ['Sourdough starter', 'Food']],
    comments: [],
    time: '15 Oct',
  },
  update: {
    title: 'A weekly team update people actually read',
    creator: { name: 'Notes from Ops', handle: '@notes.from.ops', ini: 'N', color: '#3f6b52' },
    platform: 'LinkedIn post', length: 'Text post', saved: 'Saved 12 Oct at 17:48', filed: 'Career / Communication',
    url: 'linkedin.com/posts/SYNTHETIC-update-06',
    media: null,
    caption: 'Five lines, sent Friday before lunch. Here is the template we use.',
    bottom: 'A text post with a five-line template for weekly team updates: one win, one number, one risk, one ask, and next week’s focus. The author sends it on Friday before lunch so it is read the same day.',
    takeaways: [['One win', 'named with the person who did it.'], ['One number', 'that moved, with last week’s value.'], ['One risk', 'and what you are doing about it.'], ['One ask', 'with a name and a date.'], ['Next week', 'in one sentence.']],
    actions: ['Try the five-line format for your next weekly update.'],
    claims: [],
    evidence: [[null, '“Five lines, sent Friday before lunch.”']],
    transcript: [[null, 'Our weekly update is five lines. One win, with the person who did it. One number that moved. One risk and what we are doing about it. One ask, with a name and a date. Next week in one sentence. We send it Friday before lunch so it gets read the same day.']],
    textLabel: 'Post text',
    topics: ['Status updates', 'Team communication'], language: 'English',
    mentions: [['Notes from Ops', 'Organization'], ['LinkedIn', 'Organization']],
    comments: [['@j.okafor', 'Stealing the “one ask with a date” line.']],
    time: '12 Oct',
  },
};
const ASK_ORDER = ['skip', 'oneone', 'own'];
const INBOX_ORDER = ['skip', 'oneone', 'lisbon', 'own', 'sourdough', 'update'];
const BY_MEDIA = { portrait: 'skip', landscape: 'sourdough', images: 'lisbon', none: 'update' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const kindOf = n => !n.media ? 'none' : n.media.kind === 'images' ? 'images' : n.media.w > n.media.h ? 'landscape' : 'portrait';
const thumbOf = n => !n.media ? '' : n.media.kind === 'images' ? n.media.items[0] : n.media.poster;

/* ── App shell ─────────────────────────────────────────────────────── */
const CHATS = { Today: ['Leadership advice for a new manager', 'Lower back stretches under 10 minutes'], Yesterday: ['What have I saved about Lisbon?', 'Sourdough starter troubleshooting'], 'Previous 7 days': ['Negotiating a raise — scripts I saved', 'Rainy day activities for kids', 'Houseplants that survive low light'] };
function sidebar(ctx) {
  const chats = Object.entries(CHATS).map(([w, list]) => `<div class="when">${w}</div>` + list.map((t, k) =>
    `<button class="chat${ctx === 'ask' && w === 'Today' && !k ? ' cur' : ''}" ${w === 'Today' && !k ? 'data-ctx="ask"' : ''}><span class="t">${t}</span></button>`).join('')).join('');
  return `<div class="brand"><span class="mark">${I.mark}</span>social knowledge<span class="grow"></span>
      <button class="iconbtn" aria-label="Collapse sidebar">${I.panelL}</button><button class="capture" aria-label="Save a link">${I.plus}</button></div>
    <div class="goto">${I.compass}<span>Go to…</span><kbd>⌘K</kbd></div>
    <div class="glabel">Library</div>
    <button class="nav${ctx === 'inbox' ? ' cur' : ''}" data-ctx="inbox">${I.inbox}<span class="t">Inbox</span><span class="count">6</span></button>
    <button class="nav">${I.pulse}<span class="t">Activity</span></button>
    <button class="nav">${I.lib}<span class="t">Knowledge base</span></button>
    <div class="glabel">Assistant</div>
    <button class="nav">${I.pen}<span class="t">New chat</span></button>
    <div class="chatsearch">${I.search}<span>Search chats</span><kbd>/</kbd></div>
    <div class="list">${chats}</div>
    <div class="profile"><span class="avatar">S</span><span class="who">stephen</span><button class="iconbtn" aria-label="Settings">${I.gear}</button></div>`;
}
const cite = n => `<button class="cite" data-cite="${n}" aria-label="Source ${n}">${n}</button>`;
function sourceCard(id, n) {
  const s = NOTES[id];
  return `<div class="scard" data-card="${n}" data-id="${id}">
    <div class="thumb" style="background-image:url('${thumbOf(s)}')"><span class="num">${n}</span></div>
    <div class="txt"><b>${s.title}</b><small>${s.creator.handle} · ${s.platform}</small><div class="syn">${s.syn}</div>
    <button class="opennote" data-open="${id}" data-from="ask">Open note ${I.right}</button></div></div>`;
}
function askView() {
  const earlier = `<div class="u">What do I have saved about running better one-to-ones?</div>
    <div class="a"><span class="ibox">${I.sparkles}</span><div class="body">
      <div class="meta">GPT-6 Luna · Medium · 1 saved post · 13:58</div>
      <p>One save covers this directly. <b>Three questions to ask your manager</b> suggests bringing two or three focused questions in your own words. The one to keep if time is short: “Is there anything I do that makes your job harder?” ${cite(2)}</p>
      <p>It also suggests agreeing early where you can decide without checking in, and asking what great looks like in six months, then writing that answer down.</p>
    </div></div>`;
  return `<div class="top"><button class="iconbtn menu" aria-label="Open sidebar">${I.menu}</button><span class="title">Leadership advice for a new manager</span><span class="grow"></span>
      <button class="ghost" aria-label="Share or export">${I.share}</button>
      <button class="toggle on" data-sources>${I.panelR} Sources <span class="n">3</span></button></div>
    <div class="scroll" id="thread"><div class="col">${earlier}
      <div class="u">I’ve been saving stuff on how to be a good leader. I’m a new manager and want to get promoted — can you surface all of it?</div>
      <div class="a"><span class="ibox">${I.sparkles}</span><div class="body">
        <div class="meta">GPT-6 Luna · Medium · 3 saved posts · 14:02</div>
        <p>Three of your saves cover this. Here’s what they say, grouped by goal.</p>
        <h4>Promotion strategy and visibility</h4>
        <ul><li><b>10 skip-level questions to ask your boss’s boss</b> — use skip-levels to show strategic curiosity rather than to impress. Ask a few questions and follow up: current risks, untapped opportunities, what success looks like in three years. ${cite(1)}</li></ul>
        <h4>New-manager one-to-ones</h4>
        <ul><li><b>Three questions to ask your manager</b> — bring two or three focused questions in your own words. If you ask only one: “Is there anything I do that makes your job harder?” ${cite(2)}</li></ul>
        <h4>Leadership communication</h4>
        <ul><li><b>Give leadership updates with the OWN structure</b> — Outcome, Why, what’s Next. When blocked, name the blocker, offer options A and B, and say which you lean toward. ${cite(3)}</li></ul>
        <div class="inline-sources">${ASK_ORDER.map((id, k) => sourceCard(id, k + 1)).join('')}</div>
        <div class="acts"><button class="srcbtn" data-sources>3 sources</button>
          <button class="ghost" aria-label="Copy answer">${I.copy}</button><button class="ghost" aria-label="Retry">${I.retry}</button></div>
      </div></div></div></div>
    <div class="dock"><div class="composer" id="composer"><div id="about"></div>
      <textarea id="ask-input" aria-label="Ask a follow-up" placeholder="Ask a follow-up…"></textarea>
      <div class="row"><span class="pickbtn">GPT-6 Luna · Medium ${I.chev}</span><span class="grow"></span><button class="send" aria-label="Send">${I.up}</button></div></div></div>`;
}
function sourcesPanel() {
  return `<div class="hd"><b>Sources</b><small>3 saved posts</small><button class="iconbtn" data-sources aria-label="Hide sources">${I.x}</button></div>
    <div class="seglbl">Cited in latest answer</div>
    <div class="cards">${ASK_ORDER.map((id, k) => sourceCard(id, k + 1)).join('')}</div>`;
}
function inboxView() {
  const rows = INBOX_ORDER.map(id => {
    const n = NOTES[id];
    const t = thumbOf(n);
    return `<li class="irow" data-row="${id}"><button data-open="${id}" data-from="inbox">
      <span class="ithumb" style="${t ? `background-image:url('${t}')` : ''}">${t ? '' : I.text}</span>
      <span class="itext"><span class="ititle">${n.title}</span><span class="imeta">${n.creator.handle} · ${n.platform} · ${n.filed}</span></span>
      <span class="itime">${n.time}</span></button></li>`;
  }).join('');
  return `<div class="top"><button class="iconbtn menu" aria-label="Open sidebar">${I.menu}</button><span class="title">Inbox</span><span class="grow"></span></div>
    <div class="scroll" id="thread"><div class="inbox"><h1>Inbox</h1><p class="sub">6 new captures to review and file.</p><ul class="ilist">${rows}</ul></div></div>`;
}
function renderApp(ctx) {
  const app = document.getElementById('app');
  app.querySelector('.side').innerHTML = sidebar(ctx);
  app.querySelector('.main').innerHTML = ctx === 'ask' ? askView() : inboxView();
  const src = app.querySelector('.sources');
  src.innerHTML = ctx === 'ask' ? sourcesPanel() : '';
  src.hidden = ctx !== 'ask';
}

/* ── Note viewer content ───────────────────────────────────────────── */
function mediaHtml(n) {
  const m = n.media;
  if (m.kind === 'images') {
    return `<div class="nv-frame images" data-car="0">
      <img src="${m.items[0]}" alt="Photo 1 of ${m.items.length} from ${esc(n.creator.handle)}" width="${m.w}" height="${m.h}" />
      <span class="nv-count">1 / ${m.items.length}</span>
      <button class="nv-car prev" data-car-step="-1" aria-label="Previous photo" disabled>${I.left}</button>
      <button class="nv-car next" data-car-step="1" aria-label="Next photo">${I.right}</button></div>`;
  }
  // Poster first, like today's .note-media button; the <video> mounts only when the reader presses Play.
  return `<div class="nv-frame"><button class="nv-poster" data-play aria-label="Play video, ${n.length}">
    <img src="${m.poster}" alt="" width="${m.w}" height="${m.h}" /><span class="nv-play">${I.play}</span><span class="nv-len">${n.length}</span></button></div>`;
}
function sourceBlock(n) {
  return `<div class="nv-who"><span class="avatar" style="background:${n.creator.color}">${n.creator.ini}</span>
      <div><b>${n.creator.name}</b><small>${n.creator.handle} · ${n.platform}</small></div></div>
    <p class="nv-cap" title="Original caption">${esc(n.caption)}</p>
    <a class="btn" href="#original" data-original>Open original ${I.ext}</a>`;
}
/**
 * Returns the viewer's parts so each variant can arrange them.
 * opts: { ctxLabel, index, total, fit (media fills column height), backLabel }
 */
function noteParts(id, opts) {
  const n = NOTES[id];
  const kind = kindOf(n);
  const textLabel = n.textLabel || 'Transcript';
  const pager = opts.total > 1 ? `<div class="nv-pager" role="group" aria-label="Browse ${opts.pagerNoun}">
      <button class="iconbtn" data-nv-step="-1" aria-label="Previous ${opts.pagerItem}" ${opts.index === 0 ? 'disabled' : ''}>${I.left}</button>
      <span>${opts.index + 1} of ${opts.total}</span>
      <button class="iconbtn" data-nv-step="1" aria-label="Next ${opts.pagerItem}" ${opts.index === opts.total - 1 ? 'disabled' : ''}>${I.right}</button></div>` : '';
  const bar = `${opts.backLabel ? `<button class="ghost nv-back" data-nv-close>${I.back} ${opts.backLabel}</button>` : ''}
    <span class="nv-ctx">${opts.ctxLabel}</span>${pager}${opts.extraBar || ''}
    <button class="iconbtn" data-nv-close aria-label="Close note (Esc)">${I.x}</button>`;
  const media = n.media ? `<div class="nv-stage${opts.fit && kind !== 'landscape' ? ' nv-fit' : ''}">${mediaHtml(n)}</div>
    <div class="nv-src">${sourceBlock(n)}</div>
    ${opts.foot ? `<div class="nv-foot">${opts.foot}</div>` : ''}` : '';
  const head = `<h2 id="nv-title">${n.title}</h2>
    <div class="nv-meta"><span>${n.creator.handle}</span><span class="dot">${n.platform}</span><span class="dot">${n.length}</span><span class="dot">${n.saved}</span>
      <span class="dot"><button class="nv-filed" data-filed aria-label="Filed in ${n.filed}. Move">${I.folder}${n.filed}</button></span></div>`;
  const tabs = `<button role="tab" id="tab-note" aria-controls="pane-note" aria-selected="true">Note</button>
    <button role="tab" id="tab-text" aria-controls="pane-text" aria-selected="false" tabindex="-1">${textLabel}</button>
    <button role="tab" id="tab-details" aria-controls="pane-details" aria-selected="false" tabindex="-1">Details <small>${n.topics.length + n.mentions.length}</small></button>
    <span class="grow"></span>
    <button class="btn ask" data-nv-ask>${I.sparkles} Ask about this</button>`;
  const seekable = n.media && n.media.kind === 'video';
  const ts = t => t == null ? '' : seekable ? `<button class="ts" data-seek="${t}" aria-label="Play from ${fmt(t)}">${fmt(t)}</button>` : `<span class="ts">${fmt(t)}</span>`;
  const claims = n.claims.length ? `<details class="nv-claims"><summary>${I.warn}<span class="grow">${n.claims.length} claim${n.claims.length > 1 ? 's' : ''} to verify</span><span class="chev">${I.chev}</span></summary>
      <ul>${n.claims.map(c => `<li>${c}</li>`).join('')}</ul></details>` : '';
  const textOnly = n.media ? '' : `<div class="nv-textonly">${sourceBlock(n)}</div>`;
  const shown = 6;
  const mention = ([name, type]) => `<span>${name}<small>${type}</small></span>`;
  const body = `
    <div class="nv-pane" role="tabpanel" id="pane-note" aria-labelledby="tab-note" tabindex="0">${textOnly}
      <section class="nv-sec"><h3>Bottom line</h3><p class="nv-prose">${n.bottom}</p>${claims}</section>
      <section class="nv-sec"><h3>Key takeaways</h3><ul class="nv-takeaways">${n.takeaways.map(([b, r]) => `<li><b>${b}</b> ${r}</li>`).join('')}</ul></section>
      <section class="nv-sec"><h3>Actions &amp; recommendations</h3><ul class="nv-actions">${n.actions.map((a, k) => `<li><input type="checkbox" id="act-${k}" /><span><label for="act-${k}">${a}</label></span></li>`).join('')}</ul></section>
      <section class="nv-sec"><h3>Evidence</h3><ul class="nv-evidence">${n.evidence.map(([t, q]) => `<li>${ts(t)}<span>${q}</span></li>`).join('')}</ul></section>
    </div>
    <div class="nv-pane" role="tabpanel" id="pane-text" aria-labelledby="tab-text" tabindex="0" hidden>
      <ul class="nv-transcript">${n.transcript.map(([t, s]) => `<li data-t="${t ?? ''}">${seekable
        ? `<button data-seek="${t}" aria-label="Play from ${fmt(t)}: ${esc(s)}"><span class="ts">${fmt(t)}</span><span>${s}</span></button>`
        : `<div>${t == null ? '' : `<span class="ts">${fmt(t)}</span>`}<span>${s}</span></div>`}</li>`).join('')}</ul>
      <p class="nv-note">${seekable ? 'Select a line to play from that point.' : n.media ? 'Text read from the photos and caption.' : 'Full text of the original post.'}</p>
    </div>
    <div class="nv-pane" role="tabpanel" id="pane-details" aria-labelledby="tab-details" tabindex="0" hidden>
      <dl class="nv-dl">
        <div><dt>Filed in</dt><dd>${n.filed}<button class="linkbtn" data-filed>Move</button></dd></div>
        <div><dt>Topics</dt><dd>${n.topics.map(t => `<span class="chip">${t}</span>`).join('')}</dd></div>
        <div><dt>Source</dt><dd><span class="url">${n.url}</span><button class="linkbtn" data-original>Open</button></dd></div>
        <div><dt>Caption</dt><dd style="color:var(--ink-soft)">${esc(n.caption)}</dd></div>
        <div><dt>Creator</dt><dd>${n.creator.name} · ${n.creator.handle}</dd></div>
        <div><dt>Saved</dt><dd>${n.saved.replace('Saved ', '')}</dd></div>
        <div><dt>Language</dt><dd>${n.language}</dd></div>
        <div><dt>Also mentioned</dt><dd><div class="nv-mentions" id="nv-mentions">${n.mentions.slice(0, shown).map(mention).join('')}</div>
          ${n.mentions.length > shown ? `<button class="linkbtn" data-more-mentions aria-expanded="false" aria-controls="nv-mentions">Show all ${n.mentions.length}</button>` : ''}</dd></div>
        <div><dt>Comments</dt><dd>${n.comments.length ? `<ul class="nv-comments">${n.comments.map(([h, c]) => `<li><b>${h}</b>${c}</li>`).join('')}</ul>` : '<span style="color:var(--muted)">No comments were available.</span>'}</dd></div>
      </dl>
    </div>`;
  return { note: n, kind, bar, media, head, tabs, body };
}

/* Behaviour shared by both variants. api: { onStep(dir), onClose(), onAsk(id) } */
function wireNote(root, id, api) {
  const n = NOTES[id];
  let video = null;
  const lines = [...root.querySelectorAll('.nv-transcript li')];
  const ensureVideo = () => {
    if (video) return video;
    const frame = root.querySelector('.nv-frame');
    video = Object.assign(document.createElement('video'), { src: n.media.src, poster: n.media.poster, controls: true, playsInline: true, preload: 'auto' });
    video.setAttribute('aria-label', `Video from ${n.creator.handle}`);
    video.addEventListener('timeupdate', () => {
      const t = video.currentTime;
      let cur = -1;
      lines.forEach((l, k) => { if (Number(l.dataset.t) <= t) cur = k; });
      lines.forEach((l, k) => l.classList.toggle('now', k === cur));
    });
    frame.replaceChildren(video);
    return video;
  };
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const select = tab => {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      root.querySelector('#' + t.getAttribute('aria-controls')).hidden = !on;
    });
    api.onTab?.(tab);
  };
  root.onclick = e => {
    const t = e.target.closest('button, a, [data-seek]');
    if (!t || !root.contains(t)) return;
    if (t.matches('[role="tab"]')) return select(t);
    if (t.matches('[data-nv-close]')) return api.onClose();
    if (t.matches('[data-nv-step]')) return api.onStep(Number(t.dataset.nvStep));
    if (t.matches('[data-nv-ask]')) return api.onAsk(id);
    if (t.matches('[data-original]')) { e.preventDefault(); return toast(`Prototype: opens ${n.url} in a new tab`); }
    if (t.matches('[data-filed]')) return toast('Prototype: opens the existing File / Move picker');
    if (t.matches('[data-more-mentions]')) {
      const open = t.getAttribute('aria-expanded') !== 'true';
      root.querySelector('#nv-mentions').innerHTML = n.mentions.slice(0, open ? 99 : 6).map(([a, b]) => `<span>${a}<small>${b}</small></span>`).join('');
      t.setAttribute('aria-expanded', open);
      t.textContent = open ? 'Show fewer' : `Show all ${n.mentions.length}`;
      return;
    }
    if (t.matches('[data-play]')) { const v = ensureVideo(); v.focus(); v.play().catch(() => {}); return; }
    if (t.matches('[data-seek]') && n.media?.kind === 'video') { const v = ensureVideo(); v.currentTime = Number(t.dataset.seek) + 0.05; v.play().catch(() => {}); return; }
    if (t.matches('[data-car-step]')) {
      const frame = t.closest('[data-car]');
      const i = Math.max(0, Math.min(n.media.items.length - 1, Number(frame.dataset.car) + Number(t.dataset.carStep)));
      frame.dataset.car = i;
      const img = frame.querySelector('img');
      img.src = n.media.items[i];
      img.alt = `Photo ${i + 1} of ${n.media.items.length} from ${n.creator.handle}`;
      frame.querySelector('.nv-count').textContent = `${i + 1} / ${n.media.items.length}`;
      frame.querySelector('.prev').disabled = i === 0;
      frame.querySelector('.next').disabled = i === n.media.items.length - 1;
      const lines = root.querySelectorAll('.nv-transcript li');
      lines.forEach((l, k) => l.classList.toggle('now', k === i));
    }
  };
  root.onkeydown = e => {
    const tab = e.target.closest?.('[role="tab"]');
    if (tab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault(); e.stopPropagation();
      const k = (tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[k].focus(); select(tabs[k]);
    }
  };
  return { select, tabs, ensureVideo };
}
const pauseAll = root => root?.querySelectorAll('video').forEach(v => v.pause());

/* Focus helpers */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';
const focusables = el => [...el.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null && !x.closest('[hidden]'));
function trapTab(e, el) {
  if (e.key !== 'Tab') return;
  const items = focusables(el);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (!el.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

let toastTimer;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* Review bar + URL state: ?ctx=ask|inbox&open=<id>|portrait|landscape|images|none&tab=note|text|details&bar=0 */
const params = new URLSearchParams(location.search);
function reviewBar(variant) {
  if (params.get('bar') === '0') document.documentElement.classList.add('no-rv');
  const other = variant === 'modal' ? ['side-panel.html', 'Switch to A · Side panel'] : ['modal.html', 'Switch to B · Modal'];
  const rv = document.getElementById('rv');
  rv.innerHTML = `<strong>${variant === 'modal' ? 'B · Centered modal' : 'A · Side panel'}</strong>
    <span class="lbl">Open from</span><button data-rv-ctx="ask">Ask</button><button data-rv-ctx="inbox">Inbox</button>
    <span class="lbl">Media</span>${Object.entries({ portrait: 'Portrait video', landscape: 'Landscape video', images: 'Photos', none: 'Text only' }).map(([k, v]) => `<button data-rv-media="${k}">${v}</button>`).join('')}
    <span class="grow"></span><a href="${other[0]}${location.search}">${other[1]}</a><a href="index.html">Compare</a>`;
}
function syncBar(ctx) { document.querySelectorAll('[data-rv-ctx]').forEach(b => b.classList.toggle('on', b.dataset.rvCtx === ctx)); }

/* Page wiring shared by both variants. viewer: { open(id, opener, from), close(), isOpen() } */
const visibleOpener = id => [...document.querySelectorAll(`#app [data-open="${id}"]`)].find(el => el.offsetParent !== null) || null;
function boot(variant, viewer) {
  reviewBar(variant);
  let ctx = params.get('ctx') === 'inbox' ? 'inbox' : 'ask';
  const setCtx = c => {
    if (viewer.isOpen()) viewer.close({ restoreFocus: false });
    ctx = c; renderApp(c); syncBar(c);
    const u = new URL(location); u.searchParams.set('ctx', c); u.searchParams.delete('open'); history.replaceState(null, '', u);
  };
  setCtx(ctx);
  document.addEventListener('click', e => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.dataset.rvCtx) return setCtx(t.dataset.rvCtx);
    if (t.dataset.rvMedia) {
      const id = BY_MEDIA[t.dataset.rvMedia];
      if (!ASK_ORDER.includes(id) && ctx !== 'inbox') setCtx('inbox');
      return viewer.open(id, visibleOpener(id), ctx);
    }
    if (!t.closest('#app')) return;
    if (t.dataset.ctx) return setCtx(t.dataset.ctx);
    if (t.dataset.open) return viewer.open(t.dataset.open, t, t.dataset.from);
    if (t.matches('.menu')) return toast('Prototype: opens the existing sidebar drawer');
    if (t.hasAttribute('data-sources')) {
      const p = document.querySelector('#app .sources');
      if (viewer.isOpen() && viewer.ownsSources) return viewer.close();
      p.hidden = !p.hidden;
      document.querySelectorAll('#app .toggle[data-sources]').forEach(b => b.classList.toggle('on', !p.hidden));
      return;
    }
    if (t.dataset.cite) {
      const n = t.dataset.cite;
      const p = document.querySelector('#app .sources');
      if (p.hidden && !(viewer.isOpen() && viewer.ownsSources)) { p.hidden = false; document.querySelectorAll('#app .toggle[data-sources]').forEach(b => b.classList.add('on')); }
      document.querySelectorAll('#app .cite, #app .scard').forEach(el => el.classList.toggle('hl', el.dataset.cite === n || el.dataset.card === n));
      const card = [...document.querySelectorAll(`#app .scard[data-card="${n}"]`)].find(el => el.offsetParent !== null);
      card?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  });
  const open = params.get('open');
  if (open) {
    const id = NOTES[open] ? open : BY_MEDIA[open];
    if (id) requestAnimationFrame(() => viewer.open(id, visibleOpener(id), ctx, { tab: params.get('tab') }));
  }
  return { get ctx() { return ctx; } };
}

window.SK = { I, NOTES, ASK_ORDER, INBOX_ORDER, BY_MEDIA, kindOf, renderApp, noteParts, wireNote, pauseAll, focusables, trapTab, toast, params, reviewBar, syncBar, fmt, boot, visibleOpener };
})();
