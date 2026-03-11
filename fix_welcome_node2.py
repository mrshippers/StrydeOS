#!/usr/bin/env python3
"""
Fetches the conversation flow, finds the Welcome Node,
patches the greeting text, and pushes it back.
Run: python3 fix_welcome_node2.py
"""

import urllib.request
import urllib.error
import json
import getpass
import ssl
import copy

FLOW_ID = "conversation_flow_5039815024e0"
NEW_WELCOME_TEXT = "Good morning, Spires Physiotherapy West Hampstead, Ava speaking. How can I help you?"

ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE


def api(api_key, method, path, payload=None):
    url = f"https://api.retellai.com{path}"
    data = json.dumps(payload).encode() if payload else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, context=ssl_context) as resp:
            return json.loads(resp.read().decode()), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}: {e.read().decode()}"


def main():
    print("=== Fix Welcome Node (Flow) ===")
    api_key = getpass.getpass("Enter your Retell API key: ").strip()

    print(f"Fetching flow {FLOW_ID}...")
    flow, err = api(api_key, "GET", f"/get-conversation-flow/{FLOW_ID}")
    if err:
        print(f"❌ {err}")
        return

    # Save dump for inspection
    with open("flow_dump.json", "w") as f:
        json.dump(flow, f, indent=2)
    print("Flow saved to flow_dump.json")

    nodes = flow.get("nodes", [])
    print(f"Found {len(nodes)} nodes.\n")

    patched = False
    for node in nodes:
        nid = node.get("id", "")
        ntype = node.get("type", "")
        name = node.get("name", "") or nid

        # Print each node for visibility
        content_preview = ""
        for key in ["content", "prompt", "text", "message"]:
            val = node.get(key, "")
            if val:
                content_preview = str(val)[:100]
                break
        print(f"  [{ntype}] {name!r}: {content_preview}")

        # Match welcome node
        is_welcome = (
            "welcome" in name.lower()
            or "welcome" in nid.lower()
            or "retell health" in content_preview.lower()
            or ("how can i help you today" in content_preview.lower() and "retell" in content_preview.lower())
        )

        if is_welcome:
            print(f"\n  ✅ Patching: {name!r}")
            for key in ["content", "prompt", "text", "message"]:
                if key in node:
                    node[key] = NEW_WELCOME_TEXT
                    patched = True

    if not patched:
        print("\n⚠️  Could not auto-identify welcome node.")
        print("Check flow_dump.json — look for the node with 'Retell Health' in the text.")
        print("Tell me the node 'id' field and I'll patch it directly.")
        return

    # Push update
    patch_payload = {"nodes": nodes}
    print("\nPushing patched flow...")
    result, err = api(api_key, "PATCH", f"/update-conversation-flow/{FLOW_ID}", patch_payload)
    if err:
        print(f"❌ {err}")
    else:
        print("✅ Welcome node patched successfully.")


if __name__ == "__main__":
    main()
