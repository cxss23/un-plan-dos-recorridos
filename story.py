"""The app's logic: one plan, two journeys.

Everything that isn't drawing screens lives here: what each person sees, how the two
rankings are compared, the first step, the road, and the advisor summary.

Scores are NOT written by hand: they are read from the plan (cases/<case>/financial-health.json).
"""
import json
import threading
from pathlib import Path

BASE = Path(__file__).parent
CASE = "timothy-melanie-weah"
STATE_FILE = BASE / "data" / "state.json"
_lock = threading.Lock()


# ---------- Data: our script and Sherpas' plan ----------

def load_scenes():
    """Our script: texts, fronts and tasks. Edit scenes/<case>.json to change any text."""
    return json.loads((BASE / "scenes" / f"{CASE}.json").read_text(encoding="utf-8"))


def load_plan():
    """The Sherpas plan, exactly as it comes in the hackathon repo."""
    return json.loads((BASE / "cases" / CASE / "financial-health.json").read_text(encoding="utf-8"))


def fronts_by_id():
    return {f["id"]: f for f in load_scenes()["fronts"]}


# ---------- State: what each person has done ----------

def _empty_person():
    return {"worry": None, "worry_text": "", "screens": None, "screens_by": "",
            "order": [], "doors": {}, "seen": [], "details": [], "questions": []}


def _empty_state():
    people = load_scenes()["people"]
    return {"people": {p: _empty_person() for p in people},
            "household": {"done": {}, "blockers": {}, "reminder": None}}


def read_state():
    if not STATE_FILE.exists():
        return _empty_state()
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))


def update_state(change):
    """Read the state, apply `change(state)` and save it."""
    with _lock:
        state = read_state()
        change(state)
        STATE_FILE.parent.mkdir(exist_ok=True)
        # Write to a temporary file and swap it in, so nobody reads a half-written file.
        temp = STATE_FILE.with_suffix(".tmp")
        temp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(STATE_FILE)
        return state


def reset_state():
    with _lock:
        if STATE_FILE.exists():
            STATE_FILE.unlink()


def partner_of(person):
    scenes = load_scenes()
    partner = scenes["people"][person]["partner"]
    return partner, scenes["people"][partner]["name"]


def both_ranked():
    return all(p["order"] for p in read_state()["people"].values())


# ---------- Scores: always from the plan ----------

def score_for(front_ids):
    """The plan's score if these fronts are done, e.g. {"card", "life"}.

    Fronts with no move in the plan (college) don't change the score.
    """
    score = load_plan()["score"]
    fronts = fronts_by_id()
    moves = {fronts[f]["move"] for f in front_ids if fronts[f].get("move")}
    if not moves:
        return score["published_score"]
    if len(moves) == 1:
        title = next(iter(moves))
        for move in score["top_moves"]:
            if move["title"] == title:
                return move["score_after"]
    for combo in score["combined_moves"]:
        if set(combo["moves"]) == moves:
            return combo["score_after"]
    raise ValueError(f"The plan has no score for this combination: {sorted(moves)}")


def all_scores():
    """The plan's score for every combination of fronts, e.g. {"": 60, "card": 62, "card,life": 73}.

    The browser uses it to move the score bar as doors open. None = the plan has no score for it.
    """
    from itertools import combinations
    ids = sorted(fronts_by_id())
    result = {}
    for n in range(len(ids) + 1):
        for combo in combinations(ids, n):
            try:
                result[",".join(combo)] = score_for(set(combo))
            except ValueError:
                result[",".join(combo)] = None
    return result


def best_partner(front_id):
    """The other front that, together with this one, gives the highest score."""
    fronts = fronts_by_id()
    others = [f for f in fronts if f != front_id and fronts[f].get("move")]
    best = max(others, key=lambda other: score_for({front_id, other}))
    return best, score_for({front_id, best})


def score_ladder():
    """The four scores shown at the meeting: today, card, card + life, all three."""
    return [
        {"label": "Today", "score": score_for(set())},
        {"label": "Pay $6,800 on the card", "score": score_for({"card"})},
        {"label": "Card and life cover", "score": score_for({"card", "life"})},
        {"label": "Add the umbrella too", "score": score_for({"card", "life", "umbrella"})},
    ]


# ---------- Each person's journey ----------

def intro(person):
    scenes = load_scenes()
    partner, partner_name = partner_of(person)
    ready = bool(read_state()["people"][partner]["order"])
    return scenes["intro"]["second" if ready else "first"].format(partner=partner_name)


def fixed_screens(person, worry):
    """Three screens written by us: one about the worry, then two about what is theirs."""
    scenes = load_scenes()
    personal = scenes["personal"][person]
    first_id = scenes["worry_screens"].get(worry)
    if first_id is None:                       # "something else" with no AI: just their own screens
        return personal[:3]
    first = next((s for s in personal if s["id"] == first_id), None) or {"id": first_id, **scenes["screens"][first_id]}
    rest = [s for s in personal if s["id"] != first["id"]]
    return [first] + rest[:2]


def me(person):
    """Everything the journey needs to pick up where this person left off."""
    state = read_state()
    mine = state["people"][person]
    return {
        "name": load_scenes()["people"][person]["name"],
        "intro": intro(person),
        "worry": mine["worry"],
        "screens": mine["screens"],
        "screens_by": mine["screens_by"],
        "order": mine["order"],
        "doors": mine.get("doors", {}),
    }


# ---------- The meeting ----------

def joint_order():
    """Joint order: adds up both positions. On a tie, the script's priority wins."""
    scenes = load_scenes()
    orders = [p["order"] for p in read_state()["people"].values()]
    priority = scenes["front_priority"]
    return sorted(priority, key=lambda f: (sum(order.index(f) for order in orders), priority.index(f)))


def insight(first_a, first_b):
    """What the plan says about what each of them put first."""
    fronts = fronts_by_id()
    base = score_for(set())
    name = lambda f: fronts[f]["short"]

    if first_a == first_b:
        front = fronts[first_a]
        if not front.get("move"):
            return "You both start in the same place. " + front["no_score_note"]
        alone = score_for({first_a})
        other, together = best_partner(first_a)
        if alone > base:
            return (f"You both start in the same place. On its own it takes your score from {base} to {alone}, "
                    f"and together with {name(other)} it reaches {together}.")
        return (f"You both start in the same place. On its own your score stays at {base}. "
                f"Together with {name(other)} it rises to {together}.")

    movable = [f for f in (first_a, first_b) if fronts[f].get("move")]
    if len(movable) == 2:
        a, b, both = score_for({first_a}), score_for({first_b}), score_for({first_a, first_b})
        if both > max(a, b):
            return (f"You start in different places, and you don't have to choose. With only {name(first_a)} "
                    f"your score is {a}; with only {name(first_b)}, {b}. Do both and it goes from {base} to {both}.")
        front = max((first_a, first_b), key=lambda f: best_partner(f)[1])
        other, together = best_partner(front)
        return (f"You start in different places. Together they leave your score at {both}. "
                f"What moves it is {name(front)} with {name(other)}: {together}.")
    notes = [fronts[f]["no_score_note"] for f in (first_a, first_b) if not fronts[f].get("move")]
    if movable:
        notes.append(f"With {name(movable[0])}, your score goes to {score_for({movable[0]})}.")
    return "You start in different places. " + " ".join(notes)


def meeting(person):
    """The central screen: wait for the partner, or reveal both rankings."""
    state = read_state()
    partner, partner_name = partner_of(person)
    if not both_ranked():
        return {"waiting": True, "partner": partner, "partner_name": partner_name}

    fronts = fronts_by_id()
    mine, theirs = state["people"][person]["order"], state["people"][partner]["order"]
    return {
        "waiting": False,
        "name": load_scenes()["people"][person]["name"],
        "partner_name": partner_name,
        "mine": [fronts[f]["title"] for f in mine],
        "theirs": [fronts[f]["title"] for f in theirs],
        "same": [a == b for a, b in zip(mine, theirs)],
        "insight": insight(mine[0], theirs[0]),
        "ladder": score_ladder(),
        "step": step(person, 0),
        "next": [step(person, n) for n in range(1, len(fronts))],
        "joint": [{**{k: fronts[f][k] for k in ("id", "title", "icon", "stay", "plan", "source")},
                   "my_task": fronts[f]["tasks"][person]} for f in joint_order()],
    }


def step(person, which=0):
    """A step card: what to do, each person's part, what it costs and what to ask."""
    if not both_ranked():
        return None
    partner, partner_name = partner_of(person)
    front = fronts_by_id()[joint_order()[which]]
    return {
        "front": front["id"],
        "do": front["do"],
        "my_task": front["tasks"][person],
        "partner_task": front["tasks"][partner],
        "partner_name": partner_name,
        "cost": front["cost"],
        "ask": front["ask"],
        "source": front["source"],
        "reminder": read_state()["household"]["reminder"],
    }


# ---------- The road and the days after ----------

def checkin(person):
    """Did you do your part? And what has the other one done?"""
    scenes = load_scenes()
    state = read_state()
    partner, partner_name = partner_of(person)
    first = step(person, 0)
    if not first:
        return {"ready": False, "text": f"There is no first step yet: you and {partner_name} both need to rank."}

    done = state["household"]["done"]
    mine, theirs = done.get(person), done.get(partner)
    partner_line = {True: f"{partner_name} has already done their part.",
                    False: f"{partner_name} hasn't done their part yet.",
                    None: f"{partner_name} hasn't answered yet."}[theirs]

    message = None
    if mine and theirs:
        message = "Done, together."
        base, after = score_for(set()), score_for({first["front"]})
        if after > base:
            message += f" When your advisor updates the plan, your score goes from {base} to {after}."
        elif fronts_by_id()[first["front"]].get("move"):
            other, together = best_partner(first["front"])
            message += f" Your score doesn't move yet: {fronts_by_id()[other]['short']} is missing. With both, it reaches {together}."
    elif mine:
        message = f"Your part is done. Now it's {partner_name}'s turn."
    elif mine is False:
        blocker = state["household"]["blockers"].get(person)
        message = (scenes["later"]["blocker_thanks"] if blocker
                   else scenes["later"]["smaller"].format(task=first["my_task"].lower()))

    return {"ready": True, "task": first["my_task"], "partner_line": partner_line,
            "answered": mine, "blocked": bool(state["household"]["blockers"].get(person)),
            "message": message, "blockers": scenes["later"]["blockers"]}


def forks(person):
    """Each front as a fork in the tree: what happens as now, what happens with the plan, and whether it is done."""
    # A step is done when both partners said "yes, done" at the check-in. Today only the first step has a check-in.
    done = read_state()["household"]["done"]
    both_done = both_ranked() and len(done) == 2 and all(done.values())
    first = joint_order()[0] if both_ranked() else None
    return {f["id"]: {"title": f["title"], "icon": f["icon"], "stay": f["stay_short"], "plan": f["plan_short"],
                      "done": both_done and f["id"] == first} for f in load_scenes()["fronts"]}


def road(person):
    """Milestones from the plan, plus what Nima says at each point in time: every step, in the couple's order."""
    scenes = load_scenes()
    if not both_ranked():
        waiting = {"kind": "text", "text": "Rank what goes first, and your steps will appear here."}
        return {"milestones": scenes["road"], "source": scenes["road_source"], "forks": forks(person),
                "order": scenes["front_priority"], "points": [{"label": "Today", **waiting}]}

    steps = [step(person, n) for n in range(len(fronts_by_id()))]
    def step_point(label, n, intro):
        s = steps[n]
        return {"label": label, "kind": "step", "intro": intro, "do": s["do"], "my_task": s["my_task"],
                "partner_task": s["partner_task"], "partner_name": s["partner_name"],
                "cost": s["cost"], "ask": s["ask"]}

    return {
        "milestones": scenes["road"],
        "source": scenes["road_source"],
        "forks": forks(person),
        "order": joint_order(),
        "points": [
            step_point("Today", 0, "Your first step. Pick a day to do your part."),
            {"label": "Day 3", "kind": "checkin"},
            step_point("Day 30", 1, "Step 2. If step 1 is done, this is next."),
            {"label": "Jan 2027", "kind": "text", "text": scenes["jan_2027"]},
            step_point("Day 60", 2, "Step 3."),
            step_point("Day 90", 3, "Step 4, the last one in your order."),
        ],
    }


# ---------- Advisor summary ----------

def advisor_summary():
    scenes = load_scenes()
    state = read_state()
    fronts = fronts_by_id()
    worries = {o["id"]: o["text"] for o in scenes["question"]["options"]}
    blockers = {b["id"]: b["text"] for b in scenes["later"]["blockers"]}

    people = []
    for pid, info in scenes["people"].items():
        p = state["people"][pid]
        people.append({
            "name": info["name"],
            "worry": p["worry_text"] or worries.get(p["worry"]) or "Not answered yet",
            "first": fronts[p["order"][0]]["title"] if p["order"] else "Not ranked yet",
            "order": [fronts[f]["title"] for f in p["order"]],
            "doors": {fronts[f]["title"]: side for f, side in p.get("doors", {}).items()},
            "details": len(p["details"]),
            "questions": p["questions"],
            "done": state["household"]["done"].get(pid),
            "blocker": blockers.get(state["household"]["blockers"].get(pid)),
        })

    ready = both_ranked()
    differ = []
    if ready:
        a, b = (state["people"][p]["order"] for p in scenes["people"])
        names = [info["name"] for info in scenes["people"].values()]
        if a[0] != b[0]:
            differ.append(f"{names[0]} starts with {fronts[a[0]]['short']}, {names[1]} with "
                          f"{fronts[b[0]]['short']}. Spend the meeting here.")
        for n, (x, y) in enumerate(zip(a, b)):
            if n and x != y:
                differ.append(f"Position {n + 1}: {fronts[x]['short']} versus {fronts[y]['short']}.")
    first = step(next(iter(scenes["people"])), 0) if ready else None
    return {
        "family": scenes["family"],
        "people": people,
        "ready": ready,
        "differ": differ,
        "first": first,
        "reminder": state["household"]["reminder"],
    }


def advisor_note():
    """Nima's note for the advisor. Written once, and again only when something the couple did changes."""
    import hashlib
    import ai                                     # here, to avoid a circular import
    summary = advisor_summary()
    if not summary["ready"]:
        return {"note": None, "reason": "waiting for both to rank"}
    key = hashlib.md5(json.dumps([summary, ai.NOTE_VERSION], sort_keys=True).encode()).hexdigest()
    saved = read_state()["household"].get("advisor_note") or {}
    if saved.get("key") == key:
        return {"note": saved["note"], "reason": "saved"}
    note, reason = ai.advisor_note(summary, score_ladder())
    print(f"[AI] advisor note: {reason}")         # shows in the terminal where the server runs
    if note:
        update_state(lambda s: s["household"].update({"advisor_note": {"key": key, "note": note}}))
    return {"note": note, "reason": reason}
