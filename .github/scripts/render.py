#!/usr/bin/env python3
"""Talk to the Render API using RENDER_API_KEY from the environment.

Never prints the API key, Authorization header, connection strings,
passwords, or environment-variable values.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://api.render.com/v1"
REDACT_KEYS = {
    "apikey",
    "api_key",
    "authorization",
    "connectionstring",
    "connection_string",
    "databaseurl",
    "database_url",
    "password",
    "secret",
    "token",
    "value",
}


def fail(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    sys.exit(code)


def key() -> str:
    token = os.environ.get("RENDER_API_KEY", "").strip()
    if not token:
        fail("RENDER_API_KEY is not set. Add it as a GitHub Actions secret.")
    return token


def request(method: str, path: str, body: dict | None = None) -> object:
    data = None
    headers = {
        "Authorization": "Bearer " + key(),
        "Accept": "application/json",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        fail("Render API " + method + " " + path + " failed with HTTP " + str(err.code))
    except urllib.error.URLError:
        fail("Render API request failed (network).")
    return {}


def redact(obj: object) -> object:
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k.lower().replace("-", "_") in REDACT_KEYS:
                out[k] = "[redacted]"
            else:
                out[k] = redact(v)
        return out
    if isinstance(obj, list):
        return [redact(item) for item in obj]
    return obj


def items(payload: object) -> list:
    if isinstance(payload, list):
        return payload
    return []


def cmd_inspect() -> None:
    services = items(request("GET", "/services?limit=50"))
    print("services: " + str(len(services)))
    for row in services:
        svc = row.get("service") if isinstance(row, dict) else None
        if not isinstance(svc, dict):
            continue
        print(
            "  "
            + str(svc.get("id", ""))
            + "  "
            + str(svc.get("type", ""))
            + "  "
            + str(svc.get("name", ""))
            + "  "
            + str((svc.get("serviceDetails") or {}).get("url") or svc.get("autoDeploy", ""))
        )

    postgres = items(request("GET", "/postgres?limit=50"))
    print("postgres: " + str(len(postgres)))
    for row in postgres:
        db = row.get("postgres") if isinstance(row, dict) else None
        if not isinstance(db, dict):
            continue
        print(
            "  "
            + str(db.get("id", ""))
            + "  "
            + str(db.get("name", ""))
            + "  "
            + str(db.get("status", ""))
            + "  "
            + str(db.get("version", ""))
        )


def cmd_deploy() -> None:
    service_id = os.environ.get("RENDER_SERVICE_ID", "").strip()
    if not service_id:
        fail("RENDER_SERVICE_ID is not set. Add it as a GitHub Actions variable or secret.")
    if not service_id.startswith("srv-"):
        fail("RENDER_SERVICE_ID looks invalid.")

    result = request("POST", "/services/" + service_id + "/deploys", {})
    deploy = result.get("deploy") if isinstance(result, dict) else None
    if not isinstance(deploy, dict):
        deploy = result if isinstance(result, dict) else {}
    deploy_id = str(deploy.get("id", ""))
    if not deploy_id:
        fail("Render did not return a deploy id.")
    print("deploy started: " + deploy_id)

    deadline = time.time() + 8 * 60
    while time.time() < deadline:
        current = request("GET", "/services/" + service_id + "/deploys/" + deploy_id)
        status = str(current.get("status", ""))
        print("deploy status: " + status)
        if status in {"live", "succeeded", "available"}:
            print("deploy finished: " + status)
            return
        if status in {"build_failed", "update_failed", "canceled", "deactivated"}:
            fail("deploy ended with status " + status)
        time.sleep(10)
    fail("deploy timed out")


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in {"inspect", "deploy"}:
        fail("usage: render.py inspect|deploy")
    if sys.argv[1] == "inspect":
        cmd_inspect()
    else:
        cmd_deploy()


if __name__ == "__main__":
    main()
