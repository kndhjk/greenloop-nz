const GreenLoop = (() => {
  const state = {
    token: localStorage.getItem("greenloop_token") || "",
    user: null,
  };

  const $ = (selector) => document.querySelector(selector);
  let fabMounted = false;
  let dockMounted = false;
  let lightboxMounted = false;
  const lightboxState = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    dragging: false,
    lastTapAt: 0,
  };

  const shellPages = new Set(["home", "marketplace", "sell", "services", "opportunities", "chat", "community"]);

  const brandMark = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
      <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>
  `;

  const dockItems = [
    {
      key: "marketplace",
      href: "/marketplace",
      label: "Market",
      icon: `<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path>`,
    },
    {
      key: "chat",
      href: "/chat",
      label: "Chat",
      icon: `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>`,
      badgeKey: "unread",
    },
    {
      key: "sell",
      href: "/sell",
      label: "Sell",
      icon: `<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>`,
    },
    {
      key: "services",
      href: "/services",
      label: "Service",
      icon: `<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>`,
    },
    {
      key: "opportunities",
      href: "/opportunities",
      label: "Jobs",
      icon: `<rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>`,
    },
  ];

  const ensureFab = () => {
    if (fabMounted) return;
    fabMounted = true;
    const style = document.createElement("style");
    style.textContent = `
      .floating-plus-btn {
        position: fixed;
        right: 18px;
        bottom: 22px;
        width: 58px;
        height: 58px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 34px;
        line-height: 1;
        text-decoration: none;
        color: #fff;
        background: linear-gradient(135deg, #1fbf75, #11995c);
        box-shadow: 0 14px 28px rgba(17, 153, 92, 0.35);
        z-index: 60;
        transition: transform .18s ease, box-shadow .18s ease, opacity .18s ease;
      }
      .floating-plus-btn:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 18px 36px rgba(17, 153, 92, 0.42);
      }
      .floating-plus-btn.hidden {
        opacity: 0;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);

    const link = document.createElement("a");
    link.href = "/sell";
    link.className = "floating-plus-btn hidden";
    link.id = "floating-plus-btn";
    link.setAttribute("aria-label", "Publish item");
    link.textContent = "+";
    document.body.appendChild(link);
  };

  const ensureShell = () => {
    const pageKey = document.body?.dataset?.page || "";
    if (!shellPages.has(pageKey)) return;

    document.body.classList.add("shell-managed", "has-bottom-dock");

    const topbar = document.querySelector(".topbar");
    if (topbar) {
      topbar.classList.add("shell-topbar");
      const nav = topbar.querySelector(".nav, .nav-pills");
      if (nav) nav.classList.add("hidden");
      const brand = topbar.querySelector(".brand, .brand-btn");
      if (brand) {
        brand.classList.add("brand-btn");
        brand.classList.remove("brand");
        if (!brand.querySelector("svg")) {
          brand.insertAdjacentHTML("afterbegin", brandMark);
        }
      }
    }

    if (dockMounted || document.querySelector(".bottom-dock")) return;
    dockMounted = true;

    // badge helper — pulls unread count from GreenLoop.state._unread
    const dockBadge = (key) => {
      const n = GreenLoop?.state?._unread ?? 0;
      if (key === "chat" && n > 0) return `<span class="dock-badge">${n > 9 ? "9+" : n}</span>`;
      return "";
    };

    const dock = document.createElement("nav");
    dock.className = "bottom-dock";
    dock.setAttribute("aria-label", "Primary navigation");
    dock.innerHTML = dockItems
      .map(
        (item) => `
          <a class="bottom-dock-item${item.key === pageKey ? " active" : ""}" href="${item.href}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>
            <span>${item.label}</span>
            ${dockBadge(item.key)}
          </a>
        `
      )
      .join("");
    document.body.appendChild(dock);
  };

  const fallbackImageMap = {
    furniture:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
    desk:
      "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80",
    chair:
      "https://images.unsplash.com/photo-1582582621959-48d27397dc69?auto=format&fit=crop&w=1200&q=80",
    decor:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
    electronics:
      "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80",
    kitchen:
      "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80",
    storage:
      "https://images.unsplash.com/photo-1507149833265-60c372daea22?auto=format&fit=crop&w=1200&q=80",
    default:
      "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=1200&q=80",
  };

  const getFallbackImage = (item) => {
    const category = String(item.category || "").trim().toLowerCase();
    return fallbackImageMap[category] || fallbackImageMap.default;
  };

  const getListingImage = (item) => {
    const primary = Array.isArray(item.images) ? item.images[0] : "";
    return primary || getFallbackImage(item);
  };

  const getListingVideo = (item) => {
    const primary = Array.isArray(item.videos) ? item.videos[0] : "";
    return primary || "";
  };

  const escapeHtml = (value) =>
    String(value ?? "")
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

  const showToast = (message, isError = false) => {
    const toast = $("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${isError ? "error" : ""}`;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.className = "toast";
    }, 3200);
  };

  const ensureLightbox = () => {
    if (lightboxMounted) return;
    lightboxMounted = true;
    const wrapper = document.createElement("div");
    wrapper.id = "image-lightbox";
    wrapper.className = "image-lightbox hidden";
    wrapper.innerHTML = `
      <div class="image-lightbox-shell" role="dialog" aria-modal="true" aria-label="Image viewer">
        <div class="image-lightbox-toolbar">
          <button id="image-lightbox-close" class="image-lightbox-btn" type="button" aria-label="Close image viewer">Close</button>
          <div class="image-lightbox-toolbar-group">
            <button id="image-lightbox-zoom-out" class="image-lightbox-btn" type="button" aria-label="Zoom out">-</button>
            <button id="image-lightbox-reset" class="image-lightbox-btn" type="button" aria-label="Reset zoom">100%</button>
            <button id="image-lightbox-zoom-in" class="image-lightbox-btn" type="button" aria-label="Zoom in">+</button>
          </div>
        </div>
        <div id="image-lightbox-stage" class="image-lightbox-stage">
          <img id="image-lightbox-img" class="image-lightbox-img" alt="" />
        </div>
      </div>
    `;
    document.body.appendChild(wrapper);

    const close = () => {
      wrapper.classList.add("hidden");
      wrapper.setAttribute("aria-hidden", "true");
      document.body.classList.remove("image-lightbox-open");
      const image = document.getElementById("image-lightbox-img");
      if (image) {
        image.removeAttribute("src");
      }
      lightboxState.scale = 1;
      lightboxState.translateX = 0;
      lightboxState.translateY = 0;
      lightboxState.dragging = false;
    };

    const applyTransform = () => {
      const image = document.getElementById("image-lightbox-img");
      if (!image) return;
      image.style.transform = `translate3d(${lightboxState.translateX}px, ${lightboxState.translateY}px, 0) scale(${lightboxState.scale})`;
    };

    const setScale = (nextScale) => {
      lightboxState.scale = Math.min(4, Math.max(1, nextScale));
      if (lightboxState.scale === 1) {
        lightboxState.translateX = 0;
        lightboxState.translateY = 0;
      }
      applyTransform();
    };

    wrapper.addEventListener("click", (event) => {
      if (event.target === wrapper) {
        close();
      }
    });

    document.getElementById("image-lightbox-close")?.addEventListener("click", close);
    document.getElementById("image-lightbox-zoom-in")?.addEventListener("click", () => setScale(lightboxState.scale + 0.5));
    document.getElementById("image-lightbox-zoom-out")?.addEventListener("click", () => setScale(lightboxState.scale - 0.5));
    document.getElementById("image-lightbox-reset")?.addEventListener("click", () => setScale(1));

    const stage = document.getElementById("image-lightbox-stage");
    const image = document.getElementById("image-lightbox-img");
    stage?.addEventListener("pointerdown", (event) => {
      if (lightboxState.scale <= 1 || !image) return;
      lightboxState.dragging = true;
      lightboxState.startX = event.clientX;
      lightboxState.startY = event.clientY;
      lightboxState.originX = lightboxState.translateX;
      lightboxState.originY = lightboxState.translateY;
      image.setPointerCapture?.(event.pointerId);
      stage.classList.add("dragging");
      event.preventDefault();
    });
    stage?.addEventListener("pointermove", (event) => {
      if (!lightboxState.dragging) return;
      lightboxState.translateX = lightboxState.originX + (event.clientX - lightboxState.startX);
      lightboxState.translateY = lightboxState.originY + (event.clientY - lightboxState.startY);
      applyTransform();
    });
    const stopDragging = () => {
      lightboxState.dragging = false;
      stage?.classList.remove("dragging");
    };
    stage?.addEventListener("pointerup", (event) => {
      stopDragging();
      if (event.pointerType === "touch") {
        const now = Date.now();
        if (now - lightboxState.lastTapAt < 280) {
          setScale(lightboxState.scale > 1 ? 1 : 2);
          lightboxState.lastTapAt = 0;
        } else {
          lightboxState.lastTapAt = now;
        }
      }
    });
    stage?.addEventListener("pointercancel", stopDragging);
    stage?.addEventListener("pointerleave", stopDragging);
    stage?.addEventListener("dblclick", () => setScale(lightboxState.scale > 1 ? 1 : 2));
    stage?.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        setScale(lightboxState.scale + (event.deltaY < 0 ? 0.25 : -0.25));
      },
      { passive: false }
    );

    document.addEventListener("keydown", (event) => {
      if (wrapper.classList.contains("hidden")) return;
      if (event.key === "Escape") close();
    });

    wrapper._close = close;
    wrapper._applyTransform = applyTransform;
    wrapper._setScale = setScale;
  };

  const openImageLightbox = (src, alt = "Image") => {
    if (!src) return;
    ensureLightbox();
    const wrapper = document.getElementById("image-lightbox");
    const image = document.getElementById("image-lightbox-img");
    if (!wrapper || !image) return;
    lightboxState.scale = 1;
    lightboxState.translateX = 0;
    lightboxState.translateY = 0;
    lightboxState.dragging = false;
    image.src = src;
    image.alt = alt;
    wrapper.classList.remove("hidden");
    wrapper.setAttribute("aria-hidden", "false");
    document.body.classList.add("image-lightbox-open");
    wrapper._applyTransform?.();
  };

  const authHeaders = () => (state.token ? { Authorization: `Bearer ${state.token}` } : {});
  const getPostLoginPath = (user = state.user) => (user?.isAdmin ? "/admin" : "/dashboard");

  const api = async (url, options = {}) => {
    const headers = { ...(options.headers || {}), ...authHeaders() };
    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  };

  const setSession = (payload) => {
    state.token = payload?.token || "";
    state.user = payload?.user || null;
    if (state.token) localStorage.setItem("greenloop_token", state.token);
    else localStorage.removeItem("greenloop_token");
    updateChrome();
  };

  const clearSession = () => {
    state.token = "";
    state.user = null;
    localStorage.removeItem("greenloop_token");
    updateChrome();
  };

  const updateChrome = () => {
    ensureShell();
    const badge = $("#session-badge");
    if (badge) {
      badge.classList.toggle("hidden", !state.user);
      badge.innerHTML = state.user
        ? `
            <a class="session-badge-link" href="/seller?id=${state.user.id}" aria-label="Open profile">
              <span class="session-avatar-wrap">
                ${state.user.avatarUrl ? `<img class="session-avatar" src="${escapeHtml(state.user.avatarUrl)}" alt="${escapeHtml(state.user.fullName)}" />` : `<span class="session-avatar session-avatar-fallback">${escapeHtml(getInitials(state.user.fullName))}</span>`}
              </span>
              <span class="session-copy">
                <strong>${escapeHtml(state.user.fullName)}</strong>
                <span>${escapeHtml(state.user.verificationStatus)}</span>
              </span>
            </a>
          `
        : `<strong>Guest</strong><span>Not signed in</span>`;
    }

    const logoutButton = $("#logout-button");
    if (logoutButton) logoutButton.classList.toggle("hidden", !state.token);

    document.querySelectorAll('[data-auth="guest"]').forEach((element) => {
      element.classList.toggle("hidden", !!state.token);
    });
    document.querySelectorAll('[data-auth="user"]').forEach((element) => {
      element.classList.toggle("hidden", !state.token);
    });

    const adminLink = $("#admin-link");
    if (adminLink) {
      adminLink.classList.toggle("hidden", !state.user?.isAdmin);
    }

    ensureFab();
    const fab = $("#floating-plus-btn");
    if (fab) {
      const onSellPage = window.location.pathname === "/sell";
      fab.classList.toggle("hidden", !state.token || onSellPage);
    }
  };

  const requireAuth = async () => {
    if (!state.token) {
      window.location.href = "/login";
      throw new Error("Authentication required.");
    }
    const data = await api("/api/auth/me");
    state.user = data.user;
    updateChrome();
    return data.user;
  };

  const bootstrap = async ({ protectedPage = false, redirectAuthedTo = null } = {}) => {
    try {
      if (state.token) {
        const data = await api("/api/auth/me");
        state.user = data.user;
      }
    } catch {
      clearSession();
    }

    updateChrome();

    if (redirectAuthedTo && state.user) {
      const targetPath =
        redirectAuthedTo === "/dashboard" ? getPostLoginPath(state.user) : redirectAuthedTo;
      window.location.replace(targetPath);
      return null;
    }
    if (protectedPage) {
      return requireAuth();
    }
    return state.user;
  };

  const wireLogout = () => {
    const button = $("#logout-button");
    if (!button) return;
    button.addEventListener("click", () => {
      clearSession();
      showToast("Logged out.");
      window.location.href = "/";
    });
  };

  const wireListingChatButtons = (target) => {
    target.querySelectorAll(".listing-chat-button").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const conversation = await api("/api/chats/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: Number(button.dataset.itemId) }),
          });
          window.location.href = `/chat?conversation=${conversation.id}`;
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });
  };

  const renderItems = (items, targetId = "items") => {
    const target = document.getElementById(targetId);
    if (!target) return;
    if (!items.length) {
      target.innerHTML = '<p class="empty">No listings found yet.</p>';
      return;
    }
    target.innerHTML = items
      .map(
        (item) => {
          const videoUrl = getListingVideo(item);
          return `
        <article class="listing-card">
          <a class="listing-image-link" href="/item?id=${item.id}">
            <div class="listing-image${videoUrl ? " has-video" : ""}"${videoUrl ? "" : ` style="background-image:url('${getListingImage(item)}')"`}>
              ${
                videoUrl
                  ? `<video class="listing-video" src="${escapeHtml(videoUrl)}" poster="${escapeHtml(getListingImage(item))}" autoplay muted loop playsinline controls preload="metadata"></video>`
                  : ""
              }
              <div class="listing-badge-row">
                <span class="listing-badge">#${item.id}</span>
                <span class="listing-badge listing-badge-soft">${escapeHtml(item.condition_status)}</span>
              </div>
              <div class="listing-image-overlay">
                <strong>${escapeHtml(item.category)}</strong>
                <small>${escapeHtml(item.location || "Pickup location on request")}</small>
              </div>
            </div>
          </a>
          <div class="listing-body">
            <div class="listing-head">
              <div class="listing-title-block">
                <h3><a href="/item?id=${item.id}">${escapeHtml(item.title)}</a></h3>
                <p class="listing-subline">${escapeHtml(item.status)} · ${escapeHtml(item.category)}</p>
              </div>
              <strong class="listing-price">NZ$${Number(item.price).toFixed(0)}</strong>
            </div>
            <p class="listing-summary">${escapeHtml(item.description)}</p>
            <div class="listing-meta-grid">
              <span class="meta-pill">${escapeHtml(item.location || "Location on request")}</span>
              <span class="meta-pill">${escapeHtml(item.condition_status)}</span>
              <span class="meta-pill">${escapeHtml(item.pickup_windows || "Flexible pickup")}</span>
              <span class="meta-pill">${escapeHtml(item.seller_verification)}</span>
            </div>
            <div class="listing-seller-row">
              <span class="seller-label">Seller</span>
              <a class="listing-seller-link" href="/seller?id=${item.seller_id}">${escapeHtml(item.seller_name)}</a>
            </div>
            <div class="listing-actions">
              <small class="listing-pickup">Fast view, clear price, ready to reserve.</small>
              <div class="cta-row">
                ${state.user && Number(state.user.id) !== Number(item.seller_id) ? `<button class="ghost-button listing-chat-button" data-item-id="${item.id}" type="button">Chat seller</button>` : ""}
                <a class="ghost-link" href="/item?id=${item.id}">View item →</a>
              </div>
            </div>
          </div>
        </article>
      `;
        }
      )
      .join("");
    wireListingChatButtons(target);
  };

  const renderMiniItems = (items, targetId = "related-items") => {
    const target = document.getElementById(targetId);
    if (!target) return;
    if (!items.length) {
      target.innerHTML = '<p class="empty">No related items yet.</p>';
      return;
    }
    target.innerHTML = items
      .map(
        (item) => `
        <article class="mini-listing-card">
          <a class="mini-listing-image" href="/item?id=${item.id}" style="background-image:url('${getListingImage(item)}')"></a>
          <div class="mini-listing-copy">
            <h3><a href="/item?id=${item.id}">${escapeHtml(item.title)}</a></h3>
            <p>${escapeHtml(item.location)}</p>
            <strong>NZ$${Number(item.price).toFixed(2)}</strong>
          </div>
        </article>
      `
      )
      .join("");
  };

  const renderSellerBadge = (seller) => `
    <div class="seller-chip">
      <strong>${escapeHtml(seller.fullName)}</strong>
      <span>${escapeHtml(seller.schoolName)} · ${escapeHtml(seller.verificationStatus)}</span>
    </div>
  `;

  const renderOpportunities = (items, targetId = "opportunities-list") => {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = items
      .map(
        (item) => `
        <article class="opportunity-card">
          <div>
            <h3>${item.title}</h3>
            <p>${item.org_name} · ${item.opportunity_type} · ${item.location}</p>
            <p>${item.summary}</p>
            <small>${(item.skills || []).join(", ")}</small>
          </div>
          ${item.apply_url ? `<a href="${item.apply_url}" target="_blank" rel="noreferrer">Apply</a>` : ""}
        </article>
      `
      )
      .join("");
  };

  return {
    $,
    api,
    state,
    setSession,
    clearSession,
    getPostLoginPath,
    showToast,
    bootstrap,
    requireAuth,
    wireLogout,
    renderItems,
    renderMiniItems,
    renderOpportunities,
    renderSellerBadge,
    getListingImage,
    openImageLightbox,
  };
})();

GreenLoop.wireLogout();
