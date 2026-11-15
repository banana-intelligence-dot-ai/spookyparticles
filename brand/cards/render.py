"""Renders hub-card.html to hub-card.png (1600 x 1000) and a 300 px preview. Run from anywhere."""
import pathlib, subprocess, sys
from playwright.sync_api import sync_playwright

here = pathlib.Path(__file__).resolve().parent
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else here
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    pg = b.new_page(viewport={"width": 1600, "height": 1000}, device_scale_factor=1)
    pg.goto((here / "hub-card.html").as_uri())
    pg.evaluate("document.fonts.ready")
    pg.wait_for_timeout(300)
    pg.locator(".card").screenshot(path=str(here / "hub-card.png"))
    b.close()
# The 300 px preview is how the card is seen in the hub grid.
subprocess.run(["sips", "-z", "188", "300", str(here / "hub-card.png"), "--out", str(out / "hub-card-300.png")], check=True, capture_output=True)
print("ok")
