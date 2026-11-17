"""Try Nima's AI from the terminal, without opening the app.

Usage:
    python probar_ia.py worry "We might have a third child"     -> three screens about your own worry
    python probar_ia.py ask "Why is our score 60?"              -> an answer to a question

Nothing is saved: it is only for looking.
"""
import sys
import time

import ai

if len(sys.argv) < 3 or sys.argv[1] not in ("worry", "ask"):
    sys.exit(__doc__)
kind, text = sys.argv[1], sys.argv[2]
start = time.time()

if kind == "worry":
    screens, note = ai.screens_for_own_worry("timothy", text)
    print(f"{note} · {time.time() - start:.1f} s")
    for s in screens or []:
        print(f"\n[{s['kicker']}]  big number: {s['number']}\n{s['text']}\n  numbers: {s['detail']}")
    if not screens:
        print("The app would show our own screens instead.")
else:
    reply, checked, for_advisor = ai.answer(text)
    print(f"{time.time() - start:.1f} s · numbers checked: {checked} · sent to advisor: {for_advisor}\n\n{reply}")
