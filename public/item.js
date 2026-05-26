const itemParams = new URLSearchParams(window.location.search);
const itemId = itemParams.get("id");

const itemState = {
  item: null,
  images: [],
  activeImageIndex: 0,
};

const setHeroImage = (index) => {
  const hero = document.getElementById("item-hero-image");
  const heroImg = document.getElementById("item-hero-image-img");
  const heroCount = document.getElementById("item-image-count");
  if (!hero || !heroImg || !itemState.images.length) return;

  itemState.activeImageIndex = Math.max(0, Math.min(index, itemState.images.length - 1));
  const imageUrl = itemState.images[itemState.activeImageIndex];

  hero.style.backgroundImage = "none";
  heroImg.src = imageUrl;
  heroImg.alt = itemState.item?.title || "Listing image";

  if (heroCount) {
    heroCount.textContent = `${itemState.activeImageIndex + 1}/${itemState.images.length}`;
  }

  document.querySelectorAll(".thumb-card").forEach((button, buttonIndex) => {
    button.classList.toggle("active", buttonIndex === itemState.activeImageIndex);
  });
};

const renderThumbs = () => {
  const thumbs = document.getElementById("item-thumbs");
  if (!thumbs) return;

  thumbs.innerHTML = itemState.images
    .slice(0, 8)
    .map(
      (imageUrl, index) => `
        <button
          class="thumb-card${index === itemState.activeImageIndex ? " active" : ""}"
          type="button"
          data-index="${index}"
          style="background-image:url('${imageUrl}')"
          aria-label="View image ${index + 1}"
        ></button>
      `
    )
    .join("");

  thumbs.querySelectorAll(".thumb-card").forEach((button) => {
    button.addEventListener("click", () => {
      setHeroImage(Number(button.dataset.index || 0));
    });
  });
};

const syncLightbox = () => {
  const image = document.getElementById("item-lightbox-image");
  const caption = document.getElementById("item-lightbox-caption");
  if (!image || !itemState.images.length) return;

  image.src = itemState.images[itemState.activeImageIndex];
  image.alt = itemState.item?.title || "Listing image";
  if (caption) {
    caption.textContent = `${itemState.item?.title || "Listing"} · ${itemState.activeImageIndex + 1}/${itemState.images.length}`;
  }
};

const openLightbox = () => {
  const modal = document.getElementById("item-lightbox");
  if (!modal || !itemState.images.length) return;
  syncLightbox();
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
};

const closeLightbox = () => {
  const modal = document.getElementById("item-lightbox");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
};

const stepLightbox = (direction) => {
  if (!itemState.images.length) return;
  const nextIndex =
    (itemState.activeImageIndex + direction + itemState.images.length) % itemState.images.length;
  setHeroImage(nextIndex);
  syncLightbox();
};

const wireLightbox = () => {
  const hero = document.getElementById("item-hero-image");
  hero?.addEventListener("click", openLightbox);
  hero?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openLightbox();
    }
  });

  document.getElementById("item-lightbox-close")?.addEventListener("click", closeLightbox);
  document.getElementById("item-lightbox-backdrop")?.addEventListener("click", closeLightbox);
  document.getElementById("item-lightbox-prev")?.addEventListener("click", () => stepLightbox(-1));
  document.getElementById("item-lightbox-next")?.addEventListener("click", () => stepLightbox(1));

  document.addEventListener("keydown", (event) => {
    const modal = document.getElementById("item-lightbox");
    if (!modal || modal.classList.contains("hidden")) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") stepLightbox(-1);
    if (event.key === "ArrowRight") stepLightbox(1);
  });
};

const wireShare = (item) => {
  const shareBtn = document.getElementById("share-item-btn");
  if (!shareBtn) return;

  shareBtn.addEventListener("click", async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: item.title, url });
        return;
      } catch (_) {}
    }

    try {
      await navigator.clipboard.writeText(url);
      GreenLoop.showToast("Link copied.");
    } catch (_) {
      GreenLoop.showToast("Could not copy link.", true);
    }
  });
};

const wireDelete = (item) => {
  const currentUser = GreenLoop.state?.user;
  if (!currentUser || (Number(currentUser.id) !== Number(item.seller_id) && !currentUser.isAdmin)) return;

  const actionRow = document.getElementById("item-action-row");
  if (!actionRow || document.getElementById("item-delete-btn")) return;

  const button = document.createElement("button");
  button.className = "ghost-button icon-button";
  button.id = "item-delete-btn";
  button.type = "button";
  button.innerHTML = "<span>×</span>Delete listing";
  actionRow.appendChild(button);

  button.addEventListener("click", async () => {
    if (!confirm("Delete this listing? This cannot be undone.")) return;
    try {
      await GreenLoop.api(`/api/items/${item.id}`, { method: "DELETE" });
      GreenLoop.showToast("Item deleted.");
      window.location.href = "/marketplace";
    } catch (error) {
      GreenLoop.showToast(error.message || "Delete failed.", true);
    }
  });
};

const bootItem = async () => {
  const currentUser = await GreenLoop.bootstrap();
  if (!itemId) throw new Error("Missing item id.");

  const data = await GreenLoop.api(`/api/items/${itemId}`);
  const { item, related } = data;
  itemState.item = item;
  itemState.images = Array.isArray(item.images) && item.images.length ? item.images : [GreenLoop.getListingImage(item)];
  itemState.activeImageIndex = 0;

  document.getElementById("item-title").textContent = item.title;
  document.getElementById("item-price").textContent = `NZ$${Number(item.price).toFixed(2)}`;
  document.getElementById("item-description").textContent = item.description;
  document.getElementById("pickup-window-label").textContent = item.pickup_windows || "Flexible";
  document.getElementById("delivery-label").textContent =
    (item.deliveryOptions || []).length ? item.deliveryOptions.join(" · ") : "Optional";
  document.getElementById("condition-label").textContent = item.condition_status;
  document.getElementById("seller-link").href = `/seller?id=${item.seller_id}`;
  document.getElementById("arrange-pickup-link").href = `/services?itemId=${item.id}`;
  document.getElementById("item-seller").innerHTML = GreenLoop.renderSellerBadge({
    fullName: item.seller_name,
    schoolName: item.seller_school,
    verificationStatus: item.seller_verification,
  });
  document.getElementById("item-meta").innerHTML = `
    <span>${item.category}</span>
    <span>${item.location}</span>
    <span>${item.status}</span>
    <span>${item.donationAvailable ? "Donation ready" : "Resale"}</span>
  `;

  const locationText = document.getElementById("item-location-text");
  const mapLink = document.getElementById("item-map-link");
  if (locationText) {
    locationText.textContent = item.location || "Location shared in chat";
  }
  if (mapLink) {
    if (item.location) {
      mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`;
      mapLink.classList.remove("hidden");
    } else {
      mapLink.href = "#";
      mapLink.classList.add("hidden");
    }
  }

  const chatButton = document.getElementById("chat-seller-button");
  if (chatButton && currentUser && Number(currentUser.id) !== Number(item.seller_id)) {
    chatButton.classList.remove("hidden");
    chatButton.addEventListener("click", async () => {
      try {
        const chat = await GreenLoop.api("/api/chats/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.id }),
        });
        window.location.href = `/chat?conversation=${chat.id}`;
      } catch (error) {
        GreenLoop.showToast(error.message, true);
      }
    });
  }

  renderThumbs();
  setHeroImage(0);
  wireLightbox();
  wireShare(item);
  wireDelete(item);
  GreenLoop.renderMiniItems(related || []);
};

bootItem().catch((error) => GreenLoop.showToast(error.message, true));
