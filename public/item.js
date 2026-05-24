const itemParams = new URLSearchParams(window.location.search);
const itemId = itemParams.get("id");

const renderThumbs = (item) => {
  const thumbs = document.getElementById("item-thumbs");
  const images = Array.isArray(item.images) && item.images.length ? item.images : [GreenLoop.getListingImage(item)];
  thumbs.innerHTML = images
    .slice(0, 4)
    .map(
      (imageUrl) => `
        <button class="thumb-card" type="button" style="background-image:url('${imageUrl}')" aria-label="View image"></button>
      `
    )
    .join("");

  thumbs.querySelectorAll(".thumb-card").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("item-hero-image").style.backgroundImage = button.style.backgroundImage;
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
  document.getElementById("item-hero-image").style.backgroundImage = `url('${GreenLoop.getListingImage(item)}')`;
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
