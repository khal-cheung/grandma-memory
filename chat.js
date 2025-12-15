/* chat.js — 文字 + 微信式语音条（本机 localStorage）
   需要页面元素：
   #chatList, #chatInput, #chatSendBtn, #chatEchoToggle, #chatClearBtn, #voiceBtn
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
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
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
    } catch { return []; }
  }
  function saveChat(list) { localStorage.setItem(CHAT_KEY, JSON.stringify(list)); }

  function newId() {
    return (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  }

  // ========= DOM =========
  const listEl = document.getElementById("chatList");
  const inputEl = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSendBtn");
  const echoToggle = document.getElementById("chatEchoToggle");
  const clearBtn = document.getElementById("chatClearBtn");
  const voiceBtn = document.getElementById("voiceBtn");

  if (!listEl || !inputEl || !sendBtn || !echoToggle || !clearBtn) {
    console.warn("[chat.js] 缺少必要元素：chatList/chatInput/chatSendBtn/chatEchoToggle/chatClearBtn");
    return;
  }

  // ========= 回声 =========
// ===== 更合乎逻辑的“奶奶回声” =====

// 1) 分类回复库（你可以继续加句子）
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

// 2) 关键词规则：根据“你说的话”判定类别
function classifyEcho(text) {
  const t = (text || "").toLowerCase();
  // 你问问题（以问号/怎么办/能不能结尾）
if (/[?？]$/.test(t) || /怎么办|能不能|可不可以|要不要/.test(t)) return "worry";

// 你说“今天/刚刚/刚才/我现在”（更像日记）
if (/今天|刚刚|刚才|我现在|现在/.test(t)) return "daily";
  // 想念/思念
  if (/想你|想您|想奶奶|miss|想念|思念|梦到/.test(t)) return "miss";

  // 疲惫/压力
  if (/累|疲惫|崩溃|好难|压力|烦|撑不住|加班/.test(t)) return "tired";

  // 开心/顺利
  if (/开心|高兴|顺利|成功|太好了|进步|好消息|完成了/.test(t)) return "happy";

  // 担心/焦虑/害怕
  if (/担心|焦虑|害怕|怕|紧张|不安|难受|心慌|怎么办/.test(t)) return "worry";

  // 身体/健康
  if (/发烧|咳嗽|头疼|肚子疼|不舒服|生病|睡不着|失眠|胃/.test(t)) return "health";

  // 道歉/内疚
  if (/对不起|抱歉|内疚|后悔|怪我|我不该/.test(t)) return "apology";

  // 夜晚/睡觉
  if (/晚安|睡了|好困|夜里|凌晨/.test(t)) return "night";

  // 其他日常叙述（没有明显情绪词时）
  if (t.length > 0) return "daily";

  return "default";
}

// 3) 按分类抽一句
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

      if ((it.kind || "text") === "text") {
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
      }

      if (it.kind === "audio") {
        const dur = Number.isFinite(it.durationSec) ? it.durationSec : Math.max(1, Math.round((it.durationMs || 0) / 1000));
        const dataUrl = it.dataUrl || "";
        const msgId = it.id || newId();

        html += `
          <div class="${sideClass}">
            <div class="chat-bubble">
              <div class="chat-audio-wrap">
                <button class="chat-audio-bar" type="button" data-audio-id="${msgId}">
                  <span class="audio-icon"></span>
                  <span class="audio-text">${dur}"</span>
                </button>
                <audio class="chat-audio-el" data-audio-el="${msgId}" preload="none" src="${dataUrl}"></audio>
              </div>
              <div class="chat-meta">
                <span class="chat-time">${time}</span>
              </div>
            </div>
          </div>
        `;
      }

      lastTs = ts;
    }

    listEl.innerHTML = html;
    bindAudioBars();
    listEl.scrollTop = listEl.scrollHeight;
  }

  function bindAudioBars() {
    const bars = listEl.querySelectorAll(".chat-audio-bar");
    bars.forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-audio-id");
        const audio = listEl.querySelector(`audio[data-audio-el="${id}"]`);
        if (!audio) return;

        // 先暂停其它正在播放的
        listEl.querySelectorAll("audio.chat-audio-el").forEach((a) => {
          if (a !== audio) { a.pause(); a.currentTime = 0; }
        });
        listEl.querySelectorAll(".chat-audio-bar").forEach((b) => b.classList.remove("is-playing"));

        // 播放/暂停
        if (audio.paused) {
          audio.play().then(() => btn.classList.add("is-playing")).catch(() => {
            alert("这条语音在当前浏览器无法播放。建议在 Netlify（https）环境、手机 Safari 播放。");
          });
        } else {
          audio.pause();
          btn.classList.remove("is-playing");
        }

        audio.onended = () => btn.classList.remove("is-playing");
      };
    });
  }

  // ========= 写入 =========
  function addText(role, text) {
    const trimmed = (text || "").trim();
    if (!trimmed) return;

    const list = loadChat();
    list.push({ id: newId(), role, kind: "text", text: trimmed, ts: Date.now() });
    saveChat(list);
    render();
  }

  function addAudio(role, dataUrl, durationMs) {
    if (!dataUrl) return;

    const sec = Math.max(1, Math.round((durationMs || 0) / 1000));
    const list = loadChat();
    list.push({ id: newId(), role, kind: "audio", dataUrl, durationMs: durationMs || 0, durationSec: sec, ts: Date.now() });
    saveChat(list);
    render();
  }

  // ========= 发送文字 =========
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

  // ========= 清空 =========
  clearBtn.addEventListener("click", () => {
    const ok = confirm("确定要清空这台设备上的聊天日记吗？此操作不可恢复。");
    if (!ok) return;
    localStorage.removeItem(CHAT_KEY);
    render();
  });

  // ========= 语音录制（Safari 优先 audio/mp4） =========
  let mediaRecorder = null;
  let chunks = [];
  let recStartAt = 0;
  let streamRef = null;

  function pickMimeType() {
    // Safari：audio/mp4 更稳；Chrome：webm/opus
    const candidates = [
      "audio/mp4",
      "audio/webm;codecs=opus",
      "audio/webm",
    ];
    if (!window.MediaRecorder?.isTypeSupported) return "";
    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  function setVoiceUI(on) {
    if (!voiceBtn) return;
    if (on) {
      voiceBtn.classList.add("is-recording");
      voiceBtn.textContent = "松开结束";
    } else {
      voiceBtn.classList.remove("is-recording");
      voiceBtn.textContent = "按住说话";
    }
  }

  async function startRecording() {
    if (!voiceBtn) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("当前浏览器不支持录音。建议用手机 Safari / Chrome，并确保 https。");
      return;
    }
    if (mediaRecorder && mediaRecorder.state === "recording") return;

    try {
      streamRef = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks = [];
      recStartAt = Date.now();

      const mimeType = pickMimeType();
      mediaRecorder = mimeType ? new MediaRecorder(streamRef, { mimeType }) : new MediaRecorder(streamRef);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const durationMs = Date.now() - recStartAt;

        // 太短就丢弃（像微信）
        if (durationMs < 450) {
          cleanupStream();
          setVoiceUI(false);
          return;
        }

        const type = mediaRecorder.mimeType || "audio/mp4";
        const blob = new Blob(chunks, { type });

        const dataUrl = await blobToDataUrl(blob);
        addAudio("me", dataUrl, durationMs);

        if (echoToggle.checked) {
          setTimeout(() => addText("granny", pickEcho()), 450);
        }

        cleanupStream();
        setVoiceUI(false);
      };

      mediaRecorder.start();
      setVoiceUI(true);
    } catch (err) {
      console.warn("录音失败：", err);
      alert("录音失败：请允许麦克风权限，并确保使用 https 或 localhost 打开网页。");
      cleanupStream();
      setVoiceUI(false);
    }
  }

  function stopRecording() {
    try {
      if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
      else { cleanupStream(); setVoiceUI(false); }
    } catch { cleanupStream(); setVoiceUI(false); }
  }

  function cleanupStream() {
    if (streamRef) {
      streamRef.getTracks().forEach((t) => t.stop());
      streamRef = null;
    }
    mediaRecorder = null;
    chunks = [];
    recStartAt = 0;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(blob);
    });
  }

  if (voiceBtn) {
    voiceBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); startRecording(); });
    window.addEventListener("pointerup", () => stopRecording());
    window.addEventListener("pointercancel", () => stopRecording());
    voiceBtn.addEventListener("contextmenu", (e) => e.preventDefault());
    setVoiceUI(false);
  }

  render();
})();