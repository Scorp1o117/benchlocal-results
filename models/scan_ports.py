#!/usr/bin/env python3
import requests, json

ports = [8080, 8082, 8083, 8632, 8633, 8638, 8640]
for port in ports:
    try:
        r = requests.get(f"http://localhost:{port}/v1/models", timeout=3)
        if r.status_code == 200:
            data = r.json()
            names = [m.get("name", "?") for m in data.get("models", [])]
            print(f"Port {port}: {names}")
    except:
        pass
    try:
        r = requests.get(f"http://localhost:{port}/health", timeout=3)
        if r.status_code == 200:
            print(f"Port {port}: health OK")
    except:
        pass
