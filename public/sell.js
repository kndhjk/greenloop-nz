let uploadedItemUrl = "";

const uploadFile = async (input) => {
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
  uploadedItemUrl = data.url;
  GreenLoop.showToast("Image uploaded.");
};

const boot = async () => {
  await GreenLoop.bootstrap({ protectedPage: true });
  GreenLoop.$("#item-upload")?.addEventListener("change", async (event) => {
    try {
      await uploadFile(event.currentTarget);
    } catch (error) {
      GreenLoop.showToast(error.message, true);
    }
  });

  GreenLoop.$("#publish-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    try {
      const form = new FormData(formElement);
      const payload = Object.fromEntries(form.entries());
      payload.images = [uploadedItemUrl || payload.imageUrl].filter(Boolean);
      payload.deliveryOptions = String(payload.deliveryOptions || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      payload.donationAvailable = form.get("donationAvailable") === "on";
      const result = await GreenLoop.api("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (formElement && typeof formElement.reset === "function") {
        formElement.reset();
      }
      uploadedItemUrl = "";
      GreenLoop.showToast("Listing published.");
      setTimeout(() => {
        window.location.href = `/item?id=${result.id}`;
      }, 500);
    } catch (error) {
      GreenLoop.showToast(error.message, true);
    }
  });
};

boot().catch((error) => GreenLoop.showToast(error.message, true));
