const loadItems = async (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const data = await GreenLoop.api(`/api/items?${search.toString()}`);
  GreenLoop.renderItems(data.items || []);
};

const form = GreenLoop.$("#search-form");

const getInitialParams = () => {
  const params = Object.fromEntries(new URLSearchParams(window.location.search).entries());
  if (params.cat && !params.category) params.category = params.cat;
  return params;
};

const applyParamsToForm = (params) => {
  if (!form) return;
  Object.entries(params).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
  });
};

GreenLoop.bootstrap();
const initialParams = getInitialParams();
applyParamsToForm(initialParams);
loadItems(initialParams);

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const params = Object.fromEntries(new FormData(event.currentTarget).entries());
    const nextSearch = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) nextSearch.set(key, value);
    });
    const nextUrl = nextSearch.toString() ? `${window.location.pathname}?${nextSearch.toString()}` : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);
    await loadItems(params);
  } catch (error) {
    GreenLoop.showToast(error.message, true);
  }
});
