const adminState = {
  editingUserId: null,
  editingItemId: null,
  editingOpportunityId: null,
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
    <article class="mini-stat"><strong>${totals.opsRequests}</strong><span>ops requests</span></article>
    <article class="mini-stat"><strong>${totals.applications}</strong><span>job applications</span></article>
    <article class="mini-stat"><strong>${totals.supportRequests || 0}</strong><span>support requests</span></article>
  `;
};

const splitCsv = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

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

const fillItemForm = (item = null) => {
  adminState.editingItemId = item ? item.id : null;
  document.getElementById("admin-item-title").value = item?.title || "";
  document.getElementById("admin-item-description").value = item?.description || "";
  document.getElementById("admin-item-category").value = item?.category || "";
  document.getElementById("admin-item-condition").value = item?.conditionStatus || "";
  document.getElementById("admin-item-location").value = item?.location || "";
  document.getElementById("admin-item-price").value = item?.price ?? "";
  document.getElementById("admin-item-pickup").value = item?.pickupWindows || "";
  document.getElementById("admin-item-status").value = item?.status || "available";
  document.getElementById("admin-item-images").value = (item?.images || []).join(", ");
  document.getElementById("admin-item-delivery").value = (item?.deliveryOptions || []).join(", ");
  document.getElementById("admin-item-donation").checked = !!item?.donationAvailable;
  document.getElementById("admin-item-submit").textContent = item ? "Update listing" : "Choose listing below";
  document.getElementById("admin-item-cancel").classList.toggle("hidden", !item);
};

const fillOpportunityForm = (opportunity = null) => {
  adminState.editingOpportunityId = opportunity ? opportunity.id : null;
  document.getElementById("admin-opportunity-title").value = opportunity?.title || "";
  document.getElementById("admin-opportunity-org").value = opportunity?.orgName || "";
  document.getElementById("admin-opportunity-type").value = opportunity?.opportunityType || "internship";
  document.getElementById("admin-opportunity-location").value = opportunity?.location || "";
  document.getElementById("admin-opportunity-skills").value = (opportunity?.skills || []).join(", ");
  document.getElementById("admin-opportunity-apply-url").value = opportunity?.applyUrl || "";
  document.getElementById("admin-opportunity-summary").value = opportunity?.summary || "";
  document.getElementById("admin-opportunity-submit").textContent = opportunity ? "Update role" : "Post new role";
  document.getElementById("admin-opportunity-cancel").classList.toggle("hidden", !opportunity);
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

const renderOpsRequests = (requests) => {
  const target = document.getElementById("admin-ops-list");
  if (!target) return;
  if (!requests.length) {
    target.innerHTML = '<p class="empty">No operations requests yet.</p>';
    return;
  }
  target.innerHTML = requests
    .map(
      (request) => `
        <article class="data-row admin-activity-row">
          <strong>${request.type}</strong>
          <span>${request.requesterName} · ${request.requesterEmail} · ${formatAdminTime(request.createdAt)}</span>
          <span>${request.itemTitle ? `${request.itemTitle}` : "No item linked"}${request.requestedTime ? ` · ${request.requestedTime}` : ""}</span>
          <code class="admin-meta-code">${request.status} · ${request.details || "No details"}</code>
          <div class="cta-row">
            <select class="ops-status-select" data-id="${request.id}" data-type="${request.type}">
              ${(
                {
                  reservation: ["pending", "confirmed", "completed", "cancelled"],
                  delivery: ["requested", "scheduled", "completed"],
                  service: ["requested", "in_progress", "completed"],
                  donation: ["submitted", "accepted", "completed"],
                }[request.type] || [request.status]
              )
                .map((status) => `<option value="${status}" ${status === request.status ? "selected" : ""}>${status}</option>`)
                .join("")}
            </select>
            <button class="ops-status-save" data-id="${request.id}" data-type="${request.type}" type="button">Save</button>
          </div>
        </article>
      `
    )
    .join("");

  target.querySelectorAll(".ops-status-save").forEach((button) => {
    button.addEventListener("click", async () => {
      const select = target.querySelector(`.ops-status-select[data-type="${button.dataset.type}"][data-id="${button.dataset.id}"]`);
      if (!select) return;
      try {
        await GreenLoop.api(`/api/admin/ops-requests/${button.dataset.type}/${button.dataset.id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: select.value }),
        });
        GreenLoop.showToast("Operations request updated.");
        await bootAdmin();
      } catch (error) {
        GreenLoop.showToast(error.message, true);
      }
    });
  });
};

const renderAdminItems = (items) => {
  const target = document.getElementById("admin-item-list");
  if (!target) return;
  if (!items.length) {
    target.innerHTML = '<p class="empty">No marketplace listings found.</p>';
    return;
  }
  target.innerHTML = items
    .map(
      (item) => `
        <article class="data-row admin-activity-row">
          <strong>${item.title}</strong>
          <span>${item.sellerName} · ${item.sellerEmail} · ${item.location} · NZ$${Number(item.price || 0).toFixed(2)}</span>
          <span>${item.category} · ${item.conditionStatus} · ${item.status} · ${formatAdminTime(item.createdAt)}</span>
          <code class="admin-meta-code">${item.description || "No description"}</code>
          <div class="cta-row">
            <button class="admin-item-edit" data-id="${item.id}" type="button">Edit</button>
            <button class="ghost-button admin-item-delete" data-id="${item.id}" type="button">Delete</button>
          </div>
        </article>
      `
    )
    .join("");

  target.querySelectorAll(".admin-item-edit").forEach((button) => {
    button.addEventListener("click", () => {
      const item = items.find((entry) => Number(entry.id) === Number(button.dataset.id));
      fillItemForm(item);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  target.querySelectorAll(".admin-item-delete").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this listing?")) return;
      try {
        await GreenLoop.api(`/api/admin/items/${button.dataset.id}`, { method: "DELETE" });
        GreenLoop.showToast("Listing deleted.");
        if (Number(adminState.editingItemId) === Number(button.dataset.id)) fillItemForm(null);
        await bootAdmin();
      } catch (error) {
        GreenLoop.showToast(error.message, true);
      }
    });
  });
};

const renderAdminOpportunities = (opportunities) => {
  const target = document.getElementById("admin-opportunity-list");
  if (!target) return;
  if (!opportunities.length) {
    target.innerHTML = '<p class="empty">No campus opportunities found.</p>';
    return;
  }
  target.innerHTML = opportunities
    .map(
      (item) => `
        <article class="data-row admin-activity-row">
          <strong>${item.title}</strong>
          <span>${item.orgName} · ${item.opportunityType} · ${item.location} · ${item.applicationCount} applications</span>
          <span>${item.creatorName || "Admin"}${item.creatorEmail ? ` · ${item.creatorEmail}` : ""} · ${formatAdminTime(item.createdAt)}</span>
          <code class="admin-meta-code">${item.summary || "No summary"}</code>
          <div class="cta-row">
            <button class="admin-opportunity-edit" data-id="${item.id}" type="button">Edit</button>
            <button class="ghost-button admin-opportunity-delete" data-id="${item.id}" type="button">Delete</button>
          </div>
        </article>
      `
    )
    .join("");

  target.querySelectorAll(".admin-opportunity-edit").forEach((button) => {
    button.addEventListener("click", () => {
      const item = opportunities.find((entry) => Number(entry.id) === Number(button.dataset.id));
      fillOpportunityForm(item);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  target.querySelectorAll(".admin-opportunity-delete").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Delete this opportunity?")) return;
      try {
        await GreenLoop.api(`/api/admin/opportunities/${button.dataset.id}`, { method: "DELETE" });
        GreenLoop.showToast("Opportunity deleted.");
        if (Number(adminState.editingOpportunityId) === Number(button.dataset.id)) fillOpportunityForm(null);
        await bootAdmin();
      } catch (error) {
        GreenLoop.showToast(error.message, true);
      }
    });
  });
};

const renderSupportRequests = (requests) => {
  const target = document.getElementById("admin-support-list");
  if (!target) return;
  if (!requests.length) {
    target.innerHTML = '<p class="empty">No support requests yet.</p>';
    return;
  }
  target.innerHTML = requests
    .map(
      (request) => `
        <article class="data-row admin-activity-row">
          <strong>${request.category}</strong>
          <span>${request.fullName} · ${request.email} · ${formatAdminTime(request.createdAt)}</span>
          <span>${request.pageUrl || "No page URL provided"}</span>
          <code class="admin-meta-code">${request.message}</code>
          <div class="cta-row">
            <select class="support-status-select" data-id="${request.id}">
              ${["open", "reviewing", "resolved"]
                .map((status) => `<option value="${status}" ${status === request.status ? "selected" : ""}>${status}</option>`)
                .join("")}
            </select>
            <button class="support-status-save" data-id="${request.id}" type="button">Save</button>
          </div>
        </article>
      `
    )
    .join("");

  target.querySelectorAll(".support-status-save").forEach((button) => {
    button.addEventListener("click", async () => {
      const select = target.querySelector(`.support-status-select[data-id="${button.dataset.id}"]`);
      if (!select) return;
      try {
        await GreenLoop.api(`/api/admin/support-requests/${button.dataset.id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: select.value }),
        });
        GreenLoop.showToast("Support request updated.");
        await bootAdmin();
      } catch (error) {
        GreenLoop.showToast(error.message, true);
      }
    });
  });
};

const renderOpportunityApplications = (applications) => {
  const target = document.getElementById("admin-opportunity-applications");
  if (!target) return;
  if (!applications.length) {
    target.innerHTML = '<p class="empty">No applications yet.</p>';
    return;
  }

  target.innerHTML = applications
    .map(
      (application) => `
        <article class="data-row admin-activity-row">
          <strong>${application.opportunityTitle}</strong>
          <span>${application.applicantName} · ${application.applicantEmail}${application.applicantPhone ? ` · ${application.applicantPhone}` : ""}</span>
          <span>${application.orgName} · ${formatAdminTime(application.createdAt)} · ${application.status}</span>
          ${application.coverMessage ? `<code class="admin-meta-code">${application.coverMessage}</code>` : ""}
          <div class="cta-row">
            ${application.cvUrl ? `<a class="ghost-button" href="${application.cvUrl}" target="_blank" rel="noopener">Open CV</a>` : ""}
            <button class="application-status" data-id="${application.id}" data-status="reviewed" type="button">Mark reviewed</button>
            <button class="ghost-button application-status" data-id="${application.id}" data-status="rejected" type="button">Reject</button>
          </div>
        </article>
      `
    )
    .join("");

  target.querySelectorAll(".application-status").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await GreenLoop.api(`/api/admin/opportunity-applications/${button.dataset.id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: button.dataset.status }),
        });
        GreenLoop.showToast(`Application marked ${button.dataset.status}.`);
        await bootAdmin();
      } catch (error) {
        GreenLoop.showToast(error.message, true);
      }
    });
  });
};

const bootAdmin = async () => {
  const currentUser = await GreenLoop.bootstrap({ protectedPage: true });
  if (!currentUser?.isAdmin) throw new Error("Administrator access required.");

  const query = document.getElementById("admin-user-search")?.value?.trim() || "";
  const [summary, users, queue, activity, ops, support, items, opportunities, applications] = await Promise.all([
    GreenLoop.api("/api/admin/summary"),
    GreenLoop.api(`/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`),
    GreenLoop.api("/api/admin/verification-queue"),
    GreenLoop.api("/api/admin/activity"),
    GreenLoop.api("/api/admin/ops-requests"),
    GreenLoop.api("/api/admin/support-requests"),
    GreenLoop.api(`/api/admin/items${query ? `?q=${encodeURIComponent(query)}` : ""}`),
    GreenLoop.api("/api/admin/opportunities"),
    GreenLoop.api("/api/admin/opportunity-applications"),
  ]);

  renderAdminStats(summary.totals);
  renderAdminUsers(users.users || []);
  renderAdminQueue(queue.users || []);
  renderAdminActivity(activity.logs || []);
  renderOpsRequests(ops.requests || []);
  renderSupportRequests(support.requests || []);
  renderAdminItems(items.items || []);
  renderAdminOpportunities(opportunities.opportunities || []);
  renderOpportunityApplications(applications.applications || []);
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

document.getElementById("admin-item-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!adminState.editingItemId) {
    GreenLoop.showToast("Choose a listing from the inventory below first.", true);
    return;
  }
  const payload = {
    title: document.getElementById("admin-item-title").value,
    description: document.getElementById("admin-item-description").value,
    category: document.getElementById("admin-item-category").value,
    conditionStatus: document.getElementById("admin-item-condition").value,
    location: document.getElementById("admin-item-location").value,
    price: document.getElementById("admin-item-price").value,
    pickupWindows: document.getElementById("admin-item-pickup").value,
    status: document.getElementById("admin-item-status").value,
    images: splitCsv(document.getElementById("admin-item-images").value),
    deliveryOptions: splitCsv(document.getElementById("admin-item-delivery").value),
    donationAvailable: document.getElementById("admin-item-donation").checked,
  };
  try {
    await GreenLoop.api(`/api/admin/items/${adminState.editingItemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    GreenLoop.showToast("Listing updated.");
    fillItemForm(null);
    await bootAdmin();
  } catch (error) {
    GreenLoop.showToast(error.message, true);
  }
});

document.getElementById("admin-item-cancel")?.addEventListener("click", () => {
  fillItemForm(null);
});

document.getElementById("admin-opportunity-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    title: document.getElementById("admin-opportunity-title").value,
    orgName: document.getElementById("admin-opportunity-org").value,
    opportunityType: document.getElementById("admin-opportunity-type").value,
    location: document.getElementById("admin-opportunity-location").value,
    skills: splitCsv(document.getElementById("admin-opportunity-skills").value),
    applyUrl: document.getElementById("admin-opportunity-apply-url").value,
    summary: document.getElementById("admin-opportunity-summary").value,
  };
  try {
    if (adminState.editingOpportunityId) {
      await GreenLoop.api(`/api/admin/opportunities/${adminState.editingOpportunityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      GreenLoop.showToast("Opportunity updated.");
    } else {
      await GreenLoop.api("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      GreenLoop.showToast("Opportunity posted.");
    }
    fillOpportunityForm(null);
    await bootAdmin();
  } catch (error) {
    GreenLoop.showToast(error.message, true);
  }
});

document.getElementById("admin-opportunity-cancel")?.addEventListener("click", () => {
  fillOpportunityForm(null);
});

document.getElementById("admin-user-search")?.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  await bootAdmin();
});

fillAdminForm(null);
bootAdmin().catch((error) => {
fillItemForm(null);
fillOpportunityForm(null);
  if (error.message && error.message.includes("Administrator")) {
    document.querySelector("main").innerHTML = `
      <section class="page" style="text-align:center;padding:80px 20px">
        <h1 style="font-size:2em;margin-bottom:16px">Access denied</h1>
        <p style="color:#888;margin-bottom:24px">You do not have administrator privileges.</p>
        <a href="/dashboard" class="ghost-button">Back to dashboard</a>
      </section>`;
  } else {
    GreenLoop.showToast(error.message, true);
  }
});
