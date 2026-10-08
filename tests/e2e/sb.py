"""Tiny REST helper for the E2E test: signs in as the test lead once and caches the token.
Set DM_E2E_PASSWORD (and optionally DM_E2E_EMAIL) in the environment, or put DM_E2E_PASSWORD=... in the repo's ignored .env;
the password is never stored in a tracked file."""
import json, os, sys, time, urllib.request

if "DM_E2E_PASSWORD" not in os.environ:
    _env = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".env")
    if os.path.exists(_env):
        for _line in open(_env):
            if _line.startswith("DM_E2E_PASSWORD="):
                os.environ["DM_E2E_PASSWORD"] = _line.split("=", 1)[1].strip().strip('"')
U = "https://voatrqhfsdfjomyajovi.supabase.co"
K = "sb_publishable_shDVoGzgpaS2L9OTmzyRGA_JOx52p0I"
CACHE = "/tmp/dm-e2e-session.json"

def session():
    if os.path.exists(CACHE):
        s = json.load(open(CACHE))
        if s.get("expires_at", 0) > time.time() + 120:
            return s
    req = urllib.request.Request(U + "/auth/v1/token?grant_type=password", method="POST",
        data=json.dumps({"email": os.environ.get("DM_E2E_EMAIL", "studio-test@dmteam.local"),
                         "password": os.environ["DM_E2E_PASSWORD"]}).encode(),
        headers={"apikey": K, "Content-Type": "application/json"})
    s = json.load(urllib.request.urlopen(req))
    json.dump(s, open(CACHE, "w")); os.chmod(CACHE, 0o600)
    return s

def rest(path, method="GET", body=None, prefer=None):
    t = session()["access_token"]
    h = {"apikey": K, "Authorization": "Bearer " + t, "Content-Type": "application/json"}
    if prefer: h["Prefer"] = prefer
    req = urllib.request.Request(U + "/rest/v1/" + path, method=method, headers=h,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        r = urllib.request.urlopen(req); txt = r.read().decode()
        return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        return {"http_error": e.code, "body": e.read().decode()[:500]}

if __name__ == "__main__":
    print(json.dumps(rest(sys.argv[1]), indent=1)[:4000])
