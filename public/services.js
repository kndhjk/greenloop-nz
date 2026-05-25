let uploadedRoomUrl = "";
const params = new URLSearchParams(window.location.search);

const uploadRoom = async (input) => {
  const file = input.files?.[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: GreenLoop.state.token ? { Authorization: `Bearer ${GreenLoop.state.token}` } : {},
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Upload failed.");
  uploadedRoomUrl = data.url;
  GreenLoop.showToast("Room image uploaded.");
};

const wireJsonForm = (selector, endpoint, success) => {
  GreenLoop.$(selector)?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.dataset.originalLabel = submitButton.textContent;
        submitButton.textContent = "Sending...";
      }
      const data = await GreenLoop.api(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      event.currentTarget.reset();
      success(data);
    } catch (error) {
      GreenLoop.showToast(error.message, true);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.originalLabel || "Send";
      }
    }
  });
};

const applyItemContext = async () => {
  const itemId = Number(params.get("itemId") || 0);
  if (!itemId) return;

  ["reservation-form", "delivery-form", "service-form", "donation-form"].forEach((formId) => {
    const input = document.querySelector(`#${formId} [name="itemId"]`);
    if (input) input.value = String(itemId);
  });

  const card = document.getElementById("service-item-context");
  const title = document.getElementById("service-item-context-title");
  const meta = document.getElementById("service-item-context-meta");
  if (!card || !title || !meta) return;

  try {
    const data = await GreenLoop.api(`/api/items/${itemId}`);
    const item = data.item;
    title.textContent = item.title || `Item #${itemId}`;
    meta.textContent = `${item.location || "Pickup area not set"} · NZ$${Number(item.price || 0).toFixed(2)} · ${item.status || "available"}`;
    card.classList.remove("hidden");
  } catch (_) {}
};

const boot = async () => {
  await GreenLoop.bootstrap({ protectedPage: true });
  await applyItemContext();

  wireJsonForm("#reservation-form", "/api/reservations", () => GreenLoop.showToast("Pickup booked."));
  wireJsonForm("#service-form", "/api/services", () => GreenLoop.showToast("Service request submitted."));
  wireJsonForm("#donation-form", "/api/donations", () => GreenLoop.showToast("Donation submitted."));
  wireJsonForm("#delivery-form", "/api/deliveries", (data) =>
    GreenLoop.showToast(`Delivery requested. Estimate: NZ$${data.feeEstimate}.`)
  );

  GreenLoop.$("#room-upload")?.addEventListener("change", async (event) => {
    try {
      await uploadRoom(event.currentTarget);
    } catch (error) {
      GreenLoop.showToast(error.message, true);
    }
  });

  GreenLoop.$("#room-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      payload.roomImageUrl = uploadedRoomUrl || payload.roomImageUrl;
      const data = await GreenLoop.api("/api/room-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      document.getElementById("room-output").innerHTML = `
        <strong>${data.recommendations.styleSummary}</strong>
        <p>${data.recommendations.layoutNotes.join(" ")}</p>
        <p>${
          data.recommendations.picks.length
            ? data.recommendations.picks.map((item) => `${item.title} (NZ$${Number(item.price).toFixed(2)})`).join(", ")
            : "No matching items yet."
        }</p>
      `;
      GreenLoop.showToast("Recommendations generated.");
    } catch (error) {
      GreenLoop.showToast(error.message, true);
    }
  });
};

boot().catch((error) => GreenLoop.showToast(error.message, true));
