// Popup script для управления порядком часовых поясов

(function() {
  'use strict';

  const timezoneList = document.getElementById('timezoneList');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const status = document.getElementById('status');

  let timezones = [];
  let draggedElement = null;

  // Проверка, что открыта страница Google Calendar
  async function isCalendarPage() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes('calendar.google.com')) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  // Загрузка часовых поясов со страницы календаря
  async function loadTimezones() {
    const isCalendar = await isCalendarPage();
    if (!isCalendar) {
      // Если не календарь, пробуем получить из storage
      return new Promise((resolve) => {
        chrome.storage.sync.get(['timezoneOrder'], (result) => {
          resolve(result.timezoneOrder || []);
        });
      });
    }

    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
          resolve([]);
          return;
        }

        try {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'getTimezones' }, (response) => {
            if (chrome.runtime.lastError) {
              // Если content script не загружен, пробуем получить из storage
              chrome.storage.sync.get(['timezoneOrder'], (result) => {
                resolve(result.timezoneOrder || []);
              });
            } else if (response && response.timezones) {
              resolve(response.timezones);
            } else {
              // Пробуем получить из storage
              chrome.storage.sync.get(['timezoneOrder'], (result) => {
                resolve(result.timezoneOrder || []);
              });
            }
          });
        } catch (error) {
          // В случае ошибки пробуем получить из storage
          chrome.storage.sync.get(['timezoneOrder'], (result) => {
            resolve(result.timezoneOrder || []);
          });
        }
      });
    });
  }

  // Отображение списка часовых поясов
  function renderTimezones(order) {
    timezoneList.innerHTML = '';

    if (order.length === 0) {
      timezoneList.innerHTML = '<div class="empty-state">Откройте Google Calendar для загрузки часовых поясов</div>';
      return;
    }

    order.forEach((tzName, index) => {
      const li = document.createElement('li');
      li.className = 'timezone-item';
      li.draggable = true;
      li.dataset.timezone = tzName;
      
      li.innerHTML = `
        <span class="drag-handle">☰</span>
        <span class="timezone-name">${tzName}</span>
      `;

      // События drag and drop
      li.addEventListener('dragstart', handleDragStart);
      li.addEventListener('dragover', handleDragOver);
      li.addEventListener('drop', handleDrop);
      li.addEventListener('dragend', handleDragEnd);

      timezoneList.appendChild(li);
    });
  }

  // Drag and drop handlers
  function handleDragStart(e) {
    draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
  }

  function handleDragOver(e) {
    if (e.preventDefault) {
      e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    
    const afterElement = getDragAfterElement(timezoneList, e.clientY);
    if (afterElement == null) {
      timezoneList.appendChild(draggedElement);
    } else {
      timezoneList.insertBefore(draggedElement, afterElement);
    }
    
    return false;
  }

  function handleDrop(e) {
    if (e.stopPropagation) {
      e.stopPropagation();
    }
    return false;
  }

  function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedElement = null;
  }

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.timezone-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  // Сохранение порядка
  async function saveOrder() {
    const items = Array.from(timezoneList.querySelectorAll('.timezone-item'));
    const order = items.map(item => item.dataset.timezone);

    if (order.length === 0) {
      showStatus('Нет часовых поясов для сохранения', 'error');
      return;
    }

    chrome.storage.sync.set({ timezoneOrder: order }, () => {
      if (chrome.runtime.lastError) {
        showStatus('Ошибка сохранения: ' + chrome.runtime.lastError.message, 'error');
      } else {
        showStatus('Порядок сохранен! Обновите страницу календаря.', 'success');
        
        // Отправляем сообщение на страницу для немедленного применения
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].url && tabs[0].url.includes('calendar.google.com')) {
            try {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'reorder', order: order }, () => {
                // Игнорируем ошибки при отправке сообщения
                if (chrome.runtime.lastError) {
                  // Content script может быть еще не загружен, это нормально
                }
              });
            } catch (error) {
              // Игнорируем ошибки
            }
          }
        });
      }
    });
  }

  // Сброс порядка
  async function resetOrder() {
    chrome.storage.sync.remove('timezoneOrder', () => {
      showStatus('Порядок сброшен', 'success');
      loadAndRender();
    });
  }

  // Показать статус
  function showStatus(message, type) {
    status.textContent = message;
    status.className = 'status ' + type;
    setTimeout(() => {
      status.className = 'status';
    }, 3000);
  }

  // Загрузка и отображение
  async function loadAndRender() {
    const order = await loadTimezones();
    if (order.length > 0) {
      timezones = order;
      renderTimezones(timezones);
    } else {
      // Если нет сохраненного порядка, пробуем получить текущий со страницы
      const isCalendar = await isCalendarPage();
      if (!isCalendar) {
        renderTimezones([]);
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) {
          renderTimezones([]);
          return;
        }

        try {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
              const elements = document.querySelectorAll('.sS0sZd');
              const tzNames = [];
              elements.forEach(el => {
                const header = el.querySelector('.H4QSac.ouBNcf');
                if (header) {
                  tzNames.push(header.textContent.trim());
                }
              });
              return tzNames;
            }
          }, (results) => {
            if (chrome.runtime.lastError) {
              renderTimezones([]);
              return;
            }
            if (results && results[0] && results[0].result) {
              timezones = results[0].result;
              renderTimezones(timezones);
            } else {
              renderTimezones([]);
            }
          });
        } catch (error) {
          renderTimezones([]);
        }
      });
    }
  }

  // Обработчики событий
  saveBtn.addEventListener('click', saveOrder);
  resetBtn.addEventListener('click', resetOrder);

  // Инициализация
  loadAndRender();
})();

