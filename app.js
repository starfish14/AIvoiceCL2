const STORAGE_KEYS = {
  apiKey: "deepseek_api_key",
  apiBase: "deepseek_api_base",
  model: "deepseek_model",
  remember: "deepseek_remember",
};

const state = {
  messages: [],
  isSending: false,
  isListening: false,
  recognition: null,
  voiceBaseText: "",
};

const EXPERT_KNOWLEDGE_MIN = 12;
const EXPERT_KNOWLEDGE_MAX = 20;
const PLAIN_TEXT_SYSTEM_PROMPT =
  "你是一个纯文本助手。请仅输出纯文本，不要使用任何 Markdown 语法（如标题、列表、加粗、斜体、代码块、反引号、链接标记）。";

const dom = {
  chatList: document.getElementById("chatList"),
  userInput: document.getElementById("userInput"),
  sendBtn: document.getElementById("sendBtn"),
  voiceBtn: document.getElementById("voiceBtn"),
  statusText: document.getElementById("statusText"),
  settingsToggle: document.getElementById("settingsToggle"),
  settingsPanel: document.getElementById("settingsPanel"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  apiBaseInput: document.getElementById("apiBaseInput"),
  modelInput: document.getElementById("modelInput"),
  showApiSwitch: document.getElementById("showApiSwitch"),
  rememberSwitch: document.getElementById("rememberSwitch"),
};

function setStatus(text, isError = false) {
  dom.statusText.textContent = text;
  dom.statusText.classList.toggle("hidden", !text);
  dom.statusText.classList.toggle("error", isError);
}

function appendBubble(role, text) {
  const bubble = document.createElement("article");
  bubble.className = `bubble ${role === "user" ? "user" : "bot"}`;
  bubble.textContent = text;
  dom.chatList.appendChild(bubble);
  dom.chatList.scrollTop = dom.chatList.scrollHeight;
}

function loadSettings() {
  const remember = localStorage.getItem(STORAGE_KEYS.remember);
  const shouldRemember = remember === null ? true : remember === "true";
  dom.rememberSwitch.checked = shouldRemember;

  const storedBase = localStorage.getItem(STORAGE_KEYS.apiBase);
  if (storedBase) {
    dom.apiBaseInput.value = storedBase;
  }

  const storedModel = localStorage.getItem(STORAGE_KEYS.model);
  if (storedModel) {
    dom.modelInput.value = storedModel;
  }

  if (shouldRemember) {
    const storedKey = localStorage.getItem(STORAGE_KEYS.apiKey);
    if (storedKey) {
      dom.apiKeyInput.value = storedKey;
    }
  }
}

function saveSettings() {
  const shouldRemember = dom.rememberSwitch.checked;
  localStorage.setItem(STORAGE_KEYS.remember, String(shouldRemember));
  localStorage.setItem(STORAGE_KEYS.apiBase, dom.apiBaseInput.value.trim());
  localStorage.setItem(STORAGE_KEYS.model, dom.modelInput.value.trim());

  if (shouldRemember) {
    localStorage.setItem(STORAGE_KEYS.apiKey, dom.apiKeyInput.value.trim());
  } else {
    localStorage.removeItem(STORAGE_KEYS.apiKey);
  }
}

function setSending(sending) {
  state.isSending = sending;
  dom.sendBtn.disabled = sending;
}

function getExpertKnowledgeCount() {
  const range = EXPERT_KNOWLEDGE_MAX - EXPERT_KNOWLEDGE_MIN + 1;
  return Math.floor(Math.random() * range) + EXPERT_KNOWLEDGE_MIN;
}

function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, "")
    .trim();
}

function withExpertKnowledgeFooter(text) {
  const count = getExpertKnowledgeCount();
  return `${text}\n\n本次回答参考了 ${count} 条专家库知识数量`;
}

function getRequestPayload() {
  const content = dom.userInput.value.trim();
  if (!content) {
    return null;
  }

  state.messages.push({ role: "user", content });
  const history = state.messages.slice(-20);
  return {
    model: dom.modelInput.value.trim() || "deepseek-chat",
    messages: [{ role: "system", content: PLAIN_TEXT_SYSTEM_PROMPT }, ...history],
    temperature: 0.7,
  };
}

async function sendMessage() {
  if (state.isSending) {
    return;
  }

  const apiKey = dom.apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus("请先在右上角 API 面板填写 Key。", true);
    return;
  }

  const payload = getRequestPayload();
  if (!payload) {
    setStatus("请输入要发送的内容。", true);
    return;
  }

  const userText = payload.messages[payload.messages.length - 1].content;
  appendBubble("user", userText);
  dom.userInput.value = "";
  saveSettings();
  setSending(true);
  setStatus("AI 正在思考中...");

  try {
    const baseUrl = dom.apiBaseInput.value.trim() || "https://api.deepseek.com/chat/completions";
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`请求失败（${response.status}）：${errorText || "未知错误"}`);
    }

    const data = await response.json();
    const aiText = data?.choices?.[0]?.message?.content?.trim();
    if (!aiText) {
      throw new Error("响应内容为空，请检查模型或接口返回。");
    }

    const plainAiText = stripMarkdown(aiText);
    const botText = withExpertKnowledgeFooter(plainAiText);
    appendBubble("bot", botText);
    state.messages.push({ role: "assistant", content: plainAiText });
    setStatus("");
  } catch (error) {
    setStatus(error.message || "请求失败，请稍后重试。", true);
  } finally {
    setSending(false);
  }
}

function toggleSettingsPanel() {
  const isOpen = dom.settingsToggle.getAttribute("aria-expanded") === "true";
  setSettingsOpenState(!isOpen);
}

function setSettingsOpenState(open) {
  dom.settingsPanel.classList.toggle("hidden", !open);
  dom.settingsPanel.classList.toggle("open", open);
  dom.settingsPanel.setAttribute("aria-hidden", String(!open));
  dom.settingsToggle.setAttribute("aria-expanded", String(open));
  dom.settingsToggle.classList.toggle("active", open);
}

function handleDocumentClick(event) {
  const isOpen = dom.settingsToggle.getAttribute("aria-expanded") === "true";
  if (!isOpen || !(event.target instanceof Node)) {
    return;
  }

  const clickedInsidePanel = dom.settingsPanel.contains(event.target);
  const clickedToggle = dom.settingsToggle.contains(event.target);
  if (!clickedInsidePanel && !clickedToggle) {
    setSettingsOpenState(false);
  }
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    dom.voiceBtn.disabled = true;
    dom.voiceBtn.textContent = "当前浏览器不支持语音";
    setStatus("当前浏览器不支持 SpeechRecognition API。", true);
    return;
  }

  state.recognition = new SpeechRecognition();
  state.recognition.lang = "zh-CN";
  state.recognition.continuous = false;
  state.recognition.interimResults = true;

  state.recognition.onstart = () => {
    state.isListening = true;
    state.voiceBaseText = dom.userInput.value.trim();
    dom.voiceBtn.textContent = "停止语音";
    setStatus("正在听你说话...");
  };

  state.recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalText += transcript;
      } else {
        interimText += transcript;
      }
    }

    const base = state.voiceBaseText ? `${state.voiceBaseText} ` : "";
    dom.userInput.value = `${base}${finalText}${interimText}`.trim();
  };

  state.recognition.onerror = (event) => {
    setStatus(`语音识别失败：${event.error || "未知错误"}`, true);
  };

  state.recognition.onend = () => {
    state.isListening = false;
    dom.voiceBtn.textContent = "开始语音";
    if (!dom.statusText.classList.contains("error")) {
      setStatus("");
    }
  };
}

function bindEvents() {
  dom.sendBtn.addEventListener("click", sendMessage);
  dom.userInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      sendMessage();
    }
  });

  dom.voiceBtn.addEventListener("click", () => {
    if (!state.recognition) {
      return;
    }
    if (state.isListening) {
      state.recognition.stop();
    } else {
      state.recognition.start();
    }
  });

  dom.settingsToggle.addEventListener("click", toggleSettingsPanel);
  document.addEventListener("click", handleDocumentClick);
  dom.showApiSwitch.addEventListener("change", () => {
    dom.apiKeyInput.type = dom.showApiSwitch.checked ? "text" : "password";
  });

  const settingsInputs = [dom.apiKeyInput, dom.apiBaseInput, dom.modelInput, dom.rememberSwitch];
  settingsInputs.forEach((input) => {
    input.addEventListener("change", saveSettings);
    input.addEventListener("blur", saveSettings);
  });
}

function init() {
  loadSettings();
  setupSpeechRecognition();
  bindEvents();
  setSettingsOpenState(false);
  appendBubble("bot", "你好，我已准备好对话。");
}

init();
