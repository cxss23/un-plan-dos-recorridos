# Nima · Two journeys

A financial plan reaches a couple, but each of them reads it alone, and nothing happens until they agree.
Nima tells the plan to each partner in their own way, has them decide separately what goes first,
then shows them where they agree and what their first step is.

Sherpas x UPV Sigma Data Club hackathon, November 2026. Case: Timothy and Melanie Weah.

## How it works

**Journey** (each partner, on their own phone)
1. **Will you two agree?** Two doors and Nima, the guide. The hook is meeting your partner.
2. **What worries you most?** The plan doesn't know: nobody asked. Or write it in your own words.
3. **Three things to know**, one fact per screen: one about their worry, two about what is in their own name.
4. **Build your stack.** Each partner stacks the plan's four open fronts as stones, base first, without seeing the other's.
5. **The meeting.** Both stacks side by side, what the plan says about where they start, and where the family's cash sits.
6. **The steps, as two doors.** One per front, in the order that fits them both. Both doors are open side by side:
   door A shows what happens if nothing changes, door B what happens with the plan. Nothing to choose: the contrast
   is the point. The plan score (60, 62, 73, 78) moves step by step.
7. **Your first step**, with a part for each partner, what it costs, what to ask the advisor, and a calendar reminder.

**Tree.** The family's timeline as a trunk; every decision is a fork where the plan branch grows and "as now" fades.
A slider shows what Nima says on each day after: the day 3 check-in ("did you do your part?"), then each next step.

**Nima.** Ask anything, from any screen. Prepared answers are ours; anything else goes to the AI, numbers checked.

**Advisor.** What each partner worries about, what they put first, where they differ,
their open questions, and a short note from Nima so the meeting starts with decisions, not explanations.

## How to run it

Python 3.10 or later.

```bash
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000. To try it on a phone, use the same wifi and open `http://<your computer's IP>:5000`.

The AI needs the team key: copy `.env.example` to `.env` and fill in `TEAM_KEY`.
Without a key everything works except free questions and "Something else", which go to the advisor.

## Try it in two minutes

1. Open the app as **Timothy**, pick a worry, read the three screens and build your stack.
2. Go back (top right, "switch") and open it as **Melanie**. When she builds her stack, you see the meeting and the doors.
3. Open **Tree** and move the slider to Day 3.
4. Open **Advisor**.
5. "Reset the demo" (home screen or Advisor) clears everything.

## How we use AI, and how it never invents a number

- **What we can predict, we write ourselves.** The worry screens and fronts are in `scenes/`, checked against the plan.
- **What we can't predict, the AI writes:** screens for a worry the person types ("Something else"),
  and answers to free questions in "Ask Nima". Model: `gpt-5-mini` through the hackathon proxy.
- **Every number the AI writes is checked against the plan** (`ai.py`, `check_numbers`). If one isn't there,
  the answer is not shown: the question goes to the advisor, or our own screens are used.
- **Scores are never written by hand:** 60, 62, 73 and 78 are read from `score.top_moves` and
  `score.combined_moves` in the plan.

## Files

| File | What it does |
|---|---|
| `scenes/timothy-melanie-weah.json` | Our script: every text the family reads. Change texts here |
| `story.py` | The logic: journey, meeting, joint order, first step, road, advisor summary |
| `ai.py` | The AI and the number check |
| `app.py` | The server: receives requests from the browser and calls `story.py` and `ai.py` |
| `static/app.js` | Draws the screens. Decides nothing |
| `static/style.css` | Colours, type and animations. The variables at the top restyle everything |
| `probar_ia.py` | Try the AI from the terminal |
| `cases/` | The Sherpas plans, as they come in the hackathon repo |
| `data/state.json` | What each person has done. Created automatically, not uploaded |

## Designed for couples

With one person, the meeting would be with the plan itself: their order against what moves their score most.
