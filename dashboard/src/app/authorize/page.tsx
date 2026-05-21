export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string>>;
}

export default async function AuthorizePage({ searchParams }: Props) {
  const p = await searchParams;
  const {
    response_type,
    redirect_uri,
    code_challenge,
    code_challenge_method = "S256",
    state,
    client_id = "",
    error,
  } = p;

  if (response_type !== "code" || !redirect_uri || !code_challenge || !state) {
    return <ErrorPage message="Invalid authorization request." />;
  }

  let redirectHost: string;
  try {
    const url = new URL(redirect_uri);
    if (!url.hostname.endsWith("claude.ai")) throw new Error();
    redirectHost = url.hostname;
  } catch {
    return <ErrorPage message="Unauthorized redirect URI." />;
  }

  return (
    <main
      style={{
        background: "#0B2545",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Outfit, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 16,
          padding: "32px 36px",
          width: 380,
          boxShadow: "0 8px 48px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            background: "#1C54F2",
            borderRadius: 10,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7v5c0 5.55 4.18 10.74 10 12 5.82-1.26 10-6.45 10-12V7L12 2z"
              fill="white"
            />
          </svg>
        </div>
        <h1
          style={{ fontSize: 18, fontWeight: 700, marginBottom: 6, color: "#0B2545" }}
        >
          Authorize stryde-ops
        </h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24, lineHeight: 1.5 }}>
          <strong style={{ color: "#111" }}>{redirectHost}</strong> is requesting
          access to your StrydeOS clinic data. Enter your MCP token to approve.
        </p>

        {error === "invalid_token" && (
          <p
            style={{
              fontSize: 13,
              color: "#dc2626",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 16,
            }}
          >
            Invalid token. Try again.
          </p>
        )}

        <form action="/api/mcp/authorize" method="POST">
          <input type="hidden" name="redirect_uri" value={redirect_uri} />
          <input type="hidden" name="code_challenge" value={code_challenge} />
          <input type="hidden" name="code_challenge_method" value={code_challenge_method} />
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="client_id" value={client_id} />
          <input
            type="password"
            name="token"
            placeholder="MCP token"
            required
            autoFocus
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1.5px solid #d1d5db",
              marginBottom: 14,
              fontSize: 14,
              fontFamily: "Outfit, system-ui, sans-serif",
              boxSizing: "border-box",
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "11px 0",
              background: "#1C54F2",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "Outfit, system-ui, sans-serif",
            }}
          >
            Approve
          </button>
        </form>
      </div>
    </main>
  );
}

function ErrorPage({ message }: { message: string }) {
  return (
    <main
      style={{
        background: "#0B2545",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "Outfit, system-ui, sans-serif",
        color: "white",
      }}
    >
      <p style={{ opacity: 0.7 }}>{message}</p>
    </main>
  );
}
