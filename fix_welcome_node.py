#!/usr/bin/env python3
"""
Fetches the Ava agent, finds the Welcome Node,
and updates its text to the correct Spires greeting.
Run: python3 fix_welcome_node.py
"""

import urllib.request
import urllib.error
import json
import getpass
import ssl
import copy

AGENT_ID = "agent_3844b26e816cf5cf01409b502b"
NEW_WELCOME_TEXT = "Good morning, Spires Physiotherapy West Hampstead, Ava speaking. How can I help you?"

ssl_context = ssl.create_default_context()
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE


def fetch_agent(api_key):
    url = f"https://api.retellai.com/get-agent/{AGENT_ID}"
    req = urllib.request.Request(
        url,
        method="GET",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req, context=ssl_context) as resp:
        return json.loads(resp.read().decode())


def patch_agent(api_key, payload):
    url = f"https://api.retellai.com/update-agent/{AGENT_ID}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="PATCH",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, context=ssl_context) as resp:
        return json.loads(resp.read().decode())


def main():
    print("=== Fix Welcome Node ===")
    api_key = getpass.getpass("Enter your Retell API key: ").strip()
    if not api_key:
        print("No API key. Exiting.")
        return

    print("Fetching agent...")
    try:
        agent = fetch_agent(api_key)
    except urllib.error.HTTPError as e:
        print(f"❌ HTTP {e.code}: {e.read().decode()}")
        return

    # Dump the raw agent so we can see the graph structure
    print("\n--- Raw agent graph (so we can see node keys) ---")
    graph = agent.get("graph") or agent.get("agent_graph") or {}
    nodes = (
        graph.get("nodes")
        or agent.get("nodes")
        or agent.get("flow", {}).get("nodes")
        or []
    )

    if not nodes:
        print("Could not find nodes in agent response. Raw keys:", list(agent.keys()))
        print("Full response saved to agent_dump.json")
        with open("agent_dump.json", "w") as f:
            json.dump(agent, f, indent=2)
        return

    print(f"Found {len(nodes)} nodes.")
    updated = False
    for node in nodes:
        name = node.get("name", "") or node.get("id", "")
        content = node.get("content", "") or node.get("prompt", "") or ""
        print(f"  Node: {name!r} — {str(content)[:80]}")

        # Match welcome node by name or content
        if "welcome" in name.lower() or "retell health" in content.lower() or "how can i help you today" in content.lower():
            print(f"\n  ✅ Patching node: {name!r}")
            if "content" in node:
                node["content"] = NEW_WELCOME_TEXT
            if "prompt" in node:
                node["prompt"] = NEW_WELCOME_TEXT
            updated = True

    if not updated:
        print("\n⚠️  Couldn't auto-identify the welcome node.")
        print("Check agent_dump.json and tell me the node name/id.")
        with open("agent_dump.json", "w") as f:
            json.dump(agent, f, indent=2)
        return

    # Push updated nodes back
    # Try different payload shapes depending on what the agent uses
    payload = {}
    if "graph" in agent:
        new_graph = copy.deepcopy(agent["graph"])
        new_graph["nodes"] = nodes
        payload["graph"] = new_graph
    elif "agent_graph" in agent:
        new_graph = copy.deepcopy(agent["agent_graph"])
        new_graph["nodes"] = nodes
        payload["agent_graph"] = new_graph
    elif "nodes" in agent:
        payload["nodes"] = nodes
    else:
        payload["flow"] = {"nodes": nodes}

    print("\nPushing update...")
    try:
        result = patch_agent(api_key, payload)
        print("✅ Welcome node updated successfully.")
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"❌ HTTP {e.code}: {err}")
        print("Saving dump to agent_dump.json for inspection.")
        with open("agent_dump.json", "w") as f:
            json.dump(agent, f, indent=2)


if __name__ == "__main__":
    main()
