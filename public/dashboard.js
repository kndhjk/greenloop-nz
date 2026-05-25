const renderList = (targetId, rows, formatter) => {
  const target = document.getElementById(targetId);
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = '<p class="empty">Nothing here yet.</p>';
    return;
  }
  target.innerHTML = rows.map(formatter).join("");
};

const reservationActions = (item, currentUserId) => {
  // Only the item SELLER can take actions on a reservation
  if (Number(item.seller_id) !== Number(currentUserId)) return "";
  if (item.status === "pending") {
    return `
      <div class="cta-row">
        <button class="reservation-action" data-id="${item.id}" data-status="confirmed" type="button">Confirm</button>
        <button class="ghost-button reservation-action" data-id="${item.id}" data-status="cancelled" type="button">Cancel</button>
      </div>
    `;
  }
  if (item.status === "confirmed") {
    return `
      <div class="cta-row">
        <button class="reservation-action" data-id="${item.id}" data-status="completed" type="button">Complete</button>
        <button class="ghost-button reservation-action" data-id="${item.id}" data-status="cancelled" type="button">Cancel</button>
      </div>
    `;
  }
  return "";
};

const boot = async () => {
  const currentUser = await GreenLoop.bootstrap({ protectedPage: true });
  const data = await GreenLoop.api("/api/dashboard");

  const stats = document.getElementById("stats");
  stats.innerHTML = `
    <article class="stat-card"><span>Listings</span><strong>${data.summary.listings}</strong></article>
    <article class="stat-card"><span>Plan</span><strong>${data.summary.premiumPlan}</strong></article>
    <article class="stat-card"><span>Verification</span><strong>${data.user.verificationStatus}</strong></article>
  `;

  const adminPanel = document.getElementById("admin-dashboard-panel");
  const adminLinks = document.getElementById("admin-dashboard-links");
  if (currentUser?.isAdmin && adminPanel && adminLinks) {
    const adminSummary = await GreenLoop.api("/api/admin/summary");
    const totals = adminSummary?.totals || {};
    adminPanel.classList.remove("hidden");
    adminLinks.innerHTML = `
      <a class="admin-quick-card" href="/admin">
        <span class="admin-quick-kicker">Admin</span>
        <strong>Open control center</strong>
        <p>Jump straight into user ops, listings, support, and moderation.</p>
        <span class="admin-quick-cta">Open admin →</span>
      </a>
      <a class="admin-quick-card" href="/admin#admin-verifications">
        <span class="admin-quick-kicker">Queue</span>
        <strong>Verification review</strong>
        <p>${totals.pendingVerifications || 0} users are waiting for approval or rejection.</p>
        <span class="admin-quick-cta">Review queue →</span>
      </a>
      <a class="admin-quick-card" href="/admin#admin-support">
        <span class="admin-quick-kicker">Inbox</span>
        <strong>Support requests</strong>
        <p>${totals.supportRequests || 0} support requests need triage, follow-up, or closure.</p>
        <span class="admin-quick-cta">Open support →</span>
      </a>
      <a class="admin-quick-card" href="/admin#admin-ops">
        <span class="admin-quick-kicker">Operations</span>
        <strong>Pickup and service approvals</strong>
        <p>${totals.opsRequests || 0} operational requests are waiting for status changes.</p>
        <span class="admin-quick-cta">Run ops →</span>
      </a>
      <a class="admin-quick-card" href="/admin#admin-applications">
        <span class="admin-quick-kicker">Hiring</span>
        <strong>Applications and CV review</strong>
        <p>${totals.applications || 0} job applications are in the hiring inbox.</p>
        <span class="admin-quick-cta">Review applicants →</span>
      </a>
    `;
  }

  renderList(
    "reservations",
    data.summary.reservations,
    (item) => `<article class="data-row"><strong>${item.title}</strong><span>${item.status}</span><small>${item.pickup_time}</small>${reservationActions(item, data.user.id)}</article>`
  );

  renderList(
    "notifications",
    data.summary.notifications,
    (item) => `<article class="data-row"><strong>${item.type}</strong><span>${item.status}</span><small>${item.message}</small></article>`
  );

  document.querySelectorAll(".reservation-action").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await GreenLoop.api(`/api/reservations/${button.dataset.id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: button.dataset.status }),
        });
        GreenLoop.showToast(`Reservation ${button.dataset.status}.`);
        await boot();
      } catch (error) {
        GreenLoop.showToast(error.message, true);
      }
    });
  });
};

boot().catch((error) => GreenLoop.showToast(error.message, true));
