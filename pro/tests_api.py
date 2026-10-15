"""Smoke test of the API. Run: DB_PATH=/tmp/dw_test.db .venv/bin/python tests_api.py"""
import json, os
from fastapi.testclient import TestClient
from server.main import app

c = TestClient(app)
assert c.get("/api/config").json()["server"] is True
assert c.get("/").status_code == 200
r = c.post("/api/teacher/register", json={"email": "T@x.com", "password": "password1"}); assert r.status_code == 200, r.text
tok, code = r.json()["token"], r.json()["class_code"]
assert c.post("/api/teacher/register", json={"email": "t@x.com", "password": "password1"}).status_code == 409
assert c.post("/api/teacher/login", json={"email": "t@x.com", "password": "wrongwrong"}).status_code == 401
H = {"authorization": "Bearer " + tok}
rec = {"v": 1, "student": "Ann", "taskId": "class-average", "taskTitle": "Class average", "sharedAt": 1, "progress": {"hypotheses": [], "flags": []}}
assert c.post("/api/records", json={"class_code": "ZZZZZZ", "record": rec}).status_code == 404
assert c.post("/api/records", json={"class_code": code.lower(), "record": rec}).status_code == 200
rec["sharedAt"] = 2
assert c.post("/api/records", json={"class_code": code, "record": rec}).status_code == 200   # upsert, not duplicate
assert c.post("/api/records", json={"class_code": code, "record": {"student": "x"}}).status_code == 422
assert c.get("/api/records").status_code == 401
recs = c.get("/api/records", headers=H).json()["records"]; assert len(recs) == 1 and recs[0]["sharedAt"] == 2
# another teacher cannot see or delete it
t2 = c.post("/api/teacher/register", json={"email": "b@x.com", "password": "password2"}).json()
H2 = {"authorization": "Bearer " + t2["token"]}
assert c.get("/api/records", headers=H2).json()["records"] == []
assert c.delete("/api/records/" + recs[0]["id"], headers=H2).status_code == 404
assert c.delete("/api/records/" + recs[0]["id"], headers=H).status_code == 200
assert c.post("/api/claude", json={"prompt": "hi"}).status_code == 503   # no key configured
print("API OK")
