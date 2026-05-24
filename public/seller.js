const params = new URLSearchParams(window.location.search);
const sellerId = params.get("id");

const renderSellerAvatar = (seller) => {
  const target = document.getElementById("seller-avatar");
  if (!target) return;
  if (seller.avatarUrl) {
    target.outerHTML = `<img id="seller-avatar" class="profile-avatar profile-avatar-lg" src="${seller.avatarUrl}" alt="${seller.fullName}" />`;
    return;
  }
  const initials = String(seller.fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "GL";
  target.textContent = initials;
};

const boot = async () => {
  const currentUser = await GreenLoop.bootstrap();
  if (!sellerId) throw new Error("Missing seller id.");
  const data = await GreenLoop.api(`/api/sellers/${sellerId}`);
  renderSellerAvatar(data.seller);
  document.getElementById("seller-name").textContent = data.seller.fullName;
  document.getElementById("seller-meta").textContent = `${data.seller.schoolName} · ${data.seller.verificationStatus} · joined ${data.seller.joinedLabel}`;
  document.getElementById("seller-stats").innerHTML = `
    <article class="mini-stat">
      <strong>${data.seller.stats.listings}</strong>
      <span>Live items</span>
    </article>
    <article class="mini-stat">
      <strong>${data.seller.stats.reserved}</strong>
      <span>Reserved</span>
    </article>
    <article class="mini-stat">
      <strong>${data.seller.stats.completed}</strong>
      <span>Completed</span>
    </article>
  `;
  const actions = document.getElementById("seller-actions");
  if (actions && currentUser && Number(currentUser.id) === Number(data.seller.id)) {
    actions.insertAdjacentHTML("afterbegin", `<a class="ghost-button icon-button" href="/dashboard"><span>☺</span>My dashboard</a>`);
  }
  GreenLoop.renderItems(data.items || []);
};

boot().catch((error) => GreenLoop.showToast(error.message, true));
