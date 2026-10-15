import json, pathlib
src = pathlib.Path(__file__).parent / "src"
dist = pathlib.Path(__file__).parent / "dist"
dist.mkdir(exist_ok=True)
t = (src / "template.html").read_text()
css = (src / "style.css").read_text() + (src / "extra.css").read_text()
engine = json.dumps((src / "engine.py").read_text()).replace("</", "<\\/")
app = (src / "app.js").read_text()
out = t.replace("{{STYLE}}", css).replace("{{ENGINE_JSON}}", engine).replace("{{APP_JS}}", app)
(dist / "index.html").write_text(out)
(dist / ".nojekyll").write_text("")
print("built", len(out))
