/* chat.js — 文字聊天日记（本机 localStorage，无语音版）
   需要页面元素：
   #chatList, #chatInput, #chatSendBtn, #chatEchoToggle, #chatClearBtn
*/

(function () {
  const CHAT_KEY = "grandma_chat_diary_v3";

  // ========= 工具 =========
  const pad2 = (n) => String(n).padStart(2, "0");

  function formatTime(ts) {
    const d = new Date(ts);
    const hh = d.getHours();
    const mm = d.getMinutes();
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function isSameDay(a, b) {
    const da = new Date(a), db = new Date(b);
    return (
      da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate()
    );
  }
  function isToday(ts) { return isSameDay(ts, Date.now()); }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function loadChat() {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function saveChat(list) {
    localStorage.setItem(CHAT_KEY, JSON.stringify(list));
  }

  function newId() {
    return (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  }

  // ========= DOM =========
  const listEl = document.getElementById("chatList");
  const inputEl = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSendBtn");
  const echoToggle = document.getElementById("chatEchoToggle");
  const clearBtn = document.getElementById("chatClearBtn");

  if (!listEl || !inputEl || !sendBtn || !echoToggle || !clearBtn) {
    console.warn("[chat.js] 缺少必要元素：chatList/chatInput/chatSendBtn/chatEchoToggle/chatClearBtn");
    return;
  }

  // ========= 回声 =========
  const ECHO_BANK = {
    miss: [
      "我也想你。你在，我就安心。",
      "想我就来这里说说话，我听着。",
      "别难过，我们的牵挂一直都在。"
    ],
    tired: [
      "今天辛苦了。先歇一歇，别硬扛。",
      "累了就早点休息，身体最要紧。",
      "慢慢来，不急。你已经很好了。"
    ],
    happy: [
      "听你这么说，我也跟着高兴。",
      "好事要记住，心里就亮堂。",
      "你开心，我就放心。"
    ],
    worry: [
      "别慌，先把最重要的一件事做好。",
      "事情会过去的，你慢慢说给我听。",
      "你不是一个人，先稳住。"
    ],
    health: [
      "记得吃饭、喝水，别饿着。",
      "天冷了就添衣，别着凉。",
      "不舒服就别忍，能休息就休息。"
    ],
    apology: [
      "傻孩子，不用道歉。我在呢。",
      "没事的，能说出来就很好了。",
      "我不怪你，你照顾好自己就行。"
    ],
    daily: [
      "嗯，我听见了。把今天记下来就很好。",
      "你说的这些，我都记在心里。",
      "慢慢写，不用赶。"
    ],
    night: [
      "夜深了，早点睡。梦里也会见。",
      "别熬太晚，明天还要有力气。",
      "关灯前来一句就好，我收到了。"
    ],
    default: [
      "我在呢，慢慢说。",
      "我听见了。",
      "你写下的，我都收到了。"
    ]
  };

  function classifyEcho(text) {
    const t = (text || "").toLowerCase();

    if (/[?？]$/.test(t) || /怎么办|能不能|可不可以|要不要/.test(t)) return "worry";
    if (/今天|刚刚|刚才|我现在|现在/.test(t)) return "daily";
    if (/想你|想您|想奶奶|miss|想念|思念|梦到/.test(t)) return "miss";
    if (/累|疲惫|崩溃|好难|压力|烦|撑不住|加班/.test(t)) return "tired";
    if (/开心|高兴|顺利|成功|太好了|进步|好消息|完成了/.test(t)) return "happy";
    if (/担心|焦虑|害怕|怕|紧张|不安|难受|心慌/.test(t)) return "worry";
    if (/发烧|咳嗽|头疼|肚子疼|不舒服|生病|睡不着|失眠|胃/.test(t)) return "health";
    if (/对不起|抱歉|内疚|后悔|怪我|我不该/.test(t)) return "apology";
    if (/晚安|睡了|好困|夜里|凌晨/.test(t)) return "night";

    if (t.length > 0) return "daily";
    return "default";
  }

  function pickEcho(userText) {
    const key = classifyEcho(userText);
    const pool = ECHO_BANK[key] || ECHO_BANK.default;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ========= 渲染 =========
  function render() {
    const items = loadChat().sort((a, b) => (a.ts || 0) - (b.ts || 0));

    if (!items.length) {
      listEl.innerHTML = `<div class="chat-empty">还没有记录。你可以像发微信一样，写下今天想对奶奶说的话。</div>`;
      return;
    }

    let html = "";
    let lastTs = 0;

    for (const it of items) {
      const ts = it.ts || Date.now();

      if (!lastTs || !isSameDay(lastTs, ts)) {
        const label = isToday(ts) ? "今天" : formatDate(ts);
        html += `<div class="chat-day"><span>${label}</span></div>`;
      }

      const role = it.role === "granny" ? "granny" : "me";
      const sideClass = role === "me" ? "chat-msg me" : "chat-msg granny";
      const time = formatTime(ts);

      const safeText = escapeHtml(it.text || "").replaceAll("\n", "<br>");
      html += `
        <div class="${sideClass}">
          <div class="chat-bubble">
            <div class="chat-text">${safeText}</div>
            <div class="chat-meta">
              <span class="chat-time">${time}</span>
            </div>
          </div>
        </div>
      `;

      lastTs = ts;
    }

    listEl.innerHTML = html;
    listEl.scrollTop = listEl.scrollHeight;
  }

  function addText(role, text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return;

    const list = loadChat();
    list.push({ id: newId(), role, kind: "text", text: trimmed, ts: Date.now() });
    saveChat(list);
    render();
  }

  function handleSendText() {
    const text = inputEl.value;
    if (!text.trim()) return;

    addText("me", text);
    inputEl.value = "";

    if (echoToggle.checked) {
      const userText = text;
      setTimeout(() => addText("granny", pickEcho(userText)), 450);
    }
  }

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  });
  sendBtn.addEventListener("click", handleSendText);

  clearBtn.addEventListener("click", () => {
    const ok = confirm("确定要清空这台设备上的聊天日记吗？此操作不可恢复。");
    if (!ok) return;
    localStorage.removeItem(CHAT_KEY);
    render();
  });

  window.addEventListener("grandma:chat:rerender", () => {
    try { render(); } catch (e) {}
  });

  render();
})();