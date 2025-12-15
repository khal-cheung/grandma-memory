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
  const voiceBtn = document.getElementById("voiceBtn");

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
        const dur = Number.isFinite(it.durationSec)
          ? it.durationSec
          : Math.max(1, Math.round((it.durationMs || 0) / 1000));
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

        // 暂停其它
        listEl.querySelectorAll("audio.chat-audio-el").forEach((a) => {
          if (a !== audio) { a.pause(); a.currentTime = 0; }
        });
        listEl.querySelectorAll(".chat-audio-bar").forEach((b) => b.classList.remove("is-playing"));

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
    list.push({
      id: newId(),
      role,
      kind: "audio",
      dataUrl,
      durationMs: durationMs || 0,
      durationSec: sec,
      ts: Date.now()
    });
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

  // ========= 语音录制（稳定版：iOS/桌面通用） =========
  let mediaRecorder = null;
  let chunks = [];
  let recStartAt = 0;
  let streamRef = null;

  let isRecording = false;   // 是否已进入录音态
  let isStopping = false;    // 防重复 stop
  let activeSession = 0;     // 每次录音自增，用于防止旧 onstop 乱入
  let capturedPointerId = null;

  function pickMimeType() {
    const candidates = [
      "audio/mp4",                // Safari 更稳
      "audio/webm;codecs=opus",   // Chrome
      "audio/webm"
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

  function cleanupStream() {
    try {
      if (streamRef) {
        streamRef.getTracks().forEach((t) => t.stop());
      }
    } catch (e) {}
    streamRef = null;
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

  async function startRecording() {
    if (!voiceBtn) return;
    if (isRecording) return;              // 防连点
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("当前浏览器不支持录音，请使用手机 Safari / Chrome（https）。");
      return;
    }

    isRecording = true;
    isStopping = false;
    chunks = [];
    recStartAt = Date.now();
    activeSession += 1;
    const sessionId = activeSession;

    try {
      streamRef = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = pickMimeType();
      mediaRecorder = mimeType ? new MediaRecorder(streamRef, { mimeType }) : new MediaRecorder(streamRef);

      mediaRecorder.ondataavailable = (e) => {
        if (e && e.data && e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onerror = () => {
        // iOS 上偶发 capture failure，统一走 stop 清理
        stopRecording();
      };

      mediaRecorder.onstop = async () => {
        // 防旧 session 的 onstop 误触发（比如权限弹窗导致的异步乱序）
        if (sessionId !== activeSession) return;

        const durationMs = Date.now() - recStartAt;

        // 复位 UI / 状态（无论成败）
        setVoiceUI(false);

        // 没录到数据
        if (!chunks.length) {
          cleanupStream();
          isRecording = false;
          isStopping = false;
          return;
        }

        // 太短丢弃（防误触）
        if (durationMs < 450) {
          cleanupStream();
          isRecording = false;
          isStopping = false;
          return;
        }

        // Safari 保护：mediaRecorder 可能已为 null
        const safeMime = (mediaRecorder && mediaRecorder.mimeType) ? mediaRecorder.mimeType : "audio/mp4";

        try {
          const blob = new Blob(chunks, { type: safeMime });
          const dataUrl = await blobToDataUrl(blob);

          // dataUrl 为空也不写入
          if (dataUrl && dataUrl.startsWith("data:")) {
            addAudio("me", dataUrl, durationMs);

            // 语音也回声
            if (echoToggle.checked) {
              setTimeout(() => addText("granny", pickEcho("（语音）")), 450);
            }
          }
        } catch (err) {
          console.warn("voice onstop error:", err);
        } finally {
          cleanupStream();
          isRecording = false;
          isStopping = false;
        }
      };

      mediaRecorder.start();
      setVoiceUI(true);

    } catch (err) {
      console.warn("录音失败：", err);
      cleanupStream();
      isRecording = false;
      isStopping = false;
      setVoiceUI(false);
      alert("录音失败：请允许麦克风权限，并确保使用 https 或 localhost 打开网页。");
    }
  }

  function stopRecording() {
    if (!isRecording || isStopping) return;
    if (!mediaRecorder) {
      cleanupStream();
      isRecording = false;
      isStopping = false;
      setVoiceUI(false);
      return;
    }

    isStopping = true;

    try {
      // Safari 有时需要先 requestData
      try { mediaRecorder.requestData(); } catch (e) {}

      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      } else {
        cleanupStream();
        isRecording = false;
        isStopping = false;
        setVoiceUI(false);
      }
    } catch (e) {
      cleanupStream();
      isRecording = false;
      isStopping = false;
      setVoiceUI(false);
    }
  }

  // iOS：切后台 / 锁屏 / 页面隐藏时，必须 stop，否则容易卡“正在录音”
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopRecording();
  });
  window.addEventListener("pagehide", () => stopRecording());

  // ========= 绑定语音按钮：只用 pointer，且 capture 指针，保证松手能收到 =========
  if (voiceBtn) {
    voiceBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();

      // 指针捕获：避免手指移出按钮后收不到 pointerup
      try {
        capturedPointerId = e.pointerId;
        voiceBtn.setPointerCapture(capturedPointerId);
      } catch (err) {
        capturedPointerId = null;
      }

      startRecording();
    }, { passive: false });

    voiceBtn.addEventListener("pointerup", (e) => {
      e.preventDefault();
      stopRecording();

      // 释放捕获
      try {
        if (capturedPointerId != null) voiceBtn.releasePointerCapture(capturedPointerId);
      } catch (err) {}
      capturedPointerId = null;
    }, { passive: false });

    voiceBtn.addEventListener("pointercancel", (e) => {
      stopRecording();
      try {
        if (capturedPointerId != null) voiceBtn.releasePointerCapture(capturedPointerId);
      } catch (err) {}
      capturedPointerId = null;
    });

    voiceBtn.addEventListener("pointerleave", () => {
      // 微信式：离开也结束
      stopRecording();
    });

    voiceBtn.addEventListener("contextmenu", (e) => e.preventDefault());
    setVoiceUI(false);
  }

  // ========= 外部触发重渲染（保留） =========
  window.addEventListener("grandma:chat:rerender", () => {
    try { render(); } catch (e) {}
  });

  render();
})();