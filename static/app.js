// Nima's screens. This file only draws: what to show and which numbers come out is decided in Python (story.py).

const params = new URLSearchParams(location.search);
const TABS = ["journey", "road", "ask", "advisor"];
const S = {
  person: params.get("person"),                         // "timothy" or "melanie"; empty on the home screen
  tab: Math.max(0, TABS.indexOf(params.get("tab"))),    // which tab is open
  step: "worry",                                        // worry -> screen -> rank -> meeting
  screen: 0,                                            // which of the three fact screens
  screens: [],                                          // the three fact screens
  rank: [],                                             // the order being tapped
  other: false,                                         // typing a worry of their own
  time: 0,                                              // position of the time slider on the road
  chat: [],                                             // questions and answers on the Ask tab
  start: null, me: null,
};
const $ = (id) => document.getElementById(id);

// ---------- Helpers ----------

async function api(path, body) {
  const options = body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ person: S.person, ...body }) }
    : {};
  const reply = await fetch(path, options);
  return reply.json();
}

// Makes text safe to put inside HTML (people can type anything).
function esc(text) {
  return String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
const say = (text, me) => `<div class="say${me ? " me" : ""}">${text}</div>`;
const verified = (source) => (source ? `<div class="src ok">${esc(source)}</div>` : "");

// Draws a view. `still` = redraw the same view without the entrance animation (e.g. each tap while ranking).
function draw(html, still) {
  const keep = $("v").scrollTop;
  $("v").innerHTML = html;
  $("v").classList.toggle("still", !!still);
  $("v").scrollTop = still ? keep : 0;
}

// ---------- Start ----------

async function start() {
  S.start = await api("/api/start");
  if (S.person) {
    S.me = await api(`/api/me?person=${S.person}`);
    $("who").textContent = `${S.me.name} · switch`;
    if (S.me.order.length) S.step = "meeting";          // they already ranked: go to the meeting
  }
  render();
}

function render() {
  $("nav").innerHTML = ["Journey", "Road", "Ask", "Advisor"]
    .map((name, i) => `<button data-tab="${i}"${S.tab === i ? ' aria-current="true"' : ""}>${name}</button>`)
    .join("");
  document.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { S.tab = +b.dataset.tab; render(); }));
  if (!S.person && S.tab !== 3) return home();
  [journey, road, ask, advisor][S.tab]();
}

function home() {
  draw(`<h1>${esc(S.start.intro.title)}</h1>
    ${say(esc(S.start.intro.nima))}
    <p class="m">Who are you?</p>
    <div class="row">${Object.entries(S.start.people)
      .map(([id, p]) => `<button class="opt" onclick="location.href='?person=${id}'">${esc(p.name)}</button>`).join("")}</div>
    <p class="m">Each of you opens this on your own phone.</p>
    <button class="link" id="reset">Reset the demo</button>`);
  $("reset").onclick = async () => { await api("/api/reset", {}); location.href = "/"; };
}

// ---------- Tab 1: the journey ----------

function journey() {
  ({ worry, screen, rank, meeting })[S.step]();
}

function worry() {
  const q = S.start.question;
  const options = q.options.filter((o) => !o.free_text)
    .map((o) => `<button class="opt" data-worry="${o.id}">${esc(o.text)}</button>`).join("");
  draw(`${say(esc(S.me.intro))}
    <h2>${esc(q.title)}</h2>
    <p class="m">${esc(q.sub)}</p>
    ${options}
    ${S.other
      ? `<textarea id="own" rows="3" placeholder="In your own words"></textarea>
         <button class="go" id="send">Continue</button>`
      : `<button class="opt" id="other">Something else…</button>`}`);
  document.querySelectorAll("[data-worry]").forEach((b) => (b.onclick = () => chooseWorry(b.dataset.worry, "")));
  if ($("other")) $("other").onclick = () => { S.other = true; worry(); $("own").focus(); };
  if ($("send")) $("send").onclick = () => $("own").value.trim() && chooseWorry("other", $("own").value.trim());
}

async function chooseWorry(id, text) {
  draw(`<div class="loader"></div>${say("Reading your plan with that in mind…")}`);
  const reply = await api("/api/worry", { worry: id, text });
  S.screens = reply.screens;
  S.screen = 0;
  S.step = "screen";
  journey();
}

function screen() {
  const s = S.screens[S.screen];
  const dots = S.screens.map((_, i) => `<i class="${i <= S.screen ? "on" : ""}"></i>`).join("");
  const last = S.screen === S.screens.length - 1;
  draw(`<div class="dots">${dots}</div>
    ${S.screen === 0 ? `<p class="m">${esc(S.start.personal_intro)}</p>` : ""}
    <p class="kicker">${esc(s.kicker)}</p>
    <h2>${esc(s.text)}</h2>
    <div class="big">${esc(s.number)}<small>${esc(s.label)}</small></div>
    <div id="numbers"></div>
    <button class="ghost" id="show">Show the numbers</button>
    <div class="row"><button class="ghost" id="back">Back</button><button class="go" id="next">${last ? "Now, what goes first?" : "Next"}</button></div>`);
  api("/api/event", { kind: "seen", screen: s.id });
  $("show").onclick = () => {
    $("numbers").innerHTML = `<div class="col">${esc(s.detail)}${verified(s.source)}</div>`;
    $("show").remove();
    api("/api/event", { kind: "detail", screen: s.id });
  };
  $("back").onclick = () => { if (S.screen) { S.screen--; screen(); } else { S.step = "worry"; S.other = false; worry(); } };
  $("next").onclick = () => { if (last) { S.step = "rank"; S.rank = []; rank(); } else { S.screen++; screen(); } };
}

function rank() {
  const fronts = S.start.fronts.map((f) => {
    const i = S.rank.indexOf(f.id);
    return `<button class="opt${i > -1 ? " on" : ""}" data-front="${f.id}">
      ${i > -1 ? `<span class="n">${i + 1}</span>` : ""}${esc(f.title)}<small>${esc(f.fact)}</small></button>`;
  }).join("");
  draw(`<h2>What goes first?</h2>
    <p class="m">Tap them in order, first to last. Tap again to undo. Your partner does the same on their own.</p>
    ${fronts}
    <button class="go" id="meet" ${S.rank.length === S.start.fronts.length ? "" : "disabled"}>Meet your partner</button>`, S.rank.length > 0);
  document.querySelectorAll("[data-front]").forEach((b) => (b.onclick = () => {
    const i = S.rank.indexOf(b.dataset.front);
    i > -1 ? S.rank.splice(i, 1) : S.rank.push(b.dataset.front);
    rank();
  }));
  $("meet").onclick = async () => {
    await api("/api/rank", { order: S.rank });
    S.step = "meeting";
    meeting();
  };
}

async function meeting() {
  const m = await api(`/api/meeting?person=${S.person}`);
  if (m.waiting) {
    draw(`<h2>The meeting</h2>
      ${say(`Your order is saved. Now ${esc(m.partner_name)} needs to rank theirs, without seeing yours.`)}
      <button class="go" id="copy">Copy the link for ${esc(m.partner_name)}</button>
      <button class="ghost" id="again">${esc(m.partner_name)} is done: check again</button>
      <button class="link" id="redo">Change my order</button>`);
    $("copy").onclick = () => {
      navigator.clipboard?.writeText(`${location.origin}/?person=${m.partner}`);
      $("copy").textContent = "Link copied";
    };
    $("again").onclick = meeting;
    $("redo").onclick = () => { S.step = "rank"; S.rank = []; rank(); };
    return;
  }

  const column = (name, list) => `<div class="col"><b>${esc(name)}</b><ol>${list
    .map((item, i) => `<li class="${m.same[i] ? "same" : ""}" style="animation-delay:${0.2 + i * 0.35}s">${esc(item)}</li>`)
    .join("")}</ol></div>`;
  const ladder = m.ladder.map((r) => `<div class="score"><span>${esc(r.label)}</span><b>${r.score}</b></div>`).join("");
  const step = m.step;
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);

  draw(`<h2>The meeting</h2>
    <div class="row meet">${column(`${m.name} (you)`, m.mine)}${column(m.partner_name, m.theirs)}</div>
    ${say(esc(m.insight))}
    <div class="col"><b>What your plan says moves your score</b>${ladder}${verified("score.top_moves, score.combined_moves")}</div>
    <div class="col"><p class="kicker">Your first step</p>
      <h2 style="font-size:21px;margin-top:4px">${esc(step.do)}</h2>
      <div class="part"><b>Your part</b>${esc(step.my_task)}</div>
      <div class="part"><b>${esc(step.partner_name)}'s part</b>${esc(step.partner_task)}</div>
      <div class="part"><b>What it costs</b>${esc(step.cost)}</div>
      <div class="part"><b>Ask your advisor</b>${esc(step.ask)}</div>
    </div>
    <div class="col"><b>After that</b><ol>${m.next
      .map((n) => `<li>${esc(n.do)}<br><span class="m">Your part: ${esc(n.my_task)}</span></li>`).join("")}</ol>
      <p class="m">Slide through them on the Road tab.</p></div>
    <p class="m">Which day will you do your part?</p>
    <input type="date" id="day" value="${step.reminder || soon}">
    <a class="go" id="cal">Add my part to my calendar</a>
    ${say("That's all for today. On the day you picked, open the Road tab: I'll ask how it went.")}
    <button class="ghost" id="toroad">See your road</button>`);
  const link = () => { $("cal").href = `/api/reminder.ics?person=${S.person}&date=${$("day").value}`; };
  $("day").onchange = link; link();
  $("toroad").onclick = () => { S.tab = 1; render(); };
}

// ---------- Tab 2: the road and the days after ----------

async function road() {
  const r = await api(`/api/road?person=${S.person}`);
  const stops = r.milestones.map((s) => `<div class="stop${s.key ? " key" : ""}"><b>${esc(s.date)}</b><br><span class="m">${esc(s.text)}</span></div>`).join("");
  S.time = Math.min(S.time, r.points.length - 1);
  const point = r.points[S.time];
  draw(`<h2>Your road</h2>
    <div class="map">${stops}</div>${verified(r.source)}
    <h2 style="font-size:20px;margin-top:6px">Time travel</h2>
    <p class="m">Slide to see what I'd tell you on each day.</p>
    ${r.points.length > 1 ? `<input type="range" min="0" max="${r.points.length - 1}" value="${S.time}" id="time" aria-label="Time">` : ""}
    <div class="ticks">${r.points.map((p, i) => `<span${i === S.time ? ' class="now"' : ""}>${esc(p.label)}</span>`).join("")}</div>
    <div id="moment"></div>`);
  if ($("time")) $("time").oninput = () => { S.time = +$("time").value; road(); };
  if (point.kind === "checkin") checkin();
  else if (point.kind === "step") {
    $("moment").innerHTML = say(`<b>${esc(point.label)}</b><br>${esc(point.intro)}`) +
      `<div class="col"><h2 style="font-size:20px">${esc(point.do)}</h2>
        <div class="part"><b>Your part</b>${esc(point.my_task)}</div>
        <div class="part"><b>${esc(point.partner_name)}'s part</b>${esc(point.partner_task)}</div>
        <div class="part"><b>What it costs</b>${esc(point.cost)}</div>
        <div class="part"><b>Ask your advisor</b>${esc(point.ask)}</div></div>`;
  } else $("moment").innerHTML = say(`<b>${esc(point.label)}</b><br>${esc(point.text)}`);
}

async function checkin(reply) {
  const c = reply || await api(`/api/checkin?person=${S.person}`);
  if (!c.ready) { $("moment").innerHTML = say(`<b>Day 3</b><br>${esc(c.text)}`); return; }
  let html = say(`<b>Day 3</b><br>Did you do your part? <i>${esc(c.task)}</i>`) + `<p class="m">${esc(c.partner_line)}</p>`;
  if (c.message) html += say(esc(c.message));
  if (c.answered === null || c.answered === undefined) {
    html += `<div class="row"><button class="opt" data-done="1">Yes, done</button><button class="opt" data-done="0">Not yet</button></div>`;
  } else if (c.answered === false && !c.blocked) {
    html += `<p class="m">What stopped you?</p>` + c.blockers.map((b) => `<button class="opt" data-blocker="${b.id}">${esc(b.text)}</button>`).join("");
  }
  $("moment").innerHTML = html;
  document.querySelectorAll("[data-done]").forEach((b) => (b.onclick = async () => checkin(await api("/api/checkin", { done: b.dataset.done === "1" }))));
  document.querySelectorAll("[data-blocker]").forEach((b) => (b.onclick = async () => checkin(await api("/api/checkin", { blocker: b.dataset.blocker }))));
}

// ---------- Tab 3: Ask Nima ----------

function ask() {
  const suggested = S.start.ask.map((a) => `<button class="opt" data-q="${esc(a.q)}">${esc(a.q)}</button>`).join("");
  const chat = S.chat.map((c) => say(esc(c.q), true) + (c.a
    ? say(esc(c.a) + (c.checked ? verified(c.source) : c.for_advisor ? `<div class="src">Sent to your advisor</div>` : ""))
    : say(`<div class="loader"></div>`))).join("");
  draw(`<h2>Ask Nima</h2>
    <p class="m">Every number in an answer is checked against your plan before you see it.</p>
    ${chat}
    ${suggested}
    <textarea id="q" rows="2" placeholder="Or ask anything about your plan"></textarea>
    <button class="go" id="send">Ask</button>`);
  const send = async (question) => {
    if (!question) return;
    const entry = { q: question };
    S.chat.push(entry);
    ask();
    const reply = await api("/api/ask", { question });
    Object.assign(entry, reply, { a: reply.answer });
    if (S.tab === 2) ask();
  };
  document.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => send(b.dataset.q)));
  $("send").onclick = () => send($("q").value.trim());
}

// ---------- Tab 4: advisor summary ----------

async function advisor() {
  const s = await api("/api/advisor");
  const [a, b] = s.people;
  const row = (label, f) => `<tr><td>${label}</td><td>${f(a)}</td><td>${f(b)}</td></tr>`;
  const status = (p) => (p.done === true ? "Done" : p.done === false ? `Not yet${p.blocker ? `: ${esc(p.blocker)}` : ""}` : "No answer yet");
  const questions = s.people.flatMap((p) => p.questions.map((q) => `<li><b>${esc(p.name)}:</b> ${esc(q.question)}${q.for_advisor ? " <span class='m'>(not in the plan)</span>" : ""}</li>`));
  draw(`<h2>Advisor summary</h2>
    <p class="m">${esc(s.family)}, before your meeting. What each of them told us.</p>
    <div id="note"></div>
    <table>
      <tr><th></th><th>${esc(a.name)}</th><th>${esc(b.name)}</th></tr>
      ${row("Worry", (p) => esc(p.worry))}
      ${row("Goes first", (p) => esc(p.first))}
      ${row("Opened the numbers", (p) => `${p.details} ${p.details === 1 ? "time" : "times"}`)}
      ${row("First step", status)}
    </table>
    <div class="col"><b>Where they differ</b>${s.ready
      ? (s.differ.length ? s.differ.map((d) => `<p>${esc(d)}</p>`).join("") : "<p>They agree on every position.</p>")
      : "<p class='m'>Waiting for both to rank.</p>"}</div>
    ${s.first ? `<div class="col"><b>First step they agreed on</b><p>${esc(s.first.do)}</p>
      <p class="m">${s.reminder ? `Planned for ${esc(s.reminder)}.` : "No date yet."} Their question: ${esc(s.first.ask)}</p></div>` : ""}
    <div class="col"><b>Open questions</b>${questions.length ? `<ul>${questions.join("")}</ul>` : "<p class='m'>None yet.</p>"}</div>
    <button class="link" id="reset">Reset the demo</button>`);
  $("reset").onclick = async () => { await api("/api/reset", {}); location.href = "/"; };

  // Nima's note is written by the AI: it arrives a few seconds later, and the table works without it.
  if (!s.ready) return;
  $("note").innerHTML = say(`<div class="loader"></div>Reading what both of them chose…`);
  const n = await api("/api/advisor_note");
  if (!$("note")) return;                                  // they left the tab meanwhile
  $("note").innerHTML = n.note
    ? say(`<b>Nima's note</b><br>${esc(n.note)}<div class="src ok">every number checked</div>`)
    : "";
}

start();
