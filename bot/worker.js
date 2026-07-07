// Telegram-бот для правок сайта tenzorlab.ru.
// Принимает webhook от Telegram, проверяет отправителя по allowlist
// и запускает GitHub Actions (repository_dispatch), где Claude Code вносит правку.

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("ok");

    const url = new URL(request.url);
    if (url.pathname !== "/webhook") return new Response("not found", { status: 404 });

    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    const update = await request.json();
    const msg = update.message;
    if (!msg || !msg.text || msg.chat.type !== "private") return new Response("ok");

    const chatId = msg.chat.id;
    const send = (text) =>
      fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });

    const allowed = env.ALLOWED_IDS.split(",").map((s) => s.trim());
    if (!allowed.includes(String(chatId))) {
      await send(`Нет доступа. Ваш ID: ${chatId} — передайте его администратору сайта.`);
      return new Response("ok");
    }

    const text = msg.text.trim();

    if (text === "/start" || text === "/help") {
      await send(
        "Я вношу правки на сайт tenzorlab.ru.\n\n" +
          "Просто напишите, что поменять, например:\n" +
          "• «поменяй телефон на +7 900 123-45-67»\n" +
          "• «в блоке цен поставь 45 000 ₽»\n" +
          "• «убери пункт про доставку»\n\n" +
          "Команда «откати» отменяет последнюю правку.\n" +
          "Правка появляется на сайте через 2–3 минуты."
      );
      return new Response("ok");
    }

    const isRollback = /^(откат|откати|отмени|отменить|верни как было|rollback)/i.test(text);

    const gh = await fetch(`https://api.github.com/repos/${env.GH_REPO}/dispatches`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.GH_TOKEN}`,
        accept: "application/vnd.github+json",
        "user-agent": "tenzorlab-bot",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: isRollback ? "site-rollback" : "site-edit",
        client_payload: { request: text, chat_id: String(chatId) },
      }),
    });

    if (gh.status === 204) {
      await send(
        isRollback
          ? "⏳ Откатываю последнюю правку…"
          : "⏳ Принял! Вношу правку — напишу, когда сайт обновится (обычно 2–3 минуты)."
      );
    } else {
      await send("⚠️ Не получилось запустить правку (ошибка связи с GitHub). Попробуйте позже.");
    }

    return new Response("ok");
  },
};
