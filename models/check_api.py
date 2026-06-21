#!/usr/bin/env python3
import requests, base64, json

# Check what models are available
try:
    r = requests.get("http://localhost:8088/v1/models", timeout=5)
    print("Available models:", json.dumps(r.json(), indent=2)[:500])
except Exception as e:
    print(f"Error: {e}")
