#!/usr/bin/env python3
import requests, base64, json

# Screenshots to analyze
imgs = [
    r"C:\Users\15403\.qwenpaw\workspaces\Arona\media\6205795f85c341799140181b5c966522_image.png",
    r"C:\Users\15403\.qwenpaw\workspaces\Arona\media\361f7a8df8f6407c95a9bf767654bfb2_image.png",
]

content = [{"type": "text", "text": "These are screenshots of model benchmark detail pages. Please analyze EACH screenshot carefully and list ALL visible problems: broken HTML, wrong numbers, missing data, layout issues, incorrect text, mangled text, anything that looks wrong. Be very specific.编号为1和2。"}]

for i, img_path in enumerate(imgs):
    with open(img_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    content.append({"type": "text", "text": f"Screenshot {i+1}:"})
    content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}})

resp = requests.post("http://100.119.28.90:8088/v1/chat/completions", json={
    "model": "Qwen3.6-35B-A3B-uncensored-heretic-APEX-I-Compact",
    "messages": [{"role": "user", "content": content}],
    "max_tokens": 2000,
    "temperature": 0.3,
}, timeout=120)

result = resp.json()
print(result["choices"][0]["message"]["content"])
