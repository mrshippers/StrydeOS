/**
 * Telegram alert utility for Ava critical notifications.
 *
 * Sends a message to the configured Telegram bot/chat.
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in env vars.
 * Silently no-ops when env vars are absent (development/test environments).
 */

export interface TelegramAlertPayload {
  /** Identifies the alert origin for filtering/routing in the Telegram bot */
  context: string;
  /** Human-readable alert message */
  message: string;
}

/**
 * Fires a Telegram alert message. Non-throwing — any delivery failure is
 * caught and logged so callers can treat it as fire-and-forget.
 */
export async function sendTelegramAlert(payload: TelegramAlertPayload): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return;

  const text = `[${payload.context}]\n${payload.message}`;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch {
    // Non-blocking — log only, never throw
    console.error("[Ava] Telegram alert delivery failed:", payload.context);
  }
}
