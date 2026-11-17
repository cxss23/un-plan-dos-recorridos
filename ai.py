"""Nima's AI: the two places where the model writes something we can't write in advance.

1. "Something else": a person types their own worry. The model writes their three screens about it.
2. "Ask Nima": a person asks any question. The model answers with their plan.
3. The advisor note: the model reads what both partners chose and briefs the advisor in a few lines.

The rule: what we can predict, we write ourselves (scenes/). What we can't, the AI writes.

Two protections, so a family never sees an invented number:
  - Every number the model writes must exist in the plan. `check_numbers` checks it.
  - If anything fails (format, numbers, timeout, no key), the app falls back to our own texts.
"""
import json
import os
import re

import requests
from dotenv import load_dotenv

import story

load_dotenv()          # in case this module is used without going through app.py

LLM_PROXY_URL = os.environ.get("LLM_PROXY_URL", "https://llm-hackathon.sherpaswealth.com")
MODEL = os.environ.get("MODEL", "gpt-5-mini")
TIMEOUT_SECONDS = 90
NOT_IN_PLAN = "That isn't in your plan. I've sent your question to your advisor."

# Parts of the Sherpas analysis that are sent to the model.
NARRATIVE_SECTIONS = [
    "summary_main", "summary_recommendations", "debt_short_observations",
    "protection_life_insurance_short_observations", "protection_umbrella_short_observations",
    "protection_emergency_fund_short_observations", "savings_short_observations",
    "retirement_short_observations",
]


# ---------- Number check ----------

def allowed_numbers(*sources):
    """Every number that appears in the plan (JSON numbers and numbers inside its texts)."""
    found = set()

    def walk(node):
        if isinstance(node, bool):
            return
        if isinstance(node, (int, float)):
            found.add(float(node))
        elif isinstance(node, str):
            found.update(numbers_in(node))
        elif isinstance(node, dict):
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    for source in sources:
        walk(source)
    return found


def numbers_in(text):
    """Numbers in an English text: 150,800 / 84,577.50 / 22.8."""
    return [float(m.replace(",", "")) for m in re.findall(r"\d[\d,]*(?:\.\d+)?", text) if m.replace(",", "")]


def check_numbers(text, allowed):
    """Returns the numbers in the text that are NOT in the plan. Empty list = all good."""
    bad = []
    for number in numbers_in(text):
        if number <= 10 and number == int(number):
            continue                      # small everyday numbers: "two of you", "3 screens"
        ok = any(
            abs(a - number) < 0.051                          # the same number (or rounded to one decimal)
            or round(a) == number                            # rounded to a whole number
            or (a >= 1000 and number in (round(a, -2), round(a, -3)))   # "about $60,000" for 60,222.50
            or (0 < a < 1 and abs(a * 100 - number) < 0.51)  # 0.228 in the plan, 22.8% in the text
            for a in allowed
        )
        if not ok:
            bad.append(number)
    return bad


def plan_numbers():
    case = story.BASE / "cases" / story.CASE
    persona = (case / "persona.md").read_text(encoding="utf-8")
    investments = json.loads((case / "investment-analysis.json").read_text(encoding="utf-8"))
    return allowed_numbers(story.load_plan(), persona, investments)


def call_model(messages):
    """Sends the messages to the hackathon's AI proxy and returns the reply text."""
    reply = requests.post(
        f"{LLM_PROXY_URL}/v1/chat/completions",
        headers={"Authorization": f"Bearer {os.environ.get('TEAM_KEY', '')}"},
        json={"model": MODEL, "messages": messages},
        timeout=TIMEOUT_SECONDS,
    )
    reply.raise_for_status()
    return reply.json()["choices"][0]["message"]["content"].strip()


def plan_context():
    """The parts of the plan the model reads before writing anything."""
    plan = story.load_plan()
    return {
        "household": plan["case"]["household"],
        "plan_facts": plan["key_metrics"]["facts"],
        "score_and_moves": {"score": plan["score"]["published_score"],
                            "moves": plan["score"]["top_moves"],
                            "combinations": plan["score"]["combined_moves"]},
        "debts": plan.get("profile", {}).get("liabilities"),
        "insurance": plan.get("profile", {}).get("insurance"),
        "analysis": {k: plan["narrative"][k] for k in NARRATIVE_SECTIONS if k in plan["narrative"]},
    }


# ---------- 1. "Something else": three screens about their own worry ----------

def build_messages(person, worry):
    scenes = story.load_scenes()
    name = scenes["people"][person]["name"]
    partner_name = scenes["people"][scenes["people"][person]["partner"]]["name"]

    system = f"""You explain a family's financial plan to {name}, the way a good advisor would explain it
to someone who knows nothing about finance. Plain English, short sentences, no jargon.

{name} told us what worries them most, in their own words: "{worry}"

Write exactly 3 phone screens for {name} about that worry. Each screen is ONE fact from the plan
and what it means for {name}'s life or for deciding what to do first.
- BAD (a list of facts): "You have $X of cover, earn $Y and your profile is Growth."
- GOOD (a fact and its meaning): "Your life cover is $X. That is less than one year of your salary."
- Do not repeat their worry back to them. Go straight to the fact that explains it.

Rules for "text" (shown in large type):
- At most 170 characters and two sentences. At most TWO numbers.
- Talk to {name} as "you". Call their partner {partner_name}.
- Round big numbers ("about $60,000"). No cents.
- Say "score", never "cap". Say "a leveraged fund", never "UPRO".
- Only say something is {name}'s if the data shows it in {name}'s name. Otherwise say "your family's".
- Never say how anyone feels.

Other fields:
- "kicker": a 2 to 5 word title.
- "detail": one or two sentences with the exact supporting numbers, for someone who knows finance (max 240 characters).
- "number": the most striking number on the screen, with "value" (e.g. "$270") and "label" (what it is, in a few words).

General rules:
- Use ONLY numbers that appear in the data. Do not add, subtract or calculate new numbers (rounding is fine).
- No advice that isn't in the plan, and no prices the plan doesn't include.
- If the plan has nothing about this worry, use the plan facts closest to it and say so honestly.

Return ONLY this JSON, with nothing before or after:
{{"screens": [{{"kicker": "...", "text": "...", "detail": "...", "number": {{"value": "...", "label": "..."}}}}, ...]}}"""

    return [{"role": "system", "content": system},
            {"role": "user", "content": json.dumps(plan_context(), ensure_ascii=False)}]


def parse_screens(reply_text, allowed):
    """Turns the model's reply into screens. Raises ValueError if anything is wrong."""
    start, end = reply_text.find("{"), reply_text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("the reply is not JSON")
    cards = json.loads(reply_text[start:end + 1]).get("screens")
    if not isinstance(cards, list) or len(cards) != 3:
        raise ValueError("there aren't exactly 3 screens")

    result = []
    for n, card in enumerate(cards, start=1):
        kicker, text, detail = (str(card.get(k, "")).strip() for k in ("kicker", "text", "detail"))
        number = card.get("number") or {}
        if not kicker or not text:
            raise ValueError(f"screen {n} is incomplete")
        if len(text) > 220:
            raise ValueError(f"screen {n} is too long")
        everything = " ".join([kicker, text, detail, str(number.get("value", "")), str(number.get("label", ""))])
        bad = check_numbers(everything, allowed)
        if bad:
            raise ValueError(f"screen {n} uses numbers that aren't in the plan: {bad}")
        result.append({"id": f"ai{n}", "kicker": kicker, "text": text, "detail": detail,
                       "number": str(number.get("value", "")), "label": str(number.get("label", "")),
                       "source": "written by Nima from your plan, every number checked"})
    return result


def screens_for_own_worry(person, worry):
    """Three screens about a worry the person typed. Returns (screens or None, note for the terminal)."""
    if not os.environ.get("TEAM_KEY"):
        return None, "no TEAM_KEY: using our own screens"
    try:
        return parse_screens(call_model(build_messages(person, worry)), plan_numbers()), f"written by {MODEL}"
    except (requests.RequestException, ValueError, KeyError, TypeError) as error:
        return None, f"using our own screens ({error})"


# ---------- 2. "Ask Nima": answer a question with the plan ----------

def answer(question):
    """Answers a question with the plan. Returns (answer, checked, sent_to_advisor)."""
    if not os.environ.get("TEAM_KEY"):
        return NOT_IN_PLAN, False, True
    system = (
        "You are Nima. You explain a family's existing financial plan in plain English. "
        "Answer in three sentences at most. Use ONLY the plan below and never invent a number. "
        "If the question needs something the plan doesn't calculate (insurance prices, other scenarios, "
        f"new advice), reply exactly: {NOT_IN_PLAN}\n\nPLAN:\n" + json.dumps(plan_context(), ensure_ascii=False)
    )
    try:
        reply = call_model([{"role": "system", "content": system}, {"role": "user", "content": question}])
    except (requests.RequestException, KeyError, TypeError):
        return "I can't answer right now. I've saved your question for your advisor.", False, True
    if "isn't in your plan" in reply:
        return NOT_IN_PLAN, False, True
    if check_numbers(reply, plan_numbers()):
        # A number we can't find in the plan: better not to show it.
        return NOT_IN_PLAN, False, True
    return reply, True, False


# ---------- 3. The advisor note: brief the advisor on what the couple told us ----------

def advisor_note(summary, ladder):
    """A few lines for the advisor, written from what both partners did. Returns (note or None, reason)."""
    if not os.environ.get("TEAM_KEY"):
        return None, "no TEAM_KEY"
    system = (
        "You are Nima. You brief a financial advisor before a meeting with a couple. "
        "Write 3 or 4 short sentences in plain English, at most 450 characters, no lists, no headings. "
        "Say what worries each partner (in their own words if they typed them), where they agree and differ, "
        "what stopped them if anything did, and which topic to open the meeting with, and why. "
        "Use ONLY the facts below and the plan's scores. Never invent a number. Never say how anyone feels."
    )
    facts = {"what_the_couple_did": summary, "plan_scores": ladder}
    try:
        note = call_model([{"role": "system", "content": system},
                           {"role": "user", "content": json.dumps(facts, ensure_ascii=False)}])
    except (requests.RequestException, KeyError, TypeError) as error:
        return None, str(error)
    bad = check_numbers(note, plan_numbers() | allowed_numbers(summary))
    if bad:
        return None, f"numbers not in the plan: {bad}"
    return note, f"written by {MODEL}"
