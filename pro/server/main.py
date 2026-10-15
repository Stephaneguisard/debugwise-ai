"""DebugWise Pro server: teacher accounts, class codes, record collection, Claude proxy.

Run:  uvicorn server.main:app --reload
Env:  ANTHROPIC_API_KEY   optional; enables the server-side Claude proxy (students need no key)
      TEACHER_INVITE      optional; if set, teacher registration requires this code
      DB_PATH             SQLite file (default: data/debugwise.db)
"""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from collections import defaultdict, deque
from contextlib import contextmanager
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "server" / "static"
DB_PATH = Path(os.environ.get("DB_PATH", ROOT / "data" / "debugwise.db"))
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
INVITE = os.environ.get("TEACHER_INVITE", "")
MODELS = {"claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"}
MAX_RECORD_BYTES = 300_000
TOKEN_TTL = 30 * 24 * 3600

app = FastAPI(title="DebugWise Pro")


# ---------------------------------------------------------------- database
@contextmanager
def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init_db():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS teachers(
            id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt BLOB NOT NULL, pw BLOB NOT NULL,
            class_code TEXT UNIQUE NOT NULL, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS tokens(
            hash TEXT PRIMARY KEY, teacher_id INTEGER NOT NULL, created REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS records(
            id TEXT PRIMARY KEY, class_code TEXT NOT NULL, student TEXT NOT NULL, task_id TEXT NOT NULL,
            task_title TEXT NOT NULL, payload TEXT NOT NULL, shared_at REAL NOT NULL,
            UNIQUE(class_code, student, task_id));
        CREATE INDEX IF NOT EXISTS rec_class ON records(class_code, shared_at);
        """)


init_db()


# ---------------------------------------------------------------- helpers
def hash_pw(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)


def sha(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def new_class_code(c) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        if not c.execute("SELECT 1 FROM teachers WHERE class_code=?", (code,)).fetchone():
            return code


_hits = defaultdict(deque)


def rate_limit(key: str, limit: int, window: int):
    now = time.time()
    q = _hits[key]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Too many requests. Try again later.")
    q.append(now)


def ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?")


def current_teacher(authorization: str = Header(default="")):
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Not signed in")
    with db() as c:
        row = c.execute(
            "SELECT t.id, t.email, t.class_code, k.created FROM tokens k JOIN teachers t ON t.id=k.teacher_id WHERE k.hash=?",
            (sha(token),)).fetchone()
    if not row or time.time() - row["created"] > TOKEN_TTL:
        raise HTTPException(401, "Session expired. Sign in again.")
    return dict(row)


def issue_token(c, teacher_id: int) -> str:
    token = secrets.token_urlsafe(32)
    c.execute("INSERT INTO tokens(hash, teacher_id, created) VALUES(?,?,?)", (sha(token), teacher_id, time.time()))
    return token


# ---------------------------------------------------------------- schemas
class Creds(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8, max_length=200)
    invite: str = ""


class Submit(BaseModel):
    class_code: str = Field(min_length=4, max_length=12)
    record: dict


class ClaudeReq(BaseModel):
    prompt: str = Field(min_length=1, max_length=24_000)
    max_tokens: int = Field(default=900, ge=1, le=1200)
    model: str = "claude-sonnet-5-5"


# ---------------------------------------------------------------- API
@app.get("/api/config")
def config():
    return {"server": True, "ai": bool(ANTHROPIC_KEY), "invite_required": bool(INVITE)}


@app.post("/api/teacher/register")
def register(body: Creds, request: Request):
    rate_limit("reg:" + ip(request), 10, 3600)
    if INVITE and not hmac.compare_digest(body.invite, INVITE):
        raise HTTPException(403, "Wrong invite code")
    email = body.email.strip().lower()
    salt = secrets.token_bytes(16)
    with db() as c:
        if c.execute("SELECT 1 FROM teachers WHERE email=?", (email,)).fetchone():
            raise HTTPException(409, "That email is already registered")
        code = new_class_code(c)
        cur = c.execute("INSERT INTO teachers(email, salt, pw, class_code, created) VALUES(?,?,?,?,?)",
                        (email, salt, hash_pw(body.password, salt), code, time.time()))
        token = issue_token(c, cur.lastrowid)
    return {"token": token, "email": email, "class_code": code}


@app.post("/api/teacher/login")
def login(body: Creds, request: Request):
    rate_limit("login:" + ip(request), 20, 600)
    email = body.email.strip().lower()
    with db() as c:
        t = c.execute("SELECT * FROM teachers WHERE email=?", (email,)).fetchone()
        if not t or not hmac.compare_digest(hash_pw(body.password, t["salt"]), t["pw"]):
            raise HTTPException(401, "Wrong email or password")
        token = issue_token(c, t["id"])
    return {"token": token, "email": email, "class_code": t["class_code"]}


@app.get("/api/teacher/me")
def me(t=Depends(current_teacher)):
    return {"email": t["email"], "class_code": t["class_code"]}


@app.post("/api/records")
def submit_record(body: Submit, request: Request):
    """Students submit without an account; the class code is what authorises the write."""
    rate_limit("rec:" + ip(request), 30, 600)
    code = body.class_code.strip().upper()
    rec = body.record
    if len(json.dumps(rec)) > MAX_RECORD_BYTES:
        raise HTTPException(413, "Record too large")
    student, task_id, title = str(rec.get("student", "")).strip()[:80], str(rec.get("taskId", ""))[:80], str(rec.get("taskTitle", ""))[:200]
    if not student or not task_id or not isinstance(rec.get("progress"), dict):
        raise HTTPException(422, "Not a DebugWise record")
    with db() as c:
        if not c.execute("SELECT 1 FROM teachers WHERE class_code=?", (code,)).fetchone():
            raise HTTPException(404, "Unknown class code")
        rid = "s" + sha(f"{code}|{student}|{task_id}")[:16]
        shared = float(rec.get("sharedAt") or time.time() * 1000)
        c.execute("""INSERT INTO records(id, class_code, student, task_id, task_title, payload, shared_at)
                     VALUES(?,?,?,?,?,?,?)
                     ON CONFLICT(class_code, student, task_id)
                     DO UPDATE SET payload=excluded.payload, task_title=excluded.task_title, shared_at=excluded.shared_at""",
                  (rid, code, student, task_id, title, json.dumps(rec), shared))
    return {"ok": True, "id": rid}


@app.get("/api/records")
def list_records(t=Depends(current_teacher)):
    with db() as c:
        rows = c.execute("SELECT id, payload FROM records WHERE class_code=? ORDER BY shared_at DESC LIMIT 500",
                         (t["class_code"],)).fetchall()
    out = []
    for r in rows:
        rec = json.loads(r["payload"])
        rec["id"] = r["id"]
        rec["server"] = True
        out.append(rec)
    return {"records": out}


@app.delete("/api/records/{rid}")
def delete_record(rid: str, t=Depends(current_teacher)):
    with db() as c:
        n = c.execute("DELETE FROM records WHERE id=? AND class_code=?", (rid, t["class_code"])).rowcount
    if not n:
        raise HTTPException(404, "Not found")
    return {"ok": True}


@app.post("/api/claude")
async def claude(body: ClaudeReq, request: Request):
    """Server-side Claude proxy so students never need (or see) an API key."""
    if not ANTHROPIC_KEY:
        raise HTTPException(503, "AI is not enabled on this server")
    if body.model not in MODELS:
        raise HTTPException(422, "Unknown model")
    rate_limit("ai:" + ip(request), 40, 3600)
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post("https://api.anthropic.com/v1/messages",
                              headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01",
                                       "content-type": "application/json"},
                              json={"model": body.model, "max_tokens": body.max_tokens,
                                    "messages": [{"role": "user", "content": body.prompt}]})
    if r.status_code != 200:
        raise HTTPException(502, f"Upstream {r.status_code}")
    text = "".join(b.get("text", "") for b in r.json().get("content", []))
    return {"text": text}


# ---------------------------------------------------------------- static site
@app.get("/")
def index():
    f = STATIC / "index.html"
    if not f.exists():
        raise HTTPException(500, "Run `python3 web/build.py` first")
    return FileResponse(f)
