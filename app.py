"""Nima's server.

Start it:  python app.py   and open http://localhost:5000

This file only receives requests from the browser and calls:
  - story.py  -> the logic (journey, meeting, first step, road, advisor summary)
  - ai.py     -> the AI ("Something else" screens, "Ask Nima" answers, the advisor note)
"""
from datetime import date, datetime

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request

load_dotenv()                    # read .env before loading the modules that use the key

import ai                        # noqa: E402
import story                     # noqa: E402

app = Flask(__name__, static_folder="static", static_url_path="")
app.json.sort_keys = False       # keep the script's order (Timothy, Melanie)


def person_arg():
    person = request.values.get("person") or (request.get_json(silent=True) or {}).get("person")
    if person not in story.load_scenes()["people"]:
        raise ValueError("Missing ?person= or unknown person")
    return person


@app.errorhandler(ValueError)
def bad_request(error):
    return jsonify({"error": str(error)}), 400


@app.get("/")
def index():
    return app.send_static_file("index.html")


# ---------- Read ----------

@app.get("/api/start")
def start():
    """What the home screen and the worry screen need."""
    scenes = story.load_scenes()
    return jsonify({"intro": scenes["intro"], "question": scenes["question"],
                    "people": scenes["people"], "personal_intro": scenes["personal_intro"],
                    "fronts": [{"id": f["id"], "title": f["title"], "fact": f["fact"]} for f in scenes["fronts"]],
                    "ask": [{"q": item["q"]} for item in scenes["ask"]]})


@app.get("/api/me")
def me():
    return jsonify(story.me(person_arg()))


@app.get("/api/meeting")
def meeting():
    return jsonify(story.meeting(person_arg()))


@app.get("/api/road")
def road():
    return jsonify(story.road(person_arg()))


@app.get("/api/checkin")
def get_checkin():
    return jsonify(story.checkin(person_arg()))


@app.get("/api/advisor")
def advisor():
    return jsonify(story.advisor_summary())


@app.get("/api/advisor_note")
def advisor_note():
    """Nima's few lines for the advisor (AI). The table above works without it."""
    return jsonify(story.advisor_note())


# ---------- What the person does ----------

@app.post("/api/worry")
def worry():
    """Saves the worry and returns the three screens: ours, or the AI's for "Something else"."""
    body, person = request.get_json(), person_arg()
    text = (body.get("text") or "").strip()
    screens, by = story.fixed_screens(person, body["worry"]), "us"
    if body["worry"] == "other" and text:
        written, note = ai.screens_for_own_worry(person, text)
        print(f"[AI] {person}: {note}")          # shows in the terminal where the server runs
        if written:
            screens, by = written, "ai"

    def change(state):
        state["people"][person].update({"worry": body["worry"], "worry_text": text,
                                        "screens": screens, "screens_by": by})
    story.update_state(change)
    return jsonify({"screens": screens, "screens_by": by})


@app.post("/api/rank")
def rank():
    body, person = request.get_json(), person_arg()
    order = body["order"]
    if sorted(order) != sorted(story.fronts_by_id()):
        raise ValueError("The ranking must include every front, once each")
    story.update_state(lambda s: s["people"][person].update({"order": order}))
    return jsonify({"ok": True})


@app.post("/api/event")
def event():
    """Records which screens were seen and where "Show the numbers" was opened."""
    body, person = request.get_json(), person_arg()
    kind = "details" if body["kind"] == "detail" else "seen"

    def change(state):
        seen = state["people"][person][kind]
        if body["screen"] not in seen:
            seen.append(body["screen"])
    story.update_state(change)
    return jsonify({"ok": True})


@app.post("/api/checkin")
def checkin():
    """Another day: did you do your part? If not, what stopped you?"""
    body, person = request.get_json(), person_arg()

    def change(state):
        if "done" in body:
            state["household"]["done"][person] = bool(body["done"])
        if "blocker" in body:
            state["household"]["blockers"][person] = body["blocker"]
    story.update_state(change)
    return jsonify(story.checkin(person))


@app.post("/api/ask")
def ask():
    """Prepared questions get our answer; any other question goes to the AI, numbers checked."""
    body, person = request.get_json(), person_arg()
    question = body["question"].strip()
    if not question:
        raise ValueError("Empty question")
    prepared = next((item for item in story.load_scenes()["ask"] if item["q"] == question), None)
    if prepared and prepared["a"]:
        reply, checked, for_advisor, source = prepared["a"], True, False, prepared["source"]
    elif prepared:
        reply, checked, for_advisor, source = ai.NOT_IN_PLAN, False, True, ""
    else:
        reply, checked, for_advisor = ai.answer(question)
        source = "your plan" if checked else ""

    def change(state):
        state["people"][person]["questions"].append({"question": question, "for_advisor": for_advisor})
    story.update_state(change)
    return jsonify({"answer": reply, "checked": checked, "for_advisor": for_advisor, "source": source})


@app.post("/api/reset")
def reset():
    story.reset_state()
    return jsonify({"ok": True})


# ---------- Reminder: a calendar event, no notifications needed ----------

@app.get("/api/reminder.ics")
def reminder():
    person = person_arg()
    day = date.fromisoformat(request.args["date"])
    step = story.step(person, 0)
    if not step:
        raise ValueError("No first step yet")
    story.update_state(lambda s: s["household"].update({"reminder": day.isoformat()}))
    link = f"{request.host_url}?person={person}&tab=road"
    esc = lambda text: text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
    stamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    ics = "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nima//EN",
        "BEGIN:VEVENT",
        f"UID:{stamp}-{person}@nima",
        f"DTSTAMP:{stamp}",
        f"DTSTART;VALUE=DATE:{day.strftime('%Y%m%d')}",
        f"SUMMARY:{esc(step['my_task'])}",
        f"DESCRIPTION:{esc(step['do'] + '. When it is done, come back: ')}{link}",
        f"URL:{link}",
        "END:VEVENT", "END:VCALENDAR", "",
    ])
    return Response(ics, mimetype="text/calendar",
                    headers={"Content-Disposition": "attachment; filename=first-step.ics"})


if __name__ == "__main__":
    # host 0.0.0.0 so you can open it from a phone on the same wifi.
    app.run(host="0.0.0.0", port=5000, debug=True)
