const adminState = {
  editingUserId: null,
};

const formatAdminTime = (value) => {
  if (!value) return "";
  return new Date(value).toLocaleString("en-NZ", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const renderAdminStats = (totals) => {
  const target = document.getElementById("admin-stats");
  target.innerHTML = `
    <article class="mini-stat"><strong>${totals.users}</strong><span>registered users</span></article>
    <article class="mini-stat"><strong>${totals.posts}</strong><span>community posts</span></article>
    <article class="mini-stat"><strong>${totals.activity}</strong><span>tracked behavior events</span></article>
    <article class="mini-stat"><strong>${totals.pendingVerifications}</strong><span>pending verification checks</span></article>
  `;
};

const fillAdminForm = (user = null) => {
  adminState.editingUserId = user ? user.id : null;
  document.getElementById("admin-user-full-name").value = user?.fullName || "";
  document.getElementById("admin-user-email").value = user?.email || "";
  document.getElementById("admin-user-email").disabled = !!user;
  document.getElementById("admin-user-password").value = "";
  document.getElementById("admin-user-password").toggleAttribute("required", !user);
  document.getElementById("admin-user-school").value = user?.schoolName || "University of Auckland";
  document.getElementById("admin-user-student-id").value = user?.studentId || "";
  document.getElementById("admin-user-verification").value = user?.verificationStatus || "verified";
  document.getElementById("admin-user-premium").checked = !!user?.isPremium;
  document.getElementById("admin-user-submit").textContent = user ? "Update user" : "Create user";
  document.getElementById("admin-user-cancel").classList.toggle("hidden", !user);
};

const renderAdminUsers = (users) => {
  const target = document.getElementById("admin-user-list");
  if (!users.length) {
    target.innerHTML = '<p class="empty">No users found.</p>';
    return;
  }
  target.innerHTML = users
    .map(
      (user) => `
        <article class="data-row admin-user-row">
          <div class="admin-user-head">
            <div>${GreenLoop.renderSellerBadge(user)}</div>
            <div class="admin-user-meta">
              <span>${user.email}</span>
              <span>${user.studentId || "No student id"} · ${user.isPremium ? "Premium" : "Standard"}</span>
            </div>
          </div>
          <div class="cta-row">
            <button class="admin-edit" data-id="${user.id}" type="button">Edit</button>
            <button class="ghost-button admin-delete" data-id="${user.id}" type="button">Delete</button>
          </div>
        </article>
      `
    )
    .join("");

  target.querySelectorAll(".admin-edit").forEach((button) => {
    button.addEventListener("click", () => {
      const user = users.find((entry) => Number(entry.id) === Number(button.dataset.id));
      fillAdminForm(user);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  target.querySelectorAll(".admin-delete").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this user account?")) return;
      try {
        await GreenLoop.api(`/api/admin/users/${button.dataset.id}`, { method: "DELETE" });
        GreenLoop.showToast("User deleted.");
        await bootAdmin();
      } catch (error) {
        GreenLoop.showToast(error.message, true);
      }
    });
  });
};

const renderAdminQueue = (users) => {
  const target = document.getElementById("admin-verification-list");
  if (!users.length) {
    target.innerHTML = '<p class="empty">No pending verification requests.</p>';
    return;
  }
  target.innerHTML = users
    .map(
      (user) => `
        <article class="data-row">
          <strong>${user.fullName}</strong>
          <span>${user.email} · ${user.schoolName} · ${user.studentId}</span>
          <div class="cta-row">
            <button class="queue-action" data-id="${user.id}" data-status="verified" type="button">Verify</button>
            <button class="ghost-button queue-action" data-id="${user.id}" data-status="rejected" type="button">Reject</button>
          </div>
        </article>
      `
    )
    .join("");

  target.querySelectorAll(".queue-action").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await GreenLoop.api(`/api/admin/users/${button.dataset.id}/verification`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: button.dataset.status }),
        });
        GreenLoop.showToast(`User ${button.dataset.status}.`);
        await bootAdmin();
      } catch (error) {
        GreenLoop.showToast(error.message, true);
      }
    });
  });
};

const renderAdminActivity = (logs) => {
  const target = document.getElementById("admin-activity-list");
  if (!logs.length) {
    target.innerHTML = '<p class="empty">No tracked activity yet.</p>';
    return;
  }
  target.innerHTML = logs
    .map(
      (log) => `
        <article class="data-row admin-activity-row">
          <strong>${log.action}</strong>
          <span>${log.actor ? `${log.actor.fullName} · ${log.actor.email}` : "System"} · ${formatAdminTime(log.createdAt)}</span>
          <span>${log.entityType || "event"}${log.entityId ? ` #${log.entityId}` : ""}${log.ipAddress ? ` · ${log.ipAddress}` : ""}</span>
          ${log.metadata ? `<code class="admin-meta-code">${JSON.stringify(log.metadata)}</code>` : ""}
        </article>
      `
    )
    .join("");
};

const bootAdmin = async () => {
  const currentUser = await GreenLoop.bootstrap({ protectedPage: true });
  if (!currentUser?.isAdmin) throw new Error("Administrator access required.");

  const query = document.getElementById("admin-user-search")?.value?.trim() || "";
  const [summary, users, queue, activity] = await Promise.all([
    GreenLoop.api("/api/admin/summary"),
    GreenLoop.api(`/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`),
    GreenLoop.api("/api/admin/verification-queue"),
    GreenLoop.api("/api/admin/activity"),
  ]);

  renderAdminStats(summary.totals);
  renderAdminUsers(users.users || []);
  renderAdminQueue(queue.users || []);
  renderAdminActivity(activity.logs || []);
};

document.getElementById("admin-user-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    fullName: document.getElementById("admin-user-full-name").value,
    email: document.getElementById("admin-user-email").value,
    password: document.getElementById("admin-user-password").value,
    schoolName: document.getElementById("admin-user-school").value,
    studentId: document.getElementById("admin-user-student-id").value,
    verificationStatus: document.getElementById("admin-user-verification").value,
    isPremium: document.getElementById("admin-user-premium").checked,
  };
  try {
    if (adminState.editingUserId) {
      await GreenLoop.api(`/api/admin/users/${adminState.editingUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      GreenLoop.showToast("User updated.");
    } else {
      await GreenLoop.api("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      GreenLoop.showToast("User created.");
    }
    fillAdminForm(null);
    await bootAdmin();
  } catch (error) {
    GreenLoop.showToast(error.message, true);
  }
});

document.getElementById("admin-user-cancel")?.addEventListener("click", () => {
  fillAdminForm(null);
});

document.getElementById("admin-user-search")?.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  await bootAdmin();
});

fillAdminForm(null);
bootAdmin().catch((error) => GreenLoop.showToast(error.message, true));
