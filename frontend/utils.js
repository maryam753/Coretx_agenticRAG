// Same format as build_chat_export() in the Streamlit app.
export function buildChatExport(messages) {
  const lines = ["# Cortex — Conversation Export\n"];
  for (let i = 0; i < messages.length; i += 2) {
    const user = messages[i];
    const bot = messages[i + 1];
    lines.push(`**You:** ${user.content}\n`);
    if (bot) {
      lines.push(`**Cortex:** ${bot.content}\n`);
      if (bot.sources?.length) {
        const rows = bot.sources.map((s) => `- ${s.source}, p. ${s.page}`).join("\n");
        lines.push(`Sources:\n${rows}\n`);
      }
    }
    lines.push("---\n");
  }
  return lines.join("\n");
}

export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}