# Nima · One plan, two journeys

A financial plan reaches a couple, but each of them reads it alone, and nothing happens until they agree.
Nima tells the plan to each partner in their own way, has them decide separately what goes first,
then shows them where they agree and what their first step is.

Sherpas x UPV Sigma Data Club hackathon, November 2026. Case: Timothy and Melanie Weah.

## How it works

**Journey** (each partner, on their own phone)
1. **Will you two agree?** The hook, from the first screen, is meeting your partner.
2. **What worries you most?** The plan doesn't know: nobody asked.
3. **Three things to know**, one fact per screen, about their worry and what is in their own name.
4. **What goes first?** Each ranks the plan's four open fronts, without seeing the other's answer.
5. **The meeting.** Both rankings side by side, what the plan says moves their score,
   and a first step with a part for each of them: what to do, what it costs, what to ask the advisor.

**Road.** The family's milestones from the plan, and a time slider: what Nima says on day 0, day 3, day 30.
On day 3 it asks "did you do your part?", shows what the partner has done, and if not, what stopped them.

**Ask.** Prepared questions, or anything else. Every number in an answer is checked against the plan.

**Advisor.** What each partner worries about, what they put first, where they differ, and their open questions.
The advisor can spend the meeting on decisions instead of explaining the plan.

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

1. Open the app as **Timothy**, pick a worry, read the three screens and rank the four fronts.
2. Go back (top right, "switch") and open it as **Melanie**. When she ranks, you see the meeting.
3. Open **Road** and move the slider to Day 3.
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
