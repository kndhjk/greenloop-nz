const itemParams = new URLSearchParams(window.location.search);
const itemId = itemParams.get("id");

const getItemMedia = (item) => {
  const images = Array.isArray(item.images) ? item.images.filter(Boolean) : [];
  const videos = Array.isArray(item.videos) ? item.videos.filter(Boolean) : [];
  const media = [
    ...images.map((src) => ({ kind: "image", src })),
    ...videos.map((src) => ({ kind: "video", src })),
  ];
  if (!media.length) {
    media.push({ kind: "image", src: GreenLoop.getListingImage(item) });
  }
  return media;
};

const renderHeroMedia = (media) => {
  const hero = document.getElementById("item-hero-image");
  if (!hero) return;
  if (media.kind === "video") {
    hero.innerHTML = `<video class="detail-media-video" src="${media.src}" controls playsinline preload="metadata"></video>`;
    return;
  }
  hero.innerHTML = `<img class="detail-media-image" src="${media.src}" alt="Listing media" />`;
  hero.querySelector(".detail-media-image")?.addEventListener("click", () => {
    GreenLoop.openImageLightbox(media.src, "Listing media");
  });
};

const renderThumbs = (item) => {
  const thumbs = document.getElementById("item-thumbs");
  const media = getItemMedia(item);
  thumbs.innerHTML = media
    .slice(0, 15)
    .map(
      (entry, index) => `
        <button class="thumb-card ${entry.kind === "video" ? "video-thumb" : ""}" type="button" data-kind="${entry.kind}" data-src="${entry.src}" aria-label="View media ${index + 1}">
          ${
            entry.kind === "video"
              ? `<span class="thumb-video-label">VIDEO</span>`
              : `<span class="thumb-fill" style="background-image:url('${entry.src}')"></span>`
          }
        </button>
      `
    )
    .join("");

  thumbs.querySelectorAll(".thumb-card").forEach((button) => {
    button.addEventListener("click", () => {
      renderHeroMedia({
        kind: button.dataset.kind,
        src: button.dataset.src,
      });
    });
  });
};

const bootItem = async () => {
  const currentUser = await GreenLoop.bootstrap();
  if (!itemId) throw new Error("Missing item id.");
  const data = await GreenLoop.api(`/api/items/${itemId}`);
  const { item, related } = data;
  document.getElementById("item-title").textContent = item.title;
  document.getElementById("item-price").textContent = `NZ$${Number(item.price).toFixed(2)}`;
  document.getElementById("item-description").textContent = item.description;
  renderHeroMedia(getItemMedia(item)[0]);
  document.getElementById("pickup-window-label").textContent = item.pickup_windows || "Flexible";
  document.getElementById("delivery-label").textContent = (item.deliveryOptions || []).length ? item.deliveryOptions.join(" · ") : "Optional";
  document.getElementById("condition-label").textContent = item.condition_status;
  document.getElementById("seller-link").href = `/seller?id=${item.seller_id}`;
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
  renderThumbs(item);
  GreenLoop.renderMiniItems(related || []);
};

bootItem().catch((error) => GreenLoop.showToast(error.message, true));
