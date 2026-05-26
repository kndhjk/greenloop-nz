const params = new URLSearchParams(window.location.search);
const initialConversationParam = params.get("conversation");
const initialItemId = Number(params.get("itemId") || 0);

const chatState = {
  selectedId: /^\d+$/.test(initialConversationParam || "") ? Number(initialConversationParam) : 0,
  pendingItemId: initialConversationParam === "new" ? initialItemId : 0,
  renderedMobileThreadId: 0,
  lastMessageId: 0,
  pollTimer: null,
  presenceTimer: null,
  conversations: [],
  pendingImageObjectUrl: "",
  lastIncomingMessageId: 0,
  audioContext: null,
  unreadTitleCount: 0,
  isMobileView: false,
  searchQuery: "",
  mobileKeyboardOpen: false,
  didUserScrollUp: false,
  isUserScrolling: false,
  _scrollEndTimer: null,
  // Fixed images persist across keyboard open/close
  pendingImageFile: null,
  // Chat history pagination
  oldestMessageId: null,
  hasMoreMessages: false,
  isLoadingMore: false,
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getInitials = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "GL";

const renderAvatar = (user, extraClass = "") => {
  const classes = ["chat-avatar"];
  if (extraClass) classes.push(extraClass);
  if (user?.avatarUrl) {
    return `<img class="${classes.join(" ")}" src="${escapeHtml(user.avatarUrl)}" alt="${escapeHtml(user.fullName || "User")}" />`;
  }
  return `<span class="${classes.join(" ")} chat-avatar-fallback">${escapeHtml(getInitials(user?.fullName || ""))}</span>`;
};

const formatTime = (value) => {
  if (!value) return "";
  return new Date(value).toLocaleString("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
};

const formatDateHeader = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-NZ", { weekday: "long", day: "numeric", month: "long" });
};

const formatPresence = (user) => {
  if (!user) return "Offline";
  if (user.isOnline) return "Online now";
  if (!user.lastSeenAt) return "Offline";
  return `Last seen ${formatTime(user.lastSeenAt)}`;
};

const getReadTick = (message) => {
  if (!message.mine) return "";
  if (message.readAt) return '<span class="tick read">Seen</span>';
  return '<span class="tick">Sent</span>';
};

const playIncomingSound = () => {
  try {
    chatState.audioContext = chatState.audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const context = chatState.audioContext;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.22);
  } catch (_) {}
};

const updateTitleBadge = () => {
  document.title = chatState.unreadTitleCount > 0 ? `(${chatState.unreadTitleCount}) Chat | GreenLoop NZ` : "Chat | GreenLoop NZ";
};

const updateHeroStats = () => {
  const count = chatState.conversations.length;
  const unread = chatState.conversations.reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0);
  const online = chatState.conversations.filter((thread) => thread.otherUser?.isOnline).length;
  const countNode = document.getElementById("chat-hero-count");
  const unreadNode = document.getElementById("chat-hero-unread");
  const onlineNode = document.getElementById("chat-hero-online");
  if (countNode) countNode.textContent = String(count);
  if (unreadNode) unreadNode.textContent = String(unread);
  if (onlineNode) {
    onlineNode.textContent = String(online);
    onlineNode.classList.toggle("online-pill", online > 0);
  }
};

const detectMobileView = () => window.innerWidth < 780;
const isMobileComposerFocused = () => document.activeElement?.id === "chat-input-mobile";

// ── Keyboard tracking for mobile ──
let lastInnerHeight = window.innerHeight;

const onMobileKeyboardShow = () => {
  if (!chatState.isMobileView) return;
  chatState.mobileKeyboardOpen = true;
  const strip = document.querySelector(".chat-thread-strip");
  const statsBar = document.querySelector(".chat-stats-bar");
  if (strip) strip.classList.add("keyboard-hidden");
  if (statsBar) statsBar.classList.add("keyboard-hidden");
  // Prevent body scroll
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.width = "100%";
  // Scroll chat stage to bottom after keyboard opens
  setTimeout(() => {
    const msgEl = document.getElementById("chat-messages-mobile") || document.getElementById("chat-messages");
    if (msgEl) {
      msgEl.scrollTop = msgEl.scrollHeight;
      msgEl.style.overflow = "scroll";
    }
  }, 150);
};

const onMobileKeyboardHide = () => {
  if (!chatState.isMobileView) return;
  chatState.mobileKeyboardOpen = false;
  const strip = document.querySelector(".chat-thread-strip");
  const statsBar = document.querySelector(".chat-stats-bar");
  if (strip) strip.classList.remove("keyboard-hidden");
  if (statsBar) statsBar.classList.remove("keyboard-hidden");
  // Restore body scroll
  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.width = "";
};

const setupMobileKeyboardListeners = () => {
  // Detect keyboard by window resize (mobile only)
  window.addEventListener("resize", () => {
    if (!chatState.isMobileView) return;
    const currentHeight = window.innerHeight;
    if (currentHeight < lastInnerHeight - 60) {
      // Keyboard opened
      onMobileKeyboardShow();
    } else if (currentHeight > lastInnerHeight + 60) {
      // Keyboard closed
      onMobileKeyboardHide();
    }
    lastInnerHeight = currentHeight;
  });
  
  // Also track focus/blur on inputs
  const inputs = document.querySelectorAll("#chat-input-mobile, #chat-input");
  inputs.forEach((input) => {
    input.addEventListener("focus", () => {
      if (chatState.isMobileView) {
        // Delay to let keyboard actually open
        setTimeout(() => onMobileKeyboardShow(), 350);
      }
    });
    input.addEventListener("blur", () => {
      // Delay to avoid premature hide when keyboard "refocuses"
      setTimeout(() => {
        if (chatState.isMobileView && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
          onMobileKeyboardHide();
        }
      }, 200);
    });
  });
};

const switchToMobile = () => {
  if (!chatState.isMobileView) return;
  const layoutDesktop = document.querySelector(".chat-layout-desktop");
  const layoutMobile = document.querySelector(".chat-layout-mobile");
  const backBtn = document.getElementById("chat-back-btn");
  if (layoutDesktop) layoutDesktop.classList.add("hidden");
  if (layoutMobile) layoutMobile.classList.remove("hidden");
  if (backBtn) backBtn.classList.remove("hidden");
};

const switchToDesktop = () => {
  if (chatState.isMobileView) return;
  const layoutDesktop = document.querySelector(".chat-layout-desktop");
  const layoutMobile = document.querySelector(".chat-layout-mobile");
  const backBtn = document.getElementById("chat-back-btn");
  if (layoutDesktop) layoutDesktop.classList.remove("hidden");
  if (layoutMobile) layoutMobile.classList.add("hidden");
  if (backBtn) backBtn.classList.add("hidden");
};

window._chatMessages = [];

const openThreadMobile = (threadId) => {
  chatState.selectedId = threadId;
  chatState.renderedMobileThreadId = threadId;
  history.replaceState({}, "", `/chat?conversation=${threadId}`);

  const stage = document.getElementById("chat-mobile-stage");
  const selected = chatState.conversations.find((t) => Number(t.id) === Number(threadId));
  if (!stage || !selected) return;

  const messages = window._chatMessages || [];
  const currentUserId = GreenLoop.state.user?.id;

  stage.innerHTML = `
    <div class="chat-mobile-stage-header">
      <button class="chat-back-btn" id="chat-back-btn-2" type="button">← Back</button>
      <div class="chat-stage-identity">
        ${renderAvatar(selected.otherUser, "chat-avatar-md")}
        <div>
          <strong>${escapeHtml(selected.otherUser.fullName)}</strong>
          <span class="fine-print">${escapeHtml(selected.otherUser.schoolName || "UoA member")}</span>
        </div>
      </div>
      <div class="chat-stage-actions">
        <button class="ghost-button" id="chat-delete-button-mobile" type="button">Delete chat</button>
        <a class="ghost-button" href="/seller?id=${selected.otherUser.id}">Profile</a>
      </div>
    </div>
    ${selected.itemTitle ? `
    <div class="chat-mobile-context-card">
      <span class="fine-print">Re: ${escapeHtml(selected.itemTitle)}</span>
      <a class="ghost-link" href="/item?id=${selected.itemId}">View listing →</a>
    </div>` : ""}
    <div id="chat-messages-mobile" class="chat-message-stream chat-message-stream-mobile">
      ${renderMessagesMobile(messages, currentUserId)}
    </div>
    ${chatState.pendingImageObjectUrl ? `
    <div id="chat-image-preview-mobile" class="chat-image-preview-mobile">
      <img id="chat-image-preview-img-mobile" src="${chatState.pendingImageObjectUrl}" alt="Preview" />
      <div class="chat-image-preview-copy-mobile">
        <strong>Image attached</strong>
      </div>
      <button id="chat-image-clear-mobile" type="button">✕</button>
    </div>` : `
    <div id="chat-image-preview-mobile" class="chat-image-preview-mobile hidden">
      <img id="chat-image-preview-img-mobile" alt="Preview" />
      <div class="chat-image-preview-copy-mobile">
        <strong>Image attached</strong>
      </div>
      <button id="chat-image-clear-mobile" type="button">✕</button>
    </div>`}
    <div class="chat-mobile-compose">
      <label class="image-picker" for="chat-image-input-mobile" title="Attach image">📷</label>
      <input id="chat-image-input-mobile" type="file" accept="image/*" class="hidden" />
      <textarea id="chat-input-mobile" placeholder="Message…" rows="1"></textarea>
      <button class="chat-send-btn" id="chat-send-btn-mobile" type="button">▶</button>
    </div>
  `;

  // Scroll to bottom only if user hasn't scrolled up
  setTimeout(() => {
    const el = document.getElementById("chat-messages-mobile");
    if (el && !chatState.didUserScrollUp) el.scrollTop = el.scrollHeight;
  }, 80);

  // Back button
  document.getElementById("chat-back-btn-2")?.addEventListener("click", () => {
    onMobileKeyboardHide();
    switchToMobile();
    renderThreads();
  });
  document.getElementById("chat-delete-button-mobile")?.addEventListener("click", () => {
    deleteSelectedConversation();
  });

  // Auto-resize textarea
  const textarea = document.getElementById("chat-input-mobile");
  textarea?.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 120) + "px";
  });

  // Keyboard show - using resize detection
  textarea?.addEventListener("focus", () => {
    if (chatState.isMobileView) {
      setTimeout(() => {
        const el = document.getElementById("chat-messages-mobile");
        if (el) el.scrollTop = el.scrollHeight;
      }, 300);
    }
  });

  // Image selection - persist file reference
  const imgInput = document.getElementById("chat-image-input-mobile");
  imgInput?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Store file reference so it survives keyboard open/close
    chatState.pendingImageFile = file;
    if (chatState.pendingImageObjectUrl) URL.revokeObjectURL(chatState.pendingImageObjectUrl);
    chatState.pendingImageObjectUrl = URL.createObjectURL(file);
    const preview = document.getElementById("chat-image-preview-mobile");
    const img = document.getElementById("chat-image-preview-img-mobile");
    if (preview && img) {
      preview.classList.remove("hidden");
      img.src = chatState.pendingImageObjectUrl;
    }
  });

  document.getElementById("chat-image-clear-mobile")?.addEventListener("click", () => {
    if (chatState.pendingImageObjectUrl) URL.revokeObjectURL(chatState.pendingImageObjectUrl);
    chatState.pendingImageObjectUrl = "";
    chatState.pendingImageFile = null;
    if (imgInput) imgInput.value = "";
    const preview = document.getElementById("chat-image-preview-mobile");
    if (preview) preview.classList.add("hidden");
  });

  // Send button (not Enter key)
  document.getElementById("chat-send-btn-mobile")?.addEventListener("click", async () => {
    const input = document.getElementById("chat-input-mobile");
    const body = input?.value.trim() || "";
    if (!body && !chatState.pendingImageObjectUrl) return;
    const sendBtn = document.getElementById("chat-send-btn-mobile");
    if (sendBtn) sendBtn.disabled = true;
    try {
      const imageUrl = await uploadImageMobile();
      await GreenLoop.api(`/api/chats/${chatState.selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, imageUrl }),
      });
      if (input) input.value = "";
      if (chatState.pendingImageObjectUrl) URL.revokeObjectURL(chatState.pendingImageObjectUrl);
      chatState.pendingImageObjectUrl = "";
      chatState.pendingImageFile = null;
      if (imgInput) imgInput.value = "";
      const preview = document.getElementById("chat-image-preview-mobile");
      if (preview) preview.classList.add("hidden");
      await loadMessages(true);
      updateMobileMessages();
      renderThreads();
      syncUnreadIndicators();
    } catch (err) {
      GreenLoop.showToast(err.message, true);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  });

  // Scroll to load more history
  const msgEl = document.getElementById("chat-messages-mobile");
  if (msgEl) {
    msgEl.addEventListener("scroll", () => {
      if (msgEl.scrollTop < 80 && chatState.hasMoreMessages && !chatState.isLoadingMore) {
        loadOlderMessages();
      }
    });
  }
};

const selectConversation = async (threadId, options = {}) => {
  const nextThreadId = Number(threadId || 0);
  if (!nextThreadId) return;

  const { skipHistory = false } = options;
  const threadChanged = Number(chatState.selectedId) !== nextThreadId;
  chatState.selectedId = nextThreadId;

  if (threadChanged) {
    resetConversationState();
  }

  if (!skipHistory) {
    history.replaceState({}, "", `/chat?conversation=${nextThreadId}`);
  }

  renderThreads();
  syncHeader();

  if (chatState.isMobileView) {
    openThreadMobile(nextThreadId);
  }

  await loadMessages(false);
  await loadConversations();
  renderThreads();
  syncHeader();
};

const deleteSelectedConversation = async () => {
  if (!chatState.selectedId) return;

  const currentId = Number(chatState.selectedId);
  const currentThread = chatState.conversations.find((thread) => Number(thread.id) === currentId);
  const label = currentThread?.otherUser?.fullName || "this chat";
  if (!window.confirm(`Delete chat with ${label}? This removes the conversation for both sides.`)) {
    return;
  }

  try {
    await GreenLoop.api(`/api/chats/${currentId}`, { method: "DELETE" });
    GreenLoop.showToast("Chat deleted.");
    resetConversationState();
    chatState.conversations = chatState.conversations.filter((thread) => Number(thread.id) !== currentId);
    chatState.selectedId = Number(chatState.conversations[0]?.id || 0);

    if (chatState.selectedId) {
      await selectConversation(chatState.selectedId);
      return;
    }

    history.replaceState({}, "", "/chat");
    renderThreads();
    syncUnreadIndicators();
    syncHeader();
    renderMessages([], GreenLoop.state.user.id);
    if (chatState.isMobileView) {
      renderMobileEmptyState();
    }
  } catch (error) {
    GreenLoop.showToast(error.message || "Delete failed.", true);
  }
};

const uploadImageMobile = async () => {
  const input = document.getElementById("chat-image-input-mobile");
  const file = input?.files?.[0] || chatState.pendingImageFile;
  if (!file) return "";
  const form = new FormData();
  form.append("file", file);
  const data = await GreenLoop.api("/api/uploads", { method: "POST", body: form });
  return data.url || "";
};

const renderMessagesMobile = (messages, currentUserId) => {
  if (!messages.length) {
    return `<div class="chat-empty-panel"><h3>Say hello 👋</h3><p>This thread is empty. Break the ice!</p></div>`;
  }
  return messages.map((message) => {
    const mine = Number(message.senderId) === Number(currentUserId);
    const sender = {
      fullName: mine ? "You" : message.senderName,
      avatarUrl: mine ? GreenLoop.state.user?.avatarUrl || "" : message.senderAvatarUrl || "",
    };
    const safeBody = escapeHtml(message.body || "");
    return `
      <article class="chat-message-row ${mine ? "mine" : ""}">
        ${renderAvatar(sender, "chat-avatar-sm")}
        <div class="chat-bubble ${mine ? "mine" : ""}">
          ${message.imageUrl ? `<img class="chat-image" src="${escapeHtml(message.imageUrl)}" alt="Upload" loading="lazy" />` : ""}
          ${safeBody ? `<p>${safeBody}</p>` : ""}
          <small>
            <span>${formatTime(message.createdAt)}</span>
            ${getReadTick({ mine, readAt: message.readAt })}
          </small>
        </div>
      </article>
    `;
  }).join("");
};

const updateMobileMessages = () => {
  const target = document.getElementById("chat-messages-mobile");
  if (!target) return;
  const messages = window._chatMessages || [];
  const currentUserId = GreenLoop.state.user?.id;
  target.innerHTML = renderMessagesMobile(messages, currentUserId);
  // Smart scroll: only snap to bottom if near bottom or user hasn't scrolled up
  const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 120;
  if (nearBottom || !chatState.didUserScrollUp) {
    target.scrollTop = target.scrollHeight;
  }
};

const updatePendingPreview = () => {
  const wrapper = document.getElementById("chat-image-preview");
  const img = document.getElementById("chat-image-preview-img");
  if (!wrapper || !img) return;
  if (!chatState.pendingImageObjectUrl) {
    wrapper.classList.add("hidden");
    img.removeAttribute("src");
    return;
  }
  wrapper.classList.remove("hidden");
  img.src = chatState.pendingImageObjectUrl;
};

const clearPendingImage = () => {
  if (chatState.pendingImageObjectUrl) URL.revokeObjectURL(chatState.pendingImageObjectUrl);
  chatState.pendingImageObjectUrl = "";
  chatState.pendingImageFile = null;
  const desktopInput = document.getElementById("chat-image-input");
  const mobileInput = document.getElementById("chat-image-input-mobile");
  if (desktopInput) desktopInput.value = "";
  if (mobileInput) mobileInput.value = "";
};

const resetConversationState = () => {
  window._chatMessages = [];
  chatState.renderedMobileThreadId = 0;
  chatState.lastMessageId = 0;
  chatState.lastIncomingMessageId = 0;
  chatState.oldestMessageId = null;
  chatState.hasMoreMessages = false;
  chatState.isLoadingMore = false;
  chatState.didUserScrollUp = false;
};

const renderMobileEmptyState = () => {
  const stage = document.getElementById("chat-mobile-stage");
  if (!stage) return;
  stage.innerHTML = `
    <div class="chat-empty-panel">
      <div class="chat-empty-icon">💬</div>
      <h3>Pick a thread above</h3>
      <p>Swipe to find your conversation, then start chatting.</p>
    </div>
  `;
};

const renderThreads = () => {
  const target = document.getElementById("chat-thread-list");
  const strip = document.getElementById("chat-thread-strip");
  if (!target && !strip) return;

  const q = chatState.searchQuery.toLowerCase();
  const filtered = chatState.conversations.filter((t) => {
    if (!q) return true;
    return (
      (t.otherUser?.fullName || "").toLowerCase().includes(q) ||
      (t.itemTitle || "").toLowerCase().includes(q) ||
      (t.lastMessage || "").toLowerCase().includes(q)
    );
  });

  if (!filtered.length) {
    const empty = `<div class="chat-empty-panel compact"><h3>No threads found.</h3></div>`;
    if (target) target.innerHTML = empty;
    if (strip) strip.innerHTML = empty;
    return;
  }

  const threadHtml = (thread) => {
    const active = Number(thread.id) === Number(chatState.selectedId);
    return `
      <a class="chat-thread-card ${active ? "active" : ""}" href="/chat?conversation=${thread.id}">
        <div class="chat-thread-card-head">
          ${renderAvatar(thread.otherUser, "chat-avatar-md")}
          <div class="chat-thread-card-copy">
            <div class="chat-thread-card-row">
              <strong>${escapeHtml(thread.otherUser.fullName)}</strong>
              <small>${formatTime(thread.lastMessageAt || thread.createdAt)}</small>
            </div>
            <div class="chat-thread-card-row chat-thread-card-row-tight">
              <span>${escapeHtml(thread.otherUser.schoolName || "UoA member")}</span>
              ${thread.otherUser.isOnline ? '<span class="online-pill">Online</span>' : ""}
            </div>
          </div>
        </div>
        ${thread.itemTitle ? `<p class="chat-thread-topic">${escapeHtml(thread.itemTitle)}</p>` : ""}
        <div class="chat-thread-card-row">
          <span class="chat-thread-snippet">${escapeHtml(thread.lastMessage || "No messages yet. Say hi.")}</span>
          ${thread.unreadCount ? `<span class="unread-dot">${thread.unreadCount}</span>` : ""}
        </div>
      </a>
    `;
  };

  if (target) target.innerHTML = filtered.map(threadHtml).join("");

  if (target) {
    target.querySelectorAll(".chat-thread-card").forEach((el) => {
      el.addEventListener("click", async (event) => {
        event.preventDefault();
        const href = el.getAttribute("href") || "";
        const match = href.match(/conversation=(\d+)/);
        if (!match) return;
        await selectConversation(Number(match[1]));
      });
    });
  }

  if (strip) {
    strip.innerHTML = filtered.map((thread) => {
      const active = Number(thread.id) === Number(chatState.selectedId);
      return `
        <button class="chat-thread-strip-item ${active ? "active" : ""}" data-thread-id="${thread.id}" type="button">
          ${renderAvatar(thread.otherUser, "chat-avatar-sm")}
          <strong>${escapeHtml(thread.otherUser.fullName)}</strong>
          ${thread.unreadCount ? `<span class="unread-dot">${thread.unreadCount}</span>` : ""}
        </button>
      `;
    }).join("");

    strip.querySelectorAll(".chat-thread-strip-item").forEach((el) => {
      el.addEventListener("click", async () => {
        await selectConversation(Number(el.dataset.threadId));
      });
    });
  }
};

const renderMessages = (messages, currentUserId, append = false, prepend = false) => {
  const target = document.getElementById("chat-messages");
  if (!target) return;

  if (!messages.length && !append && !prepend) {
    target.innerHTML = `
      <div class="chat-empty-panel">
        <div class="chat-empty-icon">💬</div>
        <h3>Break the silence</h3>
        <p>Send a pickup question, a timing update, or just say hi.</p>
      </div>
    `;
    return;
  }

  const html = messages.map((message) => {
    const mine = Number(message.senderId) === Number(currentUserId);
    const sender = {
      fullName: mine ? "You" : message.senderName,
      avatarUrl: mine ? GreenLoop.state.user?.avatarUrl || "" : message.senderAvatarUrl || "",
    };
    const safeBody = escapeHtml(message.body || "");
    return `
      <article class="chat-message-row ${mine ? "mine" : ""}">
        ${renderAvatar(sender, "chat-avatar-sm")}
        <div class="chat-bubble ${mine ? "mine" : ""}">
          ${message.imageUrl ? `<img class="chat-image" src="${escapeHtml(message.imageUrl)}" alt="Chat upload" loading="lazy" />` : ""}
          ${safeBody ? `<p>${safeBody}</p>` : ""}
          <small>
            <span>${escapeHtml(sender.fullName)} · ${formatTime(message.createdAt)}</span>
            ${getReadTick({ mine, readAt: message.readAt })}
          </small>
        </div>
      </article>
    `;
  }).join("");

  if (prepend) {
    // Load older messages - insert at top
    const loaderEl = document.getElementById("chat-load-more-loader");
    if (loaderEl) loaderEl.remove();
    const existing = target.querySelector(".chat-message-row");
    if (existing) {
      target.insertBefore(document.createRange().createContextualFragment(html), existing);
    } else {
      target.insertAdjacentHTML("afterbegin", html);
    }
  } else if (append) {
    target.insertAdjacentHTML("beforeend", html);
  } else {
    target.innerHTML = html;
  }
  target.scrollTop = target.scrollHeight;
};

const syncHeader = () => {
  const selected = chatState.conversations.find((thread) => Number(thread.id) === Number(chatState.selectedId));
  const title = document.getElementById("chat-title");
  const subtitle = document.getElementById("chat-subtitle");
  const compose = document.getElementById("chat-compose");
  const presenceDot = document.getElementById("chat-presence-dot");
  const presenceText = document.getElementById("chat-presence-text");
  const verifiedPill = document.getElementById("chat-verified-pill");
  const avatar = document.getElementById("chat-header-avatar");
  const deleteButton = document.getElementById("chat-delete-button");
  const profileLink = document.getElementById("chat-profile-link");
  const itemLink = document.getElementById("chat-item-link");
  const contextCard = document.getElementById("chat-context-card");
  const contextImage = document.getElementById("chat-context-image");
  const contextTitle = document.getElementById("chat-context-title");
  const contextMeta = document.getElementById("chat-context-meta");
  const contextItemLink = document.getElementById("chat-context-item-link");
  const contextSellerLink = document.getElementById("chat-context-seller-link");

  if (!selected) {
    if (title) title.textContent = "Select a conversation";
    if (subtitle) subtitle.textContent = "GreenLoop trust-first messaging";
    if (presenceText) presenceText.textContent = "Offline";
    if (presenceDot) presenceDot.classList.remove("online");
    if (verifiedPill) verifiedPill.classList.add("hidden");
    if (compose) compose.classList.add("hidden");
    if (deleteButton) deleteButton.classList.add("hidden");
    if (profileLink) profileLink.classList.add("hidden");
    if (itemLink) itemLink.classList.add("hidden");
    if (contextCard) contextCard.classList.add("hidden");
    if (avatar) avatar.outerHTML = '<div id="chat-header-avatar" class="chat-avatar chat-avatar-xl chat-avatar-fallback">GL</div>';
    return;
  }

  const nextAvatar = renderAvatar(selected.otherUser, "chat-avatar-xl");
  const cleanAvatar = nextAvatar
    .replace(/^<img /, '<img id="chat-header-avatar" ')
    .replace(/^<span /, '<span id="chat-header-avatar" ');
  if (avatar) avatar.outerHTML = cleanAvatar;
  if (title) title.textContent = selected.otherUser.fullName;
  if (subtitle) subtitle.textContent = `${selected.otherUser.schoolName || "University of Auckland"} · ${selected.otherUser.verificationStatus || "Member"}`;
  if (presenceText) presenceText.textContent = formatPresence(selected.otherUser);
  if (presenceDot) presenceDot.classList.toggle("online", !!selected.otherUser.isOnline);
  if (verifiedPill) verifiedPill.classList.toggle("hidden", String(selected.otherUser.verificationStatus || "").toLowerCase() !== "verified");
  if (compose) compose.classList.remove("hidden");
  if (deleteButton) deleteButton.classList.remove("hidden");

  if (profileLink) {
    profileLink.href = `/seller?id=${selected.otherUser.id}`;
    profileLink.classList.remove("hidden");
  }
  if (itemLink) {
    itemLink.href = `/item?id=${selected.itemId}`;
    itemLink.classList.remove("hidden");
  }
  if (contextItemLink) contextItemLink.href = `/item?id=${selected.itemId}`;
  if (contextSellerLink) contextSellerLink.href = `/seller?id=${selected.otherUser.id}`;
  if (contextTitle) contextTitle.textContent = selected.itemTitle || "—";
  if (contextMeta) contextMeta.textContent = `Chat with ${selected.otherUser.fullName} about this post.`;
  if (selected.itemImage && contextImage) {
    contextImage.src = selected.itemImage;
    contextImage.alt = selected.itemTitle || "Listing";
  }
  if (contextCard) contextCard.classList.remove("hidden");
};

const syncUnreadIndicators = () => {
  chatState.unreadTitleCount = chatState.conversations.reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0);
  updateTitleBadge();
  updateHeroStats();
  if (GreenLoop?.state) {
    GreenLoop.state._unread = chatState.unreadTitleCount;
  }
};

const loadConversations = async () => {
  const data = await GreenLoop.api("/api/chats");
  chatState.conversations = data.conversations || [];
  const selectedExists = chatState.conversations.some((thread) => Number(thread.id) === Number(chatState.selectedId));
  if ((!chatState.selectedId || !selectedExists) && chatState.conversations[0]) {
    chatState.selectedId = chatState.conversations[0].id;
    history.replaceState({}, "", `/chat?conversation=${chatState.selectedId}`);
  }
  renderThreads();
  syncUnreadIndicators();
  if (chatState.isMobileView && chatState.selectedId) {
    const mobileMessages = document.getElementById("chat-messages-mobile");
    if (!mobileMessages || Number(chatState.renderedMobileThreadId) !== Number(chatState.selectedId)) {
      openThreadMobile(chatState.selectedId);
    } else if (isMobileComposerFocused() || chatState.mobileKeyboardOpen) {
      updateMobileMessages();
    }
  }
};

const ensureConversationFromItem = async () => {
  if (!chatState.pendingItemId) return;
  const chat = await GreenLoop.api("/api/chats/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId: chatState.pendingItemId }),
  });
  chatState.selectedId = Number(chat.id || 0);
  chatState.pendingItemId = 0;
  history.replaceState({}, "", `/chat?conversation=${chatState.selectedId}`);
};

// Load older messages for history scrolling
const loadOlderMessages = async () => {
  if (!chatState.selectedId || !chatState.oldestMessageId || chatState.isLoadingMore) return;
  chatState.isLoadingMore = true;
  
  // Show loading indicator
  const target = document.getElementById("chat-messages") || document.getElementById("chat-messages-mobile");
  if (target) {
    const loader = document.createElement("div");
    loader.id = "chat-load-more-loader";
    loader.className = "chat-load-more-loader";
    loader.innerHTML = `<div class="chat-spinner"></div><small>Loading older messages…</small>`;
    target.insertBefore(loader, target.firstChild);
  }
  
  try {
    const data = await GreenLoop.api(`/api/chats/${chatState.selectedId}/messages?beforeId=${chatState.oldestMessageId}`);
    const messages = data.messages || [];
    
    if (!messages.length) {
      chatState.hasMoreMessages = false;
    } else {
      chatState.oldestMessageId = messages[0].id;
      const currentMessages = window._chatMessages || [];
      window._chatMessages = [...messages, ...currentMessages];
      const currentUserId = GreenLoop.state.user.id;
      
      const target = document.getElementById("chat-messages") || document.getElementById("chat-messages-mobile");
      if (target) {
        const loader = document.getElementById("chat-load-more-loader");
        if (loader) loader.remove();
        
        // Prepend older messages at top
        const html = messages.map((message) => {
          const mine = Number(message.senderId) === Number(currentUserId);
          const sender = {
            fullName: mine ? "You" : message.senderName,
            avatarUrl: mine ? GreenLoop.state.user?.avatarUrl || "" : message.senderAvatarUrl || "",
          };
          const safeBody = escapeHtml(message.body || "");
          return `
            <article class="chat-message-row ${mine ? "mine" : ""}">
              ${renderAvatar(sender, "chat-avatar-sm")}
              <div class="chat-bubble ${mine ? "mine" : ""}">
                ${message.imageUrl ? `<img class="chat-image" src="${escapeHtml(message.imageUrl)}" alt="Chat upload" loading="lazy" />` : ""}
                ${safeBody ? `<p>${safeBody}</p>` : ""}
                <small>
                  <span>${escapeHtml(sender.fullName)} · ${formatTime(message.createdAt)}</span>
                  ${getReadTick({ mine, readAt: message.readAt })}
                </small>
              </div>
            </article>
          `;
        }).join("");
        
        const firstMsg = target.querySelector(".chat-message-row");
        if (firstMsg) {
          target.insertBefore(document.createRange().createContextualFragment(html), firstMsg);
        }
        // Restore scroll position
        target.scrollTop = 80;
      }
    }
  } catch (err) {
    chatState.hasMoreMessages = false;
  } finally {
    chatState.isLoadingMore = false;
    const loader = document.getElementById("chat-load-more-loader");
    if (loader) loader.remove();
  }
};

const loadMessages = async (append = false) => {
  if (!chatState.selectedId) return;
  const query = append && chatState.lastMessageId ? `?afterId=${chatState.lastMessageId}` : "";
  const data = await GreenLoop.api(`/api/chats/${chatState.selectedId}/messages${query}`);
  const messages = data.messages || [];
  const currentMessages = Array.isArray(window._chatMessages) ? window._chatMessages : [];

  // Skip if polling and no new messages (avoid needless DOM re-render + scroll jump)
  if (!append && chatState.lastMessageId) {
    const latestId = messages[messages.length - 1]?.id;
    if (latestId && Number(latestId) <= chatState.lastMessageId) return;
  }

  const mergedMessages = append
    ? [...currentMessages, ...messages.filter((message) => !currentMessages.some((current) => Number(current.id) === Number(message.id)))]
    : messages;

  if (messages.length) {
    chatState.lastMessageId = messages[messages.length - 1].id;
    chatState.oldestMessageId = mergedMessages[0]?.id || messages[0].id;
    window._chatMessages = mergedMessages;
    const incoming = messages.filter((message) => Number(message.senderId) !== Number(GreenLoop.state.user.id));
    const newestIncomingId = incoming[incoming.length - 1]?.id || 0;
    if (append && newestIncomingId > chatState.lastIncomingMessageId) {
      playIncomingSound();
      chatState.lastIncomingMessageId = newestIncomingId;
    } else if (!append && newestIncomingId) {
      chatState.lastIncomingMessageId = newestIncomingId;
    }
  } else if (!append) {
    window._chatMessages = [];
  }
  if (!append) {
    chatState.hasMoreMessages = messages.length >= 200;
  }
  renderMessages(append ? messages : mergedMessages, GreenLoop.state.user.id, append);
  if (chatState.isMobileView && Number(chatState.renderedMobileThreadId) === Number(chatState.selectedId)) {
    updateMobileMessages();
  }
  
  // Setup scroll for history on desktop
  if (!chatState.isMobileView) {
    const target = document.getElementById("chat-messages");
    if (target) {
      target.addEventListener("scroll", () => {
        if (target.scrollTop < 80 && chatState.hasMoreMessages && !chatState.isLoadingMore) {
          loadOlderMessages();
        }
      });
    }
  }
};

const uploadImageIfNeeded = async () => {
  const input = document.getElementById("chat-image-input");
  const file = input?.files?.[0];
  if (!file) return "";
  const form = new FormData();
  form.append("file", file);
  const data = await GreenLoop.api("/api/uploads", { method: "POST", body: form });
  return data.url || "";
};

const sendPresence = async (online = true) => {
  try {
    await GreenLoop.api("/api/chats/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ online }),
    });
  } catch (_) {}
};

const startPolling = () => {
  clearInterval(chatState.pollTimer);
  clearInterval(chatState.presenceTimer);
  chatState.pollTimer = setInterval(async () => {
    try {
      await loadMessages(false);
      await loadConversations();
      syncHeader();
    } catch (_) {}
  }, 3000);
  chatState.presenceTimer = setInterval(() => sendPresence(true), 15000);
};

const boot = async () => {
  chatState.isMobileView = detectMobileView();
  lastInnerHeight = window.innerHeight;

  await GreenLoop.bootstrap({ protectedPage: true });
  await ensureConversationFromItem();
  await sendPresence(true);
  await loadConversations();
  syncHeader();
  await loadMessages(false);
  startPolling();

  // ── Track user scroll position (don't interrupt reading) ──
  const setupMessageScrollTracking = () => {
    const desktopEl = document.getElementById("chat-messages");
    const mobileEl = document.getElementById("chat-messages-mobile");
    const onScroll = (el) => {
      if (!el) return;
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      chatState.didUserScrollUp = dist > 120;
      chatState.isUserScrolling = true;
      clearTimeout(chatState._scrollEndTimer);
      chatState._scrollEndTimer = setTimeout(() => { chatState.isUserScrolling = false; }, 400);
    };
    desktopEl?.addEventListener("scroll", () => onScroll(desktopEl), { passive: true });
    mobileEl?.addEventListener("scroll", () => onScroll(mobileEl), { passive: true });
    desktopEl?.addEventListener("touchmove", () => onScroll(desktopEl), { passive: true });
    mobileEl?.addEventListener("touchmove", () => onScroll(mobileEl), { passive: true });
  };
  setupMessageScrollTracking();
  setupMobileKeyboardListeners();

  if (chatState.isMobileView) {
    switchToMobile();
  } else {
    switchToDesktop();
  }

  window.addEventListener("resize", () => {
    const wasMobile = chatState.isMobileView;
    chatState.isMobileView = detectMobileView();
    if (chatState.isMobileView && !wasMobile) {
      switchToMobile();
      renderThreads();
      if (chatState.selectedId) openThreadMobile(chatState.selectedId);
    } else if (!chatState.isMobileView && wasMobile) {
      switchToDesktop();
      renderThreads();
    }
  });

  document.getElementById("chat-search")?.addEventListener("input", (e) => {
    chatState.searchQuery = e.target.value;
    renderThreads();
  });

  document.getElementById("chat-delete-button")?.addEventListener("click", () => {
    deleteSelectedConversation();
  });

  // Desktop send via button (Enter does not submit, lets newlines through)
  const desktopInput = document.getElementById("chat-input");
  desktopInput?.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      document.getElementById("chat-compose")?.requestSubmit();
    }
  });

  document.getElementById("chat-compose")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("chat-input");
    const body = input?.value.trim() || "";
    try {
      const imageUrl = await uploadImageIfNeeded();
      if (!body && !imageUrl) return;
      await GreenLoop.api(`/api/chats/${chatState.selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, imageUrl }),
      });
      if (input) input.value = "";
      clearPendingImage();
      updatePendingPreview();
      await loadMessages(true);
      await loadConversations();
      syncHeader();
    } catch (error) {
      GreenLoop.showToast(error.message, true);
    }
  });

  document.getElementById("chat-image-input")?.addEventListener("change", (event) => {
    clearPendingImage();
    const file = event.target.files?.[0];
    if (!file) return;
    chatState.pendingImageObjectUrl = URL.createObjectURL(file);
    updatePendingPreview();
  });

  document.getElementById("chat-image-clear")?.addEventListener("click", () => {
    clearPendingImage();
    updatePendingPreview();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncUnreadIndicators();
  });
};

window.addEventListener("beforeunload", () => {
  clearInterval(chatState.pollTimer);
  clearInterval(chatState.presenceTimer);
  if (GreenLoop.state.token) {
    fetch("/api/chats/presence", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GreenLoop.state.token}`,
      },
      body: JSON.stringify({ online: false }),
      keepalive: true,
    }).catch(() => {});
  }
});

boot().catch((error) => GreenLoop.showToast(error.message, true));
