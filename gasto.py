import os
import requests
from dotenv import load_dotenv

load_dotenv()

respuesta = requests.get(
    os.environ["LLM_PROXY_URL"] + "/key/info",
    headers={"Authorization": "Bearer " + os.environ["TEAM_KEY"]},
)
info = respuesta.json()["info"]

print("Gastado:   ", round(info["spend"], 4), "$")
print("Presupuesto:", info["max_budget"], "$")
print("Queda:     ", round(info["max_budget"] - info["spend"], 2), "$")