// Content script для перестановки часовых поясов в Google Calendar

(function() {
  'use strict';

  let observer = null;
  let isReordering = false;

  // Функция для получения порядка из настроек
  async function getTimezoneOrder() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['timezoneOrder'], (result) => {
        resolve(result.timezoneOrder || null);
      });
    });
  }

  // Функция для получения всех часовых поясов и их колонок времени
  function getAllTimezones() {
    const timezoneHeaders = Array.from(document.querySelectorAll('.sS0sZd'));
    const timeColumns = Array.from(document.querySelectorAll('.R6TFwe'));
    const timezones = [];

    timezoneHeaders.forEach((headerElement, index) => {
      const header = headerElement.querySelector('.H4QSac.ouBNcf');
      if (header) {
        const name = header.textContent.trim();
        // Колонки времени идут в том же порядке, что и заголовки
        const timeColumn = timeColumns[index] || null;
        
        timezones.push({
          name: name,
          headerElement: headerElement,
          timeColumnElement: timeColumn,
          dataText: headerElement.getAttribute('data-text') || name
        });
      }
    });

    return timezones;
  }

  // Функция для перестановки блоков времени внутри .JMX7ge
  function reorderTimeBlocksInJMX(jmxContainer, timezoneOrder) {
    if (!jmxContainer) return;

    const allBlocks = Array.from(jmxContainer.querySelectorAll('.gpQ66b'));
    if (allBlocks.length === 0) return;

    // Находим блоки для каждого часового пояса
    const tzBlocksMap = new Map();
    let currentTzName = null;
    let currentBlocks = [];

    allBlocks.forEach(block => {
      if (block.classList.contains('ouBNcf')) {
        // Это заголовок часового пояса
        if (currentTzName && currentBlocks.length > 0) {
          tzBlocksMap.set(currentTzName, [...currentBlocks]);
        }
        currentTzName = block.textContent.trim();
        currentBlocks = [block];
      } else {
        // Это время
        if (currentTzName) {
          currentBlocks.push(block);
        }
      }
    });
    
    // Сохраняем последний блок
    if (currentTzName && currentBlocks.length > 0) {
      tzBlocksMap.set(currentTzName, [...currentBlocks]);
    }

    // Удаляем все блоки
    allBlocks.forEach(block => block.remove());

    // Вставляем блоки в новом порядке
    const order = [...timezoneOrder];
    order.forEach(tzName => {
      const blocks = tzBlocksMap.get(tzName);
      if (blocks) {
        blocks.forEach(block => {
          jmxContainer.appendChild(block);
        });
      }
    });
  }

  // Функция для перестановки часовых поясов
  async function reorderTimezones(customOrder = null) {
    if (isReordering) return;
    isReordering = true;

    const timezoneOrder = customOrder || await getTimezoneOrder();
    if (!timezoneOrder || timezoneOrder.length === 0) {
      isReordering = false;
      return;
    }

    const timezones = getAllTimezones();
    if (timezones.length < 2) {
      isReordering = false;
      return;
    }

    // Находим контейнеры
    const firstHeader = timezones[0].headerElement;
    const headerContainer = firstHeader.parentElement;
    
    const timeColumns = Array.from(document.querySelectorAll('.R6TFwe'));
    const timeColumnContainer = timeColumns.length > 0 ? timeColumns[0].parentElement : null;
    
    if (!headerContainer) {
      isReordering = false;
      return;
    }

    // Создаем карту часовых поясов
    const timezoneMap = new Map();
    timezones.forEach((tz, index) => {
      timezoneMap.set(tz.name, { ...tz, originalIndex: index });
      timezoneMap.set(tz.dataText, { ...tz, originalIndex: index });
    });

    // Порядок в массиве: первый элемент = слева, последний = справа
    // Используем порядок напрямую (без reverse)
    const order = [...timezoneOrder];
    
    // Переставляем заголовки
    order.forEach((tzName, index) => {
      const tz = timezoneMap.get(tzName);
      if (tz && tz.headerElement && headerContainer.contains(tz.headerElement)) {
        if (index === 0) {
          headerContainer.insertBefore(tz.headerElement, headerContainer.firstChild);
        } else {
          const prevTzName = order[index - 1];
          const prevTz = timezoneMap.get(prevTzName);
          if (prevTz && prevTz.headerElement && headerContainer.contains(prevTz.headerElement)) {
            headerContainer.insertBefore(tz.headerElement, prevTz.headerElement.nextSibling);
          }
        }
      }
    });

    // Переставляем колонки времени (.R6TFwe)
    if (timeColumnContainer && timeColumns.length > 1) {
      order.forEach((tzName, index) => {
        const tz = timezoneMap.get(tzName);
        if (tz && tz.timeColumnElement && timeColumnContainer.contains(tz.timeColumnElement)) {
          if (index === 0) {
            timeColumnContainer.insertBefore(tz.timeColumnElement, timeColumnContainer.firstChild);
          } else {
            const prevTzName = order[index - 1];
            const prevTz = timezoneMap.get(prevTzName);
            if (prevTz && prevTz.timeColumnElement && timeColumnContainer.contains(prevTz.timeColumnElement)) {
              timeColumnContainer.insertBefore(tz.timeColumnElement, prevTz.timeColumnElement.nextSibling);
            }
          }
        }
      });
    }

    // Переставляем блоки времени внутри .JMX7ge во всех колонках
    timeColumns.forEach(column => {
      const jmxContainer = column.querySelector('.JMX7ge');
      if (jmxContainer) {
        reorderTimeBlocksInJMX(jmxContainer, timezoneOrder);
      }
    });

    isReordering = false;
  }

  // Функция для наблюдения за изменениями DOM
  function observeChanges() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      let shouldReorder = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          const addedNodes = Array.from(mutation.addedNodes);
          const hasTimezoneElements = addedNodes.some(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              return node.classList.contains('sS0sZd') || 
                     node.querySelector('.sS0sZd') !== null ||
                     node.classList.contains('R6TFwe') ||
                     node.querySelector('.R6TFwe') !== null;
            }
            return false;
          });
          
          if (hasTimezoneElements) {
            shouldReorder = true;
          }
        }
      });

      if (shouldReorder && !isReordering) {
        setTimeout(() => {
          reorderTimezones();
        }, 200);
      }
    });

    // Наблюдаем за изменениями в документе
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Обработка сообщений от popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getTimezones') {
      const timezones = getAllTimezones().map(tz => tz.name);
      sendResponse({ timezones: timezones });
    } else if (request.action === 'reorder') {
      if (request.order) {
        reorderTimezones(request.order);
        sendResponse({ success: true });
      }
    }
    return true;
  });

  // Инициализация
  function init() {
    // Ждем загрузки страницы
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
          reorderTimezones();
          observeChanges();
        }, 1500);
      });
    } else {
      setTimeout(() => {
        reorderTimezones();
        observeChanges();
      }, 1500);
    }

    // Слушаем изменения настроек
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes.timezoneOrder) {
        setTimeout(() => {
          reorderTimezones();
        }, 200);
      }
    });
  }

  init();
})();
