const form = document.querySelector('#request-form');
const requestList = document.querySelector('#request-list');
const requestTemplate = document.querySelector('#request-template');
const stats = document.querySelector('#stats');
const filter = document.querySelector('#status-filter');
const historyList = document.querySelector('#history-list');
const historyFilter = document.querySelector('#history-filter');
const telegramForm = document.querySelector('#telegram-form');
const telegramStatus = document.querySelector('#telegram-status');

const statuses = ['Новая', 'Подтверждена', 'Выполнена'];
const historyStatuses = ['all', ...statuses, 'Удалена', 'Уведомлён'];
const storageKeys = {
  requests: 'concreteflow.requests',
  history: 'concreteflow.history',
  seq: 'concreteflow.seq',
  telegram: 'concreteflow.telegram'
};

const state = {
  requests: [],
  history: [],
  nextId: 1,
  telegram: {
    botToken: '',
    chatId: ''
  }
};

const getField = (id) => document.querySelector(`#${id}`);

const safeReadJson = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const loadState = () => {
  state.requests = safeReadJson(storageKeys.requests, []);
  state.history = safeReadJson(storageKeys.history, []);
  state.nextId = Number(localStorage.getItem(storageKeys.seq)) || 1;
  state.telegram = safeReadJson(storageKeys.telegram, state.telegram);
};

const persistState = () => {
  localStorage.setItem(storageKeys.requests, JSON.stringify(state.requests));
  localStorage.setItem(storageKeys.history, JSON.stringify(state.history));
  localStorage.setItem(storageKeys.seq, String(state.nextId));
  localStorage.setItem(storageKeys.telegram, JSON.stringify(state.telegram));
};

const getFormData = () => ({
  customer: getField('customer').value.trim(),
  phone: getField('phone').value.trim(),
  manager: getField('manager').value,
  dispatcher: getField('dispatcher').value,
  driver: getField('driver').value,
  grade: getField('grade').value,
  volume: Number(getField('volume').value),
  deliveryDate: getField('delivery-date').value,
  deliveryTime: getField('delivery-time').value,
  address: getField('address').value.trim(),
  pump: getField('pump').checked,
  comment: getField('comment').value.trim()
});

const formatDateTime = (date, time) => {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year} ${time}`;
};

const now = () => new Date().toLocaleString('ru-RU');

const updateStats = () => {
  const activeFilter = filter.value;
  const visibleCount = activeFilter === 'all'
    ? state.requests.length
    : state.requests.filter((request) => request.status === activeFilter).length;

  stats.textContent = `Всего заявок: ${state.requests.length} · В списке: ${visibleCount}`;
};

const applyFilter = () => {
  const activeFilter = filter.value;
  const items = requestList.querySelectorAll('.request-item');

  items.forEach((item) => {
    const matches = activeFilter === 'all' || item.dataset.status === activeFilter;
    item.hidden = !matches;
  });

  updateStats();
};

const addHistory = (request, action, status = request.status) => {
  state.history.unshift({
    requestId: request.id,
    customer: request.customer,
    grade: request.grade,
    volume: request.volume,
    manager: request.manager,
    dispatcher: request.dispatcher,
    driver: request.driver,
    status,
    action,
    timestamp: now()
  });
};

const renderHistory = () => {
  const selected = historyFilter.value;
  historyList.innerHTML = '';

  state.history
    .filter((entry) => selected === 'all' || entry.status === selected)
    .forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `<strong>#${entry.requestId}</strong> · ${entry.customer} · ${entry.grade} · ${entry.volume} м³<br>${entry.timestamp} · ${entry.action} · <span class="history-status">${entry.status}</span><br>Менеджер: ${entry.manager} · Диспетчер: ${entry.dispatcher} · Водитель: ${entry.driver}`;
      historyList.append(li);
    });
};

const toTelegramMessage = (request) => [
  'Новая заявка ConcreteFlow',
  `№${request.id}`,
  `Клиент: ${request.customer}`,
  `Телефон: ${request.phone}`,
  `Менеджер: ${request.manager}`,
  `Диспетчер: ${request.dispatcher}`,
  `Водитель: ${request.driver}`,
  `Марка: ${request.grade}`,
  `Объём: ${request.volume} м³`,
  `Отгрузка: ${formatDateTime(request.deliveryDate, request.deliveryTime)}`,
  `Адрес: ${request.address}`,
  `Насос: ${request.pump ? 'Да' : 'Нет'}`,
  `Комментарий: ${request.comment || '—'}`,
  `Статус: ${request.status}`
].join('\n');

const toClientMessage = (request) => `Здравствуйте! Ваша заявка №${request.id} принята. Марка: ${request.grade}, объём: ${request.volume} м³, дата и время отгрузки: ${formatDateTime(request.deliveryDate, request.deliveryTime)}. Ответственный менеджер: ${request.manager}, диспетчер: ${request.dispatcher}, водитель: ${request.driver}.`;

const notifyClient = (request) => {
  const text = encodeURIComponent(toClientMessage(request));
  const digits = request.phone.replace(/\D/g, '');
  const waNumber = digits.startsWith('8') ? `7${digits.slice(1)}` : digits;
  const waLink = `https://wa.me/${waNumber}?text=${text}`;
  const smsLink = `sms:${request.phone}?body=${text}`;

  window.open(waLink, '_blank', 'noopener,noreferrer');
  addHistory(request, 'Клиент уведомлён', 'Уведомлён');
  telegramStatus.textContent = `Открыто уведомление клиенту по заявке #${request.id}. Если WhatsApp недоступен, используйте SMS: ${decodeURIComponent(smsLink)}`;
  telegramStatus.dataset.type = 'success';
  renderHistory();
  persistState();
};

const sendToTelegram = async (request) => {
  const { botToken, chatId } = state.telegram;

  if (!botToken || !chatId) {
    telegramStatus.textContent = 'Telegram не настроен: заполните Token и Chat ID.';
    telegramStatus.dataset.type = 'warning';
    return;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: toTelegramMessage(request) })
    });

    if (!response.ok) {
      throw new Error('Ошибка API Telegram');
    }

    telegramStatus.textContent = `Заявка #${request.id} отправлена в Telegram.`;
    telegramStatus.dataset.type = 'success';
    addHistory(request, 'Отправлена в Telegram');
    renderHistory();
    persistState();
  } catch {
    telegramStatus.textContent = `Не удалось отправить заявку #${request.id} в Telegram.`;
    telegramStatus.dataset.type = 'error';
  }
};

const renderRequest = (request) => {
  const node = requestTemplate.content.cloneNode(true);
  const item = node.querySelector('.request-item');
  const title = node.querySelector('.request-title');
  const badge = node.querySelector('.status-badge');
  const meta = node.querySelector('.request-meta');
  const team = node.querySelector('.request-team');
  const address = node.querySelector('.request-address');
  const comment = node.querySelector('.request-comment');
  const statusBtn = node.querySelector('.status-btn');
  const sendBtn = node.querySelector('.telegram-btn');
  const notifyBtn = node.querySelector('.notify-btn');
  const deleteBtn = node.querySelector('.delete-btn');

  const paint = () => {
    title.textContent = `#${request.id} · ${request.customer}`;
    badge.textContent = request.status;
    badge.dataset.status = request.status;
    item.dataset.status = request.status;
    meta.textContent = `${request.grade} · ${request.volume} м³ · ${formatDateTime(request.deliveryDate, request.deliveryTime)} · ${request.phone}${request.pump ? ' · Нужен насос' : ''}`;
    team.textContent = `Менеджер: ${request.manager} · Диспетчер: ${request.dispatcher} · Водитель: ${request.driver}`;
    address.textContent = `Адрес: ${request.address}`;
    comment.textContent = request.comment ? `Комментарий: ${request.comment}` : '';
  };

  paint();

  statusBtn.addEventListener('click', () => {
    const currentIndex = statuses.indexOf(request.status);
    request.status = statuses[(currentIndex + 1) % statuses.length];
    addHistory(request, 'Изменён статус');
    paint();
    renderHistory();
    applyFilter();
    persistState();
  });

  sendBtn.addEventListener('click', () => {
    sendToTelegram(request);
  });

  notifyBtn.addEventListener('click', () => {
    notifyClient(request);
  });

  deleteBtn.addEventListener('click', () => {
    const index = state.requests.findIndex((entry) => entry.id === request.id);

    if (index !== -1) {
      state.requests.splice(index, 1);
      addHistory(request, 'Заявка удалена', 'Удалена');
      item.remove();
      renderHistory();
      updateStats();
      persistState();
    }
  });

  requestList.prepend(node);
  applyFilter();
};

const renderAllRequests = () => {
  requestList.innerHTML = '';
  [...state.requests].reverse().forEach((request) => renderRequest(request));
  applyFilter();
};

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const data = getFormData();

  if (!data.customer || !data.phone || !data.manager || !data.dispatcher || !data.driver || !data.grade || !data.address || !data.deliveryDate || !data.deliveryTime || !data.volume) {
    return;
  }

  const request = {
    id: state.nextId,
    ...data,
    status: 'Новая'
  };

  state.nextId += 1;
  state.requests.push(request);
  addHistory(request, 'Заявка создана');
  renderRequest(request);
  renderHistory();
  persistState();
  form.reset();
});

telegramForm.addEventListener('submit', (event) => {
  event.preventDefault();
  state.telegram.botToken = getField('bot-token').value.trim();
  state.telegram.chatId = getField('chat-id').value.trim();
  persistState();
  telegramStatus.textContent = 'Настройки Telegram сохранены локально в браузере.';
  telegramStatus.dataset.type = 'success';
});

filter.addEventListener('change', applyFilter);
historyFilter.addEventListener('change', renderHistory);

const init = () => {
  loadState();
  getField('bot-token').value = state.telegram.botToken;
  getField('chat-id').value = state.telegram.chatId;

  historyStatuses.forEach((status) => {
    if ([...historyFilter.options].some((option) => option.value === status)) {
      return;
    }

    const option = document.createElement('option');
    option.value = status;
    option.textContent = status === 'all' ? 'Все статусы' : status;
    historyFilter.append(option);
  });

  renderAllRequests();
  renderHistory();
  updateStats();
};

init();
