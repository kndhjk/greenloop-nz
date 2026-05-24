const renderList = (targetId, rows, formatter) => {
  const target = document.getElementById(targetId);
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = '<p class="empty">Nothing here yet.</p>';
    return;
  }
  target.innerHTML = rows.map(formatter).join("");
};

const reservationActions = (item) => {
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
  await GreenLoop.bootstrap({ protectedPage: true });
  const data = await GreenLoop.api("/api/dashboard");

  const stats = document.getElementById("stats");
  stats.innerHTML = `
    <article class="stat-card"><span>Listings</span><strong>${data.summary.listings}</strong></article>
    <article class="stat-card"><span>Plan</span><strong>${data.summary.premiumPlan}</strong></article>
    <article class="stat-card"><span>Verification</span><strong>${data.user.verificationStatus}</strong></article>
  `;

  renderList(
    "reservations",
    data.summary.reservations,
    (item) => `<article class="data-row"><strong>${item.title}</strong><span>${item.status}</span><small>${item.pickup_time}</small>${reservationActions(item)}</article>`
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
