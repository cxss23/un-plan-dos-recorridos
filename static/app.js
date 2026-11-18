// Nima's screens. This file only draws: what to show and which scores come out is decided in Python (story.py).

const params = new URLSearchParams(location.search);
const TABS = ["journey", "tree", "nima", "advisor"];
const S = {
  person: params.get("person"),                         // "timothy" or "melanie"; empty on the home screen
  tab: Math.max(0, TABS.indexOf(params.get("tab"))),    // which tab is open
  step: "worry",                                        // worry -> screen -> stack -> meeting -> doors -> first
  screen: 0, screens: [], details: false,               // the three fact screens
  rank: [],                                             // the stones, in the order tapped
  cur: 0,                                               // which step screen
  meet: null,                                           // the meeting, from the server
  time: 0,                                              // position of the time slider on the tree
  chat: [], sheet: false,                               // Nima's chat, and whether it is open over the screen
  revealed: false,                                      // has this person already seen the partner's stack
  start: null, me: null,
};
const $ = (id) => document.getElementById(id);

// ---------- Icons (drawn as SVG, no images) ----------

const P = {
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M6.5 15h4"/>',
  life: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  umb: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6a2 2 0 0 1-4 0"/>',
  col: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  car: '<path d="M4 17v-5l2-5h12l2 5v5z"/><path d="M4 12h16"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4h11l-2 4 2 4H6"/>',
  rise: '<path d="M3 18h18"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 6v3M5 10l2 2M19 10l-2 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 16V9a3 3 0 0 1 3-3h7"/>',
  tree: '<path d="M12 21V9"/><path d="M12 14l-5-4M12 12l5-4M12 17l-4-3M12 17l4-3"/>',
  desk: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const I = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ""}</svg>`;

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
const say = (html, me) => `<div class="say${me ? " me" : ""}">${html}</div>`;
const verified = (source) => (source ? `<div class="src">${I("check")}<span>Verified in the plan: ${esc(source)}</span></div>` : "");
const toAdvisor = () => `<div class="src adv">${I("desk")}<span>Not in your plan. Sent to your advisor.</span></div>`;
const front = (id) => S.start.fronts.find((f) => f.id === id);

// Draws a view. `still` = redraw the same view without the entrance animation and keep the scroll.
function draw(html, still) {
  const keep = $("v").scrollTop;
  $("v").innerHTML = html;
  $("v").classList.toggle("still", !!still);
  $("v").classList.remove("revealed");                  // only the meeting uses it, after "Show ...'s stack"
  $("v").scrollTop = still ? keep : 0;
}

// ---------- Start ----------

async function start() {
  S.start = await api("/api/start");
  $("pill").innerHTML = `${I("check")}plan-verified`;
  if (S.person) {
    S.me = await api(`/api/me?person=${S.person}`);
    $("who").textContent = `${S.me.name} · switch`;
    if (S.me.order.length) {                            // already ranked: pick up where they left off
      S.rank = S.me.order;
        S.step = "meeting";
    }
  }
  render();
}

function render() {
  const tabs = [["route", "Journey"], ["tree", "Tree"], ["chat", "Nima"], ["desk", "Advisor"]];
  $("nav").innerHTML = tabs.map(([icon, name], i) =>
    `<button data-tab="${i}"${S.tab === i ? ' aria-current="true"' : ""}>${I(icon)}${name}</button>`).join("");
  document.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { S.tab = +b.dataset.tab; S.sheet = false; render(); }));
  // "Ask Nima anything": on every screen except Nima's own tab
  $("mb").innerHTML = S.person && S.tab !== 2
    ? `<button class="mentor" id="mo">${I("chat")}<span>Ask Nima anything</span></button>` : "";
  if ($("mo")) $("mo").onclick = () => { S.sheet = true; sheet(); };
  sheet();
  if (!S.person && S.tab !== 3) return home();
  [journey, tree, nimaTab, advisor][S.tab]();
}

function home() {
  draw(`<h1>${esc(S.start.intro.title)}</h1>
    <div class="hero">${door("stay", "open")}<span class="m">or</span>${door("plan", "open")}</div>
    ${say(esc(S.start.intro.nima))}
    <p class="m">Who are you? Each of you opens this on your own phone.</p>
    <div class="row">${Object.entries(S.start.people)
      .map(([id, p]) => `<button class="opt c" onclick="location.href='?person=${id}'">${esc(p.name)}</button>`).join("")}</div>
    <button class="link" id="reset">Reset the demo</button>`);
  $("reset").onclick = resetDemo;
}

async function resetDemo() {
  await api("/api/reset", {});
  location.href = "/";
}

// ---------- Pieces that appear on several screens ----------

// One door, as a picture (not a button). kind = "stay" (nothing changes) or "plan"; state = "open", "dim" or both.
function door(kind, state, icon) {
  const label = kind === "stay" ? "Keep things as they are" : "Follow the plan";
  return `<div class="door ${kind}${state ? " " + state : ""}" aria-hidden="true">
    <span class="tag">${kind === "stay" ? "Door A" : "Door B"}</span>
    <span class="dframe"><span class="dlight">${I(icon || (kind === "plan" ? "route" : "flag"))}</span><span class="leaf"></span></span>
    <b>${label}</b></div>`;
}

// Each front always has its own colour, so the same stone looks the same in both stacks.
const STONE = { card: "var(--s1)", life: "var(--s3)", umbrella: "var(--s4)", college: "var(--s2)" };

// A stack of stones, base first. `same` marks the stones in the same place as the partner's.
// hidden = the partner's stack before the reveal: dashed empty places; the stones drop in when revealed.
function cairn(order, same, hidden) {
  const width = [112, 94, 76, 58];
  let svg = '<svg class="cairn" viewBox="0 0 150 158" role="img" aria-label="Stack of stones"><rect x="10" y="150" width="130" height="4" rx="2" fill="var(--line)"/>';
  if (hidden) width.forEach((w, i) => (svg += `<ellipse class="slot" cx="75" cy="${130 - i * 31}" rx="${w / 2}" ry="15"/>`));
  order.forEach((id, i) => {
    const y = 130 - i * 31;
    svg += `<g class="stone${same && same[i] ? " same" : ""}" style="--d:${0.3 + i * 0.45}s"><ellipse cx="75" cy="${y}" rx="${width[i] / 2}" ry="15" fill="${STONE[id]}"/>
      <g transform="translate(63 ${y - 12})" stroke="#fff" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <svg width="24" height="24" viewBox="0 0 24 24">${P[front(id).icon]}</svg></g></g>`;
  });
  return svg + "</svg>";
}

// Where the family's cash sits, with the card at the same scale. Figures from the plan.
function money() {
  return `<div class="col"><b>Where your $150,800 of cash sits</b>
    <div class="bar"><i style="width:56.1%;background:var(--s1)"></i><i style="width:4%;background:var(--s4)"></i><i style="width:39.9%;background:var(--s3)"></i></div>
    <div class="leg"><span><b style="background:var(--s1)"></b>Emergency reserve, up to $84,578</span>
      <span><b style="background:var(--s4)"></b>Vacation $6,000</span><span><b style="background:var(--s3)"></b>Free: $60,222</span></div>
    <p class="m" style="margin-top:10px">The 18% Chase card, same scale:</p>
    <div class="bar"><i style="width:11.9%;background:var(--warn)"></i></div>
    <div class="leg"><span><b style="background:var(--warn)"></b>$18,000: $270 of each $300 payment is interest</span></div>
    ${verified("key_metrics.facts.cash, key_metrics.ratios.creditCardDebt")}</div>`;
}

// The score bar: 60, 62, 73, 78. `done` = the fronts done so far, in the couple's order.
function track(done) {
  const key = [...done].sort().join(",");
  const score = S.start.scores[key];
  const steps = [[60, "Today"], [62, "Card"], [73, "+ Life cover"], [78, "+ Umbrella"]];
  const reached = Math.max(0, steps.filter(([s]) => s <= (score ?? 60)).length - 1);
  let note = "";
  if (done.includes("life") && !done.includes("card")) note = "Life cover alone leaves the score at 60. It moves together with the card.";
  return `<div class="col"><div class="sc"><b>Plan score</b><b>${score ?? "–"}</b></div>
    <div class="track"><i class="fill" style="width:${reached * 33.3}%"></i>${steps
      .map(([s, label], i) => `<span class="node${i <= reached ? " on" : ""}" style="left:${i * 33.3}%"><b>${s}</b>${label}</span>`).join("")}</div>
    ${note ? `<p class="m">${note}</p>` : ""}${verified("score.top_moves, score.combined_moves")}</div>`;
}

// ---------- Tab 1: the journey ----------

function journey() {
  ({ worry, screen, stack, meeting, doors, first })[S.step]();
}

function worry() {
  const q = S.start.question;
  const icons = { kids: "life", card: "card", college: "col", retire: "rise" };
  draw(`${say(esc(S.me.intro))}
    <h2>${esc(q.title)}</h2>
    <p class="m">${esc(q.sub)}</p>
    ${q.options.filter((o) => !o.free_text).map((o) => `<button class="opt" data-worry="${o.id}">${I(icons[o.id])}${esc(o.text)}</button>`).join("")}
    <textarea id="own" rows="2" placeholder="Something else? Write it in your own words"></textarea>
    <button class="go" id="send">Continue with my own words</button>`);
  document.querySelectorAll("[data-worry]").forEach((b) => (b.onclick = () => chooseWorry(b.dataset.worry, "")));
  $("send").onclick = () => $("own").value.trim() && chooseWorry("other", $("own").value.trim());
}

async function chooseWorry(id, text) {
  draw(`<div class="loader"></div>${say("Reading your plan with that in mind…")}`);
  const reply = await api("/api/worry", { worry: id, text });
  Object.assign(S, { screens: reply.screens, screen: 0, details: false, step: "screen" });
  journey();
}

function screen() {
  const s = S.screens[S.screen];
  const last = S.screen === S.screens.length - 1;
  let picture = `<div class="big">${esc(s.number)}<small>${esc(s.label)}</small></div>`;
  if (s.bars) {
    const max = Math.max(...s.bars.map((b) => b[1]));
    picture = s.bars.map(([label, value, text, hi]) => `<div class="pbar${hi ? " hi" : ""}"><label><span>${esc(label)}</span><span>${esc(text)}</span></label>
      <div class="tk"><div class="fl" data-w="${(value / max) * 100}"></div></div></div>`).join("");
  } else if (s.blocks) {
    const [total, solid, label] = s.blocks;
    picture = `<div class="blk">${Array.from({ length: total }, (_, i) => `<i class="${i < solid ? "" : "x"}"></i>`).join("")}</div>
      <p class="m">${total} ${esc(label)}</p>`;
  }
  draw(`<div class="pdots">${S.screens.map((_, i) => `<i class="${i <= S.screen ? "on" : ""}"></i>`).join("")}</div>
    <p class="m">${esc(S.start.personal_intro)}</p>
    <p class="pk">${esc(s.kicker)}</p>
    <p class="pt">${esc(s.text)}</p>
    <div>${picture}</div>
    <button class="opt c" id="dt">${S.details ? "Hide the numbers" : "See the numbers"}</button>
    ${S.details ? `<div class="col"><p>${esc(s.detail)}</p>${verified(s.source)}</div>` : ""}
    <div class="row"><button class="opt c" id="bk">${I("back")}Back</button><button class="go" id="nx">${last ? "Now build your stack" : "Next"}</button></div>`, S.details);
  setTimeout(() => document.querySelectorAll(".fl").forEach((f) => (f.style.width = f.dataset.w + "%")), 60);
  api("/api/event", { kind: "seen", screen: s.id });
  $("dt").onclick = () => {
    S.details = !S.details;
    if (S.details) api("/api/event", { kind: "detail", screen: s.id });
    screen();
  };
  $("bk").onclick = () => { S.details = false; if (S.screen) { S.screen--; screen(); } else { S.step = "worry"; worry(); } };
  $("nx").onclick = () => { S.details = false; if (last) { S.step = "stack"; S.rank = []; stack(); } else { S.screen++; screen(); } };
}

function stack() {
  draw(`<h2>Build your stack</h2>
    <p class="m">Tap what goes first: it becomes the base stone. Your partner builds theirs on their own.</p>
    ${cairn(S.rank)}
    <div class="grid">${S.start.fronts.map((f) => {
      const i = S.rank.indexOf(f.id);
      return `<button class="opt${i > -1 ? " on" : ""}" data-front="${f.id}"${i > -1 ? " disabled" : ""}>${I(f.icon)}${i > -1 ? i + 1 + ". " : ""}${esc(f.title)}</button>`;
    }).join("")}</div>
    <div class="row"><button class="opt c" id="rs">Start over</button>
      <button class="go" id="meet" ${S.rank.length === S.start.fronts.length ? "" : "disabled"}>Meet your partner</button></div>`, S.rank.length > 0);
  document.querySelectorAll("[data-front]").forEach((b) => (b.onclick = () => { S.rank.push(b.dataset.front); stack(); }));
  $("rs").onclick = () => { S.rank = []; stack(); };
  $("meet").onclick = async () => {
    await api("/api/rank", { order: S.rank });
    S.step = "meeting";
    meeting();
  };
}

async function meeting() {
  const m = await api(`/api/meeting?person=${S.person}`);
  S.meet = m;
  if (m.waiting) {
    draw(`<h2>The meeting</h2>
      ${cairn(S.rank)}
      ${say(`Your stack is saved. Now ${esc(m.partner_name)} builds theirs, without seeing yours.`)}
      <button class="go" id="copy">Copy the link for ${esc(m.partner_name)}</button>
      <button class="opt c" id="again">${esc(m.partner_name)} is done: check again</button>
      <button class="link" id="redo">Rebuild my stack</button>`);
    $("copy").onclick = () => {
      navigator.clipboard?.writeText(`${location.origin}/?person=${m.partner}`);
      $("copy").textContent = "Link copied";
    };
    $("again").onclick = meeting;
    $("redo").onclick = () => { S.step = "stack"; S.rank = []; stack(); };
    return;
  }
  const ids = (titles) => titles.map((t) => S.start.fronts.find((f) => f.title === t).id);
  const mine = ids(m.mine), theirs = ids(m.theirs);
  const matches = m.same.filter(Boolean).length;
  const legend = S.start.fronts.map((f) => `<span><b style="background:${STONE[f.id]}"></b>${esc(f.title)}</span>`).join("");
  // Everything with class "later" waits until the partner's stones have landed.
  draw(`<h2>The meeting</h2>
    <p class="m">${esc(m.partner_name)} has built a stack too, without seeing yours.</p>
    <div class="cairns meet"><div>${cairn(mine, m.same)}${esc(m.name)} (you)</div><div class="theirs">${cairn(theirs, m.same, true)}${esc(m.partner_name)}</div></div>
    <div class="leg">${legend}</div>
    <button class="go" id="reveal">Show ${esc(m.partner_name)}'s stack</button>
    <div class="later" style="--d:2.4s"><p class="m">Same stone at the same height: ${matches} of ${m.same.length}${matches ? " (dark outline)" : ""}.</p></div>
    <div class="later" style="--d:2.7s">${say(esc(m.insight))}</div>
    <div class="later" style="--d:3s">${money()}</div>
    <div class="later" style="--d:3.2s">${say(`Here is your plan, step by step, in the order that fits you both: ${esc(m.joint[0].title.toLowerCase())} first. For each one, see what happens if nothing changes, and what happens with the plan.`)}</div>
    <button class="go later" id="nx" style="--d:3.4s">See your steps</button>`);
  const reveal = () => { $("v").classList.add("revealed"); $("reveal").remove(); S.revealed = true; };
  $("reveal").onclick = reveal;
  if (S.revealed) reveal();                               // coming back to this screen: no need to tap again
  $("nx").onclick = () => { S.step = "doors"; S.cur = 0; doors(true); };
}

function doors(fresh) {
  const joint = S.meet.joint, f = joint[S.cur];
  const done = joint.slice(0, S.cur + 1).map((x) => x.id);       // this step and the ones before it
  const dots = joint.map((x, i) => `<i class="${i === S.cur ? "cur" : i < S.cur ? "done" : ""}">${I(i < S.cur ? "check" : x.icon)}</i>`).join("");
  draw(`<div class="dots">${dots}</div>
    <p class="m">Step ${S.cur + 1} of ${joint.length}, in the order that fits you both</p>
    <h2>${esc(f.title)}</h2>
    <div class="pair">${door("stay", "open dim", f.icon)}${door("plan", "open", f.icon)}</div>
    <div class="col"><b>Behind door A, if nothing changes</b><p class="m">${esc(f.stay)}</p></div>
    <div class="col"><b>Behind door B, with your plan</b><p>${esc(f.plan)}</p>${verified(f.source)}</div>
    <div class="col"><b>Your part</b><p>${esc(f.my_task)}</p></div>
    ${track(done)}
    <div class="row"><button class="opt c" id="bk">${I("back")}Back</button>
      <button class="go" id="nx">${S.cur < joint.length - 1 ? "Next step" : "Your first step"}</button></div>`, !fresh);
  $("bk").onclick = () => { if (S.cur) { S.cur--; doors(true); } else { S.step = "meeting"; meeting(); } };
  $("nx").onclick = () => {
    if (S.cur < joint.length - 1) { S.cur++; doors(true); } else { S.step = "first"; first(); }
  };
}

async function first() {
  if (!S.meet) S.meet = await api(`/api/meeting?person=${S.person}`);
  const step = S.meet.step;
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  draw(`<h2>Your first step</h2>
    <div class="col"><p class="pk">Together</p>
      <h3 style="margin-top:4px">${esc(step.do)}</h3>
      <div class="part"><b>Your part</b>${esc(step.my_task)}</div>
      <div class="part"><b>${esc(step.partner_name)}'s part</b>${esc(step.partner_task)}</div>
      <div class="part"><b>What it costs</b>${esc(step.cost)}</div>
      <div class="part"><b>Ask your advisor</b>${esc(step.ask)}</div>
    </div>
    <p class="m">Which day will you do your part?</p>
    <input type="date" id="day" value="${step.reminder || soon}">
    <a class="go" id="cal">Add my part to my calendar</a>
    ${say("That's all for today. On the day you picked, open the Tree tab: I'll ask how it went.")}
    <div class="row"><button class="opt c" id="redoors">Back to the steps</button><button class="go" id="totree">See your tree</button></div>`);
  const link = () => { $("cal").href = `/api/reminder.ics?person=${S.person}&date=${$("day").value}`; };
  $("day").onchange = link; link();
  $("redoors").onclick = () => { S.step = "doors"; S.cur = 0; doors(true); };
  $("totree").onclick = () => { S.tab = 1; render(); };
}

// ---------- Tab 2: the tree, and the days after ----------

async function tree(still) {
  const r = await api(`/api/road?person=${S.person}`);
  const doneIds = Object.keys(r.forks).filter((id) => r.forks[id].done);
  // The trunk is only coloured up to today: everything after it is still ahead.
  const event = (icon, date, text, now) => `<div class="tr${now ? " past now" : ""}"><div class="tl">${esc(date)}</div><div class="tn">${I(icon)}</div><div class="tt">${esc(text)}</div></div>`;
  const fork = (id) => {
    const f = r.forks[id];
    // Not done yet: "as now" is still their reality, and the plan branch is dashed (planned).
    // Done: the plan branch fills in and "as now" fades.
    return `<div class="tr head">${esc(f.title)}${f.done ? " · done" : ""}</div><div class="tr">
      <div><div class="lim stay${f.done ? " faded" : " current"}"><b>As now</b>${esc(f.stay)}</div></div>
      <div class="tn">${I(f.icon)}</div>
      <div><div class="lim plan${f.done ? " chosen" : " planned"}"><b>${f.done ? "Done" : "With the plan"}</b>${esc(f.plan)}</div></div></div>`;
  };
  let trunk = event("flag", "Today", "You are here", true) + `<div class="tr head">Your steps, in your order</div>`;
  trunk += r.order.map(fork).join("");                    // all four steps, college included, in their order
  trunk += event("bell", "Day 3, 30, 60, 90", "Nima checks in");
  trunk += r.milestones.map((m) => (m.fork ? fork(m.fork) : event(m.icon, m.date, m.text))).join("");

  const now = S.start.scores[[...doneIds].sort().join(",")];
  const goal = S.start.scores[[...r.order].sort().join(",")];
  S.time = Math.min(S.time, r.points.length - 1);
  draw(`<h2>Your tree</h2>
    <p class="m">The trunk is your timeline. At each fork, the dashed branch is your plan: it fills in as you do each step.</p>
    <div class="col"><div class="sc"><b>Plan score today</b><b>${now}</b></div>
      <p class="m">With all your steps done, your plan reaches <b>${goal}</b>.</p>${verified("score.top_moves, score.combined_moves")}</div>
    <div class="tree">${trunk}</div>${verified(r.source)}
    <div class="col"><div class="tick">${I("bell")}<b>How Nima checks in</b></div>
      ${r.points.length > 1 ? `<input type="range" min="0" max="${r.points.length - 1}" value="${S.time}" id="time" aria-label="Time">
      <div class="ticks" id="ticks"></div>` : ""}
      <div id="moment"></div></div>`, still);
  // Moving the slider only changes the labels and what Nima says, so the slider keeps working while you drag it.
  const at = () => {
    if ($("ticks")) $("ticks").innerHTML = r.points.map((p, i) => `<span${i === S.time ? ' class="now"' : ""}>${esc(p.label)}</span>`).join("");
    moment(r.points[S.time]);
  };
  if ($("time")) $("time").oninput = () => { S.time = +$("time").value; at(); };
  at();
}

function moment(point) {
  if (point.kind === "checkin") return checkin();
  if (point.kind === "step") {
    $("moment").innerHTML = `<p style="margin-top:8px"><b>${esc(point.label)}.</b> ${esc(point.intro)}</p>
      <h3 style="margin-top:6px">${esc(point.do)}</h3>
      <div class="part"><b>Your part</b>${esc(point.my_task)}</div>
      <div class="part"><b>${esc(point.partner_name)}'s part</b>${esc(point.partner_task)}</div>
      <div class="part"><b>What it costs</b>${esc(point.cost)}</div>`;
    return;
  }
  $("moment").innerHTML = `<p style="margin-top:8px"><b>${esc(point.label)}.</b> ${esc(point.text)}</p>`;
}

async function checkin(reply) {
  const c = reply || await api(`/api/checkin?person=${S.person}`);
  if (!c.ready) { $("moment").innerHTML = `<p style="margin-top:8px"><b>Day 3.</b> ${esc(c.text)}</p>`; return; }
  let html = `<p style="margin-top:8px"><b>Day 3.</b> Did you do your part? <i>${esc(c.task)}</i></p><p class="m">${esc(c.partner_line)}</p>`;
  if (c.message) html += say(esc(c.message));
  if (c.answered === null || c.answered === undefined) {
    html += `<div class="row"><button class="opt c" data-done="1">Yes, done</button><button class="opt c" data-done="0">Not yet</button></div>`;
  } else if (c.answered === false && !c.blocked) {
    html += `<p class="m">What stopped you?</p>` + c.blockers.map((b) => `<button class="opt" data-blocker="${b.id}">${esc(b.text)}</button>`).join("");
  }
  $("moment").innerHTML = html;
  document.querySelectorAll("[data-done]").forEach((b) => (b.onclick = async () => {
    await api("/api/checkin", { done: b.dataset.done === "1" });
    tree(true);                                           // a step done by both fills in on the tree
  }));
  document.querySelectorAll("[data-blocker]").forEach((b) => (b.onclick = async () => checkin(await api("/api/checkin", { blocker: b.dataset.blocker }))));
}

// ---------- Tab 3 and the sheet: Nima, your mentor ----------

// Suggested questions: about the door on screen if there is one, otherwise general ones.
function suggestions() {
  const onDoor = S.tab === 0 && S.step === "doors" && S.meet ? S.meet.joint[S.cur].id : null;   // the step on screen
  const fits = S.start.ask.filter((a) => (onDoor ? a.about.includes(onDoor) : a.about.length === 0));
  const extra = S.start.ask.find((a) => a.q === "Why pay the card if we have cash?");
  return [...new Set([...fits, extra])].slice(0, 3);
}

function chatHTML() {
  const lines = S.chat.map((c) => say(esc(c.q), true) + (c.answer === undefined
    ? say('<div class="loader"></div>')
    : say(esc(c.answer) + (c.checked ? verified(c.source) : c.for_advisor ? toAdvisor() : "")))).join("");
  return `<div class="chat" id="chat">${say(esc(S.start.nima_hello))}${lines}</div>
    <div class="chips">${suggestions().map((a) => `<button data-q="${esc(a.q)}">${esc(a.q)}</button>`).join("")}</div>
    <div class="compose"><textarea id="ci" rows="2" placeholder="Write your question in your own words"></textarea>
      <button class="send" id="cs" aria-label="Send">${I("send")}</button></div>`;
}

function wireChat(redraw) {
  const send = async (question) => {
    if (!question) return;
    const entry = { q: question };
    S.chat.push(entry);
    redraw();
    Object.assign(entry, await api("/api/ask", { question }));
    redraw();
  };
  document.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => send(b.dataset.q)));
  $("cs").onclick = () => send($("ci").value.trim());
  $("ci").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send($("ci").value.trim()); } };
  $("chat").scrollTop = $("chat").scrollHeight;
}

function nimaTab() {
  if (!S.person) return home();
  draw(`<h2>Nima, your mentor</h2><p class="m">Always here. Ask in your own words.</p><div class="chatbox">${chatHTML()}</div>`, true);
  wireChat(nimaTab);
}

function sheet() {
  if (!S.sheet || S.tab === 2 || !S.person) { $("sh").innerHTML = ""; return; }
  $("sh").innerHTML = `<div class="sheet"><div role="dialog" aria-label="Nima">
    <div class="sh">${I("chat")}<b>Nima</b><button id="xc" aria-label="Close">${I("close")}</button></div>${chatHTML()}</div></div>`;
  $("xc").onclick = () => { S.sheet = false; sheet(); };
  wireChat(sheet);
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
      : "<p class='m'>Waiting for both to build their stack.</p>"}</div>
    ${s.first ? `<div class="col"><b>First step they agreed on</b><p>${esc(s.first.do)}</p>
      <p class="m">${s.reminder ? `Planned for ${esc(s.reminder)}.` : "No date yet."} Their question: ${esc(s.first.ask)}</p></div>` : ""}
    <div class="col"><b>Open questions for you</b>${questions.length ? `<ul>${questions.join("")}</ul>` : "<p class='m'>None yet.</p>"}</div>
    <button class="link" id="reset">Reset the demo</button>`);
  $("reset").onclick = resetDemo;

  // Nima's note is written by the AI: it arrives a few seconds later, and the table works without it.
  if (!s.ready) return;
  $("note").innerHTML = say(`<div class="loader"></div>Reading what both of them chose…`);
  const n = await api("/api/advisor_note");
  if (!$("note")) return;                                  // they left the tab meanwhile
  $("note").innerHTML = n.note ? say(`<b>Nima's note</b><br>${esc(n.note)}${verified("every number checked")}`) : "";
}

start();
