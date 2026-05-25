const GreenLoop = (() => {
  const state = {
    token: localStorage.getItem("greenloop_token") || "",
    user: null,
  };

  const $ = (selector) => document.querySelector(selector);
  let fabMounted = false;
  let dockMounted = false;

  const shellPages = new Set(["home", "marketplace", "sell", "services", "opportunities", "chat", "community"]);
  const pageMeta = {
    home: {
      title: "GreenLoop NZ | Student Marketplace, Services, and Jobs",
      description: "GreenLoop is a student-first platform for buying, selling, logistics help, and campus job discovery in one flow.",
    },
    marketplace: {
      title: "Marketplace | GreenLoop NZ",
      description: "Browse student listings with clearer trust, condition, pickup, and price signals.",
    },
    sell: {
      title: "Sell | GreenLoop NZ",
      description: "Publish a student listing with structured details, delivery options, and pickup windows.",
    },
    services: {
      title: "Services | GreenLoop NZ",
      description: "Book pickup, delivery, cleaning, repair, or donation support around marketplace activity.",
    },
    opportunities: {
      title: "Jobs | GreenLoop NZ",
      description: "Discover student-friendly roles, internships, and campus opportunities without leaving GreenLoop.",
    },
    community: {
      title: "Community | GreenLoop NZ",
      description: "Follow the campus feed, post updates, and keep marketplace activity connected to student community signals.",
    },
    chat: {
      title: "Chat | GreenLoop NZ",
      description: "Manage buyer-seller conversations and listing handoffs from the GreenLoop inbox.",
    },
    item: {
      title: "Item Detail | GreenLoop NZ",
      description: "Review listing details, seller trust, and service handoff options before you commit.",
    },
    seller: {
      title: "Seller Profile | GreenLoop NZ",
      description: "See seller details, active listings, and verification context before messaging or reserving.",
    },
    login: {
      title: "Login | GreenLoop NZ",
      description: "Sign in to manage listings, messages, support, and student account activity.",
    },
    register: {
      title: "Register | GreenLoop NZ",
      description: "Create a verified University of Auckland account for the GreenLoop marketplace.",
    },
    "forgot-password": {
      title: "Forgot Password | GreenLoop NZ",
      description: "Request a secure password reset for your GreenLoop account.",
    },
    "reset-password": {
      title: "Reset Password | GreenLoop NZ",
      description: "Set a new password for your GreenLoop account.",
    },
    help: {
      title: "Help | GreenLoop NZ",
      description: "Contact support, report safety issues, and ask for follow-up from the GreenLoop team.",
    },
    trust: {
      title: "Trust & Safety | GreenLoop NZ",
      description: "See how GreenLoop handles verification, moderation, uploads, and student safety signals.",
    },
    privacy: {
      title: "Privacy | GreenLoop NZ",
      description: "Understand what GreenLoop stores, why it stores it, and how support and moderation data is handled.",
    },
    terms: {
      title: "Terms | GreenLoop NZ",
      description: "Read the operating terms for listings, services, applications, and enforcement on GreenLoop.",
    },
    dashboard: {
      title: "Dashboard | GreenLoop NZ",
      description: "Manage your GreenLoop account, listings, reservations, notifications, and memberships.",
    },
    admin: {
      title: "Admin | GreenLoop NZ",
      description: "Operate moderation, support, listings, and operational workflows from the GreenLoop admin surface.",
    },
    "not-found": {
      title: "Page Not Found | GreenLoop NZ",
      description: "The requested GreenLoop page could not be found. Return to marketplace, services, jobs, or support.",
    },
  };

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

  const ensureGlobalFooter = () => {
    if (document.querySelector(".site-footer")) return;
    const footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="site-footer-inner">
        <div class="site-footer-brand">
          <strong>GreenLoop NZ</strong>
          <span>Student marketplace, logistics, jobs, and support in one flow.</span>
        </div>
        <nav class="site-footer-links" aria-label="Site links">
          <a href="/help">Help</a>
          <a href="/trust">Trust & Safety</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </div>
    `;
    document.body.appendChild(footer);
  };

  const ensureAdminShortcut = () => {
    let shortcut = document.getElementById("admin-shortcut");
    if (!shortcut) {
      shortcut = document.createElement("a");
      shortcut.id = "admin-shortcut";
      shortcut.className = "admin-shortcut hidden";
      shortcut.href = "/admin";
      shortcut.setAttribute("aria-label", "Open admin control");
      document.body.appendChild(shortcut);
    }
    shortcut.innerHTML = `
      <span class="admin-shortcut-kicker">Admin</span>
      <strong>${window.location.pathname === "/admin" ? "Control live" : "Open control"}</strong>
    `;
    shortcut.classList.toggle("hidden", !state.user?.isAdmin);
    shortcut.classList.toggle("admin-shortcut-on-admin", window.location.pathname === "/admin");
  };

  const upsertMeta = (name, content, attribute = "name") => {
    let tag = document.head.querySelector(`meta[${attribute}="${name}"]`);
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute(attribute, name);
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", content);
  };

  const upsertLink = (rel, href) => {
    let tag = document.head.querySelector(`link[rel="${rel}"]`);
    if (!tag) {
      tag = document.createElement("link");
      tag.setAttribute("rel", rel);
      document.head.appendChild(tag);
    }
    tag.setAttribute("href", href);
  };

  const ensureDocumentMeta = () => {
    const pageKey = document.body?.dataset?.page || "home";
    const meta = pageMeta[pageKey] || pageMeta.home;
    const allowCanonicalSearch = new Set(["item", "seller", "marketplace", "opportunities"]);
    const url = `${window.location.origin}${window.location.pathname}${allowCanonicalSearch.has(pageKey) ? window.location.search : ""}`;
    const title = meta.title || document.title || "GreenLoop NZ";
    const description = meta.description || pageMeta.home.description;

    if (!(pageKey === "chat" && /^\(\d+\)/.test(document.title))) {
      document.title = title;
    }

    upsertMeta("description", description);
    upsertMeta("theme-color", "#14532d");
    upsertMeta("og:title", title, "property");
    upsertMeta("og:description", description, "property");
    upsertMeta("og:type", "website", "property");
    upsertMeta("og:url", url, "property");
    upsertMeta("twitter:card", "summary_large_image");

    upsertLink("canonical", url);
    upsertLink("icon", "/favicon.svg");
    upsertLink("manifest", "/site.webmanifest");
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

  const authHeaders = () => (state.token ? { Authorization: `Bearer ${state.token}` } : {});

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
    ensureDocumentMeta();
    ensureShell();
    ensureGlobalFooter();
    ensureAdminShortcut();
    const badge = $("#session-badge");
    if (badge) {
      badge.classList.toggle("hidden", !state.user);
      badge.innerHTML = state.user
        ? `
            <a class="session-badge-link session-badge-link-tpl" href="/seller?id=${state.user.id}" aria-label="Open profile">
              <span class="session-avatar-wrap">
                ${state.user.avatarUrl ? `<img class="session-avatar" src="${escapeHtml(state.user.avatarUrl)}" alt="${escapeHtml(state.user.fullName)}" />` : `<span class="session-avatar session-avatar-fallback">${escapeHtml(getInitials(state.user.fullName))}</span>`}
              </span>
              <span class="session-copy">
                <strong>${escapeHtml(state.user.fullName)}</strong>
                <span>${escapeHtml(state.user.verificationStatus)}${state.user?.isAdmin ? " · Admin" : ""}</span>
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
    if (state.user && window.location.pathname === "/admin" && !state.user?.isAdmin) {
      window.location.href = "/dashboard";
      return;
    }

    ensureFab();
    const fab = $("#floating-plus-btn");
    if (fab) {
      const onSellPage = window.location.pathname === "/sell";
      fab.classList.toggle("hidden", !state.token || onSellPage);
    }

    // Avatar: admins go to /admin, regular users go to their seller profile
    const avatarLink = document.querySelector(".session-badge-link-tpl");
    if (avatarLink) {
      if (state.user?.isAdmin) {
        avatarLink.href = "/admin";
        avatarLink.setAttribute("aria-label", "Admin panel");
        avatarLink.classList.add("session-badge-admin");
      } else {
        avatarLink.href = "/seller?id=" + (state.user?.id || "");
      }
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

  const resolvePostAuthRedirect = (redirectAuthedTo, user = state.user) => {
    if (!redirectAuthedTo) return null;
    if (typeof redirectAuthedTo === "function") return redirectAuthedTo(user);
    if (redirectAuthedTo === "/dashboard") return getPostLoginPath(user);
    return redirectAuthedTo;
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
      const nextPath = resolvePostAuthRedirect(redirectAuthedTo, state.user);
      if (nextPath) {
        window.location.replace(nextPath);
      }
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
    button.addEventListener("click", (e) => {
      e.preventDefault();
      const itemId = button.dataset.itemId;
      window.location.href = `/chat?conversation=new&itemId=${itemId}`;
    });
  });
  // Delete button — owner or admin
  target.querySelectorAll(".listing-delete-btn").forEach((button) => {
    button.addEventListener("click", async (e) => {
      e.preventDefault();
      const itemId = button.dataset.itemId;
      const itemTitle = button.dataset.itemTitle;
      if (!confirm(`Delete "${itemTitle}"? This cannot be undone.`)) return;
      try {
        await api(`/api/items/${itemId}`, { method: "DELETE" });
        showToast("Item deleted.");
        const data = await api("/api/items");
        renderItems(data.items || []);
      } catch (err) {
        showToast(err.message || "Delete failed.", true);
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
        (item) => `
        <article class="listing-card">
          <a class="listing-image-link" href="/item?id=${item.id}">
            <div class="listing-image" style="background-image:url('${getListingImage(item)}')">
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
                ${state.user && (Number(state.user.id) === Number(item.seller_id) || state.user.isAdmin) ? `<button class="listing-delete-btn" data-item-id="${item.id}" data-item-title="${escapeHtml(item.title)}" type="button" style="color:#e4393c;font-weight:700">Delete</button>` : ""}
                <a class="ghost-link" href="/item?id=${item.id}">View item →</a>
              </div>
            </div>
          </div>
        </article>
      `
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

  const getPostLoginPath = (user = state.user) => {
    if (user?.isAdmin) return "/admin";
    return "/dashboard";
  };

  return {
    $,
    api,
    state,
    setSession,
    clearSession,
    showToast,
    bootstrap,
    requireAuth,
    wireLogout,
    renderItems,
    renderMiniItems,
    renderOpportunities,
    renderSellerBadge,
    getListingImage,
    getPostLoginPath,
  };
})();

GreenLoop.wireLogout();
